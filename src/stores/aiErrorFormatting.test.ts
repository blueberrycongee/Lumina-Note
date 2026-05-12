import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/useLocaleStore", () => ({
  getCurrentTranslations: () => ({
    agentMessage: {
      errors: {
        providerApiKeyMissing: "provider key missing",
        providerAuthFailed: "provider auth",
        providerQuotaExhausted: "provider quota",
        providerRateLimited: "provider rate",
        providerRateLimitedWithDelay: "provider rate {seconds}",
        providerModelNotFound: "provider model missing",
        providerModelAccessDenied: "provider model denied",
        providerContextTooLarge: "provider context",
        providerThinkingNotSupported: "provider thinking",
        providerStreamLost: "provider stream",
        providerNetwork: "provider network",
        providerOverloaded: "provider overloaded",
        providerGeneric: "provider generic",
      },
    },
  }),
}));

import { formatUserFriendlyError } from "./aiErrorFormatting";

describe("formatUserFriendlyError", () => {
  it("uses the shared model-not-found message", () => {
    expect(
      formatUserFriendlyError(
        'HTTP 404 error: {"error":{"message":"model \'gpt-4.1\' does not exist"}}',
      ),
    ).toBe("provider model missing");
  });

  it("uses the shared missing API key message", () => {
    expect(
      formatUserFriendlyError(
        'HTTP 401 error: {"error":{"message":"You did not provide an API key."}}',
      ),
    ).toBe("provider key missing");
  });

  it("uses the shared network error message", () => {
    expect(formatUserFriendlyError("Network connection failed")).toBe(
      "provider network",
    );
  });

  it("preserves unknown provider messages for diagnostics", () => {
    expect(formatUserFriendlyError("Provider returned a custom failure")).toBe(
      "Provider returned a custom failure",
    );
  });
});
