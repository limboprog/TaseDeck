use crate::agents::mcp_json::{
    build_proxy_entries_for_agent, sync_topology_mcp_json_for_graph,
};
use crate::db::mcp_config::is_mcp_server_configured;
use crate::db::{Database, GraphServerLink};
use crate::services::project_disk_queue::{enqueue_topology_project_disk_jobs, ProjectDiskQueue};
use crate::services::{McpProxyServerEntry, McpToolsStore, UsageLogStore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyServerInfo {
    pub id: i64,
    pub name: String,
    pub running: bool,
    pub tool_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proxy_servers: Vec<McpProxyServerEntry>,
    pub bridge_port: Option<u16>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mcp_json_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct TopologyRunStore {
    runs: Mutex<HashMap<String, ()>>,
}

impl TopologyRunStore {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(HashMap::new()),
        }
    }

    /// Export proxy sidecars + mcp.json for agents/projects. Does not spawn MCP children.
    pub fn start(
        &self,
        db: &Database,
        disk_queue: &ProjectDiskQueue,
        _store: Arc<McpToolsStore>,
        _usage_log: Arc<UsageLogStore>,
        client_id: &str,
        name: &str,
    ) -> Result<TopologyRunStatus, String> {
        let client_id = client_id.trim();
        if client_id.is_empty() {
            return Err("client_id must not be empty".to_string());
        }

        self.stop(db, disk_queue, client_id, name)?;

        let graph_state = db
            .get_graph_state_by_client_id(client_id, name)
            .map_err(|error| error.to_string())?;

        let active_ids = active_mcp_server_ids(&graph_state.links);
        ensure_servers_configured(db, &active_ids)?;

        let mcp_json_paths =
            sync_topology_mcp_json_for_graph(db, client_id, name, true).unwrap_or_default();
        enqueue_topology_project_disk_jobs(db, disk_queue, client_id, name, true)?;

        self.runs
            .lock()
            .map_err(|_| "topology run store lock poisoned".to_string())?
            .insert(client_id.to_string(), ());

        let proxy_entries = collect_exported_proxy_entries(db, client_id, name)?;
        let mut status = status_for(db, client_id, name, true, None, &proxy_entries)?;
        status.mcp_json_paths = mcp_json_paths;
        Ok(status)
    }

    pub fn stop(
        &self,
        db: &Database,
        disk_queue: &ProjectDiskQueue,
        client_id: &str,
        name: &str,
    ) -> Result<(), String> {
        let client_id = client_id.trim();
        let _ = sync_topology_mcp_json_for_graph(db, client_id, name, false);
        let _ = enqueue_topology_project_disk_jobs(db, disk_queue, client_id, name, false);
        self.runs
            .lock()
            .map_err(|_| "topology run store lock poisoned".to_string())?
            .remove(client_id);
        Ok(())
    }

    pub fn status(
        &self,
        db: &Database,
        _store: &McpToolsStore,
        client_id: &str,
        name: &str,
    ) -> Result<TopologyRunStatus, String> {
        let running = self
            .runs
            .lock()
            .map(|runs| runs.contains_key(client_id))
            .unwrap_or(false);

        let proxy_entries = if running {
            collect_exported_proxy_entries(db, client_id, name).unwrap_or_default()
        } else {
            Vec::new()
        };

        status_for(db, client_id, name, running, None, &proxy_entries)
    }

    pub fn refresh_if_running(
        &self,
        db: &Database,
        disk_queue: &ProjectDiskQueue,
        _store: &McpToolsStore,
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

        let _ = sync_topology_mcp_json_for_graph(db, client_id, name, true);
        let _ = enqueue_topology_project_disk_jobs(db, disk_queue, client_id, name, true);
    }
}

fn status_for(
    db: &Database,
    client_id: &str,
    name: &str,
    running: bool,
    error: Option<String>,
    proxy_entries: &[McpProxyServerEntry],
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
        .filter_map(|server_id| server_info(db, *server_id))
        .collect();

    Ok(TopologyRunStatus {
        client_id: client_id.to_string(),
        running,
        active_servers,
        focused_server_id,
        aggregator: None,
        proxy_servers: proxy_entries.to_vec(),
        bridge_port: None,
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

fn ensure_servers_configured(db: &Database, server_ids: &[i64]) -> Result<(), String> {
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
    }
    Ok(())
}

fn server_info(db: &Database, server_id: i64) -> Option<TopologyServerInfo> {
    let server = db.get_mcp_server(server_id).ok()??;
    let tool_count = db
        .load_mcp_tool_prefs(server_id)
        .map(|prefs| prefs.values().filter(|enabled| **enabled).count())
        .unwrap_or(0);
    Some(TopologyServerInfo {
        id: server.id,
        name: server.name,
        running: false,
        tool_count,
    })
}

fn collect_exported_proxy_entries(
    db: &Database,
    client_id: &str,
    name: &str,
) -> Result<Vec<McpProxyServerEntry>, String> {
    let graph_state = db
        .get_graph_state_by_client_id(client_id, name)
        .map_err(|error| error.to_string())?;

    let mut agent_ids = graph_state
        .links
        .iter()
        .filter(|link| link.edge_enabled)
        .map(|link| link.agent_id)
        .collect::<Vec<_>>();
    agent_ids.sort_unstable();
    agent_ids.dedup();

    let mut entries = Vec::new();
    for agent_id in agent_ids {
        let agent = db
            .get_agent_record(agent_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("agent {agent_id} not found"))?;

        if !crate::agents::is_config_dir_valid(&agent.config_dir_path) {
            continue;
        }

        let base_dir = PathBuf::from(agent.config_dir_path.trim());
        entries.extend(build_proxy_entries_for_agent(
            db,
            client_id,
            name,
            agent_id,
            &base_dir,
            None,
            Some(&agent.name),
        )?);
    }

    Ok(entries)
}
