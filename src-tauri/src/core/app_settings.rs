use crate::core::fs::{ensure_user_storage_dir, user_storage_dir};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

const SETTINGS_FILE: &str = "app_config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "useOsKeyring", default)]
    pub use_os_keyring: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            use_os_keyring: false,
        }
    }
}

static SETTINGS_CACHE: RwLock<Option<AppSettings>> = RwLock::new(None);

pub fn app_settings_path() -> PathBuf {
    user_storage_dir().join(SETTINGS_FILE)
}

pub fn use_os_keyring_enabled() -> AppResult<bool> {
    Ok(current_settings()?.use_os_keyring)
}

pub fn set_use_os_keyring_enabled(enabled: bool) -> AppResult<()> {
    let mut settings = current_settings()?;
    if settings.use_os_keyring == enabled {
        return Ok(());
    }
    settings.use_os_keyring = enabled;
    save_app_settings(&settings)?;
    if let Ok(mut cache) = SETTINGS_CACHE.write() {
        *cache = Some(settings);
    }
    Ok(())
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
        let settings = detect_initial_settings();
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

fn save_app_settings(settings: &AppSettings) -> AppResult<()> {
    ensure_user_storage_dir().map_err(|error| {
        AppError::Message(format!("failed to create user storage: {error}"))
    })?;
    let path = app_settings_path();
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|error| AppError::Message(format!("failed to encode app settings: {error}")))?;
    fs::write(&path, raw)
        .map_err(|error| AppError::Message(format!("failed to write app settings: {error}")))
}

fn detect_initial_settings() -> AppSettings {
    AppSettings::default()
}
