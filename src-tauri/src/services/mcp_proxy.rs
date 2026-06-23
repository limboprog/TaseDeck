use crate::db::McpServer;
use crate::services::mcp_run_command::{compile_run_command_from_config_values, RUN_COMMANDS_CONFIG_KEY};
use crate::services::security::reveal_config_values_for_runtime;
use crate::services::{mcp_server_for_runtime, TopologyAggregatorConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const PROXY_SCRIPT_NAME: &str = "proxy.mjs";
pub const PROJECT_PROXY_SCRIPT_REL: &str = ".tasedeck/proxy.mjs";
pub const TASEDECK_PROXY_ENTRY_MARKER: &str = "__tasedeckProxy";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpProxyServerEntry {
    pub entry_key: String,
    pub server_id: i64,
    pub config: TopologyAggregatorConfig,
}

pub fn proxy_script_path() -> PathBuf {
    let dev_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("resources/{PROXY_SCRIPT_NAME}"));
    if dev_path.is_file() {
        return dev_path;
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidates = [
                dir.join("resources").join(PROXY_SCRIPT_NAME),
                dir.join(PROXY_SCRIPT_NAME),
                dir.join("../Resources/resources").join(PROXY_SCRIPT_NAME),
                dir.join("../Resources").join(PROXY_SCRIPT_NAME),
            ];
            for candidate in candidates {
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }

    dev_path
}

/// Copies bundled `proxy.mjs` into the project so Cursor can execute it inside the workspace sandbox.
pub fn install_project_proxy_script(project_root: &Path) -> Result<(), String> {
    let src = proxy_script_path();
    if !src.is_file() {
        return Err(format!("proxy script not found: {}", src.display()));
    }
    let dest = project_root.join(PROJECT_PROXY_SCRIPT_REL);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(&src, &dest)
        .map_err(|error| format!("failed to install project proxy script: {error}"))?;
    Ok(())
}

fn proxy_env_for_entry(sidecar: &str, entry_key: &str, server_id: i64) -> HashMap<String, String> {
    let mut env = HashMap::new();
    env.insert("TASEDECK_SERVER_CONFIG".to_string(), sidecar.to_string());
    env.insert("TASEDECK_SERVER_ID".to_string(), server_id.to_string());
    env.insert("TASEDECK_SERVER_NAME".to_string(), entry_key.to_string());
    env.insert(TASEDECK_PROXY_ENTRY_MARKER.to_string(), "1".to_string());
    env
}

pub(crate) fn shell_words(shell: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut escape = false;

    for ch in shell.chars() {
        if escape {
            current.push(ch);
            escape = false;
            continue;
        }
        if ch == '\\' && in_double {
            escape = true;
            continue;
        }
        if ch == '\'' && !in_double {
            in_single = !in_single;
            continue;
        }
        if ch == '"' && !in_single {
            in_double = !in_double;
            continue;
        }
        if ch.is_whitespace() && !in_single && !in_double {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(ch);
    }

    if !current.is_empty() {
        words.push(current);
    }

    words
}

// removed dead downstream_launch_from_server

fn merged_config_values_for_patch(
    server: &McpServer,
    patch: &serde_json::Map<String, Value>,
) -> Result<HashMap<String, String>, String> {
    let revealed = reveal_config_values_for_runtime(&server.config_values)
        .unwrap_or_else(|_| "{}".to_string());
    let mut values: HashMap<String, String> =
        serde_json::from_str(&revealed).unwrap_or_default();
    if let Some(env_patch) = patch.get("env").and_then(Value::as_object) {
        for (key, value) in env_patch {
            if let Some(text) = value.as_str() {
                values.insert(key.clone(), text.to_string());
            }
        }
    }
    Ok(values)
}

pub fn apply_overrides_to_runtime_server(
    server: &mut McpServer,
    overrides: &Value,
) -> Result<(), String> {
    let Some(patch) = overrides.as_object() else {
        return Ok(());
    };
    if patch.is_empty() {
        return Ok(());
    }

    let mut root: Value =
        serde_json::from_str(&server.json_config).unwrap_or_else(|_| json!({}));
    let Some(root_obj) = root.as_object_mut() else {
        return Err(format!(
            "MCP server \"{}\" json_config root must be an object",
            server.name
        ));
    };

    if let Some(env_patch) = patch.get("env").and_then(Value::as_object) {
        let env = root_obj
            .entry("env")
            .or_insert_with(|| Value::Object(Map::new()));
        if let Some(env_obj) = env.as_object_mut() {
            for (key, value) in env_patch {
                if let Some(text) = value.as_str() {
                    env_obj.insert(key.clone(), Value::String(text.to_string()));
                }
            }
        }
    }

    if let Some(args_patch) = patch.get("args").and_then(Value::as_array) {
        let merged = merge_args_array(
            root_obj
                .get("args")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|value| value.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
                .as_slice(),
            args_patch,
        );
        root_obj.insert(
            "args".to_string(),
            Value::Array(
                merged
                    .into_iter()
                    .map(Value::String)
                    .collect::<Vec<_>>(),
            ),
        );
    }

    if patch.get("runCommands").is_some() {
        let mut values = merged_config_values_for_patch(server, patch)?;
        if let Some(run_commands) = patch.get("runCommands") {
            let serialized =
                serde_json::to_string(run_commands).map_err(|error| error.to_string())?;
            values.insert(RUN_COMMANDS_CONFIG_KEY.to_string(), serialized);
        }
        let config_values_json =
            serde_json::to_string(&values).map_err(|error| error.to_string())?;
        let compiled = compile_run_command_from_config_values(&config_values_json)
            .map_err(|error| error.to_string())?;
        if !compiled.trim().is_empty() {
            server.run_command = compiled;
        }
    }

    server.json_config = serde_json::to_string(root_obj).map_err(|error| error.to_string())?;
    Ok(())
}

fn merge_args_array(base: &[String], patch: &[Value]) -> Vec<String> {
    if base.is_empty() {
        return patch
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string())
            })
            .collect();
    }

    let mut merged = base.to_vec();
    for (index, value) in patch.iter().enumerate() {
        let text = value
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string());
        if index < merged.len() {
            merged[index] = text;
        } else {
            merged.push(text);
        }
    }
    merged
}

pub fn rebuild_proxy_entry_with_overrides(
    entry: &McpProxyServerEntry,
    server: &McpServer,
    base_dir: &std::path::Path,
    overrides: Option<&Value>,
    db: &crate::db::Database,
    oauth: Option<&crate::services::OAuthStore>,
    project_id: i64,
    agent_kind: &str,
) -> Result<McpProxyServerEntry, String> {
    let mut runtime = mcp_server_for_runtime(server).map_err(|error| error.to_string())?;
    if let Some(patch) = overrides.filter(|value| {
        value
            .as_object()
            .is_some_and(|map| !map.is_empty())
    }) {
        apply_overrides_to_runtime_server(&mut runtime, patch)?;
        runtime = mcp_server_for_runtime(&runtime).map_err(|error| error.to_string())?;
    }

    let _ = crate::agents::proxy_sidecar::write_sidecar_for_server(
        db,
        oauth,
        project_id,
        base_dir,
        &entry.entry_key,
        &runtime,
        None,
        None,
    )?;

    install_project_proxy_script(base_dir)?;
    build_project_proxy_entry_for_server(&entry.entry_key, entry.server_id, agent_kind)
}

pub fn build_project_proxy_entry_for_server(
    entry_key: &str,
    server_id: i64,
    agent_kind: &str,
) -> Result<McpProxyServerEntry, String> {
    let entry_key = entry_key.trim();
    if entry_key.is_empty() {
        return Err("proxy entry key must not be empty".to_string());
    }
    if server_id <= 0 {
        return Err("proxy server id must be positive".to_string());
    }

    let sidecar = crate::agents::proxy_sidecar::sidecar_relative_arg(agent_kind, entry_key);
    let args = vec![
        PROJECT_PROXY_SCRIPT_REL.to_string(),
        "--config".to_string(),
        sidecar.clone(),
    ];

    Ok(McpProxyServerEntry {
        entry_key: entry_key.to_string(),
        server_id,
        config: TopologyAggregatorConfig {
            command: "node".to_string(),
            args,
            env: proxy_env_for_entry(&sidecar, entry_key, server_id),
        },
    })
}

pub fn build_proxy_entry_for_server(
    entry_key: &str,
    server_id: i64,
    agent_kind: &str,
) -> Result<McpProxyServerEntry, String> {
    let entry_key = entry_key.trim();
    if entry_key.is_empty() {
        return Err("proxy entry key must not be empty".to_string());
    }
    if server_id <= 0 {
        return Err("proxy server id must be positive".to_string());
    }

    let script = proxy_script_path().display().to_string();
    let sidecar = crate::agents::proxy_sidecar::sidecar_relative_arg(agent_kind, entry_key);

    let args = vec![
        script,
        "--config".to_string(),
        sidecar.clone(),
    ];

    Ok(McpProxyServerEntry {
        entry_key: entry_key.to_string(),
        server_id,
        config: TopologyAggregatorConfig {
            command: "node".to_string(),
            args,
            env: proxy_env_for_entry(&sidecar, entry_key, server_id),
        },
    })
}

pub fn prepare_proxy_entry(
    db: &crate::db::Database,
    oauth: Option<&crate::services::OAuthStore>,
    project_id: i64,
    base_dir: &std::path::Path,
    agent_kind: &str,
    entry_key: &str,
    server: &McpServer,
    overrides: Option<&Value>,
    caller: Option<&str>,
) -> Result<McpProxyServerEntry, String> {
    let _ = crate::agents::proxy_sidecar::write_sidecar_for_server(
        db,
        oauth,
        project_id,
        base_dir,
        entry_key,
        server,
        overrides,
        caller,
    )?;
    install_project_proxy_script(base_dir)?;
    build_project_proxy_entry_for_server(entry_key, server.id, agent_kind)
}

pub fn is_tasedeck_proxy_entry(entry: &serde_json::Value) -> bool {
    let Some(obj) = entry.as_object() else {
        return false;
    };

    if obj
        .get("env")
        .and_then(|env| env.get(TASEDECK_PROXY_ENTRY_MARKER))
        .is_some()
    {
        return true;
    }

    obj.get("args")
        .and_then(|value| value.as_array())
        .is_some_and(|args| {
            args.iter().any(|item| {
                item.as_str()
                    .is_some_and(|value| value.ends_with(PROXY_SCRIPT_NAME))
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_proxy_entry_uses_in_workspace_script() {
        let entry = build_project_proxy_entry_for_server("deploy-app", 158, "cursor").expect("entry");
        assert_eq!(entry.config.args[0], PROJECT_PROXY_SCRIPT_REL);
        assert_eq!(entry.config.args[2], ".tasedeck/mcp/deploy-app.json");
        assert_eq!(
            entry.config.env.get("TASEDECK_SERVER_CONFIG").map(String::as_str),
            Some(".tasedeck/mcp/deploy-app.json"),
        );
    }

    #[test]
    fn splits_shell_words() {
        let words = shell_words("node /tmp/server.mjs --flag");
        assert_eq!(words, vec!["node", "/tmp/server.mjs", "--flag"]);
    }
}
