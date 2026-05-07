import { describe, expect, it } from "vitest";
import { parseWorkspaceTooLargeError } from "./host";

describe("parseWorkspaceTooLargeError", () => {
  it("parses a count-mode error thrown directly by the walker", () => {
    const err = new Error(
      "WORKSPACE_TOO_LARGE:count:500001: Workspace exceeds the supported 500,000-entry ceiling. Open a subdirectory instead.",
    );
    const info = parseWorkspaceTooLargeError(err);
    expect(info).not.toBeNull();
    expect(info!.reason).toBe("count");
    expect(info!.entriesScanned).toBe(500001);
    expect(info!.message).toMatch(/^Workspace exceeds/);
  });

  it("parses a timeout-mode error thrown directly by the walker", () => {
    const err = new Error(
      "WORKSPACE_TOO_LARGE:timeout:42000: Workspace took longer than 10s to enumerate.",
    );
    const info = parseWorkspaceTooLargeError(err);
    expect(info).not.toBeNull();
    expect(info!.reason).toBe("timeout");
    expect(info!.entriesScanned).toBe(42000);
  });

  it("parses messages that Electron prepends with its IPC framing", () => {
    // Electron's ipcRenderer.invoke rejection sometimes wraps the
    // original message with "Error invoking remote method '<cmd>':" or
    // similar. The parser must recognize the WORKSPACE_TOO_LARGE marker
    // anywhere within the string, not only at position 0.
    const wrapped = new Error(
      "Error invoking remote method 'tauri-invoke': Error: WORKSPACE_TOO_LARGE:count:500001: details",
    );
    const info = parseWorkspaceTooLargeError(wrapped);
    expect(info).not.toBeNull();
    expect(info!.reason).toBe("count");
    expect(info!.entriesScanned).toBe(500001);
  });

  it("returns null for unrelated errors", () => {
    expect(parseWorkspaceTooLargeError(new Error("EACCES: permission denied"))).toBeNull();
    expect(parseWorkspaceTooLargeError(null)).toBeNull();
    expect(parseWorkspaceTooLargeError("not an error")).toBeNull();
    expect(parseWorkspaceTooLargeError({})).toBeNull();
    expect(parseWorkspaceTooLargeError({ message: 42 })).toBeNull();
  });

  it("rejects malformed messages that look superficially similar", () => {
    expect(
      parseWorkspaceTooLargeError(
        new Error("WORKSPACE_TOO_LARGE: missing reason and count"),
      ),
    ).toBeNull();
    expect(
      parseWorkspaceTooLargeError(
        new Error("WORKSPACE_TOO_LARGE:badreason:42: ..."),
      ),
    ).toBeNull();
  });
});
