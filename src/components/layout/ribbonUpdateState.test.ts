import { describe, expect, it } from "vitest";

import { getRibbonUpdateState } from "./ribbonUpdateState";

const baseSnapshot = {
  availableUpdate: null,
  hasUnreadUpdate: false,
  installPhase: "idle" as const,
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
        isChecking: true,
      }),
    ).toBe("ready");
  });

  it("treats persisted ready state without a current update as idle", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "ready",
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

  it("treats a cancelled install as available when an update remains", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        availableUpdate: { version: "1.2.3" },
        installPhase: "cancelled",
      }),
    ).toBe("available");
  });

  it("treats a cancelled install as idle when no update remains", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "cancelled",
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
        availableUpdate: { version: "1.2.3" },
        installPhase: "error",
        isChecking: true,
      }),
    ).toBe("error");
  });

  it("treats persisted error state without a current update as idle", () => {
    expect(
      getRibbonUpdateState({
        ...baseSnapshot,
        installPhase: "error",
      }),
    ).toBe("idle");
  });
});
