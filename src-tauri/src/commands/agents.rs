use crate::agents::{
    list_catalog, provider_for, resolve::resolve_auto_config_path, types::AgentCatalogEntry,
    types::AgentConfigInfo,
};
use crate::agents::types::path_to_string;
use crate::error::AppResult;

#[tauri::command]
pub fn agents_list_catalog() -> Vec<AgentCatalogEntry> {
    list_catalog()
}

#[tauri::command]
pub fn agents_get_config(kind: String) -> AppResult<AgentConfigInfo> {
    let provider = provider_for(&kind)?;
    Ok(provider.resolve_config())
}

#[tauri::command]
pub fn agents_read_mcp_json(kind: String) -> AppResult<Option<serde_json::Value>> {
    let provider = provider_for(&kind)?;
    provider.read_mcp_json()
}

#[tauri::command]
pub fn agents_ensure_mcp_json(kind: String) -> AppResult<String> {
    let provider = provider_for(&kind)?;
    let path = provider.ensure_mcp_json()?;
    Ok(path_to_string(path))
}

/// Resolves default config folder for a supported agent if it exists on disk.
#[tauri::command]
pub fn agents_resolve_auto_path(kind: String) -> AppResult<Option<String>> {
    resolve_auto_config_path(&kind)
}
