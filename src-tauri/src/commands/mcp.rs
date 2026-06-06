use crate::core::shell::run_shell_checked;
use crate::db::mcp_config::is_mcp_server_configured;
use crate::db::{Database, InstallMcpLocalRequest, McpServer, McpServerType};
use crate::error::AppResult;
use crate::services::{
    apply_compiled_run_command, build_registry_install_plan, compile_run_command_template_from_config_values,
    mcp_server_for_runtime, probe_mcp_operation, reveal_config_values_for_api,
    seal_config_values_for_storage, RegistryEntry, RegistryInstallPlan, McpProbeResult,
    McpServerToolsSnapshot, McpToolsStore, UsageLogStore,
};
use std::sync::Arc;
use tauri::State;

fn server_for_api(mut server: McpServer) -> AppResult<McpServer> {
    server.config_values = reveal_config_values_for_api(&server.config_values)?;
    Ok(server)
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
pub fn mcp_list_servers(db: State<'_, Database>) -> AppResult<Vec<McpServer>> {
    let servers = db.list_mcp_servers()?;
    servers.into_iter().map(server_for_api).collect()
}

#[tauri::command]
pub fn mcp_get_server(db: State<'_, Database>, id: i64) -> AppResult<Option<McpServer>> {
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
    db: State<'_, Database>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<Option<McpServerToolsSnapshot>> {
    if let Some(snapshot) = store.get_tools(server_id) {
        return Ok(Some(snapshot));
    }

    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;

    if !is_mcp_server_configured(&server) {
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

    Ok(store.get_tools(server_id).filter(|snapshot| {
        snapshot.error.is_none() && !snapshot.tools.is_empty()
    }))
}

#[tauri::command]
pub fn mcp_start_server(
    db: State<'_, Database>,
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
    db: State<'_, Database>,
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

    Ok(store.get_tools(server_id).filter(|snapshot| {
        snapshot.error.is_none() && !snapshot.tools.is_empty()
    }))
}

#[tauri::command]
pub fn mcp_compile_run_command(config_values: String) -> AppResult<String> {
    compile_run_command_template_from_config_values(&config_values)
}

#[tauri::command]
pub async fn mcp_probe_operation(
    db: State<'_, Database>,
    usage_log: State<'_, Arc<UsageLogStore>>,
    server_id: i64,
    operation: String,
) -> AppResult<McpProbeResult> {
    let server = db
        .get_mcp_server(server_id)?
        .ok_or_else(|| crate::error::AppError::Message("MCP server not found".to_string()))?;

    let mcp_name = server.name.clone();
    let tool_name = probe_tool_label(&operation);
    let usage_log = Arc::clone(usage_log.inner());

    let probe = tauri::async_runtime::spawn_blocking(move || -> AppResult<McpProbeResult> {
        let runtime_server = mcp_server_for_runtime(&server)?;
        Ok(probe_mcp_operation(&runtime_server, &operation))
    })
    .await
    .map_err(|error| {
        crate::error::AppError::Message(format!("MCP probe failed to run: {error}"))
    })??;

    if probe.success {
        usage_log.record_success(
            mcp_name,
            tool_name,
            &serde_json::json!({ "output": probe.result }),
        );
    } else {
        usage_log.record_error(mcp_name, tool_name, probe.result.clone());
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
pub async fn mcp_add_server(db: State<'_, Database>, server: McpServer) -> AppResult<McpServer> {
    let prepared = server_for_storage(server, None)?;
    let inserted = db.insert_mcp_server(&prepared)?;
    server_for_api(inserted)
}

#[tauri::command]
pub fn mcp_update_server(
    db: State<'_, Database>,
    store: State<'_, Arc<McpToolsStore>>,
    server: McpServer,
) -> AppResult<McpServer> {
    let existing = db.get_mcp_server(server.id)?;
    let prepared = server_for_storage(server, existing.as_ref())?;
    let updated = db.update_mcp_server(&prepared)?;
    if updated.server_type == McpServerType::Local {
        store.unregister_server(updated.id);
    }
    server_for_api(updated)
}

#[tauri::command]
pub fn mcp_remove_server(
    db: State<'_, Database>,
    store: State<'_, Arc<McpToolsStore>>,
    server_id: i64,
) -> AppResult<bool> {
    let removed = db.delete_mcp_server(server_id)?;
    if removed {
        store.unregister_server(server_id);
    }
    Ok(removed)
}

#[tauri::command]
pub async fn mcp_add_from_registry(
    db: State<'_, Database>,
    entry: RegistryEntry,
) -> AppResult<McpServer> {
    match build_registry_install_plan(entry)? {
        RegistryInstallPlan::Local(request) => mcp_install_local(db, request).await,
        RegistryInstallPlan::Remote(server) => mcp_add_server(db, server).await,
    }
}

#[tauri::command]
pub async fn mcp_install_local(
    db: State<'_, Database>,
    request: InstallMcpLocalRequest,
) -> AppResult<McpServer> {
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
