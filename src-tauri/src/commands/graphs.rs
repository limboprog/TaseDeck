use crate::db::{AgentRecord, Database, GraphLinkInput, GraphState};
use crate::error::AppResult;
use crate::services::{
    filter_graph_eligible_agents, list_graph_eligible_mcp_ids, validate_graph_links,
    McpToolsStore, TopologyRunStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn graph_get_state(
    db: State<'_, Database>,
    client_id: String,
    name: String,
) -> AppResult<GraphState> {
    Ok(db.get_graph_state_by_client_id(&client_id, &name)?)
}

#[tauri::command]
pub fn graph_save_links(
    db: State<'_, Database>,
    store: State<'_, Arc<McpToolsStore>>,
    run_store: State<'_, Arc<TopologyRunStore>>,
    client_id: String,
    name: String,
    links: Vec<GraphLinkInput>,
) -> AppResult<GraphState> {
    validate_graph_links(&db, store.inner(), &links)?;
    let state = db.replace_graph_links(&client_id, &name, &links)?;
    run_store.refresh_if_running(&db, store.inner(), &client_id, &name);
    Ok(state)
}

#[tauri::command]
pub fn graph_list_placeable_agents(db: State<'_, Database>) -> AppResult<Vec<AgentRecord>> {
    Ok(db.list_agent_records()?)
}

#[tauri::command]
pub fn graph_list_placeable_mcp_ids(db: State<'_, Database>) -> AppResult<Vec<i64>> {
    list_graph_eligible_mcp_ids(&db)
}

#[tauri::command]
pub fn graph_delete(db: State<'_, Database>, client_id: String) -> AppResult<bool> {
    Ok(db.delete_graph_by_client_id(&client_id)?)
}
