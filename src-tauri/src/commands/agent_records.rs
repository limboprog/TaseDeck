use crate::db::{AgentRecord, Database};
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn agent_record_list(db: State<'_, Database>) -> AppResult<Vec<AgentRecord>> {
    Ok(db.list_agent_records()?)
}

#[tauri::command]
pub fn agent_record_get(db: State<'_, Database>, id: i64) -> AppResult<Option<AgentRecord>> {
    Ok(db.get_agent_record(id)?)
}

#[tauri::command]
pub fn agent_record_create(db: State<'_, Database>, agent: AgentRecord) -> AppResult<AgentRecord> {
    Ok(db.insert_agent_record(&agent)?)
}

#[tauri::command]
pub fn agent_record_update(db: State<'_, Database>, agent: AgentRecord) -> AppResult<AgentRecord> {
    Ok(db.update_agent_record(&agent)?)
}

#[tauri::command]
pub fn agent_record_delete(db: State<'_, Database>, id: i64) -> AppResult<bool> {
    Ok(db.delete_agent_record(id)?)
}
