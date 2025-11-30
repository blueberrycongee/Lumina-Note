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
} from "@/lib/ai";
import { readFile } from "@/lib/tauri";
import { callLLMStream } from "@/services/llm";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";

// Pending diff for preview
export interface PendingDiff {
  fileName: string;
  filePath: string;
  original: string;
  modified: string;
  description: string;
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

function generateSessionTitleFromMessages(messages: Message[], fallback: string = "新对话"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content) return fallback;
  const raw = firstUser.content.replace(/\s+/g, " ").trim();
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

  // Actions
  sendMessage: (content: string, currentFile?: { path: string; name: string; content: string }) => Promise<void>;
  sendMessageStream: (content: string, currentFile?: { path: string; name: string; content: string }) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Config
      config: getAIConfig(),
      setConfig: async (newConfig) => {
        // 如果有新的 apiKey，先加密
        if (newConfig.apiKey !== undefined) {
          const encryptedKey = await encryptApiKey(newConfig.apiKey);
          newConfig = { ...newConfig, apiKey: newConfig.apiKey }; // 内存中保持明文
          // 同步到内存配置
          setAIConfig(newConfig);
          // 存储时使用加密的 key
          set({ 
            config: { ...getAIConfig(), apiKey: encryptedKey } 
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

      // Send message
      sendMessage: async (content, currentFile) => {
        const { referencedFiles, config, currentSessionId } = get();

        if (!config.apiKey) {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        // Parse @file references in message
        const fileRefs = parseFileReferences(content);
        
        // Add user message
        const userMessage: Message = { role: "user", content };

        // 确保有当前会话
        if (!currentSessionId) {
          get().createSession();
        }

        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            isLoading: true,
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

          // Call AI - 使用最新的 messages 状态
          const response = await chat(
            [...get().messages],
            filesToSend
          );

          // Parse edit suggestions from content
          const edits = parseEditSuggestions(response.content);
          console.log("[AI] Parsed edits:", edits);

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
              console.log("=== DEBUG: Auto Diff ===");
              console.log("[1] File name:", file.name);
              console.log("[2] File path:", file.path);
              console.log("[3] File content (first 200 chars):", file.content.substring(0, 200));
              console.log("[4] Edit filePath:", edit.filePath);
              console.log("[5] Edit originalContent:", edit.originalContent);
              console.log("[6] Edit newContent:", edit.newContent);
              console.log("[7] Does file contain originalContent?", file.content.includes(edit.originalContent));
              
              const modified = applyEdit(file.content, edit);
              console.log("[8] Modified length:", modified.length, "Original length:", file.content.length);
              console.log("[9] Content changed:", modified !== file.content);
              console.log("[10] Modified (first 200 chars):", modified.substring(0, 200));
              
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
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isLoading: false,
          });
        }
      },

      // 流式发送消息
      sendMessageStream: async (content, currentFile) => {
        const { referencedFiles, config, currentSessionId } = get();

        // Add user message
        const userMessage: Message = { role: "user", content };

        if (!currentSessionId) {
          get().createSession();
        }

        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            isStreaming: true,
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

        if (!config.apiKey && config.provider !== "ollama") {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        try {
          // Prepare files
          let filesToSend = referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          // Build messages with context
          const systemMessage = filesToSend.length > 0
            ? `你是一个有帮助的 AI 助手。当前上下文文件:\n\n${filesToSend.map(f => 
                `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``
              ).join("\n\n")}`
            : "你是一个有帮助的 AI 助手。";

          // 从 store 获取最新的 messages，而不是使用闭包中的旧值
          const currentMessages = get().messages;
          const llmMessages = [
            { role: "system" as const, content: systemMessage },
            ...currentMessages.map(m => ({ role: m.role, content: m.content })),
          ];

          let fullContent = "";
          let fullReasoning = "";

          // Stream response
          for await (const chunk of callLLMStream(llmMessages)) {
            // Check if stopped
            if (!get().isStreaming) break;

            switch (chunk.type) {
              case "text":
                fullContent += chunk.text;
                set({ streamingContent: fullContent });
                break;
              case "reasoning":
                fullReasoning += chunk.text;
                set({ streamingReasoning: fullReasoning });
                break;
              case "usage":
                set((state) => ({
                  tokenUsage: {
                    prompt: chunk.inputTokens,
                    completion: chunk.outputTokens,
                    total: chunk.totalTokens,
                  },
                  totalTokensUsed: state.totalTokensUsed + chunk.totalTokens,
                }));
                break;
              case "error":
                set({ error: chunk.error, isStreaming: false });
                return;
            }
          }

          // Finalize: add assistant message
          const finalContent = fullReasoning 
            ? `<thinking>\n${fullReasoning}\n</thinking>\n\n${fullContent}`
            : fullContent;

          set((state) => {
            const assistantMessage: Message = { role: "assistant", content: finalContent };
            const newMessages = [...state.messages, assistantMessage];
            const newTitle = generateTitleFromAssistantContent(finalContent, "新对话");
            return {
              messages: newMessages,
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
    }),
    {
      name: "lumina-ai",
      partialize: (state) => ({
        config: state.config,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
      onRehydrateStorage: () => async (state) => {
        // 恢复数据后，解密 apiKey 并同步 config 到内存
        if (state?.config) {
          const decryptedKey = await decryptApiKey(state.config.apiKey || "");
          const decryptedConfig = { ...state.config, apiKey: decryptedKey };
          setAIConfig(decryptedConfig);
          // 更新 store 中的明文配置（仅内存，不触发 persist）
          useAIStore.setState({ config: decryptedConfig });
        }
      },
    }
  )
);
