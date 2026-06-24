use crate::core::fs::{ensure_user_storage_dir, user_storage_dir};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

const SETTINGS_FILE: &str = "app_config.json";

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub use_os_keyring: bool,
    #[serde(default)]
    pub setup_completed: bool,
    #[serde(default = "default_true")]
    pub enable_file_scan: bool,
    #[serde(default = "default_true")]
    pub enable_agent_sync: bool,
    #[serde(default = "default_true")]
    pub enable_tool_index: bool,
    #[serde(default = "default_true")]
    pub enable_log_collection: bool,
    #[serde(default)]
    pub node_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            use_os_keyring: false,
            setup_completed: false,
            enable_file_scan: true,
            enable_agent_sync: true,
            enable_tool_index: true,
            enable_log_collection: true,
            node_path: None,
        }
    }
}

static SETTINGS_CACHE: RwLock<Option<AppSettings>> = RwLock::new(None);

pub fn app_settings_path() -> PathBuf {
    user_storage_dir().join(SETTINGS_FILE)
}

pub fn current_app_settings() -> AppResult<AppSettings> {
    current_settings()
}

pub fn use_os_keyring_enabled() -> AppResult<bool> {
    Ok(current_settings()?.use_os_keyring)
}

pub fn set_use_os_keyring_enabled(enabled: bool) -> AppResult<()> {
    update_settings(|settings| {
        settings.use_os_keyring = enabled;
    })
}

pub fn save_app_settings(settings: &AppSettings) -> AppResult<()> {
    ensure_user_storage_dir().map_err(|error| {
        AppError::Message(format!("failed to create user storage: {error}"))
    })?;
    let path = app_settings_path();
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|error| AppError::Message(format!("failed to encode app settings: {error}")))?;
    crate::core::atomic_write::atomic_write(&path, raw.as_bytes())
        .map_err(|error| AppError::Message(error))?;
    if let Ok(mut cache) = SETTINGS_CACHE.write() {
        *cache = Some(settings.clone());
    }
    Ok(())
}

pub fn update_app_settings(mutator: impl FnOnce(&mut AppSettings)) -> AppResult<AppSettings> {
    update_settings(mutator)?;
    current_settings()
}

fn update_settings(mutator: impl FnOnce(&mut AppSettings)) -> AppResult<()> {
    let mut settings = current_settings()?;
    mutator(&mut settings);
    save_app_settings(&settings)
}

pub fn reload_app_settings() -> AppResult<AppSettings> {
    let settings = load_app_settings_from_disk()?;
    if let Ok(mut cache) = SETTINGS_CACHE.write() {
        *cache = Some(settings.clone());
    }
    Ok(settings)
}

fn current_settings() -> AppResult<AppSettings> {
    if let Ok(cache) = SETTINGS_CACHE.read() {
        if let Some(settings) = cache.as_ref() {
            return Ok(settings.clone());
        }
    }
    reload_app_settings()
}

fn load_app_settings_from_disk() -> AppResult<AppSettings> {
    ensure_user_storage_dir().map_err(|error| {
        AppError::Message(format!("failed to create user storage: {error}"))
    })?;

    let path = app_settings_path();
    if !path.is_file() {
        let settings = AppSettings::default();
        save_app_settings(&settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| AppError::Message(format!("failed to read app settings: {error}")))?;
    if raw.trim().is_empty() {
        return Ok(AppSettings::default());
    }

    serde_json::from_str(&raw)
        .map_err(|error| AppError::Message(format!("invalid app settings JSON: {error}")))
}
