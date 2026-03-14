import { motion } from "framer-motion";
import { FileText, FolderOpen, Keyboard, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import { useOpenClawWorkspaceStore } from "@/stores/useOpenClawWorkspaceStore";
import { ensureOpenClawTodayMemoryNote } from "@/services/openclaw/workspace";
import { getFileName } from "@/lib/utils";
import { join } from "@/lib/path";
import { openFilteredView } from "@/lib/events";
import { reportOperationError } from "@/lib/reportError";

export function OverviewDashboard() {
  const { t } = useLocaleStore();
  const vaultPath = useFileStore((state) => state.vaultPath);
  const openFile = useFileStore((state) => state.openFile);
  const snapshotsByHost = useOpenClawWorkspaceStore((state) => state.snapshotsByHostPath);
  const attachmentsByHost = useOpenClawWorkspaceStore((state) => state.attachmentsByHostPath);
  const integrationEnabled = useOpenClawWorkspaceStore((state) => state.integrationEnabled);
  const snapshot = integrationEnabled && vaultPath ? snapshotsByHost[vaultPath] ?? null : null;
  const attachment = integrationEnabled && vaultPath ? attachmentsByHost[vaultPath] ?? null : null;
  const visibleRecentMemory = snapshot?.recentMemoryPaths.slice(0, 4) ?? [];
  const visiblePlanFiles = snapshot?.planFilePaths.slice(0, 4) ?? [];
  const visibleArtifactDirectories = snapshot?.artifactDirectoryPaths.slice(0, 3) ?? [];

  // Wrapped openFile with error handling
  const handleOpenFile = (filePath: string, label: string) => {
    try {
      if (!filePath) {
        reportOperationError({
          source: 'OverviewDashboard.handleOpenFile',
          action: 'Open file',
          error: new Error('File path is empty'),
          userMessage: t.overview.openClawFileNotFound.replace('{file}', label),
          level: 'warning',
          context: { label, filePath },
        });
        return;
      }
      openFile(filePath);
    } catch (error) {
      reportOperationError({
        source: 'OverviewDashboard.handleOpenFile',
        action: 'Open file',
        error,
        userMessage: t.overview.openClawOpenFileError.replace('{file}', label),
        level: 'error',
        context: { label, filePath },
      });
    }
  };

  // Wrapped ensureOpenClawTodayMemoryNote with error handling
  const handleOpenTodayMemory = async (workspacePath: string) => {
    try {
      if (!workspacePath) {
        reportOperationError({
          source: 'OverviewDashboard.handleOpenTodayMemory',
          action: 'Open today memory',
          error: new Error('Workspace path is empty'),
          userMessage: t.overview.openClawNoWorkspace,
          level: 'warning',
          context: { workspacePath },
        });
        return;
      }
      await ensureOpenClawTodayMemoryNote(workspacePath).then(openFile);
    } catch (error) {
      reportOperationError({
        source: 'OverviewDashboard.handleOpenTodayMemory',
        action: 'Open today memory',
        error,
        userMessage: t.overview.openClawTodayMemoryError,
        level: 'error',
        context: { workspacePath },
      });
    }
  };

  // Wrapped openFilteredView with error handling
  const handleOpenFilteredView = (scopeLabel: string, pathPrefixes: string[], label: string) => {
    try {
      if (!pathPrefixes || pathPrefixes.length === 0) {
        reportOperationError({
          source: 'OverviewDashboard.handleOpenFilteredView',
          action: 'Open filtered view',
          error: new Error('No paths provided'),
          userMessage: t.overview.openClawNoPathsToSearch.replace('{label}', label),
          level: 'warning',
          context: { label, scopeLabel, pathPrefixes },
        });
        return;
      }
      openFilteredView(scopeLabel, pathPrefixes);
    } catch (error) {
      reportOperationError({
        source: 'OverviewDashboard.handleOpenFilteredView',
        action: 'Open filtered view',
        error,
        userMessage: t.overview.openClawSearchError.replace('{label}', label),
        level: 'error',
        context: { label, scopeLabel, pathPrefixes },
      });
    }
  };


  return (
    <div className="flex-1 ui-app-bg overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 min-h-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          className="space-y-4 w-full"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Card className="md:col-span-7 shadow-none">
              <CardHeader className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <CardTitle>{t.overview.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="space-y-2">
                  <p className="text-[15px] font-medium text-foreground">
                    {t.overview.getStarted}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.overview.createHintPrefix} <Kbd>Ctrl</Kbd>
                    <span className="px-1 opacity-70">+</span>
                    <Kbd>N</Kbd> {t.overview.createHintSuffix}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 shadow-none">
              <CardHeader className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-primary" />
                <CardTitle>{t.overview.shortcutsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.commandPalette}</span>
                    <Kbd>Ctrl+P</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.quickOpen}</span>
                    <Kbd>Ctrl+O</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.globalSearch}</span>
                    <Kbd>Ctrl+Shift+F</Kbd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t.overview.save}</span>
                    <Kbd>Ctrl+S</Kbd>
                  </div>
                </div>
              </CardContent>
            </Card>

            {snapshot && (snapshot.status === "detected" || attachment) && (
              <Card className="md:col-span-12 shadow-none">
                <CardHeader className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <CardTitle>{t.overview.openClawTitle}</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                    <div className="md:col-span-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">
                        {attachment ? t.overview.openClawAttached : t.overview.openClawDetected}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t.overview.openClawDesc.replace("{count}", String(snapshot.artifactFileCount))}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenFile(join(snapshot.workspacePath, "AGENTS.md"), "AGENTS.md")}
                          className="rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                        >
                          AGENTS.md
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenTodayMemory(snapshot.workspacePath)}
                          className="rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                        >
                          {t.overview.openClawTodayMemory}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {snapshot.memoryDirectoryPath && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenFilteredView(t.overview.openClawSearchMemory, [
                                snapshot.memoryDirectoryPath as string,
                              ], t.overview.openClawSearchMemory)
                            }
                            className="rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                          >
                            {t.overview.openClawSearchMemory}
                          </button>
                        )}
                        {snapshot.planDirectoryPaths.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenFilteredView(
                                t.overview.openClawSearchPlans,
                                snapshot.planDirectoryPaths,
                                t.overview.openClawSearchPlans
                              )
                            }
                            className="rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                          >
                            {t.overview.openClawSearchPlans}
                          </button>
                        )}
                        {snapshot.artifactDirectoryPaths.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenFilteredView(
                                t.overview.openClawSearchArtifacts,
                                snapshot.artifactDirectoryPaths,
                                t.overview.openClawSearchArtifacts
                              )
                            }
                            className="rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                          >
                            {t.overview.openClawSearchArtifacts}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">{t.overview.openClawRecentMemory}</div>
                      {visibleRecentMemory.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{t.overview.openClawNoRecentMemory}</div>
                      ) : (
                        visibleRecentMemory.map((path) => (
                          <button
                            key={path}
                            type="button"
                            onClick={() => void openFile(path)}
                            className="flex w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                          >
                            <span className="truncate">{getFileName(path).replace(/\.md$/i, "")}</span>
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        ))
                      )}
                    </div>

                    <div className="md:col-span-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">{t.overview.openClawPlans}</div>
                      {visiblePlanFiles.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{t.overview.openClawNoPlans}</div>
                      ) : (
                        visiblePlanFiles.map((path) => (
                          <button
                            key={path}
                            type="button"
                            onClick={() => void openFile(path)}
                            className="flex w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                          >
                            <span className="truncate">{getFileName(path)}</span>
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        ))
                      )}
                    </div>

                    <div className="md:col-span-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">{t.overview.openClawArtifactRoots}</div>
                      {visibleArtifactDirectories.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{t.overview.openClawNoArtifacts}</div>
                      ) : (
                        visibleArtifactDirectories.map((path) => (
                          <div
                            key={path}
                            className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground"
                          >
                            {getFileName(path)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
