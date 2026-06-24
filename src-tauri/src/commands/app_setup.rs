use crate::core::app_settings::{self, AppSettings};
use crate::core::node_runtime::{
    download_node_lts, clear_node_runtime_cache, node_runtime_status, validate_node_executable,
    NodeRuntimeStatus,
};
use crate::error::AppResult;
use std::path::PathBuf;

#[tauri::command]
pub fn app_get_settings() -> AppResult<AppSettings> {
    app_settings::current_app_settings()
}

#[tauri::command]
pub fn app_save_setup_settings(settings: AppSettings) -> AppResult<AppSettings> {
    app_settings::save_app_settings(&settings)?;
    app_settings::current_app_settings()
}

#[tauri::command]
pub fn app_set_node_path(path: Option<String>) -> AppResult<AppSettings> {
    let settings = app_settings::update_app_settings(|settings| {
        settings.node_path = path
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
    })?;
    clear_node_runtime_cache();
    Ok(settings)
}

#[tauri::command]
pub fn app_get_node_runtime_status() -> AppResult<NodeRuntimeStatus> {
    Ok(node_runtime_status())
}

#[tauri::command]
pub fn app_validate_node_path(path: String) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(crate::error::AppError::Message(
            "Node.js path is empty".to_string(),
        ));
    }
    let candidate = PathBuf::from(trimmed);
    let executable = if candidate.is_file() {
        candidate
    } else {
        candidate.join(if cfg!(windows) { "node.exe" } else { "node" })
    };
    validate_node_executable(&executable).map_err(crate::error::AppError::Message)
}

#[tauri::command]
pub fn app_download_node_runtime() -> AppResult<String> {
    let path = download_node_lts().map_err(crate::error::AppError::Message)?;
    let display = path.display().to_string();
    app_settings::update_app_settings(|settings| {
        settings.node_path = Some(display.clone());
    })?;
    clear_node_runtime_cache();
    Ok(display)
}

#[tauri::command]
pub fn app_complete_initial_setup(settings: AppSettings) -> AppResult<AppSettings> {
    let mut next = settings;
    next.setup_completed = true;
    app_settings::save_app_settings(&next)?;
    app_settings::current_app_settings()
}
