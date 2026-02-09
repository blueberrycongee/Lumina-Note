import { describe, expect, it } from "vitest";

import { requiresMoonshotTemperatureOne } from "./moonshot";

describe("requiresMoonshotTemperatureOne", () => {
  it("returns true for thinking models", () => {
    expect(requiresMoonshotTemperatureOne("kimi-k2-thinking")).toBe(true);
    expect(requiresMoonshotTemperatureOne("KIMI-K2-THINKING-TURBO")).toBe(true);
  });

  it("returns true for k2.5 models", () => {
    expect(requiresMoonshotTemperatureOne("kimi-k2.5")).toBe(true);
    expect(requiresMoonshotTemperatureOne("moonshotai/kimi-k2.5")).toBe(true);
    expect(requiresMoonshotTemperatureOne("kimi-k2-5")).toBe(true);
  });

  it("returns false for non-fixed-temperature models", () => {
    expect(requiresMoonshotTemperatureOne("moonshot-v1-128k")).toBe(false);
    expect(requiresMoonshotTemperatureOne("kimi-k2-turbo-preview")).toBe(false);
  });
});
