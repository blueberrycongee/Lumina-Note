import { beforeEach, describe, expect, it, vi } from "vitest";
import { useErrorStore } from "./useErrorStore";

describe("useErrorStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useErrorStore.setState({
      notices: [],
    });
  });

  it("deduplicates repeated notices in the dedupe window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T00:00:00.000Z"));

    useErrorStore.getState().pushNotice({
      title: "Save failed",
      message: "Disk full",
      source: "FileStore",
    });
    useErrorStore.getState().pushNotice({
      title: "Save failed",
      message: "Disk full",
      source: "FileStore",
    });

    const notices = useErrorStore.getState().notices;
    expect(notices).toHaveLength(1);
    expect(notices[0].count).toBe(2);
  });

  it("keeps only the latest notices up to max size", () => {
    for (let i = 0; i < 10; i += 1) {
      useErrorStore.getState().pushNotice({
        title: `Error ${i}`,
        message: `Message ${i}`,
      });
    }

    const notices = useErrorStore.getState().notices;
    expect(notices).toHaveLength(6);
    expect(notices[0].title).toBe("Error 9");
    expect(notices[5].title).toBe("Error 4");
  });
});
