use crate::agents::mcp_json::{
    is_tasedeck_topology_entry_key, mcp_servers_root_for_agent_kind, read_agent_mcp_config_as_json,
};
use crate::services::is_tasedeck_proxy_entry;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub fn project_mcp_candidate_paths(kind: &str, project_root: &Path) -> Vec<PathBuf> {
    match kind {
        "cursor" => vec![project_root.join(".cursor").join("mcp.json")],
        "vscode" | "copilot" => vec![project_root.join(".vscode").join("mcp.json")],
        "windsurf" => vec![project_root.join(".windsurf").join("mcp.json")],
        "claude-code" => vec![
            project_root.join(".mcp.json"),
            project_root.join(".claude").join("mcp.json"),
        ],
        "opencode" => vec![project_root.join("opencode.json")],
        "codex-cli" => vec![
            project_root.join(".codex").join("config.toml"),
            project_root.join("config.toml"),
        ],
        "antigravity" => vec![
            project_root.join(".antigravity").join("mcp.json"),
            project_root.join(".cursor").join("mcp.json"),
        ],
        _ => vec![project_root.join("mcp.json")],
    }
}

pub fn find_project_mcp_config(project_root: &Path, kind: &str) -> Option<PathBuf> {
    project_mcp_candidate_paths(kind, project_root)
        .into_iter()
        .find(|path| path.is_file())
}

pub fn project_has_mcp_config(project_root: &Path, kind: &str) -> bool {
    find_project_mcp_config(project_root, kind).is_some()
}

pub fn extract_project_mcp_servers(
    project_root: &Path,
    kind: &str,
) -> Result<Option<BTreeMap<String, Value>>, String> {
    let Some(path) = find_project_mcp_config(project_root, kind) else {
        return Ok(None);
    };

    let Some(root) = read_agent_mcp_config_as_json(&path, kind)? else {
        return Ok(None);
    };

    Ok(Some(extract_servers_from_root(&root, kind)))
}

pub fn extract_servers_from_root(root: &Value, kind: &str) -> BTreeMap<String, Value> {
    let servers_key = mcp_servers_root_for_agent_kind(kind);
    let mut result = BTreeMap::new();

    let Some(servers) = root.get(servers_key).and_then(Value::as_object) else {
        return result;
    };

    for (name, entry) in servers {
        if is_tasedeck_topology_entry_key(name) {
            continue;
        }
        if is_tasedeck_proxy_entry(entry) {
            continue;
        }
        if entry.is_object() {
            result.insert(name.clone(), entry.clone());
        }
    }

    result
}

/// Names of TaseDeck-managed proxy entries still present in the project `mcp.json`.
pub fn extract_tasedeck_proxy_entry_keys(
    project_root: &Path,
    kind: &str,
) -> Result<Option<std::collections::BTreeSet<String>>, String> {
    let Some(path) = find_project_mcp_config(project_root, kind) else {
        return Ok(None);
    };

    let Some(root) = read_agent_mcp_config_as_json(&path, kind)? else {
        return Ok(None);
    };

    let servers_key = mcp_servers_root_for_agent_kind(kind);
    let mut keys = std::collections::BTreeSet::new();

    let Some(servers) = root.get(servers_key).and_then(Value::as_object) else {
        return Ok(Some(keys));
    };

    for (name, entry) in servers {
        if is_tasedeck_topology_entry_key(name) {
            continue;
        }
        if is_tasedeck_proxy_entry(entry) {
            keys.insert(name.clone());
        }
    }

    Ok(Some(keys))
}

pub fn strip_server_for_fingerprint(entry: &Value) -> Value {
    let Some(obj) = entry.as_object() else {
        return Value::Null;
    };

    let mut stripped = Map::new();
    for key in ["command", "args", "url", "type", "enabled"] {
        if let Some(value) = obj.get(key) {
            stripped.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(stripped)
}

pub fn server_set_fingerprint(servers: &BTreeMap<String, Value>) -> String {
    let mut normalized = BTreeMap::new();
    for (name, entry) in servers {
        normalized.insert(name.clone(), strip_server_for_fingerprint(entry));
    }
    let payload =
        serde_json::to_string(&normalized).unwrap_or_else(|_| "{}".to_string());
    format!("{:x}", Sha256::digest(payload.as_bytes()))
}

pub fn extract_config_overrides(entry: &Value) -> Value {
    let Some(obj) = entry.as_object() else {
        return Value::Object(Map::new());
    };

    let mut overrides = Map::new();
    for key in ["env", "args", "headers"] {
        if let Some(value) = obj.get(key) {
            if !value.as_object().is_some_and(|map| map.is_empty())
                && !value.as_array().is_some_and(|items| items.is_empty())
            {
                overrides.insert(key.to_string(), value.clone());
            }
        }
    }
    Value::Object(overrides)
}

pub fn preset_name_for_projects(mut names: Vec<String>) -> String {
    names.sort();
    names.dedup();
    match names.len() {
        0 => "Preset".to_string(),
        1 => names[0].clone(),
        _ => format!("{}, {}", names[0], names[1]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_ignores_env() {
        let mut servers = BTreeMap::new();
        servers.insert(
            "alpha".to_string(),
            serde_json::json!({ "command": "node", "env": { "A": "1" } }),
        );
        let mut servers_b = servers.clone();
        servers_b.insert(
            "alpha".to_string(),
            serde_json::json!({ "command": "node", "env": { "A": "2" } }),
        );
        assert_eq!(
            server_set_fingerprint(&servers),
            server_set_fingerprint(&servers_b)
        );
    }
}
