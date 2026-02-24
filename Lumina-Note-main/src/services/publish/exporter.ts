import type { FileEntry } from "@/lib/tauri";
import { createDir, saveFile, writeBinaryFile, readBinaryFileBase64 } from "@/lib/tauri";
import { decodeBase64ToBytes } from "@/typesetting/base64";
import { dirname, join } from "@/lib/path";
import type { ProfileConfig } from "@/types/profile";
import { getDefaultPublishOutputDir } from "./config";
import { buildPublishPlan, PublishPlan } from "./plan";
import { loadPublishedNotes } from "./notes";

export interface PublishOptions {
  outputDir?: string;
  basePath?: string;
  postsBasePath?: string;
  assetsBasePath?: string;
  generatedAt?: string;
}

export interface PublishResult {
  outputDir: string;
  postCount: number;
  assetCount: number;
}

const ensureDir = async (path: string) => {
  await createDir(path, { recursive: true });
};

export const writePublishPlanFiles = async (outputDir: string, plan: PublishPlan): Promise<void> => {
  for (const file of plan.files) {
    const targetPath = join(outputDir, file.path);
    await ensureDir(dirname(targetPath));
    await saveFile(targetPath, file.content);
  }
};

export const copyPublishAssets = async (outputDir: string, plan: PublishPlan): Promise<void> => {
  for (const asset of plan.assetManifest.assets) {
    const targetPath = join(outputDir, asset.outputPath);
    await ensureDir(dirname(targetPath));
    const base64 = await readBinaryFileBase64(asset.sourcePath);
    const bytes = decodeBase64ToBytes(base64);
    await writeBinaryFile(targetPath, bytes);
  }
};

export const publishSite = async (params: {
  vaultPath: string;
  fileTree: FileEntry[];
  profile: ProfileConfig;
  options?: PublishOptions;
}): Promise<PublishResult> => {
  const { vaultPath, fileTree, profile, options } = params;
  const outputDir = options?.outputDir ?? getDefaultPublishOutputDir(vaultPath);

  const notes = await loadPublishedNotes(fileTree);
  const plan = buildPublishPlan(notes, profile, {
    basePath: options?.basePath,
    postsBasePath: options?.postsBasePath,
    assetsBasePath: options?.assetsBasePath,
    generatedAt: options?.generatedAt,
  });

  await ensureDir(outputDir);
  await writePublishPlanFiles(outputDir, plan);
  await copyPublishAssets(outputDir, plan);

  return {
    outputDir,
    postCount: plan.index.posts.length,
    assetCount: plan.assetManifest.assets.length,
  };
};
