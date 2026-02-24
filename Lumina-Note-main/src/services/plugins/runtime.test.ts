import { describe, expect, it } from "vitest";
import { normalizeHotkeyPattern } from "@/services/plugins/runtime";

describe("plugin runtime hotkey normalization", () => {
  it("normalizes case and modifier order", () => {
    expect(normalizeHotkeyPattern("Ctrl+Shift+K")).toBe("ctrl+shift+k");
    expect(normalizeHotkeyPattern("shift+ctrl+k")).toBe("ctrl+shift+k");
    expect(normalizeHotkeyPattern("SHIFT+CTRL+K")).toBe("ctrl+shift+k");
  });

  it("normalizes option to alt", () => {
    expect(normalizeHotkeyPattern("mod+option+h")).toBe("mod+alt+h");
    expect(normalizeHotkeyPattern("mod+alt+h")).toBe("mod+alt+h");
  });

  it("rejects invalid patterns", () => {
    expect(normalizeHotkeyPattern("ctrl+shift")).toBe("");
    expect(normalizeHotkeyPattern("")).toBe("");
  });
});
