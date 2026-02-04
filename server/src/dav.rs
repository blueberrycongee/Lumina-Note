use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{HeaderMap, Method, Request, Response, StatusCode};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use httpdate::fmt_http_date;
use mime_guess::MimeGuess;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;
use urlencoding::encode;

use crate::auth::{decode_token, verify_password};
use crate::db;
use crate::error::AppError;
use crate::state::AppState;

pub async fn handle_dav_root(
    State(state): State<AppState>,
    AxumPath(workspace_id): AxumPath<String>,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    handle_dav_request(state, workspace_id, "".to_string(), req).await
}

pub async fn handle_dav_path(
    State(state): State<AppState>,
    AxumPath((workspace_id, path)): AxumPath<(String, String)>,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    handle_dav_request(state, workspace_id, path, req).await
}

async fn handle_dav_request(
    state: AppState,
    workspace_id: String,
    path: String,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    Uuid::parse_str(&workspace_id).map_err(|_| AppError::NotFound)?;
    let user_id = match authorize_request(&state, req.headers()).await {
        Ok(user_id) => user_id,
        Err(AppError::Unauthorized) => {
            let response = Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .header("WWW-Authenticate", "Basic realm=\"Lumina\"")
                .body(Body::empty())
                .map_err(|e| AppError::Internal(format!("build auth response: {}", e)))?;
            return Ok(response);
        }
        Err(err) => return Err(err),
    };

    let has_access = db::user_has_workspace(&state.pool, &user_id, &workspace_id).await?;
    if !has_access {
        return Err(AppError::Forbidden);
    }

    let workspace_root = workspace_root(&state, &workspace_id);
    tokio::fs::create_dir_all(&workspace_root)
        .await
        .map_err(|e| AppError::Internal(format!("create workspace dir: {}", e)))?;

    let relative = sanitize_path(&path)?;
    let absolute = workspace_root.join(&relative);

    match *req.method() {
        Method::OPTIONS => respond_options(),
        Method::PROPFIND => respond_propfind(&workspace_id, &relative, &absolute, req.headers()).await,
        Method::GET => respond_get(&absolute).await,
        Method::HEAD => respond_head(&absolute).await,
        Method::PUT => respond_put(&absolute, req).await,
        Method::MKCOL => respond_mkcol(&absolute).await,
        Method::DELETE => respond_delete(&absolute).await,
        _ => Ok(Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .body(Body::empty())
            .map_err(|e| AppError::Internal(format!("build response: {}", e)))?),
    }
}

fn respond_options() -> Result<Response<Body>, AppError> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(
            "Allow",
            "OPTIONS, PROPFIND, GET, HEAD, PUT, MKCOL, DELETE",
        )
        .body(Body::empty())
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

async fn respond_propfind(
    workspace_id: &str,
    relative: &Path,
    absolute: &Path,
    headers: &HeaderMap,
) -> Result<Response<Body>, AppError> {
    let depth = headers
        .get("Depth")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("0");
    let depth = match depth {
        "1" => 1,
        _ => 0,
    };

    let metadata = tokio::fs::metadata(absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    let mut entries = Vec::new();
    entries.push(build_prop_entry(workspace_id, relative, &metadata).await?);

    if depth == 1 && metadata.is_dir() {
        let mut dir = tokio::fs::read_dir(absolute)
            .await
            .map_err(|e| AppError::Internal(format!("read dir: {}", e)))?;
        while let Some(entry) = dir.next_entry().await.map_err(|e| AppError::Internal(format!("read dir: {}", e)))? {
            let name = entry.file_name();
            let name = name.to_string_lossy().to_string();
            let child_relative = relative.join(name);
            let child_metadata = entry
                .metadata()
                .await
                .map_err(|e| AppError::Internal(format!("read metadata: {}", e)))?;
            entries.push(build_prop_entry(workspace_id, &child_relative, &child_metadata).await?);
        }
    }

    let body = build_propfind_xml(&entries);
    Response::builder()
        .status(StatusCode::MULTI_STATUS)
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(Body::from(body))
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

async fn build_prop_entry(
    workspace_id: &str,
    relative: &Path,
    metadata: &tokio::fs::Metadata,
) -> Result<PropEntry, AppError> {
    let modified = metadata.modified().unwrap_or(SystemTime::now());
    let size = if metadata.is_file() { metadata.len() } else { 0 };
    let modified_secs = modified
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let etag = format!("\"{}-{}\"", size, modified_secs);
    let content_type = if metadata.is_file() {
        MimeGuess::from_path(relative)
            .first_or_octet_stream()
            .essence_str()
            .to_string()
    } else {
        "httpd/unix-directory".to_string()
    };

    Ok(PropEntry {
        href: href_for(workspace_id, relative, metadata.is_dir()),
        is_dir: metadata.is_dir(),
        size,
        modified,
        etag,
        content_type,
    })
}

async fn respond_get(absolute: &Path) -> Result<Response<Body>, AppError> {
    let metadata = tokio::fs::metadata(absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    if metadata.is_dir() {
        return Err(AppError::BadRequest("cannot GET directory".to_string()));
    }
    let bytes = tokio::fs::read(absolute)
        .await
        .map_err(|e| AppError::Internal(format!("read file: {}", e)))?;
    let content_type = MimeGuess::from_path(absolute)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    let modified = metadata.modified().unwrap_or(SystemTime::now());
    let modified_secs = modified
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let etag = format!("\"{}-{}\"", metadata.len(), modified_secs);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Last-Modified", fmt_http_date(modified))
        .header("ETag", etag)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

async fn respond_head(absolute: &Path) -> Result<Response<Body>, AppError> {
    let metadata = tokio::fs::metadata(absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    if metadata.is_dir() {
        return Err(AppError::BadRequest("cannot HEAD directory".to_string()));
    }
    let modified = metadata.modified().unwrap_or(SystemTime::now());
    let modified_secs = modified
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let etag = format!("\"{}-{}\"", metadata.len(), modified_secs);
    let content_type = MimeGuess::from_path(absolute)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Content-Length", metadata.len())
        .header("Last-Modified", fmt_http_date(modified))
        .header("ETag", etag)
        .body(Body::empty())
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

async fn respond_put(absolute: &Path, req: Request<Body>) -> Result<Response<Body>, AppError> {
    if let Some(parent) = absolute.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(format!("create dir: {}", e)))?;
    }
    let bytes = hyper::body::to_bytes(req.into_body())
        .await
        .map_err(|e| AppError::Internal(format!("read body: {}", e)))?;
    let mut file = tokio::fs::File::create(absolute)
        .await
        .map_err(|e| AppError::Internal(format!("create file: {}", e)))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| AppError::Internal(format!("write file: {}", e)))?;
    Ok(Response::builder()
        .status(StatusCode::CREATED)
        .body(Body::empty())
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))?)
}

async fn respond_mkcol(absolute: &Path) -> Result<Response<Body>, AppError> {
    tokio::fs::create_dir_all(absolute)
        .await
        .map_err(|e| AppError::Internal(format!("create dir: {}", e)))?;
    Ok(Response::builder()
        .status(StatusCode::CREATED)
        .body(Body::empty())
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))?)
}

async fn respond_delete(absolute: &Path) -> Result<Response<Body>, AppError> {
    let metadata = tokio::fs::metadata(absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    if metadata.is_dir() {
        tokio::fs::remove_dir_all(absolute)
            .await
            .map_err(|e| AppError::Internal(format!("remove dir: {}", e)))?;
    } else {
        tokio::fs::remove_file(absolute)
            .await
            .map_err(|e| AppError::Internal(format!("remove file: {}", e)))?;
    }
    Ok(Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))?)
}

async fn authorize_request(state: &AppState, headers: &HeaderMap) -> Result<String, AppError> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)
        .ok_or(AppError::Unauthorized)?;
    let value = header.to_str().map_err(|_| AppError::Unauthorized)?;

    if let Some(token) = value.strip_prefix("Bearer ") {
        let claims = decode_token(token.trim(), &state.config)?;
        return Ok(claims.sub);
    }

    if let Some(encoded) = value.strip_prefix("Basic ") {
        let decoded = STANDARD
            .decode(encoded.trim().as_bytes())
            .map_err(|_| AppError::Unauthorized)?;
        let decoded = String::from_utf8(decoded).map_err(|_| AppError::Unauthorized)?;
        let mut parts = decoded.splitn(2, ':');
        let email = parts.next().unwrap_or("").trim().to_lowercase();
        let password = parts.next().unwrap_or("").to_string();
        if email.is_empty() || password.is_empty() {
            return Err(AppError::Unauthorized);
        }
        let user = db::find_user_by_email(&state.pool, &email).await?;
        let (user_id, password_hash) = user.ok_or(AppError::Unauthorized)?;
        if !verify_password(&password, &password_hash)? {
            return Err(AppError::Unauthorized);
        }
        return Ok(user_id);
    }

    Err(AppError::Unauthorized)
}

fn workspace_root(state: &AppState, workspace_id: &str) -> PathBuf {
    PathBuf::from(&state.config.data_dir)
        .join("workspaces")
        .join(workspace_id)
}

fn sanitize_path(path: &str) -> Result<PathBuf, AppError> {
    let cleaned = Path::new(path);
    for component in cleaned.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::BadRequest("invalid path".to_string()))
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }
    Ok(cleaned.to_path_buf())
}

#[derive(Debug)]
struct PropEntry {
    href: String,
    is_dir: bool,
    size: u64,
    modified: SystemTime,
    etag: String,
    content_type: String,
}

fn build_propfind_xml(entries: &[PropEntry]) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    xml.push_str("<D:multistatus xmlns:D=\"DAV:\">\n");

    for entry in entries {
        let href = xml_escape(&entry.href);
        let etag = xml_escape(&entry.etag);
        let content_type = xml_escape(&entry.content_type);
        xml.push_str("  <D:response>\n");
        xml.push_str(&format!("    <D:href>{}</D:href>\n", href));
        xml.push_str("    <D:propstat>\n");
        xml.push_str("      <D:prop>\n");
        xml.push_str("        <D:resourcetype>");
        if entry.is_dir {
            xml.push_str("<D:collection/>");
        }
        xml.push_str("</D:resourcetype>\n");
        xml.push_str(&format!(
            "        <D:getcontentlength>{}</D:getcontentlength>\n",
            entry.size
        ));
        xml.push_str(&format!(
            "        <D:getlastmodified>{}</D:getlastmodified>\n",
            fmt_http_date(entry.modified)
        ));
        xml.push_str(&format!("        <D:getetag>{}</D:getetag>\n", etag));
        xml.push_str(&format!(
            "        <D:getcontenttype>{}</D:getcontenttype>\n",
            content_type
        ));
        xml.push_str("      </D:prop>\n");
        xml.push_str("      <D:status>HTTP/1.1 200 OK</D:status>\n");
        xml.push_str("    </D:propstat>\n");
        xml.push_str("  </D:response>\n");
    }

    xml.push_str("</D:multistatus>\n");
    xml
}

fn href_for(workspace_id: &str, relative: &Path, is_dir: bool) -> String {
    let mut href = format!("/dav/{}", workspace_id);
    if !relative.as_os_str().is_empty() {
        href.push('/');
        href.push_str(&encode_path(relative));
    }
    if is_dir && !href.ends_with('/') {
        href.push('/');
    }
    href
}

fn encode_path(path: &Path) -> String {
    let mut parts = Vec::new();
    for component in path.components() {
        if let Component::Normal(segment) = component {
            parts.push(encode(&segment.to_string_lossy()).into_owned());
        }
    }
    parts.join("/")
}

fn xml_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
