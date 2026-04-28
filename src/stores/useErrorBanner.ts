/**
 * Banner store — drives the sticky red error banner in the chat surface.
 *
 * Subscribes to `reportError` and keeps the most recent unsdismissed
 * blocker-severity envelope. Sticky by design: cleared by explicit
 * dismiss (X button), `clearBanner()` (called from startTask /
 * switchSession when a new flow begins), or the next blocker arriving
 * (which replaces the previous one — we only show one at a time).
 *
 * Transient and background envelopes are ignored here; they go through
 * the toast layer / diagnostics buffer instead.
 */

import { create } from "zustand";

import type { ErrorEnvelope } from "@/services/errors";
import { subscribeErrors } from "@/services/errors";

type BannerState = {
  active: ErrorEnvelope | null;
  dismiss: () => void;
  clearBanner: () => void;
};

export const useErrorBanner = create<BannerState>((set) => ({
  active: null,
  dismiss: () => set({ active: null }),
  clearBanner: () => set({ active: null }),
}));

let wired = false;
export function wireErrorBanner(): void {
  if (wired) return;
  wired = true;
  subscribeErrors((env) => {
    if (env.severity !== "blocker") return;
    useErrorBanner.setState({ active: env });
  });
}
