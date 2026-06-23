use crate::agents::project_discovery::normalize_folder_path;
use crate::agents::project_mcp::{extract_config_overrides, extract_project_mcp_servers};
use crate::db::Database;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

const SCAN_AGENT_KINDS: &[&str] = &[
    "cursor",
    "vscode",
    "copilot",
    "windsurf",
    "claude-code",
    "antigravity",
    "opencode",
    "codex-cli",
];

/// Collect native (non-TaseDeck) MCP servers from project-local agent config files.
pub fn collect_native_project_mcp_servers(
    project_root: &Path,
    linked_agent_kinds: &[String],
) -> BTreeMap<String, Value> {
    let mut kinds: BTreeSet<&str> = SCAN_AGENT_KINDS.iter().copied().collect();
    for kind in linked_agent_kinds {
        kinds.insert(kind.as_str());
    }

    let mut merged = BTreeMap::new();
    for kind in kinds {
        let Ok(Some(servers)) = extract_project_mcp_servers(project_root, kind) else {
            continue;
        };
        for (key, entry) in servers {
            merged.insert(key, entry);
        }
    }
    merged
}

/// Wrap native MCP server map in a Cursor-style `mcp.json` root object.
pub fn native_mcp_source_json(native_servers: &BTreeMap<String, Value>) -> String {
    let servers: serde_json::Map<String, Value> = native_servers
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    serde_json::to_string(&json!({ "mcpServers": servers })).unwrap_or_else(|_| "{}".to_string())
}

/// Register native servers from disk into installed MCP registry and project default preset.
pub fn import_native_mcp_servers_for_project(
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

    let linked_kinds: Vec<String> = db
        .list_project_agents(project_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|agent| agent.kind)
        .collect();

    let native_servers = collect_native_project_mcp_servers(&project_root, &linked_kinds);
    if native_servers.is_empty() {
        return Ok(false);
    }

    if let Some(existing) = db
        .get_project_assignment_detail(project_id)
        .map_err(|error| error.to_string())?
    {
        let known_keys: BTreeSet<String> = existing
            .servers
            .iter()
            .map(|entry| entry.server_key.trim().to_string())
            .filter(|key| !key.is_empty())
            .collect();
        let known_ids: BTreeSet<i64> = existing.servers.iter().map(|entry| entry.server.id).collect();

        let mut added = false;
        let mut server_ids: Vec<i64> = existing.servers.iter().map(|entry| entry.server.id).collect();

        for (server_key, entry) in &native_servers {
            if known_keys.contains(server_key.trim()) {
                continue;
            }
            let installed = db
                .ensure_mcp_server_from_entry(server_key, entry)
                .map_err(|error| error.to_string())?;
            if !known_ids.contains(&installed.id) {
                server_ids.push(installed.id);
                db.show_mcp_server_in_catalog(installed.id)
                    .map_err(|error| error.to_string())?;
                added = true;
            }
        }

        if !added {
            return Ok(false);
        }

        db.set_preset_server_ids(existing.preset_id, &server_ids)
            .map_err(|error| error.to_string())?;

        let mut merged: Value =
            serde_json::from_str(&existing.config_overrides).unwrap_or_else(|_| json!({}));
        if !merged.is_object() {
            merged = json!({});
        }
        if let Some(map) = merged.as_object_mut() {
            for (server_key, entry) in &native_servers {
                if known_keys.contains(server_key.trim()) {
                    continue;
                }
                let patch = extract_config_overrides(entry);
                if patch.as_object().is_some_and(|obj| !obj.is_empty()) {
                    map.insert(server_key.clone(), patch);
                }
            }
        }
        db.upsert_project_preset_assignment(project_id, existing.preset_id, &merged)
            .map_err(|error| error.to_string())?;
        let _ = db.set_project_default_source_mcp_json_if_empty(
            project_id,
            &native_mcp_source_json(&native_servers),
        );

        return Ok(true);
    }

    let fingerprint = format!("project-{project_id}-import");
    let mut server_links = BTreeMap::new();
    for (server_key, entry) in &native_servers {
        let installed = db
            .ensure_mcp_server_from_entry(server_key, entry)
            .map_err(|error| error.to_string())?;
        db.show_mcp_server_in_catalog(installed.id)
            .map_err(|error| error.to_string())?;
        server_links.insert(server_key.clone(), installed.id);
    }

    let preset = db
        .upsert_preset_record(&project.name, &fingerprint, &server_links)
        .map_err(|error| error.to_string())?;
    let overrides = Database::build_assignment_overrides(&native_servers);
    db.upsert_project_preset_assignment(project_id, preset.id, &overrides)
        .map_err(|error| error.to_string())?;
    let _ = db.set_project_default_source_mcp_json_if_empty(
        project_id,
        &native_mcp_source_json(&native_servers),
    );

    Ok(true)
}
