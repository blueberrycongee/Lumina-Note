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
import type { Event, Message, Part } from "@opencode-ai/sdk/client";
import type { MessageAttachment } from "@/services/llm";
import {
  classifyHttpError,
  makeTraceId,
  reportError,
  retryWithBackoff,
} from "@/services/errors";
import { useErrorBanner } from "@/stores/useErrorBanner";
import {
  getCachedServerInfo,
  getDefaultDirectory,
  getOpencodeClient,
  resetOpencodeClient,
  setDefaultDirectory,
} from "@/services/opencode/client";
import { useFileStore } from "@/stores/useFileStore";
import { getAIConfig } from "@/services/ai/ai";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import type { LLMConfig, LLMProviderType } from "@/services/llm";

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

type OpencodePromptModel = {
  providerID: string;
  modelID: string;
};

const OPENCODE_PROVIDER_ID_MAP: Partial<Record<LLMProviderType, string>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  moonshot: "moonshotai",
  glm: "zhipuai",
  mimo: "xiaomi",
  groq: "groq",
  openrouter: "openrouter",
  ollama: "ollama",
  "openai-compatible": "lumina-compat",
};

export function resolveOpencodePromptModel(
  config: Pick<LLMConfig, "provider" | "model" | "customModelId">,
): OpencodePromptModel | undefined {
  const providerID = OPENCODE_PROVIDER_ID_MAP[config.provider];
  const modelID =
    config.model === "custom"
      ? config.customModelId?.trim()
      : config.model?.trim();
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

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
  newSession: (directory?: string) => Promise<string | null>;
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

/**
 * POST /permission/:requestID/reply with the body shape the Hono route
 * actually validates (`{reply: "once" | "always" | "reject"}`). The SDK
 * client bundle at @opencode-ai/sdk/client doesn't expose any permission
 * methods, and the deprecated session-scoped endpoint expects a different
 * field name; doing a raw fetch avoids both mismatches.
 *
 * Runs against the cached server URL + basic-auth credentials we already
 * resolved in client.ts. Includes x-opencode-directory so the instance
 * middleware routes to the same opencode Instance the session lives in.
 */
async function replyPermission(
  requestId: string | undefined,
  reply: "once" | "always" | "reject",
  set: (
    patch:
      | Partial<OpencodeAgentStore>
      | ((s: OpencodeAgentStore) => Partial<OpencodeAgentStore>),
  ) => void,
): Promise<void> {
  if (!requestId) return;
  const info = getCachedServerInfo();
  if (!info) return;
  const directory = getDefaultDirectory();
  try {
    const res = await fetch(
      `${info.url}/permission/${encodeURIComponent(requestId)}/reply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization:
            "Basic " + btoa(`${info.username}:${info.password}`),
          ...(directory ? { "x-opencode-directory": directory } : {}),
        },
        body: JSON.stringify({ reply }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `permission reply failed: HTTP ${res.status} ${body.slice(0, 200)}`,
      );
    }
    // Optimistically clear pending + resume running; the server will also
    // fire `permission.replied` which matches this requestID and the
    // handler no-ops.
    set({ pendingTool: null, status: "running" });
  } catch (err) {
    reportError({
      kind: "permission.reply",
      severity: "blocker",
      message: `Tool approval failed: ${String(err)}`,
      cause: err,
      retryable: false,
    });
  }
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

  // Apply a streaming field append. Opencode streams token-by-token via
  // `message.part.delta` events carrying `{field, delta}` — typically
  // field="text" for TextPart and ReasoningPart. The final
  // `message.part.updated` later resets the whole part with its complete
  // content, but if we ignore deltas the UI only updates once at the end
  // (big blob drop) instead of streaming.
  const applyPartDelta = (
    sessionID: string,
    messageID: string,
    partID: string,
    field: string,
    delta: string,
  ) => {
    set((state) => {
      if (state.currentSessionId && sessionID !== state.currentSessionId) return state;
      const msgIdx = state.messages.findIndex((m) => m.id === messageID);
      if (msgIdx === -1) return state;
      const msg = state.messages[msgIdx];
      const partIdx = msg.rawParts.findIndex((p) => p.id === partID);
      if (partIdx === -1) return state;

      const oldPart = msg.rawParts[partIdx] as unknown as Record<string, unknown>;
      const oldValue = typeof oldPart[field] === "string" ? (oldPart[field] as string) : "";
      const newPart = { ...oldPart, [field]: oldValue + delta } as unknown as Part;

      const nextParts = msg.rawParts.slice();
      nextParts[partIdx] = newPart;

      const nextMessages = state.messages.slice();
      nextMessages[msgIdx] = {
        ...msg,
        content: partsToText(nextParts),
        rawParts: nextParts,
      };
      return { messages: nextMessages };
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

  // Shape per EventPermissionAsked in the opencode SDK — but @opencode-ai/sdk/
  // client's bundled types are older and don't expose PermissionRequest, so
  // we describe it inline.
  type PermissionAsked = {
    id: string;
    sessionID: string;
    permission: string; // "bash" | "external_directory" | "edit" | ...
    patterns: string[];
    always: string[];
    metadata?: Record<string, unknown>;
    tool?: { messageID: string; callID: string };
  };
  const applyPermission = (ask: PermissionAsked | null) => {
    if (!ask) {
      set({ pendingTool: null, status: "running" });
      return;
    }
    // Surface both the permission type and the first pattern as the tool
    // "name" so the approval card tells the user what's actually being
    // asked (bash "rm -rf /tmp/x", external_directory "/Users/...", etc.).
    // Patterns + metadata become the params pane of the approval card.
    const firstPattern = ask.patterns[0] ?? "";
    const displayName = firstPattern
      ? `${ask.permission}: ${firstPattern}`
      : ask.permission;
    set({
      pendingTool: {
        tool: {
          id: ask.id,
          name: displayName,
          params: {
            permission: ask.permission,
            patterns: ask.patterns,
            always: ask.always,
            ...(ask.metadata ?? {}),
          },
        },
        requestId: ask.id,
      },
      status: "waiting_approval",
    });
  };

  const handleEvent = (event: Event) => {
    // Temporary diagnostic — every SSE event the renderer receives. Makes
    // "promptAsync 204 but nothing happens" self-diagnosing: if this log
    // never fires for a given send, SSE connection is broken; if only
    // session.status/idle fires, the server ran and returned empty; if
    // session.error fires, the provider chain rejected the request.
    console.log(
      "[opencode-sse]",
      event.type,
      JSON.stringify((event as { properties?: unknown }).properties ?? {}).slice(0, 200),
    );
    // opencode emits `message.part.delta` for token-by-token streaming,
    // but @opencode-ai/sdk/client's bundled types snapshot predates that
    // event so it's not in the Event union. Handle it ahead of the typed
    // switch with a widened cast — otherwise the UI only refreshes at the
    // end of the response (one big blob) instead of streaming.
    if ((event.type as string) === "message.part.delta") {
      const props = (event as unknown as {
        properties: {
          sessionID: string;
          messageID: string;
          partID: string;
          field: string;
          delta: string;
        };
      }).properties;
      applyPartDelta(
        props.sessionID,
        props.messageID,
        props.partID,
        props.field,
        props.delta,
      );
      return;
    }
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
        const status = event.properties.status as {
          type?: string;
          attempt?: number;
          message?: string;
          next?: number;
        };
        if (status.type === "busy") set({ status: "running", llmRetryState: null });
        else if (status.type === "idle") {
          // session.error and the trailing session.status:idle arrive
          // back-to-back; let the error stay sticky so the red banner
          // actually renders. Cleared on the next startTask/switchSession.
          if (get().status !== "error") set({ status: "idle", llmRetryState: null });
        } else if (status.type === "retry") {
          set({
            status: "running",
            llmRetryState: {
              attempt: status.attempt ?? 1,
              maxRetries: Math.max(3, status.attempt ?? 1),
              reason: status.message ?? "network retry",
              nextRetryAt: status.next ?? Date.now(),
            },
          });
        }
        return;
      }
      case "session.idle": {
        if (event.properties.sessionID === get().currentSessionId) {
          if (get().status !== "error") set({ status: "idle", llmRetryState: null });
        }
        return;
      }
      case "session.error": {
        if (event.properties.sessionID && event.properties.sessionID !== get().currentSessionId)
          return;
        // Extract a readable message — opencode wraps errors as NamedError
        // blobs `{name, data: {message, ...}}`. Fall back to raw JSON only
        // when the shape is unexpected.
        const raw = event.properties.error as unknown;
        let message = "unknown";
        if (raw && typeof raw === "object") {
          const obj = raw as { data?: { message?: unknown }; message?: unknown };
          if (typeof obj.data?.message === "string") message = obj.data.message;
          else if (typeof obj.message === "string") message = obj.message;
          else message = JSON.stringify(raw);
        } else if (typeof raw === "string") {
          message = raw;
        }
        reportError({
          kind: "session.provider_error",
          severity: "blocker",
          message,
          cause: raw,
          retryable: false,
          sessionId: event.properties.sessionID ?? undefined,
        });
        set({ status: "error", error: message, llmRetryState: null });
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
            const optimistic = state.messages.find((m) => m.id.startsWith("optimistic-"));
            const cleaned = state.messages.filter(
              (m) => !m.id.startsWith("optimistic-"),
            );
            const idx = cleaned.findIndex((m) => m.id === info.id);
            const existingParts = idx >= 0 ? cleaned[idx].rawParts : [];
            const merged = makeAgentMessage(info, existingParts);
            if (optimistic?.content) {
              merged.content = optimistic.content;
            }
            if (optimistic?.attachments?.length) {
              merged.attachments = optimistic.attachments;
            }
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
      default:
        // Opencode's actual permission events are `permission.asked` and
        // `permission.replied` — not the `permission.updated` the
        // @opencode-ai/sdk/client types snapshot used to suggest. Handle
        // them under the fallthrough with widened casts; otherwise the
        // bash / external_directory ask never surfaces in the UI and the
        // server blocks forever on an unresolved Deferred.
        break;
    }
    const eventType = (event as { type: string }).type;
    if (eventType === "permission.asked") {
      const props = (event as unknown as { properties: PermissionAsked })
        .properties;
      if (
        props.sessionID &&
        props.sessionID !== get().currentSessionId
      ) {
        return;
      }
      applyPermission(props);
      return;
    }
    if (eventType === "permission.replied") {
      const props = (event as unknown as {
        properties: { sessionID?: string; requestID?: string };
      }).properties;
      if (
        props.sessionID &&
        props.sessionID !== get().currentSessionId
      ) {
        return;
      }
      set((state) => {
        if (props.requestID && state.pendingTool?.requestId !== props.requestID) {
          return state;
        }
        return { pendingTool: null };
      });
      return;
    }
    return;
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
          console.log("[opencode-sse] connecting…");
          const result = await client.event.subscribe({
            signal: controller.signal,
          });
          console.log("[opencode-sse] connected");
          for await (const event of result.stream) {
            handleEvent(event as Event);
          }
          console.log("[opencode-sse] stream ended cleanly");
          set({ _subscribed: false, _abortController: null });
        } catch (err) {
          if (controller.signal.aborted) {
            console.log("[opencode-sse] aborted");
            return;
          }
          reportError({
            kind: "session.provider_error",
            severity: "blocker",
            message: `Event stream connection failed: ${String(err)}. New messages from the agent won't appear until you reconnect.`,
            cause: err,
            retryable: true,
          });
          set({
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
        // Background refresh — keep the previous sessions list visible
        // and don't escalate to the global banner. Diagnostics panel
        // and console still see the envelope.
        reportError({
          kind: "session.list",
          severity: "background",
          message: `Failed to refresh session list: ${String(err)}`,
          cause: err,
          retryable: true,
        });
      }
    },

    async newSession(directory?: string) {
      try {
        const client = await getOpencodeClient();
        // Opencode scopes sessions to an Instance keyed by `directory`.
        // If we let session.create default to the Electron process cwd but
        // later send prompt_async under the user's vault path, the prompt
        // middleware spins up a different Instance — `sessions.get(id)`
        // hits a not-found path silently and the SSE stream goes dead.
        // Tie both calls to the same directory.
        const query = directory ? { directory } : undefined;
        const res = await client.session.create({ query, throwOnError: true });
        const data = res.data as { id?: string } | undefined;
        const id = data?.id ?? null;
        if (id) {
          // Preserve status: startTask() sets "running" before calling us on
          // the first-ever send. Overwriting with "idle" here creates a gap
          // where TypingIndicator (gated on status==="running") doesn't show
          // until opencode's later session.status{busy} event arrives — that
          // window is why the very first message has no avatar/dots.
          set((state) => ({
            currentSessionId: id,
            messages: [],
            error: null,
            status: state.status === "running" ? state.status : "idle",
          }));
        }
        await get().loadSessions();
        return id;
      } catch (err) {
        reportError({
          kind: "session.create",
          severity: "transient",
          message: `Couldn't create a new session: ${String(err)}`,
          cause: err,
          retryable: true,
        });
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
        useErrorBanner.getState().clearBanner();
        set({
          currentSessionId: id,
          messages,
          status: "idle",
          error: null,
          pendingTool: null,
        });
      } catch (err) {
        reportError({
          kind: "session.switch",
          severity: "transient",
          message: `Couldn't load session: ${String(err)}`,
          cause: err,
          retryable: true,
          sessionId: id,
        });
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
        reportError({
          kind: "session.delete",
          severity: "transient",
          message: `Couldn't delete session: ${String(err)}`,
          cause: err,
          retryable: true,
          sessionId: id,
        });
      }
    },

    async startTask(task: string, ctx?: StartTaskContext) {
      // One trace id per user-initiated send; correlates the optimistic
      // message, the HTTP request retries, and any SSE/error envelopes
      // that fire downstream of this flow.
      const traceId = makeTraceId();

      // Refuse to send when the active provider has no usable credentials.
      // Without this guard, the opencode bridge skips silently (see
      // provider-bridge.ts:154 → applyOpencodeBridge(null)) and the opencode
      // server falls through to whatever it can find on the system (env
      // vars, ~/.opencode/auth.json, models.dev defaults). The renderer's
      // model badge still shows the user's Lumina pick (e.g. "DeepSeek V4
      // Flash") while the actual response comes from the fallback model —
      // including its own thinking / identity behaviour, making per-model
      // settings like thinkingMode look broken.
      const cfg = getAIConfig();
      const keylessOk = cfg.provider === "ollama" || cfg.provider === "openai-compatible";
      if (!cfg.apiKey?.trim() && !keylessOk) {
        const t = getCurrentTranslations();
        reportError({
          kind: "task.start",
          severity: "blocker",
          message: t.ai.apiKeyRequired,
          retryable: false,
          traceId,
        });
        set({ status: "idle", error: t.ai.apiKeyRequired });
        return;
      }

      try {
        useErrorBanner.getState().clearBanner();
        set({ status: "running", error: null, llmRetryState: null });
        if (!get()._subscribed) await get().subscribe();
        let sessionId = get().currentSessionId;
        if (!sessionId) {
          // Create under the same directory we'll prompt against (see the
          // long comment in newSession). ctx.workspace_path is the vault
          // root; without it opencode uses process.cwd() which in Electron
          // resolves to the binary path and mismatches the prompt route.
          sessionId = await get().newSession(ctx?.workspace_path || undefined);
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
              content: ctx?.display_message || task,
              rawParts: [],
              attachments: (ctx?.attachments as MessageAttachment[] | undefined) || [],
            },
          ],
        }));

        const client = await getOpencodeClient();
        const promptModel = resolveOpencodePromptModel(cfg);
        const body = {
          agent: "build",
          ...(promptModel ? { model: promptModel } : {}),
          parts: [{ type: "text", text: task } as never],
        };
        // promptAsync returns as soon as the HTTP request is accepted;
        // the actual response tokens arrive over the SSE stream.
        // Explicit `agent: "build"` sidesteps any user-side opencode config
        // whose `default_agent` points at a plugin-backed agent that fails
        // to load under Electron (e.g. plugins importing `bun:*`).
        // retryWithBackoff retries on 5xx / network drops; 4xx (auth,
        // bad payload, bad model id) is surfaced immediately.
        await retryWithBackoff(
          () =>
            client.session.promptAsync({
              path: { id: sessionId! },
              body: body as never,
              query: ctx?.workspace_path
                ? { directory: ctx.workspace_path }
                : undefined,
              throwOnError: true,
            }),
          {
            onRetry: (attempt, _err, cls) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[lumina:retry] task.start attempt=${attempt + 1} reason=${cls.reason} trace=${traceId}`,
              );
            },
          },
        );
      } catch (err) {
        // Drop any optimistic entry on failure so the UI doesn't show a
        // phantom user message.
        const cls = classifyHttpError(err);
        reportError({
          kind: "task.start",
          severity: "blocker",
          message: `Couldn't send message: ${String(err)}`,
          cause: err,
          retryable: cls.retryable,
          sessionId: get().currentSessionId ?? undefined,
          traceId,
        });
        set((state) => ({
          status: "idle",
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
        reportError({
          kind: "session.abort",
          severity: "blocker",
          message: `Failed to stop the agent: ${String(err)}. The agent may still be running.`,
          cause: err,
          retryable: true,
          sessionId,
        });
      }
    },

    async approveTool() {
      await replyPermission(get().pendingTool?.requestId, "once", set);
    },

    async rejectTool() {
      await replyPermission(get().pendingTool?.requestId, "reject", set);
    },

    retryTimeout() {
      // Retry state is surfaced via session.status{type:"retry"}; nothing
      // to do here from the UI side for now.
    },

    async clearChat() {
      if (get().currentSessionId && get().messages.length === 0) return;
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
// session list is populated before the first render. Also wires the
// server-restart event: when the user saves new provider settings, the main
// process restarts opencode under a fresh URL + credentials, and we have to
// drop our cached client and resubscribe the SSE stream.
let serverChangedUnlisten: (() => void) | null = null;
let vaultUnsubscribe: (() => void) | null = null;
const silenceInit = (err: unknown) => {
  // Preload missing (tests) or server not yet reachable — both are transient
  // and should not surface as an unhandled rejection.
  console.warn("[opencode] init listener error", err);
};

type OpencodeServerInfo = {
  url: string;
  username: string;
  password: string;
} | null;

export function handleOpencodeServerChanged(info: OpencodeServerInfo): void {
  const current = useOpencodeAgent.getState();
  const sessionId = current.currentSessionId;
  current.unsubscribe();
  resetOpencodeClient();
  useOpencodeAgent.setState({
    pendingTool: null,
    llmRetryState: null,
    status: "idle",
    error: null,
  });
  if (!info) return;

  useOpencodeAgent.getState().subscribe().catch(silenceInit);
  useOpencodeAgent.getState().loadSessions().catch(silenceInit);
  if (sessionId) {
    useOpencodeAgent.getState().switchSession(sessionId).catch(silenceInit);
  }
}

export function initOpencodeAgentListeners(): void {
  // Pin every opencode HTTP request to the active vault path so the
  // InstanceMiddleware on the server always routes session/prompt traffic
  // to the same Instance. Without this, session.create and prompt_async
  // end up in different Instances and the SSE stream silently drops.
  const applyVault = (path: string | null) => setDefaultDirectory(path);
  applyVault(useFileStore.getState().vaultPath);
  if (!vaultUnsubscribe) {
    vaultUnsubscribe = useFileStore.subscribe((state, prev) => {
      if (state.vaultPath !== prev.vaultPath) {
        applyVault(state.vaultPath);
        // Previously cached sessions belong to a different Instance now.
        useOpencodeAgent.setState({
          currentSessionId: null,
          messages: [],
          sessions: [],
          pendingTool: null,
          status: "idle",
          error: null,
        });
        useOpencodeAgent.getState().loadSessions().catch(silenceInit);
      }
    });
  }

  const store = useOpencodeAgent.getState();
  if (!serverChangedUnlisten) {
    const bridge = typeof window !== "undefined" ? window.lumina?.opencode : undefined;
    if (bridge?.onServerChanged) {
      serverChangedUnlisten = bridge.onServerChanged(handleOpencodeServerChanged);
    }
  }

  store.subscribe().catch(silenceInit);
  store.loadSessions().catch(silenceInit);
}
