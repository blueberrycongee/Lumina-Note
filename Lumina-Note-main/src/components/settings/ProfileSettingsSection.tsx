import { useMemo } from "react";
import type { FileEntry } from "@/lib/tauri";
import { useProfileStore } from "@/stores/useProfileStore";
import { getFileName } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface ProfileSettingsSectionProps {
  fileTree: FileEntry[];
}

const PIN_LIMIT = 3;

const flattenMarkdownFiles = (entries: FileEntry[]): { path: string; title: string }[] => {
  const files: { path: string; title: string }[] = [];
  const walk = (nodes: FileEntry[]) => {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        walk(node.children);
      } else if (!node.is_dir && node.name.toLowerCase().endsWith(".md")) {
        files.push({
          path: node.path,
          title: getFileName(node.name).replace(/\.md$/i, ""),
        });
      }
    }
  };
  walk(entries);
  return files;
};

export function ProfileSettingsSection({ fileTree }: ProfileSettingsSectionProps) {
  const { t } = useLocaleStore();
  const { config, setProfileConfig, setPinnedNotePaths } = useProfileStore();

  const files = useMemo(() => flattenMarkdownFiles(fileTree), [fileTree]);
  const pinnedSet = new Set(config.pinnedNotePaths);

  const togglePinned = (path: string) => {
    if (!path) return;
    const pinned = config.pinnedNotePaths;
    if (pinned.includes(path)) {
      setPinnedNotePaths(pinned.filter((p) => p !== path));
      return;
    }
    if (pinned.length >= PIN_LIMIT) return;
    setPinnedNotePaths([...pinned, path]);
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.settingsModal.profile}
      </h3>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-foreground/90">{t.settingsModal.profileDisplayName}</span>
          <input
            aria-label="Profile display name"
            value={config.displayName}
            onChange={(e) => setProfileConfig({ displayName: e.target.value })}
            className="px-3 py-2 rounded-lg text-sm bg-background/60 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={t.settingsModal.profileDisplayNamePlaceholder}
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-foreground/90">{t.settingsModal.profileBio}</span>
          <textarea
            aria-label="Profile bio"
            value={config.bio}
            onChange={(e) => setProfileConfig({ bio: e.target.value })}
            className="min-h-[90px] px-3 py-2 rounded-lg text-sm bg-background/60 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={t.settingsModal.profileBioPlaceholder}
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-foreground/90">{t.settingsModal.profileAvatar}</span>
          <input
            aria-label="Profile avatar url"
            value={config.avatarUrl}
            onChange={(e) => setProfileConfig({ avatarUrl: e.target.value })}
            className="px-3 py-2 rounded-lg text-sm bg-background/60 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={t.settingsModal.profileAvatarPlaceholder}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground/90">{t.settingsModal.profilePinned}</span>
          <span className="text-xs text-muted-foreground">
            {config.pinnedNotePaths.length}/{PIN_LIMIT}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-background/60 p-2 max-h-40 overflow-auto space-y-1">
          {files.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-1">
              {t.settingsModal.profilePinnedEmpty}
            </div>
          )}
          {files.map((file) => {
            const checked = pinnedSet.has(file.path);
            const disabled = !checked && config.pinnedNotePaths.length >= PIN_LIMIT;
            return (
              <label key={file.path} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/40">
                <input
                  type="checkbox"
                  aria-label={`Pin ${file.title}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => togglePinned(file.path)}
                />
                <span className="text-sm text-foreground/90">{file.title}</span>
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}
