import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Message,
  FileReference,
  EditSuggestion,
  AIConfig,
  chat,
  parseFileReferences,
  parseEditSuggestions,
  applyEdit,
  setAIConfig,
  getAIConfig,
} from "@/services/ai/ai";
import { readFile } from "@/lib/tauri";
import { callLLMStream, type ImageContent, type TextContent, type MessageContent } from "@/services/llm";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";
import type { AttachedImage } from "@/types/chat";
// 流式状态现在完全由 Zustand 管理，不再需要额外的 streamingStore

// Pending diff for preview
export interface PendingDiff {
  fileName: string;
  filePath: string;
  original: string;
  modified: string;
  description: string;
}

// 文本片段引用 (Add to Chat)
export interface TextSelection {
  id: string;
  text: string;
  source: string;  // 来源文件名
  sourcePath?: string;  // 来源文件路径
}

// Token usage tracking
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

// 从消息内容中提取文本（处理多模态内容）
function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  // 多模态内容：提取所有文本部分
  return content
    .filter(item => item.type === 'text')
    .map(item => (item as TextContent).text)
    .join('\n');
}

function generateSessionTitleFromMessages(messages: Message[], fallback: string = "新对话"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content) return fallback;
  const raw = getTextFromContent(firstUser.content).replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const maxLen = 20;
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function generateTitleFromAssistantContent(content: string, fallback: string = "新对话"): string {
  if (!content) return fallback;
  // 去掉思维标签等包裹内容
  const cleaned = content
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

interface AIState {
  // Config
  config: AIConfig;
  encryptedApiKey?: string;
  setConfig: (config: Partial<AIConfig>) => void | Promise<void>;

  // Chat
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessions: ChatSession[];
  currentSessionId: string | null;
  createSession: (title?: string) => void;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  
  // Streaming
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  
  // Token usage
  tokenUsage: TokenUsage;
  totalTokensUsed: number;

  // File references
  referencedFiles: FileReference[];
  addFileReference: (path: string, name: string) => Promise<void>;
  removeFileReference: (path: string) => void;
  clearFileReferences: () => void;

  // Edit suggestions
  pendingEdits: EditSuggestion[];
  clearPendingEdits: () => void;
  
  // Diff preview
  pendingDiff: PendingDiff | null;
  setPendingDiff: (diff: PendingDiff | null) => void;
  diffResolver: ((approved: boolean) => void) | null;
  setDiffResolver: (resolver: ((approved: boolean) => void) | null) => void;

  // Text selections (Add to Chat)
  textSelections: TextSelection[];
  addTextSelection: (text: string, source: string, sourcePath?: string) => void;
  removeTextSelection: (id: string) => void;
  clearTextSelections: () => void;

  // Actions
  sendMessage: (content: string, currentFile?: { path: string; name: string; content: string }, displayContent?: string, images?: AttachedImage[]) => Promise<void>;
  sendMessageStream: (content: string, currentFile?: { path: string; name: string; content: string }, displayContent?: string, images?: AttachedImage[]) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  retry: (currentFile?: { path: string; name: string; content: string }) => Promise<void>;  // 重新生成
  checkFirstLoad: () => void;
}

let hasInitialized = false;

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Config
      config: getAIConfig(),
      encryptedApiKey: undefined,
      setConfig: async (newConfig) => {
        // 如果有新的 apiKey，先加密
        if (newConfig.apiKey !== undefined) {
          const encryptedKey = await encryptApiKey(newConfig.apiKey);
          newConfig = { ...newConfig, apiKey: newConfig.apiKey }; // 内存中保持明文
          setAIConfig(newConfig);
          // 存储时使用加密的 key
          set({ 
            config: { ...getAIConfig() }, 
            encryptedApiKey: encryptedKey 
          });
        } else {
          setAIConfig(newConfig);
          set({ config: getAIConfig() });
        }
      },

      // Chat state
      messages: [],
      isLoading: false,
      error: null,
  sessions: [],
  currentSessionId: null,
            // Session management
            createSession: (title) => {
              const createdAt = Date.now();
              const id = `chat-${createdAt}`;
              const session: ChatSession = {
                id,
                title: title || "新对话",
                createdAt,
                updatedAt: createdAt,
                messages: [],
              };
              set((state) => ({
                sessions: [...state.sessions, session],
                currentSessionId: id,
                messages: [],
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
                  messages: current?.messages ?? [],
                };
              });
            },

            switchSession: (id) => {
              set((state) => {
                const session = state.sessions.find((s) => s.id === id);
                if (!session) return state;
                return {
                  ...state,
                  currentSessionId: id,
                  messages: session.messages,
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
      
      // Streaming state
      isStreaming: false,
      streamingContent: "",
      streamingReasoning: "",
      
      // Token usage
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      totalTokensUsed: 0,

      // File references
      referencedFiles: [],
      addFileReference: async (path, name) => {
        try {
          const content = await readFile(path);
          set((state) => ({
            referencedFiles: [
              ...state.referencedFiles.filter((f) => f.path !== path),
              { path, name, content },
            ],
          }));
        } catch (error) {
          console.error("Failed to read file:", error);
        }
      },
      removeFileReference: (path) => {
        set((state) => ({
          referencedFiles: state.referencedFiles.filter((f) => f.path !== path),
        }));
      },
      clearFileReferences: () => {
        set({ referencedFiles: [] });
      },

      // Edit suggestions
      pendingEdits: [],
      clearPendingEdits: () => {
        set({ pendingEdits: [], pendingDiff: null });
      },
      
      // Diff preview
      pendingDiff: null,
      setPendingDiff: (diff) => {
        set({ pendingDiff: diff });
      },
      diffResolver: null,
      setDiffResolver: (resolver) => {
        set({ diffResolver: resolver });
      },

      // Text selections (Add to Chat)
      textSelections: [],
      addTextSelection: (text, source, sourcePath) => {
        const id = `sel-${Date.now()}`;
        set((state) => ({
          textSelections: [...state.textSelections, { id, text, source, sourcePath }],
        }));
      },
      removeTextSelection: (id) => {
        set((state) => ({
          textSelections: state.textSelections.filter((s) => s.id !== id),
        }));
      },
      clearTextSelections: () => {
        set({ textSelections: [] });
      },

      // Send message
      sendMessage: async (content, currentFile, displayContent) => {
        const { referencedFiles, currentSessionId } = get();
        // 使用内存中的配置（已解密），而不是 store 中可能未同步的配置
        const config = getAIConfig();

        if (!config.apiKey && config.provider !== "ollama") {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        // Parse @file references in message
        const fileRefs = parseFileReferences(content);
        
        // Add user message (use displayContent for showing, content for AI)
        const userMessage: Message = { role: "user", content: displayContent || content };

        // 确保有当前会话
        if (!currentSessionId) {
          get().createSession();
        }

        // 先显示用户消息
        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            error: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    title: s.title === "新对话" ? newTitle : s.title,
                    messages: newMessages,
                    updatedAt: Date.now(),
                  }
                : s
            ),
          };
        });

        // 短暂延迟后再显示 loading 状态
        await new Promise(resolve => setTimeout(resolve, 150));
        set({ isLoading: true });

        try {
          // Load any new referenced files
          for (const ref of fileRefs) {
            const existing = referencedFiles.find(
              (f) => f.path.includes(ref) || f.name.includes(ref)
            );
            if (!existing) {
              // Try to find and load the file
              // For now, assume it's in the vault
              await get().addFileReference(ref, ref);
            }
          }

          // Determine which files to send to AI
          // If user has manually added files, use those
          // Otherwise, use the current focused file
          let filesToSend = get().referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          // 准备配置覆盖 (如果启用了路由且配置了聊天模型)
          let configOverride: Partial<AIConfig> | undefined = undefined;
          if (config.routing?.enabled && config.routing.chatProvider) {
             configOverride = {
               provider: config.routing.chatProvider,
               apiKey: config.routing.chatApiKey || config.apiKey,
               model: config.routing.chatModel,
               customModelId: config.routing.chatCustomModelId,
               baseUrl: config.routing.chatBaseUrl,
             };
             console.log('[AI] Using chat model:', configOverride.model);
          }

          let response;
          try {
            // Call AI - 使用最新的 messages 状态
            // 强制使用 "chat" 意图以启用灵感助手 Prompt
            response = await chat(
              [...get().messages],
              filesToSend,
              configOverride,
              { intent: "chat" }
            );
          } catch (chatError) {
            throw chatError;
          }

          // Parse edit suggestions from content
          const edits = parseEditSuggestions(response.content);

          // Update token usage
          const newUsage = response.usage ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          } : { prompt: 0, completion: 0, total: 0 };

          // Add assistant message and update tokens
          set((state) => {
            const assistantMessage: Message = { role: "assistant", content: response.content };
            const newMessages = [...state.messages, assistantMessage];
            const newTitle = generateTitleFromAssistantContent(response.content, "新对话");
            
            return {
              messages: newMessages,
              pendingEdits: edits.length > 0 ? edits : state.pendingEdits,
              tokenUsage: newUsage,
              totalTokensUsed: state.totalTokensUsed + newUsage.total,
              isLoading: false,
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      messages: newMessages,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });
          
          // Auto-show diff after a short delay (to avoid render issues)
          if (edits.length > 0 && filesToSend.length > 0) {
            // Capture the data we need before setTimeout
            const edit = edits[0];
            const file = filesToSend.find(f => 
              f.path?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase()) ||
              f.name?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase())
            ) || filesToSend[0];
            
            if (file && file.content && file.path) {
              const modified = applyEdit(file.content, edit);
              if (modified !== file.content) {
                // Capture values for closure
                const diffData = {
                  fileName: file.name,
                  filePath: file.path,
                  original: file.content,
                  modified,
                  description: edit.description,
                };
                // Delay setting pendingDiff to let UI settle
                setTimeout(() => {
                  get().setPendingDiff(diffData);
                }, 100);
              }
            }
          }
        } catch (error) {
          console.error('[AI Debug] Error in sendMessage:', error);
          console.error('[AI Debug] Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            config: {
              provider: config.provider,
              model: config.model,
              hasApiKey: !!config.apiKey,
            },
          });
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isLoading: false,
          });
        }
      },

      // 流式发送消息
      sendMessageStream: async (content, currentFile, displayContent, images) => {
        const { referencedFiles, currentSessionId } = get();
        const runtimeConfig = getAIConfig();

        // 构建用户消息内容（支持多模态）
        let userMessageContent: MessageContent;
        if (images && images.length > 0) {
          // 多模态消息：文本 + 图片
          const parts: (TextContent | ImageContent)[] = [];
          if (displayContent || content) {
            parts.push({ type: "text", text: displayContent || content });
          }
          for (const img of images) {
            parts.push({
              type: "image",
              source: {
                type: "base64",
                mediaType: img.mediaType,
                data: img.data,
              },
            });
          }
          userMessageContent = parts;
        } else {
          userMessageContent = displayContent || content;
        }

        // Add user message (use displayContent for showing, content for AI)
        const userMessage: Message = { role: "user", content: userMessageContent };

        if (!currentSessionId) {
          get().createSession();
        }

        // 先显示用户消息
        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            streamingContent: "",
            streamingReasoning: "",
            error: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    title: s.title === "新对话" ? newTitle : s.title,
                    messages: newMessages,
                    updatedAt: Date.now(),
                  }
                : s
            ),
          };
        });

        // 重置流式内容并开始流式状态
        set({ isStreaming: true, streamingContent: "", streamingReasoning: "" });

        if (!runtimeConfig.apiKey && runtimeConfig.provider !== "ollama") {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        try {
          // Prepare files
          let filesToSend = referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          // Build messages with context - 使用国际化提示词
          const t = getCurrentTranslations();
          const chatPrompt = t.prompts.chat;
          const basePrompt = chatPrompt.system;
          
          const systemMessage = filesToSend.length > 0
            ? `${basePrompt}\n\n${chatPrompt.contextFiles}\n\n${filesToSend.map(f => 
                `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``
              ).join("\n\n")}`
            : basePrompt;

          // 从 store 获取最新的 messages，而不是使用闭包中的旧值
          const currentMessages = get().messages;
          
          // 包装用户消息（处理多模态内容）
          const llmMessages: Message[] = [
            { role: "system" as const, content: systemMessage },
            ...currentMessages.map(m => {
              if (m.role === "user") {
                // 对于多模态内容，只包装文本部分
                if (typeof m.content === 'string') {
                  return { role: m.role, content: `<message>\n${m.content}\n</message>` };
                } else {
                  // 多模态内容：包装文本部分，保留图片
                  const wrappedParts = m.content.map(part => {
                    if (part.type === 'text') {
                      return { type: 'text' as const, text: `<message>\n${part.text}\n</message>` };
                    }
                    return part;
                  });
                  return { role: m.role, content: wrappedParts };
                }
              }
              return { role: m.role, content: m.content };
            }),
          ];

          // 准备配置覆盖 (如果启用了路由且配置了聊天模型)
          let configOverride: Partial<AIConfig> | undefined = undefined;
          if (runtimeConfig.routing?.enabled && runtimeConfig.routing.chatProvider) {
             configOverride = {
               provider: runtimeConfig.routing.chatProvider,
               apiKey: runtimeConfig.routing.chatApiKey || runtimeConfig.apiKey,
               model: runtimeConfig.routing.chatModel,
               customModelId: runtimeConfig.routing.chatCustomModelId,
               baseUrl: runtimeConfig.routing.chatBaseUrl,
             };
          }

          // 使用流式调用
          let finalContent = "";
          let reasoningContent = "";
          
          // 流式接收内容
          for await (const chunk of callLLMStream(llmMessages, undefined, configOverride)) {
            if (chunk.type === "text") {
              finalContent += chunk.text;
              // 直接更新 Zustand 状态
              set({ streamingContent: finalContent });
            } else if (chunk.type === "reasoning") {
              reasoningContent += chunk.text;
              // reasoning 暂时也放到 streamingContent 里显示
              set({ streamingContent: `<thinking>\n${reasoningContent}\n</thinking>` });
            } else if (chunk.type === "usage") {
              // Update token usage
              set((state) => ({
                tokenUsage: {
                  prompt: chunk.inputTokens || 0,
                  completion: chunk.outputTokens || 0,
                  total: chunk.totalTokens || 0,
                },
                totalTokensUsed: state.totalTokensUsed + (chunk.totalTokens || 0),
              }));
            } else if (chunk.type === "error") {
              throw new Error(chunk.error);
            }
          }
          
          // 如果有 reasoning content，添加到最终内容前面
          if (reasoningContent) {
            finalContent = `<thinking>\n${reasoningContent}\n</thinking>\n\n${finalContent}`;
          }
          
          // Parse edit suggestions from content
          const edits = parseEditSuggestions(finalContent);

          // 结束流式状态并添加消息（合并为一次更新，避免切换闪烁）
          set((state) => {
            const assistantMessage: Message = { role: "assistant", content: finalContent };
            const newMessages = [...state.messages, assistantMessage];
            const newTitle = generateTitleFromAssistantContent(finalContent, "新对话");
            return {
              messages: newMessages,
              pendingEdits: edits.length > 0 ? edits : state.pendingEdits,
              isStreaming: false,
              streamingContent: "",
              streamingReasoning: "",
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      messages: newMessages,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });

          // Auto-show diff after a short delay (to avoid render issues)
          if (edits.length > 0 && filesToSend.length > 0) {
            // Capture the data we need before setTimeout
            const edit = edits[0];
            const file = filesToSend.find(f => 
              f.path?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase()) ||
              f.name?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase())
            ) || filesToSend[0];
            
            if (file && file.content && file.path) {
              const modified = applyEdit(file.content, edit);
              if (modified !== file.content) {
                const diffData = {
                  fileName: file.name,
                  filePath: file.path,
                  original: file.content,
                  modified,
                  description: edit.description,
                };
                setTimeout(() => {
                  get().setPendingDiff(diffData);
                }, 100);
              }
            }
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isStreaming: false,
          });
        }
      },

      // 停止流式
      stopStreaming: () => {
        set({ isStreaming: false });
      },

      // Clear chat
      clearChat: () => {
        set((state) => ({
          messages: [],
          pendingEdits: [],
          error: null,
          streamingContent: "",
          streamingReasoning: "",
          sessions: state.sessions.map((s) =>
            s.id === state.currentSessionId
              ? { ...s, messages: [], updatedAt: Date.now() }
              : s
          ),
        }));
      },

      // 重新生成最后一条 AI 回复
      retry: async (currentFile) => {
        const { messages } = get();
        
        // 找到最后一条用户消息
        const lastUserIndex = [...messages].reverse().findIndex(m => m.role === "user");
        if (lastUserIndex === -1) return;
        
        const actualIndex = messages.length - 1 - lastUserIndex;
        const lastUserMessage = messages[actualIndex];
        
        // 提取文本内容（重试时不包含图片）
        const userContent = getTextFromContent(lastUserMessage.content);
        
        // 删除最后一条用户消息及之后的所有消息
        const newMessages = messages.slice(0, actualIndex);
        
        // 更新状态
        set((state) => ({
          messages: newMessages,
          sessions: state.sessions.map((s) =>
            s.id === state.currentSessionId
              ? { ...s, messages: newMessages, updatedAt: Date.now() }
              : s
          ),
        }));
        
        // 重新发送（使用流式）
        await get().sendMessageStream(userContent, currentFile);
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
    }),
    {
      name: "lumina-ai",
      partialize: (state) => {
        const persistedConfig = state.config.apiKey
          ? { ...state.config, apiKey: state.encryptedApiKey || state.config.apiKey }
          : state.config;

        return {
          config: persistedConfig,
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
          encryptedApiKey: state.encryptedApiKey,
        };
      },
      onRehydrateStorage: () => async (state) => {
        // 恢复数据后，解密 apiKey 并同步 config 到内存
        if (state?.config) {
          try {
            const storedEncryptedKey = state.encryptedApiKey ?? state.config.apiKey ?? "";
            const decryptedKey = storedEncryptedKey
              ? await decryptApiKey(storedEncryptedKey)
              : "";
            const decryptedConfig = { ...state.config, apiKey: decryptedKey };
            setAIConfig(decryptedConfig);
            useAIStore.setState({ 
              config: decryptedConfig,
              encryptedApiKey: storedEncryptedKey 
            });
          } catch (error) {
            console.error('Failed to decrypt API key:', error);
          }
        }
      },
    }
  )
);
