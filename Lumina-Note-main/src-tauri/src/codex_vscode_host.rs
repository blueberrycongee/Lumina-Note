use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewBuilder, WebviewUrl,
};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

static HOST_SCRIPT: &str = include_str!("../../scripts/codex-vscode-host/host.mjs");

use crate::node_runtime::{current_platform, download_node_runtime, resolve_node_path};

#[derive(Default)]
struct CodexVscodeHostInner {
    child: Option<tokio::process::Child>,
    origin: Option<String>,
    port: Option<u16>,
    webview_bounds: Option<CodexWebviewBounds>,
}

#[derive(Default)]
pub struct CodexVscodeHostState(Mutex<CodexVscodeHostInner>);

#[derive(Debug, Serialize)]
pub struct CodexVscodeHostInfo {
    pub origin: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Serialize)]
struct ReadyMsg {
    #[serde(rename = "type")]
    msg_type: String,
    origin: String,
    port: u16,
}

#[derive(Clone, Copy, Debug)]
struct CodexWebviewBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn read_repo_host_script() -> Option<String> {
    let rel = std::path::PathBuf::from("scripts")
        .join("codex-vscode-host")
        .join("host.mjs");

    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&rel));
        candidates.push(cwd.join("..").join(&rel)); // if cwd is `src-tauri`
    }

    for p in candidates {
        if p.is_file() {
            if let Ok(s) = std::fs::read_to_string(&p) {
                return Some(s);
            }
        }
    }

    None
}

fn host_script_source() -> String {
    // Dev ergonomics: if the repo host script exists on disk, prefer it so that
    // editing `scripts/codex-vscode-host/host.mjs` takes effect without a Rust rebuild.
    if cfg!(debug_assertions) {
        if let Some(s) = read_repo_host_script() {
            return s;
        }
    }
    HOST_SCRIPT.to_string()
}

fn host_script_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidPath(format!("Failed to get app_data_dir: {}", e)))?
        .join("codex-vscode-host");
    std::fs::create_dir_all(&dir)?;
    let script_path = dir.join("host.mjs");
    let desired = host_script_source();
    match std::fs::read_to_string(&script_path) {
        Ok(existing) => {
            if existing != desired {
                std::fs::write(&script_path, desired)?;
            }
        }
        Err(_) => {
            std::fs::write(&script_path, desired)?;
        }
    }
    Ok(script_path)
}

fn apply_no_window_flag(cmd: &mut Command) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        true
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
        false
    }
}

async fn drain_lines(mut reader: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>) {
    while let Ok(Some(_)) = reader.next_line().await {}
}

async fn drain_err(mut reader: tokio::io::Lines<BufReader<tokio::process::ChildStderr>>) {
    while let Ok(Some(_)) = reader.next_line().await {}
}

#[tauri::command]
pub async fn codex_vscode_host_start(
    app: AppHandle,
    state: tauri::State<'_, CodexVscodeHostState>,
    extension_path: String,
    workspace_path: Option<String>,
) -> Result<CodexVscodeHostInfo, AppError> {
    let mut inner = state.0.lock().await;

    if let Some(mut child) = inner.child.take() {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    inner.origin = None;
    inner.port = None;

    let script_path = host_script_path(&app)?;

    let resource_dir = app.path().resource_dir().ok();
    let app_data_dir = app.path().app_data_dir().ok();
    let platform = current_platform();
    let mut cmd =
        match resolve_node_path(resource_dir.as_deref(), app_data_dir.as_deref(), platform) {
            Some(path) => Command::new(path),
            None => {
                let app_data_dir = app.path().app_data_dir().map_err(|e| {
                    AppError::InvalidPath(format!("Failed to get app_data_dir: {}", e))
                })?;
                let downloaded = download_node_runtime(&app_data_dir)
                    .await
                    .map_err(AppError::InvalidPath)?;
                Command::new(downloaded)
            }
        };
    apply_no_window_flag(&mut cmd);
    cmd.arg(script_path)
        .arg("--extensionPath")
        .arg(extension_path)
        .arg("--port")
        .arg("0")
        .arg("--quiet")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(workspace_path) = workspace_path {
        let trimmed = workspace_path.trim().to_string();
        if !trimmed.is_empty() {
            cmd.arg("--workspacePath").arg(trimmed);
        }
    }

    let mut child = cmd.spawn().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            AppError::InvalidPath(
                "Node runtime not found. Bundle node with the app or set LUMINA_NODE_PATH.".into(),
            )
        } else {
            AppError::Io(err)
        }
    })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::InvalidPath("Failed to capture codex host stdout".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::InvalidPath("Failed to capture codex host stderr".into()))?;

    let mut stdout_lines = BufReader::new(stdout).lines();

    let ready = tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            let line = stdout_lines.next_line().await?.ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "stdout closed")
            })?;
            if let Ok(msg) = serde_json::from_str::<ReadyMsg>(&line) {
                if msg.msg_type == "READY" {
                    return Ok::<ReadyMsg, std::io::Error>(msg);
                }
            }
        }
    })
    .await
    .map_err(|_| AppError::InvalidPath("Timed out waiting for codex host READY".into()))?
    .map_err(AppError::from)?;

    let origin = ready.origin.clone();
    let port = ready.port;

    // Drain remaining output so the process doesn't block on full buffers.
    tauri::async_runtime::spawn(async move { drain_lines(stdout_lines).await });
    tauri::async_runtime::spawn(async move { drain_err(BufReader::new(stderr).lines()).await });

    inner.origin = Some(origin.clone());
    inner.port = Some(port);
    inner.child = Some(child);

    Ok(CodexVscodeHostInfo { origin, port })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node_runtime::{candidate_node_paths, current_platform, node_binary_name};
    use std::path::Path;

    #[test]
    fn candidate_node_paths_include_expected_locations() {
        let resource_dir = Path::new("resource-root");
        let app_data_dir = Path::new("app-data");
        let platform = current_platform();
        let binary = node_binary_name(platform);
        let candidates = candidate_node_paths(Some(resource_dir), Some(app_data_dir), platform);

        assert!(candidates.contains(&resource_dir.join(binary)));
        assert!(candidates.contains(&resource_dir.join("node").join(binary)));
        assert!(candidates.contains(&resource_dir.join("node").join("bin").join(binary)));
        assert!(candidates.contains(&app_data_dir.join("codex").join("node").join(binary)));
    }

    #[test]
    #[cfg(windows)]
    fn apply_no_window_flag_sets_flag_on_windows() {
        let mut cmd = Command::new("node");
        assert!(apply_no_window_flag(&mut cmd));
    }

    #[test]
    #[cfg(not(windows))]
    fn apply_no_window_flag_is_noop_on_non_windows() {
        let mut cmd = Command::new("node");
        assert!(!apply_no_window_flag(&mut cmd));
    }
}

#[tauri::command]
pub async fn codex_vscode_host_stop(
    state: tauri::State<'_, CodexVscodeHostState>,
) -> Result<(), AppError> {
    let mut inner = state.0.lock().await;
    if let Some(mut child) = inner.child.take() {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    inner.origin = None;
    inner.port = None;
    Ok(())
}

// ===== Embedded Webview (no iframe) =====

const CODEX_WEBVIEW_ID: &str = "codex";

#[tauri::command]
pub async fn codex_webview_exists(app: AppHandle) -> Result<bool, AppError> {
    Ok(app.get_webview(CODEX_WEBVIEW_ID).is_some())
}

#[tauri::command]
pub async fn create_codex_webview(
    app: AppHandle,
    state: tauri::State<'_, CodexVscodeHostState>,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    let windows = app.windows();
    let main_window = windows
        .get("main")
        .ok_or_else(|| AppError::InvalidPath("Main window not found".into()))?;

    if let Some(webview) = app.get_webview(CODEX_WEBVIEW_ID) {
        let _ = webview.close();
    }

    let parsed_url: tauri::Url = url
        .parse()
        .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?;

    let app_for_open = app.clone();
    let webview_builder = WebviewBuilder::new(CODEX_WEBVIEW_ID, WebviewUrl::External(parsed_url))
        .on_new_window(move |new_url, _features| {
            if new_url.scheme() == "http" || new_url.scheme() == "https" {
                #[allow(deprecated)]
                let _ = app_for_open.shell().open(new_url.to_string(), None);
                return NewWindowResponse::Deny;
            }
            NewWindowResponse::Allow
        });

    main_window
        .add_child(
            webview_builder,
            Position::Logical(LogicalPosition::new(x, y)),
            Size::Logical(LogicalSize::new(width, height)),
        )
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    {
        let mut inner = state.0.lock().await;
        inner.webview_bounds = Some(CodexWebviewBounds {
            x,
            y,
            width,
            height,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn update_codex_webview_bounds(
    app: AppHandle,
    state: tauri::State<'_, CodexVscodeHostState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview(CODEX_WEBVIEW_ID) {
        webview
            .set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        webview
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        let mut inner = state.0.lock().await;
        inner.webview_bounds = Some(CodexWebviewBounds {
            x,
            y,
            width,
            height,
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn set_codex_webview_visible(
    app: AppHandle,
    state: tauri::State<'_, CodexVscodeHostState>,
    visible: bool,
) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview(CODEX_WEBVIEW_ID) {
        if visible {
            let bounds = {
                let inner = state.0.lock().await;
                inner.webview_bounds
            };
            if let Some(bounds) = bounds {
                webview
                    .set_position(Position::Logical(LogicalPosition::new(bounds.x, bounds.y)))
                    .map_err(|e| AppError::InvalidPath(e.to_string()))?;
                webview
                    .set_size(Size::Logical(LogicalSize::new(bounds.width, bounds.height)))
                    .map_err(|e| AppError::InvalidPath(e.to_string()))?;
            }
        } else {
            webview
                .set_position(Position::Logical(LogicalPosition::new(-10000.0, -10000.0)))
                .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn navigate_codex_webview(app: AppHandle, url: String) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview(CODEX_WEBVIEW_ID) {
        let parsed_url: tauri::Url = url
            .parse()
            .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?;
        webview
            .navigate(parsed_url)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_codex_webview(app: AppHandle) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview(CODEX_WEBVIEW_ID) {
        webview
            .close()
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}
