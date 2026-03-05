import { useState, useRef, useEffect } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { Loader2, RefreshCw, Download, RotateCcw, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUpdateStore, checkForUpdate, getUpdateHandle } from "@/stores/useUpdateStore";
import { reportOperationError } from "@/lib/reportError";
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
        skipVersion,
        clearSkippedVersion,
        markUpdateAsRead,
    } = useUpdateStore();

    const [status, setStatus] = useState<"idle" | "downloading" | "installing" | "ready" | "error" | "up-to-date">("idle");
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [downloadedSize, setDownloadedSize] = useState<string>("");

    const contentLengthRef = useRef<number>(0);
    const downloadedRef = useRef<number>(0);

    // 打开设置时标记更新为已读
    useEffect(() => {
        if (hasUnreadUpdate) {
            markUpdateAsRead();
        }
    }, [hasUnreadUpdate, markUpdateAsRead]);

    // 同步 store 中的更新状态到本地 status
    useEffect(() => {
        if (availableUpdate && status === "up-to-date") {
            setStatus("idle");
        }
    }, [availableUpdate, status]);

    const handleCheckForUpdates = async () => {
        setError(null);
        setStatus("idle");

        try {
            const hasUpdate = await checkForUpdate(true); // force check
            if (!hasUpdate) {
                setStatus("up-to-date");
            }
        } catch (err) {
            reportOperationError({
                source: "UpdateChecker.handleCheckForUpdates",
                action: "Check for updates",
                error: err,
                level: "warning",
            });
            setError(err instanceof Error ? err.message : String(err));
            setStatus("error");
        }
    };

    const installUpdate = async () => {
        const updateHandle = getUpdateHandle();
        if (!updateHandle) return;

        try {
            setStatus("downloading");
            setProgress(0);
            setDownloadedSize("");
            contentLengthRef.current = 0;
            downloadedRef.current = 0;

            await retryWithExponentialBackoff(
                () =>
                    updateHandle.downloadAndInstall(
                        (event: DownloadEvent) => {
                            switch (event.event) {
                                case "Started":
                                    const len = (event.data as any).contentLength;
                                    if (len) contentLengthRef.current = len;
                                    break;
                                case "Progress":
                                    const chunk = (event.data as any).chunkLength;
                                    downloadedRef.current += chunk;

                                    if (contentLengthRef.current > 0) {
                                        const pct = (downloadedRef.current / contentLengthRef.current) * 100;
                                        setProgress(pct);
                                        setDownloadedSize(
                                            `${(downloadedRef.current / 1024 / 1024).toFixed(1)} MB / ${(contentLengthRef.current / 1024 / 1024).toFixed(1)} MB`
                                        );
                                    } else {
                                        setDownloadedSize(`${(downloadedRef.current / 1024 / 1024).toFixed(1)} MB`);
                                    }
                                    break;
                                case "Finished":
                                    setStatus("installing");
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
                        setStatus("downloading");
                        setProgress(0);
                        setDownloadedSize("");
                        contentLengthRef.current = 0;
                        downloadedRef.current = 0;
                    },
                }
            );

            setStatus("ready");
        } catch (err) {
            reportOperationError({
                source: "UpdateChecker.installUpdate",
                action: "Download and install update",
                error: err,
            });
            setError(err instanceof Error ? err.message : String(err));
            setStatus("error");
        }
    };

    const handleSkipVersion = () => {
        if (availableUpdate) {
            skipVersion(availableUpdate.version);
            setStatus("idle");
        }
    };

    const handleRelaunch = async () => {
        try {
            await relaunch();
        } catch (err) {
            reportOperationError({
                source: "UpdateChecker.handleRelaunch",
                action: "Relaunch app after update",
                error: err,
            });
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const hasUpdate = availableUpdate !== null;

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
                        {status === "installing" && t.updateChecker.descInstalling}
                        {status === "ready" && t.updateChecker.descReady}
                        {status === "error" && t.updateChecker.descError}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {(status === "idle" || status === "up-to-date") && !hasUpdate && (
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

                    {status === "idle" && hasUpdate && (
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
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
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
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.updateChecker.readyHint}</span>
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
