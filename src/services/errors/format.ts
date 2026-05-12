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
import {
  classifyProviderRuntimeError,
  formatClassifiedProviderRuntimeError,
} from "@/services/ai/provider-runtime-error";

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
      const classified = classifyProviderRuntimeError(
        env.cause ?? env.message,
      );
      const text =
        formatClassifiedProviderRuntimeError(classified, e) ??
        e.providerGeneric;
      switch (classified.type) {
        case "api_key_missing":
          return { text };
        case "auth_failed":
        case "quota_exhausted":
        case "model_not_found":
        case "model_access_denied":
        case "context_too_large":
        case "thinking_not_supported":
          return { text };
        case "rate_limited":
          return {
            text,
            action: "retry",
          };
        case "stream_lost":
          return { text, action: "reload" };
        case "network_unreachable":
        case "provider_overloaded":
          return { text, action: "retry" };
        case "unknown":
          return { text, action: "retry" };
      }
    }

    case "permission.reply":
      return { text: e.permissionFailed };

    case "runtime.readiness":
      return { text: env.message };

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
