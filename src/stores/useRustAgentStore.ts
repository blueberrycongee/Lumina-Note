/**
 * Rust Agent Store
 * 
 * 使用 Zustand 管理 Rust Agent 状态
 * 与 useAgentStore 接口兼容，可以无缝切换
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getAIConfig, type AIConfig } from "@/services/ai/ai";
import { useFileStore } from "@/stores/useFileStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useAgentProfileStore } from "@/stores/useAgentProfileStore";
import { callLLM, PROVIDER_REGISTRY, type Message as LLMMessage } from "@/services/llm";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import type { SelectedSkill } from "@/types/skills";

// ============ 类型定义 ============

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
  agent?: AgentType;
  id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export type ForgeEventType =
  | "TextDelta"
  | "TextFinal"
  | "ToolStart"
  | "ToolUpdate"
  | "ToolResult"
  | "PermissionAsked"
  | "PermissionReplied"
  | "SessionPhaseChanged";

export type ForgeSessionPhase =
  | "UserInput"
  | "ModelThinking"
  | "AssistantStreaming"
  | "ToolProposed"
  | "ToolRunning"
  | "ToolResult"
  | "AssistantFinalize"
  | "Completed"
  | "Interrupted"
  | "Resumed";

export type ForgeToolStatus = "pending" | "running" | "completed" | "error";

export type ForgePermissionReply = "once" | "always" | "reject";

export interface ForgePermissionRequest {
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  always?: string[];
}

export interface ForgeToolUpdateRecord {
  type: "output_delta" | "output_preview" | "metadata" | "progress" | "custom";
  delta?: string;
  stream?: string | null;
  preview?: string;
  truncated?: boolean;
  metadata?: Record<string, unknown>;
  progress?: {
    current: number;
    total?: number | null;
    unit?: string | null;
    message?: string | null;
  };
  custom?: unknown;
}

export interface ForgeToolAttachment {
  name: string;
  mimeType: string;
  size?: number;
  reference?: string;
}

export interface ForgeToolCallState {
  callId: string;
  tool: string;
  input?: unknown;
  status: ForgeToolStatus;
  output: string;
  preview?: { text: string; truncated: boolean };
  progress?: {
    current: number;
    total?: number | null;
    unit?: string | null;
    message?: string | null;
  };
  metadata?: Record<string, unknown>;
  updates: ForgeToolUpdateRecord[];
  result?: string;
  attachments?: ForgeToolAttachment[];
  messageId?: string;
  sessionId?: string;
}

export interface ForgeSessionPhaseEvent {
  sessionId: string;
  messageId: string;
  from: ForgeSessionPhase;
  to: ForgeSessionPhase;
}

/// 等待审批的工具信息
export interface PendingToolApproval {
  tool: ToolCall;
  requestId: string;
}

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
  session_type: "agent" | "chat" | "research";
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

// Plan 步骤状态 (Windsurf 风格)
export type PlanStepStatus = "pending" | "in_progress" | "completed";

// Plan 结构 (Windsurf 风格)
export interface Plan {
  steps: {
    step: string;
    status: PlanStepStatus;
  }[];
  explanation?: string;
}

export interface TaskContext {
  workspace_path: string;
  active_note_path?: string;
  active_note_content?: string;
  file_tree?: string;
  history?: Message[];  // 历史对话消息（多轮对话支持）
  skills?: SelectedSkill[];
  mobile_session_id?: string;
}

export interface AgentConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  max_plan_iterations?: number;
  max_steps?: number;
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
  const routing = config.routing;
  const shouldFallback = Boolean(
    routing?.enabled &&
    routing.chatProvider &&
    (!config.apiKey || !config.provider || !config.model)
  );

  if (!shouldFallback) {
    return {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      customModelId: config.customModelId,
      baseUrl: config.baseUrl,
    };
  }

  const isCustom = routing?.chatModel === "custom" && routing.chatCustomModelId;
  return {
    provider: routing!.chatProvider!,
    apiKey: routing?.chatApiKey || config.apiKey,
    model: isCustom ? routing!.chatCustomModelId! : (routing?.chatModel || config.model),
    customModelId: isCustom ? routing!.chatCustomModelId : undefined,
    baseUrl: routing?.chatBaseUrl || config.baseUrl,
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
          { role: "assistant", content: delta, agent: "coordinator", id: streamingId },
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
        { role: "tool", content: `🔧 ${tool}: ${JSON.stringify(input)}` },
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
        { role: "tool", content: `✅ ${tool}: ${content}` },
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
        { role: "assistant", content: result, agent: "reporter" },
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

function shouldAutoCompact(tokensTotal: number) {
  if (tokensTotal <= 0) return false;
  const resolvedConfig = resolveCompactionConfig();
  const contextWindow = resolveModelContextWindow(resolvedConfig);
  if (!contextWindow) return false;
  return tokensTotal / contextWindow >= AUTO_COMPACT_RATIO;
}

function estimateTokensFromText(text: string) {
  if (!text) return 0;
  const ascii = text.replace(/[^\x00-\x7F]/g, "");
  const asciiLen = ascii.length;
  const nonAsciiLen = text.length - asciiLen;
  const asciiTokens = Math.ceil(asciiLen / 4);
  const nonAsciiTokens = Math.ceil(nonAsciiLen / 1.5);
  return asciiTokens + nonAsciiTokens;
}

function estimateContextTokens(messages: Message[]) {
  let total = 0;
  for (const msg of messages) {
    if (!msg?.content) continue;
    total += estimateTokensFromText(String(msg.content));
    total += 4; // rough role/format overhead
  }
  return total;
}

// ============ 任务统计 ============

export interface TaskStats {
  // 当前任务统计
  toolCalls: number;
  toolSuccesses: number;
  toolFailures: number;
  // 累计统计（所有会话）
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalToolCalls: number;
  totalToolSuccesses: number;
  totalToolFailures: number;
}

// ============ Store 状态 ============

interface RustAgentState {
  // 状态
  status: AgentStatus;
  messages: Message[];
  currentPlan: Plan | null;
  error: string | null;
  
  // 意图分析结果
  lastIntent: { type: string; route: string } | null;
  
  // 流式消息累积
  streamingContent: string;
  streamingAgent: AgentType;
  
  // Token 统计
  totalTokensUsed: number;
  
  // 任务统计
  taskStats: TaskStats;
  
  // 会话管理
  sessions: RustAgentSession[];
  currentSessionId: string | null;
  
  // 配置
  autoApprove: boolean;
  autoCompactEnabled: boolean;
  pendingCompaction: boolean;
  isCompacting: boolean;
  lastTokenUsage: { input: number; output: number; total: number } | null;
  
  // 调试模式
  debugEnabled: boolean;
  debugLogPath: string | null;
  
  // 工具审批（新增）
  pendingTool: PendingToolApproval | null;
  
  // LLM 请求超时检测（新增）
  llmRequestStartTime: number | null;
  llmRequestId: string | null;
  
  // 心跳监控（新增）
  lastHeartbeat: number | null;
  connectionStatus: "connected" | "disconnected" | "unknown";
  
  // 操作
  startTask: (task: string, context: TaskContext) => Promise<void>;
  abort: () => Promise<void>;
  clearChat: () => void;
  setAutoApprove: (value: boolean) => void;
  setAutoCompactEnabled: (value: boolean) => void;
  
  // 工具审批操作（新增）
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  
  // 超时重试（新增）
  retryTimeout: () => Promise<void>;
  
  // 调试操作
  enableDebug: (workspacePath: string) => Promise<void>;
  disableDebug: () => Promise<void>;
  
  // 会话操作
  createSession: (title?: string) => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  syncMobileSessions: () => Promise<void>;
  syncMobileOptions: () => Promise<void>;
  
  // 内部方法
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

  const routing = aiConfig.routing;
  const shouldFallbackToChatConfig = Boolean(
    routing?.enabled &&
    routing.chatProvider &&
    (!aiConfig.apiKey || !aiConfig.provider || !aiConfig.model)
  );

  const resolvedProvider = shouldFallbackToChatConfig ? routing!.chatProvider! : aiConfig.provider;
  const resolvedApiKey = shouldFallbackToChatConfig ? (routing!.chatApiKey || aiConfig.apiKey) : aiConfig.apiKey;
  const resolvedModel = shouldFallbackToChatConfig
    ? (routing!.chatModel === "custom" && routing!.chatCustomModelId
        ? routing!.chatCustomModelId
        : routing!.chatModel || actualModel)
    : actualModel;
  const resolvedBaseUrl = shouldFallbackToChatConfig ? (routing!.chatBaseUrl || aiConfig.baseUrl) : aiConfig.baseUrl;

  return {
    provider: resolvedProvider,
    model: resolvedModel,
    api_key: resolvedApiKey || "",
    base_url: resolvedBaseUrl,
    temperature: aiConfig.temperature ?? 0.7,
    max_tokens: 4096,
    // 0 means unlimited
    max_plan_iterations: 0,
    max_steps: 0,
    auto_approve: autoApprove,
    locale: "zh-CN",
  };
};

const buildAgentConfigFromProfile = (profile: { config: AIConfig; autoApprove: boolean }): AgentConfig => {
  return buildAgentConfig(profile.config, profile.autoApprove);
};

// ============ Store 实现 ============

export const useRustAgentStore = create<RustAgentState>()(
  persist(
    (set, get) => ({
      // 初始状态
      status: "idle",
      messages: [],
      currentPlan: null,
      error: null,
      lastIntent: null,
      streamingContent: "",
      streamingAgent: "coordinator",
      totalTokensUsed: 0,
      autoApprove: false,
      autoCompactEnabled: true,
      pendingCompaction: false,
      isCompacting: false,
      lastTokenUsage: null,
      
      // 任务统计初始状态
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
      
      // 会话管理初始状态
      sessions: [{
        id: "default-rust-session",
        title: getCurrentTranslations().common.newConversation,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokensUsed: 0,
      }],
      currentSessionId: "default-rust-session",
      
      // 调试模式初始状态
      debugEnabled: false,
      debugLogPath: null,
      
      // 工具审批初始状态（新增）
      pendingTool: null,
      
      // LLM 请求超时检测初始状态（新增）
      llmRequestStartTime: null,
      llmRequestId: null,
      
      // 心跳监控初始状态（新增）
      lastHeartbeat: null,
      connectionStatus: "unknown",

      // 启动任务
      startTask: async (task: string, context: TaskContext) => {
        const aiConfig = getAIConfig();

        if (!aiConfig.apiKey && aiConfig.provider !== "ollama") {
          const t = getCurrentTranslations();
          set({
            status: "error",
            error: t.ai.apiKeyRequired,
          });
          return;
        }
        
        // 调试：打印配置
        console.log("[RustAgent] 当前配置:", {
          provider: aiConfig.provider,
          model: aiConfig.model,
          hasApiKey: !!aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl,
          routingEnabled: !!aiConfig.routing?.enabled,
          routingChatProvider: aiConfig.routing?.chatProvider,
        });
        
        // 获取当前历史消息（发送前的消息）
        const currentMessages = get().messages;
        
        // 重置状态 + 更新任务统计
        const stats = get().taskStats;
        set({
          status: "running",
          error: null,
          currentPlan: null,
          lastIntent: null,
          streamingContent: "",
          messages: [
            ...currentMessages,
            { role: "user", content: task },
          ],
          taskStats: {
            ...stats,
            // 重置当前任务统计
            toolCalls: 0,
            toolSuccesses: 0,
            toolFailures: 0,
            // 累计任务数+1
            totalTasks: stats.totalTasks + 1,
          },
        });
        
        // 将历史消息转换为后端格式并传入
        const historyForBackend = currentMessages
          .filter(m => m.role === "user" || m.role === "assistant")
          .map(m => ({
            role: m.role,
            content: m.content,
          }));

        const config = buildAgentConfig(aiConfig, get().autoApprove);
        
        console.log("[RustAgent] 发送配置到 Rust:", {
          ...config,
          hasApiKey: !!config.api_key,
        });

        try {
          try {
            await invoke("mobile_set_agent_config", { config });
          } catch (e) {
            console.warn("[RustAgent] Failed to sync mobile agent config:", e);
          }
          // 将历史消息附加到 context 中传给后端
          const contextWithHistory = {
            ...context,
            history: historyForBackend,
          };
          await invoke("agent_start_task", { config, task, context: contextWithHistory });
        } catch (e) {
          console.error("[RustAgent] agent_start_task failed:", e);
          set({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      // 中止任务
      abort: async () => {
        try {
          await invoke("agent_abort");
          set({ status: "aborted" });
        } catch (e) {
          console.error("Failed to abort:", e);
        }
      },

      // 清空聊天
      clearChat: () => {
        set({
          status: "idle",
          messages: [],
          currentPlan: null,
          error: null,
          streamingContent: "",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
        });
      },

      // 设置自动审批
      setAutoApprove: (value: boolean) => {
        set({ autoApprove: value });
      },

      // 设置自动压缩
      setAutoCompactEnabled: (value: boolean) => {
        set({
          autoCompactEnabled: value,
          pendingCompaction: value ? get().pendingCompaction : false,
        });
      },
      
      // 审批工具调用（新增）
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
      
      // 拒绝工具调用（新增）
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
      
      // 超时重试（新增）
      retryTimeout: async () => {
        // TODO: 实现超时重试逻辑
        // 目前 Rust 端还没有实现重试机制
        console.log("[RustAgent] Retry timeout - not implemented yet");
      },
      
      // 启用调试模式
      enableDebug: async (workspacePath: string) => {
        try {
          const logPath = await invoke<string>("agent_enable_debug", { workspacePath });
          set({ debugEnabled: true, debugLogPath: logPath });
          console.log("[RustAgent] 调试模式已启用，日志文件:", logPath);
        } catch (e) {
          console.error("[RustAgent] 启用调试模式失败:", e);
        }
      },
      
      // 禁用调试模式
      disableDebug: async () => {
        try {
          await invoke("agent_disable_debug");
          const logPath = get().debugLogPath;
          set({ debugEnabled: false, debugLogPath: null });
          console.log("[RustAgent] 调试模式已禁用，日志文件:", logPath);
        } catch (e) {
          console.error("[RustAgent] 禁用调试模式失败:", e);
        }
      },

      // 创建新会话
      createSession: (title?: string) => {
        const t = getCurrentTranslations();
        // 先保存当前会话，再基于最新 sessions 追加一个全新会话
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
          currentPlan: null,
          lastIntent: null,
          streamingContent: "",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
        });
        void get().syncMobileSessions();
      },

      // 切换会话
      switchSession: (id: string) => {
        // 保存当前会话，再切换到目标会话（使用最新 sessions）
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
          currentPlan: null,
          lastIntent: null,
          streamingContent: "",
          pendingCompaction: false,
          isCompacting: false,
          lastTokenUsage: null,
        });
      },

      // 删除会话
      deleteSession: (id: string) => {
        const state = get();
        const newSessions = state.sessions.filter(s => s.id !== id);
        
        // 如果删除的是当前会话，切换到第一个会话或创建新会话
        if (state.currentSessionId === id) {
          if (newSessions.length > 0) {
            const firstSession = newSessions[0];
            set({
              sessions: newSessions,
              currentSessionId: firstSession.id,
              messages: firstSession.messages,
              totalTokensUsed: firstSession.totalTokensUsed,
              pendingCompaction: false,
              isCompacting: false,
              lastTokenUsage: null,
            });
          } else {
            // 没有会话了，创建一个新的
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

      // 重命名会话
      renameSession: (id: string, title: string) => {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }));
        void get().syncMobileSessions();
      },

      // 同步会话到移动端
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

      // 保存当前会话
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

      // 自动压缩上下文
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

      // 处理事件
      _handleEvent: (event: AgentEventPayload) => {
        const state = get();
        const eventSessionId = event.session_id;
        if (eventSessionId && eventSessionId !== state.currentSessionId) {
          set((current) => {
            const index = current.sessions.findIndex(s => s.id === eventSessionId);
            if (index === -1) {
              return current;
            }
            const session = current.sessions[index];
            const updatedSession = applyBackgroundEventToSession(session, event, eventSessionId);
            if (updatedSession === session) {
              return current;
            }
            const nextSessions = [...current.sessions];
            nextSessions[index] = updatedSession;
            return {
              sessions: nextSessions,
            };
          });
          return;
        }
        const flushStreamingToMessages = () => {
          if (!state.streamingContent || !state.streamingContent.trim()) {
            return { messages: state.messages, flushed: false };
          }
          return {
            messages: [
              ...state.messages,
              {
                role: "assistant" as const,
                content: state.streamingContent,
                agent: state.streamingAgent,
              },
            ],
            flushed: true,
          };
        };
        
        switch (event.type) {
          case "run_started": {
            set({
              status: "running",
              error: null,
              streamingContent: "",
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
            set({ status: "completed" });
            void get()._compactSession();
            break;
          }

          case "run_failed": {
            const { error } = event.data as { error: string };
            const stats = state.taskStats;
            set({
              status: "error",
              error,
              streamingContent: "",
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
              pendingTool: null,
            });
            break;
          }

          case "text_delta": {
            const { delta } = event.data as { delta: string };
            set({
              streamingContent: state.streamingContent + delta,
              streamingAgent: "coordinator",
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
            // 只更新状态，不添加消息（消息由 complete 事件处理）
            // 清空流式内容防止重复
            set({ 
              status,
              streamingContent: "",
            });
            break;
          }

          case "message_chunk": {
            const { content, agent } = event.data as { content: string; agent: AgentType };
            
            console.log("[RustAgent] message_chunk:", { content, agent, currentLen: state.streamingContent.length });
            
            // 如果 agent 变了且有之前的内容，先保存之前的内容
            if (state.streamingContent && state.streamingContent.trim() && state.streamingAgent !== agent) {
              set({
                messages: [
                  ...state.messages,
                  {
                    role: "assistant",
                    content: state.streamingContent,
                    agent: state.streamingAgent,
                  },
                ],
                streamingContent: content,
                streamingAgent: agent,
              });
            } else {
              // 直接累积内容
              set({
                streamingContent: state.streamingContent + content,
                streamingAgent: agent,
              });
            }
            break;
          }

          case "intent_analysis": {
            const { intent, route, message } = event.data as { 
              intent: string; route: string; message: string 
            };
            // 检查是否已经有相同的意图分析消息（防止重复）
            const hasIntentMsg = state.messages.some(m => 
              m.content?.includes('🎯 意图分析') && m.agent === "coordinator"
            );
            if (!hasIntentMsg) {
              set({
                lastIntent: { type: intent, route },
                messages: [
                  ...state.messages,
                  {
                    role: "assistant",
                    content: message,
                    agent: "coordinator",
                  },
                ],
              });
            } else {
              // 只更新意图，不添加重复消息
              set({ lastIntent: { type: intent, route } });
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
              taskStats: {
                ...stats,
                toolCalls: stats.toolCalls + 1,
                totalToolCalls: stats.totalToolCalls + 1,
              },
            });
            break;
          }

          case "plan_updated": {
            // Windsurf 风格：每次接收完整的 plan
            const { plan } = event.data as { plan: Plan };
            console.log("[RustAgent] plan_updated:", plan);
            set({ currentPlan: plan });
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

          case "complete": {
            const { result } = event.data as { result: string };
            const stats = state.taskStats;
            console.log("[RustAgent] complete event:", { result: result?.slice(0, 100), hasResult: !!result });
            if (result && result.trim()) {
              // 检查最后一条消息是否完全相同（避免完全重复）
              const lastMsg = state.messages[state.messages.length - 1];
              const isDuplicate = lastMsg && 
                lastMsg.role === "assistant" && 
                lastMsg.content === result;
              
              console.log("[RustAgent] complete check:", { 
                lastMsgContent: lastMsg?.content?.slice(0, 50), 
                isDuplicate,
                messagesCount: state.messages.length 
              });
              
              if (!isDuplicate) {
                const newMessages = [
                  ...state.messages,
                  { role: "assistant" as const, content: result, agent: "reporter" as AgentType },
                ];
                set({
                  messages: newMessages,
                  streamingContent: "",
                  taskStats: {
                    ...stats,
                    completedTasks: stats.completedTasks + 1,
                  },
                });
                // 保存到会话
                get()._saveCurrentSession();
                console.log("[RustAgent] Added complete message");
                void get()._compactSession();
              } else {
                // 只清空流式内容，但仍然计入完成
                set({ 
                  streamingContent: "",
                  taskStats: {
                    ...stats,
                    completedTasks: stats.completedTasks + 1,
                  },
                });
                // 仍然保存会话
                get()._saveCurrentSession();
                console.log("[RustAgent] Skipped duplicate message");
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
              error: message,
              streamingContent: "",
              taskStats: {
                ...stats,
                failedTasks: stats.failedTasks + 1,
              },
            });
            break;
          }
          
          // 新增：等待工具审批事件
          case "waiting_approval": {
            const { tool, request_id } = event.data as { 
              tool: ToolCall; 
              request_id: string;
            };
            console.log("[RustAgent] waiting_approval:", { tool, request_id });
            set({
              status: "waiting_approval",
              pendingTool: {
                tool,
                requestId: request_id,
              },
            });
            break;
          }
          
          // 新增：LLM 请求开始事件
          case "llm_request_start": {
            const { request_id, timestamp } = event.data as { 
              request_id: string; 
              timestamp: number;
            };
            set({
              llmRequestStartTime: timestamp,
              llmRequestId: request_id,
            });
            break;
          }
          
          // 新增：LLM 请求结束事件
          case "llm_request_end": {
            set({
              llmRequestStartTime: null,
              llmRequestId: null,
            });
            break;
          }
          
          // 新增：心跳事件（用于连接状态监控）
          case "heartbeat": {
            const { timestamp } = event.data as { timestamp: number };
            set({
              lastHeartbeat: timestamp,
              connectionStatus: "connected",
            });
            console.log("[RustAgent] heartbeat received:", timestamp);
            break;
          }
        }
      },

      // 设置监听器
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
              console.log("[MobileGateway] Workspace synced:", payload.path);
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
      name: "rust-agent-storage",
      partialize: (state) => ({
        autoApprove: state.autoApprove,
        autoCompactEnabled: state.autoCompactEnabled,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        // 持久化累计统计
        taskStats: {
          totalTasks: state.taskStats.totalTasks,
          completedTasks: state.taskStats.completedTasks,
          failedTasks: state.taskStats.failedTasks,
          totalToolCalls: state.taskStats.totalToolCalls,
          totalToolSuccesses: state.taskStats.totalToolSuccesses,
          totalToolFailures: state.taskStats.totalToolFailures,
          // 当前任务统计不持久化
          toolCalls: 0,
          toolSuccesses: 0,
          toolFailures: 0,
        },
      }),
    }
  )
);

// ============ 初始化监听器 ============

let unlistenFn: UnlistenFn | null = null;
let isInitializing = false;

export async function initRustAgentListeners() {
  // 防止重复初始化
  if (isInitializing) {
    console.log("[RustAgent] Already initializing, skipping...");
    return;
  }
  
  isInitializing = true;
  
  try {
    if (unlistenFn) {
      console.log("[RustAgent] Cleaning up old listener");
      unlistenFn();
      unlistenFn = null;
    }
    unlistenFn = await useRustAgentStore.getState()._setupListeners();
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

// ============ 统计计算 ============

/**
 * 获取 Agent 统计摘要
 */
export function getAgentStats() {
  const { taskStats, totalTokensUsed } = useRustAgentStore.getState();
  
  // 工具调用成功率
  const toolSuccessRate = taskStats.totalToolCalls > 0
    ? (taskStats.totalToolSuccesses / taskStats.totalToolCalls * 100).toFixed(1)
    : "N/A";
  
  // 任务完成率
  const taskCompletionRate = taskStats.totalTasks > 0
    ? (taskStats.completedTasks / taskStats.totalTasks * 100).toFixed(1)
    : "N/A";
  
  return {
    // 当前任务
    current: {
      toolCalls: taskStats.toolCalls,
      toolSuccesses: taskStats.toolSuccesses,
      toolFailures: taskStats.toolFailures,
      successRate: taskStats.toolCalls > 0
        ? (taskStats.toolSuccesses / taskStats.toolCalls * 100).toFixed(1) + "%"
        : "N/A",
    },
    // 累计统计
    total: {
      tasks: taskStats.totalTasks,
      completed: taskStats.completedTasks,
      failed: taskStats.failedTasks,
      completionRate: taskCompletionRate + "%",
      toolCalls: taskStats.totalToolCalls,
      toolSuccesses: taskStats.totalToolSuccesses,
      toolFailures: taskStats.totalToolFailures,
      toolSuccessRate: toolSuccessRate + "%",
      tokensUsed: totalTokensUsed,
    },
  };
}
