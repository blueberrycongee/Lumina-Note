import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  buildSessionMemoryPath,
  buildSessionMemoryTemplate,
  isSessionMemoryMeaningful,
  resetSessionMemoryRuntimeState,
  shouldUpdateSessionMemory,
  updateSessionMemory,
} from "./sessionMemory";

describe("sessionMemory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      session_id: "session-1",
      workspace_path: "/vault",
      path: "/vault/memory/session/session-1/session-memory.md",
      content: "# Session Overview\nreal summary\n",
      exists: true,
      initialized: true,
      extraction_in_flight: false,
      last_updated_at: 123,
      last_update_reason: "task_stage_completed",
      tokens_at_last_update: 4000,
      tool_calls_at_last_update: 0,
      message_count_at_last_update: 2,
    });
    resetSessionMemoryRuntimeState();
  });

  it("builds per-session memory path under workspace memory/session", () => {
    expect(buildSessionMemoryPath("/vault", "rust/session:1")).toBe(
      "/vault/memory/session/rust-session-1/session-memory.md",
    );
  });

  it("detects template content as non-meaningful memory", () => {
    expect(isSessionMemoryMeaningful(buildSessionMemoryTemplate())).toBe(false);
    expect(isSessionMemoryMeaningful("# Session Overview\nreal content")).toBe(true);
  });

  it("delegates memory updates to the rust command layer", async () => {
    const snapshot = await updateSessionMemory({
      workspacePath: "/vault",
      sessionId: "session-1",
      reason: "task_stage_completed",
      config: {
        provider: "openai",
        model: "gpt-4",
        api_key: "test-key",
      },
      messages: [
        { role: "user", content: "x".repeat(8000) },
        { role: "assistant", content: "y".repeat(8000) },
      ],
      sessionMemoryConfig: {
        minimumTokensToInit: 3000,
        minimumTokensBetweenUpdates: 1200,
      },
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "agent_update_session_memory",
      expect.objectContaining({
        workspacePath: "/vault",
        sessionId: "session-1",
        reason: "task_stage_completed",
        config: expect.objectContaining({
          provider: "openai",
          model: "gpt-4",
          api_key: "test-key",
        }),
        sessionMemoryConfig: expect.objectContaining({
          minimum_tokens_to_init: 3000,
          minimum_tokens_between_updates: 1200,
        }),
      }),
    );
    expect(snapshot?.exists).toBe(true);
    expect(snapshot?.initialized).toBe(true);
    expect(snapshot?.lastUpdatedAt).toBe(123);
  });

  it("skips regular task-stage updates when thresholds are not met", () => {
    const shouldUpdate = shouldUpdateSessionMemory({
      reason: "task_stage_completed",
      messages: [{ role: "user", content: "short" }],
      snapshot: {
        sessionId: "s1",
        workspacePath: "/vault",
        path: "/vault/memory/session/s1/session-memory.md",
        content: "memory",
        exists: true,
        initialized: true,
        extractionInFlight: false,
        lastUpdatedAt: Date.now(),
        lastUpdateReason: "task_stage_completed",
        tokensAtLastUpdate: 2000,
        toolCallsAtLastUpdate: 3,
        messageCountAtLastUpdate: 2,
      },
    });

    expect(shouldUpdate).toBe(false);
  });

  it("forces session-switch updates when there are new messages", () => {
    const shouldUpdate = shouldUpdateSessionMemory({
      reason: "session_switch",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ],
      snapshot: {
        sessionId: "s1",
        workspacePath: "/vault",
        path: "/vault/memory/session/s1/session-memory.md",
        content: "memory",
        exists: true,
        initialized: true,
        extractionInFlight: false,
        lastUpdatedAt: Date.now(),
        lastUpdateReason: "task_stage_completed",
        tokensAtLastUpdate: 0,
        toolCallsAtLastUpdate: 0,
        messageCountAtLastUpdate: 1,
      },
    });

    expect(shouldUpdate).toBe(true);
  });
});
