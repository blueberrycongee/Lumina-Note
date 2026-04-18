import { useEffect, useMemo, useState } from "react";

import { readBinaryFileBase64 } from "@/lib/host";
import { cn } from "@/lib/utils";

type CachedPreview = {
  src: string;
  width: number;
  height: number;
};

const previewCache = new Map<string, CachedPreview>();

const mimeTypeForPath = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    default:
      return "image/png";
  }
};

async function loadImagePreview(path: string): Promise<CachedPreview> {
  const cached = previewCache.get(path);
  if (cached) return cached;

  const base64 = await readBinaryFileBase64(path);
  const src = `data:${mimeTypeForPath(path)};base64,${base64}`;
  const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    image.src = src;
  });

  const preview = {
    src,
    width: dimensions.width,
    height: dimensions.height,
  };
  previewCache.set(path, preview);
  return preview;
}

interface ImageThumbnailProps {
  path: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  onDimensions?: (dimensions: { width: number; height: number }) => void;
}

export function ImageThumbnail({
  path,
  alt,
  className,
  imgClassName,
  onDimensions,
}: ImageThumbnailProps) {
  const cached = useMemo(() => previewCache.get(path) ?? null, [path]);
  const [preview, setPreview] = useState<CachedPreview | null>(cached);
  const [status, setStatus] = useState<"idle" | "loading" | "error">(
    cached ? "idle" : "loading",
  );

  useEffect(() => {
    let cancelled = false;
    if (cached) {
      onDimensions?.({ width: cached.width, height: cached.height });
      return;
    }

    setStatus("loading");
    loadImagePreview(path)
      .then((nextPreview) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setStatus("idle");
        onDimensions?.({ width: nextPreview.width, height: nextPreview.height });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [cached, onDimensions, path]);

  if (preview) {
    return (
      <div className={cn("overflow-hidden bg-muted/30", className)}>
        <img src={preview.src} alt={alt} className={cn("h-full w-full object-cover", imgClassName)} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted/30 text-xs text-muted-foreground",
        className,
      )}
    >
      {status === "error" ? "Preview unavailable" : "Loading image…"}
    </div>
  );
}
