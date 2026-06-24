use crate::core::fs::user_database_path;
use crate::db::Database;
use crate::error::AppResult;
use crate::services::{ProjectDiskQueue, TopologyRunStatus, TopologyRunStore, McpToolsStore, UsageLogStore};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn topology_start(
    store: State<'_, Arc<McpToolsStore>>,
    run_store: State<'_, Arc<TopologyRunStore>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    usage_log: State<'_, Arc<UsageLogStore>>,
    client_id: String,
    name: String,
) -> AppResult<TopologyRunStatus> {
    let store = Arc::clone(store.inner());
    let run_store = Arc::clone(run_store.inner());
    let disk_queue = Arc::clone(disk_queue.inner());
    let usage_log = Arc::clone(usage_log.inner());

    tauri::async_runtime::spawn_blocking(move || {
        let db = Database::open(&user_database_path())
            .map_err(|error| format!("failed to open database: {error}"))?;
        run_store
            .start(&db, disk_queue.as_ref(), store, usage_log, &client_id, &name)
            .map_err(|error| error)
    })
    .await
    .map_err(|error| crate::error::AppError::Message(format!("topology_start task failed: {error}")))?
    .map_err(crate::error::AppError::Message)
}

#[tauri::command]
pub async fn topology_stop(
    run_store: State<'_, Arc<TopologyRunStore>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    client_id: String,
    name: String,
) -> AppResult<bool> {
    let run_store = Arc::clone(run_store.inner());
    let disk_queue = Arc::clone(disk_queue.inner());

    tauri::async_runtime::spawn_blocking(move || {
        let db = Database::open(&user_database_path())
            .map_err(|error| format!("failed to open database: {error}"))?;
        run_store
            .stop(&db, disk_queue.as_ref(), &client_id, &name)
            .map(|_| true)
            .map_err(|error| error)
    })
    .await
    .map_err(|error| crate::error::AppError::Message(format!("topology_stop task failed: {error}")))?
    .map_err(crate::error::AppError::Message)
}

#[tauri::command]
pub fn topology_get_status(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    run_store: State<'_, Arc<TopologyRunStore>>,
    client_id: String,
    name: String,
) -> AppResult<TopologyRunStatus> {
    run_store
        .status(&db, store.inner(), &client_id, &name)
        .map_err(crate::error::AppError::Message)
}
