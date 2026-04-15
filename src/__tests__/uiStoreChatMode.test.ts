import { describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/useUIStore";

describe("useUIStore chatMode", () => {
  it("defaults to agent mode", () => {
    expect(useUIStore.getState().chatMode).toBe("agent");
  });
});
