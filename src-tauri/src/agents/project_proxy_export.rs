use crate::agents::mcp_json::{
    mcp_entry_key_for_server, remove_tasedeck_managed_from_project_mcp_json,
    upsert_proxy_entries_in_project_mcp_json,
};
use crate::agents::project_discovery::normalize_folder_path;
use crate::agents::project_mcp::extract_tasedeck_proxy_entry_keys;
use crate::agents::proxy_sidecar::{self, sidecar_path};
use crate::db::{AgentRecord, Database, ProjectAssignmentDetail};
use crate::services::{mcp_server_for_runtime, prepare_proxy_entry, McpProxyServerEntry, McpToolsStore, OAuthStore};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProxyExportScope {
    /// Rebuild `.tasedeck` sidecars only; leave project `mcp.json` untouched.
    SidecarsOnly,
    /// Rebuild sidecars and sync TaseDeck-managed proxy entries in `mcp.json`.
    Full,
}

pub fn build_proxy_entries_for_assignment(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    project_id: i64,
    agent_kind: &str,
    assignment: &ProjectAssignmentDetail,
    base_dir: &Path,
    overrides_root: Option<&Value>,
    caller: Option<&str>,
) -> Result<Vec<McpProxyServerEntry>, String> {
    let override_map = overrides_root.and_then(Value::as_object);
    let mut entries = Vec::new();
    let mut warnings = Vec::new();

    for preset_server in &assignment.servers {
        let server_key = preset_server.server_key.trim();
        let entry_key = mcp_entry_key_for_server(&preset_server.server);

        if entry_key.is_empty() {
            continue;
        }

        let patch = override_map
            .and_then(|map| map.get(&entry_key))
            .or_else(|| override_map.and_then(|map| map.get(server_key)))
            .or_else(|| {
                let legacy = preset_server.server.name.trim();
                override_map.and_then(|map| map.get(legacy))
            })
            .filter(|value| value.as_object().is_some_and(|obj| !obj.is_empty()));

        let runtime = match mcp_server_for_runtime(&preset_server.server) {
            Ok(runtime) => runtime,
            Err(error) => {
                warnings.push(format!(
                    "{}: {}",
                    preset_server.server.name,
                    error
                ));
                continue;
            }
        };

        match prepare_proxy_entry(
            db,
            oauth,
            project_id,
            base_dir,
            agent_kind,
            &entry_key,
            &runtime,
            patch,
            caller,
        ) {
            Ok(entry) => {
                if let Some(store) = tools_store {
                    export_tools_cache_for_server(store, base_dir, &runtime, &entry_key);
                }
                entries.push(entry);
            }
            Err(error) => warnings.push(format!("{}: {error}", preset_server.server.name)),
        }
    }

    if !warnings.is_empty() {
        eprintln!(
            "[tasedeck] proxy export warnings for project {}: {}",
            base_dir.display(),
            warnings.join("; ")
        );
    }

    if entries.is_empty() && !warnings.is_empty() {
        return Err(warnings.join("; "));
    }

    Ok(entries)
}

fn export_tools_cache_for_server(
    tools_store: &McpToolsStore,
    base_dir: &Path,
    server: &crate::db::McpServer,
    server_key: &str,
) {
    // Only write an in-memory snapshot; never spawn MCP connections during export.
    let snapshot = tools_store
        .get_tools(server.id)
        .filter(|snapshot| snapshot.error.is_none() && !snapshot.tools.is_empty());

    let Some(snapshot) = snapshot else {
        return;
    };

    if let Err(error) = proxy_sidecar::write_tools_cache(base_dir, server_key, &snapshot) {
        eprintln!(
            "[tasedeck] tools cache export failed for {}: {error}",
            server.name
        );
    }
}

/// Removes `.tasedeck/mcp/*.json` sidecar and tools-cache files (not `proxy.mjs`).
pub fn remove_tasedeck_sidecar_files(project_root: &Path) -> Result<Vec<String>, String> {
    let dir = project_root.join(proxy_sidecar::SIDECAR_DIR);
    let mut removed = Vec::new();
    if !dir.is_dir() {
        return Ok(removed);
    }

    for entry in fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_tools_cache = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".tools.json"));
        if is_tools_cache {
            continue;
        }
        let is_json = path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
        if !is_json {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            removed.push(path.display().to_string());
        }
    }

    Ok(removed)
}

/// Strips TaseDeck proxy entries from agent `mcp.json` and removes sidecar artifacts.
pub fn cleanup_tasedeck_project_agent_artifacts(
    project_root: &Path,
    agent_kind: &str,
) -> Result<Vec<String>, String> {
    let mut removed = remove_tasedeck_sidecar_files(project_root)?;
    if let Some(path) = remove_tasedeck_managed_from_project_mcp_json(project_root, agent_kind)? {
        removed.push(path.display().to_string());
    }
    Ok(removed)
}

/// Restores project MCP config for an agent kind from the stored native snapshot.
pub fn restore_project_agent_mcp_from_default_source(
    db: &Database,
    project_id: i64,
    agent_kind: &str,
) -> Result<Vec<String>, String> {
    let project = db
        .get_project_record(project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    let project_root = normalize_folder_path(project.folder_path.trim())
        .ok_or_else(|| "invalid project folder path".to_string())?;
    let snapshot = db
        .get_project_default_source_mcp_json(project_id)
        .map_err(|error| error.to_string())?;
    crate::agents::mcp_json::restore_project_mcp_json_to_snapshot(
        &project_root,
        agent_kind,
        snapshot.as_deref(),
    )
}

fn rekey_assignment_if_needed(
    db: &Database,
    project_id: i64,
    agent_id: i64,
    assignment: &ProjectAssignmentDetail,
) -> Result<ProjectAssignmentDetail, String> {
    let needs_rekey = assignment.servers.iter().any(|entry| {
        mcp_entry_key_for_server(&entry.server) != entry.server_key.trim()
    });
    if !needs_rekey {
        return Ok(assignment.clone());
    }

    let server_ids: Vec<i64> = assignment.servers.iter().map(|entry| entry.server.id).collect();
    db.set_preset_server_ids(assignment.preset_id, &server_ids)
        .map_err(|error| error.to_string())?;
    db.get_agent_project_assignment_detail(project_id, agent_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("assignment missing after rekey for project {project_id}"))
}

fn append_proxy_export_paths(
    written: &mut Vec<String>,
    project_root: &Path,
    entries: &[McpProxyServerEntry],
    mcp_path: Option<&Path>,
) {
    if let Some(path) = mcp_path {
        written.push(path.display().to_string());
    }
    for entry in entries {
        written.push(
            sidecar_path(project_root, &entry.entry_key)
                .display()
                .to_string(),
        );
        written.push(
            proxy_sidecar::tools_cache_path(project_root, &entry.entry_key)
                .display()
                .to_string(),
        );
    }
    written.push(
        project_root
            .join(crate::services::mcp_proxy::PROJECT_PROXY_SCRIPT_REL)
            .display()
            .to_string(),
    );
}

/// Rebuilds project MCP export from all agent assignments; cleans stale TaseDeck files first.
pub fn sync_project_tasedeck_mcp_merged(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    project_id: i64,
    extra_kinds_to_clean: &[String],
    scope: ProxyExportScope,
) -> Result<Vec<String>, String> {
    let project = db
        .get_project_record(project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("project {project_id} not found"))?;

    let project_root = normalize_folder_path(project.folder_path.trim()).ok_or_else(|| {
        format!(
            "project folder path is invalid: {}",
            project.folder_path.trim()
        )
    })?;
    if !project_root.is_dir() {
        return Err(format!(
            "project folder does not exist: {}",
            project_root.display()
        ));
    }

    let agents = db
        .list_project_agents(project_id)
        .map_err(|error| error.to_string())?;

    let mut kinds_to_clean: HashSet<String> = agents.iter().map(|agent| agent.kind.clone()).collect();
    for kind in extra_kinds_to_clean {
        kinds_to_clean.insert(kind.clone());
    }
    if kinds_to_clean.is_empty() {
        kinds_to_clean.insert("cursor".to_string());
    }

    let mut written = remove_tasedeck_sidecar_files(&project_root)?;
    if scope == ProxyExportScope::Full {
        for kind in &kinds_to_clean {
            if let Some(path) = remove_tasedeck_managed_from_project_mcp_json(&project_root, kind)? {
                written.push(path.display().to_string());
            }
        }
    }

    let mut by_kind: HashMap<String, Vec<(AgentRecord, ProjectAssignmentDetail)>> = HashMap::new();
    for agent in agents {
        let Some(assignment) = db
            .get_agent_project_assignment_detail(project_id, agent.id)
            .map_err(|error| error.to_string())?
        else {
            continue;
        };
        let assignment = rekey_assignment_if_needed(db, project_id, agent.id, &assignment)?;
        by_kind
            .entry(agent.kind.clone())
            .or_default()
            .push((agent, assignment));
    }

    for (kind, rows) in by_kind {
        let mut entries = Vec::new();
        for (agent, assignment) in rows {
            let overrides: Value =
                serde_json::from_str(&assignment.config_overrides).unwrap_or_else(|_| json!({}));
            entries.extend(build_proxy_entries_for_assignment(
                db,
                oauth,
                tools_store,
                project_id,
                &kind,
                &assignment,
                &project_root,
                Some(&overrides),
                Some(&agent.name),
            )?);
        }

        if entries.is_empty() {
            continue;
        }

        if scope == ProxyExportScope::Full {
            let mcp_path =
                upsert_proxy_entries_in_project_mcp_json(&project_root, &kind, &entries)?;
            append_proxy_export_paths(&mut written, &project_root, &entries, Some(&mcp_path));
        } else {
            append_proxy_export_paths(&mut written, &project_root, &entries, None);
        }
    }

    Ok(written)
}

pub fn sync_project_agent_proxy_mcp(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    project_id: i64,
    _agent_id: i64,
) -> Result<Vec<String>, String> {
    sync_project_tasedeck_mcp_merged(
        db,
        oauth,
        tools_store,
        project_id,
        &[],
        ProxyExportScope::Full,
    )
}

/// Remove project-assignment servers whose TaseDeck proxy entry was deleted from disk `mcp.json`.
pub fn reconcile_project_assignments_from_mcp_json(
    db: &Database,
    project_id: i64,
) -> Result<bool, String> {
    let project = db
        .get_project_record(project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("project {project_id} not found"))?;

    let project_root = normalize_folder_path(project.folder_path.trim()).ok_or_else(|| {
        format!(
            "project folder path is invalid: {}",
            project.folder_path.trim()
        )
    })?;
    if !project_root.is_dir() {
        return Ok(false);
    }

    let agents = db
        .list_project_agents(project_id)
        .map_err(|error| error.to_string())?;

    let mut changed = false;
    for agent in agents {
        if reconcile_agent_assignment_from_mcp_json(
            db,
            project_id,
            agent.id,
            &project_root,
            &agent.kind,
        )? {
            changed = true;
        }
    }

    Ok(changed)
}

fn reconcile_agent_assignment_from_mcp_json(
    db: &Database,
    project_id: i64,
    agent_id: i64,
    project_root: &Path,
    agent_kind: &str,
) -> Result<bool, String> {
    let Some(assignment) = db
        .get_agent_project_assignment_detail(project_id, agent_id)
        .map_err(|error| error.to_string())?
    else {
        return Ok(false);
    };

    let Some(disk_keys) = extract_tasedeck_proxy_entry_keys(project_root, agent_kind)? else {
        return Ok(false);
    };

    let mut to_remove: Vec<i64> = Vec::new();
    let mut sidecar_keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for entry in &assignment.servers {
        let entry_key = mcp_entry_key_for_server(&entry.server);
        let server_key = entry.server_key.trim();
        let on_disk = disk_keys.contains(&entry_key)
            || (!server_key.is_empty() && disk_keys.contains(server_key));
        if on_disk {
            continue;
        }

        let sidecar_exists = sidecar_path(project_root, &entry_key).is_file()
            || (!server_key.is_empty() && sidecar_path(project_root, server_key).is_file());
        if sidecar_exists {
            to_remove.push(entry.server.id);
            sidecar_keys.insert(entry_key);
            if !server_key.is_empty() {
                sidecar_keys.insert(server_key.to_string());
            }
        }
    }

    if to_remove.is_empty() {
        return Ok(false);
    }

    for server_id in to_remove {
        db.remove_mcp_server_from_project_agent(project_id, agent_id, server_id)
            .map_err(|error| error.to_string())?;
    }

    for key in sidecar_keys {
        let _ = std::fs::remove_file(sidecar_path(project_root, &key));
        let _ = std::fs::remove_file(proxy_sidecar::tools_cache_path(project_root, &key));
    }

    Ok(true)
}

pub fn sync_projects_for_preset(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    preset_id: i64,
) -> Result<Vec<String>, String> {
    let pairs = db
        .list_project_agent_assignments_for_preset(preset_id)
        .map_err(|error| error.to_string())?;

    let mut written = Vec::new();
    let mut project_ids = HashSet::new();
    for (project_id, _agent_id) in pairs {
        project_ids.insert(project_id);
    }
    for project_id in project_ids {
        written.extend(sync_project_tasedeck_mcp_merged(
            db,
            oauth,
            tools_store,
            project_id,
            &[],
            ProxyExportScope::SidecarsOnly,
        )?);
    }
    Ok(written)
}

pub fn sync_projects_using_server(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    server_id: i64,
) -> Result<Vec<String>, String> {
    let pairs = db
        .list_project_agent_assignments_for_server(server_id)
        .map_err(|error| error.to_string())?;

    let mut written = Vec::new();
    let mut project_ids = HashSet::new();
    for (project_id, _agent_id) in pairs {
        project_ids.insert(project_id);
    }
    for project_id in project_ids {
        written.extend(sync_project_tasedeck_mcp_merged(
            db,
            oauth,
            tools_store,
            project_id,
            &[],
            ProxyExportScope::SidecarsOnly,
        )?);
    }
    Ok(written)
}

pub fn sync_project_proxy_mcp_for_all_agents(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    project_id: i64,
) -> Result<Vec<String>, String> {
    sync_project_tasedeck_mcp_merged(
        db,
        oauth,
        tools_store,
        project_id,
        &[],
        ProxyExportScope::Full,
    )
}

fn log_export_error(context: &str, error: String) {
    eprintln!("[tasedeck] project proxy export ({context}): {error}");
}

pub fn schedule_project_proxy_export(
    queue: &crate::services::ProjectDiskQueue,
    project_id: i64,
    agent_id: i64,
    extra_kinds_to_clean: Vec<String>,
    scope: ProxyExportScope,
) {
    match scope {
        ProxyExportScope::Full => {
            queue.enqueue_export_full(project_id, Some(agent_id), extra_kinds_to_clean);
        }
        ProxyExportScope::SidecarsOnly => {
            queue.enqueue_export_sidecars(project_id, Some(agent_id));
        }
    }
}

pub fn schedule_projects_for_preset_export(
    queue: &crate::services::ProjectDiskQueue,
    db: &Database,
    preset_id: i64,
) {
    let Ok(pairs) = db.list_project_agent_assignments_for_preset(preset_id) else {
        return;
    };
    let mut project_ids = HashSet::new();
    for (project_id, agent_id) in pairs {
        if project_ids.insert(project_id) {
            queue.enqueue_export_sidecars(project_id, Some(agent_id));
        }
    }
}

pub fn schedule_projects_using_server_export(
    queue: &crate::services::ProjectDiskQueue,
    server_id: i64,
) {
    queue.enqueue_for_all_projects_using_server(server_id);
}
