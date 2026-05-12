import { describe, expect, it } from "vitest";

import {
  classifyProviderRuntimeError,
  formatProviderRuntimeErrorMessage,
} from "./provider-runtime-error";

describe("classifyProviderRuntimeError", () => {
  it("classifies missing API keys separately from invalid keys", () => {
    expect(
      classifyProviderRuntimeError("You did not provide an API key."),
    ).toEqual({ type: "api_key_missing" });
  });

  it("classifies invalid API keys", () => {
    expect(
      classifyProviderRuntimeError({
        response: { status: 401 },
        data: { message: "Incorrect API key provided" },
      }),
    ).toEqual({ type: "auth_failed" });
  });

  it("classifies quota exhaustion separately from rate limits", () => {
    expect(
      classifyProviderRuntimeError(
        "insufficient_quota: You exceeded your current quota",
      ),
    ).toEqual({ type: "quota_exhausted" });
  });

  it("keeps retry-after seconds for rate limits", () => {
    expect(
      classifyProviderRuntimeError({
        response: {
          status: 429,
          headers: { "retry-after": "12" },
        },
      }),
    ).toEqual({ type: "rate_limited", retryAfterSeconds: 12 });
  });

  it("classifies missing models", () => {
    expect(
      classifyProviderRuntimeError(
        "HTTP 404 error: model 'gpt-unknown' does not exist",
      ),
    ).toEqual({ type: "model_not_found" });
  });

  it("classifies context length failures", () => {
    expect(
      classifyProviderRuntimeError("context_length_exceeded: too many tokens"),
    ).toEqual({ type: "context_too_large" });
  });

  it("treats generic connection failures as network errors", () => {
    expect(
      classifyProviderRuntimeError("Network connection failed"),
    ).toEqual({ type: "network_unreachable" });
  });
});

describe("formatProviderRuntimeErrorMessage", () => {
  const messages = {
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
  };

  it("formats classified provider errors through the shared catalog", () => {
    expect(
      formatProviderRuntimeErrorMessage(
        {
          response: {
            status: 429,
            headers: { "retry-after": "12" },
          },
        },
        messages,
      ),
    ).toBe("provider rate 12");
  });

  it("leaves unknown errors to the caller", () => {
    expect(
      formatProviderRuntimeErrorMessage(
        "provider-specific custom failure",
        messages,
      ),
    ).toBeUndefined();
  });
});
