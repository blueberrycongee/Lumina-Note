//! WebDAV 类型定义
//!
//! 提供 WebDAV 操作所需的所有数据结构，与具体实现解耦

use serde::{Deserialize, Serialize};

/// WebDAV 连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDAVConfig {
    /// 服务器 URL (如 https://dav.example.com/dav)
    pub server_url: String,
    /// 用户名
    pub username: String,
    /// 密码 (考虑后续改为加密存储)
    pub password: String,
    /// 远程根目录 (如 /notes)
    pub remote_base_path: String,
    /// 是否启用自动同步
    pub auto_sync: bool,
    /// 自动同步间隔 (秒)
    pub sync_interval_secs: u64,
}

impl Default for WebDAVConfig {
    fn default() -> Self {
        Self {
            server_url: String::new(),
            username: String::new(),
            password: String::new(),
            remote_base_path: "/".to_string(),
            auto_sync: false,
            sync_interval_secs: 300, // 5 分钟
        }
    }
}

/// 远程文件/目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteEntry {
    /// 相对路径 (相对于 remote_base_path)
    pub path: String,
    /// 文件名
    pub name: String,
    /// 是否为目录
    pub is_dir: bool,
    /// 文件大小 (字节)
    pub size: u64,
    /// 最后修改时间 (Unix 时间戳，秒)
    pub modified: u64,
    /// ETag (用于检测变更)
    pub etag: Option<String>,
    /// Content-Type
    pub content_type: Option<String>,
}

/// 本地文件元信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFileInfo {
    /// 相对路径 (相对于 vault)
    pub relative_path: String,
    /// 绝对路径
    pub absolute_path: String,
    /// 是否为目录
    pub is_dir: bool,
    /// 文件大小 (字节)
    pub size: u64,
    /// 最后修改时间 (Unix 时间戳，秒)
    pub modified: u64,
}

/// 同步动作类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SyncAction {
    /// 上传本地文件到远程
    Upload,
    /// 从远程下载到本地
    Download,
    /// 删除远程文件
    DeleteRemote,
    /// 删除本地文件
    DeleteLocal,
    /// 冲突 - 需要用户决定
    Conflict,
    /// 无需操作
    Skip,
}

/// 同步计划条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPlanItem {
    /// 相对路径
    pub path: String,
    /// 计划执行的动作
    pub action: SyncAction,
    /// 本地文件信息 (如果存在)
    pub local: Option<LocalFileInfo>,
    /// 远程文件信息 (如果存在)
    pub remote: Option<RemoteEntry>,
    /// 原因说明
    pub reason: String,
}

/// 同步计划
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPlan {
    /// 计划条目列表
    pub items: Vec<SyncPlanItem>,
    /// 待上传数量
    pub upload_count: usize,
    /// 待下载数量
    pub download_count: usize,
    /// 冲突数量
    pub conflict_count: usize,
}

/// 同步进度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    /// 当前阶段
    pub stage: SyncStage,
    /// 总文件数
    pub total: usize,
    /// 已处理数
    pub processed: usize,
    /// 当前处理的文件路径
    pub current_file: Option<String>,
    /// 错误信息 (如果有)
    pub error: Option<String>,
}

/// 同步阶段
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SyncStage {
    /// 空闲
    Idle,
    /// 连接中
    Connecting,
    /// 扫描远程文件
    ScanningRemote,
    /// 扫描本地文件
    ScanningLocal,
    /// 计算差异
    ComputingDiff,
    /// 同步中
    Syncing,
    /// 完成
    Completed,
    /// 错误
    Error,
}

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// 是否成功
    pub success: bool,
    /// 上传成功数
    pub uploaded: usize,
    /// 下载成功数
    pub downloaded: usize,
    /// 删除数
    pub deleted: usize,
    /// 冲突数
    pub conflicts: usize,
    /// 错误列表
    pub errors: Vec<SyncError>,
    /// 同步耗时 (毫秒)
    pub duration_ms: u64,
}

/// 同步错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncError {
    /// 文件路径
    pub path: String,
    /// 操作类型
    pub action: SyncAction,
    /// 错误信息
    pub message: String,
}

/// 同步状态记录 (用于增量同步)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    /// 上次同步时间 (Unix 时间戳)
    pub last_sync: u64,
    /// 文件同步记录
    pub file_records: Vec<FileRecord>,
}

/// 单个文件的同步记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    /// 相对路径
    pub path: String,
    /// 上次同步时的本地 mtime
    pub local_mtime: u64,
    /// 上次同步时的远程 mtime
    pub remote_mtime: u64,
    /// 上次同步时的 ETag
    pub etag: Option<String>,
}
