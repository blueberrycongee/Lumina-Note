// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeNodeVersion, shouldReuseBundledNode } from "../../scripts/bundle_node_utils.mjs";

describe("bundle node utils", () => {
  it("normalizes Node version output", () => {
    expect(normalizeNodeVersion("v22.21.0\n")).toBe("22.21.0");
    expect(normalizeNodeVersion("22.21.0")).toBe("22.21.0");
    expect(normalizeNodeVersion("")).toBeNull();
  });

  it("reuses a bundled runtime only when the version matches exactly", () => {
    expect(shouldReuseBundledNode("v22.21.0\n", "22.21.0")).toBe(true);
    expect(shouldReuseBundledNode("v20.11.1", "22.21.0")).toBe(false);
    expect(shouldReuseBundledNode(null, "22.21.0")).toBe(false);
  });
});
