import { useMemo, useState } from "react";
import { openDialog } from "@/lib/host";
import { openExternal } from "@/lib/host";
import { Cloud, Copy, Check, Loader2 } from "lucide-react";
import type { FileEntry } from "@/lib/host";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useProfileStore } from "@/stores/useProfileStore";
import { usePublishStore } from "@/stores/usePublishStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { publishSite } from "@/services/publish/exporter";
import { getDefaultPublishOutputDir } from "@/services/publish/config";
import {
  uploadSiteToCloud,
  confirmCloudPublish,
  unpublishFromCloud,
} from "@/services/publish/cloudUpload";

interface PublishSettingsSectionProps {
  vaultPath: string | null;
  fileTree: FileEntry[];
}

export function PublishSettingsSection({
  vaultPath,
  fileTree,
}: PublishSettingsSectionProps) {
  const { t } = useLocaleStore();
  const profileConfig = useProfileStore((state) => state.config);
  const { config, setPublishConfig, resetOutputDir } = usePublishStore();
  const {
    cloudStatus,
    uploadProgress,
    publishedUrl,
    lastPublishedAt,
    cloudError,
    setCloudStatus,
    setUploadProgress,
    setPublishedUrl,
    setLastPublishedAt,
    setCloudError,
    resetCloudState,
  } = usePublishStore();
  const authStatus = useCloudSyncStore((s) => s.authStatus);
  const cloudSession = useCloudSyncStore((s) => s.session);
  const cloudBaseUrl = useCloudSyncStore((s) => s.serverBaseUrl);
  const cloudEmail = useCloudSyncStore((s) => s.email);
  const cloudPassword = useCloudSyncStore((s) => s.password);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const effectiveOutputDir = useMemo(() => {
    if (config.outputDir?.trim()) return config.outputDir.trim();
    return vaultPath ? getDefaultPublishOutputDir(vaultPath) : "";
  }, [config.outputDir, vaultPath]);

  const handleChooseDir = async () => {
    if (!vaultPath) {
      setError(t.settingsModal.publishOpenVaultFirst);
      return;
    }
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t.settingsModal.publishChooseFolder,
    });
    if (typeof selected === "string") {
      setPublishConfig({ outputDir: selected });
    }
  };

  const handlePublish = async () => {
    if (!vaultPath) {
      setError(t.settingsModal.publishOpenVaultFirst);
      return;
    }
    setPublishing(true);
    setError(null);
    setResult(null);
    try {
      const response = await publishSite({
        vaultPath,
        fileTree,
        profile: profileConfig,
        options: {
          outputDir: config.outputDir || undefined,
          basePath: config.basePath || undefined,
          postsBasePath: config.postsBasePath || undefined,
          assetsBasePath: config.assetsBasePath || undefined,
        },
      });
      setResult(
        t.settingsModal.publishSuccess.replace("{path}", response.outputDir),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t.settingsModal.publishFailed}: ${message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!effectiveOutputDir) return;
    try {
      await openExternal(effectiveOutputDir);
    } catch (err) {
      console.warn("Failed to open publish folder", err);
    }
  };

  const handleCloudPublish = async () => {
    if (!vaultPath || !cloudSession?.token || !cloudBaseUrl) return;
    setCloudStatus("uploading");
    setCloudError(null);
    setUploadProgress(null);
    try {
      // 1. Generate static site to temp dir
      const response = await publishSite({
        vaultPath,
        fileTree,
        profile: profileConfig,
        options: { basePath: config.basePath || undefined },
      });

      // 2. Upload to cloud via WebDAV
      await uploadSiteToCloud({
        localDir: response.outputDir,
        baseUrl: cloudBaseUrl,
        email: cloudEmail,
        password: cloudPassword,
        token: cloudSession.token,
        onProgress: (current, total) => setUploadProgress({ current, total }),
      });

      // 3. Confirm publish on server
      const result = await confirmCloudPublish(
        cloudBaseUrl,
        cloudSession.token,
      );
      setPublishedUrl(`${cloudBaseUrl}${result.url}`);
      setLastPublishedAt(Date.now());
      setCloudStatus("published");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCloudError(message);
      setCloudStatus("error");
    }
  };

  const handleUnpublish = async () => {
    if (!cloudSession?.token || !cloudBaseUrl) return;
    if (!confirm(t.settingsModal.cloudUnpublishConfirm)) return;
    try {
      await unpublishFromCloud(cloudBaseUrl, cloudSession.token);
      resetCloudState();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCloudError(message);
    }
  };

  const handleCopyUrl = () => {
    if (!publishedUrl) return;
    navigator.clipboard.writeText(publishedUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t.settingsModal.publish}
        </h3>

        <p className="text-sm text-muted-foreground">
          {t.settingsModal.publishDesc}
        </p>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">
                {t.settingsModal.publishOutput}
              </div>
              <div className="mt-1 text-sm text-foreground/90 break-all">
                {effectiveOutputDir || t.settingsModal.publishOutputEmpty}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleChooseDir}
                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background/60 hover:bg-muted transition-colors"
              >
                {t.settingsModal.publishChooseFolder}
              </button>
              {config.outputDir && (
                <button
                  onClick={resetOutputDir}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background/60 hover:bg-muted transition-colors"
                >
                  {t.settingsModal.publishUseDefault}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t.settingsModal.publishBasePath}
            </span>
            <input
              value={config.basePath}
              onChange={(e) => setPublishConfig({ basePath: e.target.value })}
              placeholder={t.settingsModal.publishBasePathPlaceholder}
              className="px-3 py-2 rounded-lg text-sm bg-background/60 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {publishing
              ? t.settingsModal.publishInProgress
              : t.settingsModal.publishAction}
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={!effectiveOutputDir}
            className="px-3 py-2 text-sm rounded-lg border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          >
            {t.settingsModal.publishOpenFolder}
          </button>
          <span className="text-xs text-muted-foreground">
            {t.settingsModal.publishHint}
          </span>
        </div>

        {result && <div className="text-xs text-emerald-600">{result}</div>}
        {error && <div className="text-xs text-destructive">{error}</div>}
      </section>

      {/* Divider */}
      <div className="border-t border-border/40 my-6" />

      {/* Cloud Publish Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t.settingsModal.publishToCloud}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t.settingsModal.publishToCloudDesc}
        </p>

        {authStatus !== "authenticated" ? (
          <p className="text-sm text-muted-foreground">
            {t.settingsModal.cloudSignInToPublish}
          </p>
        ) : cloudStatus === "uploading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>{t.settingsModal.cloudPublishing}</span>
            {uploadProgress && (
              <span>
                {t.settingsModal.cloudUploadProgress
                  .replace("{current}", String(uploadProgress.current))
                  .replace("{total}", String(uploadProgress.total))}
              </span>
            )}
          </div>
        ) : cloudStatus === "published" || publishedUrl ? (
          <div className="space-y-3">
            {/* URL row */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t.settingsModal.cloudPublicUrl}:
              </span>
              <a
                href={publishedUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate max-w-[300px]"
              >
                {publishedUrl}
              </a>
              <button
                onClick={handleCopyUrl}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                {urlCopied ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-muted-foreground" />
                )}
              </button>
            </div>
            {/* Timestamp */}
            {lastPublishedAt && (
              <p className="text-xs text-muted-foreground">
                {t.settingsModal.cloudLastPublished}:{" "}
                {new Date(lastPublishedAt).toLocaleString()}
              </p>
            )}
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCloudPublish}
                disabled={!vaultPath}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {t.settingsModal.cloudUpdatePublish}
              </button>
              <button
                onClick={handleUnpublish}
                className="px-3 py-1.5 text-sm rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {t.settingsModal.cloudUnpublish}
              </button>
            </div>
          </div>
        ) : cloudStatus === "error" ? (
          <div className="space-y-2">
            <div className="text-xs text-destructive">
              {t.settingsModal.cloudPublishFailed}: {cloudError}
            </div>
            <button
              onClick={handleCloudPublish}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t.settingsModal.publishToCloud}
            </button>
          </div>
        ) : (
          <button
            onClick={handleCloudPublish}
            disabled={!vaultPath}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
          >
            <Cloud size={16} />
            {t.settingsModal.publishToCloud}
          </button>
        )}
      </section>
    </>
  );
}
