import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  extractDurableMemories,
  hasDurableMemories,
  loadDurableMemorySnapshot,
  reverifyDurableMemoryEntry,
} from "./durableMemory";

describe("durableMemory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      workspace_path: "/vault",
      manifest_path: "/vault/memory/durable/manifest.json",
      entries: [
        {
          id: "entry-1",
          scope: "user_identity",
          visibility: "private",
          title: "User prefers terse updates",
          summary: "Keep answers short.",
          details: "The user prefers concise, direct responses in coding sessions.",
          confidence: "high",
          tags: ["communication"],
          file_path: "/vault/memory/identity/user-prefers-terse-updates--entry-1.md",
          version: 1,
          created_at: 100,
          updated_at: 120,
          last_verified_at: 125,
          source_refs: [
            {
              session_id: "session-1",
              extracted_at: 120,
              source_excerpt: "直接帮我提交，不要搞分枝",
            },
          ],
          history: [],
        },
      ],
      wiki_root: "/vault/memory/wiki",
      wiki_pages: [],
      stale_entry_ids: [],
      merge_results: [],
      extraction_in_flight: false,
      last_extracted_at: 120,
    });
  });

  it("loads durable memory snapshot from rust command layer", async () => {
    const snapshot = await loadDurableMemorySnapshot("/vault");

    expect(invokeMock).toHaveBeenCalledWith("agent_get_durable_memory_snapshot", {
      workspacePath: "/vault",
    });
    expect(snapshot?.entries[0].filePath).toContain("/memory/identity/");
    expect(snapshot?.entries[0].visibility).toBe("private");
    expect(snapshot?.entries[0].lastVerifiedAt).toBe(125);
    expect(hasDurableMemories(snapshot)).toBe(true);
  });

  it("delegates durable extraction to rust and maps config fields", async () => {
    const snapshot = await extractDurableMemories({
      workspacePath: "/vault",
      sessionId: "session-1",
      config: {
        provider: "openai",
        model: "gpt-4",
        api_key: "test-key",
      },
      messages: [
        { role: "user", content: "Remember that I prefer terse commit updates." },
        { role: "assistant", content: "I will keep commit updates concise." },
      ],
      durableMemoryConfig: {
        minimumMessagesToExtract: 4,
        minimumConfidenceToWrite: "high",
      },
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "agent_extract_durable_memories",
      expect.objectContaining({
        workspacePath: "/vault",
        sessionId: "session-1",
        durableMemoryConfig: expect.objectContaining({
          minimum_messages_to_extract: 4,
          minimum_confidence_to_write: "high",
        }),
      }),
    );
    expect(snapshot?.manifestPath).toBe("/vault/memory/durable/manifest.json");
  });

  it("returns false when snapshot is empty", () => {
    expect(hasDurableMemories(null)).toBe(false);
  });

  it("delegates durable memory reverification to rust", async () => {
    await reverifyDurableMemoryEntry("/vault", "entry-1");

    expect(invokeMock).toHaveBeenCalledWith(
      "agent_reverify_durable_memory_entry",
      expect.objectContaining({
        workspacePath: "/vault",
        entryId: "entry-1",
      }),
    );
  });

  it("delegates durable memory manual upsert to rust", async () => {
    const { upsertDurableMemoryEntry } = await import("./durableMemory");
    await upsertDurableMemoryEntry("/vault", {
      scope: "project",
      visibility: "shared",
      title: "Release freeze",
      summary: "Freeze starts Friday.",
      details: "Non-critical merges pause on Friday for release branch cut.",
      tags: ["release"],
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "agent_upsert_durable_memory_entry",
      expect.objectContaining({
        workspacePath: "/vault",
        entry: expect.objectContaining({
          scope: "project",
          visibility: "shared",
        }),
      }),
    );
  });
});
