import { useMemo, useState } from 'react';
import { useWebDAVStore, useSyncStatusText } from '@/stores/useWebDAVStore';
import { useFileStore } from '@/stores/useFileStore';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import {
  AlertCircle,
  Check,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';

interface WebDAVSettingsProps {
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
    testConnection,
    computeSyncPlan,
    executeSync,
    quickSync,
    clearError,
  } = useWebDAVStore();
  const {
    serverBaseUrl,
    email,
    password,
    session,
    authStatus,
    isLoading,
    error,
    autoSync,
    syncIntervalSecs,
    setServerBaseUrl,
    setEmail,
    setPassword,
    setSyncPreferences,
    register,
    login,
    logout,
    selectWorkspace,
    createWorkspace,
  } = useCloudSyncStore();

  const statusText = useSyncStatusText();
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const currentWorkspaceId = session?.currentWorkspaceId ?? '';
  const hasSession = Boolean(session);
  const combinedError = error || connectionError;
  const canManageSync = hasSession && Boolean(vaultPath) && Boolean(config.server_url);

  const currentWorkspaceName = useMemo(() => {
    if (!session || !currentWorkspaceId) return '';
    return session.workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.name ?? '';
  }, [currentWorkspaceId, session]);

  const handleAuth = async (mode: 'register' | 'login') => {
    if (combinedError) {
      clearError();
    }

    if (mode === 'register') {
      await register();
      return;
    }
    await login();
  };

  const handlePreviewSync = async () => {
    if (!vaultPath) return;
    await computeSyncPlan(vaultPath);
    setShowPlan(true);
  };

  const handleSync = async () => {
    if (!vaultPath) return;

    setIsSyncing(true);
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

  const handleQuickSync = async () => {
    if (!vaultPath) return;

    setIsSyncing(true);
    try {
      await quickSync(vaultPath);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;

    setIsCreatingWorkspace(true);
    try {
      const workspace = await createWorkspace(name);
      if (workspace) {
        setNewWorkspaceName('');
      }
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    clearError();
    try {
      await testConnection();
    } finally {
      setIsTesting(false);
    }
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Cloud size={20} className="text-green-400" />
          ) : (
            <CloudOff size={20} className="text-muted-foreground" />
          )}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Cloud Sync
            </h3>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Sign in once, pick a workspace, then sync through the derived WebDAV endpoint.
            </p>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
          }`}
        >
          {statusText}
        </span>
      </div>

      {combinedError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-sm text-red-400">{combinedError}</span>
          <button onClick={clearError} className="ml-auto p-1 hover:bg-red-500/20 rounded">
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">Cloud Account</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Register or log in to bind the current vault to a hosted workspace.
            </p>
          </div>
          {hasSession && (
            <button
              type="button"
              onClick={logout}
              className={`${buttonClass} bg-white/10 hover:bg-white/20 inline-flex items-center gap-2`}
            >
              <LogOut size={14} />
              Logout
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cloud-server" className="text-xs text-muted-foreground">
            Cloud server
          </label>
          <input
            id="cloud-server"
            type="url"
            value={serverBaseUrl}
            onChange={(event) => setServerBaseUrl(event.target.value)}
            placeholder="https://sync.example.com"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="cloud-email" className="text-xs text-muted-foreground">
              Email
            </label>
            <input
              id="cloud-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cloud-password" className="text-xs text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id="cloud-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAuth('register')}
            disabled={isLoading || !serverBaseUrl || !email || !password}
            className={`${buttonClass} bg-white/10 hover:bg-white/20 inline-flex items-center gap-2`}
          >
            {isLoading && authStatus === 'authenticating' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Register
          </button>
          <button
            type="button"
            onClick={() => handleAuth('login')}
            disabled={isLoading || !serverBaseUrl || !email || !password}
            className={`${buttonClass} bg-primary/80 hover:bg-primary text-primary-foreground inline-flex items-center gap-2`}
          >
            {isLoading && authStatus === 'authenticating' ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            Login
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
        <div>
          <h4 className="text-sm font-medium text-foreground">Workspace Binding</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the cloud workspace that should back the current vault.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <label htmlFor="cloud-workspace" className="text-xs text-muted-foreground">
              Cloud workspace
            </label>
            <select
              id="cloud-workspace"
              aria-label="Cloud workspace"
              value={currentWorkspaceId}
              onChange={(event) => selectWorkspace(event.target.value)}
              disabled={!hasSession || session.workspaces.length === 0}
              className={`${inputClass} disabled:opacity-60`}
            >
              {!hasSession && <option value="">Sign in first</option>}
              {hasSession && session.workspaces.length === 0 && <option value="">No workspace yet</option>}
              {session?.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-cloud-workspace" className="text-xs text-muted-foreground">
              Create workspace
            </label>
            <div className="flex gap-2">
              <input
                id="new-cloud-workspace"
                type="text"
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                className={inputClass}
                disabled={!hasSession}
              />
              <button
                type="button"
                onClick={handleCreateWorkspace}
                disabled={!hasSession || !newWorkspaceName.trim() || isCreatingWorkspace}
                className={`${buttonClass} bg-white/10 hover:bg-white/20 inline-flex items-center gap-2 whitespace-nowrap`}
              >
                {isCreatingWorkspace ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="derived-dav-url" className="text-xs text-muted-foreground">
              Derived WebDAV URL
            </label>
            <input id="derived-dav-url" type="text" value={config.server_url} readOnly disabled className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="derived-remote-path" className="text-xs text-muted-foreground">
              Derived remote path
            </label>
            <input id="derived-remote-path" type="text" value={config.remote_base_path} readOnly disabled className={inputClass} />
          </div>
        </div>

        {currentWorkspaceName && (
          <p className="text-xs text-muted-foreground">
            Current binding: <span className="text-foreground">{currentWorkspaceName}</span>
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div>
            <p className="text-sm font-medium">Auto Sync</p>
            <p className="text-xs text-muted-foreground">Sync every {syncIntervalSecs / 60} minutes</p>
          </div>
          <button
            type="button"
            onClick={() => setSyncPreferences({ autoSync: !autoSync })}
            className={`relative w-11 h-6 rounded-full transition-colors ${autoSync ? 'bg-primary' : 'bg-white/20'}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoSync ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !config.server_url}
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
            disabled={!isConnected || isSyncing || !canManageSync}
            className={`${buttonClass} bg-white/10 hover:bg-white/20`}
          >
            Preview Sync
          </button>

          <button
            onClick={handleQuickSync}
            disabled={!isConnected || isSyncing || !canManageSync}
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
      </div>

      {showPlan && pendingSyncPlan && (
        <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Sync Plan</h4>
            <button onClick={() => setShowPlan(false)} className="p-1 hover:bg-white/10 rounded">
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
              {pendingSyncPlan.items.slice(0, 20).map((item, index) => (
                <div key={`${item.path}-${index}`} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/5">
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

          {pendingSyncPlan.conflict_count > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200">
              Conflicts stay pending and are skipped during execution. Review the highlighted entries before trusting the sync result.
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

      {lastSyncResult && (
        <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-white/5">
          <p>Last sync: {formatTime(lastSyncTime)}</p>
          <p>
            {lastSyncResult.uploaded} uploaded, {lastSyncResult.downloaded} downloaded
            {lastSyncResult.conflicts > 0 && `, ${lastSyncResult.conflicts} conflicts`}
          </p>
          {lastSyncResult.errors.length > 0 && <p className="text-red-400">{lastSyncResult.errors.length} errors occurred</p>}
        </div>
      )}
    </div>
  );
}
