import { invoke } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RAG_CONFIG } from "./types";
import { RAGManager } from "./manager";

const mockedInvoke = vi.mocked(invoke);
const mockedStat = vi.mocked(stat);

function createManager() {
  const manager = new RAGManager(DEFAULT_RAG_CONFIG) as unknown as {
    workspacePath: string | null;
    vectorStore: {
      needsReindex: ReturnType<typeof vi.fn>;
      deleteByFile: ReturnType<typeof vi.fn>;
    };
    incrementalIndex: (onProgress?: (progress: { current: number; total: number }) => void) => Promise<void>;
  };

  manager.workspacePath = "/vault";
  manager.vectorStore = {
    needsReindex: vi.fn().mockResolvedValue(false),
    deleteByFile: vi.fn().mockResolvedValue(undefined),
  };

  return manager;
}

function mockSingleMarkdownFile(contentResolver: () => string) {
  mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd === "list_directory") {
      return [
        {
          path: "/vault/a.md",
          name: "a.md",
          is_dir: false,
          children: null,
        },
      ] as unknown;
    }
    if (cmd === "read_file") {
      void args;
      return contentResolver() as unknown;
    }
    return null;
  });
}

describe("RAGManager.incrementalIndex modified-time behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses filesystem mtime when available", async () => {
    const manager = createManager();
    mockSingleMarkdownFile(() => "# note");
    mockedStat.mockResolvedValue({
      mtime: new Date("2025-01-01T00:00:00.000Z"),
    } as any);

    await manager.incrementalIndex();

    expect(manager.vectorStore.needsReindex).toHaveBeenCalledTimes(1);
    expect(manager.vectorStore.needsReindex).toHaveBeenCalledWith(
      "/vault/a.md",
      new Date("2025-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("keeps fallback modified value stable when content is unchanged and stat fails", async () => {
    const manager = createManager();
    mockSingleMarkdownFile(() => "# unchanged");
    mockedStat.mockRejectedValue(new Error("stat failed"));

    await manager.incrementalIndex();
    await manager.incrementalIndex();

    expect(manager.vectorStore.needsReindex).toHaveBeenCalledTimes(2);
    const firstModified = manager.vectorStore.needsReindex.mock.calls[0][1] as number;
    const secondModified = manager.vectorStore.needsReindex.mock.calls[1][1] as number;
    expect(secondModified).toBe(firstModified);
  });

  it("bumps fallback modified value when content changes and stat fails", async () => {
    const manager = createManager();
    let callCount = 0;
    mockSingleMarkdownFile(() => {
      callCount += 1;
      return callCount === 1 ? "# first" : "# second";
    });
    mockedStat.mockRejectedValue(new Error("stat failed"));

    await manager.incrementalIndex();
    await manager.incrementalIndex();

    const firstModified = manager.vectorStore.needsReindex.mock.calls[0][1] as number;
    const secondModified = manager.vectorStore.needsReindex.mock.calls[1][1] as number;
    expect(secondModified).toBeGreaterThan(firstModified);
  });
});
