#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![allow(dead_code)]

mod agent;
mod cloud_relay;
mod codex_extension;
mod codex_vscode_host;
mod commands;
mod diagnostics;
mod doc_tools;
mod error;
mod forge_runtime;
mod fs;
mod langgraph;
mod llm;
mod mcp;
mod mobile_gateway;
mod node_runtime;
mod plugins;
mod typesetting;
mod vector_db;
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
            commands::open_video_window,
            commands::close_video_window,
            commands::get_video_time,
            commands::sync_video_time,
            commands::create_embedded_webview,
            commands::update_webview_bounds,
            commands::close_embedded_webview,
            commands::open_new_window,
            commands::get_bilibili_cid,
            commands::get_bilibili_danmaku,
            commands::seek_video_time,
            commands::fill_danmaku_prefix,
            commands::setup_danmaku_autofill,
            commands::start_file_watcher,
            commands::typesetting_preview_page_mm,
            commands::typesetting_fixture_font_path,
            commands::typesetting_export_pdf_base64,
            commands::typesetting_render_docx_pdf_base64,
            commands::typesetting_layout_text,
            // Browser WebView commands
            commands::create_browser_webview,
            commands::update_browser_webview_bounds,
            commands::close_browser_webview,
            commands::navigate_browser_webview,
            commands::browser_webview_go_back,
            commands::browser_webview_go_forward,
            commands::browser_webview_reload,
            commands::set_browser_webview_visible,
            commands::browser_webview_freeze,
            commands::browser_webview_unfreeze,
            commands::browser_webview_exists,
            // Vector DB commands
            vector_db::init_vector_db,
            vector_db::upsert_vector_chunks,
            vector_db::search_vector_chunks,
            vector_db::delete_file_vectors,
            vector_db::delete_vectors,
            vector_db::get_vector_index_status,
            vector_db::check_file_needs_reindex,
            vector_db::clear_vector_index,
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
            agent::agent_list_skills,
            agent::agent_read_skill,
            // Agent debug commands
            agent::agent_enable_debug,
            agent::agent_disable_debug,
            agent::agent_is_debug_enabled,
            agent::agent_get_debug_log_path,
            // Deep Research commands
            agent::deep_research_start,
            agent::deep_research_resume,
            agent::deep_research_abort,
            agent::deep_research_is_running,
            // MCP commands
            mcp::mcp_init,
            mcp::mcp_list_servers,
            mcp::mcp_start_server,
            mcp::mcp_stop_server,
            mcp::mcp_list_tools,
            mcp::mcp_reload,
            mcp::mcp_test_tool,
            mcp::mcp_shutdown,
            // VS Code extension host (Codex POC)
            codex_vscode_host::codex_vscode_host_start,
            codex_vscode_host::codex_vscode_host_stop,
            codex_vscode_host::codex_webview_exists,
            codex_vscode_host::create_codex_webview,
            codex_vscode_host::update_codex_webview_bounds,
            codex_vscode_host::set_codex_webview_visible,
            codex_vscode_host::navigate_codex_webview,
            codex_vscode_host::close_codex_webview,
            // Codex extension management (Marketplace install)
            codex_extension::codex_extension_get_status,
            codex_extension::codex_extension_install_latest,
            codex_extension::codex_extension_install_vsix,
            // Doc tools pack commands
            doc_tools::doc_tools_get_status,
            doc_tools::doc_tools_install_latest,
            // Mobile Gateway commands
            mobile_gateway::mobile_get_status,
            mobile_gateway::mobile_start_server,
            mobile_gateway::mobile_stop_server,
            mobile_gateway::mobile_set_workspace,
            mobile_gateway::mobile_set_agent_config,
            mobile_gateway::mobile_sync_sessions,
            mobile_gateway::mobile_sync_options,
            // Cloud Relay commands
            cloud_relay::cloud_relay_set_config,
            cloud_relay::cloud_relay_get_config,
            cloud_relay::cloud_relay_get_status,
            cloud_relay::cloud_relay_start,
            cloud_relay::cloud_relay_stop,
        ])
        .manage(webdav::commands::WebDAVState::new())
        .manage(agent::AgentState::new())
        .manage(agent::DeepResearchStateManager::new())
        .manage(codex_vscode_host::CodexVscodeHostState::default())
        .manage(mobile_gateway::MobileGatewayState::new())
        .manage(cloud_relay::CloudRelayState::new())
        .setup(|app| {
            if let Err(err) = mobile_gateway::hydrate_state(&app.handle()) {
                eprintln!("[MobileGateway] Failed to hydrate state: {}", err);
            }
            doc_tools::ensure_doc_tools_env(&app.handle());
            if env::var_os("LUMINA_SKILLS_DIR").is_none() {
                if let Some(root) = agent::skills::builtin_skills_root(&app.handle()) {
                    env::set_var("LUMINA_SKILLS_DIR", root);
                }
            }
            let window = app.get_webview_window("main").unwrap();

            // Mac 上启用 decorations 并使用透明标题栏，避免无边框窗口的兼容性问题
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let _ = window.set_decorations(true);
                let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
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
