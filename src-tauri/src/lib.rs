mod agents;
mod commands;
mod core;
mod db;
mod error;
mod services;

use commands::{
    agent_record_create, agent_record_delete, agent_record_get, agent_record_list,
    agent_record_update, agents_ensure_mcp_json, agents_get_config, agents_list_catalog,
    agents_read_mcp_json, agents_resolve_auto_path, graph_delete, graph_get_state,
    graph_list_placeable_agents, graph_list_placeable_mcp_ids, graph_save_links,     mcp_add_from_registry,
    mcp_add_server, mcp_analyze_server, mcp_compile_run_command, mcp_ensure_tools, mcp_get_server,
    mcp_get_tools,
    mcp_install_local,
    mcp_is_running, mcp_list_run_transports, mcp_list_servers, mcp_probe_operation,
    mcp_refresh_tools, mcp_remove_server,
    mcp_oauth_complete, mcp_oauth_get_challenge, mcp_oauth_set_api_key, mcp_oauth_start_sign_in,
    mcp_start_server, mcp_stop_server, mcp_update_server, registry_http_get, security_initialize,
    security_mask_secret,
    topology_get_status, topology_start, topology_stop, usage_list_entries,
};
use services::{ensure_initialized, OAuthStore, UsageLogStore};
use core::fs::{ensure_user_storage_dir, user_database_path};
use db::Database;
use services::{McpToolsStore, TopologyRunStore};
use std::sync::Arc;
use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |_event| {
                focus_main_window(&app_handle);
            });

            #[cfg(any(windows, target_os = "linux"))]
            {
                app.deep_link().register_all()?;
            }

            let db = Arc::new(init_database()?);
            ensure_initialized()?;
            let oauth = Arc::new(OAuthStore::new(Arc::clone(&db)));
            oauth.init_callback_listener();
            oauth.attach_app(app.handle().clone());
            let tools_store = Arc::new(McpToolsStore::new());
            tools_store.attach_oauth(Arc::clone(&oauth));
            let usage_log = Arc::new(UsageLogStore::new(db.as_ref()));
            usage_log.attach_app(app.handle().clone());
            app.manage(db);
            app.manage(oauth);
            app.manage(tools_store);
            app.manage(Arc::new(TopologyRunStore::new()));
            app.manage(usage_log);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_record_list,
            agent_record_get,
            agent_record_create,
            agent_record_update,
            agent_record_delete,
            graph_get_state,
            graph_save_links,
            graph_delete,
            agents_list_catalog,
            agents_get_config,
            agents_read_mcp_json,
            agents_ensure_mcp_json,
            agents_resolve_auto_path,
            graph_list_placeable_agents,
            graph_list_placeable_mcp_ids,
            mcp_analyze_server,
            mcp_compile_run_command,
            mcp_list_run_transports,
            mcp_probe_operation,
            mcp_list_servers,
            mcp_get_server,
            mcp_get_tools,
            mcp_ensure_tools,
            mcp_start_server,
            mcp_stop_server,
            mcp_is_running,
            mcp_refresh_tools,
            mcp_add_from_registry,
            mcp_add_server,
            mcp_update_server,
            mcp_remove_server,
            mcp_install_local,
            mcp_oauth_complete,
            mcp_oauth_get_challenge,
            mcp_oauth_set_api_key,
            mcp_oauth_start_sign_in,
            registry_http_get,
            security_initialize,
            security_mask_secret,
            topology_start,
            topology_stop,
            topology_get_status,
            usage_list_entries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn init_database() -> crate::error::AppResult<Database> {
    ensure_user_storage_dir()?;
    let db_path = user_database_path();
    Ok(Database::open(&db_path)?)
}

pub use error::{AppError, AppResult};
pub use services::market_probe::{parse_cli_args, run_market_probe, MarketProbeOptions};
