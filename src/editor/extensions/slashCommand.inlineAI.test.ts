import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const mocks = vi.hoisted(() => ({
  client: {
    session: {
      create: vi.fn(),
      promptAsync: vi.fn(),
      message: vi.fn(),
      delete: vi.fn(),
    },
    event: {
      subscribe: vi.fn(),
    },
  },
  reportOperationError: vi.fn(),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  getCurrentTranslations: () => ({
    common: {
      empty: "Empty",
      unknownError: "Unknown error",
      untitled: "Untitled",
    },
    editor: {
      slashMenu: {
        inlineAI: {
          emptyTarget: "No target",
        },
        commands: {
          aiContinuePrompt: "Continue from {name}.",
          aiRewritePrompt: "Rewrite this block.",
          aiExpandPrompt: "Expand this block.",
          aiSummarizePrompt: "Summarize this block.",
        },
      },
    },
    ai: {
      errors: {
        sendGeneric: "AI failed",
      },
    },
    agentMessage: {
      thinkingGroup: "Thinking",
      working: "Working",
      steps: "{count} steps",
      file: "File",
      directory: "Directory",
      url: "URL",
      query: "Query",
      pattern: "Pattern",
      params: "Params",
      result: "Result",
    },
  }),
}));

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: () => ({
    provider: "test-provider",
    model: "test-model",
    customModelId: "",
    baseUrl: "",
  }),
}));

vi.mock("@/services/ai/config-sync", () => ({
  waitForAIConfigSync: vi.fn(async () => undefined),
}));

vi.mock("@/services/opencode/client", () => ({
  getOpencodeClient: vi.fn(async () => mocks.client),
  setDefaultDirectory: vi.fn(),
}));

vi.mock("@/stores/useOpencodeAgent", () => ({
  resolveOpencodePromptModel: vi.fn(() => "test-provider/test-model"),
}));

vi.mock("@/stores/useAIStore", () => ({
  useAIStore: {
    getState: () => ({
      runtimeModelSelection: null,
    }),
  },
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: {
    getState: () => ({
      vaultPath: "/tmp/vault",
      currentFile: "/tmp/vault/current.md",
    }),
  },
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: mocks.reportOperationError,
}));

import {
  applySlashAIResult,
  clearSlashAIInlinePreview,
  runSlashAIAction,
  showSlashAIInlinePreview,
  slashAIInlinePreviewField,
  type SlashAIActivity,
  type SlashAIProgress,
} from "./slashCommand";

function createView(text: string, selection?: { anchor: number; head?: number }) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: text, selection, extensions: [slashAIInlinePreviewField] }),
    parent,
  });
  return {
    parent,
    view,
    cleanup: () => {
      view.destroy();
      parent.remove();
    },
  };
}

async function* streamEvents() {
  await Promise.resolve();
  yield {
    type: "message.updated",
    properties: {
      sessionID: "session-1",
      info: { id: "user-1", role: "user", sessionID: "session-1" },
    },
  };
  yield {
    type: "message.part.delta",
    properties: {
      sessionID: "session-1",
      messageID: "user-1",
      field: "text",
      delta: "PROMPT ECHO SHOULD NOT APPEAR",
    },
  };
  yield {
    type: "message.updated",
    properties: {
      sessionID: "session-1",
      info: { id: "assistant-1", role: "assistant", sessionID: "session-1" },
    },
  };
  yield {
    type: "message.part.updated",
    properties: {
      sessionID: "session-1",
      part: {
        id: "reasoning-1",
        messageID: "assistant-1",
        type: "reasoning",
        text: "Reading the nearby note context",
        time: { start: 1_000 },
      },
    },
  };
  yield {
    type: "message.part.updated",
    properties: {
      sessionID: "session-1",
      part: {
        id: "tool-1",
        messageID: "assistant-1",
        type: "tool",
        tool: "read",
        state: {
          status: "completed",
          input: { path: "/tmp/vault/current.md" },
          output: "Loaded current note",
          time: { start: 1_500, end: 2_000 },
        },
      },
    },
  };
  yield {
    type: "message.part.delta",
    properties: {
      sessionID: "session-1",
      messageID: "assistant-1",
      field: "text",
      delta: "PARTIAL STREAM SHOULD NOT BE INSERTED",
    },
  };
  yield {
    type: "session.idle",
    properties: {
      sessionID: "session-1",
    },
  };
}

describe("slash inline AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.session.create.mockResolvedValue({ data: { id: "session-1" } });
    mocks.client.session.promptAsync.mockResolvedValue({});
    mocks.client.session.message.mockResolvedValue({
      data: {
        parts: [{ type: "text", text: "Final Markdown to insert" }],
      },
    });
    mocks.client.session.delete.mockResolvedValue({});
    mocks.client.event.subscribe.mockResolvedValue({ stream: streamEvents() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps prompt and stream output out of Markdown until accept", async () => {
    const { view, cleanup } = createView("Hello /ai");
    const progress: SlashAIProgress[] = [];
    const activities: SlashAIActivity[][] = [];

    const result = await runSlashAIAction(
      view,
      6,
      9,
      "chat-insert",
      "write a crisp sentence",
      {
        onProgress: (event) => progress.push(event),
        onActivity: (events) => activities.push(events),
      },
    );

    expect(view.state.doc.toString()).toBe("Hello ");
    expect(result).toEqual({
      text: "Final Markdown to insert",
      from: 6,
      to: 6,
    });
    expect(view.state.doc.toString()).not.toContain("PROMPT ECHO");
    expect(view.state.doc.toString()).not.toContain("PARTIAL STREAM");
    expect(view.state.doc.toString()).not.toContain("Final Markdown");

    applySlashAIResult(view, result!);

    expect(view.state.doc.toString()).toBe("Hello Final Markdown to insert");
    expect(progress.some((event) => event.stage === "generating")).toBe(true);
    expect(progress.at(-1)).toEqual({ stage: "ready", status: "done" });
    expect(activities.at(-1)).toEqual([
      expect.objectContaining({
        type: "reasoning",
        detail: "Reading the nearby note context",
      }),
      expect.objectContaining({
        type: "tool",
        title: "read",
        detail: "File: /tmp/vault/current.md",
        result: "Loaded current note",
        status: "done",
      }),
    ]);
    cleanup();
  });

  it("uses an existing selection as the target for block AI actions", async () => {
    const doc = "First sentence\nSecond /ai";
    const slashFrom = doc.indexOf("/ai");
    const { view, cleanup } = createView(doc, { anchor: 0, head: "First sentence".length });

    const result = await runSlashAIAction(
      view,
      slashFrom,
      slashFrom + 3,
      "rewrite-block",
      "make it sharper",
    );

    expect(result).toEqual({
      text: "Final Markdown to insert",
      from: 0,
      to: "First sentence".length,
    });
    expect(view.state.doc.toString()).toBe("First sentence\nSecond ");
    cleanup();
  });

  it("renders generated text as an editor inline approval preview", () => {
    const { view, parent, cleanup } = createView("Hello ");
    const handler = vi.fn();
    window.addEventListener("slash-ai-inline-preview-action", handler as EventListener);

    view.dispatch({
      effects: showSlashAIInlinePreview.of({
        id: "preview-1",
        status: "preview",
        anchor: 6,
        commandLabel: "AI Continue",
        result: {
          text: "Final Markdown to insert",
          from: 6,
          to: 6,
        },
        labels: {
          previewTitle: "Preview to insert",
          generating: "Generating",
          insert: "Insert",
          cancel: "Cancel",
          regenerate: "Regenerate",
          stages: {
            understanding: "Understanding request",
            "reading-context": "Reading nearby note context",
            "preparing-context": "Preparing related context",
            generating: "Generating candidate",
            ready: "Ready to insert",
          },
        },
        stageStatuses: {
          understanding: "done",
          "reading-context": "done",
          "preparing-context": "done",
          generating: "done",
          ready: "done",
        },
      }),
    });

    expect(view.state.doc.toString()).toBe("Hello ");
    const preview = parent.querySelector(".cm-slash-ai-inline-preview");
    expect(preview?.textContent).toContain("Final Markdown to insert");
    expect(preview?.textContent).not.toContain("Reading nearby note context");

    (preview?.querySelector('button[data-action="accept"]') as HTMLButtonElement).click();

    expect(handler).toHaveBeenCalled();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      id: "preview-1",
      action: "accept",
    });
    expect(view.state.doc.toString()).toBe("Hello ");

    view.dispatch({ effects: clearSlashAIInlinePreview.of() });
    expect(parent.querySelector(".cm-slash-ai-inline-preview")).toBeNull();
    window.removeEventListener("slash-ai-inline-preview-action", handler as EventListener);
    cleanup();
  });

  it("renders running status in the editor before approval is available", () => {
    const { view, parent, cleanup } = createView("Hello ");

    view.dispatch({
      effects: showSlashAIInlinePreview.of({
        id: "preview-running",
        status: "running",
        anchor: 6,
        commandLabel: "AI Continue",
        labels: {
          previewTitle: "Preview to insert",
          generating: "Generating",
          insert: "Insert",
          cancel: "Cancel",
          regenerate: "Regenerate",
          stages: {
            understanding: "Understanding request",
            "reading-context": "Reading nearby note context",
            "preparing-context": "Preparing related context",
            generating: "Generating candidate",
            ready: "Ready to insert",
          },
        },
        stageStatuses: {
          understanding: "done",
          "reading-context": "active",
          "preparing-context": "pending",
          generating: "pending",
          ready: "pending",
        },
      }),
    });

    const preview = parent.querySelector(".cm-slash-ai-inline-preview");
    expect(preview?.textContent).toContain("Reading nearby note context");
    expect(preview?.querySelector('button[data-action="accept"]')).toBeNull();
    expect(preview?.querySelector('button[data-action="cancel"]')).not.toBeNull();
    expect(view.state.doc.toString()).toBe("Hello ");
    cleanup();
  });

  it("renders inline AI work details in the editor preview", () => {
    const { view, parent, cleanup } = createView("Hello ");

    view.dispatch({
      effects: showSlashAIInlinePreview.of({
        id: "preview-work",
        status: "running",
        anchor: 6,
        commandLabel: "AI Continue",
        startedAt: Date.now() - 2_000,
        labels: {
          previewTitle: "Preview to insert",
          generating: "Generating",
          insert: "Insert",
          cancel: "Cancel",
          regenerate: "Regenerate",
          stages: {
            understanding: "Understanding request",
            "reading-context": "Reading nearby note context",
            "preparing-context": "Preparing related context",
            generating: "Generating candidate",
            ready: "Ready to insert",
          },
        },
        stageStatuses: {
          understanding: "done",
          "reading-context": "done",
          "preparing-context": "done",
          generating: "active",
          ready: "pending",
        },
        activities: [
          {
            id: "activity-1",
            type: "tool",
            title: "read",
            detail: "File: /tmp/vault/current.md",
            result: "Loaded current note",
            status: "done",
            startedAt: 1_000,
            endedAt: 2_000,
          },
        ],
      }),
    });

    const preview = parent.querySelector(".cm-slash-ai-inline-preview");
    expect(preview?.textContent).toContain("Working");
    expect(preview?.textContent).toContain("read");
    expect(preview?.textContent).toContain("File: /tmp/vault/current.md");
    cleanup();
  });
});
