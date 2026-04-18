/**
 * Rust Agent Store (LLM Wiki)
 *
 * Zustand store for managing the agent state.
 * Simplified for the LLM Wiki transformation: no orchestration stages,
 * no memory extraction, no RAG. The backend owns those concerns now.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLegacyKeyJSONStorage } from "@/lib/persistStorage";
import { listen, UnlistenFn } from "@/lib/host";
import { invoke } from "@/lib/host";
import { getAIConfig, type AIConfig } from "@/services/ai/ai";
import { useFileStore } from "@/stores/useFileStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useAgentProfileStore } from "@/stores/useAgentProfileStore";
import {
  getResolvedModelForPurpose,
  callLLM,
  normalizeThinkingMode,
  PROVIDER_REGISTRY,
  supportsThinkingModeSwitch,
  type LLMProviderType,
  type Message as LLMMessage,
} from "@/services/llm";
import { getRecommendedTemperature } from "@/services/llm/temperature";
import type { MessageAttachment } from "@/services/llm";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { formatUserFriendlyError } from "./aiErrorFormatting";

// ============ Type Definitions ============

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "completed"
  | "error"
  | "aborted";

export type AgentType =
  | "coordinator"
  | "planner"
  | "executor"
  | "editor"
  | "researcher"
  | "writer"
  | "organizer"
  | "reporter";

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  rawContent?: string;
  attachments?: MessageAttachment[];
  agent?: AgentType;
  id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

/// Pending tool waiting for user approval
export interface PendingToolApproval {
  tool: ToolCall;
  requestId: string;
}

export interface AgentQueuedTask {
  id: string;
  task: string;
  workspace_path: string;
  enqueued_at: number;
  position: number;
}

export interface DebugPromptStack {
  provider: string;
  baseSystem: string;
  systemPrompt: string;
  rolePrompt: string;
  builtInAgent: string;
  workspaceAgent: string;
  skillsIndex: string | null;
  receivedAt: number;
}

export interface LlmRetryState {
  requestId: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  reason: string;
  nextRetryAt: number;
}

export type StreamingReasoningStatus = "idle" | "streaming" | "done";

export interface RustAgentSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  totalTokensUsed: number;
}

interface AgentEventPayload {
  type: string;
  data: unknown;
  session_id?: string;
}

interface MobileSessionSummary {
  id: string;
  title: string;
  session_type: "agent" | "chat";
  created_at: number;
  updated_at: number;
  last_message_preview?: string;
  last_message_role?: "user" | "assistant" | "system" | "tool";
  message_count: number;
}

interface MobileWorkspaceOption {
  id: string;
  name: string;
  path: string;
}

interface MobileAgentProfileOption {
  id: string;
  name: string;
  provider: string;
  model: string;
}

export interface TaskContext {
  workspace_path: string;
  active_note_path?: string;
  active_note_content?: string;
  file_tree?: string;
  history?: Message[];
  mobile_session_id?: string;
  display_message?: string;
  attachments?: MessageAttachment[];
}

export interface AgentConfig {
  provider: string;
  model: string;
  api_key: string;
  complex_task_model?: string;
  base_url?: string;
  temperature?: number;
  thinking_mode?: "auto" | "thinking" | "instant";
  max_tokens?: number;
  max_plan_iterations?: number;
  max_steps?: number;
  execution_mode?: "auto" | "legacy_single_agent" | "orchestrated";
  auto_approve?: boolean;
  locale?: string;
}

// ============ Context Compaction ============

const SUMMARY_MESSAGE_ID = "rust-session-summary";
const AUTO_COMPACT_RATIO = 0.95;
const SUMMARY_KEEP_MESSAGES = 6;
const SUMMARY_MAX_CHARS_PER_MESSAGE = 4000;
const SUMMARY_MAX_TOTAL_CHARS = 120000;
const SUMMARY_MAX_OUTPUT_TOKENS = 1200;

function resolveCompactionConfig() {
  const config = getAIConfig();
  return {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    customModelId: config.customModelId,
    baseUrl: config.baseUrl,
  };
}

function resolveModelContextWindow(resolvedConfig: ReturnType<typeof resolveCompactionConfig>) {
  const providerMeta = PROVIDER_REGISTRY[resolvedConfig.provider];
  if (!providerMeta) return null;

  const modelId = resolvedConfig.model === "custom" && resolvedConfig.customModelId
    ? resolvedConfig.customModelId
    : resolvedConfig.model;
  const modelMeta = providerMeta.models.find(model => model.id === modelId);
  if (modelMeta?.contextWindow) return modelMeta.contextWindow;

  const fallback = providerMeta.models.find(model => model.id === "custom");
  return fallback?.contextWindow ?? null;
}

function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "...";
}

function formatMessagesForSummary(messages: Message[]) {
  const entries = messages.map((msg) => {
    const role = msg.role.toUpperCase();
    const content = truncateContent(String(msg.content ?? ""), SUMMARY_MAX_CHARS_PER_MESSAGE);
    return `[${role}] ${content}`.trim();
  });

  let total = 0;
  const kept: string[] = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (total + entry.length > SUMMARY_MAX_TOTAL_CHARS) {
      continue;
    }
    kept.push(entry);
    total += entry.length;
  }
  kept.reverse();
  return kept.join("\n\n");
}

function splitMessagesForCompaction(messages: Message[]) {
  const summaryMessage = messages.find(msg => msg.id === SUMMARY_MESSAGE_ID) ?? null;
  const withoutSummary = messages.filter(msg => msg.id !== SUMMARY_MESSAGE_ID);
  if (withoutSummary.length <= SUMMARY_KEEP_MESSAGES) {
    return {
      summaryMessage,
      toSummarize: [] as Message[],
      tail: withoutSummary,
    };
  }

  const tail = withoutSummary.slice(-SUMMARY_KEEP_MESSAGES);
  const toSummarize = withoutSummary.slice(0, -SUMMARY_KEEP_MESSAGES);
  return { summaryMessage, toSummarize, tail };
}

function shouldAutoCompact(tokensTotal: number) {
  if (tokensTotal <= 0) return false;
  const resolvedConfig = resolveCompactionConfig();
  const contextWindow = resolveModelContextWindow(resolvedConfig);
  if (!contextWindow) return false;
  return tokensTotal / contextWindow >= AUTO_COMPACT_RATIO;
}

function estimateContextTokens(messages: Message[]) {
  let total = 0;
  for (const msg of messages) {
    if (!msg?.content) continue;
    const text = String(msg.content);
    const ascii = text.replace(/[^\x00-\x7F]/g, "");
    const asciiTokens = Math.ceil(ascii.length / 4);
    const nonAsciiTokens = Math.ceil((text.length - ascii.length) / 1.5);
    total += asciiTokens + nonAsciiTokens + 4; // +4 for role/format overhead
  }
  return total;
}

// ============ Background / Mobile helpers ============

const BACKGROUND_STREAMING_ID_PREFIX = "mobile-streaming-";

function appendMobileUserMessage(
  sessions: RustAgentSession[],
  sessionId: string,
  task: string
) {
  const t = getCurrentTranslations();
  const index = sessions.findIndex(session => session.id === sessionId);
  const now = Date.now();
  if (index === -1) {
    const newSession: RustAgentSession = {
      id: sessionId,
      title: task.trim().slice(0, 20) || t.common.newConversation,
      messages: [{ role: "user", content: task }],
      createdAt: now,
      updatedAt: now,
      totalTokensUsed: 0,
    };
    return [...sessions, newSession];
  }

  const session = sessions[index];
  const title =
    session.title === t.common.newConversation && task.trim()
      ? task.trim().slice(0, 20)
      : session.title;
  const updatedSession: RustAgentSession = {
    ...session,
    title,
    updatedAt: now,
    messages: [...session.messages, { role: "user", content: task }],
  };
  const next = [...sessions];
  next[index] = updatedSession;
  return next;
}

function applyBackgroundEventToSession(
  session: RustAgentSession,
  event: AgentEventPayload,
  sessionId: string
) {
  let messages = session.messages;
  const now = Date.now();
  const streamingId = `${BACKGROUND_STREAMING_ID_PREFIX}${sessionId}`;

  switch (event.type) {
    case "text_delta": {
      const { delta } = event.data as { delta?: string };
      if (!delta) return session;
      const last = messages[messages.length - 1];
      if (last && last.id === streamingId && last.role === "assistant") {
        messages = [
          ...messages.slice(0, -1),
          { ...last, content: last.content + delta },
        ];
      } else {
        messages = [
          ...messages,
          { role: "assistant", content: delta, agent: "coordinator" as AgentType, id: streamingId },
        ];
      }
      return { ...session, messages, updatedAt: now };
    }
    case "text_final": {
      const { text } = event.data as { text?: string };
      if (!text) return session;
      const index = messages.findIndex(msg => msg.id === streamingId);
      const finalMessage: Message = { role: "assistant", content: text, agent: "coordinator" };
      if (index >= 0) {
        messages = [...messages];
        messages[index] = finalMessage;
      } else {
        messages = [...messages, finalMessage];
      }
      return { ...session, messages, updatedAt: now };
    }
    case "tool_start": {
      const { tool, input } = event.data as { tool: string; input: unknown };
      messages = [
        ...messages,
        { role: "tool" as const, content: `🔧 ${tool}: ${JSON.stringify(input)}` },
      ];
      return { ...session, messages, updatedAt: now };
    }
    case "tool_result": {
      const { tool, output } = event.data as { tool: string; output: { content?: unknown } };
      const content =
        typeof output?.content === "string"
          ? output.content
          : JSON.stringify(output?.content ?? output);
      messages = [
        ...messages,
        { role: "tool" as const, content: `✅ ${tool}: ${content}` },
      ];
      return { ...session, messages, updatedAt: now };
    }
    case "complete": {
      const { result } = event.data as { result?: string };
      if (!result || !result.trim()) return session;
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant" && last.content === result) {
        return session;
      }
      messages = [
        ...messages,
        { role: "assistant", content: result, agent: "reporter" as AgentType },
      ];
      return { ...session, messages, updatedAt: now };
    }
    case "error": {
      const { message } = event.data as { message?: string };
      const content = message ? `Error: ${message}` : "Error";
      messages = [...messages, { role: "assistant", content }];
      return { ...session, messages, updatedAt: now };
    }
    case "run_failed": {
      const { error } = event.data as { error?: string };
      const content = error ? `Error: ${error}` : "Error";
      messages = [...messages, { role: "assistant", content }];
      return { ...session, messages, updatedAt: now };
    }
    default:
      return session;
  }
}

// ============ Task Stats ============

export interface TaskStats {
  toolCalls: number;
  toolSuccesses: number;
  toolFailures: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalToolCalls: number;
  totalToolSuccesses: number;
  totalToolFailures: number;
}

// ============ Store State ============

interface RustAgentState {
  // Core state
  status: AgentStatus;
  messages: Message[];
  error: string | null;

  // Streaming
  streamingContent: string;
  streamingReasoning: string;
  streamingReasoningStatus: StreamingReasoningStatus;
  streamingAgent: AgentType;

  // Token tracking
  totalTokensUsed: number;
  taskStats: TaskStats;

  // Session management
  sessions: RustAgentSession[];
  currentSessionId: string | null;

  // Config
  autoApprove: boolean;
  autoCompactEnabled: boolean;
  pendingCompaction: boolean;
  isCompacting: boolean;
  lastTokenUsage: { input: number; output: number; total: number } | null;

  // Debug
  debugEnabled: boolean;
  debugLogPath: string | null;

  // Tool approval
  pendingTool: PendingToolApproval | null;
  queuedTasks: AgentQueuedTask[];
  activeTaskPreview: string | null;
  debugPromptStack: DebugPromptStack | null;

  // LLM request timeout detection
  llmRequestStartTime: number | null;
  llmRequestId: string | null;
  llmRetryState: LlmRetryState | null;

  // Heartbeat monitoring
  lastHeartbeat: number | null;
  connectionStatus: "connected" | "disconnected" | "unknown";

  // Actions
  startTask: (task: string, context: TaskContext) => Promise<void>;
  abort: () => Promise<void>;
  clearChat: () => void;
  setAutoApprove: (value: boolean) => void;
  setAutoCompactEnabled: (value: boolean) => void;

  // Tool approval actions
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  syncQueueStatus: () => Promise<void>;

  // Timeout retry
  retryTimeout: () => Promise<void>;

  // Debug actions
  enableDebug: (workspacePath: string) => Promise<void>;
  disableDebug: () => Promise<void>;

  // Session actions
  createSession: (title?: string) => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  syncMobileSessions: () => Promise<void>;
  syncMobileOptions: () => Promise<void>;

  // Internal methods
  _handleEvent: (event: AgentEventPayload) => void;
  _setupListeners: () => Promise<UnlistenFn | null>;
  _saveCurrentSession: () => void;
  _compactSession: () => Promise<void>;
}

interface MobileSessionCommand {
  action: "create" | "switch" | "rename" | "delete";
  session_id?: string;
  title?: string;
}

let lastMobileWorkspacePath: string | null = null;
let lastMobileAgentConfigKey: string | null = null;

const resolveVaultPath = (): string | null => {
  const storePath = useFileStore.getState().vaultPath;
  if (storePath) return storePath;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("lumina-workspace");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { vaultPath?: string }; vaultPath?: string };
    const fallback = parsed?.state?.vaultPath ?? parsed?.vaultPath;
    return typeof fallback === "string" && fallback.length > 0 ? fallback : null;
  } catch {
    return null;
  }
};

const buildAgentConfig = (aiConfig: AIConfig, autoApprove: boolean): AgentConfig => {
  const actualModel = aiConfig.model === "custom" && aiConfig.customModelId
    ? aiConfig.customModelId
    : aiConfig.model;
  const complexTaskModel = getResolvedModelForPurpose(aiConfig, "complex");
  const shouldUseComplexTaskModel = complexTaskModel !== actualModel;

  return {
    provider: aiConfig.provider,
    model: actualModel,
    api_key: aiConfig.apiKey || "",
    ...(shouldUseComplexTaskModel
      ? { complex_task_model: complexTaskModel }
      : {}),
    base_url: aiConfig.baseUrl,
    temperature:
      aiConfig.temperature ??
      getRecommendedTemperature(aiConfig.provider, actualModel),
    thinking_mode: aiConfig.thinkingMode ?? "auto",
    max_tokens: 4096,
    max_plan_iterations: 0,
    max_steps: 0,
    execution_mode: "auto",
    auto_approve: autoApprove,
    locale: "zh-CN",
  };
};

const buildAgentConfigFromProfile = (profile: { config: AIConfig; autoApprove: boolean }): AgentConfig => {
  return buildAgentConfig(profile.config, profile.autoApprove);
};

function shouldStreamThinkingForAgent(config: AIConfig): boolean {
  const model = config.model === "custom" && config.customModelId
    ? config.customModelId
    : config.model;
  return (
    normalizeThinkingMode(config.thinkingMode) === "thinking" &&
    supportsThinkingModeSwitch(config.provider as LLMProviderType, model)
  );
}

// ============ Store Implementation ============

export const useRustAgentStore = create<RustAgentState>()(
  persist(
    (set, get) => ({
      // Initial state
      status: "idle",
      messages: [],
      error: null,
      streamingContent: "",
      streamingReasoning: "",
      streamingReasoningStatus: "idle",
      streamingAgent: "coordinator",
      totalTokensUsed: 0,
      autoApprove: false,
      autoCompactEnabled: true,
      pendingCompaction: false,
      isCompacting: false,
      lastTokenUsage: null,

      taskStats: {
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalToolCalls: 0,
        totalToolSuccesses: 0,
        totalToolFailures: 0,
      },

      sessions: [{
        id: "default-rust-session",
        title: getCurrentTranslations().common.newConversation,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokensUsed: 0,
      }],
      currentSessionId: "default-rust-session",

      debugEnabled: false,
      debugLogPath: null,

      pendingTool: null,
      queuedTasks: [],
      activeTaskPreview: null,
      debugPromptStack: null,

      llmRequestStartTime: null,
      llmRequestId: null,
      llmRetryState: null,

      lastHeartbeat: null,
      connectionStatus: "unknown",

      // ---- Actions ----

      startTask: async (task: string, context: TaskContext) => {
        const aiConfig = getAIConfig();
        const streamingThinkingEnabled = shouldStreamThinkingForAgent(aiConfig);

        const currentMessages = get().messages;
        const stats = get().taskStats;
        const currentStatus = get().status;
        const isBusy = currentStatus === "running" || currentStatus === "waiting_approval";

        // Show user message immediately
        set({
          ...(isBusy
            ? { error: null }
            : {
                status: "running",
                error: null,
                streamingContent: "",
                streamingReasoning: "",
                streamingReasoningStatus: streamingThinkingEnabled ? "streaming" : "idle",
              }),
          messages: [
            ...currentMessages,
            {
              role: "user",
              content: context.display_message || task,
              rawContent: task,
              ...(context.attachments && context.attachments.length > 0
                ? { attachments: context.attachments }
                : {}),
            },
          ],
        });

        if (!aiConfig.apiKey?.trim() && aiConfig.provider !== "ollama" && aiConfig.provider !== "custom") {
          const t = getCurrentTranslations();
          set({
            status: "error",
            error: t.ai.apiKeyRequired,
          });
          return;
        }

        console.log("[RustAgent] Config:", {
          provider: aiConfig.provider,
          model: aiConfig.model,
          hasApiKey: !!aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl,
        });

        set({
          taskStats: {
            ...stats,
            ...(isBusy
              ? {}
              : {
                  toolCalls: 0,
                  toolSuccesses: 0,
                  toolFailures: 0,
                }),
            totalTasks: stats.totalTasks + 1,
          },
        });

        // Build simplified context for backend
        const historyForBackend = get().messages
          .filter(m => m.role === "user" || m.role === "assistant")
          .map(m => ({
            role: m.role,
            content: m.role === "user" ? (m.rawContent || m.content) : m.content,
          }));

        const config = buildAgentConfig(aiConfig, get().autoApprove);

        try {
          try {
            await invoke("mobile_set_agent_config", { config });
          } catch (e) {
            console.warn("[RustAgent] Failed to sync mobile agent config:", e);
          }

          const {
            display_message: _displayMessage,
            attachments: _displayAttachments,
            ...contextForBackend
          } = context;
          const contextWithHistory = {
            ...contextForBackend,
            history: historyForBackend,
          };
          await invoke("agent_start_task", { config, task, context: contextWithHistory });
          await get().syncQueueStatus();
        } catch (e) {
          console.error("[RustAgent] agent_start_task failed:", e);
          set({
            status: "error",
            error: formatUserFriendlyError(e),
          });
        }
      },

      abort: async () => {
        try {
          await invoke("agent_abort");
          set({
            status: "aborted",
            streamingReasoning: "",
            streamingReasoningStatus: "idle",
            llmRequestStartTime: null,
            llmRequestId: null,
            llmRetryState: null,
          });
        } catch (e) {
          console.error("Failed to abort:", e);
        }
      },

      clearChat: () => {
        set({
          status: "idle",
          messages: [],
          error: null,
          streamingContent: "",
          streamingReasoning: "",
          streamingReasoningStatus: "idle",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
          queuedTasks: [],
          activeTaskPreview: null,
          debugPromptStack: null,
          llmRequestStartTime: null,
          llmRequestId: null,
          llmRetryState: null,
        });
      },

      setAutoApprove: (value: boolean) => {
        set({ autoApprove: value });
      },

      setAutoCompactEnabled: (value: boolean) => {
        set({
          autoCompactEnabled: value,
          pendingCompaction: value ? get().pendingCompaction : false,
        });
      },

      approveTool: async () => {
        const { pendingTool } = get();
        if (!pendingTool) {
          console.warn("[RustAgent] No pending tool to approve");
          return;
        }

        try {
          await invoke("agent_approve_tool", {
            requestId: pendingTool.requestId,
            approved: true,
          });
          set({ pendingTool: null });
        } catch (e) {
          console.error("[RustAgent] Failed to approve tool:", e);
        }
      },

      rejectTool: async () => {
        const { pendingTool } = get();
        if (!pendingTool) {
          console.warn("[RustAgent] No pending tool to reject");
          return;
        }

        try {
          await invoke("agent_approve_tool", {
            requestId: pendingTool.requestId,
            approved: false,
          });
          set({ pendingTool: null });
        } catch (e) {
          console.error("[RustAgent] Failed to reject tool:", e);
        }
      },

      syncQueueStatus: async () => {
        try {
          const snapshot = await invoke<{
            running?: boolean;
            active_task?: string | null;
            queued?: AgentQueuedTask[];
          }>("agent_get_queue_status");
          const queuedTasks = Array.isArray(snapshot?.queued) ? snapshot.queued : [];
          const activeTaskPreview = typeof snapshot?.active_task === "string"
            ? snapshot.active_task
            : null;
          const currentStatus = get().status;
          const nextStatus = snapshot?.running
            ? (currentStatus === "idle" ? "running" : currentStatus)
            : (currentStatus === "running" ? "idle" : currentStatus);

          set({
            queuedTasks,
            activeTaskPreview,
            status: nextStatus,
          });
        } catch (e) {
          console.warn("[RustAgent] Failed to sync queue status:", e);
        }
      },

      retryTimeout: async () => {
        console.log("[RustAgent] Retry timeout - not implemented yet");
      },

      enableDebug: async (workspacePath: string) => {
        try {
          const logPath = await invoke<string>("agent_enable_debug", { workspacePath });
          set({ debugEnabled: true, debugLogPath: logPath });
        } catch (e) {
          console.error("[RustAgent] Failed to enable debug:", e);
        }
      },

      disableDebug: async () => {
        try {
          await invoke("agent_disable_debug");
          set({ debugEnabled: false, debugLogPath: null });
        } catch (e) {
          console.error("[RustAgent] Failed to disable debug:", e);
        }
      },

      // ---- Session Management ----

      createSession: (title?: string) => {
        const t = getCurrentTranslations();
        get()._saveCurrentSession();
        const sessions = get().sessions;

        const id = `rust-session-${Date.now()}`;
        const newSession: RustAgentSession = {
          id,
          title: title || t.common.newConversation,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalTokensUsed: 0,
        };

        set({
          sessions: [...sessions, newSession],
          currentSessionId: id,
          messages: [],
          totalTokensUsed: 0,
          status: "idle",
          error: null,
          streamingContent: "",
          streamingReasoning: "",
          streamingReasoningStatus: "idle",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
        });
        void get().syncMobileSessions();
      },

      switchSession: (id: string) => {
        get()._saveCurrentSession();
        const sessions = get().sessions;
        const session = sessions.find(s => s.id === id);
        if (!session) return;

        set({
          sessions,
          currentSessionId: id,
          messages: session.messages,
          totalTokensUsed: session.totalTokensUsed,
          status: "idle",
          error: null,
          streamingContent: "",
          streamingReasoning: "",
          streamingReasoningStatus: "idle",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
        });
      },

      deleteSession: (id: string) => {
        const state = get();
        const newSessions = state.sessions.filter(s => s.id !== id);

        if (state.currentSessionId === id) {
          if (newSessions.length > 0) {
            const firstSession = newSessions[0];
            set({
              sessions: newSessions,
              currentSessionId: firstSession.id,
              messages: firstSession.messages,
              totalTokensUsed: firstSession.totalTokensUsed,
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              pendingCompaction: false,
              isCompacting: false,
              lastTokenUsage: null,
            });
          } else {
            const newSession: RustAgentSession = {
              id: `rust-session-${Date.now()}`,
              title: getCurrentTranslations().common.newConversation,
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              totalTokensUsed: 0,
            };
            set({
              sessions: [newSession],
              currentSessionId: newSession.id,
              messages: [],
              totalTokensUsed: 0,
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              pendingCompaction: false,
              isCompacting: false,
              lastTokenUsage: null,
            });
          }
        } else {
          set({ sessions: newSessions });
        }
        void get().syncMobileSessions();
      },

      renameSession: (id: string, title: string) => {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }));
        void get().syncMobileSessions();
      },

      syncMobileSessions: async () => {
        void get().syncMobileOptions();
        const vaultPath = resolveVaultPath();
        if (vaultPath && vaultPath !== lastMobileWorkspacePath) {
          try {
            await invoke("mobile_set_workspace", { workspacePath: vaultPath });
            lastMobileWorkspacePath = vaultPath;
          } catch (e) {
            console.warn("[RustAgent] Failed to sync mobile workspace:", e);
          }
        }
        let mobileAgentConfig: AgentConfig | null = null;
        try {
          const profileState = useAgentProfileStore.getState();
          const selectedProfile = profileState.currentProfileId
            ? profileState.getProfileById(profileState.currentProfileId)
            : undefined;
          const aiConfig = getAIConfig();
          const config = selectedProfile
            ? buildAgentConfigFromProfile(selectedProfile)
            : buildAgentConfig(aiConfig, get().autoApprove);
          mobileAgentConfig = config;
          const configKey = JSON.stringify(config);
          if (configKey !== lastMobileAgentConfigKey) {
            await invoke("mobile_set_agent_config", { config });
            lastMobileAgentConfigKey = configKey;
          }
        } catch (e) {
          console.warn("[RustAgent] Failed to sync mobile agent config:", e);
        }
        const summaries: MobileSessionSummary[] = get().sessions.map(session => {
          const lastMessage = session.messages[session.messages.length - 1];
          const preview = lastMessage?.content?.slice(0, 200);
          return {
            id: session.id,
            title: session.title,
            session_type: "agent",
            created_at: session.createdAt,
            updated_at: session.updatedAt,
            last_message_preview: preview,
            last_message_role: lastMessage?.role,
            message_count: session.messages.length,
          };
        });
        try {
          await invoke("mobile_sync_sessions", {
            sessions: summaries,
            workspacePath: vaultPath,
            agentConfig: mobileAgentConfig,
          });
        } catch (e) {
          console.warn("[RustAgent] Failed to sync mobile sessions:", e);
        }
      },

      syncMobileOptions: async () => {
        const workspaceState = useWorkspaceStore.getState();
        const profileState = useAgentProfileStore.getState();
        const workspaces: MobileWorkspaceOption[] = workspaceState.workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          path: ws.path,
        }));
        const agentProfiles: MobileAgentProfileOption[] = profileState.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          provider: profile.config.provider,
          model: profile.config.model,
        }));
        try {
          await invoke("mobile_sync_options", {
            workspaces,
            agentProfiles,
            selectedWorkspaceId: workspaceState.currentWorkspaceId,
            selectedProfileId: profileState.currentProfileId,
          });
        } catch (e) {
          console.warn("[RustAgent] Failed to sync mobile options:", e);
        }
      },

      // ---- Internal Methods ----

      _saveCurrentSession: () => {
        const t = getCurrentTranslations();
        set((state) => {
          if (!state.currentSessionId) return state;

          return {
            sessions: state.sessions.map(s =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    messages: state.messages,
                    totalTokensUsed: state.totalTokensUsed,
                    updatedAt: Date.now(),
                    title: s.title === t.common.newConversation && state.messages.length > 0
                      ? state.messages.find(m => m.role === "user")?.content.slice(0, 20) || s.title
                      : s.title,
                  }
                : s
            ),
          };
        });
        void get().syncMobileSessions();
      },

      _compactSession: async () => {
        const { autoCompactEnabled, pendingCompaction, isCompacting, currentSessionId, messages } = get();
        if (!autoCompactEnabled || !pendingCompaction || isCompacting) return;

        const snapshotSessionId = currentSessionId;
        const snapshotMessages = messages;
        const snapshotLength = snapshotMessages.length;

        set({ isCompacting: true });

        try {
          const { summaryMessage, toSummarize, tail } = splitMessagesForCompaction(snapshotMessages);
          if (toSummarize.length === 0) {
            set((state) => (
              state.currentSessionId === snapshotSessionId
                ? { isCompacting: false, pendingCompaction: false }
                : { isCompacting: false }
            ));
            return;
          }

          const summarySeed = summaryMessage ? [summaryMessage, ...toSummarize] : toSummarize;
          const summarySource = formatMessagesForSummary(summarySeed);
          if (!summarySource.trim()) {
            set((state) => (
              state.currentSessionId === snapshotSessionId
                ? { isCompacting: false, pendingCompaction: false }
                : { isCompacting: false }
            ));
            return;
          }

          const t = getCurrentTranslations();
          const systemPrompt = t.prompts.contextSummary.system;
          const configOverride = resolveCompactionConfig();

          const response = await callLLM(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: summarySource },
            ] as LLMMessage[],
            { maxTokens: SUMMARY_MAX_OUTPUT_TOKENS, temperature: 0.2 },
            configOverride
          );

          const summaryText = response.content?.trim();
          if (!summaryText) {
            set((state) => (
              state.currentSessionId === snapshotSessionId
                ? { isCompacting: false, pendingCompaction: false }
                : { isCompacting: false }
            ));
            return;
          }

          const summaryTitle = t.ai.contextSummaryTitle || "Context Summary";
          const summaryContent = `[${summaryTitle}]\n${summaryText}`;
          const latestState = get();
          if (!latestState.autoCompactEnabled || latestState.currentSessionId !== snapshotSessionId) {
            set({ isCompacting: false });
            return;
          }

          const currentMessages = latestState.messages;
          if (currentMessages.length < snapshotLength) {
            set({ isCompacting: false });
            return;
          }

          const hasNewMessages = currentMessages.length > snapshotLength;
          const additionalMessages = currentMessages
            .slice(snapshotLength)
            .filter((msg) => msg.id !== SUMMARY_MESSAGE_ID);

          const nextMessages: Message[] = [
            {
              role: "assistant",
              content: summaryContent,
              agent: "coordinator",
              id: SUMMARY_MESSAGE_ID,
            },
            ...tail,
            ...additionalMessages,
          ];

          set({
            messages: nextMessages,
            isCompacting: false,
            pendingCompaction: hasNewMessages ? latestState.pendingCompaction : false,
          });
          get()._saveCurrentSession();
        } catch (error) {
          console.error("[RustAgent] Context compaction failed:", error);
          set((state) => (
            state.currentSessionId === snapshotSessionId
              ? { isCompacting: false, pendingCompaction: true }
              : { isCompacting: false }
          ));
        }
      },

      // ---- Event Handler ----

      _handleEvent: (event: AgentEventPayload) => {
        const state = get();
        const eventSessionId = event.session_id;

        // Route background-session events to the correct session
        if (eventSessionId && eventSessionId !== state.currentSessionId) {
          set((current) => {
            const index = current.sessions.findIndex(s => s.id === eventSessionId);
            if (index === -1) return current;
            const session = current.sessions[index];
            const updatedSession = applyBackgroundEventToSession(session, event, eventSessionId);
            if (updatedSession === session) return current;
            const nextSessions = [...current.sessions];
            nextSessions[index] = updatedSession;
            return { sessions: nextSessions };
          });
          return;
        }

        const composeAssistantContent = (reasoning: string, content: string) => {
          const trimmedReasoning = reasoning.trim();
          const trimmedContent = content.trim();
          if (!trimmedReasoning) return content;
          if (!trimmedContent) {
            return `<thinking>\n${trimmedReasoning}\n</thinking>`;
          }
          return `<thinking>\n${trimmedReasoning}\n</thinking>\n\n${content}`;
        };

        const flushStreamingToMessages = () => {
          const mergedContent = composeAssistantContent(
            state.streamingReasoning,
            state.streamingContent
          );
          if (!mergedContent.trim()) {
            return { messages: state.messages, flushed: false };
          }
          return {
            messages: [
              ...state.messages,
              {
                role: "assistant" as const,
                content: mergedContent,
                agent: state.streamingAgent,
              },
            ],
            flushed: true,
          };
        };

        switch (event.type) {
          case "run_started": {
            const aiConfig = getAIConfig();
            const streamingThinkingEnabled = shouldStreamThinkingForAgent(aiConfig);
            set({
              status: "running",
              error: null,
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: streamingThinkingEnabled ? "streaming" : "idle",
              llmRetryState: null,
            });
            break;
          }

          case "run_paused": {
            set({ status: "waiting_approval" });
            break;
          }

          case "run_resumed": {
            set({ status: "running" });
            break;
          }

          case "run_completed": {
            set({
              status: "completed",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              llmRequestStartTime: null,
              llmRequestId: null,
              llmRetryState: null,
            });
            void get()._compactSession();
            break;
          }

          case "run_failed": {
            const { error } = event.data as { error: string };
            const stats = state.taskStats;
            set({
              status: "error",
              error: formatUserFriendlyError(error),
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              llmRequestStartTime: null,
              llmRequestId: null,
              llmRetryState: null,
              taskStats: {
                ...stats,
                failedTasks: stats.failedTasks + 1,
              },
            });
            break;
          }

          case "run_aborted": {
            set({
              status: "aborted",
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              pendingTool: null,
              llmRequestStartTime: null,
              llmRequestId: null,
              llmRetryState: null,
            });
            break;
          }

          case "text_delta": {
            const { delta } = event.data as { delta: string };
            set({
              streamingContent: state.streamingContent + delta,
              streamingReasoningStatus: (() => {
                if (state.streamingReasoningStatus !== "streaming") {
                  return state.streamingReasoningStatus;
                }
                return state.streamingReasoning.trim().length > 0 ? "done" : "idle";
              })(),
              streamingAgent: "coordinator",
            });
            break;
          }

          case "reasoning_delta": {
            const { content } = event.data as { content: string };
            set({
              streamingReasoning: state.streamingReasoning + content,
              streamingReasoningStatus: "streaming",
            });
            break;
          }

          case "reasoning_done": {
            set({
              streamingReasoningStatus:
                state.streamingReasoning.trim().length > 0 ? "done" : "idle",
            });
            break;
          }

          case "text_final": {
            const { text } = event.data as { text: string };
            const stats = state.taskStats;
            const nextMessages =
              text && text.trim()
                ? [
                    ...state.messages,
                    { role: "assistant", content: text, agent: "coordinator" as AgentType } as Message,
                  ]
                : state.messages;
            set({
              messages: nextMessages,
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              taskStats: {
                ...stats,
                completedTasks: stats.completedTasks + 1,
              },
            });
            get()._saveCurrentSession();
            break;
          }

          case "tool_start": {
            const { tool, input } = event.data as { tool: string; input: unknown };
            const stats = state.taskStats;
            const { messages: baseMessages, flushed } = flushStreamingToMessages();
            set({
              messages: [
                ...baseMessages,
                {
                  role: "tool",
                  content: `🔧 ${tool}: ${JSON.stringify(input)}`,
                },
              ],
              streamingContent: flushed ? "" : state.streamingContent,
              streamingReasoning: flushed ? "" : state.streamingReasoning,
              streamingReasoningStatus: flushed ? "idle" : state.streamingReasoningStatus,
              taskStats: {
                ...stats,
                toolCalls: stats.toolCalls + 1,
                totalToolCalls: stats.totalToolCalls + 1,
              },
            });
            break;
          }

          case "tool_result": {
            const { tool, output } = event.data as { tool: string; output: { content?: unknown } };
            const stats = state.taskStats;
            const content =
              typeof output?.content === "string"
                ? output.content
                : JSON.stringify(output?.content ?? output);
            const { messages: baseMessages, flushed } = flushStreamingToMessages();
            set({
              messages: [
                ...baseMessages,
                {
                  role: "tool",
                  content: `✅ ${tool}: ${content}`,
                },
              ],
              streamingContent: flushed ? "" : state.streamingContent,
              streamingReasoning: flushed ? "" : state.streamingReasoning,
              streamingReasoningStatus: flushed ? "idle" : state.streamingReasoningStatus,
              taskStats: {
                ...stats,
                toolSuccesses: stats.toolSuccesses + 1,
                totalToolSuccesses: stats.totalToolSuccesses + 1,
              },
            });
            break;
          }

          case "tool_error": {
            const { tool, error } = event.data as { tool: string; error: string };
            const stats = state.taskStats;
            const { messages: baseMessages, flushed } = flushStreamingToMessages();
            set({
              messages: [
                ...baseMessages,
                {
                  role: "tool",
                  content: `❌ ${tool}: ${error}`,
                },
              ],
              streamingContent: flushed ? "" : state.streamingContent,
              streamingReasoning: flushed ? "" : state.streamingReasoning,
              streamingReasoningStatus: flushed ? "idle" : state.streamingReasoningStatus,
              taskStats: {
                ...stats,
                toolFailures: stats.toolFailures + 1,
                totalToolFailures: stats.totalToolFailures + 1,
              },
            });
            break;
          }

          case "permission_asked": {
            const { permission, metadata } = event.data as {
              permission: string;
              metadata?: Record<string, unknown>;
            };
            const requestId =
              typeof metadata?.request_id === "string" ? metadata.request_id : permission;
            set({
              status: "waiting_approval",
              pendingTool: {
                requestId,
                tool: {
                  id: requestId,
                  name: permission,
                  params: metadata ?? {},
                },
              },
            });
            break;
          }

          case "permission_replied": {
            set({ pendingTool: null });
            break;
          }

          case "queue_updated": {
            const data = event.data as {
              running?: boolean;
              active_task?: string | null;
              queued?: AgentQueuedTask[];
            };
            const queuedTasks = Array.isArray(data?.queued) ? data.queued : [];
            const activeTaskPreview = typeof data?.active_task === "string"
              ? data.active_task
              : null;
            const nextStatus = data?.running
              ? (state.status === "idle" ? "running" : state.status)
              : (state.status === "running" ? "idle" : state.status);
            set({
              status: nextStatus,
              queuedTasks,
              activeTaskPreview,
            });
            break;
          }

          case "prompt_stack": {
            const data = event.data as {
              provider?: string;
              base_system?: string;
              system_prompt?: string;
              role_prompt?: string;
              built_in_agent?: string;
              workspace_agent?: string;
              skills_index?: string | null;
            };
            set({
              debugPromptStack: {
                provider: typeof data?.provider === "string" ? data.provider : "unknown",
                baseSystem: typeof data?.base_system === "string" ? data.base_system : "",
                systemPrompt: typeof data?.system_prompt === "string" ? data.system_prompt : "",
                rolePrompt: typeof data?.role_prompt === "string" ? data.role_prompt : "",
                builtInAgent: typeof data?.built_in_agent === "string" ? data.built_in_agent : "",
                workspaceAgent: typeof data?.workspace_agent === "string" ? data.workspace_agent : "",
                skillsIndex: typeof data?.skills_index === "string" ? data.skills_index : null,
                receivedAt: Date.now(),
              },
            });
            break;
          }

          case "step_finish": {
            const { tokens } = event.data as { tokens?: { input?: number; output?: number } };
            const inputTokens = tokens?.input ?? 0;
            const outputTokens = tokens?.output ?? 0;
            const added = inputTokens + outputTokens;
            if (added > 0) {
              const contextTokens = inputTokens > 0
                ? inputTokens
                : estimateContextTokens(state.messages);
              const shouldCompact = state.autoCompactEnabled && shouldAutoCompact(contextTokens);
              set({
                totalTokensUsed: state.totalTokensUsed + added,
                lastTokenUsage: {
                  input: inputTokens,
                  output: outputTokens,
                  total: added,
                },
                pendingCompaction: state.pendingCompaction || shouldCompact,
              });
            }
            break;
          }

          case "status_change": {
            const { status } = event.data as { status: AgentStatus };
            set({
              status,
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
            });
            break;
          }

          case "message_chunk": {
            const { content, agent } = event.data as { content: string; agent: AgentType };

            if (state.streamingContent && state.streamingContent.trim() && state.streamingAgent !== agent) {
              set({
                messages: [
                  ...state.messages,
                  {
                    role: "assistant",
                    content: composeAssistantContent(
                      state.streamingReasoning,
                      state.streamingContent
                    ),
                    agent: state.streamingAgent,
                  },
                ],
                streamingContent: content,
                streamingReasoning: "",
                streamingReasoningStatus: "idle",
                streamingAgent: agent,
              });
            } else {
              set({
                streamingContent: state.streamingContent + content,
                streamingReasoningStatus: (() => {
                  if (state.streamingReasoningStatus !== "streaming") {
                    return state.streamingReasoningStatus;
                  }
                  return state.streamingReasoning.trim().length > 0 ? "done" : "idle";
                })(),
                streamingAgent: agent,
              });
            }
            break;
          }

          case "tool_call": {
            const { tool } = event.data as { tool: ToolCall };
            const stats = state.taskStats;
            const { messages: baseMessages, flushed } = flushStreamingToMessages();
            set({
              messages: [
                ...baseMessages,
                {
                  role: "tool",
                  content: `🔧 ${tool.name}: ${JSON.stringify(tool.params)}`,
                },
              ],
              streamingContent: flushed ? "" : state.streamingContent,
              streamingReasoning: flushed ? "" : state.streamingReasoning,
              streamingReasoningStatus: flushed ? "idle" : state.streamingReasoningStatus,
              taskStats: {
                ...stats,
                toolCalls: stats.toolCalls + 1,
                totalToolCalls: stats.totalToolCalls + 1,
              },
            });
            break;
          }

          case "complete": {
            const { result } = event.data as { result: string };
            const stats = state.taskStats;
            if (result && result.trim()) {
              const lastMsg = state.messages[state.messages.length - 1];
              const isDuplicate = lastMsg &&
                lastMsg.role === "assistant" &&
                lastMsg.content === result;

              if (!isDuplicate) {
                set({
                  messages: [
                    ...state.messages,
                    { role: "assistant" as const, content: result, agent: "reporter" as AgentType },
                  ],
                  streamingContent: "",
                  streamingReasoning: "",
                  streamingReasoningStatus: "idle",
                  taskStats: {
                    ...stats,
                    completedTasks: stats.completedTasks + 1,
                  },
                });
                get()._saveCurrentSession();
                void get()._compactSession();
              } else {
                set({
                  streamingContent: "",
                  streamingReasoning: "",
                  streamingReasoningStatus: "idle",
                  taskStats: {
                    ...stats,
                    completedTasks: stats.completedTasks + 1,
                  },
                });
                get()._saveCurrentSession();
                void get()._compactSession();
              }
            }
            break;
          }

          case "error": {
            const { message } = event.data as { message: string };
            const stats = state.taskStats;
            console.error("[RustAgent] error event:", message);
            set({
              error: formatUserFriendlyError(message),
              streamingContent: "",
              streamingReasoning: "",
              streamingReasoningStatus: "idle",
              taskStats: {
                ...stats,
                failedTasks: stats.failedTasks + 1,
              },
            });
            break;
          }

          case "waiting_approval": {
            const { tool, request_id } = event.data as {
              tool: ToolCall;
              request_id: string;
            };
            set({
              status: "waiting_approval",
              pendingTool: {
                tool,
                requestId: request_id,
              },
            });
            break;
          }

          case "llm_request_start": {
            const { request_id, timestamp } = event.data as {
              request_id: string;
              timestamp: number;
            };
            set({
              llmRequestStartTime: timestamp,
              llmRequestId: request_id,
              llmRetryState: null,
            });
            break;
          }

          case "llm_request_end": {
            set({
              llmRequestStartTime: null,
              llmRequestId: null,
              llmRetryState: null,
              streamingReasoningStatus:
                state.streamingReasoning.trim().length > 0 ? "done" : "idle",
            });
            break;
          }

          case "llm_retry_scheduled": {
            const { request_id, attempt, max_retries, delay_ms, reason, next_retry_at } = event.data as {
              request_id: string;
              attempt: number;
              max_retries: number;
              delay_ms: number;
              reason: string;
              next_retry_at: number;
            };
            set({
              llmRetryState: {
                requestId: request_id,
                attempt,
                maxRetries: max_retries,
                delayMs: delay_ms,
                reason,
                nextRetryAt: next_retry_at,
              },
            });
            break;
          }

          case "token_usage": {
            const { total_tokens } = event.data as {
              prompt_tokens: number;
              completion_tokens: number;
              total_tokens: number;
            };
            set({ totalTokensUsed: state.totalTokensUsed + total_tokens });
            break;
          }

          case "heartbeat": {
            const { timestamp } = event.data as { timestamp: number };
            set({
              lastHeartbeat: timestamp,
              connectionStatus: "connected",
            });
            break;
          }

          // Orchestration events are now no-ops (backend owns these)
          case "orchestration_updated":
          case "plan_updated":
          case "explore_updated":
          case "verification_updated":
          case "intent_analysis":
            break;
        }
      },

      // ---- Listeners ----

      _setupListeners: async () => {
        try {
          const unlistenAgent = await listen<AgentEventPayload>(
            "agent-event",
            (event) => {
              get()._handleEvent(event.payload);
            }
          );
          const unlistenMobileCommand = await listen<{ session_id?: string; task?: string }>(
            "mobile-command",
            (event) => {
              const payload = event.payload ?? {};
              const sessionId = payload.session_id;
              const task = payload.task;
              if (!sessionId || !task) return;
              set((state) => {
                const nextSessions = appendMobileUserMessage(
                  state.sessions,
                  sessionId,
                  task
                );
                const isCurrent = state.currentSessionId === sessionId;
                const updatedMessages = isCurrent
                  ? nextSessions.find(s => s.id === sessionId)?.messages ?? state.messages
                  : state.messages;
                return {
                  sessions: nextSessions,
                  messages: updatedMessages,
                };
              });
            }
          );
          const unlistenMobile = await listen<MobileSessionCommand>(
            "mobile-session-command",
            (event) => {
              const payload = event.payload;
              if (payload.action === "create") {
                get().createSession(payload.title);
              } else if (payload.action === "switch" && payload.session_id) {
                get().switchSession(payload.session_id);
              } else if (payload.action === "rename" && payload.session_id && payload.title) {
                get().renameSession(payload.session_id, payload.title);
              } else if (payload.action === "delete" && payload.session_id) {
                get().deleteSession(payload.session_id);
              }
            }
          );
          const unlistenMobileSync = await listen<{ workspace?: boolean; agent_config?: boolean }>(
            "mobile-sync-request",
            (event) => {
              const payload = event.payload ?? {};
              const shouldSyncWorkspace = payload.workspace !== false;
              const shouldSyncAgentConfig = payload.agent_config !== false;

              void get().syncMobileOptions();

              if (shouldSyncWorkspace) {
                const workspacePath = resolveVaultPath();
                if (workspacePath) {
                  useFileStore.getState().syncMobileWorkspace({ path: workspacePath, force: true }).catch((error) => {
                    console.warn("[RustAgent] Failed to resync mobile workspace:", error);
                  });
                }
              }

              if (shouldSyncAgentConfig) {
                void get().syncMobileSessions();
              }
            }
          );
          const unlistenMobileWorkspaceSelect = await listen<{ workspace_id?: string }>(
            "mobile-select-workspace",
            async (event) => {
              const payload = event.payload ?? {};
              const workspaceId = payload.workspace_id;
              if (!workspaceId) return;
              const workspaceStore = useWorkspaceStore.getState();
              const target = workspaceStore.getWorkspaceById(workspaceId);
              if (!target) return;
              workspaceStore.setCurrentWorkspace(workspaceId);
              await useFileStore.getState().setVaultPath(target.path);
              void get().syncMobileOptions();
            }
          );
          const unlistenMobileProfileSelect = await listen<{ profile_id?: string }>(
            "mobile-select-agent-profile",
            (event) => {
              const payload = event.payload ?? {};
              const profileId = payload.profile_id;
              if (!profileId) return;
              useAgentProfileStore.getState().setCurrentProfile(profileId);
              void get().syncMobileSessions();
            }
          );
          const unlistenMobileWorkspace = await listen<{ path?: string; timestamp?: number; source?: string }>(
            "mobile-workspace-updated",
            (event) => {
              const payload = event.payload ?? {};
              if (!payload.path) return;
              useFileStore.getState().setMobileWorkspaceSync({
                status: "confirmed",
                path: payload.path,
                lastConfirmedAt: payload.timestamp ?? Date.now(),
                error: null,
                source: payload.source ?? "mobile-workspace-updated",
              });
            }
          );
          let lastVaultPath: string | null = useFileStore.getState().vaultPath;
          const unsubscribeVault = useFileStore.subscribe((state) => {
            const vaultPath = state.vaultPath;
            if (vaultPath === lastVaultPath) return;
            lastVaultPath = vaultPath;
            if (vaultPath) {
              useWorkspaceStore.getState().registerWorkspace(vaultPath);
            }
            void get().syncMobileOptions();
            void get().syncMobileSessions();
          });
          return () => {
            unlistenAgent();
            unlistenMobileCommand();
            unlistenMobile();
            unlistenMobileSync();
            unlistenMobileWorkspaceSelect();
            unlistenMobileProfileSelect();
            unlistenMobileWorkspace();
            unsubscribeVault();
          };
        } catch (e) {
          console.error("Failed to setup agent event listener:", e);
          return null;
        }
      },
    }),
    {
      name: "lumina-agent",
      storage: createLegacyKeyJSONStorage(["rust-agent-storage"]),
      partialize: (state) => ({
        autoApprove: state.autoApprove,
        autoCompactEnabled: state.autoCompactEnabled,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        taskStats: {
          totalTasks: state.taskStats.totalTasks,
          completedTasks: state.taskStats.completedTasks,
          failedTasks: state.taskStats.failedTasks,
          totalToolCalls: state.taskStats.totalToolCalls,
          totalToolSuccesses: state.taskStats.totalToolSuccesses,
          totalToolFailures: state.taskStats.totalToolFailures,
          // Per-task stats are not persisted
          toolCalls: 0,
          toolSuccesses: 0,
          toolFailures: 0,
        },
      }),
    }
  )
);

// ============ Listener Initialization ============

let unlistenFn: UnlistenFn | null = null;
let isInitializing = false;

export async function initRustAgentListeners() {
  if (isInitializing) {
    console.log("[RustAgent] Already initializing, skipping...");
    return;
  }

  isInitializing = true;

  try {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    unlistenFn = await useRustAgentStore.getState()._setupListeners();
    await useRustAgentStore.getState().syncQueueStatus();
    await useRustAgentStore.getState().syncMobileSessions();
    console.log("[RustAgent] Listener initialized");
  } finally {
    isInitializing = false;
  }
}

export function cleanupRustAgentListeners() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}
