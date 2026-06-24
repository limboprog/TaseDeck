use crate::agents::mcp_json::remove_tasedeck_managed_from_project_mcp_json;
use crate::agents::project_discovery::normalize_folder_path;
use crate::agents::project_proxy_export::{
    restore_project_agent_mcp_from_default_source, sync_project_tasedeck_mcp_merged,
    ProxyExportScope,
};
use crate::agents::registry::provider_for;
use crate::db::Database;
use crate::services::{McpToolsStore, OAuthStore};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const PROJECT_DISK_JOB_FAILED_EVENT: &str = "project-disk-job-failed";
pub const PROJECT_DISK_JOB_COMPLETED_EVENT: &str = "project-disk-job-completed";
const JOB_DEBOUNCE_MS: u64 = 75;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiskJobCompletedPayload {
    pub project_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiskJobFailedPayload {
    pub project_id: i64,
    pub agent_name: String,
    pub message: String,
}

#[derive(Debug, Clone)]
pub enum ProjectDiskJob {
    ExportMerged {
        project_id: i64,
        agent_id: Option<i64>,
        extra_kinds: Vec<String>,
        scope: ProxyExportScope,
    },
    RestoreAgent {
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
    },
    RestoreThenExport {
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
        extra_kinds: Vec<String>,
        scope: ProxyExportScope,
    },
    StripTasedeckEntries {
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
    },
}

impl ProjectDiskJob {
    fn project_id(&self) -> i64 {
        match self {
            Self::ExportMerged { project_id, .. }
            | Self::RestoreAgent { project_id, .. }
            | Self::RestoreThenExport { project_id, .. }
            | Self::StripTasedeckEntries { project_id, .. } => *project_id,
        }
    }
}

pub struct ProjectDiskQueue {
    db: Arc<Database>,
    oauth: Arc<OAuthStore>,
    tools: Arc<McpToolsStore>,
    app: Arc<Mutex<Option<AppHandle>>>,
    dirty_projects: Arc<Mutex<HashSet<i64>>>,
    project_senders: Mutex<HashMap<i64, mpsc::Sender<ProjectDiskJob>>>,
}

impl ProjectDiskQueue {
    pub fn new(
        db: Arc<Database>,
        oauth: Arc<OAuthStore>,
        tools: Arc<McpToolsStore>,
    ) -> Self {
        Self {
            db,
            oauth,
            tools,
            app: Arc::new(Mutex::new(None)),
            dirty_projects: Arc::new(Mutex::new(HashSet::new())),
            project_senders: Mutex::new(HashMap::new()),
        }
    }

    pub fn attach_app(&self, app: AppHandle) {
        if let Ok(mut guard) = self.app.lock() {
            *guard = Some(app);
        }
    }

    pub fn is_project_dirty(&self, project_id: i64) -> bool {
        if self
            .dirty_projects
            .lock()
            .map(|guard| guard.contains(&project_id))
            .unwrap_or(false)
        {
            return true;
        }
        self.db
            .is_project_disk_sync_dirty(project_id)
            .unwrap_or(false)
    }

    pub fn hydrate_dirty_from_db(&self) {
        let Ok(ids) = self.db.list_disk_sync_dirty_project_ids() else {
            return;
        };
        if let Ok(mut dirty) = self.dirty_projects.lock() {
            dirty.extend(ids);
        }
    }

    fn set_project_dirty(&self, project_id: i64, dirty: bool) {
        if dirty {
            if let Ok(mut guard) = self.dirty_projects.lock() {
                guard.insert(project_id);
            }
        } else if let Ok(mut guard) = self.dirty_projects.lock() {
            guard.remove(&project_id);
        }
        if let Err(error) = self.db.set_project_disk_sync_dirty(project_id, dirty) {
            eprintln!(
                "[tasedeck] failed to persist disk_sync_dirty={dirty} for project {project_id}: {error}"
            );
        }
    }

    pub fn retry_dirty_project(&self, project_id: i64) {
        if !self.is_project_dirty(project_id) {
            return;
        }
        self.enqueue_export_full(project_id, None, Vec::new());
    }

    pub fn retry_all_dirty_projects(&self) {
        self.hydrate_dirty_from_db();
        let ids: Vec<i64> = self
            .dirty_projects
            .lock()
            .map(|guard| guard.iter().copied().collect())
            .unwrap_or_default();
        for project_id in ids {
            self.enqueue_export_full(project_id, None, Vec::new());
        }
    }

    pub fn release_project(&self, project_id: i64) {
        if let Ok(mut map) = self.project_senders.lock() {
            map.remove(&project_id);
        }
        self.set_project_dirty(project_id, false);
    }

    pub fn enqueue(&self, job: ProjectDiskJob) {
        let project_id = job.project_id();
        let sender = self.ensure_sender(project_id);
        if sender.send(job).is_err() {
            eprintln!("[tasedeck] project disk queue sender dropped for project {project_id}");
        }
    }

    pub fn enqueue_export_full(
        &self,
        project_id: i64,
        agent_id: Option<i64>,
        extra_kinds: Vec<String>,
    ) {
        self.enqueue(ProjectDiskJob::ExportMerged {
            project_id,
            agent_id,
            extra_kinds,
            scope: ProxyExportScope::Full,
        });
    }

    pub fn enqueue_export_sidecars(&self, project_id: i64, agent_id: Option<i64>) {
        self.enqueue(ProjectDiskJob::ExportMerged {
            project_id,
            agent_id,
            extra_kinds: Vec::new(),
            scope: ProxyExportScope::SidecarsOnly,
        });
    }

    pub fn enqueue_restore_agent(
        &self,
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
    ) {
        self.enqueue(ProjectDiskJob::RestoreAgent {
            project_id,
            agent_id,
            agent_kind,
        });
    }

    pub fn enqueue_restore_then_export_full(
        &self,
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
        extra_kinds: Vec<String>,
    ) {
        self.enqueue(ProjectDiskJob::RestoreThenExport {
            project_id,
            agent_id,
            agent_kind,
            extra_kinds,
            scope: ProxyExportScope::Full,
        });
    }

    pub fn enqueue_strip_project_tasedeck(
        &self,
        project_id: i64,
        agent_id: Option<i64>,
        agent_kind: String,
    ) {
        self.enqueue(ProjectDiskJob::StripTasedeckEntries {
            project_id,
            agent_id,
            agent_kind,
        });
    }

    pub fn enqueue_for_all_projects_using_server(&self, server_id: i64) {
        let Ok(pairs) = self.db.list_project_agent_assignments_for_server(server_id) else {
            return;
        };
        let mut project_ids = HashSet::new();
        for (project_id, agent_id) in pairs {
            if project_ids.insert(project_id) {
                self.enqueue_export_sidecars(project_id, Some(agent_id));
            }
        }
    }

    fn ensure_sender(&self, project_id: i64) -> mpsc::Sender<ProjectDiskJob> {
        let mut map = self
            .project_senders
            .lock()
            .expect("project disk queue mutex poisoned");
        if let Some(sender) = map.get(&project_id) {
            return sender.clone();
        }

        let (sender, receiver) = mpsc::channel();
        let worker = ProjectDiskWorker {
            db: Arc::clone(&self.db),
            oauth: Arc::clone(&self.oauth),
            tools: Arc::clone(&self.tools),
            app: Arc::clone(&self.app),
            dirty_projects: Arc::clone(&self.dirty_projects),
        };
        std::thread::Builder::new()
            .name(format!("project-disk-p{project_id}"))
            .spawn(move || worker.run(project_id, receiver))
            .ok();
        map.insert(project_id, sender.clone());
        sender
    }
}

struct ProjectDiskWorker {
    db: Arc<Database>,
    oauth: Arc<OAuthStore>,
    tools: Arc<McpToolsStore>,
    app: Arc<Mutex<Option<AppHandle>>>,
    dirty_projects: Arc<Mutex<HashSet<i64>>>,
}

impl ProjectDiskWorker {
    fn persist_project_dirty(&self, project_id: i64, dirty: bool) {
        if dirty {
            if let Ok(mut guard) = self.dirty_projects.lock() {
                guard.insert(project_id);
            }
        } else if let Ok(mut guard) = self.dirty_projects.lock() {
            guard.remove(&project_id);
        }
        if let Err(error) = self.db.set_project_disk_sync_dirty(project_id, dirty) {
            eprintln!(
                "[tasedeck] failed to persist disk_sync_dirty={dirty} for project {project_id}: {error}"
            );
        }
    }

    fn is_project_dirty(&self, project_id: i64) -> bool {
        if self
            .dirty_projects
            .lock()
            .map(|guard| guard.contains(&project_id))
            .unwrap_or(false)
        {
            return true;
        }
        self.db
            .is_project_disk_sync_dirty(project_id)
            .unwrap_or(false)
    }

    fn run(self, project_id: i64, receiver: mpsc::Receiver<ProjectDiskJob>) {
        while let Ok(first) = receiver.recv() {
            let mut batch = vec![first];
            while let Ok(next) = receiver.recv_timeout(Duration::from_millis(JOB_DEBOUNCE_MS)) {
                if let Some(merged) = coalesce_jobs(batch.last().expect("batch not empty"), &next)
                {
                    let last = batch.len() - 1;
                    batch[last] = merged;
                } else {
                    batch.push(next);
                }
            }

            for job in batch {
                let job_project_id = job.project_id();
                let was_dirty = self.is_project_dirty(job_project_id);
                match self.execute(job) {
                    Ok(wrote) => {
                        self.persist_project_dirty(job_project_id, false);
                        if wrote || was_dirty {
                            self.emit_completed(job_project_id);
                        }
                    }
                    Err(error) => {
                        log_export_error(
                            &format!("project {project_id}"),
                            error.message.clone(),
                        );
                        self.persist_project_dirty(job_project_id, true);
                        self.emit_failure(error);
                    }
                }
            }
        }
    }

    fn execute(&self, job: ProjectDiskJob) -> Result<bool, DiskJobFailure> {
        match job {
            ProjectDiskJob::ExportMerged {
                project_id,
                agent_id,
                extra_kinds,
                scope,
            } => {
                if self
                    .db
                    .list_project_agents(project_id)
                    .map_err(|error| disk_failure(project_id, agent_id, &self.db, error.to_string()))?
                    .is_empty()
                    && scope == ProxyExportScope::Full
                {
                    return Ok(false);
                }
                let written = sync_project_tasedeck_mcp_merged(
                    self.db.as_ref(),
                    Some(self.oauth.as_ref()),
                    Some(self.tools.as_ref()),
                    project_id,
                    &extra_kinds,
                    scope,
                )
                .map_err(|error| disk_failure(project_id, agent_id, &self.db, error))?;
                Ok(!written.is_empty())
            }
            ProjectDiskJob::RestoreAgent {
                project_id,
                agent_id,
                agent_kind,
            } => {
                let written = restore_project_agent_mcp_from_default_source(
                    self.db.as_ref(),
                    project_id,
                    &agent_kind,
                )
                .map_err(|error| disk_failure(project_id, agent_id, &self.db, error))?;
                Ok(!written.is_empty())
            }
            ProjectDiskJob::RestoreThenExport {
                project_id,
                agent_id,
                agent_kind,
                extra_kinds,
                scope,
            } => {
                let restored = restore_project_agent_mcp_from_default_source(
                    self.db.as_ref(),
                    project_id,
                    &agent_kind,
                )
                .map_err(|error| disk_failure(project_id, agent_id, &self.db, error))?;
                if self
                    .db
                    .list_project_agents(project_id)
                    .map_err(|error| disk_failure(project_id, agent_id, &self.db, error.to_string()))?
                    .is_empty()
                    && scope == ProxyExportScope::Full
                {
                    return Ok(!restored.is_empty());
                }
                let exported = sync_project_tasedeck_mcp_merged(
                    self.db.as_ref(),
                    Some(self.oauth.as_ref()),
                    Some(self.tools.as_ref()),
                    project_id,
                    &extra_kinds,
                    scope,
                )
                .map_err(|error| disk_failure(project_id, agent_id, &self.db, error))?;
                Ok(!restored.is_empty() || !exported.is_empty())
            }
            ProjectDiskJob::StripTasedeckEntries {
                project_id,
                agent_id,
                agent_kind,
            } => {
                let project = self
                    .db
                    .get_project_record(project_id)
                    .map_err(|error| disk_failure(project_id, agent_id, &self.db, error.to_string()))?
                    .ok_or_else(|| {
                        disk_failure(
                            project_id,
                            agent_id,
                            &self.db,
                            format!("project {project_id} not found"),
                        )
                    })?;
                let project_root = normalize_folder_path(project.folder_path.trim())
                    .ok_or_else(|| {
                        disk_failure(
                            project_id,
                            agent_id,
                            &self.db,
                            "invalid project folder path".to_string(),
                        )
                    })?;
                remove_tasedeck_managed_from_project_mcp_json(&project_root, &agent_kind)
                    .map_err(|error| disk_failure(project_id, agent_id, &self.db, error))
                    .map(|path| path.is_some())
            }
        }
    }

    fn emit_completed(&self, project_id: i64) {
        let Ok(guard) = self.app.lock() else {
            return;
        };
        let Some(app) = guard.as_ref() else {
            return;
        };
        let payload = ProjectDiskJobCompletedPayload { project_id };
        let _ = app.emit(PROJECT_DISK_JOB_COMPLETED_EVENT, payload);
    }

    fn emit_failure(&self, failure: DiskJobFailure) {
        let Ok(guard) = self.app.lock() else {
            return;
        };
        let Some(app) = guard.as_ref() else {
            return;
        };
        let payload = ProjectDiskJobFailedPayload {
            project_id: failure.project_id,
            agent_name: failure.agent_name,
            message: failure.message,
        };
        let _ = app.emit(PROJECT_DISK_JOB_FAILED_EVENT, payload);
    }
}

fn coalesce_jobs(previous: &ProjectDiskJob, next: &ProjectDiskJob) -> Option<ProjectDiskJob> {
    match (previous, next) {
        (
            ProjectDiskJob::ExportMerged {
                project_id: prev_id,
                agent_id: prev_agent,
                extra_kinds: prev_kinds,
                scope: prev_scope,
            },
            ProjectDiskJob::ExportMerged {
                project_id: next_id,
                agent_id: next_agent,
                extra_kinds: next_kinds,
                scope: next_scope,
            },
        ) if prev_id == next_id => {
            let scope = if *prev_scope == ProxyExportScope::Full || *next_scope == ProxyExportScope::Full
            {
                ProxyExportScope::Full
            } else {
                *prev_scope
            };
            Some(ProjectDiskJob::ExportMerged {
                project_id: *next_id,
                agent_id: next_agent.or(*prev_agent),
                extra_kinds: merge_extra_kinds(prev_kinds, next_kinds),
                scope,
            })
        }
        (
            ProjectDiskJob::RestoreThenExport {
                project_id: prev_id,
                agent_id: prev_agent,
                agent_kind: prev_kind,
                extra_kinds: prev_kinds,
                scope: prev_scope,
            },
            ProjectDiskJob::ExportMerged {
                project_id: next_id,
                agent_id: next_agent,
                extra_kinds: next_kinds,
                scope: next_scope,
                ..
            },
        ) if prev_id == next_id && *next_scope == ProxyExportScope::Full => {
            Some(ProjectDiskJob::RestoreThenExport {
                project_id: *next_id,
                agent_id: next_agent.or(*prev_agent),
                agent_kind: prev_kind.clone(),
                extra_kinds: merge_extra_kinds(prev_kinds, next_kinds),
                scope: ProxyExportScope::Full,
            })
        }
        (
            ProjectDiskJob::RestoreThenExport {
                project_id: prev_id,
                agent_id: prev_agent,
                agent_kind: _prev_kind,
                extra_kinds: prev_kinds,
                scope: prev_scope,
            },
            ProjectDiskJob::RestoreThenExport {
                project_id: next_id,
                agent_id: next_agent,
                agent_kind: next_kind,
                extra_kinds: next_kinds,
                scope: next_scope,
            },
        ) if prev_id == next_id && prev_scope == next_scope => {
            Some(ProjectDiskJob::RestoreThenExport {
                project_id: *next_id,
                agent_id: next_agent.or(*prev_agent),
                agent_kind: next_kind.clone(),
                extra_kinds: merge_extra_kinds(prev_kinds, next_kinds),
                scope: *next_scope,
            })
        }
        _ => None,
    }
}

fn merge_extra_kinds(prev: &[String], next: &[String]) -> Vec<String> {
    let mut kinds = prev.to_vec();
    kinds.extend(next.iter().cloned());
    kinds.sort_unstable();
    kinds.dedup();
    kinds
}

struct DiskJobFailure {
    project_id: i64,
    agent_name: String,
    message: String,
}

fn disk_failure(
    project_id: i64,
    agent_id: Option<i64>,
    db: &Database,
    message: String,
) -> DiskJobFailure {
    DiskJobFailure {
        project_id,
        agent_name: resolve_agent_display_name(db, agent_id),
        message,
    }
}

fn resolve_agent_display_name(db: &Database, agent_id: Option<i64>) -> String {
    let Some(agent_id) = agent_id else {
        return "Agent".to_string();
    };
    let Ok(Some(agent)) = db.get_agent_record(agent_id) else {
        return "Agent".to_string();
    };
    let trimmed = agent.name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    provider_for(&agent.kind)
        .map(|provider| provider.label().to_string())
        .unwrap_or_else(|_| agent.kind.clone())
}

fn log_export_error(context: &str, error: String) {
    eprintln!("[tasedeck] project disk job ({context}): {error}");
}

/// Enqueue per-project disk jobs for all projects linked to agents in a topology graph.
pub fn enqueue_topology_project_disk_jobs(
    db: &Database,
    queue: &ProjectDiskQueue,
    client_id: &str,
    name: &str,
    export_proxy: bool,
) -> Result<(), String> {
    let graph_state = db
        .get_graph_state_by_client_id(client_id, name)
        .map_err(|error| error.to_string())?;

    let mut agent_ids = graph_state
        .links
        .iter()
        .filter(|link| link.edge_enabled)
        .map(|link| link.agent_id)
        .collect::<Vec<_>>();
    agent_ids.sort_unstable();
    agent_ids.dedup();

    let mut seen_projects = HashSet::new();
    for agent_id in agent_ids {
        let agent = db
            .get_agent_record(agent_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("agent {agent_id} not found"))?;
        let projects = db
            .list_projects_for_agent(agent_id)
            .map_err(|error| error.to_string())?;
        for project in projects {
            if !seen_projects.insert(project.id) {
                continue;
            }
            if export_proxy {
                queue.enqueue_export_full(project.id, Some(agent_id), Vec::new());
            } else {
                queue.enqueue_strip_project_tasedeck(
                    project.id,
                    Some(agent_id),
                    agent.kind.clone(),
                );
            }
        }
    }

    Ok(())
}
