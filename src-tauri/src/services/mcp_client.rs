use crate::db::McpServer;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PROTOCOL_VERSION: &str = "2024-11-05";
const CLIENT_NAME: &str = "tase-deck";
const CLIENT_VERSION: &str = "0.1.0";
const IO_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerToolsSnapshot {
    pub server_id: i64,
    pub server_name: String,
    pub tools: Vec<McpToolInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

struct McpSessionIo {
    stdin: ChildStdin,
    reader: McpMessageReader<ChildStdout>,
    next_id: u64,
}

struct StoredSession {
    snapshot: McpServerToolsSnapshot,
    child: Option<Child>,
    io: Option<Mutex<McpSessionIo>>,
}

pub struct McpToolsStore {
    sessions: Mutex<HashMap<i64, StoredSession>>,
}

impl McpToolsStore {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_server(&self, server: &McpServer) {
        {
            let Ok(mut sessions) = self.sessions.lock() else {
                return;
            };
            stop_session(&mut sessions, server.id);
        }

        let session = match connect_stdio_session(server) {
            Ok(session) => session,
            Err(error) => StoredSession {
                snapshot: McpServerToolsSnapshot {
                    server_id: server.id,
                    server_name: server.name.clone(),
                    tools: Vec::new(),
                    error: Some(error),
                },
                child: None,
                io: None,
            },
        };

        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(server.id, session);
        }
    }

    pub fn unregister_server(&self, server_id: i64) {
        if let Ok(mut sessions) = self.sessions.lock() {
            stop_session(&mut sessions, server_id);
        }
    }

    pub fn is_running(&self, server_id: i64) -> bool {
        let Ok(sessions) = self.sessions.lock() else {
            return false;
        };
        sessions.get(&server_id).is_some_and(|session| {
            session.io.is_some() && session.snapshot.error.is_none()
        })
    }

    pub fn get_tools(&self, server_id: i64) -> Option<McpServerToolsSnapshot> {
        let sessions = self.sessions.lock().ok()?;
        sessions.get(&server_id).map(|entry| entry.snapshot.clone())
    }

    pub fn list_snapshots(&self) -> Vec<McpServerToolsSnapshot> {
        let Ok(sessions) = self.sessions.lock() else {
            return Vec::new();
        };
        sessions
            .values()
            .map(|entry| entry.snapshot.clone())
            .collect()
    }

    pub fn call_tool(
        &self,
        server_id: i64,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "MCP session store lock poisoned".to_string())?;

        let session = sessions
            .get(&server_id)
            .ok_or_else(|| format!("MCP server {server_id} is not running"))?;

        if session.snapshot.error.is_some() {
            return Err(session
                .snapshot
                .error
                .clone()
                .unwrap_or_else(|| "MCP server session has an error".to_string()));
        }

        let io_mutex = session
            .io
            .as_ref()
            .ok_or_else(|| format!("MCP server {server_id} is not connected"))?;
        let mut io = io_mutex
            .lock()
            .map_err(|_| "MCP session I/O lock poisoned".to_string())?;

        let request_id = io.next_id;
        io.next_id = io.next_id.saturating_add(1);

        let params = json!({
            "name": tool_name,
            "arguments": arguments,
        });

        let response = request_json_io(&mut io, request_id, "tools/call", params)?;

        if let Some(error) = response.get("error") {
            return Err(format!("tools/call failed: {error}"));
        }

        Ok(response
            .get("result")
            .cloned()
            .unwrap_or(Value::Null))
    }

    pub fn refresh_tools_for_server(&self, server_id: i64) -> Result<McpServerToolsSnapshot, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "MCP session store lock poisoned".to_string())?;

        let session = sessions
            .get_mut(&server_id)
            .ok_or_else(|| format!("MCP server {server_id} is not running"))?;

        let io_mutex = session
            .io
            .as_ref()
            .ok_or_else(|| format!("MCP server {server_id} is not connected"))?;
        let mut io = io_mutex
            .lock()
            .map_err(|_| "MCP session I/O lock poisoned".to_string())?;

        let request_id = io.next_id;
        io.next_id = io.next_id.saturating_add(1);

        let response = request_json_io(&mut io, request_id, "tools/list", json!({}))?;

        let tools = parse_tools_list_response(response)?;
        session.snapshot.tools = tools;
        session.snapshot.error = None;
        Ok(session.snapshot.clone())
    }
}

fn stop_session(sessions: &mut HashMap<i64, StoredSession>, server_id: i64) {
    if let Some(mut session) = sessions.remove(&server_id) {
        if let Some(mut child) = session.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Debug, Clone)]
enum Transport {
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    },
    UnsupportedRemote {
        url: String,
        transport_type: String,
    },
}

fn connect_stdio_session(server: &McpServer) -> Result<StoredSession, String> {
    let transport = parse_transport(server)?;
    match transport {
        Transport::Stdio { .. } => {
            let mut child = spawn_mcp_child(server, &transport)?;
            let stdin = child
                .stdin
                .take()
                .ok_or_else(|| "MCP process stdin is not available".to_string())?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "MCP process stdout is not available".to_string())?;

            let mut reader = McpMessageReader::new(stdout);
            let mut io = McpSessionIo {
                stdin,
                reader,
                next_id: 3,
            };

            let tools = match handshake_and_list_tools(&mut io) {
                Ok(tools) => tools,
                Err(error) => {
                    let detail = child_exit_detail(&mut child);
                    return Err(if detail.is_empty() {
                        error
                    } else {
                        format!("{error} ({detail})")
                    });
                }
            };

            Ok(StoredSession {
                snapshot: McpServerToolsSnapshot {
                    server_id: server.id,
                    server_name: server.name.clone(),
                    tools,
                    error: None,
                },
                child: Some(child),
                io: Some(Mutex::new(io)),
            })
        }
        Transport::UnsupportedRemote { url, transport_type } => Err(format!(
            "remote transport {transport_type} ({url}) is not supported yet"
        )),
    }
}

fn parse_transport(server: &McpServer) -> Result<Transport, String> {
    let config_raw = server.json_config.trim();
    if config_raw.is_empty() || config_raw == "{}" {
        return parse_run_command(server);
    }

    let entry = parse_mcp_server_entry(config_raw)?;

    if let Some(url) = entry.get("url").and_then(Value::as_str) {
        let transport_type = entry
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("http")
            .to_string();
        return Ok(Transport::UnsupportedRemote {
            url: url.to_string(),
            transport_type,
        });
    }

    let command = entry
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "mcp server entry has no command".to_string())?
        .to_string();

    let args = entry
        .get("args")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let env = entry
        .get("env")
        .and_then(Value::as_object)
        .map(parse_env_map)
        .unwrap_or_default();

    Ok(Transport::Stdio { command, args, env })
}

fn parse_mcp_server_entry(config_raw: &str) -> Result<Value, String> {
    let parsed: Value =
        serde_json::from_str(config_raw).map_err(|error| format!("invalid json_config: {error}"))?;

    if let Some(servers) = parsed.get("mcpServers").and_then(Value::as_object) {
        return servers
            .values()
            .next()
            .cloned()
            .ok_or_else(|| "json_config has no mcpServers entries".to_string());
    }

    Ok(parsed)
}

fn parse_env_map(map: &serde_json::Map<String, Value>) -> HashMap<String, String> {
    map.iter()
        .filter_map(|(key, value)| env_value_to_string(value).map(|text| (key.clone(), text)))
        .collect()
}

fn env_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn parse_run_command(server: &McpServer) -> Result<Transport, String> {
    let shell = server.run_command.trim();
    if shell.is_empty() {
        return Err("run_command and json_config are empty".to_string());
    }

    #[cfg(windows)]
    {
        Ok(Transport::Stdio {
            command: "cmd".to_string(),
            args: vec!["/C".to_string(), shell.to_string()],
            env: HashMap::new(),
        })
    }
    #[cfg(not(windows))]
    {
        Ok(Transport::Stdio {
            command: "sh".to_string(),
            args: vec!["-c".to_string(), shell.to_string()],
            env: HashMap::new(),
        })
    }
}

fn spawn_mcp_child(server: &McpServer, transport: &Transport) -> Result<Child, String> {
    let Transport::Stdio { command, args, env } = transport else {
        return Err("internal error: expected stdio transport".to_string());
    };

    let shell = server.run_command.trim();
    if !shell.is_empty() {
        return spawn_shell_command(shell, env);
    }

    if Path::new(command).is_absolute() {
        return spawn_direct_process(command, args, env);
    }

    let joined = shell_join(command, args);
    spawn_shell_command(&joined, env)
}

fn shell_join(command: &str, args: &[String]) -> String {
    let mut parts = vec![shell_escape(command)];
    parts.extend(args.iter().map(|arg| shell_escape(arg)));
    parts.join(" ")
}

fn shell_escape(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || "/._-:".contains(ch))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn spawn_shell_command(shell: &str, extra_env: &HashMap<String, String>) -> Result<Child, String> {
    let mut command_builder = shell_command_builder();
    command_builder
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_inherited_env(&mut command_builder);
    for (key, value) in extra_env {
        command_builder.env(key, value);
    }
    command_builder.arg(shell);
    command_builder
        .spawn()
        .map_err(|error| format!("failed to spawn MCP shell process: {error}"))
}

fn spawn_direct_process(
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<Child, String> {
    let mut command_builder = Command::new(command);
    command_builder
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_inherited_env(&mut command_builder);
    for (key, value) in env {
        command_builder.env(key, value);
    }
    command_builder
        .spawn()
        .map_err(|error| format!("failed to spawn MCP process: {error}"))
}

fn shell_command_builder() -> Command {
    #[cfg(windows)]
    {
        let mut command = Command::new("cmd");
        command.arg("/C");
        command
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut command = Command::new(shell);
        command.arg("-l").arg("-c");
        command
    }
}

fn apply_inherited_env(command: &mut Command) {
    command.envs(std::env::vars());
    #[cfg(not(windows))]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            command.env("SHELL", shell);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let path = std::env::var("PATH").unwrap_or_default();
        if !path.contains("/opt/homebrew/bin") || !path.contains("/usr/local/bin") {
            let enriched = format!("/opt/homebrew/bin:/usr/local/bin:{path}");
            command.env("PATH", enriched);
        }
    }
}

fn child_exit_detail(child: &mut Child) -> String {
    let stderr = child
        .stderr
        .as_mut()
        .and_then(|stderr| {
            let mut buffer = String::new();
            stderr.read_to_string(&mut buffer).ok()?;
            Some(buffer)
        })
        .unwrap_or_default();

    let status = child.try_wait().ok().flatten();

    let mut parts = Vec::new();
    if let Some(code) = status.and_then(|value| value.code()) {
        parts.push(format!("exit code {code}"));
    } else if status.map(|value| !value.success()).unwrap_or(false) {
        parts.push("process exited".to_string());
    }

    let stderr = stderr.trim();
    if !stderr.is_empty() {
        let excerpt: String = stderr.chars().take(400).collect();
        parts.push(format!("stderr: {excerpt}"));
    }

    parts.join("; ")
}

struct McpMessageReader<R: Read> {
    inner: BufReader<R>,
    buffer: Vec<u8>,
}

impl<R: Read> McpMessageReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner: BufReader::new(inner),
            buffer: Vec::new(),
        }
    }

    fn read_message(&mut self) -> Result<Value, String> {
        let deadline = Instant::now() + IO_TIMEOUT;

        loop {
            if let Some(message) = try_parse_buffered_message(&mut self.buffer)? {
                return Ok(message);
            }

            if Instant::now() > deadline {
                return Err("timed out waiting for MCP response".to_string());
            }

            let mut chunk = [0u8; 4096];
            let read_bytes = self
                .inner
                .read(&mut chunk)
                .map_err(|error| error.to_string())?;
            if read_bytes == 0 {
                return Err("MCP process closed stdout before a response".to_string());
            }
            self.buffer.extend_from_slice(&chunk[..read_bytes]);
        }
    }
}

fn try_parse_buffered_message(buffer: &mut Vec<u8>) -> Result<Option<Value>, String> {
    if let Some(header_end) = find_content_length_header_end(buffer) {
        let length = parse_content_length(buffer, header_end)?;
        let body_start = header_end;
        let body_end = body_start.saturating_add(length);
        if buffer.len() < body_end {
            return Ok(None);
        }

        let body = &buffer[body_start..body_end];
        let message: Value = serde_json::from_slice(body)
            .map_err(|error| format!("invalid JSON from MCP: {error}"))?;
        buffer.drain(0..body_end);
        return Ok(Some(message));
    }

    if let Some(newline_index) = buffer.iter().position(|byte| *byte == b'\n') {
        let line = buffer[..newline_index].to_vec();
        buffer.drain(0..=newline_index);

        let trimmed = std::str::from_utf8(&line)
            .map_err(|error| error.to_string())?
            .trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let message: Value = serde_json::from_str(trimmed)
            .map_err(|error| format!("invalid JSON from MCP: {error}"))?;
        return Ok(Some(message));
    }

    Ok(None)
}

fn find_content_length_header_end(buffer: &[u8]) -> Option<usize> {
    let prefix = b"Content-Length:";
    if !buffer.starts_with(prefix) {
        return None;
    }
    buffer.windows(4).position(|window| window == b"\r\n\r\n").map(|index| index + 4)
}

fn parse_content_length(buffer: &[u8], header_end: usize) -> Result<usize, String> {
    let header = std::str::from_utf8(&buffer[..header_end.saturating_sub(4)])
        .map_err(|error| error.to_string())?;
    for line in header.lines() {
        if let Some(value) = line.strip_prefix("Content-Length:") {
            return value
                .trim()
                .parse::<usize>()
                .map_err(|error| format!("invalid Content-Length header: {error}"));
        }
    }
    Err("missing Content-Length header".to_string())
}

/// MCP stdio transport uses newline-delimited JSON (one JSON-RPC object per line).
fn write_stdio_message(stdin: &mut impl Write, message: &Value) -> Result<(), String> {
    let payload = serde_json::to_string(message).map_err(|error| error.to_string())?;
    stdin
        .write_all(payload.as_bytes())
        .map_err(|error| error.to_string())?;
    stdin
        .write_all(b"\n")
        .map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

fn handshake_initialize_only(child: &mut Child) -> Result<String, String> {
    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| "MCP process stdin is not available".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "MCP process stdout is not available".to_string())?;

    let mut reader = McpMessageReader::new(stdout);

    let init_params = json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {
            "name": CLIENT_NAME,
            "version": CLIENT_VERSION
        }
    });

    let init_response = request_json(stdin, &mut reader, 1, "initialize", init_params)?;
    if init_response.get("error").is_some() {
        return Err(format!("initialize failed: {}", init_response));
    }

    write_notification(stdin, "notifications/initialized", json!({}))?;

    let server_name = init_response
        .pointer("/result/serverInfo/name")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let protocol = init_response
        .pointer("/result/protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or(PROTOCOL_VERSION);

    Ok(format!("initialize OK — {server_name} (protocol {protocol})"))
}

fn handshake_and_list_tools(io: &mut McpSessionIo) -> Result<Vec<McpToolInfo>, String> {
    let init_params = json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {
            "name": CLIENT_NAME,
            "version": CLIENT_VERSION
        }
    });

    let init_response = request_json_io(io, 1, "initialize", init_params)?;
    if init_response.get("error").is_some() {
        return Err(format!("initialize failed: {}", init_response));
    }

    write_notification(&mut io.stdin, "notifications/initialized", json!({}))?;

    let tools_response = request_json_io(io, 2, "tools/list", json!({}))?;
    parse_tools_list_response(tools_response)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpProbeResult {
    pub success: bool,
    pub result: String,
}

pub fn probe_mcp_operation(server: &McpServer, operation: &str) -> McpProbeResult {
    let transport = match parse_transport(server) {
        Ok(transport) => transport,
        Err(error) => {
            return McpProbeResult {
                success: false,
                result: error,
            };
        }
    };

    match &transport {
        Transport::UnsupportedRemote { url, transport_type } => {
            return McpProbeResult {
                success: false,
                result: format!(
                    "remote transport {transport_type} ({url}) is not supported yet"
                ),
            };
        }
        Transport::Stdio { .. } => {}
    }

    let mut child = match spawn_mcp_child(server, &transport) {
        Ok(child) => child,
        Err(error) => {
            return McpProbeResult {
                success: false,
                result: error,
            };
        }
    };

    let probe_result = match operation {
        "initialize" => handshake_initialize_only(&mut child).map(|summary| summary),
        "tools_list" | "list" => match child.stdin.take() {
            None => Err("MCP process stdin is not available".to_string()),
            Some(stdin) => match child.stdout.take() {
                None => Err("MCP process stdout is not available".to_string()),
                Some(stdout) => {
                    let mut io = McpSessionIo {
                        stdin,
                        reader: McpMessageReader::new(stdout),
                        next_id: 3,
                    };
                    handshake_and_list_tools(&mut io).map(|tools| {
                        if tools.is_empty() {
                            "tools/list OK — 0 tools".to_string()
                        } else {
                            let names: Vec<&str> =
                                tools.iter().map(|tool| tool.name.as_str()).collect();
                            format!("tools/list OK — {} tools: {}", tools.len(), names.join(", "))
                        }
                    })
                }
            },
        },
        _ => Err(format!("unknown probe operation: {operation}")),
    };

    let _ = child.kill();

    match probe_result {
        Ok(result) => McpProbeResult {
            success: true,
            result,
        },
        Err(error) => {
            let detail = child_exit_detail(&mut child);
            McpProbeResult {
                success: false,
                result: if detail.is_empty() {
                    error
                } else {
                    format!("{error} ({detail})")
                },
            }
        }
    }
}

fn request_json(
    stdin: &mut impl Write,
    reader: &mut McpMessageReader<impl Read>,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    write_stdio_message(stdin, &request)?;
    read_response_for_id(reader, id)
}

fn request_json_io(
    io: &mut McpSessionIo,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    write_stdio_message(&mut io.stdin, &request)?;
    read_response_for_id(&mut io.reader, id)
}

fn write_notification(
    stdin: &mut impl Write,
    method: &str,
    params: Value,
) -> Result<(), String> {
    let notification = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    });
    write_stdio_message(stdin, &notification)
}

fn read_response_for_id(reader: &mut McpMessageReader<impl Read>, id: u64) -> Result<Value, String> {
    loop {
        let message = reader.read_message()?;
        if message.get("id").is_none() {
            continue;
        }
        if message_id_matches(&message, id) {
            return Ok(message);
        }
    }
}

fn message_id_matches(message: &Value, id: u64) -> bool {
    message
        .get("id")
        .and_then(|value| value.as_u64().or_else(|| value.as_i64().map(|n| n as u64)))
        == Some(id)
}

fn parse_tools_list_response(response: Value) -> Result<Vec<McpToolInfo>, String> {
    if let Some(error) = response.get("error") {
        return Err(format!("tools/list failed: {error}"));
    }

    let tools = response
        .pointer("/result/tools")
        .or_else(|| response.get("tools"))
        .and_then(Value::as_array)
        .ok_or_else(|| "tools/list response has no tools array".to_string())?;

    let mut parsed = Vec::new();
    for tool in tools {
        let Some(name) = tool.get("name").and_then(Value::as_str) else {
            continue;
        };

        let description = tool
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();

        let input_schema = tool
            .get("inputSchema")
            .or_else(|| tool.get("input_schema"))
            .cloned()
            .filter(|value| !value.is_null());

        parsed.push(McpToolInfo {
            name: name.to_string(),
            description,
            input_schema,
        });
    }

    parsed.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(parsed)
}
