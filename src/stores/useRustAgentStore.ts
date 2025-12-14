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
}

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface RustAgentSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  totalTokensUsed: number;
}

export interface Plan {
  steps: {
    id: string;
    description: string;
    agent: AgentType;
    completed: boolean;
  }[];
  current_step: number;
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
  
  // 会话管理
  sessions: RustAgentSession[];
  currentSessionId: string | null;
  
  // 配置
  autoApprove: boolean;
  
  // 操作
  startTask: (task: string, context: TaskContext) => Promise<void>;
  abort: () => Promise<void>;
  clearChat: () => void;
  setAutoApprove: (value: boolean) => void;
  
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

      // 启动任务
      startTask: async (task: string, context: TaskContext) => {
        const aiConfig = getAIConfig();
        
        // 调试：打印配置
        console.log("[RustAgent] 当前配置:", {
          provider: aiConfig.provider,
          model: aiConfig.model,
          hasApiKey: !!aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl,
        });
        
        // 获取当前历史消息（发送前的消息）
        const currentMessages = get().messages;
        
        // 重置状态
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
        
        // 构建配置
        const config: AgentConfig = {
          provider: aiConfig.provider,
          model: actualModel,
          api_key: aiConfig.apiKey || "",
          base_url: aiConfig.baseUrl,
          temperature: aiConfig.temperature ?? 0.7,
          max_tokens: 4096,
          max_plan_iterations: 3,
          max_steps: 10,
          auto_approve: get().autoApprove,
          locale: "zh-CN",
        };
        
        console.log("[RustAgent] 发送配置到 Rust:", config);

        try {
          // 将历史消息附加到 context 中传给后端
          const contextWithHistory = {
            ...context,
            history: historyForBackend,
          };
          await invoke("agent_start_task", { config, task, context: contextWithHistory });
        } catch (e) {
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

      // 创建新会话
      createSession: (title?: string) => {
        const state = get();
        // 先保存当前会话
        state._saveCurrentSession();
        
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
          sessions: [...state.sessions, newSession],
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
        const state = get();
        // 先保存当前会话
        state._saveCurrentSession();
        
        const session = state.sessions.find(s => s.id === id);
        if (session) {
          set({
            currentSessionId: id,
            messages: session.messages,
            totalTokensUsed: session.totalTokensUsed,
            status: "idle",
            error: null,
            currentPlan: null,
            lastIntent: null,
            streamingContent: "",
          });
        }
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
        const state = get();
        if (!state.currentSessionId) return;
        
        set({
          sessions: state.sessions.map(s =>
            s.id === state.currentSessionId
              ? {
                  ...s,
                  messages: state.messages,
                  totalTokensUsed: state.totalTokensUsed,
                  updatedAt: Date.now(),
                  // 根据第一条用户消息生成标题
                  title: s.title === "新对话" && state.messages.length > 0
                    ? state.messages.find(m => m.role === "user")?.content.slice(0, 20) + "..." || s.title
                    : s.title,
                }
              : s
          ),
        });
      },

      // 处理事件
      _handleEvent: (event: { type: string; data: unknown }) => {
        const state = get();
        
        switch (event.type) {
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
            set({
              messages: [
                ...state.messages,
                {
                  role: "tool",
                  content: `🔧 ${tool.name}: ${JSON.stringify(tool.params)}`,
                },
              ],
            });
            break;
          }

          case "tool_result": {
            const { result } = event.data as { 
              result: { success: boolean; content: string; error?: string } 
            };
            set({
              messages: [
                ...state.messages,
                {
                  role: "tool",
                  content: result.success 
                    ? `✅ ${result.content.slice(0, 200)}${result.content.length > 200 ? "..." : ""}`
                    : `❌ ${result.error}`,
                },
              ],
            });
            break;
          }

          case "plan_created": {
            const { plan } = event.data as { plan: Plan };
            set({ currentPlan: plan });
            break;
          }

          case "step_started": {
            const { index } = event.data as { step: Plan["steps"][0]; index: number };
            // 更新 current_step
            const currentPlan = get().currentPlan;
            if (currentPlan) {
              set({
                currentPlan: {
                  ...currentPlan,
                  current_step: index,
                },
              });
            }
            break;
          }

          case "step_completed": {
            const { index } = event.data as { step: Plan["steps"][0]; index: number };
            console.log("[RustAgent] step_completed event received:", { index, event: event.data });
            // 标记步骤为已完成
            const currentPlan = get().currentPlan;
            console.log("[RustAgent] currentPlan before update:", currentPlan);
            if (currentPlan && index < currentPlan.steps.length) {
              const updatedSteps = [...currentPlan.steps];
              updatedSteps[index] = { ...updatedSteps[index], completed: true };
              set({
                currentPlan: {
                  ...currentPlan,
                  steps: updatedSteps,
                  current_step: index + 1,
                },
              });
            }
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
                });
                // 保存到会话
                get()._saveCurrentSession();
                console.log("[RustAgent] Added complete message");
              } else {
                // 只清空流式内容
                set({ streamingContent: "" });
                // 仍然保存会话
                get()._saveCurrentSession();
                console.log("[RustAgent] Skipped duplicate message");
              }
            }
            break;
          }

          case "error": {
            const { message } = event.data as { message: string };
            set({
              error: message,
              streamingContent: "",
            });
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
