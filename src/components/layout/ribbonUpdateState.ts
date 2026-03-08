import type { UpdateInstallPhase } from "@/stores/useUpdateStore";

export type RibbonUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "in-progress"
  | "ready"
  | "error";

interface UpdateRibbonSnapshot {
  availableUpdate: { version: string } | null;
  hasUnreadUpdate: boolean;
  installPhase: UpdateInstallPhase;
  isChecking: boolean;
}

export function getRibbonUpdateState({
  availableUpdate,
  hasUnreadUpdate,
  installPhase,
  isChecking,
}: UpdateRibbonSnapshot): RibbonUpdateState {
  const hasAvailableUpdate = availableUpdate !== null || hasUnreadUpdate;

  // `installTelemetry` is persisted so terminal phases can survive app restarts.
  // Only surface ready/error badges when there is still a known update to act on.
  if (installPhase === "ready") return hasAvailableUpdate ? "ready" : "idle";
  if (
    installPhase === "downloading" ||
    installPhase === "verifying" ||
    installPhase === "installing"
  ) {
    return "in-progress";
  }
  if (installPhase === "error") return hasAvailableUpdate ? "error" : "idle";
  // A cancelled install is recoverable; show the remaining update instead of an error badge.
  if (installPhase === "cancelled") return hasAvailableUpdate ? "available" : "idle";
  if (isChecking) return "checking";
  if (hasAvailableUpdate) return "available";
  return "idle";
}
