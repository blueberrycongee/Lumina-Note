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
pub async fn webdav_test_connection(config: WebDAVConfig) -> Result<bool, AppError> {
    let client = WebDAVClient::new(config)?;
    client.test_connection().await
}

/// 列出远程目录
#[tauri::command]
pub async fn webdav_list_remote(
    config: WebDAVConfig,
    path: String,
) -> Result<Vec<RemoteEntry>, AppError> {
    let client = WebDAVClient::new(config)?;
    client.list_dir(&path).await
}

/// 列出所有远程文件（递归）
#[tauri::command]
pub async fn webdav_list_all_remote(config: WebDAVConfig) -> Result<Vec<RemoteEntry>, AppError> {
    let client = WebDAVClient::new(config)?;
    client.list_all_recursive("").await
}

/// 下载远程文件
#[tauri::command]
pub async fn webdav_download(
    config: WebDAVConfig,
    remote_path: String,
) -> Result<String, AppError> {
    let client = WebDAVClient::new(config)?;
    client.download_text(&remote_path).await
}

/// 上传文件到远程
#[tauri::command]
pub async fn webdav_upload(
    config: WebDAVConfig,
    remote_path: String,
    content: String,
) -> Result<(), AppError> {
    let client = WebDAVClient::new(config)?;
    client.upload_text(&remote_path, &content).await
}

/// 在远程创建目录
#[tauri::command]
pub async fn webdav_create_dir(config: WebDAVConfig, remote_path: String) -> Result<(), AppError> {
    let client = WebDAVClient::new(config)?;
    client.ensure_dir(&remote_path).await
}

/// 删除远程文件/目录
#[tauri::command]
pub async fn webdav_delete(config: WebDAVConfig, remote_path: String) -> Result<(), AppError> {
    let client = WebDAVClient::new(config)?;
    client.delete(&remote_path).await
}

/// 计算同步计划
#[tauri::command]
pub async fn webdav_compute_sync_plan(
    config: WebDAVConfig,
    vault_path: String,
) -> Result<SyncPlan, AppError> {
    let mut engine = SyncEngine::new(config, vault_path)?;
    engine.compute_sync_plan().await
}

/// 执行同步
#[tauri::command]
pub async fn webdav_execute_sync(
    config: WebDAVConfig,
    vault_path: String,
    plan: SyncPlan,
) -> Result<SyncResult, AppError> {
    let mut engine = SyncEngine::new(config, vault_path)?;
    engine.execute_sync(&plan).await
}

/// 快速同步（跳过冲突）
#[tauri::command]
pub async fn webdav_quick_sync(
    config: WebDAVConfig,
    vault_path: String,
) -> Result<SyncResult, AppError> {
    let mut engine = SyncEngine::new(config, vault_path)?;
    engine.quick_sync().await
}

/// 扫描本地文件
#[tauri::command]
pub async fn webdav_scan_local(
    config: WebDAVConfig,
    vault_path: String,
) -> Result<Vec<LocalFileInfo>, AppError> {
    let engine = SyncEngine::new(config, vault_path)?;
    engine.scan_local_files()
}
