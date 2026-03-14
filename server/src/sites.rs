use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{Response, StatusCode};
use mime_guess::MimeGuess;
use tokio_util::io::ReaderStream;

use crate::dav;
use crate::error::AppError;
use crate::state::AppState;

/// Serve published site files: GET /sites/{user_id}/*path
/// No authentication required — public access.
pub async fn serve_site_file(
    State(state): State<AppState>,
    AxumPath((user_id, path)): AxumPath<(String, String)>,
) -> Result<Response<Body>, AppError> {
    let site_dir = dav::site_root(&state, &user_id);
    if !site_dir.exists() {
        return Err(AppError::NotFound);
    }

    let relative = dav::sanitize_path(&path)?;
    let mut absolute = site_dir.join(&relative);

    // If path points to a directory or is empty, serve index.html
    if absolute.is_dir() || path.is_empty() {
        absolute = absolute.join("index.html");
    }

    if !absolute.exists() || !absolute.is_file() {
        return Err(AppError::NotFound);
    }

    // Security: ensure resolved path is still under site_dir
    let canonical = absolute.canonicalize().map_err(|_| AppError::NotFound)?;
    let site_canonical = site_dir.canonicalize().map_err(|_| AppError::NotFound)?;
    if !canonical.starts_with(&site_canonical) {
        return Err(AppError::Forbidden);
    }

    let metadata = tokio::fs::metadata(&absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    let file = tokio::fs::File::open(&absolute)
        .await
        .map_err(|e| AppError::Internal(format!("open site file: {}", e)))?;

    let content_type = MimeGuess::from_path(&absolute)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    let stream = ReaderStream::new(file);
    let body = Body::wrap_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Content-Length", metadata.len())
        .header("Cache-Control", "public, max-age=300")
        .body(body)
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

/// Serve published site root: GET /sites/{user_id}
pub async fn serve_site_root(
    State(state): State<AppState>,
    AxumPath(user_id): AxumPath<String>,
) -> Result<Response<Body>, AppError> {
    serve_site_file(State(state), AxumPath((user_id, String::new()))).await
}
