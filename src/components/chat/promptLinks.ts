export const PROMPT_LINK_PROTOCOL = "lumina-prompt:";

function decodePromptPayload(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  }
}

export function getPromptFromPromptLink(anchor: HTMLAnchorElement): string | null {
  const rawHref = anchor.getAttribute("href") ?? "";
  if (!rawHref.toLowerCase().startsWith(PROMPT_LINK_PROTOCOL)) {
    return null;
  }

  const label = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const payload = rawHref.slice(PROMPT_LINK_PROTOCOL.length);
  if (!payload) {
    return label || null;
  }

  if (payload.startsWith("//")) {
    try {
      const url = new URL(rawHref);
      const queryPrompt =
        url.searchParams.get("text") ?? url.searchParams.get("prompt");
      if (queryPrompt?.trim()) {
        return queryPrompt.trim();
      }
    } catch {
      // Fall back to decoding the raw payload below.
    }
  }

  if (payload.startsWith("?")) {
    const params = new URLSearchParams(payload.slice(1));
    const queryPrompt = params.get("text") ?? params.get("prompt");
    if (queryPrompt?.trim()) {
      return queryPrompt.trim();
    }
  }

  const decoded = decodePromptPayload(payload).trim();
  return decoded || label || null;
}
