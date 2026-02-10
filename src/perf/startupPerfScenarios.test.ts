import { describe, expect, it } from "vitest";
import { runStartupPerfScenarios } from "@/perf/startupPerfScenarios";

describe("runStartupPerfScenarios", () => {
  it("returns executable startup scenarios with stable shape", () => {
    const report = runStartupPerfScenarios();

    expect(report.generatedAt).toBeGreaterThan(0);
    expect(report.results.length).toBeGreaterThanOrEqual(3);

    for (const scenario of report.results) {
      expect(scenario.id.length).toBeGreaterThan(0);
      expect(Number.isFinite(scenario.durationMs)).toBe(true);
      expect(scenario.durationMs).toBeGreaterThanOrEqual(0);
      expect(scenario.thresholdMs).toBeGreaterThan(0);
      expect(scenario.codeRefs.length).toBeGreaterThan(0);
    }
  });
});

