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
import { getAIConfig } from "@/services/ai/ai";

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
  
  // 内部方法
  _handleEvent: (event: { type: string; data: unknown }) => void;
  _setupListeners: () => Promise<UnlistenFn | null>;
  _saveCurrentSession: () => void;
}

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
        title: "新对话",
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

        // 获取实际模型名（如果是 custom，使用 customModelId）
        const actualModel = aiConfig.model === "custom" && aiConfig.customModelId
          ? aiConfig.customModelId
          : aiConfig.model;

        // 如果主配置缺失但启用了 routing，回退到 chat 配置（避免 agent 无法启动）
        const routing = aiConfig.routing;
        const shouldFallbackToChatConfig = Boolean(
          routing?.enabled &&
          routing.chatProvider &&
          (!aiConfig.apiKey || !aiConfig.provider || !aiConfig.model)
        );

        if (shouldFallbackToChatConfig) {
          console.warn("[RustAgent] 主配置不完整，回退到 routing.chat 配置");
        }

        const resolvedProvider = shouldFallbackToChatConfig ? routing!.chatProvider! : aiConfig.provider;
        const resolvedApiKey = shouldFallbackToChatConfig ? (routing!.chatApiKey || aiConfig.apiKey) : aiConfig.apiKey;
        const resolvedModel = shouldFallbackToChatConfig
          ? (routing!.chatModel === "custom" && routing!.chatCustomModelId
              ? routing!.chatCustomModelId
              : routing!.chatModel || actualModel)
          : actualModel;
        const resolvedBaseUrl = shouldFallbackToChatConfig ? (routing!.chatBaseUrl || aiConfig.baseUrl) : aiConfig.baseUrl;
        
        // 构建配置
        const config: AgentConfig = {
          provider: resolvedProvider,
          model: resolvedModel,
          api_key: resolvedApiKey || "",
          base_url: resolvedBaseUrl,
          temperature: aiConfig.temperature ?? 0.7,
          max_tokens: 4096,
          max_plan_iterations: 3,
          max_steps: 10,
          auto_approve: get().autoApprove,
          locale: "zh-CN",
        };
        
        console.log("[RustAgent] 发送配置到 Rust:", {
          ...config,
          hasApiKey: !!config.api_key,
        });

        try {
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
        });
      },

      // 设置自动审批
      setAutoApprove: (value: boolean) => {
        set({ autoApprove: value });
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
        // 先保存当前会话，再基于最新 sessions 追加一个全新会话
        get()._saveCurrentSession();
        const sessions = get().sessions;

        const id = `rust-session-${Date.now()}`;
        const newSession: RustAgentSession = {
          id,
          title: title || "新对话",
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
        });
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
            });
          } else {
            // 没有会话了，创建一个新的
            const newSession: RustAgentSession = {
              id: `rust-session-${Date.now()}`,
              title: "新对话",
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
            });
          }
        } else {
          set({ sessions: newSessions });
        }
      },

      // 重命名会话
      renameSession: (id: string, title: string) => {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }));
      },

      // 保存当前会话
      _saveCurrentSession: () => {
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
                    title: s.title === "新对话" && state.messages.length > 0
                      ? state.messages.find(m => m.role === "user")?.content.slice(0, 20) || s.title
                      : s.title,
                  }
                : s
            ),
          };
        });
      },

      // 处理事件
      _handleEvent: (event: { type: string; data: unknown }) => {
        const state = get();
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
            const added = (tokens?.input ?? 0) + (tokens?.output ?? 0);
            if (added > 0) {
              set({ totalTokensUsed: state.totalTokensUsed + added });
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
          const unlisten = await listen<{ type: string; data: unknown }>(
            "agent-event",
            (event) => {
              get()._handleEvent(event.payload);
            }
          );
          return unlisten;
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
