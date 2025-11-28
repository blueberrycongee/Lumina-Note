#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod fs;
mod error;
mod vector_db;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::save_file,
            commands::list_directory,
            commands::create_file,
            commands::delete_file,
            commands::rename_file,
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
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
