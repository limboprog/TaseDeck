use crate::agents::project_discovery::{
    discover_projects_for_agent_kind, folder_base_name, normalize_folder_path,
};
use crate::agents::project_mcp::project_has_mcp_config;
use crate::agents::project_mcp_import::{
    collect_native_project_mcp_servers, import_native_mcp_servers_for_project,
};
use crate::agents::registry::list_catalog;
use crate::agents::resolve::resolve_auto_config_path;
use crate::db::{
    AgentRecord, Database, WorkspaceBootstrapRequest, WorkspaceBootstrapResult,
};
use crate::error::AppResult;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

struct ProjectMcpScan {
    project_id: i64,
    project_name: String,
    folder_path: String,
    servers: BTreeMap<String, Value>,
}

pub fn workspace_bootstrap_status(db: &Database) -> AppResult<bool> {
    Ok(db.is_workspace_bootstrap_completed()?)
}

pub fn run_workspace_bootstrap(
    db: &Database,
    request: WorkspaceBootstrapRequest,
) -> AppResult<WorkspaceBootstrapResult> {
    if db.is_workspace_bootstrap_completed()? && !request.force {
        return Ok(WorkspaceBootstrapResult {
            completed: true,
            skipped: true,
            agents_discovered: 0,
            agents_created: 0,
            projects_discovered: 0,
            projects_upserted: 0,
            links_created: 0,
            presets_created: 0,
            assignments_created: 0,
            agent_ids: Vec::new(),
        });
    }

    let settings = crate::core::app_settings::current_app_settings().unwrap_or_default();

    let mut agents_discovered = 0usize;
    let mut agents_created = 0usize;
    let mut projects_discovered = 0usize;
    let mut projects_upserted = 0usize;
    let mut links_created = 0usize;
    let mut presets_created = 0usize;
    let mut assignments_created = 0usize;

    let mut discovered_agents: Vec<AgentRecord> = Vec::new();

    if settings.enable_agent_sync {
        for entry in list_catalog() {
            let Some(config_dir_path) = resolve_auto_config_path(&entry.kind)? else {
                continue;
            };
            agents_discovered += 1;

            let agent = if let Some(existing) =
                db.find_agent_by_kind_and_config_path(&entry.kind, &config_dir_path)?
            {
                existing
            } else if let Some(existing) = db.find_agent_by_kind(&entry.kind)? {
                existing
            } else {
                let created = db.insert_agent_record(&AgentRecord {
                    id: 0,
                    name: entry.label.clone(),
                    kind: entry.kind.clone(),
                    config_dir_path,
                    created_at: String::new(),
                    updated_at: String::new(),
                })?;
                agents_created += 1;
                created
            };

            discovered_agents.push(agent);
        }
    } else if let Ok(existing) = db.list_agent_records() {
        discovered_agents = existing;
        agents_discovered = discovered_agents.len();
    }

    let agent_ids: Vec<i64> = discovered_agents.iter().map(|agent| agent.id).collect();

    let mut unique_project_paths: BTreeSet<String> = BTreeSet::new();
    let mut legacy_paths: BTreeSet<String> = BTreeSet::new();

    for legacy in &request.legacy_projects {
        if let Some(path) = normalize_folder_path(&legacy.folder_path) {
            let normalized = path.display().to_string();
            legacy_paths.insert(normalized.clone());
            unique_project_paths.insert(normalized);
        }
    }

    let mut agent_project_paths: HashMap<i64, BTreeSet<String>> = HashMap::new();
    if settings.enable_file_scan {
        for agent in &discovered_agents {
            let paths = discover_projects_for_agent_kind(&agent.kind)
                .into_iter()
                .filter(|path| project_has_mcp_config(path, &agent.kind))
                .map(|path| path.display().to_string())
                .collect::<BTreeSet<_>>();
            for path in &paths {
                unique_project_paths.insert(path.clone());
            }
            agent_project_paths.insert(agent.id, paths);
        }
    }

    projects_discovered = unique_project_paths.len();

    let mut project_records: HashMap<String, (i64, String)> = HashMap::new();

    for folder_path in &unique_project_paths {
        let legacy = request.legacy_projects.iter().find(|project| {
            normalize_folder_path(&project.folder_path)
                .map(|path| path.display().to_string() == *folder_path)
                .unwrap_or(false)
        });

        let default_name = normalize_folder_path(folder_path)
            .map(|path| folder_base_name(path.as_path()))
            .unwrap_or_else(|| folder_path.clone());

        let project = db.upsert_project_record(
            folder_path,
            legacy.map(|value| value.name.as_str()).or(Some(default_name.as_str())),
            legacy.and_then(|value| value.icon_color.as_deref()),
        )?;
        projects_upserted += 1;
        project_records.insert(folder_path.clone(), (project.id, project.name));

        for agent in &discovered_agents {
            let linked = agent_project_paths
                .get(&agent.id)
                .is_some_and(|paths| paths.contains(folder_path));
            if linked && db.link_agent_project(agent.id, project.id)? {
                links_created += 1;
            }
        }
    }

    let mut scans: Vec<ProjectMcpScan> = Vec::new();
    let mut imported_project_ids: Vec<i64> = Vec::new();

    if settings.enable_tool_index {
        for (folder_path, (project_id, project_name)) in &project_records {
            if legacy_paths.contains(folder_path) {
                continue;
            }

            let project_root = match normalize_folder_path(folder_path) {
                Some(path) => path,
                None => continue,
            };

            let linked_kinds: Vec<String> = discovered_agents
                .iter()
                .filter(|agent| {
                    agent_project_paths
                        .get(&agent.id)
                        .is_some_and(|paths| paths.contains(folder_path))
                })
                .map(|agent| agent.kind.clone())
                .collect();

            let merged_servers =
                collect_native_project_mcp_servers(&project_root, &linked_kinds);

            if merged_servers.is_empty() {
                continue;
            }

            scans.push(ProjectMcpScan {
                project_id: *project_id,
                project_name: project_name.clone(),
                folder_path: folder_path.clone(),
                servers: merged_servers,
            });
        }

        for scan in &scans {
            let fingerprint = format!("project-{}-import", scan.project_id);
            let existed = db.find_preset_by_fingerprint(&fingerprint)?.is_some();
            if import_native_mcp_servers_for_project(db, scan.project_id)
                .map_err(|error| crate::error::AppError::Message(error))?
            {
                imported_project_ids.push(scan.project_id);
                if !existed {
                    presets_created += 1;
                    assignments_created += 1;
                }
            }
        }
    }

    for legacy in &request.legacy_presets {
        let preset = db.insert_preset_record(legacy.name.trim())?;
        presets_created += 1;
        if !legacy.mcp_server_ids.is_empty() {
            db.update_preset_record(preset.id, None, Some(&legacy.mcp_server_ids))?;
        }
    }

    db.mark_workspace_bootstrap_completed()?;

    Ok(WorkspaceBootstrapResult {
        completed: true,
        skipped: false,
        agents_discovered,
        agents_created,
        projects_discovered,
        projects_upserted,
        links_created,
        presets_created,
        assignments_created,
        agent_ids,
    })
}

pub fn run_workspace_bootstrap_shared(
    db: Arc<Database>,
    request: WorkspaceBootstrapRequest,
) -> AppResult<WorkspaceBootstrapResult> {
    run_workspace_bootstrap(db.as_ref(), request)
}
