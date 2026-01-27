import { describe, it, expect } from "vitest";
import { getDefaultPublishOutputDir } from "./config";

describe("getDefaultPublishOutputDir", () => {
  it("appends the publish folder to the vault path", () => {
    expect(getDefaultPublishOutputDir("/vault")).toBe("/vault/.lumina-site");
  });
});
