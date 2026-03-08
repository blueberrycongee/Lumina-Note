import { describe, expect, it } from "vitest";

import { getRibbonUpdateState } from "./ribbonUpdateState";

const baseSnapshot = {
  availableUpdate: null,
  hasUnreadUpdate: false,
  installPhase: "idle" as const,
  installVersion: null,
  currentVersion: "1.0.0",
  isChecking: false,
};

describe("getRibbonUpdateState", () => {
  it("prefers ready over checking and update availability", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        availableUpdate: { version: "1.2.3" },
        hasUnreadUpdate: true,
        installPhase: "ready",
        installVersion: "1.2.3",
        isChecking: true,
      }),
    ).toBe("ready");
  });

  it("preserves persisted ready state without a current update when restart is still pending", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "ready",
        installVersion: "1.2.3",
      }),
    ).toBe("ready");
  });

  it("treats ready as idle once the app version catches up", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "ready",
        installVersion: "1.0.0",
      }),
    ).toBe("idle");
  });

  it("treats legacy ready telemetry without a version as idle", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "ready",
        installVersion: null,
      }),
    ).toBe("idle");
  });

  it.each(["downloading", "verifying", "installing"] as const)(
    "maps %s to in-progress",
    (installPhase) => {
      expect(
        getRibbonUpdateState({
          ...baseSnapshot,
          availableUpdate: { version: "1.2.3" },
          installPhase,
          isChecking: true,
        }),
      ).toBe("in-progress");
    },
  );

  it("preserves cancelled install state when restart recovery is still relevant", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "cancelled",
        installVersion: "1.2.3",
      }),
    ).toBe("cancelled");
  });

  it("treats legacy cancelled telemetry without a version as idle", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "cancelled",
        installVersion: null,
      }),
    ).toBe("idle");
  });

  it("shows checking when there is no install phase activity", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        isChecking: true,
      }),
    ).toBe("checking");
  });

  it("maps error to error", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "error",
        installVersion: "1.2.3",
        isChecking: true,
      }),
    ).toBe("error");
  });

  it("preserves persisted error state without a current update", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "error",
        installVersion: "1.2.3",
      }),
    ).toBe("error");
  });

  it("treats legacy error telemetry without a version as idle", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "error",
        installVersion: null,
      }),
    ).toBe("idle");
  });
});
