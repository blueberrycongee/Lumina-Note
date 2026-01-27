import { basename, dirname, extname, isAbsolute, normalize, resolve } from "@/lib/path";
import { slugify } from "./slug";

export const isExternalUrl = (url: string): boolean => {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(url);
};

const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
const wikiImageRegex = /!\[\[([^\]]+)\]\]/g;
const htmlImageRegex = /<img([^>]*?)\s+src=(['"])([^'"]+)\2([^>]*?)>/gi;

const parseMarkdownLinkTarget = (raw: string): { url: string; title: string } => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([^\s]+)(\s+["'][^"']*["'])?$/);
  if (!match) {
    return { url: trimmed, title: "" };
  }
  return {
    url: match[1],
    title: match[2] ?? "",
  };
};

const parseWikiLinkTarget = (raw: string): { path: string; suffix: string } => {
  const parts = raw.split("|");
  const path = parts[0].trim();
  const suffix = parts.length > 1 ? `|${parts.slice(1).join("|")}` : "";
  return { path, suffix };
};

export const extractAssetLinks = (markdown: string): string[] => {
  const matches: { index: number; url: string }[] = [];

  for (const match of markdown.matchAll(markdownImageRegex)) {
    const raw = match[2];
    const { url } = parseMarkdownLinkTarget(raw);
    matches.push({ index: match.index ?? 0, url });
  }

  for (const match of markdown.matchAll(wikiImageRegex)) {
    const raw = match[1];
    const { path } = parseWikiLinkTarget(raw);
    matches.push({ index: match.index ?? 0, url: path });
  }

  for (const match of markdown.matchAll(htmlImageRegex)) {
    const url = match[3];
    matches.push({ index: match.index ?? 0, url });
  }

  return matches
    .sort((a, b) => a.index - b.index)
    .map((match) => match.url);
};

export const rewriteMarkdownAssetLinks = (
  markdown: string,
  replace: (url: string) => string | null
): string => {
  let output = markdown;

  output = output.replace(markdownImageRegex, (full, alt: string, raw: string) => {
    const { url, title } = parseMarkdownLinkTarget(raw);
    const next = replace(url);
    if (!next) return full;
    return `![${alt}](${next}${title})`;
  });

  output = output.replace(wikiImageRegex, (full, raw: string) => {
    const { path, suffix } = parseWikiLinkTarget(raw);
    const next = replace(path);
    if (!next) return full;
    return `![[${next}${suffix}]]`;
  });

  output = output.replace(htmlImageRegex, (full, pre: string, quote: string, url: string, post: string) => {
    const next = replace(url);
    if (!next) return full;
    return `<img${pre} src=${quote}${next}${quote}${post}>`;
  });

  return output;
};

const splitAssetUrl = (url: string): { path: string; suffix: string } => {
  const [pathWithQuery, hash = ""] = url.split("#");
  const [path, query = ""] = pathWithQuery.split("?");
  const suffix = `${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  return { path, suffix };
};

const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const resolveAssetSourcePath = (
  notePath: string,
  assetRef: string
): { sourcePath: string; suffix: string } | null => {
  if (isExternalUrl(assetRef)) return null;
  const { path, suffix } = splitAssetUrl(assetRef.trim());
  if (!path) return null;
  const absolute = isAbsolute(path) ? path : resolve(dirname(notePath), path);
  const normalized = normalize(absolute);
  const sourcePath = absolute.startsWith(\"/\") && !normalized.startsWith(\"/\") ? `/${normalized}` : normalized;
  return { sourcePath, suffix };
};

export const buildAssetOutputName = (sourcePath: string): string => {
  const extension = extname(sourcePath);
  const base = basename(sourcePath, extension);
  const safeBase = slugify(base) || "asset";
  return `${safeBase}-${hashString(sourcePath)}${extension}`;
};
