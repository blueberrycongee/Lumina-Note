mod commands;
mod error;
mod fs;
mod vector_db;

// PDF OCR 仅桌面端可用
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod pdf_ocr;

pub use commands::*;
pub use error::*;
pub use fs::*;

// Re-export vector_db items explicitly to avoid shadowing
pub use vector_db::{
    VectorChunk, SearchResult, IndexStatus,
    init_vector_db, upsert_vector_chunks, search_vector_chunks,
    delete_file_vectors, delete_vectors, get_vector_index_status,
    check_file_needs_reindex, clear_vector_index,
};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use pdf_ocr::*;

// ============ 移动端入口 ============
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // 文件操作 (移动端可用)
            commands::read_file,
            commands::save_file,
            commands::list_directory,
            commands::create_file,
            commands::create_dir,
            commands::delete_file,
            commands::rename_file,
            commands::start_file_watcher,
            // B站 API (移动端可用)
            commands::get_bilibili_cid,
            commands::get_bilibili_danmaku,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
