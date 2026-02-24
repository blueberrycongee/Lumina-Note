import { describe, expect, it, vi } from "vitest";
import { handleFsChangeEvent } from "./fsChange";

describe("handleFsChangeEvent", () => {
  it("calls onReloadPath for modified events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Modified", path: "/tmp/a.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/a.md");
  });

  it("calls onReloadPath for created events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Created", path: "/tmp/b.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/b.md");
  });

  it("does not call onReloadPath for deleted events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Deleted", path: "/tmp/c.md" }, onReloadPath);
    expect(onReloadPath).not.toHaveBeenCalled();
  });

  it("uses new_path for renamed events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Renamed", old_path: "/tmp/old.md", new_path: "/tmp/new.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/new.md");
  });

  it("does not call onReloadPath for invalid payloads", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent(null, onReloadPath);
    handleFsChangeEvent(undefined, onReloadPath);
    handleFsChangeEvent({ type: "Modified" }, onReloadPath);
    handleFsChangeEvent({ type: "Renamed", old_path: "/tmp/old.md" }, onReloadPath);
    handleFsChangeEvent({ type: "Unknown", path: "/tmp/d.md" }, onReloadPath);
    expect(onReloadPath).not.toHaveBeenCalled();
  });
});
