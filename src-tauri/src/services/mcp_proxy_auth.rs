use crate::core::fs::oauth_runtime_token_path;
use crate::db::McpServer;
use crate::services::OAuthStore;
use std::fs;
use std::path::PathBuf;

/// Writes a fresh bearer token for proxy.mjs. Token lives in app storage, not the project tree.
pub fn sync_oauth_runtime_token(
    oauth: &OAuthStore,
    server: &McpServer,
) -> Result<Option<PathBuf>, String> {
    let path = oauth_runtime_token_path(server.id);
    let token = oauth
        .bearer_token_for_server(server)
        .map_err(|error| error.to_string())?
        .unwrap_or_default()
        .trim()
        .to_string();

    if token.is_empty() {
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
        return Ok(None);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, &token).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }

    Ok(Some(path))
}
