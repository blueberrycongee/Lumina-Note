import { describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/useUIStore";

describe("useUIStore chatMode", () => {
  it("chatMode is always agent", () => {
    expect(useUIStore.getState().chatMode).toBe("agent");
  });
});
