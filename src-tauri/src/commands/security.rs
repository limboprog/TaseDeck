use crate::error::AppResult;
use crate::services::security::{self, ensure_initialized};

#[tauri::command]
pub fn security_initialize() -> AppResult<()> {
    ensure_initialized()
}

#[tauri::command]
pub fn security_mask_secret(value: String) -> AppResult<String> {
    ensure_initialized()?;
    Ok(security::mask_secret(&value))
}
