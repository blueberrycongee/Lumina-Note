//! 同步引擎
//!
//! 实现本地优先的双向同步逻辑

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

use super::client::WebDAVClient;
use super::types::*;
use crate::error::AppError;

/// 同步引擎
pub struct SyncEngine {
    client: WebDAVClient,
    vault_path: String,
    state: Option<SyncState>,
}

impl SyncEngine {
    /// 创建新的同步引擎
    pub fn new(config: WebDAVConfig, vault_path: String) -> Result<Self, AppError> {
        let client = WebDAVClient::new(config)?;
        Ok(Self {
            client,
            vault_path,
            state: None,
        })
    }

    /// 加载同步状态
    pub fn load_state(&mut self) -> Result<(), AppError> {
        let state_path = self.state_file_path();
        if Path::new(&state_path).exists() {
            let content = fs::read_to_string(&state_path)
                .map_err(|e| AppError::WebDAV(format!("Failed to read sync state: {}", e)))?;
            self.state = serde_json::from_str(&content)
                .map_err(|e| AppError::WebDAV(format!("Failed to parse sync state: {}", e)))?;
        }
        Ok(())
    }

    /// 保存同步状态
    pub fn save_state(&self) -> Result<(), AppError> {
        if let Some(ref state) = self.state {
            let state_path = self.state_file_path();
            let content = serde_json::to_string_pretty(state)
                .map_err(|e| AppError::WebDAV(format!("Failed to serialize sync state: {}", e)))?;
            fs::write(&state_path, content)
                .map_err(|e| AppError::WebDAV(format!("Failed to write sync state: {}", e)))?;
        }
        Ok(())
    }

    fn state_file_path(&self) -> String {
        format!("{}/.lumina-sync-state.json", self.vault_path)
    }

    /// 测试连接
    pub async fn test_connection(&self) -> Result<bool, AppError> {
        self.client.test_connection().await
    }

    /// 扫描本地文件
    pub fn scan_local_files(&self) -> Result<Vec<LocalFileInfo>, AppError> {
        let mut files = Vec::new();
        let vault = Path::new(&self.vault_path);

        for entry in WalkDir::new(vault)
            .into_iter()
            .filter_entry(|e| !Self::should_skip(e.file_name().to_str().unwrap_or("")))
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            // 跳过 vault 根目录本身
            if path == vault {
                continue;
            }

            let relative_path = path
                .strip_prefix(vault)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();

            if relative_path.is_empty() {
                continue;
            }

            let metadata = entry
                .metadata()
                .map_err(|e| AppError::WebDAV(format!("Failed to read metadata: {}", e)))?;

            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            files.push(LocalFileInfo {
                relative_path,
                absolute_path: path.to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                size: if metadata.is_file() {
                    metadata.len()
                } else {
                    0
                },
                modified,
            });
        }

        Ok(files)
    }

    /// 判断是否应该跳过的文件/目录
    fn should_skip(name: &str) -> bool {
        name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name.ends_with(".tmp")
            || name.ends_with(".swp")
            || name.ends_with(".conflict")
    }

    /// 扫描远程文件
    pub async fn scan_remote_files(&self) -> Result<Vec<RemoteEntry>, AppError> {
        self.client.list_all_recursive("").await
    }

    /// 计算同步计划
    pub async fn compute_sync_plan(&mut self) -> Result<SyncPlan, AppError> {
        self.load_state()?;

        let local_files = self.scan_local_files()?;
        let remote_files = self.scan_remote_files().await?;

        // 构建映射表
        let local_map: HashMap<String, &LocalFileInfo> = local_files
            .iter()
            .map(|f| (f.relative_path.clone(), f))
            .collect();

        let remote_map: HashMap<String, &RemoteEntry> =
            remote_files.iter().map(|f| (f.path.clone(), f)).collect();

        // 获取上次同步记录
        let last_sync_map: HashMap<String, &FileRecord> = self
            .state
            .as_ref()
            .map(|s| s.file_records.iter().map(|r| (r.path.clone(), r)).collect())
            .unwrap_or_default();

        let mut items = Vec::new();

        // 处理本地文件
        for local in &local_files {
            let path = &local.relative_path;
            let remote = remote_map.get(path).copied();
            let last_record = last_sync_map.get(path).copied();

            let (action, reason) = self.determine_action(Some(local), remote, last_record);

            if action != SyncAction::Skip {
                items.push(SyncPlanItem {
                    path: path.clone(),
                    action,
                    local: Some(local.clone()),
                    remote: remote.cloned(),
                    reason,
                });
            }
        }

        // 处理只存在于远程的文件
        for remote in &remote_files {
            let path = &remote.path;
            if !local_map.contains_key(path) {
                let last_record = last_sync_map.get(path).copied();

                let (action, reason) = if last_record.is_some() {
                    // 之前同步过，现在本地没有了 -> 本地删除了
                    (
                        SyncAction::DeleteRemote,
                        "Local file was deleted".to_string(),
                    )
                } else {
                    // 从未同步过，远程新增 -> 下载
                    (SyncAction::Download, "New file on remote".to_string())
                };

                items.push(SyncPlanItem {
                    path: path.clone(),
                    action,
                    local: None,
                    remote: Some(remote.clone()),
                    reason,
                });
            }
        }

        // 统计
        let upload_count = items
            .iter()
            .filter(|i| i.action == SyncAction::Upload)
            .count();
        let download_count = items
            .iter()
            .filter(|i| i.action == SyncAction::Download)
            .count();
        let conflict_count = items
            .iter()
            .filter(|i| i.action == SyncAction::Conflict)
            .count();

        Ok(SyncPlan {
            items,
            upload_count,
            download_count,
            conflict_count,
        })
    }

    /// 确定单个文件的同步动作
    fn determine_action(
        &self,
        local: Option<&LocalFileInfo>,
        remote: Option<&RemoteEntry>,
        last_record: Option<&FileRecord>,
    ) -> (SyncAction, String) {
        match (local, remote, last_record) {
            // 本地存在，远程不存在
            (Some(_l), None, None) => {
                // 新文件，上传
                (SyncAction::Upload, "New local file".to_string())
            }
            (Some(_), None, Some(_)) => {
                // 之前同步过，远程没了 -> 本地优先：重新上传
                // 不删除本地文件，保护用户数据
                (
                    SyncAction::Upload,
                    "Remote file missing, re-uploading (local-first)".to_string(),
                )
            }

            // 本地存在，远程也存在
            (Some(l), Some(r), last_record) => {
                if l.is_dir || r.is_dir {
                    // 目录不需要同步内容
                    return (SyncAction::Skip, "Directory".to_string());
                }

                let local_changed = last_record
                    .map(|lr| l.modified > lr.local_mtime)
                    .unwrap_or(true);

                let remote_changed = last_record
                    .map(|lr| r.modified > lr.remote_mtime)
                    .unwrap_or(true);

                match (local_changed, remote_changed) {
                    (true, true) => {
                        // 双方都有修改 -> 冲突
                        (SyncAction::Conflict, "Both sides modified".to_string())
                    }
                    (true, false) => {
                        // 只有本地修改 -> 上传
                        (SyncAction::Upload, "Local file modified".to_string())
                    }
                    (false, true) => {
                        // 只有远程修改 -> 下载
                        (SyncAction::Download, "Remote file modified".to_string())
                    }
                    (false, false) => {
                        // 都没修改
                        (SyncAction::Skip, "No changes".to_string())
                    }
                }
            }

            // 本地不存在（这种情况在 compute_sync_plan 中单独处理）
            (None, Some(_), _) => (SyncAction::Download, "Remote only".to_string()),

            // 都不存在（不应该发生）
            (None, None, _) => (SyncAction::Skip, "Neither exists".to_string()),
        }
    }

    /// 执行同步
    pub async fn execute_sync(&mut self, plan: &SyncPlan) -> Result<SyncResult, AppError> {
        let start = Instant::now();
        let mut uploaded = 0;
        let mut downloaded = 0;
        let mut deleted = 0;
        let mut conflicts = 0;
        let mut errors = Vec::new();
        let mut new_records = Vec::new();

        for item in &plan.items {
            let result = match item.action {
                SyncAction::Upload => self.execute_upload(item).await,
                SyncAction::Download => self.execute_download(item).await,
                SyncAction::DeleteRemote => self.execute_delete_remote(item).await,
                SyncAction::DeleteLocal => {
                    // 本地优先：永远不删除本地文件，跳过此操作
                    eprintln!(
                        "[WebDAV] Skipping DeleteLocal for {} - local-first policy",
                        item.path
                    );
                    continue;
                }
                SyncAction::Conflict => self.handle_conflict(item).await,
                SyncAction::Skip => continue,
            };

            match result {
                Ok(record) => {
                    match item.action {
                        SyncAction::Upload => uploaded += 1,
                        SyncAction::Download => downloaded += 1,
                        SyncAction::DeleteRemote | SyncAction::DeleteLocal => deleted += 1,
                        SyncAction::Conflict => conflicts += 1,
                        _ => {}
                    }
                    if let Some(r) = record {
                        new_records.push(r);
                    }
                }
                Err(e) => {
                    errors.push(SyncError {
                        path: item.path.clone(),
                        action: item.action.clone(),
                        message: e.to_string(),
                    });
                }
            }
        }

        // 更新同步状态 - 合并记录而非替换
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // 保留之前的记录，只更新/添加本次处理的文件
        let mut merged_records: HashMap<String, FileRecord> = self
            .state
            .as_ref()
            .map(|s| {
                s.file_records
                    .iter()
                    .map(|r| (r.path.clone(), r.clone()))
                    .collect()
            })
            .unwrap_or_default();

        // 更新/添加新记录
        for record in new_records {
            merged_records.insert(record.path.clone(), record);
        }

        // 移除已删除的文件记录（仅远程删除，本地删除不再传播）
        for item in &plan.items {
            if item.action == SyncAction::DeleteRemote {
                merged_records.remove(&item.path);
            }
        }

        self.state = Some(SyncState {
            last_sync: now,
            file_records: merged_records.into_values().collect(),
        });
        self.save_state()?;

        Ok(SyncResult {
            success: errors.is_empty(),
            uploaded,
            downloaded,
            deleted,
            conflicts,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    /// 执行上传
    async fn execute_upload(&self, item: &SyncPlanItem) -> Result<Option<FileRecord>, AppError> {
        let local = item
            .local
            .as_ref()
            .ok_or_else(|| AppError::WebDAV("No local file for upload".to_string()))?;

        if local.is_dir {
            self.client.ensure_dir(&item.path).await?;
        } else {
            // 确保父目录存在
            if let Some(parent) = Path::new(&item.path).parent() {
                let parent_str = parent.to_string_lossy().replace('\\', "/");
                if !parent_str.is_empty() {
                    self.client.ensure_dir(&parent_str).await?;
                }
            }

            let content = fs::read(&local.absolute_path)
                .map_err(|e| AppError::WebDAV(format!("Failed to read local file: {}", e)))?;
            self.client.upload(&item.path, &content).await?;
        }

        // 上传后使用当前时间戳作为 remote_mtime，因为上传会更新远程文件的修改时间。
        // 使用旧的 remote mtime 会导致下次同步时误判远程文件被修改，产生不必要的下载或冲突。
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Ok(Some(FileRecord {
            path: item.path.clone(),
            local_mtime: local.modified,
            remote_mtime: now,
            etag: None, // 上传后 etag 已变化，旧值不可用
        }))
    }

    /// 执行下载
    async fn execute_download(&self, item: &SyncPlanItem) -> Result<Option<FileRecord>, AppError> {
        let remote = item
            .remote
            .as_ref()
            .ok_or_else(|| AppError::WebDAV("No remote file for download".to_string()))?;

        let local_path = format!("{}/{}", self.vault_path, item.path);
        let local_path = Path::new(&local_path);

        if remote.is_dir {
            fs::create_dir_all(local_path)
                .map_err(|e| AppError::WebDAV(format!("Failed to create directory: {}", e)))?;
        } else {
            // 确保父目录存在
            if let Some(parent) = local_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    AppError::WebDAV(format!("Failed to create parent directory: {}", e))
                })?;
            }

            let content = self.client.download(&item.path).await?;
            fs::write(local_path, &content)
                .map_err(|e| AppError::WebDAV(format!("Failed to write local file: {}", e)))?;
        }

        let local_mtime = local_path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(remote.modified);

        Ok(Some(FileRecord {
            path: item.path.clone(),
            local_mtime,
            remote_mtime: remote.modified,
            etag: remote.etag.clone(),
        }))
    }

    /// 删除远程文件
    async fn execute_delete_remote(
        &self,
        item: &SyncPlanItem,
    ) -> Result<Option<FileRecord>, AppError> {
        self.client.delete(&item.path).await?;
        Ok(None) // 删除后不再跟踪
    }

    /// 删除本地文件 - 本地优先策略下禁用
    #[allow(dead_code)]
    async fn execute_delete_local(
        &self,
        _item: &SyncPlanItem,
    ) -> Result<Option<FileRecord>, AppError> {
        // 本地优先：永远不删除本地文件
        // 如果用户想删除，应该手动删除
        eprintln!("[WebDAV] execute_delete_local called but disabled - local-first policy");
        Ok(None)
    }

    /// 处理冲突 - 保留两个版本
    async fn handle_conflict(&self, item: &SyncPlanItem) -> Result<Option<FileRecord>, AppError> {
        let remote = item.remote.as_ref().ok_or_else(|| {
            AppError::WebDAV("No remote file for conflict resolution".to_string())
        })?;

        // 下载远程版本为 .conflict 文件
        let conflict_path = format!("{}/{}.conflict", self.vault_path, item.path);
        let conflict_path = Path::new(&conflict_path);

        if let Some(parent) = conflict_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let content = self.client.download(&item.path).await?;
        fs::write(conflict_path, &content)?;

        // 记录本地版本的信息
        let local = item.local.as_ref();
        let local_mtime = local.map(|l| l.modified).unwrap_or(0);

        Ok(Some(FileRecord {
            path: item.path.clone(),
            local_mtime,
            remote_mtime: remote.modified,
            etag: remote.etag.clone(),
        }))
    }

    /// 快速同步：仅同步非冲突文件
    pub async fn quick_sync(&mut self) -> Result<SyncResult, AppError> {
        let mut plan = self.compute_sync_plan().await?;

        // 过滤掉冲突，只处理确定性的操作
        plan.items
            .retain(|item| item.action != SyncAction::Conflict);
        plan.conflict_count = 0;

        self.execute_sync(&plan).await
    }
}
