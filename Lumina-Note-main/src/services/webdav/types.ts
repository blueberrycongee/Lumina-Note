/**
 * WebDAV 类型定义
 * 与后端 Rust 类型保持一致
 */

/** WebDAV 连接配置 */
export interface WebDAVConfig {
  /** 服务器 URL (如 https://dav.example.com/dav) */
  server_url: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 远程根目录 (如 /notes) */
  remote_base_path: string;
  /** 是否启用自动同步 */
  auto_sync: boolean;
  /** 自动同步间隔 (秒) */
  sync_interval_secs: number;
}

/** 创建默认配置 */
export function createDefaultConfig(): WebDAVConfig {
  return {
    server_url: '',
    username: '',
    password: '',
    remote_base_path: '/',
    auto_sync: false,
    sync_interval_secs: 300,
  };
}

/** 远程文件/目录信息 */
export interface RemoteEntry {
  /** 相对路径 */
  path: string;
  /** 文件名 */
  name: string;
  /** 是否为目录 */
  is_dir: boolean;
  /** 文件大小 (字节) */
  size: number;
  /** 最后修改时间 (Unix 时间戳，秒) */
  modified: number;
  /** ETag */
  etag: string | null;
  /** Content-Type */
  content_type: string | null;
}

/** 本地文件元信息 */
export interface LocalFileInfo {
  /** 相对路径 */
  relative_path: string;
  /** 绝对路径 */
  absolute_path: string;
  /** 是否为目录 */
  is_dir: boolean;
  /** 文件大小 (字节) */
  size: number;
  /** 最后修改时间 (Unix 时间戳，秒) */
  modified: number;
}

/** 同步动作类型 */
export type SyncAction =
  | 'Upload'
  | 'Download'
  | 'DeleteRemote'
  | 'DeleteLocal'
  | 'Conflict'
  | 'Skip';

/** 同步计划条目 */
export interface SyncPlanItem {
  /** 相对路径 */
  path: string;
  /** 计划执行的动作 */
  action: SyncAction;
  /** 本地文件信息 */
  local: LocalFileInfo | null;
  /** 远程文件信息 */
  remote: RemoteEntry | null;
  /** 原因说明 */
  reason: string;
}

/** 同步计划 */
export interface SyncPlan {
  /** 计划条目列表 */
  items: SyncPlanItem[];
  /** 待上传数量 */
  upload_count: number;
  /** 待下载数量 */
  download_count: number;
  /** 冲突数量 */
  conflict_count: number;
}

/** 同步阶段 */
export type SyncStage =
  | 'Idle'
  | 'Connecting'
  | 'ScanningRemote'
  | 'ScanningLocal'
  | 'ComputingDiff'
  | 'Syncing'
  | 'Completed'
  | 'Error';

/** 同步进度 */
export interface SyncProgress {
  /** 当前阶段 */
  stage: SyncStage;
  /** 总文件数 */
  total: number;
  /** 已处理数 */
  processed: number;
  /** 当前处理的文件路径 */
  current_file: string | null;
  /** 错误信息 */
  error: string | null;
}

/** 同步错误 */
export interface SyncError {
  /** 文件路径 */
  path: string;
  /** 操作类型 */
  action: SyncAction;
  /** 错误信息 */
  message: string;
}

/** 同步结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 上传成功数 */
  uploaded: number;
  /** 下载成功数 */
  downloaded: number;
  /** 删除数 */
  deleted: number;
  /** 冲突数 */
  conflicts: number;
  /** 错误列表 */
  errors: SyncError[];
  /** 同步耗时 (毫秒) */
  duration_ms: number;
}
