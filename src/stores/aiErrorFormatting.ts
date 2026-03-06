import { getCurrentTranslations } from "@/stores/useLocaleStore";

function extractProviderErrorMessage(error: unknown): string {
  const errorStr = error instanceof Error ? error.message : String(error);

  try {
    const jsonMatch = errorStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      const message = data.error?.message || data.message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  } catch {
  }

  return errorStr;
}

function isMissingApiKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  if (!lower.includes("api key")) {
    return false;
  }

  return [
    "not provide",
    "did not provide",
    "missing",
    "required",
    "not set",
    "no api key",
    "without an api key",
  ].some((pattern) => lower.includes(pattern));
}

export function formatUserFriendlyError(error: unknown): string {
  const message = extractProviderErrorMessage(error);
  if (isMissingApiKeyError(message)) {
    return getCurrentTranslations().ai.apiKeyRequired;
  }
  return message;
}
