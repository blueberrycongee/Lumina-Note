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
  TaskContext,
  LLMConfig
} from "@/agent/types";
import { getAgentLoop, resetAgentLoop } from "@/agent/core/AgentLoop";
import { MODES } from "@/agent/modes";
import { getAIConfig } from "@/services/ai/ai";
import { intentRouter, Intent, queryRewriter, type MessageContent, type TextContent } from "@/services/llm";

// 从消息内容中提取文本（处理多模态内容）
function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(item => item.type === 'text')
    .map(item => (item as TextContent).text)
    .join('\n');
}

interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  status: AgentStatus;
  currentTask: string | null;
  lastError: string | null;
  lastIntent: Intent | null;
  lastRewrittenQuery?: string | null;
  totalTokensUsed?: number;
}

function generateAgentSessionTitleFromMessages(messages: Message[], fallback: string = "新对话"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content) return fallback;
  const raw = getTextFromContent(firstUser.content).replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const maxLen = 20;
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function generateAgentTitleFromAssistant(messages: Message[], fallback: string = "新对话"): string {
  const firstAssistant = messages.find((m) => m.role === "assistant");
  if (!firstAssistant || !firstAssistant.content) return fallback;
  const cleaned = getTextFromContent(firstAssistant.content)
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
  lastAutoApprovedTool: ToolCall | null;  // 最近被自动审批的工具
  currentTask: string | null;
  lastError: string | null;
  lastIntent: Intent | null;
  lastRewrittenQuery: string | null;

  // 超时检测（LLM 请求级别）
  llmRequestStartTime: number | null;  // 当前 LLM 请求开始时间
  llmRequestCount: number;             // 当前 task 中的 LLM 请求次数（用于幂等重试）

  // Token 统计（当前会话）
  totalTokensUsed: number;

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
  retryTimeout: (context: TaskContext) => Promise<void>;  // 超时重试
  checkFirstLoad: () => void;

  // 内部更新
  _updateFromLoop: () => void;
}

let hasInitialized = false;

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
        lastAutoApprovedTool: null,
        currentTask: null,
        lastError: null,
        lastIntent: null,
        lastRewrittenQuery: null,

        // 超时检测（LLM 请求级别）
        llmRequestStartTime: null,
        llmRequestCount: 0,

        // Token 统计
        totalTokensUsed: 0,

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
            lastIntent: null,
            totalTokensUsed: 0,
            lastRewrittenQuery: null,
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
            lastIntent: null,
          };

          set((state) => ({
            sessions: [...state.sessions, session],
            currentSessionId: id,
            status: "idle",
            messages: [],
            pendingTool: null,
            currentTask: null,
            lastError: null,
            lastIntent: null,
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
              lastIntent: current?.lastIntent ?? null,
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
              lastIntent: session.lastIntent,
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
            lastIntent: null, // 重置意图状态，确保显示的是本次任务的结果
            taskStartTime: Date.now(),  // 记录任务开始时间
            isLongRunning: false,       // 重置超时标记
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? { ...s, status: "running", updatedAt: Date.now(), lastIntent: null }
                : s
            ),
          }));

          // 意图识别与动态路由
          let configOverride: Partial<LLMConfig> | undefined = undefined;
          // 准备用于路由/改写的消息历史与默认处理消息
          const currentMessages = get().messages;
          let processingMessage = message;
          try {
            const config = getAIConfig();
            // 检查路由是否启用 (只要启用了路由，就进行意图识别，即使没有配置 chatProvider)
            if (config.routing?.enabled) {
              // 获取最新消息历史
              const currentMessages = get().messages;

              // 先进行意图识别（使用原始用户输入）
              const intent = await intentRouter.route(message, currentMessages);
              console.log('[Agent] Intent detected:', intent);

              // 更新意图状态
              set((state) => ({
                lastIntent: intent,
                sessions: state.sessions.map((s) =>
                  s.id === state.currentSessionId
                    ? { ...s, lastIntent: intent }
                    : s
                ),
              }));

              // 将意图添加到上下文，供 AgentLoop 判断是否允许纯文本回复
              fullContext.intent = intent.type;

              // 规则匹配：如果意图是 chat 或 search，且配置了 chatProvider，则使用 chatModel
              if (["chat", "search"].includes(intent.type) && config.routing.chatProvider) {
                configOverride = {
                  provider: config.routing.chatProvider,
                  apiKey: config.routing.chatApiKey || config.apiKey,
                  model: config.routing.chatModel,
                  customModelId: config.routing.chatCustomModelId,
                  baseUrl: config.routing.chatBaseUrl,
                };
                console.log('[Agent] Routing to chat model:', configOverride.model);
              }

              // 意图驱动的模式切换：根据意图自动切换到最合适的 Agent 模式
              // 这解决了 "edit" 意图被识别但因当前模式缺少工具而无法执行的问题
              let targetMode: AgentModeSlug | null = null;
              switch (intent.type) {
                case "create":
                  targetMode = "writer";
                  break;
                case "edit":
                  targetMode = "editor";
                  break;
                case "organize":
                  targetMode = "organizer";
                  break;
                case "search":
                  targetMode = "researcher";
                  break;
                case "flashcard":
                  // 闪卡意图使用 editor 模式（包含闪卡工具）
                  targetMode = "editor";
                  break;
              }

              if (targetMode && MODES[targetMode]) {
                fullContext.mode = MODES[targetMode];
                // 同步将意图选出的模式保存到 store.mode，保证 UI 与 AgentLoop 一致
                set({ mode: targetMode });
                console.log(`[Agent] Auto-switching mode to: ${targetMode} (based on intent: ${intent.type})`);
              }
            }
            // 如果不是闲聊意图，则对 prompt 做保守改写，改写结果用于传递给 AgentLoop（不会改变 UI 中展示的原始用户消息）
            try {
              if (fullContext.intent !== "chat") {
                const rewritten = await queryRewriter.rewrite(message, currentMessages);
                processingMessage = rewritten || message;
                console.log('[Agent] Rewritten query for processing:', processingMessage);

                // 如果改写结果看起来像是“已完成/已执行”的陈述（这会误导后续 LLM 认为任务已完成），则放弃改写并回退为原始 message
                const completedPattern = /(已成功|已删除|删除了|已完成|完成了|已移除|移除了|成功删除|已将.+删除|删除成功|done|deleted)/i;
                if (completedPattern.test(processingMessage)) {
                  console.warn('[Agent] Rewritten query appears to be a completion statement — discarding rewrite and using original message');
                  processingMessage = message;
                }

                // 将最终（可能回退过的）改写结果写入 store（便于调试观察），同时更新当前会话的 lastRewrittenQuery
                set((state) => ({
                  lastRewrittenQuery: processingMessage,
                  sessions: state.sessions.map((s) =>
                    s.id === state.currentSessionId ? { ...s, lastRewrittenQuery: processingMessage } : s
                  ),
                }));
              }
            } catch (e) {
              console.warn('[Agent] Query rewrite (post-intent) failed, fallback to original message', e);
              processingMessage = message;
            }
          } catch (e) {
            console.warn('[Agent] Routing failed:', e);
          }

          try {
            await loop.startTask(processingMessage, fullContext, configOverride);
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
            lastIntent: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                  ...s,
                  status: "idle",
                  messages: [],
                  currentTask: null,
                  lastError: null,
                  lastIntent: null,
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
          let userContent = getTextFromContent(lastUserMessage.content);
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

        // 超时重试当前 LLM 请求：中断当前请求，重新调用（保证幂等）
        retryTimeout: async (context) => {
          const loop = getAgentLoop();
          const { llmRequestCount } = get();

          // 1. 中断当前请求
          loop.abort();

          console.log(`[Agent] 重试第 ${llmRequestCount + 1} 次 LLM 请求（超时）`);

          // 2. 追加超时提示（让 LLM 知道上次超时了）
          const timeoutMessage = `⚠️ 上一次 LLM 请求响应超时（第 ${llmRequestCount + 1} 次请求），正在重新请求，请继续处理当前任务。`;

          loop.addTimeoutHint(timeoutMessage);

          // 3. 重置超时状态，继续执行（从当前消息状态继续）
          set({
            status: "running",
            pendingTool: null,
            llmRequestStartTime: null,  // 等下次 LLM 调用时重新设置
          });

          // 4. 继续执行 Agent 循环（会复用当前的消息历史，保证幂等）
          try {
            await loop.continueLoop(context);
          } catch (error) {
            console.error("[Agent] Retry timeout failed:", error);
          }

          get()._updateFromLoop();
        },

        checkFirstLoad: () => {
          if (!hasInitialized) {
            hasInitialized = true;
            const { sessions, currentSessionId } = get();
            const currentSession = sessions.find(s => s.id === currentSessionId);

            // 如果当前会话存在且有消息，则创建新会话
            // 如果当前会话不存在，也创建新会话
            // 如果当前会话存在但为空（messages.length === 0），则复用它（不创建新的）
            if (!currentSession || currentSession.messages.length > 0) {
              get().createSession();
            }
          }
        },

        // 从 Loop 更新状态
        _updateFromLoop: () => {
          const loop = getAgentLoop();
          const loopState = loop.getState();

          const viewMessages = loopState.messages.filter((m) => m.role !== "system");

          set((state) => {
            // 增量合并 loop 消息，避免因 status_change 事件提前触发导致 UI 被清空
            const existingMessages = state.messages ?? [];
            let finalMessages: Message[] = existingMessages;

            // 1) loop 有更长的消息列表时，追加差量
            if (viewMessages.length > existingMessages.length) {
              const newMessages = viewMessages.slice(existingMessages.length);
              finalMessages = [...existingMessages, ...newMessages];
            }
            // 2) 当前 UI 没有消息，但 loop 有消息时，直接使用 loop 消息（例如切换到有历史的会话）
            else if (existingMessages.length === 0 && viewMessages.length > 0) {
              finalMessages = viewMessages;
            }
            // 3) loop 消息更短或为空时，不覆盖 UI，避免“闪清空”效果

            const newTitle = generateAgentTitleFromAssistant(finalMessages, "新对话");

            // 任务结束时清除超时状态
            const isFinished = ["completed", "error", "idle", "aborted"].includes(loopState.status);

            // 从 AgentLoop 同步 LLM 请求时间和计数
            const llmRequestStartTime = loopState.llmRequestStartTime ?? state.llmRequestStartTime;
            const llmRequestCount = loopState.llmRequestCount ?? state.llmRequestCount;
            const totalTokensUsed = loopState.totalTokensUsed ?? state.totalTokensUsed;

            return {
              status: loopState.status,
              messages: finalMessages,
              pendingTool: loopState.pendingTool,
              currentTask: loopState.currentTask,
              lastError: loopState.lastError,
              // 同步 LLM 请求状态
              llmRequestStartTime,
              llmRequestCount,
              // 任务结束时清除超时相关状态
              ...(isFinished && { llmRequestStartTime: null, llmRequestCount: 0 }),
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                    ...s,
                    title: s.title === "新对话" ? newTitle : s.title,
                    status: loopState.status,
                    messages: finalMessages,
                    currentTask: loopState.currentTask,
                    lastError: loopState.lastError,
                    totalTokensUsed,
                    updatedAt: Date.now(),
                  }
                  : s
              ),
              totalTokensUsed,
            };
          });

          // 自动审批检查（直接使用 loopState 避免时序问题）
          const { autoApprove } = get();
          if (autoApprove && loopState.pendingTool && loopState.status === "waiting_approval") {
            console.log("[Agent] 自动审批工具调用:", loopState.pendingTool.name);
            // 记录被自动审批的工具，用于 UI 显示（保持显示直到任务完成）
            set({ lastAutoApprovedTool: loopState.pendingTool });
            get().approve();
          }

          // 任务完成或出错时清除自动审批标记
          if (loopState.status === "completed" || loopState.status === "error" || loopState.status === "idle") {
            set({ lastAutoApprovedTool: null });
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
