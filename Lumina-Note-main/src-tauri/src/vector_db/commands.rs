//! Tauri commands for vector database operations

use super::{
    clear_all_vectors, delete_vectors_by_file, delete_vectors_by_ids, file_needs_reindex,
    get_index_status, init_db, search_vectors, upsert_vectors, IndexStatus, SearchResult,
    VectorChunk,
};
use crate::error::AppError;

/// Initialize vector database
#[tauri::command]
pub async fn init_vector_db(db_path: String) -> Result<(), AppError> {
    init_db(&db_path)
}

/// Insert or update vectors
#[tauri::command]
pub async fn upsert_vector_chunks(chunks: Vec<VectorChunk>) -> Result<(), AppError> {
    upsert_vectors(chunks)
}

/// Search vectors by similarity
#[tauri::command]
pub async fn search_vector_chunks(
    query_vector: Vec<f32>,
    limit: usize,
    min_score: f32,
    directory_filter: Option<String>,
) -> Result<Vec<SearchResult>, AppError> {
    search_vectors(query_vector, limit, min_score, directory_filter)
}

/// Delete vectors by file path
#[tauri::command]
pub async fn delete_file_vectors(file_path: String) -> Result<(), AppError> {
    delete_vectors_by_file(&file_path)
}

/// Delete vectors by IDs
#[tauri::command]
pub async fn delete_vectors(ids: Vec<String>) -> Result<(), AppError> {
    delete_vectors_by_ids(ids)
}

/// Get index status
#[tauri::command]
pub async fn get_vector_index_status() -> Result<IndexStatus, AppError> {
    get_index_status()
}

/// Check if file needs reindexing
#[tauri::command]
pub async fn check_file_needs_reindex(
    file_path: String,
    modified_time: i64,
) -> Result<bool, AppError> {
    file_needs_reindex(&file_path, modified_time)
}

/// Clear all vectors (for full reindex)
#[tauri::command]
pub async fn clear_vector_index() -> Result<(), AppError> {
    clear_all_vectors()
}
