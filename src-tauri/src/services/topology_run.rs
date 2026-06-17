use crate::agents::mcp_json::sync_topology_mcp_json_for_graph;
use crate::core::fs::user_database_path;
use crate::db::mcp_config::is_mcp_server_configured;
use crate::db::{Database, GraphServerLink};
use crate::services::{mcp_server_for_runtime, McpToolsStore, TASEDECK_MCP_NAME, UsageLogStore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyServerInfo {
    pub id: i64,
    pub name: String,
    pub running: bool,
    pub tool_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyAggregatorConfig {
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyRunStatus {
    pub client_id: String,
    pub running: bool,
    pub active_servers: Vec<TopologyServerInfo>,
    pub focused_server_id: Option<i64>,
    pub aggregator: Option<TopologyAggregatorConfig>,
    pub bridge_port: Option<u16>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mcp_json_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

struct RunningTopology {
    bridge_port: u16,
    shutdown: Arc<AtomicBool>,
    bridge_thread: JoinHandle<()>,
}

#[derive(Clone)]
struct BridgeContext {
    client_id: String,
    graph_name: String,
    store: Arc<McpToolsStore>,
    usage_log: Arc<UsageLogStore>,
}

pub struct TopologyRunStore {
    runs: Mutex<HashMap<String, RunningTopology>>,
}

impl TopologyRunStore {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn start(
        &self,
        db: &Database,
        store: Arc<McpToolsStore>,
        usage_log: Arc<UsageLogStore>,
        client_id: &str,
        name: &str,
    ) -> Result<TopologyRunStatus, String> {
        let client_id = client_id.trim();
        if client_id.is_empty() {
            return Err("client_id must not be empty".to_string());
        }

        self.stop(db, client_id, name)?;

        let graph_state = db
            .get_graph_state_by_client_id(client_id, name)
            .map_err(|error| error.to_string())?;

        let active_ids = active_mcp_server_ids(&graph_state.links);
        ensure_active_servers(db, store.as_ref(), &active_ids)?;

        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|error| format!("failed to bind topology bridge: {error}"))?;
        let bridge_port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();

        let shutdown = Arc::new(AtomicBool::new(false));
        let ctx = BridgeContext {
            client_id: client_id.to_string(),
            graph_name: name.to_string(),
            store,
            usage_log,
        };

        let store_for_status = Arc::clone(&ctx.store);
        let bridge_thread = spawn_bridge(listener, Arc::clone(&shutdown), ctx);

        let run = RunningTopology {
            bridge_port,
            shutdown,
            bridge_thread,
        };

        self.runs
            .lock()
            .map_err(|_| "topology run store lock poisoned".to_string())?
            .insert(client_id.to_string(), run);

        let aggregator = build_aggregator_config(client_id, bridge_port);
        let mcp_json_paths =
            sync_topology_mcp_json_for_graph(db, client_id, name, Some(&aggregator))
                .unwrap_or_default();

        let mut status = status_for(
            db,
            store_for_status.as_ref(),
            self,
            client_id,
            name,
            true,
            Some(bridge_port),
            None,
        )?;
        status.mcp_json_paths = mcp_json_paths;
        Ok(status)
    }

    pub fn stop(&self, db: &Database, client_id: &str, name: &str) -> Result<(), String> {
        let client_id = client_id.trim();
        let _ = sync_topology_mcp_json_for_graph(db, client_id, name, None);
        let Some(mut run) = self
            .runs
            .lock()
            .map_err(|_| "topology run store lock poisoned".to_string())?
            .remove(client_id)
        else {
            return Ok(());
        };

        run.shutdown.store(true, Ordering::Relaxed);
        let _ = run.bridge_thread.join();
        Ok(())
    }

    pub fn status(
        &self,
        db: &Database,
        store: &McpToolsStore,
        client_id: &str,
        name: &str,
    ) -> Result<TopologyRunStatus, String> {
        let running = self
            .runs
            .lock()
            .map(|runs| runs.contains_key(client_id))
            .unwrap_or(false);

        let bridge_port = self
            .runs
            .lock()
            .ok()
            .and_then(|runs| runs.get(client_id).map(|run| run.bridge_port));

        status_for(
            db,
            store,
            self,
            client_id,
            name,
            running,
            bridge_port,
            None,
        )
    }

    pub fn refresh_if_running(
        &self,
        db: &Database,
        store: &McpToolsStore,
        client_id: &str,
        name: &str,
    ) {
        let is_running = self
            .runs
            .lock()
            .map(|runs| runs.contains_key(client_id))
            .unwrap_or(false);
        if !is_running {
            return;
        }

        if let Ok(graph_state) = db.get_graph_state_by_client_id(client_id, name) {
            let active_ids = active_mcp_server_ids(&graph_state.links);
            let _ = ensure_active_servers(db, store, &active_ids);
        }
    }
}

fn status_for(
    db: &Database,
    store: &McpToolsStore,
    run_store: &TopologyRunStore,
    client_id: &str,
    name: &str,
    running: bool,
    bridge_port: Option<u16>,
    error: Option<String>,
) -> Result<TopologyRunStatus, String> {
    let graph_state = db
        .get_graph_state_by_client_id(client_id, name)
        .map_err(|err| err.to_string())?;

    let active_ids = active_mcp_server_ids(&graph_state.links);
    let focused_server_id = db
        .get_topology_focused_server(graph_state.graph.id)
        .map_err(|err| err.to_string())?;

    let active_servers = active_ids
        .iter()
        .filter_map(|server_id| server_info(db, store, *server_id))
        .collect();

    let aggregator = bridge_port.map(|port| build_aggregator_config(client_id, port));

    Ok(TopologyRunStatus {
        client_id: client_id.to_string(),
        running,
        active_servers,
        focused_server_id,
        aggregator,
        bridge_port,
        mcp_json_paths: Vec::new(),
        error,
    })
}

fn active_mcp_server_ids(links: &[GraphServerLink]) -> Vec<i64> {
    let mut ids = links
        .iter()
        .filter(|link| link.active && link.edge_enabled)
        .map(|link| link.mcp_server_id)
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    ids
}

fn ensure_active_servers(
    db: &Database,
    store: &McpToolsStore,
    server_ids: &[i64],
) -> Result<(), String> {
    for server_id in server_ids {
        let server = db
            .get_mcp_server(*server_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("MCP server {server_id} not found"))?;

        if !is_mcp_server_configured(&server) {
            return Err(format!(
                "MCP server \"{}\" is not fully configured",
                server.name
            ));
        }

        if store.get_tools(*server_id).is_none() {
            let runtime_server =
                mcp_server_for_runtime(&server).map_err(|error| error.to_string())?;
            store.register_server(&runtime_server);
        }

        let snapshot = store
            .get_tools(*server_id)
            .ok_or_else(|| format!("failed to start MCP server \"{}\"", server.name))?;

        if let Some(error) = snapshot.error {
            return Err(error);
        }
    }

    Ok(())
}

fn server_info(db: &Database, store: &McpToolsStore, server_id: i64) -> Option<TopologyServerInfo> {
    let server = db.get_mcp_server(server_id).ok()??;
    let snapshot = store.get_tools(server_id);
    Some(TopologyServerInfo {
        id: server.id,
        name: server.name,
        running: store.is_running(server_id),
        tool_count: snapshot.as_ref().map(|entry| entry.tools.len()).unwrap_or(0),
    })
}

fn build_aggregator_config(client_id: &str, bridge_port: u16) -> TopologyAggregatorConfig {
    let script = aggregator_script_path().display().to_string();
    let mut env = HashMap::new();
    env.insert("TASEDECK_BRIDGE_HOST".to_string(), "127.0.0.1".to_string());
    env.insert("TASEDECK_BRIDGE_PORT".to_string(), bridge_port.to_string());
    env.insert("TASEDECK_TOPOLOGY_ID".to_string(), client_id.to_string());

    TopologyAggregatorConfig {
        command: "node".to_string(),
        args: vec![script],
        env,
    }
}

fn aggregator_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/topology_aggregator.mjs")
}

fn spawn_bridge(
    listener: TcpListener,
    shutdown: Arc<AtomicBool>,
    ctx: BridgeContext,
) -> JoinHandle<()> {
    listener
        .set_nonblocking(true)
        .expect("failed to set bridge listener nonblocking");

    thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let ctx = ctx.clone();
                    thread::spawn(move || {
                        let _ = handle_bridge_client(stream, ctx);
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
    })
}

#[derive(Debug, Deserialize)]
struct BridgeRequest {
    id: u64,
    op: String,
    #[serde(default, rename = "serverId")]
    server_id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<Value>,
}

fn handle_bridge_client(mut stream: TcpStream, ctx: BridgeContext) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;

    let mut reader = BufReader::new(stream.try_clone().map_err(|error| error.to_string())?);
    let mut line = String::new();

    while reader.read_line(&mut line).map_err(|error| error.to_string())? > 0 {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            line.clear();
            continue;
        }

        let response = match serde_json::from_str::<BridgeRequest>(trimmed) {
            Ok(request) => handle_bridge_request(&ctx, request),
            Err(error) => json!({
                "ok": false,
                "error": format!("invalid bridge request: {error}")
            }),
        };

        let mut stream = stream.try_clone().map_err(|error| error.to_string())?;
        serde_json::to_writer(&mut stream, &response)
            .map_err(|error| error.to_string())?;
        stream.write_all(b"\n").map_err(|error| error.to_string())?;
        line.clear();
    }

    Ok(())
}

fn handle_bridge_request(ctx: &BridgeContext, request: BridgeRequest) -> Value {
    let (result, mcp_name, tool_name) = match request.op.as_str() {
        "list_servers" => (
            handle_list_servers(ctx),
            TASEDECK_MCP_NAME.to_string(),
            "list_servers".to_string(),
        ),
        "tools" => match request.server_id {
            Some(server_id) => {
                let mcp_name =
                    mcp_server_name(server_id).unwrap_or_else(|| format!("MCP #{server_id}"));
                (
                    handle_tools(ctx, server_id),
                    mcp_name,
                    "tools".to_string(),
                )
            }
            None => (
                Err("serverId is required for tools".to_string()),
                TASEDECK_MCP_NAME.to_string(),
                "tools".to_string(),
            ),
        },
        "call_tool" => {
            let server_id = match request.server_id {
                Some(server_id) => server_id,
                None => {
                    let error = "serverId is required for call_tool";
                    ctx.usage_log
                        .record_error(TASEDECK_MCP_NAME, "call_tool", error);
                    return json!({
                        "id": request.id,
                        "ok": false,
                        "error": error,
                    });
                }
            };
            let name = match request
                .name
                .filter(|value| !value.trim().is_empty())
            {
                Some(name) => name,
                None => {
                    let error = "name is required for call_tool";
                    ctx.usage_log.record_error(
                        mcp_server_name(server_id).unwrap_or_else(|| format!("MCP #{server_id}")),
                        "call_tool",
                        error,
                    );
                    return json!({
                        "id": request.id,
                        "ok": false,
                        "error": error,
                    });
                }
            };
            let arguments = request.arguments.unwrap_or_else(|| json!({}));
            let mcp_name = mcp_server_name(server_id).unwrap_or_else(|| format!("MCP #{server_id}"));
            (
                handle_call_tool(ctx, server_id, &name, arguments),
                mcp_name,
                name,
            )
        }
        other => (
            Err(format!("unknown bridge op: {other}")),
            TASEDECK_MCP_NAME.to_string(),
            other.to_string(),
        ),
    };

    match &result {
        Ok(value) => ctx.usage_log.record_success(&mcp_name, &tool_name, value),
        Err(error) => ctx.usage_log.record_error(&mcp_name, &tool_name, error),
    }

    match result {
        Ok(value) => json!({
            "id": request.id,
            "ok": true,
            "result": value,
        }),
        Err(error) => json!({
            "id": request.id,
            "ok": false,
            "error": error,
        }),
    }
}

fn mcp_server_name(server_id: i64) -> Option<String> {
    with_database(|db| {
        Ok(db
            .get_mcp_server(server_id)
            .ok()
            .flatten()
            .map(|server| server.name))
    })
    .ok()
    .flatten()
}

fn with_database<F, T>(operation: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let db = Database::open(&user_database_path()).map_err(|error| error.to_string())?;
    operation(&db)
}

fn handle_list_servers(ctx: &BridgeContext) -> Result<Value, String> {
    with_database(|db| {
        let graph_state = db
            .get_graph_state_by_client_id(&ctx.client_id, &ctx.graph_name)
            .map_err(|error| error.to_string())?;

        let active_ids = active_mcp_server_ids(&graph_state.links);
        ensure_active_servers(db, ctx.store.as_ref(), &active_ids)?;

        let servers = active_ids
            .iter()
            .filter_map(|server_id| server_json(db, ctx.store.as_ref(), *server_id))
            .collect::<Vec<_>>();

        Ok(json!({ "servers": servers }))
    })
}

fn handle_tools(ctx: &BridgeContext, server_id: i64) -> Result<Value, String> {
    with_database(|db| {
        let graph_state = db
            .get_graph_state_by_client_id(&ctx.client_id, &ctx.graph_name)
            .map_err(|error| error.to_string())?;

        let active_ids = active_mcp_server_ids(&graph_state.links);
        if !active_ids.contains(&server_id) {
            return Err(format!("MCP server {server_id} is not active in this topology"));
        }

        db.set_topology_focused_server(graph_state.graph.id, server_id)
            .map_err(|error| error.to_string())?;

        let server = db
            .get_mcp_server(server_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("MCP server {server_id} not found"))?;

        if ctx.store.get_tools(server_id).is_none() {
            let runtime_server =
                mcp_server_for_runtime(&server).map_err(|error| error.to_string())?;
            ctx.store.register_server(&runtime_server);
        }

        let snapshot = ctx
            .store
            .get_tools(server_id)
            .ok_or_else(|| format!("MCP server \"{}\" is not running", server.name))?;

        if let Some(error) = snapshot.error {
            return Err(error);
        }

        Ok(json!({
            "serverId": server_id,
            "serverName": snapshot.server_name,
            "tools": snapshot.tools,
            "focused": true,
        }))
    })
}

fn handle_call_tool(
    ctx: &BridgeContext,
    server_id: i64,
    tool_name: &str,
    arguments: Value,
) -> Result<Value, String> {
    with_database(|db| {
        let graph_state = db
            .get_graph_state_by_client_id(&ctx.client_id, &ctx.graph_name)
            .map_err(|error| error.to_string())?;

        let active_ids = active_mcp_server_ids(&graph_state.links);
        if !active_ids.contains(&server_id) {
            return Err(format!("MCP server {server_id} is not active in this topology"));
        }

        db.set_topology_focused_server(graph_state.graph.id, server_id)
            .map_err(|error| error.to_string())?;

        let result = ctx
            .store
            .call_tool(server_id, tool_name, arguments)?;

        Ok(json!({
            "serverId": server_id,
            "toolName": tool_name,
            "result": result,
        }))
    })
}

fn server_json(db: &Database, store: &McpToolsStore, server_id: i64) -> Option<Value> {
    let server = db.get_mcp_server(server_id).ok()??;
    let snapshot = store.get_tools(server_id);
    Some(json!({
        "id": server.id,
        "name": server.name,
        "running": store.is_running(server_id),
        "toolCount": snapshot.as_ref().map(|entry| entry.tools.len()).unwrap_or(0),
        "error": snapshot.and_then(|entry| entry.error),
    }))
}
