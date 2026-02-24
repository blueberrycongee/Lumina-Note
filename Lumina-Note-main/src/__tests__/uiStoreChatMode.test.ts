import { describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/useUIStore";

describe("useUIStore chatMode", () => {
  it("supports switching to codex mode", () => {
    useUIStore.getState().setChatMode("codex");
    expect(useUIStore.getState().chatMode).toBe("codex");
  });
});

