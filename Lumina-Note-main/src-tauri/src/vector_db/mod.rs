//! Vector Database Module
//!
//! SQLite-based vector storage for RAG system.
//! Uses bincode for efficient vector serialization.

pub mod commands;

use crate::error::AppError;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub use commands::*;

/// Vector chunk data for storage
#[derive(Debug, Serialize, Deserialize)]
pub struct VectorChunk {
    pub id: String,
    pub vector: Vec<f32>,
    pub content: String,
    pub file_path: String,
    pub heading: String,
    pub start_line: i32,
    pub end_line: i32,
    pub file_modified: Option<i64>,
}

/// Search result with similarity score
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub file_path: String,
    pub heading: String,
    pub content: String,
    pub score: f32,
    pub start_line: i32,
    pub end_line: i32,
}

/// Index status information
#[derive(Debug, Serialize, Deserialize)]
pub struct IndexStatus {
    pub initialized: bool,
    pub total_chunks: i64,
    pub total_files: i64,
    pub last_indexed: Option<i64>,
}

/// Global database connection (lazily initialized per workspace)
static DB_CONNECTION: Mutex<Option<Connection>> = Mutex::new(None);

/// Initialize vector database
pub fn init_db(db_path: &str) -> Result<(), AppError> {
    let conn = Connection::open(db_path)
        .map_err(|e| AppError::Database(format!("Failed to open database: {}", e)))?;

    // Create tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vectors (
            id TEXT PRIMARY KEY,
            vector BLOB NOT NULL,
            content TEXT NOT NULL,
            file_path TEXT NOT NULL,
            heading TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            file_modified INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )
    .map_err(|e| AppError::Database(format!("Failed to create vectors table: {}", e)))?;

    // Create index for file_path lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_vectors_file_path ON vectors(file_path)",
        [],
    )
    .map_err(|e| AppError::Database(format!("Failed to create index: {}", e)))?;

    // Store connection
    let mut db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    *db = Some(conn);

    Ok(())
}

/// Insert or update vectors
pub fn upsert_vectors(chunks: Vec<VectorChunk>) -> Result<(), AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    for chunk in chunks {
        let vector_blob = bincode::serialize(&chunk.vector)
            .map_err(|e| AppError::Database(format!("Failed to serialize vector: {}", e)))?;

        conn.execute(
            "INSERT OR REPLACE INTO vectors 
             (id, vector, content, file_path, heading, start_line, end_line, file_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                chunk.id,
                vector_blob,
                chunk.content,
                chunk.file_path,
                chunk.heading,
                chunk.start_line,
                chunk.end_line,
                chunk.file_modified,
            ],
        )
        .map_err(|e| AppError::Database(format!("Failed to insert vector: {}", e)))?;
    }

    Ok(())
}

/// Row data from query
type VectorRow = (String, Vec<u8>, String, String, String, i32, i32);

/// Helper to collect rows from a query
fn collect_rows(
    conn: &rusqlite::Connection,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Vec<VectorRow>, AppError> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::Database(format!("Failed to prepare query: {}", e)))?;

    let rows = stmt
        .query_map(params, |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, i32>(6)?,
            ))
        })
        .map_err(|e| AppError::Database(format!("Failed to execute query: {}", e)))?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Search vectors by similarity
pub fn search_vectors(
    query_vector: Vec<f32>,
    limit: usize,
    min_score: f32,
    directory_filter: Option<String>,
) -> Result<Vec<SearchResult>, AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    // Collect all matching rows
    let all_rows = if let Some(ref dir) = directory_filter {
        let sql = "SELECT id, vector, content, file_path, heading, start_line, end_line FROM vectors WHERE file_path LIKE ?1";
        let pattern = format!("{}%", dir);
        collect_rows(conn, sql, &[&pattern])?
    } else {
        let sql =
            "SELECT id, vector, content, file_path, heading, start_line, end_line FROM vectors";
        collect_rows(conn, sql, &[])?
    };

    // Calculate similarity and filter
    let mut results: Vec<(f32, SearchResult)> = all_rows
        .into_iter()
        .filter_map(
            |(id, vector_blob, content, file_path, heading, start_line, end_line)| {
                let stored_vector: Vec<f32> = bincode::deserialize(&vector_blob).ok()?;
                let score = cosine_similarity(&query_vector, &stored_vector);

                if score >= min_score {
                    Some((
                        score,
                        SearchResult {
                            id,
                            file_path,
                            heading,
                            content,
                            score,
                            start_line,
                            end_line,
                        },
                    ))
                } else {
                    None
                }
            },
        )
        .collect();

    // Sort by score descending
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Take top N
    Ok(results.into_iter().take(limit).map(|(_, r)| r).collect())
}

/// Delete vectors by file path
pub fn delete_vectors_by_file(file_path: &str) -> Result<(), AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    conn.execute(
        "DELETE FROM vectors WHERE file_path = ?1",
        params![file_path],
    )
    .map_err(|e| AppError::Database(format!("Failed to delete vectors: {}", e)))?;

    Ok(())
}

/// Delete vectors by IDs
pub fn delete_vectors_by_ids(ids: Vec<String>) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    let placeholders: Vec<String> = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let sql = format!(
        "DELETE FROM vectors WHERE id IN ({})",
        placeholders.join(", ")
    );

    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| AppError::Database(format!("Failed to delete vectors: {}", e)))?;

    Ok(())
}

/// Get index status
pub fn get_index_status() -> Result<IndexStatus, AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;

    if db.is_none() {
        return Ok(IndexStatus {
            initialized: false,
            total_chunks: 0,
            total_files: 0,
            last_indexed: None,
        });
    }

    let conn = db.as_ref().unwrap();

    let total_chunks: i64 = conn
        .query_row("SELECT COUNT(*) FROM vectors", [], |row| row.get(0))
        .unwrap_or(0);

    let total_files: i64 = conn
        .query_row("SELECT COUNT(DISTINCT file_path) FROM vectors", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    let last_indexed: Option<i64> = conn
        .query_row("SELECT MAX(created_at) FROM vectors", [], |row| row.get(0))
        .ok();

    Ok(IndexStatus {
        initialized: true,
        total_chunks,
        total_files,
        last_indexed,
    })
}

/// Check if file needs reindexing based on modification time
pub fn file_needs_reindex(file_path: &str, current_modified: i64) -> Result<bool, AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    let stored_modified: Result<Option<i64>, _> = conn.query_row(
        "SELECT file_modified FROM vectors WHERE file_path = ?1 LIMIT 1",
        params![file_path],
        |row| row.get(0),
    );

    match stored_modified {
        Ok(Some(stored)) => Ok(current_modified > stored),
        Ok(None) => Ok(true), // No record, needs indexing
        Err(_) => Ok(true),   // Not found, needs indexing
    }
}

/// Clear all vectors (for full reindex)
pub fn clear_all_vectors() -> Result<(), AppError> {
    let db = DB_CONNECTION
        .lock()
        .map_err(|_| AppError::Database("Lock poisoned".into()))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".into()))?;

    conn.execute("DELETE FROM vectors", [])
        .map_err(|e| AppError::Database(format!("Failed to clear vectors: {}", e)))?;

    Ok(())
}

/// Calculate cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}
