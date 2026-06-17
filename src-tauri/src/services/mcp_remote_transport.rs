use crate::db::McpServer;
use crate::services::mcp_client::McpToolInfo;
use crate::services::mcp_protocol::{
    build_json_rpc_request, execute_with_retry, format_json_rpc_failure, McpRetrySession,
    MCP_PROTOCOL_VERSION_HEADER, MCP_SESSION_ID_HEADER, CLIENT_NAME, CLIENT_VERSION,
    DEFAULT_PROTOCOL_VERSION,
};
use crate::services::oauth2::{auth_required_error, AuthAction, OAuthStore};
use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::StatusCode;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

const REMOTE_HTTP_TIMEOUT: Duration = Duration::from_secs(90);

pub fn remote_http_timeout(timeout: Option<Duration>) -> Duration {
    timeout.unwrap_or(REMOTE_HTTP_TIMEOUT)
}

pub struct RemoteAuthContext {
    pub server: McpServer,
    pub oauth: Arc<OAuthStore>,
}

pub struct RemoteMcpIo {
    client: Client,
    endpoint: String,
    headers: HashMap<String, String>,
    auth: Option<RemoteAuthContext>,
    next_id: u64,
    mcp_session_id: Option<String>,
    protocol_version: String,
}

impl RemoteMcpIo {
    pub fn new(
        endpoint: String,
        headers: HashMap<String, String>,
        auth: Option<RemoteAuthContext>,
    ) -> Self {
        Self::with_timeout(endpoint, headers, auth, REMOTE_HTTP_TIMEOUT)
    }

    pub fn with_timeout(
        endpoint: String,
        headers: HashMap<String, String>,
        auth: Option<RemoteAuthContext>,
        timeout: Duration,
    ) -> Self {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(8))
            .timeout(timeout)
            .user_agent(format!("{CLIENT_NAME}/{CLIENT_VERSION}"))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            endpoint: normalize_mcp_endpoint(&endpoint),
            headers,
            auth,
            next_id: 1,
            mcp_session_id: None,
            protocol_version: DEFAULT_PROTOCOL_VERSION.to_string(),
        }
    }

    pub fn handshake_and_list_tools(&mut self) -> Result<Vec<McpToolInfo>, String> {
        let mut session = McpRetrySession::new(CLIENT_NAME, CLIENT_VERSION);
        let init_id = self.next_request_id();
        execute_with_retry(
            "initialize",
            |ctx| Some(ctx.initialize_params()),
            |params| self.send_request(init_id, "initialize", params, false),
            &mut session,
        )?;

        self.protocol_version = session.context.protocol_version.clone();

        self.notify("notifications/initialized", json!({}))?;

        let tools_id = self.next_request_id();
        let tools_response = execute_with_retry(
            "tools/list",
            |ctx| ctx.tools_list_params(),
            |params| self.send_request(tools_id, "tools/list", params, true),
            &mut session,
        )?;

        parse_tools_list_response(tools_response)
    }

    pub fn request(&mut self, id: u64, method: &str, params: Value) -> Result<Value, String> {
        self.send_request(id, method, Some(params), true)
    }

    pub fn request_with_retry(
        &mut self,
        id: u64,
        method: &str,
        build_params: impl FnMut(&crate::services::mcp_protocol::McpSessionContext) -> Option<Value>,
    ) -> Result<Value, String> {
        let mut session = McpRetrySession::new(CLIENT_NAME, CLIENT_VERSION);
        let include_session = method != "initialize";
        let response = execute_with_retry(
            method,
            build_params,
            |params| self.send_request(id, method, params, include_session),
            &mut session,
        )?;
        self.protocol_version = session.context.protocol_version.clone();
        Ok(response)
    }

    fn send_request(
        &mut self,
        id: u64,
        method: &str,
        params: Option<Value>,
        include_session: bool,
    ) -> Result<Value, String> {
        let body = build_json_rpc_request(id, method, params);
        let response = self.post_json(body, include_session)?;
        capture_session_from_response(&response, &mut self.mcp_session_id);
        parse_json_rpc_http_body(response).map_err(|error| {
            format!(
                "remote MCP {method} for {} failed: {error} (session: {})",
                self.endpoint,
                self.mcp_session_id.as_deref().unwrap_or("none")
            )
        })
    }

    pub fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let body = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });
        let response = self.post_json(body, true)?;
        capture_session_from_response(&response, &mut self.mcp_session_id);
        if !response.status().is_success() {
            let status = response.status();
            let detail = read_error_body(response);
            return Err(format!(
                "remote MCP notify HTTP {status} for {}: {detail}",
                self.endpoint
            ));
        }
        Ok(())
    }

    pub fn terminate_session(&mut self) {
        let Some(session_id) = self.mcp_session_id.clone() else {
            return;
        };

        let mut request = self
            .client
            .delete(&self.endpoint)
            .header(MCP_SESSION_ID_HEADER, session_id.as_str())
            .header(MCP_PROTOCOL_VERSION_HEADER, self.protocol_version.as_str());

        for (key, value) in &self.headers {
            if let Ok(name) = HeaderName::from_str(key) {
                if let Ok(header_value) = HeaderValue::from_str(value) {
                    request = request.header(name, header_value);
                }
            }
        }

        let _ = request.send();
        self.mcp_session_id = None;
    }

    pub fn next_request_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        id
    }

    fn post_json(&self, body: Value, include_session: bool) -> Result<Response, String> {
        self.post_json_with_auth(body, include_session, None, false)
    }

    fn post_json_with_auth(
        &self,
        body: Value,
        include_session: bool,
        bearer_override: Option<&str>,
        is_retry: bool,
    ) -> Result<Response, String> {
        let request = self.build_post_request(&body, include_session, bearer_override)?;
        let response = request.send().map_err(|error| {
            format!(
                "remote MCP request failed for {}: {error}",
                self.endpoint
            )
        })?;

        if response.status() == StatusCode::UNAUTHORIZED && !is_retry {
            if let Some(auth) = &self.auth {
                match auth.oauth.handle_http_unauthorized(
                    &auth.server,
                    &self.endpoint,
                    response.headers(),
                ) {
                    Ok(AuthAction::RetryWithToken(token)) => {
                        return self.post_json_with_auth(body, include_session, Some(&token), true);
                    }
                    Ok(AuthAction::SignInRequired(challenge)) => {
                        return Err(auth_required_error(&challenge));
                    }
                    Err(error) => return Err(error.to_string()),
                }
            }
        }

        Ok(response)
    }

    fn build_post_request(
        &self,
        body: &Value,
        include_session: bool,
        bearer_override: Option<&str>,
    ) -> Result<RequestBuilder, String> {
        let mut request = self
            .client
            .post(&self.endpoint)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header(MCP_PROTOCOL_VERSION_HEADER, self.protocol_version.as_str())
            .json(body);

        if include_session {
            if let Some(session_id) = self.mcp_session_id.as_deref() {
                request = request.header(MCP_SESSION_ID_HEADER, session_id);
            }
        }

        for (key, value) in &self.headers {
            if key.eq_ignore_ascii_case("authorization") {
                continue;
            }
            if let Ok(name) = HeaderName::from_str(key) {
                if let Ok(header_value) = HeaderValue::from_str(value) {
                    request = request.header(name, header_value);
                }
            }
        }

        if let Some(token) = bearer_override
            .map(str::to_string)
            .or_else(|| self.resolve_bearer_token())
        {
            request = request.header("Authorization", format!("Bearer {token}"));
        } else if let Some(value) = self.config_authorization_header() {
            request = request.header("Authorization", value);
        }

        Ok(request)
    }

    fn config_authorization_header(&self) -> Option<String> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case("authorization"))
            .map(|(_, value)| value.as_str())
            .and_then(usable_authorization_header)
    }

    fn resolve_bearer_token(&self) -> Option<String> {
        let auth = self.auth.as_ref()?;
        auth.oauth
            .bearer_token_for_server(&auth.server)
            .ok()
            .flatten()
            .filter(|token| !token.is_empty())
    }
}

impl Drop for RemoteMcpIo {
    fn drop(&mut self) {
        self.terminate_session();
    }
}

fn normalize_mcp_endpoint(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.len() > 1 && trimmed.ends_with('/') {
        trimmed.trim_end_matches('/').to_string()
    } else {
        trimmed.to_string()
    }
}

fn capture_session_from_response(response: &Response, target: &mut Option<String>) {
    if let Some(session_id) = read_header_value(response.headers(), MCP_SESSION_ID_HEADER) {
        *target = Some(session_id);
    }
}

fn read_header_value(headers: &HeaderMap, expected: &str) -> Option<String> {
    if let Some(value) = headers.get(expected) {
        return value.to_str().ok().map(str::trim).filter(|text| !text.is_empty()).map(str::to_string);
    }
    headers.iter().find_map(|(name, value)| {
        if name.as_str().eq_ignore_ascii_case(expected) {
            value
                .to_str()
                .ok()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        } else {
            None
        }
    })
}

fn read_error_body(response: Response) -> String {
    response
        .text()
        .ok()
        .map(|text| text.trim().chars().take(400).collect::<String>())
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| "(empty body)".to_string())
}

fn parse_json_rpc_http_body(response: Response) -> Result<Value, String> {
    if !response.status().is_success() {
        let status = response.status();
        let detail = read_error_body(response);
        return Err(format!("remote MCP HTTP {status}: {detail}"));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    if content_type.contains("text/event-stream") {
        let text = response
            .text()
            .map_err(|error| format!("failed to read MCP SSE response: {error}"))?;
        return parse_sse_json_rpc(&text);
    }

    response
        .json::<Value>()
        .map_err(|error| format!("invalid JSON from remote MCP: {error}"))
}

fn parse_sse_json_rpc(body: &str) -> Result<Value, String> {
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data:") {
            let payload = data.trim();
            if payload.is_empty() {
                continue;
            }
            if let Ok(value) = serde_json::from_str::<Value>(payload) {
                return Ok(value);
            }
        }
    }
    Err("no JSON-RPC payload found in MCP SSE response".to_string())
}

fn parse_tools_list_response(response: Value) -> Result<Vec<McpToolInfo>, String> {
    if let Some(error) = response.get("error") {
        return Err(format_json_rpc_failure(
            "tools/list",
            &json!({"error": error}),
        ));
    }

    let tools = response
        .pointer("/result/tools")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    tools
        .into_iter()
        .map(|tool| {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let description = tool
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let input_schema = tool.get("inputSchema").cloned();
            Ok(McpToolInfo {
                name,
                description,
                input_schema,
            })
        })
        .collect()
}

fn usable_authorization_header(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains("${") {
        return None;
    }
    if let Some(token) = trimmed
        .strip_prefix("Bearer ")
        .or_else(|| trimmed.strip_prefix("bearer "))
    {
        if token.trim().is_empty() {
            return None;
        }
    }
    Some(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_trailing_slash_on_mcp_endpoint() {
        assert_eq!(
            normalize_mcp_endpoint("https://borealhost.ai/mcp/"),
            "https://borealhost.ai/mcp"
        );
        assert_eq!(
            normalize_mcp_endpoint("https://test.alpic.ai/"),
            "https://test.alpic.ai"
        );
    }
}
