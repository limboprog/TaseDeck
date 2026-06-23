use crate::agents::project_proxy_export::sync_projects_using_server;
use crate::db::Database;
use crate::error::AppResult;
use crate::services::{McpAuthChallenge, McpToolsStore, OAuthStore};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn mcp_oauth_get_challenge(
    oauth: State<'_, Arc<OAuthStore>>,
    db: State<'_, Arc<Database>>,
    server_id: i64,
) -> AppResult<Option<McpAuthChallenge>> {
    let mut challenge = oauth.get_pending_challenge(server_id);

    if let Some(ref mut pending) = challenge {
        if let Some(server) = db.get_mcp_server(server_id)? {
            pending.server_name = server.name;
        }
    }

    Ok(challenge)
}

#[tauri::command]
pub async fn mcp_oauth_start_sign_in(
    oauth: State<'_, Arc<OAuthStore>>,
    server_id: i64,
) -> AppResult<()> {
    let oauth = Arc::clone(oauth.inner());
    tauri::async_runtime::spawn_blocking(move || oauth.start_browser_sign_in(server_id))
        .await
        .map_err(|error| {
            crate::error::AppError::Message(format!("OAuth sign-in task failed: {error}"))
        })?
}

#[tauri::command]
pub fn mcp_oauth_complete(
    oauth: State<'_, Arc<OAuthStore>>,
    db: State<'_, Arc<Database>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
    redirect_url: String,
) -> AppResult<()> {
    oauth.complete_oauth_redirect(server_id, redirect_url.trim())?;
    sync_projects_using_server(
        db.inner(),
        Some(oauth.inner()),
        Some(tools_store.inner()),
        server_id,
    )
    .map_err(|error| {
        crate::error::AppError::Message(format!(
            "OAuth completed but project export failed: {error}"
        ))
    })?;
    Ok(())
}

#[tauri::command]
pub fn mcp_oauth_set_api_key(
    oauth: State<'_, Arc<OAuthStore>>,
    db: State<'_, Arc<Database>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
    api_key: String,
) -> AppResult<()> {
    oauth.set_api_key(server_id, api_key.trim())?;
    sync_projects_using_server(
        db.inner(),
        Some(oauth.inner()),
        Some(tools_store.inner()),
        server_id,
    )
    .map_err(|error| {
        crate::error::AppError::Message(format!(
            "API key saved but project export failed: {error}"
        ))
    })?;
    Ok(())
}
