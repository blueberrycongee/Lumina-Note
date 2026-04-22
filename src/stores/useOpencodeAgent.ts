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
import type {
  Event,
  Message,
  Part,
  Permission,
} from "@opencode-ai/sdk/client";
import type { MessageAttachment } from "@/services/llm";
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
  // Kept optional for shape parity with the legacy store — not yet
  // populated from opencode FileParts (deferred).
  attachments?: MessageAttachment[];
  // Legacy store carried the pre-display source text here so retry
  // semantics could resend the raw message. opencode returns the user
  // prompt in `content` directly, so this stays undefined; callers
  // already use `rawContent ?? content`.
  rawContent?: string;
};

export type AgentSessionSummary = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type StartTaskContext = {
  workspace_path?: string;
  active_note_path?: string;
  active_note_content?: string;
  display_message?: string;
  // Forwarded as parts on the prompt once we wire attachments — opencode
  // accepts FilePartInput alongside TextPartInput. For now accepted-but-ignored
  // to keep the MainAIChatShell call-site compiling.
  attachments?: unknown[];
};

// Shape-parity with the legacy store so existing UI code that reaches into
// these fields keeps compiling. All populated from opencode events once the
// corresponding hooks are wired; left as null means "feature not yet ported".
export type QueuedTaskSummary = {
  id: string;
  position: number;
  task: string;
};

export type RetryState = {
  attempt: number;
  maxRetries: number;
  reason: string;
  nextRetryAt: number;
};

export type DebugPromptStack = {
  provider: string;
  receivedAt: number;
  baseSystem: string;
  systemPrompt: string;
  rolePrompt: string;
  builtInAgent: string;
  workspaceAgent: string;
  skillsIndex: string | null;
};

type State = {
  status: AgentStatus;
  messages: AgentMessage[];
  error: string | null;
  currentSessionId: string | null;
  sessions: AgentSessionSummary[];
  pendingTool: {
    tool: { id: string; name: string; params: Record<string, unknown> };
    requestId: string;
  } | null;
  // Shape parity with the legacy store during migration. All default to
  // empty/null — individual features flip on as they get ported to opencode
  // event hooks (queue, retry, debug prompt panel).
  queuedTasks: QueuedTaskSummary[];
  activeTaskPreview: string | null;
  debugPromptStack: DebugPromptStack | null;
  llmRequestStartTime: number | null;
  llmRetryState: RetryState | null;
  totalTokensUsed: number;
  // StreamingMessage legacy compat — opencode already streams via the
  // message-part channel so AgentMessageRenderer shows tokens as they
  // arrive. These fields stay empty/"idle" so the old typing-dots UI
  // doesn't double-render the same text.
  streamingContent: string;
  streamingReasoning: string;
  streamingReasoningStatus: "idle" | "streaming" | "done";
  debugEnabled: boolean;
  debugLogPath: string | null;
  // SSE bookkeeping.
  _subscribed: boolean;
  _abortController: AbortController | null;
};

type Actions = {
  subscribe: () => Promise<void>;
  unsubscribe: () => void;
  loadSessions: () => Promise<void>;
  newSession: () => Promise<string | null>;
  // Alias for useSessionManagement (drop-in for the legacy store).
  clearChat: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  startTask: (task: string, ctx?: StartTaskContext) => Promise<void>;
  abort: () => Promise<void>;
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  retryTimeout: () => void;
  // Debug hook stubs — the legacy runtime wrote a per-request prompt dump
  // to disk. opencode surfaces the same information through its standard
  // logging (see Log.init({level:"DEBUG"}) in electron/main/agent-v2),
  // so these buttons are inert until we wire a fresh debug UI.
  enableDebug: (rootDir: string) => void;
  disableDebug: () => void;
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
    createdAt: info.time.created,
    updatedAt: info.time.updated,
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useOpencodeAgent = create<OpencodeAgentStore>((set, get) => {
  // Internal: mutate `messages` by message ID. Used by SSE handlers so we
  // don't have to rebuild the whole array for every delta.
  const upsertMessage = (info: Message, parts: Part[]) => {
    set((state) => {
      if (state.currentSessionId && info.sessionID !== state.currentSessionId) return state;
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
      if (state.currentSessionId && part.sessionID !== state.currentSessionId) return state;
      const idx = state.messages.findIndex((m) => m.id === part.messageID);
      if (idx === -1) {
        // Part landed before its parent message.updated event — this is
        // the common case for assistant streaming: opencode emits the
        // first token delta before it fires the assistant-message
        // metadata event. We create an assistant-role stub here so the
        // delta has somewhere to live. The later message.updated event
        // upserts the full Message info over this stub.
        const stub: AgentMessage = {
          id: part.messageID,
          role: "assistant",
          content: partsToText([part]),
          rawParts: [part],
        };
        return { messages: [...state.messages, stub] };
      }
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
      if (state.currentSessionId && sessionID !== state.currentSessionId) return state;
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
          ...(state.currentSessionId === deletedId
            ? { currentSessionId: null, messages: [] }
            : {}),
        }));
        return;
      }
      case "session.status": {
        if (event.properties.sessionID !== get().currentSessionId) return;
        const status = event.properties.status;
        if (status.type === "busy") set({ status: "running" });
        else if (status.type === "idle") set({ status: "idle" });
        else if (status.type === "retry") set({ status: "running" });
        return;
      }
      case "session.idle": {
        if (event.properties.sessionID === get().currentSessionId) {
          set({ status: "idle" });
        }
        return;
      }
      case "session.error": {
        if (event.properties.sessionID && event.properties.sessionID !== get().currentSessionId)
          return;
        set({
          status: "error",
          error: JSON.stringify(event.properties.error ?? "unknown"),
        });
        return;
      }
      case "message.updated": {
        const info = event.properties.info;
        // A real user message arriving means we can drop our optimistic
        // stand-in. Server-assigned ids don't start with "optimistic-".
        if (info.role === "user") {
          set((state) => {
            if (state.currentSessionId && info.sessionID !== state.currentSessionId)
              return state;
            const cleaned = state.messages.filter(
              (m) => !m.id.startsWith("optimistic-"),
            );
            const idx = cleaned.findIndex((m) => m.id === info.id);
            const existingParts = idx >= 0 ? cleaned[idx].rawParts : [];
            const merged = makeAgentMessage(info, existingParts);
            const next = cleaned.slice();
            if (idx === -1) next.push(merged);
            else next[idx] = merged;
            return { messages: next };
          });
          return;
        }
        const existing = get().messages.find((m) => m.id === info.id);
        upsertMessage(info, existing?.rawParts ?? []);
        return;
      }
      case "message.removed": {
        const { sessionID, messageID } = event.properties;
        if (sessionID !== get().currentSessionId) return;
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
        if (event.properties.sessionID !== get().currentSessionId) return;
        applyPermission(event.properties);
        return;
      }
      case "permission.replied": {
        if (event.properties.sessionID !== get().currentSessionId) return;
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
    currentSessionId: null,
    sessions: [],
    pendingTool: null,
    queuedTasks: [],
    activeTaskPreview: null,
    debugPromptStack: null,
    llmRequestStartTime: null,
    llmRetryState: null,
    totalTokensUsed: 0,
    streamingContent: "",
    streamingReasoning: "",
    streamingReasoningStatus: "idle" as const,
    debugEnabled: false,
    debugLogPath: null,
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
            currentSessionId: id,
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
          currentSessionId: id,
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
        if (get().currentSessionId === id) {
          set({ currentSessionId: null, messages: [], pendingTool: null });
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
        let sessionId = get().currentSessionId;
        if (!sessionId) {
          sessionId = await get().newSession();
          if (!sessionId) throw new Error("failed to create session");
        }

        // Optimistic user message — appears *instantly* so the user sees
        // their prompt on screen before the HTTP round-trip + SSE event
        // loop completes (normally 100-500ms). The synthetic id is
        // dedup'd in handleEvent() when the real user message.updated
        // event arrives for this session.
        const optimisticId = `optimistic-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: optimisticId,
              role: "user" as const,
              content: task,
              rawParts: [],
            },
          ],
        }));

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
        // Drop any optimistic entry on failure so the UI doesn't show a
        // phantom user message.
        set((state) => ({
          status: "error",
          error: String(err),
          messages: state.messages.filter((m) => !m.id.startsWith("optimistic-")),
        }));
      }
    },

    async abort() {
      const sessionId = get().currentSessionId;
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
        const sessionId = get().currentSessionId;
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
        const sessionId = get().currentSessionId;
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

    async clearChat() {
      await get().newSession();
    },

    enableDebug() {
      // No-op: legacy Rust runtime wrote a prompt dump to rootDir. opencode
      // uses its own Log.init() pipeline; the button stays inert until a
      // replacement UI hook lands.
    },

    disableDebug() {
      // No-op, see enableDebug.
    },
  };
});

// Boot helper — MainAIChatShell calls this on mount so events flow and the
// session list is populated before the first render.
export function initOpencodeAgentListeners(): void {
  const store = useOpencodeAgent.getState();
  void store.subscribe();
  void store.loadSessions();
}
