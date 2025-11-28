mod commands;
mod error;
mod fs;
mod vector_db;

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
