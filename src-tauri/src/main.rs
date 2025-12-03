// 仅桌面端使用 main.rs，移动端使用 lib.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod fs;
mod error;
mod vector_db;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod pdf_ocr;

#[cfg(debug_assertions)]
use tauri::Manager;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::thread;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::save_file,
            commands::list_directory,
            commands::create_file,
            commands::create_dir,
            commands::delete_file,
            commands::rename_file,
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
            // Vector DB commands
            vector_db::init_vector_db,
            vector_db::upsert_vector_chunks,
            vector_db::search_vector_chunks,
            vector_db::delete_file_vectors,
            vector_db::delete_vectors,
            vector_db::get_vector_index_status,
            vector_db::check_file_needs_reindex,
            vector_db::clear_vector_index,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            // 启动 PDF OCR 服务 (仅桌面端，在单独线程中运行)
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            thread::spawn(|| {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async {
                    if let Err(e) = pdf_ocr::start_server(18765).await {
                        eprintln!("PDF OCR 服务启动失败: {}", e);
                    }
                });
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
