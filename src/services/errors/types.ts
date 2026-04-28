/**
 * Structured error envelope shared across the app.
 *
 * Strings get tossed; envelopes survive — they carry enough metadata to
 * filter (kind), route (severity), correlate (traceId / sessionId) and
 * decide retry behaviour. Every catch / SSE error path funnels through
 * `reportError(env)` so the diagnostics panel, banner store, toast layer
 * and on-disk log all see the same shape.
 */

export type ErrorSeverity =
  /** Blocks the user's primary task. Sticky banner. */
  | "blocker"
  /** Discrete user-initiated action failed. Toast. */
  | "transient"
  /** Background refresh / opportunistic call. Log only. */
  | "background";

/**
 * Kinds are deliberately namespaced (`<area>.<op>`) so we can filter by
 * area in the diagnostics panel and add new kinds without breaking
 * exhaustiveness checks elsewhere. The union grows over time; keep the
 * list in lexical order.
 */
export type ErrorKind =
  | "permission.reply"
  | "render.boundary"
  | "session.abort"
  | "session.create"
  | "session.delete"
  | "session.list"
  | "session.provider_error"
  | "session.switch"
  | "task.start"
  | "unknown";

export type ErrorEnvelope = {
  /** Stable per-envelope id; used for dismiss + dedup. */
  id: string;
  kind: ErrorKind;
  severity: ErrorSeverity;
  /** Human-readable, end-user-safe summary. Surfaced in banner / toast. */
  message: string;
  /**
   * Original throwable / response body. Kept verbatim for diagnostics;
   * never rendered raw in the UI.
   */
  cause?: unknown;
  /**
   * True for transient infra failures (5xx, network). Drives whether
   * retryWithBackoff bothers retrying before surfacing.
   */
  retryable: boolean;
  /** Opencode session this happened in, when applicable. */
  sessionId?: string;
  /**
   * Correlates one user-initiated flow across HTTP + SSE + render. Set
   * by startTask, propagated into SSE event handlers and any catch
   * downstream of that flow.
   */
  traceId?: string;
  /** Wallclock ms. */
  timestamp: number;
};

/** Input to reportError — id + timestamp are filled in by the reporter. */
export type ErrorReport = Omit<ErrorEnvelope, "id" | "timestamp">;
