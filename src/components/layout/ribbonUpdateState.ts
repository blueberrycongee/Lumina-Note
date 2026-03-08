import { hasActionableTerminalInstallPhase, type UpdateInstallPhase } from "@/stores/useUpdateStore";

export type RibbonUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "in-progress"
  | "ready"
  | "error"
  | "cancelled";

interface UpdateRibbonSnapshot {
  availableUpdate: { version: string } | null;
  hasUnreadUpdate: boolean;
  installPhase: UpdateInstallPhase;
  installVersion: string | null;
  currentVersion: string | null;
  isChecking: boolean;
}

export function getRibbonUpdateState({
  availableUpdate,
  hasUnreadUpdate,
  installPhase,
  installVersion,
  currentVersion,
  isChecking,
}: UpdateRibbonSnapshot): RibbonUpdateState {
  const hasAvailableUpdate = availableUpdate !== null || hasUnreadUpdate;
  const hasActionableTerminalPhase = hasActionableTerminalInstallPhase(
    { phase: installPhase, version: installVersion },
    currentVersion,
  );

  if (installPhase === "ready") return hasActionableTerminalPhase ? "ready" : "idle";
  if (
    installPhase === "downloading" ||
    installPhase === "verifying" ||
    installPhase === "installing"
  ) {
    return "in-progress";
  }
  if (installPhase === "error") return hasActionableTerminalPhase ? "error" : hasAvailableUpdate ? "available" : "idle";
  if (installPhase === "cancelled") {
    return hasActionableTerminalPhase ? "cancelled" : hasAvailableUpdate ? "available" : "idle";
  }
  if (isChecking) return "checking";
  if (hasAvailableUpdate) return "available";
  return "idle";
}
