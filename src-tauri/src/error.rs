use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("File already exists: {0}")]
    FileExists(String),

    #[error("Database error: {0}")]
    Database(String),

    // 仅桌面端有回收站功能
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    #[error("Trash error: {0}")]
    Trash(#[from] trash::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
