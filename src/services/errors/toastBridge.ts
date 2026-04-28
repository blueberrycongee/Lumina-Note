/**
 * Bridge between reportError envelopes and the sonner toast layer.
 *
 * Subscribes once at app boot. Surfaces transient-severity envelopes
 * as toast.error notifications. Blocker envelopes go to the banner
 * (handled by useErrorBanner); background envelopes only land in the
 * ring buffer + diagnostics panel.
 */

import { toast } from "sonner";

import { formatEnvelope } from "./format";
import { subscribeErrors } from "./reporter";

let wired = false;
export function wireErrorToasts(): void {
  if (wired) return;
  wired = true;
  subscribeErrors((env) => {
    if (env.severity !== "transient") return;
    // Plain-language message only — same pattern consumer AI products
    // use. The envelope kind / traceId / cause go to the diagnostics
    // panel + ndjson, not in front of the user.
    toast.error(formatEnvelope(env).text, { duration: 5000 });
  });
}
