import { join } from "@/lib/path";

export const DEFAULT_PUBLISH_DIR_NAME = ".lumina-site";
export const DEFAULT_POSTS_BASE_PATH = "/posts";
export const DEFAULT_ASSETS_BASE_PATH = "/assets";

export interface PublishConfig {
  outputDir: string;
  postsBasePath?: string;
  assetsBasePath?: string;
}

export const getDefaultPublishOutputDir = (vaultPath: string): string => {
  return join(vaultPath, DEFAULT_PUBLISH_DIR_NAME);
};
