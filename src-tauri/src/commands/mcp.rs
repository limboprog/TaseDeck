use crate::agents::project_proxy_export::schedule_projects_using_server_export;
use crate::core::shell::run_shell_checked;
use crate::db::mcp_config::can_attempt_mcp_tools;
use crate::db::{Database, InstallMcpLocalRequest, McpServer, McpServerType};
use crate::error::AppResult;
use crate::services::{
    analyze_mcp_server, apply_compiled_run_command, build_registry_install_plan,
    compile_run_command_template_from_config_values, list_mcp_run_transports, mcp_server_for_runtime,
    probe_mcp_operation, reveal_config_values_for_api, seal_config_values_for_storage,
    McpProbeResult, McpServerAnalysis, McpServerApi, McpServerToolsSnapshot, McpToolsStore,
    McpTransportCatalogEntry, OAuthStore, ProjectDiskQueue, ProxyLogIngestor, RegistryEntry, RegistryInstallPlan,
    UsageLogStore,
};
use std::sync::Arc;
use tauri::State;

fn server_for_api(mut server: McpServer) -> AppResult<McpServerApi> {
    server.config_values = reveal_config_values_for_api(&server.config_values)?;
    let analysis = analyze_mcp_server(&server)?;
    Ok(McpServerApi { server, analysis })
}

fn server_for_storage(
    mut server: McpServer,
    existing: Option<&McpServer>,
) -> AppResult<McpServer> {
    server.config_values = seal_config_values_for_storage(
        &server.config_values,
        existing.map(|entry| entry.config_values.as_str()),
    )?;
    apply_compiled_run_command(&mut server)?;
    Ok(server)
}

#[tauri::command]
pub fn mcp_list_servers(db: State<'_, Arc<Database>>) -> AppResult<Vec<McpServerApi>> {
    let servers = db.list_mcp_servers()?;
    servers.into_iter().map(server_for_api).collect()
}

#[tauri::command]
pub fn mcp_get_server(db: State<'_, Arc<Database>>, id: i64) -> AppResult<Option<McpServerApi>> {
    match db.get_mcp_server(id)? {
        Some(server) => Ok(Some(server_for_api(server)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn mcp_get_tools(
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<Option<McpServerToolsSnapshot>> {
    Ok(store.get_tools(server_id))
}

#[tauri::command]
pub async fn mcp_ensure_tools(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<Option<McpServerToolsSnapshot>> {
    if let Some(snapshot) = store.get_tools(server_id) {
        return Ok(Some(snapshot));
    }

    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;

    if !can_attempt_mcp_tools(&server) {
        return Ok(None);
    }

    let runtime_server = match mcp_server_for_runtime(&server) {
        Ok(runtime_server) => runtime_server,
        Err(_) => return Ok(None),
    };

    let store = Arc::clone(store.inner());
    let store_for_task = Arc::clone(&store);

    tauri::async_runtime::spawn_blocking(move || {
        store_for_task.register_server(&runtime_server);
    })
    .await
    .map_err(|error| {
        crate::error::AppError::Message(format!("failed to start MCP session: {error}"))
    })?;

    Ok(store.get_tools(server_id).filter(snapshot_is_usable))
}

#[tauri::command]
pub fn mcp_start_server(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<Option<McpServerToolsSnapshot>> {
    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;
    let runtime_server = mcp_server_for_runtime(&server)?;
    store.register_server(&runtime_server);
    Ok(store.get_tools(server_id))
}

#[tauri::command]
pub fn mcp_stop_server(store: State<'_, Arc<McpToolsStore>>, server_id: i64) -> AppResult<bool> {
    store.unregister_server(server_id);
    Ok(true)
}

#[tauri::command]
pub fn mcp_is_running(store: State<'_, Arc<McpToolsStore>>, server_id: i64) -> AppResult<bool> {
    Ok(store.is_running(server_id))
}

#[tauri::command]
pub async fn mcp_refresh_tools(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<Option<McpServerToolsSnapshot>> {
    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;

    let runtime_server = mcp_server_for_runtime(&server)?;
    let store = Arc::clone(store.inner());
    let store_for_task = Arc::clone(&store);

    tauri::async_runtime::spawn_blocking(move || {
        store_for_task.register_server(&runtime_server);
    })
    .await
    .map_err(|error| {
        crate::error::AppError::Message(format!("failed to refresh MCP tools: {error}"))
    })?;

    Ok(store.get_tools(server_id).filter(snapshot_is_usable))
}

fn snapshot_is_usable(snapshot: &McpServerToolsSnapshot) -> bool {
    if snapshot
        .error
        .as_ref()
        .is_some_and(|message| message.starts_with("MCP_AUTH_REQUIRED:"))
    {
        return true;
    }
    snapshot.error.is_none() && !snapshot.tools.is_empty()
}

#[tauri::command]
pub fn mcp_compile_run_command(config_values: String) -> AppResult<String> {
    compile_run_command_template_from_config_values(&config_values)
}

#[tauri::command]
pub fn mcp_analyze_server(mut server: McpServer) -> AppResult<McpServerAnalysis> {
    server.config_values = reveal_config_values_for_api(&server.config_values)?;
    analyze_mcp_server(&server)
}

#[tauri::command]
pub fn mcp_list_run_transports() -> Vec<McpTransportCatalogEntry> {
    list_mcp_run_transports()
}

#[tauri::command]
pub async fn mcp_probe_operation(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    usage_log: State<'_, Arc<UsageLogStore>>,
    server_id: i64,
    operation: String,
    record_usage: Option<bool>,
) -> AppResult<McpProbeResult> {
    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;

    let mcp_name = server.name.clone();
    let tool_name = probe_tool_label(&operation);
    let should_record = record_usage.unwrap_or(false);
    let usage_log = Arc::clone(usage_log.inner());
    let oauth = Arc::clone(oauth.inner());

    let probe = tauri::async_runtime::spawn_blocking(move || -> AppResult<McpProbeResult> {
        let runtime_server = mcp_server_for_runtime(&server)?;
        Ok(probe_mcp_operation(&runtime_server, &operation, Some(oauth), None))
    })
    .await
    .map_err(|error| {
        crate::error::AppError::Message(format!("MCP probe failed to run: {error}"))
    })??;

    if should_record {
        if probe.success {
            usage_log.record_tool_call_success(
                mcp_name,
                tool_name,
                "user",
                &serde_json::json!({ "output": probe.result }),
            );
        } else {
            usage_log.record_tool_call_error(mcp_name, tool_name, "user", probe.result.clone());
        }
    }

    Ok(probe)
}

fn probe_tool_label(operation: &str) -> String {
    match operation {
        "initialize" => "initialize".to_string(),
        "tools_list" | "list" => "tools/list".to_string(),
        other => other.to_string(),
    }
}

#[tauri::command]
pub async fn mcp_add_server(db: State<'_, Arc<Database>>, server: McpServer) -> AppResult<McpServerApi> {
    let prepared = server_for_storage(server, None)?;
    let inserted = db.insert_mcp_server(&prepared)?;
    server_for_api(inserted)
}

#[tauri::command]
pub fn mcp_update_server(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    server: McpServer,
) -> AppResult<McpServerApi> {
    let existing = db.get_mcp_server(server.id)?;
    let prepared = server_for_storage(server, existing.as_ref())?;
    let updated = db.update_mcp_server(&prepared)?;
    store.unregister_server(updated.id);
    server_for_api(updated)
}

#[tauri::command]
pub fn mcp_remove_server(
    db: State<'_, Arc<Database>>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<bool> {
    let removed = db.remove_mcp_server_from_catalog(server_id)?;
    if removed {
        store.unregister_server(server_id);
    }
    Ok(removed)
}

#[tauri::command]
pub async fn mcp_add_from_registry(
    db: State<'_, Arc<Database>>,
    entry: RegistryEntry,
) -> AppResult<McpServerApi> {
    match build_registry_install_plan(entry)? {
        RegistryInstallPlan::Local(request) => mcp_install_local(db, request).await,
        RegistryInstallPlan::Remote(server) => mcp_add_server(db, server).await,
    }
}

#[tauri::command]
pub async fn mcp_install_local(
    db: State<'_, Arc<Database>>,
    request: InstallMcpLocalRequest,
) -> AppResult<McpServerApi> {
    if request.server.server_type != McpServerType::Local {
        return Err(crate::error::AppError::Message(
            "only local servers can be installed".to_string(),
        ));
    }

    let install_command = request.install_command.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_shell_checked(&install_command).map_err(crate::error::AppError::Message)
    })
    .await
    .map_err(|error| {
        crate::error::AppError::Message(format!("install task failed to run: {error}"))
    })??;

    let prepared = server_for_storage(request.server, None)?;
    let inserted = db.insert_mcp_server(&prepared)?;
    server_for_api(inserted)
}

#[tauri::command]
pub fn mcp_get_tool_prefs(
    db: State<'_, Arc<Database>>,
    server_id: i64,
) -> AppResult<std::collections::HashMap<String, bool>> {
    Ok(db.load_mcp_tool_prefs(server_id)?)
}

#[tauri::command]
pub fn mcp_set_tool_pref(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    ingestor: State<'_, Arc<ProxyLogIngestor>>,
    server_id: i64,
    tool_name: String,
    enabled: bool,
) -> AppResult<bool> {
    db.set_mcp_tool_pref(server_id, &tool_name, enabled)?;
    schedule_projects_using_server_export(disk_queue.inner(), server_id);
    let _ = ingestor.poll_once();
    Ok(true)
}

#[tauri::command]
pub fn mcp_replace_tool_prefs(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    ingestor: State<'_, Arc<ProxyLogIngestor>>,
    server_id: i64,
    prefs: std::collections::HashMap<String, bool>,
) -> AppResult<bool> {
    db.replace_mcp_tool_prefs(server_id, &prefs)?;
    schedule_projects_using_server_export(disk_queue.inner(), server_id);
    let _ = ingestor.poll_once();
    Ok(true)
}
