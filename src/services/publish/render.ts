import { parseMarkdown } from "@/services/markdown/markdown";
import { rewriteMarkdownAssetLinks } from "./assets";

export interface RenderPublishOptions {
  mapAssetUrl?: (url: string) => string | null;
}

export function renderPublishHtml(markdown: string, options?: RenderPublishOptions): string {
  const rewritten = options?.mapAssetUrl
    ? rewriteMarkdownAssetLinks(markdown, options.mapAssetUrl)
    : markdown;
  return parseMarkdown(rewritten);
}
