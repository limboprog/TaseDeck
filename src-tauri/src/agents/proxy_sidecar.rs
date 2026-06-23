use crate::core::fs::proxy_spool_dir;
use crate::db::mcp_config::{infer_remote_transport_type, infer_remote_url};
use crate::db::{Database, McpServer};
use crate::services::mcp_client::remote_headers_for_url;
use crate::services::{apply_overrides_to_runtime_server, mcp_server_for_runtime, sync_oauth_runtime_token, OAuthStore};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const SIDECAR_DIR: &str = ".tasedeck/mcp";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySidecarConfig {
    pub server_id: i64,
    pub server_name: String,
    pub project_id: i64,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
    /// Tool name → disabled (`false` only). Omitted tools and legacy `true` rows stay enabled.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub tool_enabled: HashMap<String, bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default = "default_idle_ms")]
    pub idle_shutdown_ms: u64,
}

fn default_idle_ms() -> u64 {
    300_000
}

#[derive(Debug, Clone)]
enum DownstreamSpec {
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    },
    Remote {
        transport: String,
        url: String,
        headers: HashMap<String, String>,
        env: HashMap<String, String>,
    },
}

pub fn sidecar_path(base_dir: &Path, server_key: &str) -> PathBuf {
    let safe = sanitize_filename(server_key);
    base_dir.join(SIDECAR_DIR).join(format!("{safe}.json"))
}

pub fn tools_cache_path(base_dir: &Path, server_key: &str) -> PathBuf {
    let safe = sanitize_filename(server_key);
    base_dir.join(SIDECAR_DIR).join(format!("{safe}.tools.json"))
}

pub fn write_tools_cache(
    base_dir: &Path,
    server_key: &str,
    snapshot: &crate::services::McpServerToolsSnapshot,
) -> Result<PathBuf, String> {
    if snapshot.tools.is_empty() {
        return Ok(tools_cache_path(base_dir, server_key));
    }

    let tools: Vec<serde_json::Value> = snapshot
        .tools
        .iter()
        .map(|tool| {
            serde_json::json!({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema.clone().unwrap_or_else(|| {
                    serde_json::json!({ "type": "object", "properties": {} })
                }),
            })
        })
        .collect();

    let path = tools_cache_path(base_dir, server_key);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = serde_json::json!({
        "tools": tools,
        "cachedAt": chrono_lite_now(),
    });
    let text = serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&path, format!("{text}\n")).map_err(|error| error.to_string())?;
    Ok(path)
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

/// Relative `--config` path for project-local MCP files (no absolute paths in mcp.json).
///
/// Cursor and other agents spawn MCP with the **workspace root** as cwd, not `.cursor/`.
pub fn sidecar_relative_arg(_agent_kind: &str, server_key: &str) -> String {
    let safe = sanitize_filename(server_key);
    format!(".tasedeck/mcp/{safe}.json")
}

pub fn sanitize_filename(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "mcp-server".to_string();
    }
    trimmed
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

pub fn central_proxy_spool_path(project_id: i64, server_key: &str) -> PathBuf {
    let safe = sanitize_filename(server_key);
    proxy_spool_dir()
        .join(project_id.to_string())
        .join(format!("{safe}.jsonl"))
}

fn json_env_from_server(server: &McpServer) -> HashMap<String, String> {
    let root: Value =
        serde_json::from_str(&server.json_config).unwrap_or_else(|_| serde_json::json!({}));
    let entry = root
        .get("mcpServers")
        .and_then(|value| value.as_object())
        .and_then(|map| map.values().next())
        .unwrap_or(&root);

    let mut env = HashMap::new();
    if let Some(env_obj) = entry.get("env").and_then(Value::as_object) {
        for (key, value) in env_obj {
            if let Some(text) = value.as_str() {
                env.insert(key.clone(), text.to_string());
            }
        }
    }
    env
}

fn stdio_downstream_from_server(
    server: &McpServer,
) -> Result<(String, Vec<String>, HashMap<String, String>), String> {
    let env = json_env_from_server(server);
    let shell = server.run_command.trim();
    if !shell.is_empty() {
        let words = crate::services::mcp_proxy::shell_words(shell);
        if words.is_empty() {
            return Err(format!("MCP server \"{}\" has an empty run command", server.name));
        }
        if words[0] == "http" || words[0] == "sse" {
            return Err(format!(
                "MCP server \"{}\" remote profile is missing a URL",
                server.name
            ));
        }
        let command = words[0].clone();
        let args = words[1..].to_vec();
        return Ok((command, args, env));
    }

    let root: Value =
        serde_json::from_str(&server.json_config).unwrap_or_else(|_| serde_json::json!({}));
    let entry = root
        .get("mcpServers")
        .and_then(|value| value.as_object())
        .and_then(|map| map.values().next())
        .unwrap_or(&root);

    let command = entry
        .get("command")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if command.is_empty() {
        return Err(format!(
            "MCP server \"{}\" has no run command or json_config.command",
            server.name
        ));
    }

    let args = entry
        .get("args")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok((command, args, env))
}

fn tool_enabled_for_export(overrides: Option<&Value>) -> HashMap<String, bool> {
    let Some(tool_prefs) = overrides
        .and_then(Value::as_object)
        .and_then(|map| map.get("toolPrefs"))
        .and_then(Value::as_object)
    else {
        return HashMap::new();
    };

    let mut disabled = HashMap::new();
    for (name, value) in tool_prefs {
        if value.as_bool() == Some(false) {
            disabled.insert(name.clone(), false);
        }
    }
    disabled
}

fn resolve_downstream_spec(server: &McpServer) -> Result<DownstreamSpec, String> {
    if let Some(url) = infer_remote_url(server) {
        return Ok(DownstreamSpec::Remote {
            transport: infer_remote_transport_type(server),
            headers: remote_headers_for_url(server, &url),
            env: json_env_from_server(server),
            url,
        });
    }

    let (command, args, env) = stdio_downstream_from_server(server)?;
    Ok(DownstreamSpec::Stdio { command, args, env })
}

pub fn build_sidecar_config(
    db: &Database,
    oauth: Option<&OAuthStore>,
    project_id: i64,
    server_key: &str,
    server: &McpServer,
    overrides: Option<&Value>,
    caller: Option<&str>,
) -> Result<ProxySidecarConfig, String> {
    let mut runtime = mcp_server_for_runtime(server).map_err(|error| error.to_string())?;
    if let Some(patch) = overrides.filter(|value| {
        value
            .as_object()
            .is_some_and(|map| !map.is_empty())
    }) {
        apply_overrides_to_runtime_server(&mut runtime, patch)?;
    }

    let downstream = resolve_downstream_spec(&runtime)?;
    let tool_enabled = tool_enabled_for_export(overrides);

    let mut config = ProxySidecarConfig {
        server_id: runtime.id,
        server_name: server_key.trim().to_string(),
        project_id,
        command: String::new(),
        args: Vec::new(),
        env: HashMap::new(),
        transport: None,
        url: None,
        headers: HashMap::new(),
        tool_enabled,
        caller: caller.map(str::to_string),
        idle_shutdown_ms: default_idle_ms(),
    };

    match downstream {
        DownstreamSpec::Stdio { command, args, env } => {
            config.command = command;
            config.args = args;
            config.env = env;
        }
        DownstreamSpec::Remote {
            transport,
            url,
            headers,
            env,
        } => {
            config.transport = Some(transport);
            config.url = Some(url);
            config.headers = headers;
            config.env = env;
            config.headers.retain(|key, _| !key.eq_ignore_ascii_case("authorization"));
            if let Some(oauth) = oauth {
                let _ = sync_oauth_runtime_token(oauth, &runtime);
            }
        }
    }

    Ok(config)
}

pub fn write_sidecar_config(path: &Path, config: &ProxySidecarConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let spool = central_proxy_spool_path(config.project_id, &config.server_name);
    if let Some(parent) = spool.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, format!("{payload}\n")).map_err(|error| error.to_string())
}

pub fn write_sidecar_for_server(
    db: &Database,
    oauth: Option<&OAuthStore>,
    project_id: i64,
    base_dir: &Path,
    server_key: &str,
    server: &McpServer,
    overrides: Option<&Value>,
    caller: Option<&str>,
) -> Result<PathBuf, String> {
    let config = build_sidecar_config(
        db,
        oauth,
        project_id,
        server_key,
        server,
        overrides,
        caller,
    )?;
    let path = sidecar_path(base_dir, server_key);
    write_sidecar_config(&path, &config)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidecar_relative_path_is_from_workspace_root() {
        assert_eq!(
            sidecar_relative_arg("cursor", "deploy-app"),
            ".tasedeck/mcp/deploy-app.json"
        );
    }
}
