mod agents;
mod commands;
mod core;
mod db;
mod error;
mod services;

use commands::{
    agent_record_create, agent_record_delete, agent_record_get, agent_record_list,
    agent_record_read_mcp_json, agent_record_update, agent_record_write_mcp_json,
    agents_ensure_mcp_json, agents_get_config, agents_list_catalog,
    agents_read_mcp_json, agents_resolve_auto_path, app_complete_initial_setup,
    app_download_node_runtime, app_get_node_runtime_status, app_get_settings,
    app_save_setup_settings, app_set_node_path, app_validate_node_path,
    graph_delete, graph_get_state,
    graph_list_placeable_agents, graph_list_placeable_mcp_ids, graph_save_links,     mcp_add_from_registry,
    mcp_add_server, mcp_analyze_server, mcp_compile_run_command, mcp_ensure_tools, mcp_get_server,
    mcp_get_tools,
    mcp_get_tool_prefs,
    mcp_set_tool_pref,
    mcp_replace_tool_prefs,
    mcp_install_local,
    mcp_is_running, mcp_list_run_transports, mcp_list_servers, mcp_probe_operation,
    mcp_refresh_tools, mcp_remove_server,
    mcp_oauth_complete, mcp_oauth_get_challenge, mcp_oauth_set_api_key, mcp_oauth_start_sign_in,
    mcp_start_server, mcp_stop_server,     mcp_update_server, registry_http_get, security_get_use_os_keyring, security_initialize,
    security_mask_secret, security_set_use_os_keyring,
    topology_aggregator_script_path, topology_get_status, topology_mcp_server_key, topology_proxy_script_path, topology_start,
    topology_stop, usage_list_entries,     project_record_create, project_record_delete,
    project_record_get, project_record_get_detail, project_record_link_agent, project_record_list,
    project_record_assign_preset, project_record_update_assignment, preset_record_create,
    preset_record_delete, preset_record_list, preset_record_try_delete, preset_record_update, project_record_add_server,
    project_record_remove_server, project_record_unassign_preset,
    project_record_use_custom_preset, project_record_use_default_preset,
    project_record_delete_custom_preset,
    project_record_reset_agent,
    project_record_unlink_agent, project_record_export_proxy_config,
    project_record_retry_export,
    workspace_bootstrap,
    workspace_get_bootstrap_status,
};
use core::child_guard::kill_all_registered_children;
use services::{ensure_initialized, OAuthStore, ProjectDiskQueue, ProxyLogIngestor, ProxyOAuthRefresher, UsageLogStore};
use core::fs::{ensure_user_storage_dir, user_database_path};
use db::Database;
use services::{McpToolsStore, TopologyRunStore};
use std::sync::Arc;
use tauri::{AppHandle, Listener, Manager, RunEvent, WindowEvent};
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
            let usage_log = Arc::new(UsageLogStore::new(Arc::clone(&db)));
            usage_log.attach_app(app.handle().clone());
            let disk_queue = Arc::new(ProjectDiskQueue::new(
                Arc::clone(&db),
                Arc::clone(&oauth),
                Arc::clone(&tools_store),
            ));
            disk_queue.attach_app(app.handle().clone());
            disk_queue.hydrate_dirty_from_db();
            disk_queue.retry_all_dirty_projects();
            let settings = core::app_settings::reload_app_settings()?;
            let proxy_log_ingestor = Arc::new(ProxyLogIngestor::new(Arc::clone(&usage_log)));
            if settings.enable_log_collection {
                proxy_log_ingestor.start_background();
            }
            let proxy_oauth_refresher = Arc::new(ProxyOAuthRefresher::new(Arc::clone(&oauth)));
            proxy_oauth_refresher.start_background();
            app.manage(db);
            app.manage(oauth);
            app.manage(tools_store);
            app.manage(Arc::new(TopologyRunStore::new()));
            app.manage(usage_log);
            app.manage(disk_queue);
            app.manage(proxy_log_ingestor);
            app.manage(proxy_oauth_refresher);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(true) = event {
                if let Some(disk_queue) = window.try_state::<Arc<ProjectDiskQueue>>() {
                    disk_queue.retry_all_dirty_projects();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            agent_record_list,
            agent_record_get,
            agent_record_create,
            agent_record_update,
            agent_record_delete,
            agent_record_read_mcp_json,
            agent_record_write_mcp_json,
            topology_aggregator_script_path,
            topology_proxy_script_path,
            topology_mcp_server_key,
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
            mcp_get_tool_prefs,
            mcp_set_tool_pref,
            mcp_replace_tool_prefs,
            mcp_install_local,
            mcp_oauth_complete,
            mcp_oauth_get_challenge,
            mcp_oauth_set_api_key,
            mcp_oauth_start_sign_in,
            registry_http_get,
            security_initialize,
            security_mask_secret,
            security_get_use_os_keyring,
            security_set_use_os_keyring,
            topology_start,
            topology_stop,
            topology_get_status,
            usage_list_entries,
            workspace_get_bootstrap_status,
            workspace_bootstrap,
            project_record_list,
            project_record_get,
            project_record_get_detail,
            project_record_create,
            project_record_delete,
            project_record_update_assignment,
            project_record_add_server,
            project_record_remove_server,
            project_record_assign_preset,
            project_record_unassign_preset,
            project_record_use_default_preset,
            project_record_use_custom_preset,
            project_record_delete_custom_preset,
            project_record_reset_agent,
            project_record_unlink_agent,
            project_record_link_agent,
            project_record_export_proxy_config,
            project_record_retry_export,
            preset_record_list,
            preset_record_create,
            preset_record_update,
            preset_record_delete,
            preset_record_try_delete,
            app_get_settings,
            app_save_setup_settings,
            app_set_node_path,
            app_validate_node_path,
            app_get_node_runtime_status,
            app_download_node_runtime,
            app_complete_initial_setup,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(tools) = app_handle.try_state::<Arc<McpToolsStore>>() {
                    tools.shutdown_all();
                }
                if let Some(ingestor) = app_handle.try_state::<Arc<ProxyLogIngestor>>() {
                    ingestor.stop();
                }
                kill_all_registered_children();
            }
        });
}

fn init_database() -> crate::error::AppResult<Database> {
    ensure_user_storage_dir()?;
    let db_path = user_database_path();
    Ok(Database::open(&db_path)?)
}

pub use error::{AppError, AppResult};
pub use services::market_probe::{parse_cli_args, run_market_probe, MarketProbeOptions};
