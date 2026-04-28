/**
 * Bridge between reportError envelopes and the sonner toast layer.
 *
 * Subscribes once at app boot. Surfaces transient-severity envelopes
 * as toast.error notifications. Blocker envelopes go to the banner
 * (handled by useErrorBanner); background envelopes only land in the
 * ring buffer + diagnostics panel.
 */

import { toast } from "sonner";

import { subscribeErrors } from "./reporter";

let wired = false;
export function wireErrorToasts(): void {
  if (wired) return;
  wired = true;
  subscribeErrors((env) => {
    if (env.severity !== "transient") return;
    toast.error(env.message, {
      description: env.kind,
      duration: 5000,
    });
  });
}
