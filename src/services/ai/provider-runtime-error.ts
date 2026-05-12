export type ProviderRuntimeError =
  | { type: "api_key_missing" }
  | { type: "auth_failed" }
  | { type: "quota_exhausted" }
  | { type: "rate_limited"; retryAfterSeconds?: number }
  | { type: "model_not_found" }
  | { type: "model_access_denied" }
  | { type: "context_too_large" }
  | { type: "thinking_not_supported" }
  | { type: "stream_lost" }
  | { type: "network_unreachable" }
  | { type: "provider_overloaded" }
  | { type: "unknown" };

export type ProviderRuntimeErrorMessages = {
  providerApiKeyMissing: string;
  providerAuthFailed: string;
  providerQuotaExhausted: string;
  providerRateLimited: string;
  providerRateLimitedWithDelay: string;
  providerModelNotFound: string;
  providerModelAccessDenied: string;
  providerContextTooLarge: string;
  providerThinkingNotSupported: string;
  providerStreamLost: string;
  providerNetwork: string;
  providerOverloaded: string;
  providerGeneric: string;
};

export function classifyProviderRuntimeError(
  error: unknown,
): ProviderRuntimeError {
  const status = extractStatus(error);
  const text = extractErrorText(error).toLowerCase();
  const retryAfterSeconds = extractRetryAfterSeconds(error);

  if (
    text.includes("reasoning_content") ||
    text.includes("thinking mode") ||
    text.includes("thinking_content")
  ) {
    return { type: "thinking_not_supported" };
  }

  if (
    text.includes("event stream") ||
    text.includes("stream disconnected") ||
    (text.includes("stream") && text.includes("connection failed"))
  ) {
    return { type: "stream_lost" };
  }

  if (includesAny(text, [
    "api key not set",
    "api key is required",
    "did not provide an api key",
    "missing api key",
    "no api key",
    "no api key configured",
    "not provide an api key",
    "without an api key",
  ])) {
    return { type: "api_key_missing" };
  }

  if (status === 401 || status === 403 || includesAny(text, [
    "invalid api key",
    "invalid_api_key",
    "unauthorized",
    "forbidden",
    "incorrect api key",
    "api key is invalid",
  ])) {
    return { type: "auth_failed" };
  }

  if (status === 429 || includesAny(text, [
    "rate limit",
    "rate_limit",
    "too many requests",
    "requests per minute",
    "tokens per minute",
  ])) {
    return { type: "rate_limited", retryAfterSeconds };
  }

  if (includesAny(text, [
    "insufficient_quota",
    "quota exceeded",
    "exceeded your current quota",
    "credit balance",
    "billing",
    "payment required",
    "insufficient balance",
  ])) {
    return { type: "quota_exhausted" };
  }

  if (status === 413 || includesAny(text, [
    "context length",
    "context_length_exceeded",
    "request too large",
    "maximum context",
    "too many tokens",
    "token limit",
  ])) {
    return { type: "context_too_large" };
  }

  if (status === 404 || includesAny(text, [
    "model not found",
    "model_not_found",
    "does not exist",
    "no such model",
    "unknown model",
  ])) {
    return { type: "model_not_found" };
  }

  if (includesAny(text, [
    "model access",
    "not have access",
    "do not have access",
    "permission denied",
    "not authorized to access",
    "not enabled for",
  ])) {
    return { type: "model_access_denied" };
  }

  if (status !== null && status >= 500 && status < 600) {
    return { type: "provider_overloaded" };
  }

  if (includesAny(text, [
    "network error",
    "connection failed",
    "failed to fetch",
    "econnrefused",
    "enotfound",
    "etimedout",
    "timeout",
    "socket hang up",
  ])) {
    return { type: "network_unreachable" };
  }

  return { type: "unknown" };
}

export function formatClassifiedProviderRuntimeError(
  error: ProviderRuntimeError,
  messages: ProviderRuntimeErrorMessages,
): string | undefined {
  switch (error.type) {
    case "api_key_missing":
      return messages.providerApiKeyMissing;
    case "auth_failed":
      return messages.providerAuthFailed;
    case "quota_exhausted":
      return messages.providerQuotaExhausted;
    case "rate_limited":
      return error.retryAfterSeconds !== undefined
        ? messages.providerRateLimitedWithDelay.replace(
            "{seconds}",
            String(error.retryAfterSeconds),
          )
        : messages.providerRateLimited;
    case "model_not_found":
      return messages.providerModelNotFound;
    case "model_access_denied":
      return messages.providerModelAccessDenied;
    case "context_too_large":
      return messages.providerContextTooLarge;
    case "thinking_not_supported":
      return messages.providerThinkingNotSupported;
    case "stream_lost":
      return messages.providerStreamLost;
    case "network_unreachable":
      return messages.providerNetwork;
    case "provider_overloaded":
      return messages.providerOverloaded;
    case "unknown":
      return undefined;
  }
}

export function formatProviderRuntimeErrorMessage(
  error: unknown,
  messages: ProviderRuntimeErrorMessages,
): string | undefined {
  return formatClassifiedProviderRuntimeError(
    classifyProviderRuntimeError(error),
    messages,
  );
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function extractStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const obj = error as Record<string, unknown>;
  if (typeof obj.status === "number") return obj.status;
  if (obj.response && typeof obj.response === "object") {
    const response = obj.response as Record<string, unknown>;
    if (typeof response.status === "number") return response.status;
  }
  return null;
}

function extractRetryAfterSeconds(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const obj = error as Record<string, unknown>;
  const headers = obj.headers ?? (obj.response as { headers?: unknown } | undefined)?.headers;
  const value = readHeader(headers, "retry-after");
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (key: string) => string | null }).get(name);
    return value ?? undefined;
  }
  if (typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    const hit = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
    return typeof hit === "string" ? hit : undefined;
  }
  return undefined;
}

export function extractErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "");

  const obj = error as {
    message?: unknown;
    data?: { message?: unknown; error?: unknown };
    error?: unknown;
    body?: unknown;
  };
  const parts: string[] = [];
  appendString(parts, obj.message);
  appendString(parts, obj.data?.message);
  appendString(parts, obj.data?.error);
  appendString(parts, obj.error);
  appendString(parts, obj.body);
  return parts.join(" ");
}

function appendString(parts: string[], value: unknown): void {
  if (typeof value === "string") {
    parts.push(value);
  } else if (value && typeof value === "object") {
    try {
      parts.push(JSON.stringify(value));
    } catch {
      // Ignore unserializable diagnostic objects.
    }
  }
}
