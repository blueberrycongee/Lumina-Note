import type { PublishIndex, PublishPostIndex } from "./index";
import { buildPublishIndexFromNotes } from "./index";
import type { PublishNoteSource } from "./notes";
import { buildAssetManifest, createAssetUrlMapper } from "./assetManifest";
import { defaultTheme, buildThemeCss, ThemeTokens } from "./theme";
import { renderPublishHtml } from "./render";
import { renderIndexPage, renderPostPage } from "./templates";
import { joinBasePath, normalizeBasePath, normalizeSubPath } from "./config";

export interface PublishPlanOptions {
  basePath?: string;
  postsBasePath?: string;
  assetsBasePath?: string;
  theme?: ThemeTokens;
  generatedAt?: string;
}

export interface PublishPlanFile {
  path: string;
  content: string;
}

export interface PublishPlan {
  index: PublishIndex;
  theme: ThemeTokens;
  assetManifest: ReturnType<typeof buildAssetManifest>;
  files: PublishPlanFile[];
}

const buildSiteData = (index: PublishIndex, generatedAt: string) => {
  return {
    ...index,
    generatedAt,
  };
};

const buildPostHtml = (note: PublishNoteSource, manifest: ReturnType<typeof buildAssetManifest>) => {
  const mapper = createAssetUrlMapper(note.path, manifest);
  return renderPublishHtml(note.content || "", { mapAssetUrl: mapper });
};

export const buildPublishPlan = (
  notes: PublishNoteSource[],
  profile: PublishIndex["profile"],
  options?: PublishPlanOptions
): PublishPlan => {
  const theme = options?.theme ?? defaultTheme;
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const basePath = normalizeBasePath(options?.basePath);
  const postsSubPath = normalizeSubPath(options?.postsBasePath, "posts");
  const assetsSubPath = normalizeSubPath(options?.assetsBasePath, "assets");
  const postsBasePath = joinBasePath(basePath, postsSubPath);
  const themeUrl = joinBasePath(basePath, "/theme.css");
  const homeUrl = basePath ? `${basePath}/` : "/";
  const index = buildPublishIndexFromNotes(notes, profile, {
    postsBasePath,
  });
  const assetManifest = buildAssetManifest(notes, {
    assetsBasePath: assetsSubPath,
    basePath,
  });

  const files: PublishPlanFile[] = [];

  files.push({ path: "index.html", content: renderIndexPage(index, { themeUrl }) });
  files.push({ path: "theme.json", content: JSON.stringify(theme, null, 2) });
  files.push({ path: "theme.css", content: buildThemeCss(theme) });
  files.push({ path: "data/site.json", content: JSON.stringify(buildSiteData(index, generatedAt), null, 2) });

  for (const post of index.posts) {
    const note = notes.find((candidate) => candidate.path === post.path);
    if (!note) continue;
    const html = buildPostHtml(note, assetManifest);
    const postHtml = renderPostPage(post, html, { themeUrl, homeUrl });
    const relativePath = `${postsSubPath.replace(/^\//, "")}/${post.slug}/index.html`;
    files.push({ path: relativePath, content: postHtml });
  }

  return {
    index,
    theme,
    assetManifest,
    files,
  };
};
