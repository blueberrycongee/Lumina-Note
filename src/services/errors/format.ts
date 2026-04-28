/**
 * Display-side formatter: ErrorEnvelope → user-facing copy.
 *
 * The envelope carries technical metadata for diagnostics; this module
 * decides what an end user actually sees. Mainstream consumer AI
 * products (ChatGPT, Claude.ai) surface a single plain-language
 * sentence + an optional retry button — no kinds, no traceIds, no
 * stack fragments. We mirror that.
 *
 * Pattern matches on (kind, cause) to pick the most specific message
 * we can; falls back to a generic "Try again" for unknown shapes.
 */

import { getCurrentTranslations } from "@/stores/useLocaleStore";

import { classifyHttpError } from "./retry";
import type { ErrorEnvelope } from "./types";

export type ErrorAction = "retry" | "reload";

export type FormattedError = {
  text: string;
  /**
   * Hint for what kind of action the surface should offer. The actual
   * onClick is wired by the surface (banner / toast). `undefined`
   * means "no action".
   */
  action?: ErrorAction;
};

export function formatEnvelope(env: ErrorEnvelope): FormattedError {
  const e = getCurrentTranslations().agentMessage.errors;

  switch (env.kind) {
    case "task.start": {
      const cls = classifyHttpError(env.cause);
      if (cls.reason === "network") {
        return { text: e.sendNetwork, action: "retry" };
      }
      if (cls.reason === "401" || cls.reason === "403") {
        return { text: e.sendAuth };
      }
      return { text: e.sendGeneric, action: "retry" };
    }

    case "session.provider_error": {
      const causeMsg = causeText(env).toLowerCase();
      if (
        causeMsg.includes("reasoning_content") ||
        causeMsg.includes("thinking mode") ||
        causeMsg.includes("thinking_content")
      ) {
        return { text: e.providerThinkingNotSupported };
      }
      if (
        causeMsg.includes("event stream") ||
        causeMsg.includes("connection failed")
      ) {
        return { text: e.providerStreamLost, action: "reload" };
      }
      return { text: e.providerGeneric, action: "retry" };
    }

    case "permission.reply":
      return { text: e.permissionFailed };

    case "session.abort":
      return { text: e.abortFailed };

    case "session.create":
      return { text: e.sessionCreate };

    case "session.switch":
      return { text: e.sessionSwitch };

    case "session.delete":
      return { text: e.sessionDelete };

    case "render.boundary":
      return { text: e.panelCrashed, action: "reload" };

    case "session.list":
    case "unknown":
    default:
      return { text: e.generic, action: "retry" };
  }
}

function causeText(env: ErrorEnvelope): string {
  // Combine envelope.message (often the technical text) with any
  // string-shaped cause body. We only inspect the *content* to detect
  // known provider-side error patterns; we never display this string
  // to the user directly.
  const parts: string[] = [];
  if (env.message) parts.push(env.message);
  const c = env.cause;
  if (typeof c === "string") parts.push(c);
  else if (c && typeof c === "object") {
    const obj = c as { message?: unknown; data?: { message?: unknown } };
    if (typeof obj.message === "string") parts.push(obj.message);
    if (
      obj.data &&
      typeof obj.data === "object" &&
      typeof obj.data.message === "string"
    ) {
      parts.push(obj.data.message);
    }
  }
  return parts.join(" ");
}
