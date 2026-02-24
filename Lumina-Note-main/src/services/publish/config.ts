import { join } from "@/lib/path";

export const DEFAULT_PUBLISH_DIR_NAME = ".lumina-site";
export const DEFAULT_POSTS_BASE_PATH = "/posts";
export const DEFAULT_ASSETS_BASE_PATH = "/assets";

export interface PublishConfig {
  outputDir: string;
  basePath?: string;
  postsBasePath?: string;
  assetsBasePath?: string;
}

export const getDefaultPublishOutputDir = (vaultPath: string): string => {
  return join(vaultPath, DEFAULT_PUBLISH_DIR_NAME);
};

export const normalizeBasePath = (input?: string): string => {
  const raw = (input ?? "").trim();
  if (!raw || raw === "/") return "";
  const stripped = raw.replace(/^\/+|\/+$/g, "");
  return stripped ? `/${stripped}` : "";
};

export const normalizeSubPath = (input: string | undefined, fallback: string): string => {
  const raw = (input ?? fallback).trim();
  const stripped = raw.replace(/^\/+|\/+$/g, "");
  const finalSegment = stripped || fallback.replace(/^\/+|\/+$/g, "");
  return `/${finalSegment}`;
};

export const joinBasePath = (basePath: string, subPath: string): string => {
  if (!basePath) return subPath;
  return `${basePath}${subPath}`;
};
