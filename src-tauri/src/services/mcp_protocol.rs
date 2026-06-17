use serde_json::{json, Value};
use std::collections::HashSet;

pub const DEFAULT_PROTOCOL_VERSION: &str = "2024-11-05";
pub const MAX_MCP_PROTOCOL_RETRIES: usize = 5;

pub const CLIENT_NAME: &str = "tase-deck";
pub const CLIENT_VERSION: &str = "0.1.0";

/// Streamable HTTP session id returned on the initialize response.
pub const MCP_SESSION_ID_HEADER: &str = "MCP-Session-Id";
/// Negotiated MCP protocol version sent on every HTTP request after spec 2025-03-26.
pub const MCP_PROTOCOL_VERSION_HEADER: &str = "MCP-Protocol-Version";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ToolsListParamsMode {
    EmptyObject,
    Null,
    Omit,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum McpRetryAdjustment {
    ProtocolVersion(String),
    ToolsListParams(ToolsListParamsMode),
}

#[derive(Debug, Clone)]
pub struct McpSessionContext {
    pub protocol_version: String,
    pub capabilities: Value,
    pub client_name: String,
    pub client_version: String,
    pub tools_list_params_mode: ToolsListParamsMode,
}

impl Default for McpSessionContext {
    fn default() -> Self {
        Self::new(CLIENT_NAME, CLIENT_VERSION)
    }
}

impl McpSessionContext {
    pub fn new(client_name: &str, client_version: &str) -> Self {
        Self {
            protocol_version: DEFAULT_PROTOCOL_VERSION.to_string(),
            capabilities: json!({}),
            client_name: client_name.to_string(),
            client_version: client_version.to_string(),
            tools_list_params_mode: ToolsListParamsMode::EmptyObject,
        }
    }

    pub fn initialize_params(&self) -> Value {
        json!({
            "protocolVersion": self.protocol_version,
            "capabilities": self.capabilities.clone(),
            "clientInfo": {
                "name": self.client_name,
                "version": self.client_version
            }
        })
    }

    pub fn tools_list_params(&self) -> Option<Value> {
        match self.tools_list_params_mode {
            ToolsListParamsMode::EmptyObject => Some(json!({})),
            ToolsListParamsMode::Null => Some(Value::Null),
            ToolsListParamsMode::Omit => None,
        }
    }
}

#[derive(Debug, Default)]
pub struct McpRetrySession {
    pub context: McpSessionContext,
    applied: HashSet<McpRetryAdjustment>,
    attempts: usize,
}

impl McpRetrySession {
    pub fn new(client_name: &str, client_version: &str) -> Self {
        Self {
            context: McpSessionContext::new(client_name, client_version),
            applied: HashSet::new(),
            attempts: 0,
        }
    }

    pub fn attempts(&self) -> usize {
        self.attempts
    }

    pub fn apply(&mut self, adjustment: McpRetryAdjustment) {
        self.applied.insert(adjustment.clone());
        match adjustment {
            McpRetryAdjustment::ProtocolVersion(version) => {
                self.context.protocol_version = version;
            }
            McpRetryAdjustment::ToolsListParams(mode) => {
                self.context.tools_list_params_mode = mode;
            }
        }
    }

    pub fn was_applied(&self, adjustment: &McpRetryAdjustment) -> bool {
        self.applied.contains(adjustment)
    }

    pub fn can_retry(&self) -> bool {
        self.attempts < MAX_MCP_PROTOCOL_RETRIES
    }

    pub fn record_attempt(&mut self) {
        self.attempts += 1;
    }
}

pub fn build_json_rpc_request(id: u64, method: &str, params: Option<Value>) -> Value {
    let mut body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
    });
    if let Some(params) = params {
        if let Some(object) = body.as_object_mut() {
            object.insert("params".to_string(), params);
        }
    }
    body
}

pub fn response_has_error(response: &Value) -> bool {
    response.get("error").is_some()
}

pub fn format_json_rpc_failure(method: &str, response: &Value) -> String {
    format!("{method} failed: {response}")
}

/// Inspects a JSON-RPC error and returns the next corrective action, if any.
pub fn next_adjustment_for_error(
    error: &Value,
    method: &str,
    session: &McpRetrySession,
) -> Option<McpRetryAdjustment> {
    if !session.can_retry() {
        return None;
    }

    if let Some(version) = extract_supported_protocol_version(error) {
        let adjustment = McpRetryAdjustment::ProtocolVersion(version);
        if !session.was_applied(&adjustment) {
            return Some(adjustment);
        }
    }

    if is_invalid_request_parameters(error) {
        if method == "tools/list" {
            return next_tools_list_params_adjustment(session);
        }
    }

    None
}

fn next_tools_list_params_adjustment(session: &McpRetrySession) -> Option<McpRetryAdjustment> {
    for mode in [
        ToolsListParamsMode::Null,
        ToolsListParamsMode::Omit,
        ToolsListParamsMode::EmptyObject,
    ] {
        let adjustment = McpRetryAdjustment::ToolsListParams(mode);
        if !session.was_applied(&adjustment)
            && session.context.tools_list_params_mode != mode
        {
            return Some(adjustment);
        }
    }
    None
}

fn is_invalid_request_parameters(error: &Value) -> bool {
    let code = error.get("code").and_then(Value::as_i64);
    if code != Some(-32602) {
        return false;
    }
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    message.contains("invalid request parameters") || message.contains("invalid params")
}

fn extract_supported_protocol_version(error: &Value) -> Option<String> {
    if let Some(version) = extract_supported_from_data(error.get("data")) {
        return Some(version);
    }

    let message = error.get("message").and_then(Value::as_str).unwrap_or("");
    if message.to_ascii_lowercase().contains("protocol version") {
        if let Some(version) = extract_supported_from_data(error.get("data")) {
            return Some(version);
        }
        return extract_supported_from_message(message);
    }

    None
}

fn extract_supported_from_data(data: Option<&Value>) -> Option<String> {
    let data = data?;
    if let Some(supported) = data.get("supported").and_then(Value::as_array) {
        return pick_preferred_protocol_version(supported);
    }
    if let Some(supported) = data
        .get("supportedVersions")
        .and_then(Value::as_array)
    {
        return pick_preferred_protocol_version(supported);
    }
    None
}

fn extract_supported_from_message(message: &str) -> Option<String> {
    let lower = message.to_ascii_lowercase();
    let marker = "server supports";
    let start = lower.find(marker)? + marker.len();
    let tail = message.get(start..)?.trim();
    let versions = tail
        .split([',', ';'])
        .map(str::trim)
        .filter(|part| looks_like_protocol_version(part))
        .map(str::to_string)
        .collect::<Vec<_>>();
    if versions.is_empty() {
        return None;
    }
    pick_preferred_protocol_version(
        &versions
            .iter()
            .map(|version| Value::String(version.clone()))
            .collect::<Vec<_>>(),
    )
}

fn looks_like_protocol_version(value: &str) -> bool {
    let trimmed = value.trim().trim_matches('\'').trim_matches('"');
    trimmed.len() == 10
        && trimmed.as_bytes().get(4) == Some(&b'-')
        && trimmed.as_bytes().get(7) == Some(&b'-')
}

fn pick_preferred_protocol_version(supported: &[Value]) -> Option<String> {
    let mut versions = supported
        .iter()
        .filter_map(|value| value.as_str().map(str::trim).filter(|text| !text.is_empty()))
        .map(str::to_string)
        .collect::<Vec<_>>();
    if versions.is_empty() {
        return None;
    }
    versions.sort_by(|left, right| right.cmp(left));
    Some(versions[0].clone())
}

pub fn execute_with_retry<F>(
    method: &str,
    mut build_params: impl FnMut(&McpSessionContext) -> Option<Value>,
    mut send: F,
    session: &mut McpRetrySession,
) -> Result<Value, String>
where
    F: FnMut(Option<Value>) -> Result<Value, String>,
{
    loop {
        session.record_attempt();
        let params = build_params(&session.context);
        let response = send(params)?;

        if !response_has_error(&response) {
            return Ok(response);
        }

        let error = response
            .get("error")
            .cloned()
            .unwrap_or_else(|| json!({"message": "unknown error"}));

        let Some(adjustment) = next_adjustment_for_error(&error, method, session) else {
            return Err(format_json_rpc_failure(method, &response));
        };

        session.apply(adjustment);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_newest_supported_protocol_version_from_data() {
        let error = json!({
            "code": -32602,
            "message": "Unsupported protocol version. Client requested '2024-11-05' but server supports 2025-11-25, 2025-06-18",
            "data": {
                "requested": "2024-11-05",
                "supported": ["2025-11-25", "2025-06-18"]
            }
        });

        let session = McpRetrySession::new("test", "0.1.0");
        let adjustment = next_adjustment_for_error(&error, "initialize", &session).unwrap();
        assert_eq!(
            adjustment,
            McpRetryAdjustment::ProtocolVersion("2025-11-25".to_string())
        );
    }

    #[test]
    fn retries_tools_list_params_modes() {
        let error = json!({
            "code": -32602,
            "message": "Invalid request parameters",
            "data": ""
        });
        let session = McpRetrySession::new("test", "0.1.0");
        let adjustment = next_adjustment_for_error(&error, "tools/list", &session).unwrap();
        assert_eq!(
            adjustment,
            McpRetryAdjustment::ToolsListParams(ToolsListParamsMode::Null)
        );
    }

    #[test]
    fn stops_after_max_retries() {
        let mut session = McpRetrySession::new("test", "0.1.0");
        for _ in 0..MAX_MCP_PROTOCOL_RETRIES {
            session.record_attempt();
        }
        let error = json!({
            "code": -32602,
            "data": { "supported": ["2025-11-25"] }
        });
        assert!(next_adjustment_for_error(&error, "initialize", &session).is_none());
    }
}
