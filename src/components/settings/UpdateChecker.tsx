import { useState, useEffect } from "react";
import { relaunch } from "@/lib/host";
import { Loader2, RefreshCw, Download, RotateCcw, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
    useUpdateStore,
    checkForUpdate,
    hasActionableTerminalInstallPhase,
    getUpdateHandle,
    initResumableUpdateListeners,
    isResumableUpdaterEnabled,
    startResumableInstall,
} from "@/stores/useUpdateStore";
import { normalizeErrorMessage, reportOperationError } from "@/lib/reportError";
import { retryWithExponentialBackoff } from "@/lib/retry";

type DownloadEvent = {
    event: string;
    data?: {
        contentLength?: number;
        chunkLength?: number;
    };
};

const UPDATE_DOWNLOAD_TIMEOUT_MS = 120_000;
const UPDATE_DOWNLOAD_MAX_ATTEMPTS = 3;
const UPDATE_DOWNLOAD_BASE_DELAY_MS = 1_500;
const UPDATE_DOWNLOAD_MAX_DELAY_MS = 12_000;

export function UpdateChecker() {
    const { t } = useLocaleStore();
    const {
        availableUpdate,
        hasUnreadUpdate,
        isChecking,
        skippedVersions,
        currentVersion,
        skipVersion,
        clearSkippedVersion,
        markUpdateAsRead,
        installTelemetry,
        beginInstallTelemetry,
        recordInstallStarted,
        recordInstallProgress,
        recordInstallInstalling,
        recordInstallRetry,
        recordInstallReady,
        recordInstallError,
    } = useUpdateStore();

    const [checkStatus, setCheckStatus] = useState<"idle" | "up-to-date" | "error" | "unsupported">("idle");
    const [checkError, setCheckError] = useState<string | null>(null);

    const hasUpdate = availableUpdate !== null;
    const hasActiveInstallPhase =
        installTelemetry.phase === "downloading" ||
        installTelemetry.phase === "verifying" ||
        installTelemetry.phase === "installing";
    const hasActionableTerminalPhase = hasActionableTerminalInstallPhase(
        installTelemetry,
        currentVersion,
    );
    const effectiveInstallPhase =
        hasActiveInstallPhase || hasActionableTerminalPhase ? installTelemetry.phase : "idle";
    const status = effectiveInstallPhase !== "idle" ? effectiveInstallPhase : checkStatus;
    const error = status === "error" ? installTelemetry.error || checkError : checkError;
    const progress = installTelemetry.progress;
    const downloadedSize =
        installTelemetry.downloadedBytes > 0
            ? installTelemetry.contentLength > 0
                ? `${(installTelemetry.downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(installTelemetry.contentLength / 1024 / 1024).toFixed(1)} MB`
                : `${(installTelemetry.downloadedBytes / 1024 / 1024).toFixed(1)} MB`
            : "";

    // 打开更新窗口时标记更新为已读
    useEffect(() => {
        if (hasUnreadUpdate) {
            markUpdateAsRead();
        }
    }, [hasUnreadUpdate, markUpdateAsRead]);

    // 同步 store 中的更新状态到本地 status
    useEffect(() => {
        if (availableUpdate && checkStatus === "up-to-date") {
            setCheckStatus("idle");
        }
    }, [availableUpdate, checkStatus]);

    const handleCheckForUpdates = async () => {
        setCheckError(null);
        setCheckStatus("idle");

        try {
            const result = await checkForUpdate(true); // force check
            if (result === "none") {
                setCheckStatus("up-to-date");
            } else if (result === "unsupported") {
                setCheckStatus("unsupported");
            }
        } catch (err) {
            reportOperationError({
                source: "UpdateChecker.handleCheckForUpdates",
                action: "Check for updates",
                error: err,
                level: "warning",
            });
            setCheckError(err instanceof Error ? err.message : String(err));
            setCheckStatus("error");
        }
    };

    const installUpdateLegacy = async () => {
        const updateHandle = getUpdateHandle();
        if (!updateHandle) return;

        const sessionId = beginInstallTelemetry(availableUpdate?.version);

        try {
            console.info("[Update] Install flow started", { sessionId });

            await retryWithExponentialBackoff(
                () =>
                    updateHandle.downloadAndInstall(
                        (event: DownloadEvent) => {
                            switch (event.event) {
                                case "Started":
                                    const len = (event.data as any).contentLength;
                                    recordInstallStarted(len);
                                    break;
                                case "Progress":
                                    const chunk = (event.data as any).chunkLength;
                                    recordInstallProgress(chunk);
                                    break;
                                case "Finished":
                                    recordInstallInstalling();
                                    break;
                            }
                        },
                        { timeout: UPDATE_DOWNLOAD_TIMEOUT_MS }
                    ),
                {
                    maxAttempts: UPDATE_DOWNLOAD_MAX_ATTEMPTS,
                    baseDelayMs: UPDATE_DOWNLOAD_BASE_DELAY_MS,
                    maxDelayMs: UPDATE_DOWNLOAD_MAX_DELAY_MS,
                    onRetry: ({ attempt, maxAttempts, nextDelayMs, error }) => {
                        console.warn("[Update] download failed, retrying", {
                            attempt,
                            maxAttempts,
                            nextDelayMs,
                            timeoutMs: UPDATE_DOWNLOAD_TIMEOUT_MS,
                            error,
                        });
                        recordInstallRetry(attempt + 1);
                    },
                }
            );

            recordInstallReady();
            console.info("[Update] Install flow finished", { sessionId, phase: "ready" });
        } catch (err) {
            const message = normalizeErrorMessage(err);
            reportOperationError({
                source: "UpdateChecker.installUpdateLegacy",
                action: "Download and install update",
                error: err,
                context: { sessionId },
            });
            recordInstallError(message);
        }
    };

    const installUpdate = async () => {
        if (isResumableUpdaterEnabled()) {
            try {
                await initResumableUpdateListeners();
                const taskId = await startResumableInstall(availableUpdate?.version);
                console.info("[Update] resumable install task started", {
                    taskId,
                    version: availableUpdate?.version,
                });
                return;
            } catch (err) {
                reportOperationError({
                    source: "UpdateChecker.installUpdate",
                    action: "Start resumable update task",
                    error: err,
                    level: "warning",
                    context: { fallback: "downloadAndInstall" },
                });
            }
        }

        await installUpdateLegacy();
    };

    const handleSkipVersion = () => {
        if (availableUpdate) {
            skipVersion(availableUpdate.version);
            setCheckStatus("idle");
        }
    };

    const handleRelaunch = async () => {
        const previousTelemetry = installTelemetry;
        try {
            useUpdateStore.setState({
                installTelemetry: {
                    ...installTelemetry,
                    phase: "idle",
                    error: null,
                    errorCode: null,
                },
            });
            await relaunch();
        } catch (err) {
            useUpdateStore.setState({ installTelemetry: previousTelemetry });
            reportOperationError({
                source: "UpdateChecker.handleRelaunch",
                action: "Relaunch app after update",
                error: err,
            });
            setCheckError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="font-medium">{t.updateChecker.title}</h3>
                    <p className="text-sm text-muted-foreground">
                        {status === "idle" && !hasUpdate && t.updateChecker.descIdle}
                        {status === "up-to-date" && t.updateChecker.descUpToDate}
                        {status === "idle" && hasUpdate && t.updateChecker.descAvailable.replace("{version}", availableUpdate.version)}
                        {status === "downloading" && t.updateChecker.descDownloading}
                        {status === "verifying" && t.updateChecker.descVerifying}
                        {status === "installing" && t.updateChecker.descInstalling}
                        {status === "ready" && t.updateChecker.descReady}
                        {status === "cancelled" && t.updateChecker.descCancelled}
                        {status === "error" && t.updateChecker.descError}
                        {status === "unsupported" && t.updateChecker.descUnsupported}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {(status === "idle" || status === "up-to-date" || status === "error" || status === "cancelled") &&
                        !hasUpdate && (
                        <button
                            onClick={handleCheckForUpdates}
                            disabled={isChecking}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            {isChecking ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                            {t.updateChecker.actionCheck}
                        </button>
                    )}

                    {(status === "idle" || status === "error" || status === "cancelled") && hasUpdate && (
                        <>
                            <button
                                onClick={handleSkipVersion}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                title={t.updateChecker.actionSkip}
                            >
                                <SkipForward className="w-4 h-4" />
                                {t.updateChecker.actionSkip}
                            </button>
                            <button
                                onClick={installUpdate}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                {t.updateChecker.actionInstall}
                            </button>
                        </>
                    )}

                    {status === "ready" && (
                        <button
                            onClick={handleRelaunch}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-success text-success-foreground hover:bg-success/90 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            {t.updateChecker.actionRelaunch}
                        </button>
                    )}
                </div>
            </div>

            {/* 错误信息 */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* 更新详情 */}
            {hasUpdate && status === "idle" && (
                <div className="text-sm text-muted-foreground bg-background/50 p-3 rounded-lg border border-border/50">
                    <p className="font-medium text-foreground mb-1">
                        {t.updateChecker.versionLabel.replace("{version}", availableUpdate.version)}
                    </p>
                    <p className="whitespace-pre-wrap">{availableUpdate.body || t.updateChecker.noChangelog}</p>
                </div>
            )}

            {/* 进度条 */}
            {status === "downloading" && (
                <div className="space-y-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{downloadedSize}</span>
                        <span>{progress > 0 ? `${progress.toFixed(1)}%` : t.updateChecker.preparing}</span>
                    </div>
                </div>
            )}

            {/* 就绪提示 */}
            {status === "ready" && (
                <div className="flex items-center gap-2 text-sm text-success bg-success/10 p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.updateChecker.readyHint}</span>
                </div>
            )}

            {/* 观测信息（用于排查设置页关闭后的下载状态） */}
            {effectiveInstallPhase !== "idle" && (
                <div className="text-xs text-muted-foreground bg-background/50 p-3 rounded-lg border border-border/50 space-y-1">
                    <p className="font-medium text-foreground/80">Update telemetry</p>
                    <p>
                        session #{installTelemetry.sessionId} · phase {installTelemetry.phase} · attempt {installTelemetry.attempt}
                    </p>
                    {installTelemetry.taskId && <p>task: {installTelemetry.taskId}</p>}
                    {installTelemetry.startedAt && <p>started: {new Date(installTelemetry.startedAt).toLocaleString()}</p>}
                    {installTelemetry.updatedAt && <p>last event: {new Date(installTelemetry.updatedAt).toLocaleString()}</p>}
                    {installTelemetry.finishedAt && <p>finished: {new Date(installTelemetry.finishedAt).toLocaleString()}</p>}
                    {downloadedSize && <p>bytes: {downloadedSize}</p>}
                    <p>resumable: {installTelemetry.resumable ? "yes" : "no"}</p>
                    <p>server range: {installTelemetry.capability}</p>
                    {installTelemetry.retryDelayMs !== null && <p>retry delay: {installTelemetry.retryDelayMs} ms</p>}
                    {installTelemetry.lastHttpStatus !== null && <p>http status: {installTelemetry.lastHttpStatus}</p>}
                    {installTelemetry.errorCode && <p>error code: {installTelemetry.errorCode}</p>}
                </div>
            )}

            {/* 已跳过的版本列表 */}
            {skippedVersions.length > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                    <span>{t.updateChecker.skippedVersions}: </span>
                    {skippedVersions.map((v, i) => (
                        <span key={v}>
                            <button
                                onClick={() => clearSkippedVersion(v)}
                                className="text-primary hover:underline"
                                title={t.updateChecker.clearSkipped}
                            >
                                {v}
                            </button>
                            {i < skippedVersions.length - 1 && ", "}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
