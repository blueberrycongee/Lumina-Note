// Opencode-backed agent store with SSE event streaming.
//
// Model:
//   - `subscribe()` starts a long-lived SSE loop against /event that feeds
//     every session-shaped event back into zustand state. Idempotent.
//   - UI talks only to zustand state; token-level deltas and tool-call
//     approvals arrive through this channel, not by polling.
//   - `startTask()` fires promptAsync() so the HTTP request returns
//     immediately — message/part deltas are delivered via the SSE loop.
//
// The public surface mirrors what MainAIChatShell's destructure expects
// from useRustAgentStore (status / messages / pendingTool / …) so the UI
// can migrate with minimal churn.

import { create } from "zustand";
import type { Event, Message, Part, Permission } from "@opencode-ai/sdk";
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
  rawParts: Part[];
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
  pendingTool: {
    tool: { id: string; name: string; params: Record<string, unknown> };
    requestId: string;
  } | null;
  // Stubs for shape parity with the legacy store during migration.
  queuedTasks: never[];
  activeTaskPreview: null;
  debugPromptStack: null;
  llmRequestStartTime: null;
  llmRetryState: null;
  totalTokensUsed: number;
  // SSE bookkeeping.
  _subscribed: boolean;
  _abortController: AbortController | null;
};

type Actions = {
  subscribe: () => Promise<void>;
  unsubscribe: () => void;
  loadSessions: () => Promise<void>;
  newSession: () => Promise<string | null>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  startTask: (task: string, ctx?: StartTaskContext) => Promise<void>;
  abort: () => Promise<void>;
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  retryTimeout: () => void;
};

export type OpencodeAgentStore = State & Actions;

// ── Pure helpers ────────────────────────────────────────────────────────────

function partsToText(parts: Part[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (part.type === "text") out.push(part.text);
  }
  return out.join("");
}

function roleOf(info: Message): AgentMessage["role"] {
  return info.role === "assistant" || info.role === "user"
    ? info.role
    : "system";
}

function makeAgentMessage(info: Message, parts: Part[]): AgentMessage {
  return {
    id: info.id,
    role: roleOf(info),
    content: partsToText(parts),
    rawParts: parts,
  };
}

function mergePart(existing: Part[], incoming: Part): Part[] {
  const idx = existing.findIndex((p) => p.id === incoming.id);
  if (idx === -1) return [...existing, incoming];
  const next = existing.slice();
  next[idx] = incoming;
  return next;
}

function sessionSummary(info: {
  id: string;
  title: string;
  time: { created: number; updated: number };
}): AgentSessionSummary {
  return {
    id: info.id,
    title: info.title,
    created_at: info.time.created,
    updated_at: info.time.updated,
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useOpencodeAgent = create<OpencodeAgentStore>((set, get) => {
  // Internal: mutate `messages` by message ID. Used by SSE handlers so we
  // don't have to rebuild the whole array for every delta.
  const upsertMessage = (info: Message, parts: Part[]) => {
    set((state) => {
      if (state.sessionId && info.sessionID !== state.sessionId) return state;
      const next = state.messages.slice();
      const idx = next.findIndex((m) => m.id === info.id);
      const merged = makeAgentMessage(info, parts);
      if (idx === -1) next.push(merged);
      else next[idx] = merged;
      return { messages: next };
    });
  };

  const applyPartUpdate = (part: Part) => {
    set((state) => {
      if (state.sessionId && part.sessionID !== state.sessionId) return state;
      const idx = state.messages.findIndex((m) => m.id === part.messageID);
      if (idx === -1) return state;
      const existing = state.messages[idx];
      const nextParts = mergePart(existing.rawParts, part);
      const next = state.messages.slice();
      next[idx] = {
        ...existing,
        content: partsToText(nextParts),
        rawParts: nextParts,
      };
      return { messages: next };
    });
  };

  const applyPartRemove = (
    sessionID: string,
    messageID: string,
    partID: string,
  ) => {
    set((state) => {
      if (state.sessionId && sessionID !== state.sessionId) return state;
      const idx = state.messages.findIndex((m) => m.id === messageID);
      if (idx === -1) return state;
      const existing = state.messages[idx];
      const nextParts = existing.rawParts.filter((p) => p.id !== partID);
      const next = state.messages.slice();
      next[idx] = {
        ...existing,
        content: partsToText(nextParts),
        rawParts: nextParts,
      };
      return { messages: next };
    });
  };

  const applyPermission = (permission: Permission | null) => {
    if (!permission) {
      set({ pendingTool: null, status: "running" });
      return;
    }
    const params =
      (permission.metadata as Record<string, unknown> | undefined) ?? {};
    set({
      pendingTool: {
        tool: {
          id: permission.id,
          name: permission.type ?? "tool",
          params,
        },
        requestId: permission.id,
      },
      status: "waiting_approval",
    });
  };

  const handleEvent = (event: Event) => {
    switch (event.type) {
      case "session.created":
      case "session.updated": {
        const info = event.properties.info;
        set((state) => {
          const idx = state.sessions.findIndex((s) => s.id === info.id);
          const summary = sessionSummary(info);
          const next = state.sessions.slice();
          if (idx === -1) next.unshift(summary);
          else next[idx] = summary;
          return { sessions: next };
        });
        return;
      }
      case "session.deleted": {
        const deletedId = event.properties.info.id;
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== deletedId),
          ...(state.sessionId === deletedId
            ? { sessionId: null, messages: [] }
            : {}),
        }));
        return;
      }
      case "session.status": {
        if (event.properties.sessionID !== get().sessionId) return;
        const status = event.properties.status;
        if (status.type === "busy") set({ status: "running" });
        else if (status.type === "idle") set({ status: "idle" });
        else if (status.type === "retry") set({ status: "running" });
        return;
      }
      case "session.idle": {
        if (event.properties.sessionID === get().sessionId) {
          set({ status: "idle" });
        }
        return;
      }
      case "session.error": {
        if (event.properties.sessionID && event.properties.sessionID !== get().sessionId)
          return;
        set({
          status: "error",
          error: JSON.stringify(event.properties.error ?? "unknown"),
        });
        return;
      }
      case "message.updated": {
        const info = event.properties.info;
        const existing = get().messages.find((m) => m.id === info.id);
        upsertMessage(info, existing?.rawParts ?? []);
        return;
      }
      case "message.removed": {
        const { sessionID, messageID } = event.properties;
        if (sessionID !== get().sessionId) return;
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== messageID),
        }));
        return;
      }
      case "message.part.updated": {
        applyPartUpdate(event.properties.part);
        return;
      }
      case "message.part.removed": {
        const { sessionID, messageID, partID } = event.properties;
        applyPartRemove(sessionID, messageID, partID);
        return;
      }
      case "permission.updated": {
        if (event.properties.sessionID !== get().sessionId) return;
        applyPermission(event.properties);
        return;
      }
      case "permission.replied": {
        if (event.properties.sessionID !== get().sessionId) return;
        set({ pendingTool: null });
        return;
      }
      default:
        return;
    }
  };

  return {
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
    _subscribed: false,
    _abortController: null,

    async subscribe() {
      if (get()._subscribed) return;
      set({ _subscribed: true });

      const client = await getOpencodeClient();
      const controller = new AbortController();
      set({ _abortController: controller });

      // Run the stream loop in the background. If it throws we mark
      // unsubscribed so a retry can be attempted later.
      void (async () => {
        try {
          const result = await client.event.subscribe({
            signal: controller.signal,
          });
          for await (const event of result.stream) {
            handleEvent(event as Event);
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error("[opencode] event stream failed", err);
          set({
            error: String(err),
            status: "error",
            _subscribed: false,
            _abortController: null,
          });
        }
      })();
    },

    unsubscribe() {
      get()._abortController?.abort();
      set({ _subscribed: false, _abortController: null });
    },

    async loadSessions() {
      try {
        const client = await getOpencodeClient();
        const res = await client.session.list({ throwOnError: true });
        const list = (res.data ?? []) as Array<{
          id: string;
          title: string;
          time: { created: number; updated: number };
        }>;
        set({ sessions: list.map(sessionSummary) });
      } catch (err) {
        set({ error: String(err) });
      }
    },

    async newSession() {
      try {
        const client = await getOpencodeClient();
        const res = await client.session.create({ throwOnError: true });
        const data = res.data as { id?: string } | undefined;
        const id = data?.id ?? null;
        if (id) {
          set({
            sessionId: id,
            messages: [],
            status: "idle",
            error: null,
          });
        }
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
        const raw = (res.data ?? []) as Array<{ info: Message; parts: Part[] }>;
        const messages: AgentMessage[] = raw.map((entry) =>
          makeAgentMessage(entry.info, entry.parts),
        );
        set({
          sessionId: id,
          messages,
          status: "idle",
          error: null,
          pendingTool: null,
        });
      } catch (err) {
        set({ error: String(err) });
      }
    },

    async deleteSession(id: string) {
      try {
        const client = await getOpencodeClient();
        await client.session.delete({ path: { id }, throwOnError: true });
        if (get().sessionId === id) {
          set({ sessionId: null, messages: [], pendingTool: null });
        }
        await get().loadSessions();
      } catch (err) {
        set({ error: String(err) });
      }
    },

    async startTask(task: string, ctx?: StartTaskContext) {
      try {
        set({ status: "running", error: null });
        if (!get()._subscribed) await get().subscribe();
        let sessionId = get().sessionId;
        if (!sessionId) {
          sessionId = await get().newSession();
          if (!sessionId) throw new Error("failed to create session");
        }
        const client = await getOpencodeClient();
        // promptAsync returns as soon as the HTTP request is accepted;
        // the actual response tokens arrive over the SSE stream.
        await client.session.promptAsync({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: task } as never],
          },
          query: ctx?.workspace_path
            ? { directory: ctx.workspace_path }
            : undefined,
          throwOnError: true,
        });
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

    async approveTool() {
      const pending = get().pendingTool;
      if (!pending) return;
      try {
        const client = await getOpencodeClient();
        const sessionId = get().sessionId;
        if (!sessionId) return;
        // SDK method name: session.permission.reply or similar — fall through
        // to a raw fetch if the SDK doesn't expose it at this version.
        const raw = client as unknown as {
          permission?: {
            respond?: (opts: {
              path: { id: string; permissionID: string };
              body: { response: "accept" | "reject" };
            }) => Promise<unknown>;
          };
        };
        await raw.permission?.respond?.({
          path: { id: sessionId, permissionID: pending.requestId },
          body: { response: "accept" },
        });
        set({ pendingTool: null, status: "running" });
      } catch (err) {
        set({ error: String(err) });
      }
    },

    async rejectTool() {
      const pending = get().pendingTool;
      if (!pending) return;
      try {
        const client = await getOpencodeClient();
        const sessionId = get().sessionId;
        if (!sessionId) return;
        const raw = client as unknown as {
          permission?: {
            respond?: (opts: {
              path: { id: string; permissionID: string };
              body: { response: "reject" };
            }) => Promise<unknown>;
          };
        };
        await raw.permission?.respond?.({
          path: { id: sessionId, permissionID: pending.requestId },
          body: { response: "reject" },
        });
        set({ pendingTool: null, status: "running" });
      } catch (err) {
        set({ error: String(err) });
      }
    },

    retryTimeout() {
      // Retry state is surfaced via session.status{type:"retry"}; nothing
      // to do here from the UI side for now.
    },
  };
});
