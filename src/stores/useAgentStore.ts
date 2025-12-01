/**
 * Agent 状态管理 Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { 
  AgentStatus, 
  Message, 
  ToolCall, 
  AgentModeSlug,
  TaskContext 
} from "@/agent/types";
import { getAgentLoop, resetAgentLoop } from "@/agent/core/AgentLoop";
import { MODES } from "@/agent/modes";

interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  status: AgentStatus;
  currentTask: string | null;
  lastError: string | null;
}

function generateAgentSessionTitleFromMessages(messages: Message[], fallback: string = "新对话"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content) return fallback;
  const raw = firstUser.content.replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const maxLen = 20;
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function generateAgentTitleFromAssistant(messages: Message[], fallback: string = "新对话"): string {
  const firstAssistant = messages.find((m) => m.role === "assistant");
  if (!firstAssistant || !firstAssistant.content) return fallback;
  const cleaned = firstAssistant.content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/[#>*\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const firstSentenceEnd = cleaned.search(/[。.!？?]/);
  const base = firstSentenceEnd > 0 ? cleaned.slice(0, firstSentenceEnd) : cleaned;
  const maxLen = 20;
  const result = base.length > maxLen ? `${base.slice(0, maxLen)}...` : base;
  return result || fallback;
}

interface AgentState {
  // 状态
  status: AgentStatus;
  messages: Message[];
  pendingTool: ToolCall | null;
  currentTask: string | null;
  lastError: string | null;

  // 会话
  sessions: AgentSession[];
  currentSessionId: string | null;
  createSession: (title?: string) => void;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  // 模式
  mode: AgentModeSlug;
  setMode: (mode: AgentModeSlug) => void;

  // 配置
  autoApprove: boolean;
  setAutoApprove: (value: boolean) => void;

  // 动作
  startTask: (message: string, context: TaskContext) => Promise<void>;
  abort: () => void;
  approve: () => void;
  reject: () => void;
  clearChat: () => void;
  retry: (context: TaskContext) => Promise<void>;  // 重新生成最后一条 AI 回复

  // 内部更新
  _updateFromLoop: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => {
      // 监听 Agent Loop 状态变化
      let cleanupListeners: (() => void)[] = [];
      
      const setupListeners = () => {
        // 先清理旧的监听器
        cleanupListeners.forEach(cleanup => cleanup());
        cleanupListeners = [];
        
        const loop = getAgentLoop();
        
        cleanupListeners.push(
          loop.on("status_change", () => {
            get()._updateFromLoop();
          })
        );

        cleanupListeners.push(
          loop.on("message", () => {
            get()._updateFromLoop();
          })
        );

        cleanupListeners.push(
          loop.on("tool_call", () => {
            get()._updateFromLoop();
          })
        );

        cleanupListeners.push(
          loop.on("complete", () => {
            get()._updateFromLoop();
          })
        );

        cleanupListeners.push(
          loop.on("error", () => {
            get()._updateFromLoop();
          })
        );
      };

      // 延迟初始化监听器
      setTimeout(setupListeners, 0);
      
      // 导出 setupListeners 供 resetAgentLoop 后重新调用
      (globalThis as any).__agentSetupListeners = setupListeners;

      const now = Date.now();
      const defaultSessionId = `agent-${now}`;

      return {
        // 初始状态（当前视图）
        status: "idle",
        messages: [],
        pendingTool: null,
        currentTask: null,
        lastError: null,

        // 会话列表
        sessions: [
          {
            id: defaultSessionId,
            title: "新对话",
            createdAt: now,
            updatedAt: now,
            messages: [],
            status: "idle",
            currentTask: null,
            lastError: null,
          },
        ],
        currentSessionId: defaultSessionId,

        // 模式
        mode: "editor",
        setMode: (mode) => set({ mode }),

        // 配置
        autoApprove: false,
        setAutoApprove: (value) => set({ autoApprove: value }),

        // 会话管理
        createSession: (title) => {
          // 重置 AgentLoop，防止旧消息污染新会话
          resetAgentLoop();
          // 重新设置监听器
          (globalThis as any).__agentSetupListeners?.();
          
          const id = `agent-${Date.now()}`;
          const createdAt = Date.now();
          const session: AgentSession = {
            id,
            title: title || "新对话",
            createdAt,
            updatedAt: createdAt,
            messages: [],
            status: "idle",
            currentTask: null,
            lastError: null,
          };

          set((state) => ({
            sessions: [...state.sessions, session],
            currentSessionId: id,
            status: "idle",
            messages: [],
            pendingTool: null,
            currentTask: null,
            lastError: null,
          }));
        },

        deleteSession: (id) => {
          set((state) => {
            const sessions = state.sessions.filter((s) => s.id !== id);
            let currentSessionId = state.currentSessionId;

            if (currentSessionId === id) {
              currentSessionId = sessions[0]?.id ?? null;
            }

            const current = sessions.find((s) => s.id === currentSessionId) || null;

            return {
              sessions,
              currentSessionId,
              status: current?.status ?? "idle",
              messages: current?.messages ?? [],
              pendingTool: null,
              currentTask: current?.currentTask ?? null,
              lastError: current?.lastError ?? null,
            };
          });
        },

        switchSession: (id) => {
          // 重置 AgentLoop 以清除旧会话的状态
          resetAgentLoop();
          // 重新设置监听器
          (globalThis as any).__agentSetupListeners?.();

          set((state) => {
            const session = state.sessions.find((s) => s.id === id);
            if (!session) return state;

            // 将该会话的历史同步到 AgentLoop，确保切回时能完整恢复
            const loop = getAgentLoop();
            if (session.messages && session.messages.length > 0) {
              loop.setMessages(session.messages);
            }

            return {
              ...state,
              currentSessionId: id,
              status: session.status,
              messages: session.messages,
              pendingTool: null,
              currentTask: session.currentTask,
              lastError: session.lastError,
            };
          });
        },

        renameSession: (id, title) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id ? { ...s, title } : s
            ),
          }));
        },

        // 启动任务
        startTask: async (message, context) => {
          const { mode, currentSessionId, sessions } = get();

          // 确保存在会话
          if (!currentSessionId) {
            get().createSession();
          }
          const loop = getAgentLoop();
          
          // 恢复当前会话的消息历史到 AgentLoop（切换会话后 AgentLoop 是空的）
          const currentSession = sessions.find((s) => s.id === currentSessionId);
          const sessionMessages = currentSession?.messages ?? [];
          if (sessionMessages.length > 0) {
            loop.setMessages(sessionMessages);
          }

          // 添加模式到上下文
          const fullContext: TaskContext = {
            ...context,
            mode: MODES[mode],
          };

          // 先显示用户消息（使用 displayMessage 显示简洁版本，不含完整文件内容）
          const displayContent = fullContext.displayMessage || message;
          set((state) => {
            const userMessage: Message = { role: "user", content: displayContent };

            const currentSession = state.sessions.find(
              (s) => s.id === state.currentSessionId
            );
            const baseMessages = currentSession?.messages ?? state.messages ?? [];
            const newMessages = [...baseMessages, userMessage];
            const newTitle = generateAgentSessionTitleFromMessages(newMessages, "新对话");

            return {
              currentTask: displayContent,
              lastError: null,
              messages: newMessages,
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      currentTask: displayContent,
                      messages: newMessages,
                      lastError: null,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });

          // 短暂延迟后再显示 running 状态
          await new Promise(resolve => setTimeout(resolve, 150));
          set((state) => ({
            status: "running",
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? { ...s, status: "running", updatedAt: Date.now() }
                : s
            ),
          }));

          try {
            await loop.startTask(message, fullContext);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "未知错误";
            set((state) => ({
              status: "error",
              lastError: errMsg,
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      status: "error",
                      lastError: errMsg,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            }));
          }

          // 更新最终状态
          get()._updateFromLoop();
        },

        // 中止任务
        abort: () => {
          const loop = getAgentLoop();
          loop.abort();
          set((state) => ({
            status: "aborted",
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? { ...s, status: "aborted", updatedAt: Date.now() }
                : s
            ),
          }));
        },

        // 审批通过
        approve: () => {
          const loop = getAgentLoop();
          loop.approveToolCall(true);
          set({ pendingTool: null });
        },

        // 审批拒绝
        reject: () => {
          const loop = getAgentLoop();
          loop.approveToolCall(false);
          set({ pendingTool: null });
        },

        // 清空聊天
        clearChat: () => {
          resetAgentLoop();
          // 重新设置监听器
          (globalThis as any).__agentSetupListeners?.();
          set((state) => ({
            status: "idle",
            messages: [],
            pendingTool: null,
            currentTask: null,
            lastError: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    status: "idle",
                    messages: [],
                    currentTask: null,
                    lastError: null,
                    updatedAt: Date.now(),
                  }
                : s
            ),
          }));
        },

        // 重新生成最后一条 AI 回复
        retry: async (context) => {
          const { messages, currentSessionId, sessions } = get();
          
          // 找到最后一条用户消息
          const lastUserIndex = [...messages].reverse().findIndex(m => m.role === "user");
          if (lastUserIndex === -1) return;
          
          const actualIndex = messages.length - 1 - lastUserIndex;
          const lastUserMessage = messages[actualIndex];
          
          // 提取用户消息内容（从 <task> 标签中提取）
          let userContent = lastUserMessage.content;
          const taskMatch = userContent.match(/<task>([\s\S]*?)<\/task>/);
          if (taskMatch) {
            userContent = taskMatch[1].trim();
          }
          
          // 删除最后一条用户消息及之后的所有消息
          const newMessages = messages.slice(0, actualIndex);
          
          // 重置 AgentLoop
          resetAgentLoop();
          (globalThis as any).__agentSetupListeners?.();
          
          // 如果有历史消息，恢复到 AgentLoop
          const loop = getAgentLoop();
          if (newMessages.length > 0) {
            // 需要加回 system 消息
            const currentSession = sessions.find(s => s.id === currentSessionId);
            const fullMessages = currentSession?.messages.slice(0, actualIndex) ?? newMessages;
            loop.setMessages(fullMessages);
          }
          
          // 更新状态
          set((state) => ({
            messages: newMessages,
            status: "idle",
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? { ...s, messages: newMessages, updatedAt: Date.now() }
                : s
            ),
          }));
          
          // 重新发送
          await get().startTask(userContent, context);
        },

        // 从 Loop 更新状态
        _updateFromLoop: () => {
          const loop = getAgentLoop();
          const loopState = loop.getState();

          const viewMessages = loopState.messages.filter((m) => m.role !== "system");
          
          set((state) => {
            // 防止旧消息覆盖新消息（当 AgentLoop 还没同步时）
            // 只有当 loop 的消息数量 >= 当前 store 的消息数量时才更新
            const shouldUpdateMessages = viewMessages.length >= state.messages.length;
            const finalMessages = shouldUpdateMessages ? viewMessages : state.messages;
            
            const newTitle = generateAgentTitleFromAssistant(finalMessages, "新对话");
            return {
              status: loopState.status,
              messages: finalMessages,
              pendingTool: loopState.pendingTool,
              currentTask: loopState.currentTask,
              lastError: loopState.lastError,
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      status: loopState.status,
                      messages: finalMessages,
                      currentTask: loopState.currentTask,
                      lastError: loopState.lastError,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });

          // 自动审批检查
          const { autoApprove, pendingTool } = get();
          if (autoApprove && pendingTool && loopState.status === "waiting_approval") {
            get().approve();
          }
        },
      };
    },
    {
      name: "lumina-agent",
      partialize: (state) => ({
        mode: state.mode,
        autoApprove: state.autoApprove,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);

// 导出便捷 hook
export function useAgentStatus() {
  return useAgentStore((state) => state.status);
}

export function useAgentMessages() {
  return useAgentStore((state) => state.messages);
}

export function usePendingTool() {
  return useAgentStore((state) => state.pendingTool);
}
