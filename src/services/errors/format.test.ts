import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/useLocaleStore", () => ({
  getCurrentTranslations: () => ({
    agentMessage: {
      errors: {
        sendNetwork: "send network",
        sendAuth: "send auth",
        sendGeneric: "send generic",
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
        permissionFailed: "permission failed",
        abortFailed: "abort failed",
        sessionCreate: "session create",
        sessionSwitch: "session switch",
        sessionDelete: "session delete",
        panelCrashed: "panel crashed",
        generic: "generic",
      },
    },
  }),
}));

import { formatEnvelope } from "./format";
import type { ErrorEnvelope } from "./types";

function providerEnvelope(cause: unknown): ErrorEnvelope {
  return {
    id: "err-1",
    kind: "session.provider_error",
    severity: "blocker",
    message: typeof cause === "string" ? cause : "provider failed",
    cause,
    retryable: false,
    timestamp: 1,
  };
}

describe("formatEnvelope", () => {
  it("shows auth-specific provider errors", () => {
    expect(
      formatEnvelope(providerEnvelope({ response: { status: 401 } })),
    ).toEqual({ text: "provider auth" });
  });

  it("shows missing-key provider errors separately from invalid keys", () => {
    expect(
      formatEnvelope(providerEnvelope("You did not provide an API key.")),
    ).toEqual({ text: "provider key missing" });
  });

  it("does not offer retry for quota exhaustion", () => {
    expect(
      formatEnvelope(providerEnvelope("insufficient_quota")),
    ).toEqual({ text: "provider quota" });
  });

  it("keeps retry delay for rate limits", () => {
    expect(
      formatEnvelope(
        providerEnvelope({
          response: {
            status: 429,
            headers: { "retry-after": "12" },
          },
        }),
      ),
    ).toEqual({ text: "provider rate 12", action: "retry" });
  });

  it("shows context-specific errors for oversized requests", () => {
    expect(
      formatEnvelope(providerEnvelope("context_length_exceeded")),
    ).toEqual({ text: "provider context" });
  });
});
