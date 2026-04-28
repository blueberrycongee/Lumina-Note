/**
 * Single-funnel error reporter.
 *
 * Every catch block / SSE error path in the app calls reportError(). It
 * does three things, in order:
 *
 *   1. Push a normalized envelope onto a bounded ring buffer (last 200).
 *      The diagnostics panel + "copy recent errors" feature read from here.
 *   2. Emit a structured single-line console.error with a stable prefix so
 *      logs are grep-friendly: `[lumina:error] kind=... severity=...`.
 *   3. Notify subscribers (banner store, toast layer, persistence sink).
 *
 * The reporter is intentionally framework-agnostic — no zustand, no React.
 * Subscribers pull what they need.
 */

import type { ErrorEnvelope, ErrorReport } from "./types";

const RING_CAPACITY = 200;

const ring: ErrorEnvelope[] = [];
const listeners = new Set<(env: ErrorEnvelope) => void>();

export function reportError(report: ErrorReport): ErrorEnvelope {
  const envelope: ErrorEnvelope = {
    ...report,
    id: makeId(),
    timestamp: Date.now(),
  };

  ring.push(envelope);
  if (ring.length > RING_CAPACITY) ring.shift();

  // One-line structured log — easy to grep, easy to ship to telemetry
  // later. The cause is logged as a second arg so devtools can expand
  // the stack without us having to stringify it.
  // eslint-disable-next-line no-console
  console.error(
    `[lumina:error] kind=${envelope.kind} severity=${envelope.severity} retryable=${envelope.retryable}` +
      (envelope.sessionId ? ` session=${envelope.sessionId}` : "") +
      (envelope.traceId ? ` trace=${envelope.traceId}` : "") +
      ` msg=${JSON.stringify(envelope.message)}`,
    envelope.cause ?? "",
  );

  for (const fn of listeners) {
    try {
      fn(envelope);
    } catch (err) {
      // A buggy subscriber must never break the reporter, otherwise one
      // bad listener tears down every error path in the app.
      // eslint-disable-next-line no-console
      console.error("[lumina:error] subscriber threw", err);
    }
  }

  return envelope;
}

export function subscribeErrors(
  fn: (env: ErrorEnvelope) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Snapshot of the ring, oldest-first. Safe to mutate; it's a copy. */
export function getRecentErrors(): ErrorEnvelope[] {
  return ring.slice();
}

/** Test helpers. Not exported from the index barrel by design. */
export function clearErrorBuffer(): void {
  ring.length = 0;
}
export function _resetReporterForTesting(): void {
  ring.length = 0;
  listeners.clear();
}

function makeId(): string {
  // Per-process unique enough — ts (base36) + 6 random chars. We don't
  // need crypto strength; this id is just for dismiss / dedup in the UI.
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
