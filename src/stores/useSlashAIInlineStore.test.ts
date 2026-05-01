import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSlashAIInlineTask,
  cancelSlashAIInlineTasksForTabIds,
  finishSlashAIInlineTask,
  getSlashAIInlineTaskForTab,
  removeSlashAIInlineTask,
  startSlashAIInlineTask,
  useSlashAIInlineStore,
  type SlashAIInlineTask,
} from "./useSlashAIInlineStore";

function task(id: string, tabId: string): SlashAIInlineTask {
  return {
    id,
    tabId,
    filePath: `/vault/${tabId}.md`,
    action: "chat-insert",
    request: "write",
    slashRange: { from: 1, to: 2 },
    preview: {
      id,
      status: "running",
      anchor: 1,
      commandLabel: "AI Chat",
      labels: {
        previewTitle: "Preview",
        generating: "Generating",
        insert: "Insert",
        cancel: "Cancel",
        regenerate: "Regenerate",
        stages: {
          understanding: "Understanding",
          "reading-context": "Reading",
          "preparing-context": "Preparing",
          generating: "Generating",
          ready: "Ready",
        },
      },
      stageStatuses: {
        understanding: "active",
        "reading-context": "pending",
        "preparing-context": "pending",
        generating: "pending",
        ready: "pending",
      },
      startedAt: Date.now(),
    },
  };
}

describe("useSlashAIInlineStore", () => {
  beforeEach(() => {
    for (const id of Object.keys(useSlashAIInlineStore.getState().tasks)) {
      removeSlashAIInlineTask(id);
    }
  });

  it("keeps a running task available by tab until accepted or removed", () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");

    startSlashAIInlineTask(task("task-1", "tab-a"), controller);
    finishSlashAIInlineTask("task-1");

    expect(getSlashAIInlineTaskForTab("tab-a")?.id).toBe("task-1");
    expect(abortSpy).not.toHaveBeenCalled();

    removeSlashAIInlineTask("task-1");
    expect(getSlashAIInlineTaskForTab("tab-a")).toBeNull();
  });

  it("cancels only tasks that belong to closed tabs", () => {
    const first = new AbortController();
    const second = new AbortController();
    const firstAbort = vi.spyOn(first, "abort");
    const secondAbort = vi.spyOn(second, "abort");

    startSlashAIInlineTask(task("task-1", "tab-a"), first);
    startSlashAIInlineTask(task("task-2", "tab-b"), second);

    cancelSlashAIInlineTasksForTabIds(["tab-a"]);

    expect(firstAbort).toHaveBeenCalledTimes(1);
    expect(secondAbort).not.toHaveBeenCalled();
    expect(getSlashAIInlineTaskForTab("tab-a")).toBeNull();
    expect(getSlashAIInlineTaskForTab("tab-b")?.id).toBe("task-2");

    cancelSlashAIInlineTask("task-2");
  });
});

