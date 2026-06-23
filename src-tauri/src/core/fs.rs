use std::path::PathBuf;

const APP_DIR_NAME: &str = "TaseDeck";

/// Application support root, e.g. macOS `~/Library/Application Support/TaseDeck`.
pub fn app_support_dir() -> PathBuf {
    platform_data_dir().join(APP_DIR_NAME)
}

/// Per-user storage root: `{app_support}/User/Storage`.
pub fn user_storage_dir() -> PathBuf {
    app_support_dir().join("User").join("Storage")
}

/// SQLite database file path inside user storage.
pub fn user_database_path() -> PathBuf {
    user_storage_dir().join("mcp.db")
}

/// Transient proxy tool-call spool (ingested into SQLite, not stored in project folders).
pub fn proxy_spool_dir() -> PathBuf {
    user_storage_dir().join("proxy-spool")
}

/// Short-lived OAuth bearer tokens for proxy sidecars (not stored in project folders).
pub fn oauth_runtime_token_path(server_id: i64) -> PathBuf {
    oauth_runtime_dir().join(format!("{server_id}.token"))
}

/// Proxy touches this file to ask TaseDeck to refresh the runtime OAuth token.
pub fn oauth_runtime_refresh_request_path(server_id: i64) -> PathBuf {
    oauth_runtime_dir().join(format!("{server_id}.refresh"))
}

pub fn oauth_runtime_dir() -> PathBuf {
    user_storage_dir().join("oauth-runtime")
}

/// Local master encryption key file (used when OS keyring is disabled).
pub fn master_key_file_path() -> PathBuf {
    user_storage_dir().join("master.key")
}

/// Ensures user storage directory exists and returns its path.
pub fn ensure_user_storage_dir() -> std::io::Result<PathBuf> {
    let dir = user_storage_dir();
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn platform_data_dir() -> PathBuf {
    if let Some(dir) = dirs::data_dir() {
        return dir;
    }

    if let Some(home) = dirs::home_dir() {
        return home.join(".local").join("share");
    }

    PathBuf::from(".")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_storage_is_under_app_support() {
        let storage = user_storage_dir();
        let support = app_support_dir();
        assert!(storage.starts_with(support));
        assert_eq!(storage.file_name().and_then(|n| n.to_str()), Some("Storage"));
    }

    #[test]
    fn database_lives_in_user_storage() {
        let db = user_database_path();
        assert!(db.starts_with(user_storage_dir()));
        assert_eq!(db.file_name().and_then(|n| n.to_str()), Some("mcp.db"));
    }
}
