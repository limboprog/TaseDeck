use crate::db::McpServer;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct StoredConfigInput {
    id: String,
    name: String,
    #[serde(rename = "isRequired", default)]
    is_required: bool,
}

pub fn is_mcp_server_configured(server: &McpServer) -> bool {
    let inputs: Vec<StoredConfigInput> =
        serde_json::from_str(server.config_inputs.trim()).unwrap_or_default();

    if inputs.is_empty() {
        return infer_configured_from_json(server.json_config.trim());
    }

    let values: HashMap<String, String> =
        serde_json::from_str(server.config_values.trim()).unwrap_or_default();

    for input in inputs.iter().filter(|entry| entry.is_required) {
        let value = values
            .get(&input.id)
            .or_else(|| values.get(&input.name))
            .map(|text| text.trim())
            .unwrap_or("");
        if value.is_empty() {
            return false;
        }
    }

    true
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
