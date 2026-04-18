#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![allow(dead_code)]

mod agent;
mod cloud_relay;
mod commands;
mod diagnostics;
mod doc_tools;
mod error;
mod forge_runtime;
mod fs;
mod llm;
mod mcp;
mod node_runtime;
mod plugins;
mod proxy;
mod secure_store;
#[cfg(target_os = "macos")]
mod traffic_lights;
mod update_manager;
mod webdav;

use std::env;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::save_file,
            commands::path_exists,
            commands::write_binary_file,
            commands::read_binary_file_base64,
            commands::list_directory,
            commands::fs_set_allowed_roots,
            commands::list_directory_tree,
            commands::create_file,
            commands::create_dir,
            commands::delete_file,
            commands::rename_file,
            commands::move_file,
            commands::move_folder,
            commands::show_in_explorer,
            commands::open_new_window,
            commands::start_file_watcher,
            // LLM HTTP client
            llm::llm_fetch,
            llm::llm_fetch_stream,
            // Debug logging
            llm::append_debug_log,
            llm::get_debug_log_path,
            diagnostics::export_diagnostics,
            // Plugin ecosystem commands
            plugins::plugin_list,
            plugins::plugin_read_entry,
            plugins::plugin_get_workspace_dir,
            plugins::plugin_scaffold_example,
            plugins::plugin_scaffold_theme,
            plugins::plugin_scaffold_ui_overhaul,
            // WebDAV commands
            webdav::commands::webdav_set_config,
            webdav::commands::webdav_get_config,
            webdav::commands::webdav_test_connection,
            webdav::commands::webdav_list_remote,
            webdav::commands::webdav_list_all_remote,
            webdav::commands::webdav_download,
            webdav::commands::webdav_upload,
            webdav::commands::webdav_create_dir,
            webdav::commands::webdav_delete,
            webdav::commands::webdav_compute_sync_plan,
            webdav::commands::webdav_execute_sync,
            webdav::commands::webdav_quick_sync,
            webdav::commands::webdav_scan_local,
            // Agent commands
            agent::agent_start_task,
            agent::agent_abort,
            agent::agent_approve_tool,
            agent::agent_get_status,
            agent::agent_get_queue_status,
            agent::agent_continue_with_answer,
            // Vault commands
            agent::vault_initialize,
            agent::vault_load_index,
            agent::vault_run_lint,
            // Agent debug commands
            agent::agent_enable_debug,
            agent::agent_disable_debug,
            agent::agent_is_debug_enabled,
            agent::agent_get_debug_log_path,
            // MCP commands
            mcp::mcp_init,
            mcp::mcp_list_servers,
            mcp::mcp_start_server,
            mcp::mcp_stop_server,
            mcp::mcp_list_tools,
            mcp::mcp_reload,
            mcp::mcp_test_tool,
            mcp::mcp_shutdown,
            // Doc tools pack commands
            doc_tools::doc_tools_get_status,
            doc_tools::doc_tools_install_latest,
            // Cloud Relay commands
            cloud_relay::cloud_relay_set_config,
            cloud_relay::cloud_relay_get_config,
            cloud_relay::cloud_relay_get_status,
            cloud_relay::cloud_relay_start,
            cloud_relay::cloud_relay_stop,
            // Proxy commands
            proxy::set_proxy_config,
            proxy::get_proxy_config,
            proxy::test_proxy_connection,
            // Secure store commands
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_delete,
            // Resumable updater commands
            update_manager::update_start_resumable_install,
            update_manager::update_get_resumable_status,
            update_manager::update_cancel_resumable_install,
            update_manager::update_clear_resumable_cache,
        ])
        .manage(webdav::commands::WebDAVState::new())
        .manage(agent::AgentState::new())
        .manage(cloud_relay::CloudRelayState::new())
        .manage(update_manager::UpdateManagerState::default())
        .manage(proxy::ProxyState::new())
        .setup(|app| {
            doc_tools::ensure_doc_tools_env(&app.handle());
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                // Performs initial centering and installs a native
                // NSNotificationCenter observer for resize events.
                traffic_lights::observe_resize(&window);

                // Theme changes are rare and don't cause flicker, so
                // the Tauri event handler is sufficient here.
                let win = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::ThemeChanged(..)) {
                        traffic_lights::center_in_titlebar(&win);
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
