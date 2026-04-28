/**
 * Bounded retry helper.
 *
 * Two attempts max with exponential backoff (250 ms, 750 ms). Only
 * retries when classifyHttpError() decides the failure is transient
 * (network drop, 5xx, 408, 429). 4xx (except 408/429) is a real
 * client/config bug and surfacing immediately is correct — retrying
 * would just hammer the same broken request.
 *
 * Pure: no React, no zustand. Callers decide what to do with the
 * eventual failure (almost always: route through reportError()).
 */

export type RetryClassification = {
  retryable: boolean;
  /** Best-effort short reason — e.g. "5xx", "network", "4xx", "abort". */
  reason: string;
};

export function classifyHttpError(err: unknown): RetryClassification {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    if (name === "AbortError") return { retryable: false, reason: "abort" };
  }

  // ResponseError shape from @opencode-ai/sdk's openapi-fetch wrapper.
  // Both raw fetch + opencode SDK surface .response.status when the call
  // got far enough to receive a status.
  const status = extractStatus(err);
  if (status === null) {
    // No HTTP status — almost always a network-level error (DNS, refused,
    // TLS, body parse). Treat as retryable.
    return { retryable: true, reason: "network" };
  }
  if (status >= 500 && status < 600) {
    return { retryable: true, reason: `${status}` };
  }
  if (status === 408 || status === 429) {
    return { retryable: true, reason: `${status}` };
  }
  return { retryable: false, reason: `${status}` };
}

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const obj = err as Record<string, unknown>;
  if (typeof obj.status === "number") return obj.status;
  if (obj.response && typeof obj.response === "object") {
    const resp = obj.response as Record<string, unknown>;
    if (typeof resp.status === "number") return resp.status;
  }
  return null;
}

export type RetryOptions = {
  maxAttempts?: number;
  /** Backoff schedule in ms; index = attempt number (0-based). */
  delaysMs?: number[];
  /** Fired before each retry — diagnostics hook. */
  onRetry?: (attempt: number, err: unknown, classification: RetryClassification) => void;
};

const DEFAULT_DELAYS = [250, 750];

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_DELAYS.length + 1;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const cls = classifyHttpError(err);
      const isLastAttempt = attempt === maxAttempts - 1;
      if (!cls.retryable || isLastAttempt) {
        throw err;
      }
      opts.onRetry?.(attempt, err, cls);
      const wait = delays[attempt] ?? delays[delays.length - 1] ?? 0;
      await sleep(wait);
    }
  }
  // Unreachable — the loop above either returns or throws.
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Per-flow correlation id. Attached to optimistic messages on send,
 * propagated into reportError envelopes downstream so a failure can
 * be traced back to the user action that triggered it.
 */
export function makeTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
