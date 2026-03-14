import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  File,
  FileText,
  Folder,
} from "lucide-react";
import { cn, getFileName } from "@/lib/utils";
import { join } from "@/lib/path";
import { openFilteredView } from "@/lib/events";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useOpenClawWorkspaceStore } from "@/stores/useOpenClawWorkspaceStore";
import { ensureOpenClawTodayMemoryNote } from "@/services/openclaw/workspace";
import { readOpenClawCronJobs, type OpenClawCronJob } from "@/services/openclaw/cron";
import { pluginRuntime } from "@/services/plugins/runtime";
import { reportOperationError } from "@/lib/reportError";
import type { FileEntry } from "@/lib/tauri";
import { useErrorStore } from "@/stores/useErrorStore";

interface MountedWorkspaceTreeItemProps {
  entry: FileEntry;
  level: number;
  currentFile: string | null;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  onOpen: (path: string) => void;
}

interface OpenClawSectionProps {
  vaultPath: string;
  currentFile: string | null;
  openFile: (path: string) => void;
  focusTreePath: (path: string) => void;
  expandedMountedPaths: Set<string>;
  toggleMountedExpanded: (path: string) => void;
}

export function OpenClawSection({
  vaultPath,
  currentFile,
  openFile,
  focusTreePath,
  expandedMountedPaths,
  toggleMountedExpanded,
}: OpenClawSectionProps) {
  const { t } = useLocaleStore();
  const pushNotice = useErrorStore((state) => state.pushNotice);
  const openClawSnapshotsByHost = useOpenClawWorkspaceStore((state) => state.snapshotsByHostPath);
  const openClawAttachmentsByHost = useOpenClawWorkspaceStore((state) => state.attachmentsByHostPath);
  const openClawIntegrationEnabled = useOpenClawWorkspaceStore((state) => state.integrationEnabled);
  const openClawMountedTree = useOpenClawWorkspaceStore((state) => state.getMountedFileTree(vaultPath));

  const openClawSnapshot = openClawIntegrationEnabled && vaultPath ? openClawSnapshotsByHost[vaultPath] ?? null : null;
  const openClawAttachment = openClawIntegrationEnabled && vaultPath ? openClawAttachmentsByHost[vaultPath] ?? null : null;

  const reportSuccessNotice = useCallback(
    (action: string, message: string) => {
      pushNotice({
        title: t.sidebar.openClawActionSuccessTitle,
        message,
        level: "info",
        source: "OpenClawSection",
        action,
      });
    },
    [pushNotice, t.sidebar.openClawActionSuccessTitle],
  );

  // Wrapped focusTreePath with error handling
  const handleFocusTreePath = useCallback(
    (targetPath: string, label: string) => {
      try {
        if (!targetPath) {
          reportOperationError({
            source: 'OpenClawSection.handleFocusTreePath',
            action: 'Focus tree path',
            error: new Error('Path is empty'),
            userMessage: t.sidebar.openClawPathNotFound.replace('{label}', label),
            level: 'warning',
            context: { label, path: targetPath },
          });
          return;
        }
        if (!vaultPath || !targetPath.startsWith(vaultPath)) {
          reportOperationError({
            source: "OpenClawSection.handleFocusTreePath",
            action: "Focus tree path",
            error: new Error("Path is outside workspace"),
            userMessage: t.sidebar.openClawPathOutsideWorkspace.replace("{label}", label),
            level: "warning",
            context: { label, path: targetPath, vaultPath },
          });
          return;
        }
        focusTreePath(targetPath);
        reportSuccessNotice("Focus tree path", t.sidebar.openClawFocusPathSuccess.replace("{label}", label));
      } catch (error) {
        reportOperationError({
          source: 'OpenClawSection.handleFocusTreePath',
          action: 'Focus tree path',
          error,
          userMessage: t.sidebar.openClawFocusPathError.replace('{label}', label),
          level: 'error',
          context: { label, path: targetPath },
        });
      }
    },
    [focusTreePath, reportSuccessNotice, t.sidebar, vaultPath],
  );

  // Wrapped openFilteredView with error handling
  const handleOpenFilteredView = useCallback(
    (scopeLabel: string, pathPrefixes: string[], label: string) => {
      try {
        if (!pathPrefixes || pathPrefixes.length === 0) {
          reportOperationError({
            source: 'OpenClawSection.handleOpenFilteredView',
            action: 'Open filtered view',
            error: new Error('No paths provided'),
            userMessage: t.sidebar.openClawNoPathsToSearch.replace('{label}', label),
            level: 'warning',
            context: { label, scopeLabel, pathPrefixes },
          });
          return;
        }
        openFilteredView(scopeLabel, pathPrefixes);
        reportSuccessNotice("Open filtered view", t.sidebar.openClawSearchOpened.replace("{label}", label));
      } catch (error) {
        reportOperationError({
          source: 'OpenClawSection.handleOpenFilteredView',
          action: 'Open filtered view',
          error,
          userMessage: t.sidebar.openClawSearchError.replace('{label}', label),
          level: 'error',
          context: { label, scopeLabel, pathPrefixes },
        });
      }
    },
    [reportSuccessNotice, t.sidebar],
  );

  const openClawRecentMemoryEntries = useMemo(
    () => openClawSnapshot?.recentMemoryPaths.slice(0, 4) ?? [],
    [openClawSnapshot?.recentMemoryPaths],
  );

  const openClawArtifactDirectories = useMemo(
    () => openClawSnapshot?.artifactDirectoryPaths ?? [],
    [openClawSnapshot?.artifactDirectoryPaths],
  );

  const openClawPlanEntries = useMemo(
    () => openClawSnapshot?.planFilePaths.slice(0, 4) ?? [],
    [openClawSnapshot?.planFilePaths],
  );

  const openClawBridgeEntries = useMemo(
    () => openClawSnapshot?.bridgeNotePaths.slice(0, 2) ?? [],
    [openClawSnapshot?.bridgeNotePaths],
  );

  const [openClawCronJobs, setOpenClawCronJobs] = useState<OpenClawCronJob[]>([]);

  useEffect(() => {
    if (!openClawAttachment || openClawAttachment.status !== "attached") {
      setOpenClawCronJobs([]);
      return;
    }
    const ocPath = openClawAttachment.workspacePath;
    if (!ocPath) return;
    let cancelled = false;
    readOpenClawCronJobs(ocPath).then(
      (jobs) => { if (!cancelled) setOpenClawCronJobs(jobs); },
      (error) => {
        if (!cancelled) {
          setOpenClawCronJobs([]);
          reportOperationError({
            source: "OpenClawSection.loadCronJobs",
            action: "Load OpenClaw cron jobs",
            error,
            userMessage: t.sidebar.openClawCronLoadError.replace('{error}', error instanceof Error ? error.message : String(error)),
          });
        }
      },
    );
    return () => { cancelled = true; };
  }, [openClawAttachment, t.sidebar.openClawCronLoadError]);

  const openCronEditor = useCallback((jobId?: string) => {
    try {
      if (jobId) {
        const actions = pluginRuntime.getTabActions("openclaw-workspace:openclaw-workspace-overview");
        if (actions["edit-cron-job"]) {
          Promise.resolve(actions["edit-cron-job"]({ jobId })).catch((error) => {
            reportOperationError({
              source: "OpenClawSection.openCronEditor",
              action: "Open cron job editor",
              error,
              userMessage: t.sidebar.openClawCronToggleError.replace('{error}', error instanceof Error ? error.message : String(error)),
            });
          });
          return;
        }
      }
      if (!pluginRuntime.executeCommand("plugin-command:openclaw-workspace:openclaw-workspace:create-cron-job")) {
        reportOperationError({
          source: "OpenClawSection.openCronEditor",
          action: "Open cron job editor",
          error: new Error(t.sidebar.openClawCronPluginUnavailable),
          userMessage: t.sidebar.openClawCronPluginUnavailable,
        });
      }
    } catch (error) {
      reportOperationError({
        source: "OpenClawSection.openCronEditor",
        action: "Open cron job editor",
        error,
        userMessage: t.sidebar.openClawCronToggleError.replace('{error}', error instanceof Error ? error.message : String(error)),
      });
    }
  }, [t.sidebar.openClawCronPluginUnavailable, t.sidebar.openClawCronToggleError]);

  if (!openClawSnapshot || (openClawSnapshot.status !== "detected" && !openClawAttachment)) {
    return null;
  }

  return (
    <div className="px-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">
            {t.sidebar.openClawTitle}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {openClawAttachment ? t.sidebar.openClawAttached : t.sidebar.openClawDetected}
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {t.sidebar.openClawArtifacts.replace("{count}", String(openClawSnapshot.artifactFileCount))}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {[
          { label: "AGENTS.md", path: join(openClawSnapshot.workspacePath, "AGENTS.md") },
          { label: "SOUL.md", path: join(openClawSnapshot.workspacePath, "SOUL.md") },
          { label: "USER.md", path: join(openClawSnapshot.workspacePath, "USER.md") },
        ].map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => void openFile(entry.path)}
            className="truncate rounded-md border border-border bg-background/60 px-2 py-1 text-left text-[11px] text-foreground hover:bg-accent"
          >
            {entry.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void ensureOpenClawTodayMemoryNote(openClawSnapshot.workspacePath).then(openFile)}
          className="truncate rounded-md border border-border bg-background/60 px-2 py-1 text-left text-[11px] text-foreground hover:bg-accent"
        >
          {t.sidebar.openClawTodayMemory}
        </button>
      </div>

      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">
          {t.sidebar.openClawRecentMemory}
        </div>
        {openClawRecentMemoryEntries.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">{t.sidebar.openClawNoRecentMemory}</div>
        ) : (
          openClawRecentMemoryEntries.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => void openFile(path)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{getFileName(path).replace(/\.md$/i, "")}</span>
              <FileText className="h-3 w-3 shrink-0" />
            </button>
          ))
        )}
      </div>

      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">
          {t.sidebar.openClawPlans}
        </div>
        {openClawPlanEntries.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">{t.sidebar.openClawNoPlans}</div>
        ) : (
          openClawPlanEntries.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => void openFile(path)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{getFileName(path)}</span>
              <FileText className="h-3 w-3 shrink-0" />
            </button>
          ))
        )}
      </div>

      {openClawBridgeEntries.length > 0 && (
        <div className="mb-2 space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground">
            {t.sidebar.openClawBridgeNotes}
          </div>
          {openClawBridgeEntries.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => void openFile(path)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{getFileName(path)}</span>
              <FileText className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground">
            {t.sidebar.openClawCronJobs}
          </div>
          <button
            type="button"
            onClick={() => openCronEditor()}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            title={t.sidebar.openClawCreateCronJob}
          >
            +
          </button>
        </div>
        {openClawCronJobs.length === 0 ? (
          <button
            type="button"
            onClick={() => openCronEditor()}
            className="w-full rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground text-left"
          >
            {t.sidebar.openClawNoCronJobs}
          </button>
        ) : (
          openClawCronJobs.slice(0, 5).map((job) => (
            <button
              key={job.jobId}
              type="button"
              onClick={() => openCronEditor(job.jobId)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
            >
              <span className="truncate">
                {job.name}
                {!job.enabled && <span className="ml-1 opacity-50">({t.sidebar.openClawCronJobDisabled})</span>}
              </span>
              <Clock className="h-3 w-3 shrink-0" />
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {openClawSnapshot.memoryDirectoryPath && (
          <button
            type="button"
            onClick={() => handleFocusTreePath(openClawSnapshot.memoryDirectoryPath as string, t.sidebar.openClawMemoryFolder)}
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.sidebar.openClawMemoryFolder}
          </button>
        )}
        {openClawArtifactDirectories.map((path) => (
          <button
            key={path}
            type="button"
            onClick={() => handleFocusTreePath(path, getFileName(path))}
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {getFileName(path)}
          </button>
        ))}
        {openClawSnapshot.memoryDirectoryPath && (
          <button
            type="button"
            onClick={() =>
              handleOpenFilteredView(t.sidebar.openClawSearchMemory, [
                openClawSnapshot.memoryDirectoryPath as string,
              ], t.sidebar.openClawSearchMemory)
            }
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.sidebar.openClawSearchMemory}
          </button>
        )}
        {openClawSnapshot.planDirectoryPaths.length > 0 && (
          <button
            type="button"
            onClick={() =>
              handleOpenFilteredView(t.sidebar.openClawSearchPlans, openClawSnapshot.planDirectoryPaths, t.sidebar.openClawSearchPlans)
            }
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.sidebar.openClawSearchPlans}
          </button>
        )}
        {openClawArtifactDirectories.length > 0 && (
          <button
            type="button"
            onClick={() =>
              handleOpenFilteredView(t.sidebar.openClawSearchArtifacts, openClawArtifactDirectories, t.sidebar.openClawSearchArtifacts)
            }
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.sidebar.openClawSearchArtifacts}
          </button>
        )}
      </div>

      {openClawMountedTree.length > 0 && (
        <div className="mt-3 rounded-md border border-border/70 bg-background/40">
          <div className="border-b border-border/70 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {openClawAttachment?.workspacePath.split(/[/\\]/).pop() || t.sidebar.openClawTitle}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {openClawMountedTree.map((entry) => (
              <MountedWorkspaceTreeItem
                key={entry.path}
                entry={entry}
                level={0}
                currentFile={currentFile}
                expandedPaths={expandedMountedPaths}
                toggleExpanded={toggleMountedExpanded}
                onOpen={(path) => void openFile(path)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MountedWorkspaceTreeItem({
  entry,
  level,
  currentFile,
  expandedPaths,
  toggleExpanded,
  onOpen,
}: MountedWorkspaceTreeItemProps) {
  const paddingLeft = 12 + level * 14;
  const isExpanded = expandedPaths.has(entry.path);

  if (entry.is_dir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleExpanded(entry.path)}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
        {isExpanded && Array.isArray(entry.children) && (
          <div>
            {entry.children.map((child) => (
              <MountedWorkspaceTreeItem
                key={child.path}
                entry={child}
                level={level + 1}
                currentFile={currentFile}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.path)}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] hover:bg-accent",
        currentFile === entry.path ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
      style={{ paddingLeft }}
    >
      <File className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
