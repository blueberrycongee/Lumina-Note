import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useShallow } from "zustand/react/shallow";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  OPENCLAW_WORKSPACE_RELEASE_ENABLED,
  useOpenClawWorkspaceStore,
} from "@/stores/useOpenClawWorkspaceStore";
import {
  ensureOpenClawTodayMemoryNote,
  type OpenClawWorkspaceSnapshot,
} from "@/services/openclaw/workspace";
import { join } from "@/lib/path";
import { exists } from "@/lib/tauri";
import { reportOperationError } from "@/lib/reportError";
import { resolveMountedOpenClawWorkspacePath } from "./openClawWorkspaceSectionModel";

function formatCheckedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

async function openIfExists(
  snapshot: OpenClawWorkspaceSnapshot | null,
  path: string,
  openFile: (path: string) => Promise<void>,
): Promise<void> {
  if (!snapshot || !(await exists(path))) return;
  await openFile(path);
}

export function OpenClawWorkspaceSection() {
  const { t } = useLocaleStore();
  const vaultPath = useFileStore((state) => state.vaultPath);
  const openFile = useFileStore((state) => state.openFile);
  const {
    integrationEnabled,
    getSnapshot,
    getAttachment,
    getMountedWorkspacePath,
    getConflictState,
    setIntegrationEnabled,
    refreshWorkspace,
    attachWorkspace,
    detachWorkspace,
    updateGateway,
    clearConflictState,
    isRefreshing,
    lastError,
  } = useOpenClawWorkspaceStore(
    useShallow((state) => ({
      integrationEnabled: state.integrationEnabled,
      getSnapshot: state.getSnapshot,
      getAttachment: state.getAttachment,
      getMountedWorkspacePath: state.getMountedWorkspacePath,
      getConflictState: state.getConflictState,
      setIntegrationEnabled: state.setIntegrationEnabled,
      refreshWorkspace: state.refreshWorkspace,
      attachWorkspace: state.attachWorkspace,
      detachWorkspace: state.detachWorkspace,
      updateGateway: state.updateGateway,
      clearConflictState: state.clearConflictState,
      isRefreshing: state.isRefreshing,
      lastError: state.lastError,
    })),
  );

  const snapshot = getSnapshot(vaultPath);
  const attachment = getAttachment(vaultPath);
  const mountedWorkspacePath = getMountedWorkspacePath(vaultPath);
  const conflictState = getConflictState(vaultPath);
  const [gatewayEndpointDraft, setGatewayEndpointDraft] = useState("");
  const [mountedPathDraft, setMountedPathDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const targetWorkspacePath = resolveMountedOpenClawWorkspacePath(
    mountedPathDraft,
    mountedWorkspacePath,
  );
  const hasSelectedWorkspacePath = targetWorkspacePath !== null;
  const shouldShowSnapshot = snapshot !== null;

  const visibleError = actionError ?? lastError ?? (shouldShowSnapshot ? snapshot?.error ?? null : null);

  useEffect(() => {
    const next = attachment?.gateway.endpoint ?? "";
    setGatewayEndpointDraft((current) => (current === next ? current : next));
  }, [attachment?.gateway.endpoint]);

  useEffect(() => {
    const next = mountedWorkspacePath ?? "";
    setMountedPathDraft((current) => (current === next ? current : next));
  }, [mountedWorkspacePath]);

  const handleOpenAgents = async () => {
    if (!snapshot) return;
    try {
      setActionError(null);
      await openIfExists(snapshot, join(snapshot.workspacePath, "AGENTS.md"), openFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      reportOperationError({
        source: "OpenClawWorkspaceSection.handleOpenAgents",
        action: "Open AGENTS.md from mounted OpenClaw workspace",
        error,
        level: "warning",
        context: { vaultPath, workspacePath: snapshot.workspacePath },
      });
    }
  };

  const handleOpenTodayMemory = async () => {
    if (!snapshot) return;
    try {
      setActionError(null);
      const path = await ensureOpenClawTodayMemoryNote(snapshot.workspacePath);
      await openFile(path);
      await refreshWorkspace(vaultPath, { workspacePath: snapshot.workspacePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      reportOperationError({
        source: "OpenClawWorkspaceSection.handleOpenTodayMemory",
        action: "Open or create today's OpenClaw memory note",
        error,
        level: "warning",
        context: { vaultPath, workspacePath: snapshot.workspacePath },
      });
    }
  };

  const handleAttach = async () => {
    if (!vaultPath) return;
    if (!targetWorkspacePath) {
      setActionError(t.settingsModal.openClawPathRequiredDesc);
      return;
    }
    try {
      setActionError(null);
      await attachWorkspace({
        hostWorkspacePath: vaultPath,
        workspacePath: targetWorkspacePath,
      });
      await refreshWorkspace(vaultPath, { workspacePath: targetWorkspacePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      reportOperationError({
        source: "OpenClawWorkspaceSection.handleAttach",
        action: "Attach external OpenClaw workspace",
        error,
        level: "warning",
        context: { vaultPath, workspacePath: targetWorkspacePath },
      });
    }
  };

  const handleDetach = () => {
    if (!vaultPath) return;
    detachWorkspace(vaultPath);
    setActionError(null);
  };

  const handleSaveGateway = () => {
    if (!vaultPath || !attachment) return;
    updateGateway(vaultPath, {
      enabled: gatewayEndpointDraft.trim().length > 0,
      endpoint: gatewayEndpointDraft.trim() || null,
    });
  };

  const handlePickWorkspace = async () => {
    try {
      setActionError(null);
      const selected = await open({
        directory: true,
        multiple: false,
        title: t.settingsModal.openClawPickWorkspace,
      });
      if (typeof selected === "string") {
        setMountedPathDraft(selected);
        if (vaultPath) {
          await refreshWorkspace(vaultPath, { workspacePath: selected });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      reportOperationError({
        source: "OpenClawWorkspaceSection.handlePickWorkspace",
        action: "Pick external OpenClaw workspace path",
        error,
        level: "warning",
        context: { vaultPath },
      });
    }
  };

  const handleRescan = async () => {
    const scanPath = targetWorkspacePath ?? vaultPath;
    if (!scanPath) return;
    try {
      setActionError(null);
      await refreshWorkspace(vaultPath, {
        workspacePath: scanPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
      reportOperationError({
        source: "OpenClawWorkspaceSection.handleRescan",
        action: "Refresh OpenClaw workspace detection",
        error,
        level: "warning",
        context: {
          vaultPath,
          workspacePath: targetWorkspacePath,
        },
      });
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t.settingsModal.openClawTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{t.settingsModal.openClawDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={integrationEnabled}
              disabled={!OPENCLAW_WORKSPACE_RELEASE_ENABLED}
              onChange={(event) => setIntegrationEnabled(event.target.checked)}
            />
            {t.settingsModal.openClawEnabled}
          </label>
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={!vaultPath || isRefreshing || !integrationEnabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin" : undefined} />
            {t.settingsModal.openClawRescan}
          </button>
        </div>
      </div>

      {!integrationEnabled && (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {OPENCLAW_WORKSPACE_RELEASE_ENABLED
            ? t.settingsModal.openClawDisabledDesc
            : t.settingsModal.openClawReleaseFlagDesc}
        </div>
      )}

      {!vaultPath && (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {t.settingsModal.openClawNoWorkspace}
        </div>
      )}

      {integrationEnabled && vaultPath && (
        <div className="space-y-3 rounded-lg border border-border bg-background/70 p-3">
          {visibleError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="font-medium">{t.settingsModal.openClawRuntimeErrorTitle}</div>
              <p className="mt-1 break-all">{visibleError}</p>
            </div>
          )}

          <div className="space-y-2">
            <span className="font-medium">{t.settingsModal.openClawMountedWorkspace}</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mountedPathDraft}
                onChange={(event) => setMountedPathDraft(event.target.value)}
                placeholder={t.settingsModal.openClawMountedWorkspacePlaceholder}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => void handlePickWorkspace()}
                className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                {t.settingsModal.openClawPickWorkspace}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settingsModal.openClawMountedWorkspaceHint}
            </p>
          </div>

          {!hasSelectedWorkspacePath && (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">
                {t.settingsModal.openClawPathRequiredTitle}
              </div>
              <p className="mt-1">{t.settingsModal.openClawPathRequiredDesc}</p>
            </div>
          )}

          {shouldShowSnapshot && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                snapshot.status === "detected"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : snapshot.status === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/15 text-warning"
              }`}
            >
              {snapshot.status === "detected"
                ? t.settingsModal.openClawDetected
                : snapshot.status === "error"
                  ? t.settingsModal.openClawError
                  : t.settingsModal.openClawNotDetected}
            </span>
            {attachment && (
              <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-700">
                {t.settingsModal.openClawAttached}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {t.settingsModal.openClawCheckedAt.replace("{time}", formatCheckedAt(snapshot.checkedAt))}
            </span>
          </div>
          )}

          {shouldShowSnapshot && (
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium">{t.settingsModal.openClawWorkspacePath}</span>
              <p className="break-all text-muted-foreground">{snapshot.workspacePath}</p>
            </div>

            <div>
              <span className="font-medium">{t.settingsModal.openClawMatchedFiles}</span>
              <p className="text-muted-foreground">
                {snapshot.editablePriorityFiles.length > 0
                  ? snapshot.editablePriorityFiles.join(", ")
                  : t.common.empty}
              </p>
            </div>

            {snapshot.missingRequiredFiles.length > 0 && (
              <div>
                <span className="font-medium">{t.settingsModal.openClawMissingFiles}</span>
                <p className="text-muted-foreground">{snapshot.missingRequiredFiles.join(", ")}</p>
              </div>
            )}

            {snapshot.artifactDirectoryPaths.length > 0 && (
              <div>
                <span className="font-medium">{t.settingsModal.openClawArtifactDirs}</span>
                <p className="break-all text-muted-foreground">
                  {snapshot.artifactDirectoryPaths.join(", ")}
                </p>
              </div>
            )}

            <div>
              <span className="font-medium">{t.settingsModal.openClawBoundary}</span>
              <p className="text-muted-foreground">{t.settingsModal.openClawBoundaryHint}</p>
            </div>

            {attachment && (
              <div className="space-y-2">
                <span className="font-medium">{t.settingsModal.openClawGatewayTitle}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={gatewayEndpointDraft}
                    onChange={(event) => setGatewayEndpointDraft(event.target.value)}
                    placeholder={t.settingsModal.openClawGatewayPlaceholder}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGateway}
                    className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    {t.common.save}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {attachment.gateway.enabled && attachment.gateway.endpoint
                    ? t.settingsModal.openClawGatewayConfigured.replace(
                        "{endpoint}",
                        attachment.gateway.endpoint,
                      )
                    : t.settingsModal.openClawGatewayNotConfigured}
                </p>
              </div>
            )}
          </div>
          )}

          {conflictState && conflictState.status === "warning" && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle size={14} />
                {t.settingsModal.openClawConflictTitle}
              </div>
              <p>{conflictState.message}</p>
              {conflictState.files.length > 0 && (
                <p className="mt-1 break-all text-xs">{conflictState.files.join(", ")}</p>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => clearConflictState(vaultPath)}
                  className="rounded-lg border border-warning/30 bg-background/60 px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  {t.settingsModal.openClawConflictDismiss}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!attachment && (
              <button
                type="button"
                onClick={() => void handleAttach()}
                disabled={!hasSelectedWorkspacePath}
                className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t.settingsModal.openClawAttach}
              </button>
            )}
            {attachment && (
              <button
                type="button"
                onClick={handleDetach}
                className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                {t.settingsModal.openClawDetach}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleOpenAgents()}
              disabled={!shouldShowSnapshot || snapshot.status !== "detected"}
              className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {t.settingsModal.openClawOpenAgents}
            </button>
            <button
              type="button"
              onClick={() => void handleOpenTodayMemory()}
              disabled={!shouldShowSnapshot || snapshot.status === "error"}
              className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {t.settingsModal.openClawOpenTodayMemory}
            </button>
          </div>

          {snapshot?.error && <p className="text-xs text-destructive">{snapshot.error}</p>}
        </div>
      )}
    </section>
  );
}
