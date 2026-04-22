// Minimal opencode-backed agent store. Mirrors the subset of
// useRustAgentStore's surface that MainAIChatShell actually consumes,
// delegating everything to opencode's HTTP API.
//
// Not wired into the UI yet — MainAIChatShell still uses useRustAgentStore.
// Flip the import in MainAIChatShell once this has been smoke-tested
// end-to-end inside Electron.

import { create } from "zustand";
import { getOpencodeClient } from "@/services/opencode/client";

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "completed"
  | "error"
  | "aborted";

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  rawContent?: string;
};

export type AgentSessionSummary = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

type StartTaskContext = {
  workspace_path?: string;
  active_note_path?: string;
  active_note_content?: string;
  display_message?: string;
};

type State = {
  status: AgentStatus;
  messages: AgentMessage[];
  error: string | null;
  sessionId: string | null;
  sessions: AgentSessionSummary[];
  // Stubs so MainAIChatShell's destructure keeps working during migration.
  pendingTool: null;
  queuedTasks: never[];
  activeTaskPreview: null;
  debugPromptStack: null;
  llmRequestStartTime: null;
  llmRetryState: null;
  totalTokensUsed: number;
};

type Actions = {
  loadSessions: () => Promise<void>;
  newSession: () => Promise<string | null>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  startTask: (task: string, ctx?: StartTaskContext) => Promise<void>;
  abort: () => Promise<void>;
  // Intentional no-ops — approval flow will move to opencode's permission
  // hook (P5) and the UI branches will dead-code away.
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  retryTimeout: () => void;
};

export type OpencodeAgentStore = State & Actions;

function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const pieces: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const part = p as Record<string, unknown>;
    if (part.type === "text" && typeof part.text === "string") {
      pieces.push(part.text);
    }
  }
  return pieces.join("");
}

function messageFromApi(raw: unknown): AgentMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const info = r.info as Record<string, unknown> | undefined;
  if (!info) return null;
  const id = typeof info.id === "string" ? info.id : null;
  const role =
    info.role === "user" ||
    info.role === "assistant" ||
    info.role === "system" ||
    info.role === "tool"
      ? info.role
      : null;
  if (!id || !role) return null;
  return { id, role, content: extractText(r.parts) };
}

export const useOpencodeAgent = create<OpencodeAgentStore>((set, get) => ({
  status: "idle",
  messages: [],
  error: null,
  sessionId: null,
  sessions: [],
  pendingTool: null,
  queuedTasks: [],
  activeTaskPreview: null,
  debugPromptStack: null,
  llmRequestStartTime: null,
  llmRetryState: null,
  totalTokensUsed: 0,

  async loadSessions() {
    try {
      const client = await getOpencodeClient();
      const res = await client.session.list({ throwOnError: true });
      const list = (res.data ?? []) as Array<Record<string, unknown>>;
      const sessions: AgentSessionSummary[] = list.map((s) => ({
        id: String(s.id ?? ""),
        title: typeof s.title === "string" ? s.title : "",
        created_at:
          typeof s.created_at === "number" ? s.created_at : Date.now(),
        updated_at:
          typeof s.updated_at === "number" ? s.updated_at : Date.now(),
      }));
      set({ sessions });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async newSession() {
    try {
      const client = await getOpencodeClient();
      const res = await client.session.create({ throwOnError: true });
      const id = (res.data as { id?: string })?.id ?? null;
      if (id) set({ sessionId: id, messages: [], status: "idle", error: null });
      await get().loadSessions();
      return id;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  async switchSession(id: string) {
    try {
      const client = await getOpencodeClient();
      const res = await client.session.messages({
        path: { id },
        throwOnError: true,
      });
      const raw = (res.data ?? []) as unknown[];
      const messages = raw
        .map(messageFromApi)
        .filter((m): m is AgentMessage => m !== null);
      set({ sessionId: id, messages, status: "idle", error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async deleteSession(id: string) {
    try {
      const client = await getOpencodeClient();
      await client.session.delete({ path: { id }, throwOnError: true });
      if (get().sessionId === id) {
        set({ sessionId: null, messages: [] });
      }
      await get().loadSessions();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async startTask(task: string, ctx?: StartTaskContext) {
    try {
      set({ status: "running", error: null });
      let sessionId = get().sessionId;
      if (!sessionId) {
        sessionId = await get().newSession();
        if (!sessionId) throw new Error("failed to create session");
      }
      const client = await getOpencodeClient();
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: task } as never],
        },
        query: ctx?.workspace_path ? { directory: ctx.workspace_path } : undefined,
        throwOnError: true,
      });
      // Refresh messages after the prompt completes.
      await get().switchSession(sessionId);
      set({ status: "idle" });
    } catch (err) {
      set({ status: "error", error: String(err) });
    }
  },

  async abort() {
    const sessionId = get().sessionId;
    if (!sessionId) return;
    try {
      const client = await getOpencodeClient();
      await client.session.abort({ path: { id: sessionId } });
      set({ status: "aborted" });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async approveTool() {},
  async rejectTool() {},
  retryTimeout() {},
}));
