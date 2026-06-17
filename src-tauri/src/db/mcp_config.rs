use crate::db::{McpServer, McpServerType};
use crate::services::mcp_run_command::{is_active_profile_remote, McpActiveTransport, resolve_active_transport};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct StoredConfigInput {
    id: String,
    name: String,
    #[serde(rename = "isRequired", default)]
    is_required: bool,
    #[serde(default = "default_source")]
    source: String,
}

fn default_source() -> String {
    "argument".to_string()
}

/// Remote servers may connect with URL only (auth headers optional).
pub fn can_attempt_mcp_tools(server: &McpServer) -> bool {
    if server.id <= 0 {
        return false;
    }
    if let Some(url) = infer_remote_url(server) {
        return !url.trim().is_empty();
    }
    is_mcp_server_configured(server)
}

pub fn is_mcp_server_configured(server: &McpServer) -> bool {
    let values: HashMap<String, String> =
        serde_json::from_str(server.config_values.trim()).unwrap_or_default();

    if is_active_profile_remote(&server.config_values) {
        return remote_profile_configured(server, &values);
    }

    if infer_remote_url_from_json(server.json_config.trim()).is_some() {
        return remote_profile_configured(server, &values);
    }

    if server.server_type == McpServerType::Remote {
        return remote_profile_configured(server, &values);
    }

    if !env_variables_complete(&values) {
        return false;
    }

    let inputs: Vec<StoredConfigInput> =
        serde_json::from_str(server.config_inputs.trim()).unwrap_or_default();

    if inputs.is_empty() {
        return infer_configured_from_json(server.json_config.trim());
    }

    for input in inputs.iter().filter(|entry| entry.is_required) {
        if !input_value_present(&values, input) {
            return false;
        }
    }

    true
}

fn remote_profile_configured(server: &McpServer, _values: &HashMap<String, String>) -> bool {
    infer_remote_url(server)
        .map(|url| !url.trim().is_empty())
        .unwrap_or(false)
}

fn infer_remote_url(server: &McpServer) -> Option<String> {
    if is_active_profile_remote(&server.config_values) {
        if let Ok(Some(McpActiveTransport::Remote { url, .. })) =
            resolve_active_transport(&server.config_values)
        {
            let url = url.trim().to_string();
            if !url.is_empty() {
                return Some(url);
            }
        }
    }

    infer_remote_url_from_json(server.json_config.trim())
        .or_else(|| parse_remote_url_from_run_command(server.run_command.trim()))
}

fn infer_remote_url_from_json(json_config: &str) -> Option<String> {
    if json_config.is_empty() || json_config == "{}" {
        return None;
    }
    let parsed = serde_json::from_str::<serde_json::Value>(json_config).ok()?;
    let entry = parsed
        .get("mcpServers")
        .and_then(|value| value.as_object())
        .and_then(|map| map.values().next())
        .unwrap_or(&parsed);
    let url = entry.get("url")?.as_str()?.trim();
    if url.is_empty() {
        return None;
    }
    Some(url.to_string())
}

fn parse_remote_url_from_run_command(shell: &str) -> Option<String> {
    for prefix in ["http ", "sse "] {
        if let Some(url) = shell.strip_prefix(prefix) {
            let url = url.trim();
            if !url.is_empty() {
                return Some(url.to_string());
            }
        }
    }
    None
}

fn input_value_present(values: &HashMap<String, String>, input: &StoredConfigInput) -> bool {
    values
        .get(&input.id)
        .or_else(|| values.get(&input.name))
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .is_some()
}

fn env_variables_complete(values: &HashMap<String, String>) -> bool {
    let Some(raw) = values.get("__envVariables") else {
        return true;
    };
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(raw) else {
        return true;
    };
    if rows.is_empty() {
        return true;
    }
    rows.iter().all(|row| {
        let name = row
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if name.is_empty() {
            return true;
        }
        row.get("value")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .is_some()
    })
}

fn infer_configured_from_json(json_config: &str) -> bool {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_config) else {
        return true;
    };

    let Some(entry) = parsed
        .get("mcpServers")
        .and_then(|value| value.as_object())
        .and_then(|map| map.values().next())
    else {
        return true;
    };

    let Some(env) = entry.get("env").and_then(|value| value.as_object()) else {
        return true;
    };

    for value in env.values() {
        if value
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .is_none()
        {
            return false;
        }
    }

    true
}
