import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useFileStore } from "@/stores/useFileStore";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles } from "@/hooks/useChatSend";
import { parseMarkdown } from "@/lib/markdown";
import { join } from "@/lib/path";
import {
  ArrowUp,
  Bot,
  BrainCircuit,
  FileText,
  Sparkles,
  X,
  Zap,
  Paperclip,
  Square,
  Plus,
  History,
  Trash2,
  MessageSquare,
  Mic,
  MicOff,
  Folder,
  ChevronDown,
  ChevronRight,
  Wrench,
  AlertCircle,
  Check,
  Settings,
  Loader2,
  Tag,
} from "lucide-react";
import type { ReferencedFile } from "@/hooks/useChatSend";
import { AISettingsModal } from "./AISettingsModal";

// 随机黄豆 emoji 列表
const WELCOME_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
  "😊", "😍", "🤩", "😘", "😗", "😋", "😜", "🤪", "😝", "🤑",
  "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
  "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "🥳", "🤠",
  "🧐", "🤓", "😎",
];

// 快捷操作卡片数据
const QUICK_ACTIONS = [
  { icon: Sparkles, label: "润色文字", desc: "Chat: 优化表达", mode: "chat" as const, prompt: "帮我润色这段文字：" },
  { icon: FileText, label: "总结笔记", desc: "Chat: 提炼要点", mode: "chat" as const, prompt: "帮我总结当前笔记的要点" },
  { icon: Zap, label: "写篇文章", desc: "Agent: 创建新笔记", mode: "agent" as const, prompt: "帮我写一篇关于" },
  { icon: Bot, label: "学习笔记", desc: "Agent: 整理知识点", mode: "agent" as const, prompt: "帮我创建一份关于 __ 的学习笔记" },
];

// 建议卡片组件
function SuggestionCard({ 
  icon: Icon, 
  title, 
  desc,
  onClick 
}: { 
  icon: React.ElementType; 
  title: string; 
  desc: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-muted/40 hover:bg-muted/70 p-4 rounded-xl cursor-pointer border border-transparent hover:border-border transition-colors flex flex-col items-start gap-1 text-left"
    >
      <div className="p-2 bg-background rounded-lg shadow-sm text-muted-foreground mb-1">
        <Icon size={18} />
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </motion.button>
  );
}


export function MainAIChatShell() {
  const { chatMode, setChatMode } = useUIStore();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 随机选择一个 emoji（组件挂载时确定）
  const [welcomeEmoji] = useState(() => 
    WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)]
  );
  
  // Agent store
  const {
    status: agentStatus,
    messages: agentMessages,
    sessions: agentSessions,
    currentSessionId: agentSessionId,
    createSession: createAgentSession,
    switchSession: switchAgentSession,
    deleteSession: deleteAgentSession,
    pendingTool,
    approve,
    reject,
    startTask,
    abort: agentAbort,
    checkFirstLoad: checkAgentFirstLoad,
  } = useAgentStore();
  
  // Chat store
  const {
    messages: chatMessages,
    sessions: chatSessions,
    currentSessionId: chatSessionId,
    createSession: createChatSession,
    switchSession: switchChatSession,
    deleteSession: deleteChatSession,
    isLoading: chatLoading,
    isStreaming: chatStreaming,
    sendMessageStream,
    stopStreaming,
    checkFirstLoad: checkChatFirstLoad,
    config,
  } = useAIStore();

  useRAGStore();
  useAgentStore();

  // 根据模式获取对应的会话数据
  const sessions = chatMode === "agent" ? agentSessions : chatSessions;
  const currentSessionId = chatMode === "agent" ? agentSessionId : chatSessionId;
  const createSession = chatMode === "agent" ? createAgentSession : createChatSession;
  const switchSession = chatMode === "agent" ? switchAgentSession : switchChatSession;
  const deleteSession = chatMode === "agent" ? deleteAgentSession : deleteChatSession;
  
  const { vaultPath, currentFile, currentContent, fileTree, openFile } = useFileStore();
  
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // 扁平化文件树
  const flattenFileTree = useCallback((entries: any[], result: ReferencedFile[] = []): ReferencedFile[] => {
    for (const entry of entries) {
      result.push({
        path: entry.path,
        name: entry.name,
        isFolder: entry.is_dir,
      });
      if (entry.is_dir && entry.children) {
        flattenFileTree(entry.children, result);
      }
    }
    return result;
  }, []);

  // 获取所有文件
  const allFiles = useMemo(() => flattenFileTree(fileTree), [fileTree, flattenFileTree]);

  // 文件选择器过滤
  const pickerFilteredFiles = useMemo(() => {
    if (!filePickerQuery) {
      return allFiles.filter(f => !f.isFolder).slice(0, 20);
    }
    const query = filePickerQuery.toLowerCase();
    return allFiles
      .filter(f => !f.isFolder && f.name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [allFiles, filePickerQuery]);

  // 判断是否有对话历史（用于控制动画状态）
  const hasStarted = chatMode === "agent"
    ? agentMessages.length > 0
    : chatMessages.length > 0;

  // 获取当前消息列表
  const messages = chatMode === "agent" ? agentMessages : chatMessages;

  // 判断是否正在加载
  const isLoading = chatMode === "agent"
    ? agentStatus === "running"
    : chatLoading || chatStreaming;

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 首次加载检查
  useEffect(() => {
    if (chatMode === "agent") {
      checkAgentFirstLoad();
    } else {
      checkChatFirstLoad();
    }
  }, [chatMode, checkAgentFirstLoad, checkChatFirstLoad]);

  // 点击外部关闭文件选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-file-picker]')) {
        setShowFilePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if ((!input.trim() && referencedFiles.length === 0) || isLoading) return;

    const message = input;
    setInput("");
    const files = [...referencedFiles];
    setReferencedFiles([]);
    
    const { displayMessage, fullMessage } = await processMessageWithFiles(message, files);

    if (chatMode === "agent") {
      await startTask(fullMessage, {
        workspacePath: vaultPath || "",
        activeNote: currentFile || undefined,
        activeNoteContent: currentFile ? currentContent : undefined,
        displayMessage,
      });
    } else {
      const currentFileInfo = currentFile ? {
        path: currentFile,
        name: currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "",
        content: currentContent,
      } : undefined;
      await sendMessageStream(fullMessage, currentFileInfo, displayMessage);
    }
  }, [input, chatMode, isLoading, vaultPath, currentFile, currentContent, referencedFiles, startTask, sendMessageStream]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 停止生成
  const handleStop = useCallback(() => {
    if (chatMode === "agent") {
      agentAbort();
    } else {
      stopStreaming();
    }
  }, [chatMode, agentAbort, stopStreaming]);

  // 快捷操作点击
  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    setChatMode(action.mode);
    if (action.prompt) {
      setInput(action.prompt);
    }
  };


  // 判断是否是 Agent 中间步骤（工具调用中的消息）
  const isIntermediateStep = (content: string, role: string): boolean => {
    if (chatMode !== "agent" || role !== "assistant") return false;
    
    // 包含工具调用标签的是中间步骤
    const toolTags = ["read_note", "edit_note", "create_note", "list_notes", "move_note", 
                      "delete_note", "search_notes", "grep_search", "semantic_search", 
                      "query_database", "add_database_row", "get_backlinks", "ask_user"];
    
    for (const tag of toolTags) {
      if (content.includes(`<${tag}>`)) return true;
    }
    
    return false;
  };

  // 提取工具调用摘要
  const extractToolSummary = (content: string): string => {
    const toolMatches: string[] = [];
    
    // 匹配工具调用
    const toolRegex = /<(read_note|edit_note|create_note|list_notes|search_notes|grep_search|semantic_search)>/g;
    let match;
    while ((match = toolRegex.exec(content)) !== null) {
      const toolName = match[1];
      const nameMap: Record<string, string> = {
        read_note: "读取笔记",
        edit_note: "编辑笔记", 
        create_note: "创建笔记",
        list_notes: "列出文件",
        search_notes: "搜索笔记",
        grep_search: "文本搜索",
        semantic_search: "语义搜索",
      };
      toolMatches.push(nameMap[toolName] || toolName);
    }
    
    if (toolMatches.length === 0) return "执行操作";
    if (toolMatches.length === 1) return toolMatches[0];
    return `${toolMatches[0]} 等 ${toolMatches.length} 个操作`;
  };

  // 从消息历史中提取创建/编辑的文件
  const extractCreatedFiles = useCallback((): string[] => {
    if (chatMode !== "agent") return [];
    
    const files: string[] = [];
    for (const msg of messages) {
      if (msg.role === "user" && msg.content.includes("<tool_result")) {
        // 匹配 create_note 的结果: "已创建文件: xxx.md" 或 "已覆盖文件: xxx.md"
        const createMatch = msg.content.match(/<tool_result name="create_note">\s*已(?:创建|覆盖)文件: ([^\n<]+)/);
        if (createMatch) {
          files.push(createMatch[1].trim());
        }
        // 匹配 edit_note 的结果: "文件: xxx.md\n已生成 N 处修改"
        const editMatch = msg.content.match(/<tool_result name="edit_note">\s*文件: ([^\n<]+)/);
        if (editMatch) {
          files.push(editMatch[1].trim());
        }
      }
    }
    return [...new Set(files)]; // 去重
  }, [messages, chatMode]);

  // 清理消息内容（移除 XML 标签等）- 参考 AgentPanel 的 renderMessages 逻辑
  const cleanContent = (content: string, isUser: boolean): string => {
    if (chatMode === "agent") {
      // 跳过工具结果消息和系统提示（这些是给 AI 看的，不需要显示给用户）
      if (content.includes("<tool_result") || 
          content.includes("<tool_error") ||
          content.includes("你的响应没有包含有效的工具调用") ||
          content.includes("请使用 <thinking> 标签分析错误原因") ||
          content.includes("系统错误:") ||
          content.includes("系统拒绝执行") ||
          content.includes("用户拒绝了工具调用")) {
        return "";
      }
      
      if (isUser) {
        return content
          .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
          .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
          .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
          .trim();
      } else {
        let text = content;
        
        // 移除 thinking
        text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
        
        // 处理 attempt_completion - 提取 result 内容
        const attemptMatch = text.match(/<attempt_completion>[\s\S]*?<result>([\s\S]*?)<\/result>[\s\S]*?<\/attempt_completion>/);
        if (attemptMatch) {
          text = attemptMatch[1].trim();
        } else {
          // 移除所有工具调用标签（保留标签内的参数内容会很乱，直接移除整个工具调用）
          text = text.replace(/<(read_note|edit_note|create_note|list_notes|move_note|delete_note|search_notes|grep_search|semantic_search|query_database|add_database_row|get_backlinks|ask_user|attempt_completion)>[\s\S]*?<\/\1>/g, "");
        }
        
        // 清理剩余的 XML 标签
        text = text.replace(/<[^>]+>/g, "").trim();
        
        return text;
      }
    }
    return content;
  };

  // 新建对话
  const handleNewChat = () => {
    createSession();
    setShowHistory(false);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  return (
    <div className="h-full bg-background text-foreground flex flex-col overflow-hidden relative">
      {/* 顶部工具栏 */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${
              showHistory 
                ? "bg-muted text-foreground" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <History size={14} />
            <span>历史对话</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus size={14} />
            <span>新建对话</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* 历史对话侧边栏 - 覆盖式，不影响内容居中 */}
        <AnimatePresence>
          {showHistory && (
            <>
              {/* 遮罩层 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/20 z-30"
                onClick={() => setShowHistory(false)}
              />
              {/* 侧边栏 */}
              <motion.div
                initial={{ x: -240, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -240, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 top-0 h-full w-60 border-r border-border bg-background shadow-lg z-40 flex flex-col"
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {chatMode === "agent" ? "Agent 对话" : "Chat 对话"}
                  </h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground text-center">
                      暂无历史对话
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                          session.id === currentSessionId
                            ? "bg-muted"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          switchSession(session.id);
                          setShowHistory(false);
                        }}
                      >
                        <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{session.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatTime(session.updatedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                          title="删除对话"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 主要内容区域 - 始终居中 */}
        <main className={`h-full w-full flex flex-col transition-all duration-700 ease-out overflow-hidden ${
          hasStarted ? "" : "justify-center items-center"
        }`}>
          
          {/* 欢迎语与头像 - 仅在未开始时显示 */}
          <AnimatePresence>
            {!hasStarted && (
            <motion.div 
              className="text-center mb-8 space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.3 } }}
            >
              {/* 头像/Emoji */}
              <div className="w-20 h-20 bg-background rounded-full mx-auto shadow-sm border border-border flex items-center justify-center">
                <span className="text-4xl">{welcomeEmoji}</span>
              </div>
              
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                随时待命，我能帮上什么忙吗？
              </h1>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 消息列表区域 (对话模式) */}
        {hasStarted && (
          <div className="flex-1 w-full overflow-y-auto scrollbar-thin">
            <div className="max-w-3xl mx-auto px-4 pt-8">
            {(() => {
              // 将消息分组：连续的中间步骤合并为一组
              const groups: { type: "normal" | "steps"; messages: typeof messages; startIdx: number }[] = [];
              const isAgentCompleted = chatMode === "agent" && agentStatus !== "running";
              
              // 如果 Agent 已完成，把所有中间步骤合并为一个组
              if (isAgentCompleted) {
                let allSteps: typeof messages = [];
                let firstStepIdx = -1;
                
                messages.forEach((msg, idx) => {
                  const isStep = isIntermediateStep(msg.content || "", msg.role);
                  
                  if (isStep) {
                    if (firstStepIdx === -1) firstStepIdx = idx;
                    allSteps.push(msg);
                  } else {
                    // 在遇到第一条普通消息前，先把之前的步骤加入
                    if (allSteps.length > 0 && firstStepIdx !== -1) {
                      groups.push({ type: "steps", messages: [...allSteps], startIdx: firstStepIdx });
                      allSteps = [];
                      firstStepIdx = -1;
                    }
                    groups.push({ type: "normal", messages: [msg], startIdx: idx });
                  }
                });
                
                // 处理末尾的中间步骤
                if (allSteps.length > 0 && firstStepIdx !== -1) {
                  groups.push({ type: "steps", messages: allSteps, startIdx: firstStepIdx });
                }
              } else {
                // Agent 运行中，每个工具调用单独显示（保持实时反馈）
                let currentSteps: typeof messages = [];
                let stepStartIdx = 0;
                
                messages.forEach((msg, idx) => {
                  const isStep = isIntermediateStep(msg.content || "", msg.role);
                  
                  if (isStep) {
                    if (currentSteps.length === 0) stepStartIdx = idx;
                    currentSteps.push(msg);
                  } else {
                    if (currentSteps.length > 0) {
                      groups.push({ type: "steps", messages: [...currentSteps], startIdx: stepStartIdx });
                      currentSteps = [];
                    }
                    groups.push({ type: "normal", messages: [msg], startIdx: idx });
                  }
                });
                
                if (currentSteps.length > 0) {
                  groups.push({ type: "steps", messages: currentSteps, startIdx: stepStartIdx });
                }
              }
              
              return groups.map((group) => {
                if (group.type === "steps") {
                  // 折叠的中间步骤组
                  const isExpanded = expandedSteps.has(group.startIdx);
                  const summaries = group.messages.map(m => extractToolSummary(m.content || ""));
                  const uniqueSummaries = [...new Set(summaries)];
                  
                  return (
                    <motion.div
                      key={`steps-${group.startIdx}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mb-4"
                    >
                      <button
                        onClick={() => {
                          setExpandedSteps(prev => {
                            const next = new Set(prev);
                            if (next.has(group.startIdx)) {
                              next.delete(group.startIdx);
                            } else {
                              next.add(group.startIdx);
                            }
                            return next;
                          });
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Wrench size={12} />
                        <span>
                          {group.messages.length} 个步骤: {uniqueSummaries.slice(0, 2).join(", ")}
                          {uniqueSummaries.length > 2 && "..."}
                        </span>
                      </button>
                      
                      {isExpanded && (
                        <div className="mt-2 pl-4 border-l-2 border-muted space-y-2">
                          {group.messages.map((msg, i) => {
                            const content = cleanContent(msg.content || "", false);
                            if (!content.trim()) return null;
                            return (
                              <div key={i} className="text-sm text-muted-foreground">
                                {content}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  );
                }
                
                // 普通消息
                const msg = group.messages[0];
                const isUser = msg.role === "user";
                const content = cleanContent(msg.content || "", isUser);
                
                if (!content.trim()) return null;
                
                return (
                  <motion.div 
                    key={group.startIdx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-6 flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                        <Bot size={16} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${
                      isUser 
                        ? "bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5" 
                        : "text-foreground"
                    }`}>
                      {isUser ? (
                        <span className="text-sm">{content}</span>
                      ) : (
                        <div 
                          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
                        />
                      )}
                    </div>
                  </motion.div>
                );
              });
            })()}

            {/* 创建/编辑的文件链接 */}
            {chatMode === "agent" && agentStatus !== "running" && (() => {
              const createdFiles = extractCreatedFiles();
              if (createdFiles.length === 0) return null;
              
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 flex gap-3"
                >
                  <div className="w-8 h-8 shrink-0" /> {/* 占位，对齐 Bot 头像 */}
                  <div className="flex flex-wrap gap-2">
                    {createdFiles.map((file) => (
                      <button
                        key={file}
                        onClick={() => openFile(join(vaultPath || "", file))}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors border border-primary/20"
                      >
                        <FileText size={14} />
                        <span>{file}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              );
            })()}
            
            {/* 工具审批 */}
            {chatMode === "agent" && pendingTool && agentStatus === "waiting_approval" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 max-w-[80%]"
              >
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium text-sm">需要审批</span>
                  </div>
                  <div className="text-sm text-foreground mb-3">
                    <p className="mb-1">
                      工具: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{pendingTool.name}</code>
                    </p>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                      {JSON.stringify(pendingTool.params, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={approve}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      批准
                    </button>
                    <button
                      onClick={reject}
                      className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-lg transition-colors"
                    >
                      <X className="w-3 h-3" />
                      拒绝
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 打字指示器 */}
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="flex gap-3 mb-6"
              >
                <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-muted-foreground" />
                </div>
                <div className="flex items-center gap-1 h-8">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* 输入框容器 */}
        <div className={`w-full shrink-0 ${hasStarted ? "pb-4" : ""}`}>
          <motion.div
            layout
            transition={{ type: "spring", bounce: 0, duration: 0.6 }}
            className="w-full max-w-3xl mx-auto px-4"
          >
          <motion.div 
            layout="position"
            className={`bg-background rounded-[24px] shadow-lg border border-border transition-shadow duration-300 ${
              hasStarted ? "shadow-md" : "shadow-xl"
            }`}
          >
            {/* 输入文本区域 */}
            <div className="p-4 pb-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={chatMode === "agent" ? "我是Lumina，这个模式下我拥有许多强力装备，可以帮你处理各种事务！" : "我是Lumina，你有什么想和我聊聊的？我知无不言"}
                className="w-full resize-none outline-none text-foreground placeholder:text-muted-foreground min-h-[40px] max-h-[200px] bg-transparent text-base leading-relaxed"
                rows={1}
                autoFocus
              />
            </div>

            {/* 已引用的文件标签 */}
            {referencedFiles.length > 0 && (
              <div className="px-4 pt-2 flex flex-wrap gap-1">
                {referencedFiles.map(file => (
                  <div
                    key={file.path}
                    className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
                  >
                    <FileText size={12} />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button
                      onClick={() => setReferencedFiles(files => files.filter(f => f.path !== file.path))}
                      className="hover:bg-primary/20 rounded p-0.5"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 底部工具栏 */}
            <div className="px-4 pb-3 pt-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* 附件按钮 - 工作区文件选择器 */}
                <div className="relative" data-file-picker>
                  <button
                    onClick={() => setShowFilePicker(!showFilePicker)}
                    className="flex items-center gap-1.5 p-1.5 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="添加工作区文件"
                  >
                    <Paperclip size={16} />
                  </button>
                  
                  {/* 文件选择下拉菜单 */}
                  {showFilePicker && (
                    <div className="absolute bottom-full left-0 mb-1 w-72 bg-background border border-border rounded-lg shadow-lg z-50">
                      <div className="p-2 border-b border-border">
                        <input
                          type="text"
                          value={filePickerQuery}
                          onChange={(e) => setFilePickerQuery(e.target.value)}
                          placeholder="搜索文件..."
                          className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {pickerFilteredFiles.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                            未找到文件
                          </div>
                        ) : (
                          pickerFilteredFiles.map((file) => (
                            <button
                              key={file.path}
                              onClick={() => {
                                if (!referencedFiles.some(f => f.path === file.path)) {
                                  setReferencedFiles([...referencedFiles, file]);
                                }
                                setShowFilePicker(false);
                                setFilePickerQuery("");
                              }}
                              className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors"
                            >
                              {file.isFolder ? (
                                <Folder size={14} className="text-yellow-500 shrink-0" />
                              ) : (
                                <FileText size={14} className="text-slate-500 shrink-0" />
                              )}
                              <span className="truncate">{file.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                        共 {allFiles.filter(f => !f.isFolder).length} 个文件
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Agent/Chat 切换滑块 */}
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setChatMode("chat")}
                    title="简单的对话模式，无法操作文件"
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                      chatMode === "chat"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Sparkles size={12} />
                      Chat
                    </span>
                  </button>
                  <button
                    onClick={() => setChatMode("agent")}
                    title="智能助手模式，可以读写文件和执行任务"
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                      chatMode === "agent"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Bot size={12} />
                      Agent
                    </span>
                  </button>
                </div>
                <span className="ml-2 text-xs text-muted-foreground">
                  {config.apiKey ? "✓" : "未配置"}
                </span>

                {/* 设置按钮：紧挨着模式切换的小齿轮，打开 AI 对话设置 */}
                <button
                  onClick={() => setShowSettings(true)}
                  className="ml-1 flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="AI 对话设置"
                >
                  <Settings size={14} />
                </button>
                
                {/* 语音识别中间结果 */}
                {interimText && (
                  <span className="text-xs text-muted-foreground italic animate-pulse truncate max-w-[200px]">
                    {interimText}...
                  </span>
                )}
              </div>
              
              {/* 右侧按钮组 */}
              <div className="flex items-center gap-1">
                {/* 麦克风按钮 */}
                <button
                  onClick={toggleRecording}
                  className={`p-2 rounded-full transition-all duration-200 ${
                    isRecording
                      ? "bg-red-500/20 text-red-500"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title={isRecording ? "停止语音输入" : "开始语音输入"}
                >
                  {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                
                {/* 发送/停止按钮 */}
                <button 
                  onClick={() => isLoading ? handleStop() : handleSend()}
                  disabled={!input.trim() && !isLoading}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                    isLoading
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : input.trim() 
                        ? "bg-foreground text-background hover:opacity-80 shadow-md" 
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {isLoading ? (
                    <Square size={12} fill="currentColor" />
                  ) : (
                    <ArrowUp size={16} strokeWidth={3} />
                  )}
                </button>
              </div>
            </div>

            {/* 应用集成栏 - 仅在未开始时显示 */}
            <AnimatePresence>
              {!hasStarted && (
                <motion.div
                  initial={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-muted/30 border-t border-border px-4 py-2.5 text-xs text-muted-foreground overflow-hidden"
                >
                  <span>从库中获取实时内容</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI 对话设置面板：使用悬浮窗口 */}
            <AISettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

            {/* 底部说明文字 (仅对话模式) */}
            {hasStarted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.5 } }}
                className="text-center text-xs text-muted-foreground mt-3"
              >
                AI 生成的内容可能存在错误，请注意核实
              </motion.p>
            )}
          </motion.div>
          </motion.div>
        </div>

        {/* 建议卡片区域 - 仅在未开始时显示 */}
        <AnimatePresence>
          {!hasStarted && (
            <motion.div 
              className="w-full max-w-3xl mx-auto px-4 mt-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
              exit={{ opacity: 0, y: 50, pointerEvents: "none", transition: { duration: 0.2 } }}
            >
              <div className="mb-4 px-1">
                <span className="text-xs font-medium text-muted-foreground">立即开始</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {QUICK_ACTIONS.map((action, idx) => (
                  <SuggestionCard 
                    key={idx}
                    icon={action.icon} 
                    title={action.label} 
                    desc={action.desc}
                    onClick={() => handleQuickAction(action)} 
                  />
                ))}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </main>

        {/* 调试按钮 */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg hover:bg-orange-600 transition-colors text-xs font-bold"
          title="调试面板"
        >
          🐛
        </button>

        {/* 调试面板 */}
        {showDebug && (
          <div className="fixed inset-4 z-50 bg-background/95 backdrop-blur border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <h2 className="font-bold text-lg">🐛 Agent 调试面板</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  模式: {chatMode} | 状态: {agentStatus} | 消息数: {agentMessages.length}
                </span>
                <button
                  onClick={() => setShowDebug(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-4">
              {agentMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    msg.role === "system"
                      ? "bg-purple-500/10 border-purple-500/30"
                      : msg.role === "user"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-green-500/10 border-green-500/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 font-bold">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      msg.role === "system"
                        ? "bg-purple-500 text-white"
                        : msg.role === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-green-500 text-white"
                    }`}>
                      {msg.role.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground">#{idx}</span>
                    <span className="text-muted-foreground">
                      {msg.content.length} chars
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-foreground/90 max-h-[400px] overflow-auto">
                    {msg.content}
                  </pre>
                </div>
              ))}
              {agentMessages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  暂无消息，发送一条消息开始调试
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
