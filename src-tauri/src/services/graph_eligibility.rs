use crate::agents::resolve::is_config_dir_valid;
use crate::db::mcp_config::can_attempt_mcp_tools;
use crate::db::{AgentRecord, Database, McpServer};
use crate::error::AppResult;
use crate::services::{mcp_server_for_runtime, McpServerToolsSnapshot, McpToolsStore};

pub fn filter_graph_eligible_agents(agents: Vec<AgentRecord>) -> Vec<AgentRecord> {
    agents
        .into_iter()
        .filter(|agent| agent.id > 0 && is_config_dir_valid(&agent.config_dir_path))
        .collect()
}

pub fn mcp_handshake_ok(snapshot: &McpServerToolsSnapshot) -> bool {
    snapshot.error.is_none()
}

pub fn ensure_mcp_handshake(
    store: &McpToolsStore,
    server: &McpServer,
) -> Option<McpServerToolsSnapshot> {
    if !can_attempt_mcp_tools(server) {
        return Some(McpServerToolsSnapshot {
            server_id: server.id,
            server_name: server.name.clone(),
            tools: Vec::new(),
            error: Some("Server is not ready to connect".to_string()),
        });
    }

    if let Some(snapshot) = store.get_tools(server.id) {
        if mcp_handshake_ok(&snapshot) {
            return Some(snapshot);
        }
    }

    if let Ok(runtime_server) = mcp_server_for_runtime(server) {
        store.register_server(&runtime_server);
    }
    store.get_tools(server.id)
}

pub fn is_mcp_graph_eligible(snapshot: &McpServerToolsSnapshot) -> bool {
    mcp_handshake_ok(snapshot)
}

pub fn validate_graph_links(
    db: &Database,
    _store: &McpToolsStore,
    links: &[crate::db::GraphLinkInput],
) -> AppResult<()> {
    for link in links {
        let agent = db
            .get_agent_record(link.agent_id)?
            .ok_or_else(|| {
                crate::error::AppError::Message(format!(
                    "agent {} not found for graph link",
                    link.agent_id
                ))
            })?;
        if !is_config_dir_valid(&agent.config_dir_path) {
            return Err(crate::error::AppError::Message(format!(
                "agent \"{}\" has no verified config path",
                agent.name
            )));
        }

        let server = db
            .get_mcp_server(link.mcp_server_id)?
            .ok_or_else(|| {
                crate::error::AppError::Message(format!(
                    "MCP server {} not found for graph link",
                    link.mcp_server_id
                ))
            })?;

        if !can_attempt_mcp_tools(&server) {
            return Err(crate::error::AppError::Message(format!(
                "MCP server \"{}\" cannot be started yet (missing run command or URL)",
                server.name
            )));
        }
    }
    Ok(())
}

/// Returns MCP ids that can be started (runnable config). Connection is checked separately.
pub fn list_graph_runnable_mcp_ids(db: &Database) -> AppResult<Vec<i64>> {
    Ok(db
        .list_mcp_servers()?
        .into_iter()
        .filter(|server| server.id > 0 && can_attempt_mcp_tools(server))
        .map(|server| server.id)
        .collect())
}

/// Returns MCP ids with a successful cached handshake (does not block on fresh connects).
pub fn list_graph_eligible_mcp_ids(
    db: &Database,
    store: &McpToolsStore,
) -> AppResult<Vec<i64>> {
    Ok(db
        .list_mcp_servers()?
        .into_iter()
        .filter(|server| {
            server.id > 0
                && can_attempt_mcp_tools(server)
                && store
                    .get_tools(server.id)
                    .is_some_and(|snapshot| is_mcp_graph_eligible(&snapshot))
        })
        .map(|server| server.id)
        .collect())
}
