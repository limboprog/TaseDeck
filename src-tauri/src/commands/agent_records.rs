use crate::agents::mcp_json::{
    agent_mcp_config_path, read_agent_mcp_config_as_json, topology_mcp_entry_key,
    write_mcp_json_value,
};
use crate::db::{AgentRecord, Database};
use crate::error::AppResult;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn agent_record_list(db: State<'_, Arc<Database>>) -> AppResult<Vec<AgentRecord>> {
    Ok(db.list_agent_records()?)
}

#[tauri::command]
pub fn agent_record_get(db: State<'_, Arc<Database>>, id: i64) -> AppResult<Option<AgentRecord>> {
    Ok(db.get_agent_record(id)?)
}

#[tauri::command]
pub fn agent_record_create(db: State<'_, Arc<Database>>, agent: AgentRecord) -> AppResult<AgentRecord> {
    Ok(db.insert_agent_record(&agent)?)
}

#[tauri::command]
pub fn agent_record_update(db: State<'_, Arc<Database>>, agent: AgentRecord) -> AppResult<AgentRecord> {
    Ok(db.update_agent_record(&agent)?)
}

#[tauri::command]
pub fn agent_record_delete(db: State<'_, Arc<Database>>, id: i64) -> AppResult<bool> {
    Ok(db.delete_agent_record(id)?)
}

#[tauri::command]
pub fn agent_record_read_mcp_json(
    db: State<'_, Arc<Database>>,
    id: i64,
) -> AppResult<Option<Value>> {
    let agent = db
        .get_agent_record(id)?
        .ok_or_else(|| crate::error::AppError::Message(format!("agent {id} not found")))?;
    let path = agent_mcp_config_path(&agent);
    read_agent_mcp_config_as_json(&path, agent.kind.trim())
        .map_err(crate::error::AppError::Message)
}

#[tauri::command]
pub fn agent_record_write_mcp_json(
    db: State<'_, Arc<Database>>,
    id: i64,
    root: Value,
) -> AppResult<String> {
    let agent = db
        .get_agent_record(id)?
        .ok_or_else(|| crate::error::AppError::Message(format!("agent {id} not found")))?;
    let path = agent_mcp_config_path(&agent);
    write_mcp_json_value(&path, &root).map_err(crate::error::AppError::Message)?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn topology_aggregator_script_path() -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/topology_aggregator.mjs")
        .display()
        .to_string()
}

#[tauri::command]
pub fn topology_proxy_script_path() -> String {
    crate::services::proxy_script_path().display().to_string()
}

#[tauri::command]
pub fn topology_mcp_server_key(_client_id: String) -> String {
    topology_mcp_entry_key("")
}
