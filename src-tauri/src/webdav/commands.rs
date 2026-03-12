//! WebDAV Tauri 命令
//!
//! 暴露给前端的命令接口

use std::sync::Mutex;
use tauri::State;

use super::client::WebDAVClient;
use super::sync::SyncEngine;
use super::types::*;
use crate::error::AppError;

/// WebDAV 状态管理
pub struct WebDAVState {
    config: Mutex<Option<WebDAVConfig>>,
}

impl WebDAVState {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(None),
        }
    }
}

impl Default for WebDAVState {
    fn default() -> Self {
        Self::new()
    }
}

/// 设置 WebDAV 配置
#[tauri::command]
pub async fn webdav_set_config(
    state: State<'_, WebDAVState>,
    config: WebDAVConfig,
) -> Result<(), AppError> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| AppError::WebDAV("Failed to acquire lock".to_string()))?;
    *guard = Some(config);
    Ok(())
}

/// 获取 WebDAV 配置
#[tauri::command]
pub async fn webdav_get_config(
    state: State<'_, WebDAVState>,
) -> Result<Option<WebDAVConfig>, AppError> {
    let guard = state
        .config
        .lock()
        .map_err(|_| AppError::WebDAV("Failed to acquire lock".to_string()))?;
    Ok(guard.clone())
}

/// 测试 WebDAV 连接
#[tauri::command]
pub async fn webdav_test_connection(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
) -> Result<bool, AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.test_connection().await
}

/// 列出远程目录
#[tauri::command]
pub async fn webdav_list_remote(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    path: String,
) -> Result<Vec<RemoteEntry>, AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.list_dir(&path).await
}

/// 列出所有远程文件（递归）
#[tauri::command]
pub async fn webdav_list_all_remote(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
) -> Result<Vec<RemoteEntry>, AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.list_all_recursive("").await
}

/// 下载远程文件
#[tauri::command]
pub async fn webdav_download(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    remote_path: String,
) -> Result<String, AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.download_text(&remote_path).await
}

/// 上传文件到远程
#[tauri::command]
pub async fn webdav_upload(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    remote_path: String,
    content: String,
) -> Result<(), AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.upload_text(&remote_path, &content).await
}

/// 在远程创建目录
#[tauri::command]
pub async fn webdav_create_dir(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    remote_path: String,
) -> Result<(), AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.ensure_dir(&remote_path).await
}

/// 删除远程文件/目录
#[tauri::command]
pub async fn webdav_delete(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    remote_path: String,
) -> Result<(), AppError> {
    let http_client = proxy_state.client().await;
    let client = WebDAVClient::with_client(config, http_client);
    client.delete(&remote_path).await
}

/// 计算同步计划
#[tauri::command]
pub async fn webdav_compute_sync_plan(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    vault_path: String,
) -> Result<SyncPlan, AppError> {
    let http_client = proxy_state.client().await;
    let mut engine = SyncEngine::with_client(config, vault_path, http_client)?;
    engine.compute_sync_plan().await
}

/// 执行同步
#[tauri::command]
pub async fn webdav_execute_sync(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    vault_path: String,
    plan: SyncPlan,
) -> Result<SyncResult, AppError> {
    let http_client = proxy_state.client().await;
    let mut engine = SyncEngine::with_client(config, vault_path, http_client)?;
    engine.execute_sync(&plan).await
}

/// 快速同步（跳过冲突）
#[tauri::command]
pub async fn webdav_quick_sync(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    vault_path: String,
) -> Result<SyncResult, AppError> {
    let http_client = proxy_state.client().await;
    let mut engine = SyncEngine::with_client(config, vault_path, http_client)?;
    engine.quick_sync().await
}

/// 扫描本地文件
#[tauri::command]
pub async fn webdav_scan_local(
    proxy_state: State<'_, crate::proxy::ProxyState>,
    config: WebDAVConfig,
    vault_path: String,
) -> Result<Vec<LocalFileInfo>, AppError> {
    let http_client = proxy_state.client().await;
    let engine = SyncEngine::with_client(config, vault_path, http_client)?;
    engine.scan_local_files()
}
