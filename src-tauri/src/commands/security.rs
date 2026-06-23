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

#[tauri::command]
pub fn security_get_use_os_keyring() -> AppResult<bool> {
    security::get_use_os_keyring()
}

#[tauri::command]
pub fn security_set_use_os_keyring(enabled: bool) -> AppResult<()> {
    security::set_use_os_keyring(enabled)
}
