use crate::error::AppResult;
use crate::services::{UsageLogEntry, UsageLogStore};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn usage_list_entries(
    usage_log: State<'_, Arc<UsageLogStore>>,
    limit: Option<usize>,
) -> AppResult<Vec<UsageLogEntry>> {
    Ok(usage_log.list(limit))
}
