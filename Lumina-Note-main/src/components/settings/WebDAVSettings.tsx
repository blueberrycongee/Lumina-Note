/**
 * WebDAV 设置组件
 * 可以嵌入到 SettingsModal 或独立使用
 */

import { useState, useEffect } from 'react';
import { useWebDAVStore, useSyncStatusText } from '@/stores/useWebDAVStore';
import { useFileStore } from '@/stores/useFileStore';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';

interface WebDAVSettingsProps {
  /** 是否为紧凑模式（嵌入到设置面板） */
  compact?: boolean;
}

export function WebDAVSettings({ compact = false }: WebDAVSettingsProps) {
  const { vaultPath } = useFileStore();
  
  const {
    config,
    isConnected,
    connectionError,
    lastSyncResult,
    lastSyncTime,
    pendingSyncPlan,
    setConfig,
    testConnection,
    computeSyncPlan,
    executeSync,
    quickSync,
    clearError,
  } = useWebDAVStore();

  const statusText = useSyncStatusText();

  // 本地表单状态
  const [formData, setFormData] = useState({
    server_url: config.server_url,
    username: config.username,
    password: config.password,
    remote_base_path: config.remote_base_path,
    auto_sync: config.auto_sync,
    sync_interval_secs: config.sync_interval_secs,
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  // 同步表单状态到 store
  useEffect(() => {
    setFormData({
      server_url: config.server_url,
      username: config.username,
      password: config.password || '',
      remote_base_path: config.remote_base_path,
      auto_sync: config.auto_sync,
      sync_interval_secs: config.sync_interval_secs,
    });
  }, [config]);

  // 测试连接
  const handleTestConnection = async () => {
    setIsTesting(true);
    clearError();
    
    // 先保存配置
    setConfig(formData);
    
    try {
      await testConnection();
    } finally {
      setIsTesting(false);
    }
  };

  // 预览同步计划
  const handlePreviewSync = async () => {
    if (!vaultPath) return;
    
    setConfig(formData);
    await computeSyncPlan(vaultPath);
    setShowPlan(true);
  };

  // 执行同步
  const handleSync = async () => {
    if (!vaultPath) return;
    
    setIsSyncing(true);
    setConfig(formData);
    
    try {
      if (pendingSyncPlan) {
        await executeSync(vaultPath, pendingSyncPlan);
      } else {
        await quickSync(vaultPath);
      }
    } finally {
      setIsSyncing(false);
      setShowPlan(false);
    }
  };

  // 快速同步
  const handleQuickSync = async () => {
    if (!vaultPath) return;
    
    setIsSyncing(true);
    setConfig(formData);
    
    try {
      await quickSync(vaultPath);
    } finally {
      setIsSyncing(false);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const inputClass = `
    w-full px-3 py-2 rounded-lg text-sm
    bg-white/5 border border-white/10
    focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30
    placeholder:text-muted-foreground/50
    transition-all
  `;

  const buttonClass = `
    px-4 py-2 rounded-lg text-sm font-medium
    transition-all hover:scale-[1.02] active:scale-[0.98]
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6 p-6'}>
      {/* 标题和状态 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Cloud size={20} className="text-green-400" />
          ) : (
            <CloudOff size={20} className="text-muted-foreground" />
          )}
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            WebDAV Sync
          </h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          isConnected 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-muted text-muted-foreground'
        }`}>
          {statusText}
        </span>
      </div>

      {/* 错误提示 */}
      {connectionError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-sm text-red-400">{connectionError}</span>
          <button
            onClick={clearError}
            className="ml-auto p-1 hover:bg-red-500/20 rounded"
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      {/* 配置表单 */}
      <div className="space-y-4">
        {/* 服务器 URL */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Server URL</label>
          <input
            type="url"
            value={formData.server_url}
            onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
            placeholder="https://dav.example.com/dav"
            className={inputClass}
          />
        </div>

        {/* 用户名和密码 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="username"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
              >
                {showPassword ? (
                  <EyeOff size={14} className="text-muted-foreground" />
                ) : (
                  <Eye size={14} className="text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 远程路径 */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Remote Path</label>
          <input
            type="text"
            value={formData.remote_base_path}
            onChange={(e) => setFormData({ ...formData, remote_base_path: e.target.value })}
            placeholder="/notes"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground/70">
            Base directory on the server for syncing
          </p>
        </div>

        {/* 自动同步 */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div>
            <p className="text-sm font-medium">Auto Sync</p>
            <p className="text-xs text-muted-foreground">
              Sync every {formData.sync_interval_secs / 60} minutes
            </p>
          </div>
          <button
            onClick={() => setFormData({ ...formData, auto_sync: !formData.auto_sync })}
            className={`
              relative w-11 h-6 rounded-full transition-colors
              ${formData.auto_sync ? 'bg-primary' : 'bg-white/20'}
            `}
          >
            <div
              className={`
                absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${formData.auto_sync ? 'left-6' : 'left-1'}
              `}
            />
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleTestConnection}
          disabled={isTesting || !formData.server_url}
          className={`${buttonClass} bg-white/10 hover:bg-white/20`}
        >
          {isTesting ? (
            <Loader2 size={14} className="animate-spin mr-2 inline" />
          ) : isConnected ? (
            <Check size={14} className="text-green-400 mr-2 inline" />
          ) : null}
          Test Connection
        </button>

        <button
          onClick={handlePreviewSync}
          disabled={!isConnected || isSyncing || !vaultPath}
          className={`${buttonClass} bg-white/10 hover:bg-white/20`}
        >
          Preview Sync
        </button>

        <button
          onClick={handleQuickSync}
          disabled={!isConnected || isSyncing || !vaultPath}
          className={`${buttonClass} bg-primary/80 hover:bg-primary text-primary-foreground`}
        >
          {isSyncing ? (
            <Loader2 size={14} className="animate-spin mr-2 inline" />
          ) : (
            <RefreshCw size={14} className="mr-2 inline" />
          )}
          Sync Now
        </button>
      </div>

      {/* 同步计划预览 */}
      {showPlan && pendingSyncPlan && (
        <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Sync Plan</h4>
            <button
              onClick={() => setShowPlan(false)}
              className="p-1 hover:bg-white/10 rounded"
            >
              <X size={14} />
            </button>
          </div>
          
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1">
              <Upload size={12} className="text-blue-400" />
              {pendingSyncPlan.upload_count} to upload
            </span>
            <span className="flex items-center gap-1">
              <Download size={12} className="text-green-400" />
              {pendingSyncPlan.download_count} to download
            </span>
            {pendingSyncPlan.conflict_count > 0 && (
              <span className="flex items-center gap-1 text-yellow-400">
                <AlertCircle size={12} />
                {pendingSyncPlan.conflict_count} conflicts
              </span>
            )}
          </div>

          {pendingSyncPlan.items.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {pendingSyncPlan.items.slice(0, 20).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/5"
                >
                  {item.action === 'Upload' && <Upload size={10} className="text-blue-400" />}
                  {item.action === 'Download' && <Download size={10} className="text-green-400" />}
                  {item.action === 'DeleteRemote' && <Trash2 size={10} className="text-red-400" />}
                  {item.action === 'DeleteLocal' && <Trash2 size={10} className="text-orange-400" />}
                  {item.action === 'Conflict' && <AlertCircle size={10} className="text-yellow-400" />}
                  <span className="truncate flex-1">{item.path}</span>
                  <span className="text-muted-foreground">{item.reason}</span>
                </div>
              ))}
              {pendingSyncPlan.items.length > 20 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  ... and {pendingSyncPlan.items.length - 20} more
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`${buttonClass} w-full bg-primary/80 hover:bg-primary text-primary-foreground`}
          >
            {isSyncing ? (
              <Loader2 size={14} className="animate-spin mr-2 inline" />
            ) : (
              <Check size={14} className="mr-2 inline" />
            )}
            Execute Sync
          </button>
        </div>
      )}

      {/* 上次同步信息 */}
      {lastSyncResult && (
        <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-white/5">
          <p>Last sync: {formatTime(lastSyncTime)}</p>
          <p>
            {lastSyncResult.uploaded} uploaded, {lastSyncResult.downloaded} downloaded
            {lastSyncResult.conflicts > 0 && `, ${lastSyncResult.conflicts} conflicts`}
          </p>
          {lastSyncResult.errors.length > 0 && (
            <p className="text-red-400">
              {lastSyncResult.errors.length} errors occurred
            </p>
          )}
        </div>
      )}
    </div>
  );
}
