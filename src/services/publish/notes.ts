import type { FileEntry } from "@/lib/tauri";
import { readFile } from "@/lib/tauri";
import { parseFrontmatter, getTitleFromPath } from "@/services/markdown/frontmatter";
import { extractTags } from "@/stores/useNoteIndexStore";
import type { PublishNoteInput } from "./index";

export interface PublishNoteSource extends PublishNoteInput {
  content: string;
  frontmatter: Record<string, unknown>;
}

type FrontmatterValue = string | number | boolean | null | undefined | string[];

const TITLE_KEYS = ["title", "标题"];
const TAG_KEYS = ["tags", "标签"];
const COVER_KEYS = ["cover", "封面"];
const PUBLISHED_KEYS = ["published", "public", "publish"];
const VISIBILITY_KEYS = ["visibility", "Visibility"];
const PROFILE_ORDER_KEYS = ["profileOrder", "profile_order", "order"];
const PUBLISH_AT_KEYS = ["publishAt", "publish_at", "publishedAt"];
const SLUG_KEYS = ["slug", "Slug"];

const isTruthy = (value: FrontmatterValue): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value > 0;
  return false;
};

const getFrontmatterString = (frontmatter: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const getFrontmatterTags = (frontmatter: Record<string, unknown>): string[] => {
  for (const key of TAG_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return trimmed
          .slice(1, -1)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      return [trimmed];
    }
  }
  return [];
};

const getFrontmatterDate = (frontmatter: Record<string, unknown>, key: string): string | undefined => {
  const value = frontmatter[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const getFrontmatterNumber = (frontmatter: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
};

const getFrontmatterDateByKeys = (frontmatter: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = getFrontmatterDate(frontmatter, key);
    if (value) return value;
  }
  return undefined;
};

const getVisibility = (frontmatter: Record<string, unknown>): string | undefined => {
  for (const key of VISIBILITY_KEYS) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase();
    }
  }
  return undefined;
};

const isPublished = (frontmatter: Record<string, unknown>): boolean => {
  const visibility = getVisibility(frontmatter);
  if (visibility) {
    return visibility === "public";
  }
  return PUBLISHED_KEYS.some((key) => isTruthy(frontmatter[key] as FrontmatterValue));
};

const extractCoverFromContent = (content: string): string => {
  const imgMatch = content.match(/!\[.*?\]\((.*?)\)/);
  if (imgMatch?.[1]) return imgMatch[1];
  const wikiImgMatch = content.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|bmp|svg))\]\]/i);
  if (wikiImgMatch?.[1]) return wikiImgMatch[1];
  const htmlImgMatch = content.match(/<img[^>]+src="([^">]+)"/);
  if (htmlImgMatch?.[1]) return htmlImgMatch[1];
  return "";
};

const stripMarkdown = (content: string): string =>
  content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`{3}[\s\S]*?`{3}/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/>\s/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const flattenMarkdownFiles = (entries: FileEntry[]): string[] => {
  const files: string[] = [];
  const walk = (nodes: FileEntry[]) => {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        walk(node.children);
      } else if (!node.is_dir && node.name.toLowerCase().endsWith(".md")) {
        files.push(node.path);
      }
    }
  };
  walk(entries);
  return files;
};

export async function loadPublishedNotes(fileTree: FileEntry[]): Promise<PublishNoteSource[]> {
  const files = flattenMarkdownFiles(fileTree);
  const notes: PublishNoteSource[] = [];

  for (const path of files) {
    try {
      const content = await readFile(path);
      const { frontmatter, content: body } = parseFrontmatter(content);
      if (!isPublished(frontmatter)) continue;

      const title = getFrontmatterString(frontmatter, TITLE_KEYS) || getTitleFromPath(path);
      const cover = getFrontmatterString(frontmatter, COVER_KEYS) || extractCoverFromContent(body);
      const tags = getFrontmatterTags(frontmatter);
      const mergedTags = tags.length > 0 ? tags : extractTags(body);
      const summary = stripMarkdown(body).slice(0, 200);
      const profileOrder = getFrontmatterNumber(frontmatter, PROFILE_ORDER_KEYS);
      const publishAt = getFrontmatterDateByKeys(frontmatter, PUBLISH_AT_KEYS);
      const slug = getFrontmatterString(frontmatter, SLUG_KEYS) || undefined;

      notes.push({
        path,
        title,
        summary,
        tags: mergedTags,
        cover: cover || undefined,
        profileOrder,
        publishAt,
        createdAt: getFrontmatterDate(frontmatter, "createdAt"),
        updatedAt: getFrontmatterDate(frontmatter, "updatedAt"),
        slug,
        content: body,
        frontmatter,
      });
    } catch (error) {
      console.warn("[Publish] Failed to read note:", path, error);
    }
  }

  return notes;
}
