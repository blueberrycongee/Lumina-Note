import { DEFAULT_ASSETS_BASE_PATH } from "./config";
import type { PublishNoteSource } from "./notes";
import { buildAssetOutputName, extractAssetLinks, resolveAssetSourcePath } from "./assets";

export interface PublishAsset {
  sourcePath: string;
  outputName: string;
  publicUrl: string;
}

export interface AssetManifest {
  assets: PublishAsset[];
  bySourcePath: Map<string, PublishAsset>;
}

const normalizeAssetsBasePath = (input?: string): string => {
  const raw = input?.trim() || DEFAULT_ASSETS_BASE_PATH;
  const stripped = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  return `/${stripped || "assets"}`;
};

export const buildAssetManifest = (
  notes: PublishNoteSource[],
  options?: { assetsBasePath?: string }
): AssetManifest => {
  const assetsBasePath = normalizeAssetsBasePath(options?.assetsBasePath);
  const bySourcePath = new Map<string, PublishAsset>();

  for (const note of notes) {
    const links = extractAssetLinks(note.content || "");
    for (const link of links) {
      const resolved = resolveAssetSourcePath(note.path, link);
      if (!resolved) continue;
      if (bySourcePath.has(resolved.sourcePath)) continue;
      const outputName = buildAssetOutputName(resolved.sourcePath);
      bySourcePath.set(resolved.sourcePath, {
        sourcePath: resolved.sourcePath,
        outputName,
        publicUrl: `${assetsBasePath}/${outputName}`,
      });
    }
  }

  return {
    assets: Array.from(bySourcePath.values()),
    bySourcePath,
  };
};

export const createAssetUrlMapper = (
  notePath: string,
  manifest: AssetManifest
): ((url: string) => string | null) => {
  return (url: string) => {
    const resolved = resolveAssetSourcePath(notePath, url);
    if (!resolved) return null;
    const asset = manifest.bySourcePath.get(resolved.sourcePath);
    if (!asset) return null;
    return `${asset.publicUrl}${resolved.suffix}`;
  };
};
