import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import type { FileEntry } from "@/lib/tauri";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useProfileStore } from "@/stores/useProfileStore";
import { usePublishStore } from "@/stores/usePublishStore";
import { publishSite } from "@/services/publish/exporter";
import { getDefaultPublishOutputDir } from "@/services/publish/config";

interface PublishSettingsSectionProps {
  vaultPath: string | null;
  fileTree: FileEntry[];
}

export function PublishSettingsSection({ vaultPath, fileTree }: PublishSettingsSectionProps) {
  const { t } = useLocaleStore();
  const profileConfig = useProfileStore((state) => state.config);
  const { config, setPublishConfig, resetOutputDir } = usePublishStore();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

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
          postsBasePath: config.postsBasePath || undefined,
          assetsBasePath: config.assetsBasePath || undefined,
        },
      });
      setResult(t.settingsModal.publishSuccess.replace("{path}", response.outputDir));
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

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.settingsModal.publish}
      </h3>

      <p className="text-sm text-muted-foreground">{t.settingsModal.publishDesc}</p>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{t.settingsModal.publishOutput}</div>
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

      <div className="flex items-center gap-2">
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {publishing ? t.settingsModal.publishInProgress : t.settingsModal.publishAction}
        </button>
        <button
          onClick={handleOpenFolder}
          disabled={!effectiveOutputDir}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.settingsModal.publishOpenFolder}
        </button>
        <span className="text-xs text-muted-foreground">{t.settingsModal.publishHint}</span>
      </div>

      {result && <div className="text-xs text-emerald-600">{result}</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </section>
  );
}
