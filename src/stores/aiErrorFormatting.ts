import { formatProviderRuntimeErrorMessage } from "@/services/ai/provider-runtime-error";
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

export function formatUserFriendlyError(error: unknown): string {
  const messages = getCurrentTranslations().agentMessage.errors;
  const providerMessage = formatProviderRuntimeErrorMessage(error, messages);
  if (providerMessage) {
    return providerMessage;
  }

  const message = extractProviderErrorMessage(error);
  return message;
}
