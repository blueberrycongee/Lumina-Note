import { basename, dirname, extname, join } from "@/lib/path";
import { buildRelativeAssetReference } from "@/services/assets/imageManager";
import { isExternalUrl, resolveAssetSourcePath } from "@/services/markdown/assets";
import { createStableSlug } from "@/services/markdown/slug";

const normalizePath = (path: string): string => path.replace(/\\/g, "/");

export const getImageMimeType = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".bmp":
      return "image/bmp";
    case ".avif":
      return "image/avif";
    default:
      return "image/png";
  }
};

const extensionFromMimeType = (mimeType: string): string => {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    case "image/avif":
      return "avif";
    default:
      return "png";
  }
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`;
};

export const resolveEditorImagePath = ({
  src,
  notePath,
  vaultPath,
}: {
  src: string;
  notePath?: string | null;
  vaultPath?: string | null;
}): string | null => {
  const trimmed = src.trim();
  if (!trimmed || isExternalUrl(trimmed)) return null;

  if (notePath) {
    const resolved = resolveAssetSourcePath(notePath, trimmed);
    if (resolved) return normalizePath(resolved.sourcePath);
  }

  if (!vaultPath) return null;

  const normalizedSrc = normalizePath(trimmed).replace(/^\.\//, "");
  if (normalizedSrc.startsWith("/") || /^[A-Za-z]:/.test(normalizedSrc)) {
    return normalizedSrc;
  }

  return join(normalizePath(vaultPath), normalizedSrc);
};

export interface PastedImageTarget {
  directoryPath: string;
  filePath: string;
  fileName: string;
  referencePath: string;
}

export const buildPastedImageTarget = ({
  notePath,
  vaultPath,
  mimeType,
  timestamp = Date.now(),
}: {
  notePath?: string | null;
  vaultPath: string;
  mimeType: string;
  timestamp?: number;
}): PastedImageTarget => {
  const extension = extensionFromMimeType(mimeType);
  const stamp = formatTimestamp(timestamp);
  const normalizedVaultPath = normalizePath(vaultPath);
  const directoryPath = notePath
    ? join(dirname(normalizePath(notePath)), "assets")
    : join(normalizedVaultPath, "assets");
  const noteSeed = notePath
    ? createStableSlug(basename(notePath, extname(notePath)), notePath, { fallbackPrefix: "note" })
    : "pasted-image";
  const fileName = `${noteSeed}-${stamp}.${extension}`;
  const filePath = join(directoryPath, fileName);

  return {
    directoryPath,
    filePath,
    fileName,
    referencePath: notePath ? buildRelativeAssetReference(notePath, filePath) : join("assets", fileName),
  };
};
