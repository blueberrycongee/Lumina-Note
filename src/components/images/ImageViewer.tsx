import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Maximize2, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react";

import { readBinaryFileBase64, showInExplorer } from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";
import { getImageMimeType } from "@/services/assets/editorImages";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  filePath: string;
  className?: string;
}

interface LoadedImage {
  src: string;
  width: number;
  height: number;
  bytes: number;
}

const imageCache = new Map<string, LoadedImage>();

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function preloadImage(
  filePath: string,
  options?: { force?: boolean },
): Promise<LoadedImage> {
  const cached = imageCache.get(filePath);
  if (cached && !options?.force) return cached;

  const base64 = await readBinaryFileBase64(filePath);
  const src = `data:${getImageMimeType(filePath)};base64,${base64}`;
  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const probe = new Image();
      probe.onload = () =>
        resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => reject(new Error("decode failed"));
      probe.src = src;
    },
  );
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  const loaded = { src, width: dimensions.width, height: dimensions.height, bytes };
  imageCache.set(filePath, loaded);
  return loaded;
}

export function ImageViewer({ filePath, className }: ImageViewerProps) {
  const [image, setImage] = useState<LoadedImage | null>(
    () => imageCache.get(filePath) ?? null,
  );
  const [loading, setLoading] = useState(() => !imageCache.has(filePath));
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const fileName = useMemo(() => filePath.split(/[/\\]/).pop() || "image", [filePath]);

  useEffect(() => {
    let cancelled = false;
    const cached = imageCache.get(filePath);
    if (cached && reloadKey === 0) {
      setImage(cached);
      setLoading(false);
      setError(null);
      setScale(1);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    setImage(null);
    setScale(1);

    const load = async () => {
      try {
        const loaded = await preloadImage(filePath, { force: reloadKey > 0 });
        if (cancelled) return;
        setImage(loaded);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        reportOperationError({
          source: "ImageViewer",
          action: "Load image",
          error: err,
          context: { filePath },
        });
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, reloadKey]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.25));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.25));
  const resetZoom = () => setScale(1);
  const fitToScreen = () => setScale(1);

  return (
    <div className={cn("flex flex-1 flex-col overflow-hidden bg-popover", className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground" title={filePath}>
          {fileName}
        </span>
        {image && (
          <span className="shrink-0">
            {image.width} × {image.height} · {formatBytes(image.bytes)}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={!image}
            className="rounded-ui-sm p-1 transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={!image}
            className="min-w-[3.25rem] rounded-ui-sm px-2 py-0.5 text-center tabular-nums transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={!image}
            className="rounded-ui-sm p-1 transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={fitToScreen}
            disabled={!image}
            className="rounded-ui-sm p-1 transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Fit to screen"
          >
            <Maximize2 size={14} />
          </button>
          <span className="mx-1 h-4 w-px bg-border/60" />
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-ui-sm p-1 transition-colors hover:bg-muted"
            aria-label="Reload"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              showInExplorer(filePath).catch((err) =>
                reportOperationError({
                  source: "ImageViewer",
                  action: "Show in explorer",
                  error: err,
                  context: { filePath },
                }),
              );
            }}
            className="rounded-ui-sm p-1 transition-colors hover:bg-muted"
            aria-label="Show in file explorer"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-popover">
        {loading && (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span>Loading image…</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Failed to load image</p>
            <p className="max-w-sm break-all text-xs">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-ui-sm border border-border/60 bg-popover px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}
        {!loading && !error && image && (
          <img
            src={image.src}
            alt={fileName}
            draggable={false}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              maxWidth: scale === 1 ? "100%" : undefined,
              maxHeight: scale === 1 ? "100%" : undefined,
              imageRendering: scale > 2 ? "pixelated" : undefined,
            }}
            className="select-none transition-transform duration-150 ease-out"
          />
        )}
      </div>
    </div>
  );
}
