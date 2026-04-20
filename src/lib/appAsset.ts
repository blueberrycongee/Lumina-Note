const DEFAULT_RENDERER_URL = "http://localhost/index.html";

export function resolveRendererAssetUrl(assetPath: string, baseUrl?: string): string {
  const normalizedPath = assetPath.replace(/^(?:\.\/|\/)+/, "");
  const currentUrl =
    baseUrl ??
    (typeof window === "undefined" ? DEFAULT_RENDERER_URL : window.location.href);

  return new URL(normalizedPath, currentUrl).toString();
}
