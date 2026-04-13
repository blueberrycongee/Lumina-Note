import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore, initRustAgentListeners } from "@/stores/useRustAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useRAGStore } from "@/stores/useRAGStore";

import { useFileStore } from "@/stores/useFileStore";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles } from "@/hooks/useChatSend";
import { parseMarkdown } from "@/services/markdown/markdown";
import { resolve } from "@/lib/path";
import { isIMEComposing } from "@/lib/imeUtils";
import { createDir, saveFile, exists } from "@/lib/tauri";
import {
  ArrowUp,
  Bot,
  FileText,
  History,
  Quote,
  Sparkles,
  X,
  Square,
  Mic,
  MicOff,
  AlertCircle,
  Check,
  Settings,
  Bug,
} from "lucide-react";
import { useSessionManagement } from "./hooks/useSessionManagement";
import { useSkillSearch } from "./hooks/useSkillSearch";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { ChatToolbar, ModeToggle } from "./ChatToolbar";
import { WelcomeGreeting, WelcomeSuggestions } from "./WelcomeSection";
import { AgentMessageRenderer, ThinkingCollapsible } from "../chat/AgentMessageRenderer";
import { AssistantDiagramPanels } from "../chat/AssistantDiagramPanels";
import { PlanCard } from "../chat/PlanCard";
import { StreamingOutput } from "../chat/StreamingMessage";
import { SelectableConversationList } from "../chat/SelectableConversationList";
import { UserMessageBubbleContent } from "../chat/UserMessageBubbleContent";
import { getDiagramAttachmentFilePaths } from "../chat/diagramAttachmentUtils";
import { getImagesFromContent, getTextFromContent, getUserMessageDisplay } from "../chat/messageContentUtils";
import {
  filterMentionFiles,
  flattenFileTreeToReferences,
  parseMentionQueryAtCursor,
} from "../chat/fileMentionUtils";
import type { ReferencedFile } from "@/hooks/useChatSend";
import { useShallow } from "zustand/react/shallow";
import { AISettingsModal } from "../ai/AISettingsModal";
import { CodexPanelSlot } from "@/components/codex/CodexPanelSlot";
import { join as joinPath } from "@tauri-apps/api/path";
import {
  buildAgentExportMessages,
  buildChatExportMessages,
  buildConversationExportMarkdown,
  sanitizeExportFileName,
  type ExportMessage,
  type RawConversationMessage,
} from "@/features/conversation-export/exportUtils";
import {
  normalizeThinkingMode,
  supportsThinkingModeSwitch,
  type LLMProviderType,
  type ThinkingMode,
} from "@/services/llm";

type ChatAssistantPart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string };

function parseChatAssistantParts(content: string): ChatAssistantPart[] {
  const parts: ChatAssistantPart[] = [];
  const normalized = content.replace(/<\|end_of_thinking\|>/g, "");
  const tagRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(normalized)) !== null) {
    const text = normalized.slice(lastIndex, match.index);
    if (text.trim().length > 0) {
      parts.push({ type: "text", content: text });
    }

    const thinking = (match[1] || "").trim();
    if (thinking.length > 0) {
      parts.push({ type: "thinking", content: thinking });
    }

    lastIndex = tagRegex.lastIndex;
  }

  const trailing = normalized.slice(lastIndex);
  if (trailing.trim().length > 0 || parts.length === 0) {
    parts.push({ type: "text", content: trailing || normalized });
  }

  return parts;
}

export function MainAIChatShell() {
  const { t } = useLocaleStore();
  const { chatMode, setSkillManagerOpen } = useUIStore();
  const isCodexMode = chatMode === "codex";
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [isExportSelectionMode, setIsExportSelectionMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [isExportingConversation, setIsExportingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const autoSendMessageRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();

  // Extracted hooks
  const {
    allSessions,
    handleSwitchSession: _sessionSwitch,
    handleDeleteSession,
    isCurrentSession,
    handleNewChat: _sessionNewChat,
    rustSessionId,
    chatSessionId,
  } = useSessionManagement();

  const {
    filteredSkills,
    selectedSkills,
    setSelectedSkills,
    setSkillQuery,
    showSkillMenu,
    setShowSkillMenu,
    skillsLoading,
    handleSelectSkill: _handleSelectSkill,
  } = useSkillSearch();

  useEffect(() => {
    if (isCodexMode && showHistory) {
      setShowHistory(false);
    }
  }, [isCodexMode, showHistory]);

  // ========== Rust Agent ==========
  const {
    status: agentStatus,
    messages: rustAgentMessages,
    error: _rustError,
    lastIntent: rustLastIntent,
    totalTokensUsed: rustTotalTokens,
    currentPlan: rustCurrentPlan,
    currentStage: rustCurrentStage,
    orchestrationFallbackReason: rustOrchestrationFallbackReason,
    startTask: rustStartTask,
    abort: agentAbort,
    debugEnabled,
    debugLogPath,
    enableDebug,
    disableDebug,
    pendingTool: rustPendingTool,
    approveTool: approve,
    rejectTool: reject,
    queuedTasks: rustQueuedTasks,
    activeTaskPreview: rustActiveTaskPreview,
    debugPromptStack,
    llmRequestStartTime,
    llmRetryState,
    retryTimeout,
  } = useRustAgentStore();

  // 初始化 Rust Agent 事件监听器
  useEffect(() => {
    initRustAgentListeners();
  }, []);
  
  // 工具审批 - 提取 tool 对象
  const pendingTool = rustPendingTool?.tool;
  const [retryNow, setRetryNow] = useState(Date.now());
  useEffect(() => {
    if (!llmRetryState || chatMode !== "agent" || agentStatus !== "running") return;
    const timer = window.setInterval(() => {
      setRetryNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [llmRetryState, chatMode, agentStatus]);
  const retrySecondsLeft =
    llmRetryState && chatMode === "agent" && agentStatus === "running"
      ? Math.max(0, Math.ceil((llmRetryState.nextRetryAt - retryNow) / 1000))
      : null;
  
  // 转换 Rust Agent 消息格式以兼容 UI
  const agentMessages = useMemo(() => {
    return rustAgentMessages
      // 过滤掉意图分析消息（只在调试面板显示）
      .filter(msg => !msg.content?.includes('🎯 意图分析'))
      .map(msg => ({
        ...msg,
        content: msg.content,
      }));
  }, [rustAgentMessages]);

  // Chat store - 使用 selector 确保状态变化时正确重新渲染
  const {
    messages: chatMessages,
    isLoading: chatLoading,
    isStreaming: chatStreaming,
    error: chatError,
    sendMessageStream,
    stopStreaming,
    checkFirstLoad: checkChatFirstLoad,
    config,
    setConfig,
    totalTokensUsed: chatTotalTokens,
    textSelections,
    removeTextSelection,
    clearTextSelections,
    pendingInputAppends,
    consumeInputAppends,
  } = useAIStore(useShallow((state) => ({
    messages: state.messages,
    isLoading: state.isLoading,
    isStreaming: state.isStreaming,
    error: state.error,
    sendMessageStream: state.sendMessageStream,
    stopStreaming: state.stopStreaming,
    checkFirstLoad: state.checkFirstLoad,
    config: state.config,
    setConfig: state.setConfig,
    totalTokensUsed: state.totalTokensUsed,
    textSelections: state.textSelections,
    removeTextSelection: state.removeTextSelection,
    clearTextSelections: state.clearTextSelections,
    pendingInputAppends: state.pendingInputAppends,
    consumeInputAppends: state.consumeInputAppends,
  })));
  const effectiveModelForThinking =
    config.model === "custom" ? (config.customModelId || "custom") : config.model;
  const supportsThinkingMode = supportsThinkingModeSwitch(
    config.provider as LLMProviderType,
    effectiveModelForThinking
  );
  const displayThinkingMode = normalizeThinkingMode(config.thinkingMode);

  useRAGStore();

  // Wrap session hooks with local state side effects
  const handleSwitchSession = useCallback(
    (id: string, type: "agent" | "chat") => {
      _sessionSwitch(id, type);
      setShowHistory(false);
    },
    [_sessionSwitch],
  );

  const handleNewChat = useCallback(() => {
    if (chatMode === "codex") return;
    setIsExportSelectionMode(false);
    setSelectedExportIds([]);
    setSelectedSkills([]);
    _sessionNewChat();
    setShowHistory(false);
  }, [chatMode, _sessionNewChat, setSelectedSkills]);

  const { vaultPath, currentFile, currentContent, fileTree, recentFiles, openFile, refreshFileTree } = useFileStore(
    useShallow((state) => ({
      vaultPath: state.vaultPath,
      currentFile: state.currentFile,
      currentContent: state.currentContent,
      fileTree: state.fileTree,
      recentFiles: state.recentFiles,
      openFile: state.openFile,
      refreshFileTree: state.refreshFileTree,
    })),
  );

  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // 判断是否有对话历史（用于控制动画状态）
  // Chat 模式下，流式进行中也算已开始（确保流式消息能正确显示）
  const hasStarted = isCodexMode
    ? true
    : chatMode === "agent"
      ? agentMessages.length > 0 || agentStatus === "error"
      : chatMessages.length > 0 || chatStreaming || !!chatError;

  useEffect(() => {
    if (!import.meta.env.DEV || typeof performance === "undefined") {
      return;
    }
    performance.mark(`lumina:hasStarted:${hasStarted ? "true" : "false"}`);
    if (hasStarted) {
      try {
        performance.measure(
          "lumina:send->started",
          "lumina:send:start",
          "lumina:hasStarted:true"
        );
      } catch {
        // ignore missing marks
      }
    }
  }, [hasStarted]);

  // 获取当前消息列表
  const messages =
    chatMode === "agent" ? agentMessages : chatMessages;

  // 判断是否正在加载
  const isLoading = chatMode === "agent"
    ? agentStatus === "running"
    : chatLoading || chatStreaming;
  const isAgentWaitingApproval = chatMode === "agent" && agentStatus === "waiting_approval";
  const agentQueueCount = rustQueuedTasks.length;

  const isConversationMode = chatMode === "chat" || chatMode === "agent";
  const chatAssistantDiagramPathsByIndex = useMemo(() => {
    const mapping = new Map<number, string[]>();
    let pendingDiagramPaths: string[] = [];

    chatMessages.forEach((message, index) => {
      if (message.role === "user") {
        const normalized = getUserMessageDisplay(message.content, message.attachments);
        pendingDiagramPaths = getDiagramAttachmentFilePaths(normalized.attachments);
        return;
      }

      if (message.role === "assistant") {
        if (pendingDiagramPaths.length > 0) {
          mapping.set(index, pendingDiagramPaths);
        }
        pendingDiagramPaths = [];
      }
    });

    return mapping;
  }, [chatMessages]);

  const exportCandidates = useMemo<ExportMessage[]>(() => {
    if (chatMode === "chat") {
      const normalizedMessages: RawConversationMessage[] = chatMessages.map((message) => ({
        id: (message as { id?: string }).id,
        role: message.role as RawConversationMessage["role"],
        content: message.content,
      }));
      return buildChatExportMessages(normalizedMessages);
    }
    if (chatMode === "agent") {
      const normalizedMessages: RawConversationMessage[] = agentMessages.map((message) => ({
        id: message.id,
        role: message.role as RawConversationMessage["role"],
        content: message.content,
      }));
      return buildAgentExportMessages(normalizedMessages);
    }
    return [];
  }, [chatMode, chatMessages, agentMessages]);

  const selectedExportIdSet = useMemo(() => new Set(selectedExportIds), [selectedExportIds]);
  const allExportSelected =
    exportCandidates.length > 0 && selectedExportIds.length === exportCandidates.length;

  const currentConversationTitle = useMemo(() => {
    if (chatMode === "agent") {
      const currentSession = allSessions.find(
        (s) => s.type === "agent" && s.id === rustSessionId,
      );
      return currentSession?.title || t.ai.conversation;
    }

    if (chatMode === "chat") {
      const currentSession = allSessions.find(
        (s) => s.type === "chat" && s.id === chatSessionId,
      );
      return currentSession?.title || t.ai.conversation;
    }

    return t.ai.conversation;
  }, [chatMode, allSessions, rustSessionId, chatSessionId, t.ai.conversation]);

  useEffect(() => {
    if (!isConversationMode) {
      setIsExportSelectionMode(false);
      setSelectedExportIds([]);
    }
  }, [isConversationMode]);

  useEffect(() => {
    const validIds = new Set(exportCandidates.map((message) => message.id));
    setSelectedExportIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [exportCandidates]);

  const handleStartExportSelection = useCallback(() => {
    setIsExportSelectionMode(true);
    setSelectedExportIds([]);
  }, []);

  const handleCancelExportSelection = useCallback(() => {
    setIsExportSelectionMode(false);
    setSelectedExportIds([]);
  }, []);

  const handleToggleExportMessage = useCallback((id: string) => {
    setSelectedExportIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }, []);

  const handleToggleSelectAllExportMessages = useCallback(() => {
    if (allExportSelected) {
      setSelectedExportIds([]);
      return;
    }
    setSelectedExportIds(exportCandidates.map((message) => message.id));
  }, [allExportSelected, exportCandidates]);

  const handleExportSelectedMessages = useCallback(async () => {
    if (!vaultPath || selectedExportIds.length === 0 || !isConversationMode || isExportingConversation) {
      return;
    }

    try {
      setIsExportingConversation(true);
      const selectedIdSet = new Set(selectedExportIds);
      const selectedMessages = exportCandidates
        .filter((message) => selectedIdSet.has(message.id))
        .sort((a, b) => a.order - b.order);

      if (selectedMessages.length === 0) {
        return;
      }

      const modeName = chatMode === "agent" ? "agent" : "chat";
      const markdown = buildConversationExportMarkdown({
        title: currentConversationTitle,
        modeLabel: `${t.ai.mode}: ${chatMode === "agent" ? t.ai.modeAgent : t.ai.modeChat}`,
        messages: selectedMessages,
        roleLabels: {
          user: t.ai.exportRoleUser,
          assistant: t.ai.exportRoleAssistant,
        },
      });

      const safeTitle = sanitizeExportFileName(currentConversationTitle);
      const exportDir = await joinPath(vaultPath, "Exports", "Conversations");
      await createDir(exportDir, { recursive: true });

      let suffix = 1;
      let exportFilePath = await joinPath(exportDir, `${modeName}-${safeTitle}.md`);
      while (await exists(exportFilePath)) {
        suffix += 1;
        exportFilePath = await joinPath(exportDir, `${modeName}-${safeTitle}-${suffix}.md`);
      }
      await saveFile(exportFilePath, markdown);
      await refreshFileTree();
      await openFile(exportFilePath);

      setIsExportSelectionMode(false);
      setSelectedExportIds([]);
    } catch (error) {
      console.error("[ConversationExport] failed:", error);
      alert(t.ai.exportFailed.replace("{error}", String(error)));
    } finally {
      setIsExportingConversation(false);
    }
  }, [
    vaultPath,
    selectedExportIds,
    isConversationMode,
    isExportingConversation,
    exportCandidates,
    chatMode,
    currentConversationTitle,
    t.ai.mode,
    t.ai.modeAgent,
    t.ai.modeChat,
    t.ai.exportRoleUser,
    t.ai.exportRoleAssistant,
    t.ai.exportFailed,
    refreshFileTree,
    openFile,
  ]);

  // 自动滚动到底部
  useEffect(() => {
    if (!messagesEndRef.current) {
      return;
    }
    if (import.meta.env.DEV && typeof performance !== "undefined") {
      performance.mark("lumina:scroll:before");
    }
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    if (import.meta.env.DEV && typeof performance !== "undefined") {
      performance.mark("lumina:scroll:after");
      performance.measure("lumina:scroll", "lumina:scroll:before", "lumina:scroll:after");
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof performance === "undefined") {
      return;
    }
    if (typeof PerformanceObserver === "undefined") {
      return;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.name.startsWith("lumina:")) {
          continue;
        }
        if (entry.entryType === "measure") {
          const msg = `[perf] ${entry.name} ${entry.duration.toFixed(2)}ms`;
          console.info(msg);
          continue;
        }
        const timing = `${entry.name} +${entry.startTime.toFixed(2)}ms`;
        const msg = `[perf] ${timing}`;
        console.info(msg);
      }
    });
    observer.observe({ entryTypes: ["mark", "measure"], buffered: true });
    return () => observer.disconnect();
  }, []);

  // 首次加载检查（仅 Chat 模式需要）
  useEffect(() => {
    if (chatMode === "chat") {
      checkChatFirstLoad();
    }
  }, [chatMode, checkChatFirstLoad]);

  // 点击外部关闭临时菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-skill-menu]') && !target.closest('textarea')) {
        setShowSkillMenu(false);
      }
      if (!target.closest('[data-mention-menu]') && !target.closest('textarea')) {
        setShowMention(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showMention || !mentionRef.current) return;
    const selected = mentionRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [showMention, mentionIndex]);

  // 监听文件拖拽事件，支持从文件树拖拽文件引用到 AI 对话框
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleLuminaDrop = (e: Event) => {
      const { filePath, fileName, x, y } = (e as CustomEvent).detail;
      if (!filePath || !fileName) return;
      
      // 检查拖拽位置是否在 AI 对话框区域内
      const container = chatContainerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      
      // 添加文件引用（避免重复）
      setReferencedFiles(prev => {
        if (prev.some(f => f.path === filePath)) return prev;
        return [...prev, { path: filePath, name: fileName, isFolder: false }];
      });
      
      // 聚焦输入框
      textareaRef.current?.focus();
    };
    
    window.addEventListener('lumina-drop', handleLuminaDrop);
    return () => window.removeEventListener('lumina-drop', handleLuminaDrop);
  }, []);

  useEffect(() => {
    const handleAppendInput = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text?.trim();
      if (!text) {
        return;
      }
      setInput((prev) => (prev ? `${prev}\n\n${text}` : text));
      textareaRef.current?.focus();
    };

    window.addEventListener('ai-input-append', handleAppendInput as EventListener);
    return () => window.removeEventListener('ai-input-append', handleAppendInput as EventListener);
  }, []);

  useEffect(() => {
    if (pendingInputAppends.length === 0) {
      return;
    }
    setInput((prev) => {
      const appended = pendingInputAppends.join("\n\n");
      return prev ? `${prev}\n\n${appended}` : appended;
    });
    consumeInputAppends();
    textareaRef.current?.focus();
  }, [pendingInputAppends, consumeInputAppends]);

  // 检测输入是否仅仅是一个网页链接
  const isOnlyWebLink = useCallback((text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    
    // 检查是否包含空格（多个单词则不是链接）
    if (trimmed.includes(' ')) return null;
    
    let url = trimmed;
    
    // 情况1: 已经是完整的 URL (http:// 或 https://)
    if (/^https?:\/\//.test(url)) {
      return url;
    }
    
    // 情况2: www. 开头
    if (/^www\./.test(url)) {
      return 'https://' + url;
    }
    
    // 情况3: 域名格式 (例如 baidu.com, google.com, example.co.uk)
    // 支持带路径的 URL (例如 baidu.com/search?q=test)
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+/.test(url)) {
      return 'https://' + url;
    }
    
    return null;
  }, []);


  const allFiles = useMemo(() => flattenFileTreeToReferences(fileTree), [fileTree]);

  const filteredMentionFiles = useMemo(
    () => filterMentionFiles(allFiles, mentionQuery),
    [allFiles, mentionQuery],
  );

  const [showMessages, setShowMessages] = useState(hasStarted);
  useEffect(() => {
    if (!hasStarted) {
      setShowMessages(false);
      return;
    }
    if (reduceMotion) {
      setShowMessages(true);
      return;
    }
    const id = requestAnimationFrame(() => {
      setShowMessages(true);
    });
    return () => cancelAnimationFrame(id);
  }, [hasStarted, reduceMotion]);

  const handleInputChange = useCallback((value: string, cursorPos?: number) => {
    setInput(value);
    const effectiveCursor = cursorPos ?? value.length;
    const mention = parseMentionQueryAtCursor(value, effectiveCursor);
    if (mention !== null) {
      setShowMention(true);
      setMentionQuery(mention);
      setMentionIndex(0);
      setShowSkillMenu(false);
      setSkillQuery("");
      return;
    }

    setShowMention(false);
    setMentionQuery("");
    setMentionIndex(0);

    if (chatMode !== "agent") {
      setSkillQuery("");
      setShowSkillMenu(false);
      return;
    }
    const textBeforeCursor = value.slice(0, effectiveCursor);
    const match = textBeforeCursor.match(/(?:^|\s)\/([^\s]*)$/);
    if (match) {
      setSkillQuery(match[1] ?? "");
      setShowSkillMenu(true);
    } else {
      setSkillQuery("");
      setShowSkillMenu(false);
    }
  }, [chatMode]);

  const handleSelectMention = useCallback((file: ReferencedFile) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (!atMatch) return;

    const atPos = cursorPos - atMatch[0].length;
    const nextValue = input.slice(0, atPos) + textAfterCursor;
    setInput(nextValue);
    setShowMention(false);
    setMentionQuery("");
    setMentionIndex(0);

    setReferencedFiles((prev) => (
      prev.some((f) => f.path === file.path) ? prev : [...prev, file]
    ));

    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input]);

  const handleSelectSkill = useCallback(async (skill: Parameters<typeof _handleSelectSkill>[0]) => {
    await _handleSelectSkill(skill);
    setInput((prev) =>
      prev.replace(/(?:^|\s)\/[^\s]*$/, (match) => (match.startsWith(" ") ? " " : ""))
    );
  }, [_handleSelectSkill]);

  // 发送消息
  const handleSend = useCallback(async (overrideInput?: string) => {
    const finalizePerf = () => {
      if (!import.meta.env.DEV || typeof performance === "undefined") {
        return;
      }
      performance.mark("lumina:send:done");
      performance.measure("lumina:send:total", "lumina:send:start", "lumina:send:done");
      performance.measure("lumina:send:process", "lumina:send:start", "lumina:send:processed");
      performance.measure("lumina:send:dispatch", "lumina:send:processed", "lumina:send:done");
    };
    if (import.meta.env.DEV && typeof performance !== "undefined") {
      performance.mark("lumina:send:start");
    }
    if (isExportSelectionMode) {
      return;
    }
    if (chatMode === "codex") {
      return;
    }
    const fallbackMessage = autoSendMessageRef.current?.trim() ?? "";
    const overrideMessage = overrideInput?.trim() ?? "";
    const effectiveInput = overrideMessage || input.trim() || fallbackMessage;
    const shouldBlockForLoading = chatMode !== "agent" && isLoading;
    if (
      (!effectiveInput && referencedFiles.length === 0 && textSelections.length === 0)
      || shouldBlockForLoading
      || isAgentWaitingApproval
    ) {
      return;
    }

    // 检查是否仅仅是一个网页链接
    const webLink = isOnlyWebLink(effectiveInput);
    if (webLink && referencedFiles.length === 0 && textSelections.length === 0) {
      // 直接打开网页链接
      const { openWebpageTab } = useFileStore.getState();
      openWebpageTab(webLink);
      setInput("");
      autoSendMessageRef.current = null;
      return;
    }

    const message = effectiveInput;
    setInput("");
    autoSendMessageRef.current = null;
    const files = [...referencedFiles];
    const quotedSelections = [...textSelections];
    setReferencedFiles([]);
    clearTextSelections();
    setShowMention(false);
    setMentionQuery("");
    setMentionIndex(0);
    setShowSkillMenu(false);

    const { displayMessage, fullMessage, attachments } = await processMessageWithFiles(message, files, quotedSelections);
    if (import.meta.env.DEV && typeof performance !== "undefined") {
      performance.mark("lumina:send:processed");
    }

    if (chatMode === "agent") {
      // 使用 Rust Agent
      await rustStartTask(fullMessage, {
        workspace_path: vaultPath || "",
        active_note_path: currentFile || undefined,
        active_note_content: currentFile ? currentContent : undefined,
        display_message: displayMessage,
        attachments,
        skills: selectedSkills.length > 0 ? selectedSkills : undefined,
      });
      setSelectedSkills([]);
      finalizePerf();
    } else {
      const currentFileInfo = currentFile ? {
        path: currentFile,
        name: currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "",
        content: currentContent,
      } : undefined;
      await sendMessageStream(fullMessage, currentFileInfo, displayMessage, undefined, attachments);
      finalizePerf();
    }
  }, [input, chatMode, isLoading, isAgentWaitingApproval, vaultPath, currentFile, currentContent, referencedFiles, textSelections, clearTextSelections, rustStartTask, sendMessageStream, isOnlyWebLink, config, selectedSkills, isExportSelectionMode]);

  const handleSendRef = useRef(handleSend);
  useLayoutEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const autoSendRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const autoSendEnabled =
      localStorage.getItem("lumina_debug_auto_send") === "1" ||
      import.meta.env.VITE_LUMINA_DEBUG_AUTO_SEND === "1";
    if (!autoSendEnabled || autoSendRef.current) {
      return;
    }
    if (chatMode === "codex") {
      return;
    }
    autoSendRef.current = true;
    handleNewChat();
    autoSendMessageRef.current = t.ai.performanceDebugMessage;
    setInput(t.ai.performanceDebugMessage);
    setTimeout(() => {
      handleSendRef.current(t.ai.performanceDebugMessage);
    }, 200);
  }, [chatMode, handleNewChat, t]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 输入法组合期间，忽略所有快捷键（如 Enter 确认候选词）
    if (isIMEComposing(e)) return;

    if (showMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredMentionFiles.length > 0) {
          setMentionIndex((idx) => (idx + 1) % filteredMentionFiles.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredMentionFiles.length > 0) {
          setMentionIndex((idx) => (idx - 1 + filteredMentionFiles.length) % filteredMentionFiles.length);
        }
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && filteredMentionFiles.length > 0) {
        e.preventDefault();
        handleSelectMention(filteredMentionFiles[mentionIndex] ?? filteredMentionFiles[0]);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMention(false);
        return;
      }
    }

    if (showSkillMenu && chatMode === "agent") {
      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredSkills.length > 0) {
          handleSelectSkill(filteredSkills[0]);
        } else {
          setShowSkillMenu(false);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSkillMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 停止生成
  const handleStop = useCallback(() => {
    if (chatMode === "agent") {
      agentAbort();
    } else if (chatMode === "chat") {
      stopStreaming();
    }
  }, [chatMode, agentAbort, stopStreaming]);


  const resolveCreatedFilePath = useCallback((path: string): string => {
    const cleaned = path.trim().replace(/^["'`](.*)["'`]$/, "$1");
    return resolve(vaultPath || "", cleaned);
  }, [vaultPath]);

  // 从消息历史中提取创建/编辑的文件
  const extractCreatedFiles = useCallback((): string[] => {
    if (chatMode !== "agent") return [];

    const uniqueFiles = new Map<string, string>();
    const addFile = (candidate: unknown) => {
      if (typeof candidate !== "string" || !candidate.trim()) return;
      const resolvedPath = resolveCreatedFilePath(candidate);
      const dedupKey = resolvedPath
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "");
      if (!uniqueFiles.has(dedupKey)) {
        uniqueFiles.set(dedupKey, resolvedPath);
      }
    };

    for (const msg of messages) {
      if (msg.role !== "tool") continue;
      const content = getTextFromContent(msg.content).trim();
      const match = content.match(/^(?:🔧|✅|❌)\s+(\w+):\s*(.+)$/s);
      if (!match) continue;
      const toolName = match[1];
      const payload = match[2].trim();
      if (toolName !== "write" && toolName !== "edit") continue;

      if (payload.startsWith("{") || payload.startsWith("[")) {
        try {
          const parsed = JSON.parse(payload) as
            | Record<string, unknown>
            | Array<Record<string, unknown>>;
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            addFile(item.filePath);
            addFile(item.file_path);
            addFile(item.path);
            addFile(item.file);
            if (Array.isArray(item.paths)) {
              item.paths.forEach(addFile);
            } else {
              addFile(item.paths);
            }
          }
          continue;
        } catch {
          // Fallback to regex parsing below.
        }
      }

      // 兼容非 JSON 参数格式（如 filePath: xxx 或 <path>xxx</path>）
      const fieldMatch = payload.match(/(?:filePath|file_path|path|file)\s*[:=]\s*["']?([^"'\n|]+)["']?/i);
      if (fieldMatch?.[1]) {
        addFile(fieldMatch[1]);
      }
      const tagMatch = payload.match(/<path>([^<]+)<\/path>/i);
      if (tagMatch?.[1]) {
        addFile(tagMatch[1]);
      }
    }
    return [...uniqueFiles.values()];
  }, [messages, chatMode, resolveCreatedFilePath]);


  return (
    <div ref={chatContainerRef} className="h-full bg-background text-foreground flex flex-col overflow-hidden relative">
      {/* Toolbar */}
      <ChatToolbar
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        isConversationMode={isConversationMode}
        isExportSelectionMode={isExportSelectionMode}
        isLoading={isLoading}
        exportCandidates={exportCandidates}
        onStartExportSelection={handleStartExportSelection}
        onCancelExportSelection={handleCancelExportSelection}
        onNewChat={handleNewChat}
        agentTokens={rustTotalTokens}
        chatTokens={chatTotalTokens}
        renderModeToggle={(className) => <ModeToggle className={className} />}
      />

      <div className="flex-1 relative overflow-hidden">
        {/* Chat history sidebar */}
        <AnimatePresence>
          {showHistory && (
            <ChatHistorySidebar
              allSessions={allSessions}
              isCurrentSession={isCurrentSession}
              onSwitchSession={handleSwitchSession}
              onDeleteSession={handleDeleteSession}
              onClose={() => setShowHistory(false)}
            />
          )}
        </AnimatePresence>

        {/* 主要内容区域 - 始终居中 */}
        <main className="h-full w-full flex flex-col overflow-hidden min-h-0 min-w-0">
          {isCodexMode ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 flex overflow-hidden min-h-0">
                <CodexPanelSlot slot="main" renderMode="iframe" className="flex-1 h-full w-full" />
              </div>
            </div>
          ) : (
            <>

          <WelcomeGreeting hasStarted={hasStarted} />

          {/* 消息列表区域 (对话模式) */}
          <div
            className="w-full min-h-0 scrollbar-thin"
            style={{
              flexBasis: 0,
              flexGrow: hasStarted ? 1 : 0,
              opacity: hasStarted ? 1 : 0,
              pointerEvents: hasStarted ? "auto" : "none",
              overflowY: hasStarted ? "auto" : "hidden",
              transition: reduceMotion
                ? "none"
                : "flex-grow 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out",
            }}
          >
              <motion.div
                className="max-w-3xl mx-auto px-4 pt-8"
                initial={false}
                animate={
                  reduceMotion
                    ? { opacity: 1, y: 0 }
                    : showMessages
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 6 }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                }
              >

                {/* Agent 模式：任务计划卡片 + 消息渲染 */}
                {chatMode === "agent" && !isExportSelectionMode && rustCurrentPlan && rustCurrentPlan.steps.length > 0 && (
                  <PlanCard
                    plan={rustCurrentPlan}
                    currentStage={rustCurrentStage}
                    fallbackReason={rustOrchestrationFallbackReason}
                    className="mb-4"
                  />
                )}

                {isExportSelectionMode ? (
                  <>
                    <div className="mb-4 rounded-xl border border-border/60 bg-card/70 px-3 py-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t.ai.exportSelectedCount.replace("{count}", String(selectedExportIds.length))}
                      </span>
                      <button
                        onClick={handleToggleSelectAllExportMessages}
                        className="px-2 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 transition-colors"
                      >
                        {allExportSelected ? t.ai.exportUnselectAll : t.ai.exportSelectAll}
                      </button>
                      <button
                        onClick={handleExportSelectedMessages}
                        disabled={selectedExportIds.length === 0 || isExportingConversation}
                        className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExportingConversation ? t.ai.exporting : t.ai.exportConfirm}
                      </button>
                      <button
                        onClick={handleCancelExportSelection}
                        className="px-2 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 transition-colors"
                      >
                        {t.ai.exportCancel}
                      </button>
                    </div>

                    <SelectableConversationList
                      messages={exportCandidates}
                      selectedIds={selectedExportIdSet}
                      onToggleMessage={handleToggleExportMessage}
                      emptyText={t.ai.exportNoMessages}
                      roleLabels={{
                        user: t.ai.exportRoleUser,
                        assistant: t.ai.exportRoleAssistant,
                      }}
                    />
                  </>
                ) : chatMode === "agent" ? (
                  <AgentMessageRenderer
                    messages={agentMessages}
                    isRunning={agentStatus === "running"}
                    llmRequestStartTime={llmRequestStartTime}
                    onRetryTimeout={retryTimeout}
                  />
                ) : (
                  /* Chat 模式：原有的消息渲染 */
                  chatMessages.map((msg, idx) => {
                    const isUser = msg.role === "user";
                    const assistantDiagramPaths = isUser ? [] : (chatAssistantDiagramPathsByIndex.get(idx) || []);
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mb-6 flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isUser && (
                          <div className="w-8 h-8 rounded-full bg-background border border-border/60 flex items-center justify-center shrink-0">
                            <Bot size={16} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className={`max-w-[80%] ${isUser
                            ? "bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5"
                            : "text-foreground"
                          }`}>
                          {isUser ? (
                            (() => {
                              const { text: userText, attachments } = getUserMessageDisplay(msg.content, msg.attachments);
                              const images = getImagesFromContent(msg.content);
                              return (
                                <UserMessageBubbleContent
                                  text={userText}
                                  attachments={attachments}
                                  images={images}
                                />
                              );
                            })()
                          ) : (
                            (() => {
                              const assistantParts = parseChatAssistantParts(getTextFromContent(msg.content));
                              return (
                                <div className="space-y-2">
                                  {assistantDiagramPaths.length > 0 && (
                                    <AssistantDiagramPanels filePaths={assistantDiagramPaths} className="mb-3" />
                                  )}
                                  {assistantParts.map((part, partIdx) => {
                                    if (part.type === "thinking") {
                                      return (
                                        <ThinkingCollapsible
                                          key={`${idx}-thinking-${partIdx}`}
                                          thinking={part.content}
                                          t={t}
                                        />
                                      );
                                    }

                                    return (
                                      <div
                                        key={`${idx}-text-${partIdx}`}
                                        className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(part.content) }}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}

                {/* 创建/编辑的文件链接 */}
                {!isExportSelectionMode && chatMode === "agent" && agentStatus !== "running" && (() => {
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
                            onClick={() => openFile(file)}
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
                {!isExportSelectionMode && chatMode === "agent" && pendingTool && agentStatus === "waiting_approval" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 max-w-[80%]"
                  >
                    <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-warning mb-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="font-medium text-sm">{t.ai.needApproval}</span>
                      </div>
                      <div className="text-sm text-foreground mb-3">
                        <p className="mb-1">
                          {t.ai.tool}: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{pendingTool.name}</code>
                        </p>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                          {JSON.stringify(pendingTool.params, null, 2)}
                        </pre>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={approve}
                          className="flex items-center gap-1 px-3 py-1.5 bg-success hover:bg-success/90 text-success-foreground text-sm rounded-lg transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          {t.ai.approve}
                        </button>
                        <button
                          onClick={reject}
                          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-lg transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {t.ai.reject}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 流式输出 - Agent 和 Chat 模式统一使用 StreamingOutput 组件 */}
                {!isExportSelectionMode && (chatMode === "agent" || chatMode === "chat") && (
                  <StreamingOutput mode={chatMode} />
                )}

                {/* Agent 错误提示 */}
                {chatMode === "agent" && agentStatus === "error" && (
                  <div className="text-sm text-destructive p-2 bg-destructive/10 rounded mb-4">
                    {_rustError || t.ai.errorRetry}
                  </div>
                )}

                {/* Chat 错误提示 */}
                {chatMode === "chat" && chatError && (
                  <div className="text-sm text-destructive p-2 bg-destructive/10 rounded mb-4">
                    {chatError}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </motion.div>
          </div>

          {/* 输入框容器 */}
          {!isCodexMode && (
          <div className={`w-full shrink-0 ${hasStarted ? "pb-4" : ""}`}>
            {!isExportSelectionMode && chatMode === "agent" && (agentQueueCount > 0 || rustActiveTaskPreview || (llmRetryState && agentStatus === "running")) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-3xl mx-auto px-4 mb-2"
              >
                <div className="bg-muted/50 border border-border/60 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <span>{t.ai.agentQueueTitle}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {t.ai.agentQueuePending.replace("{count}", String(agentQueueCount))}
                    </span>
                  </div>
                  {rustActiveTaskPreview && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {t.ai.agentQueueCurrent}: <span className="text-foreground">{rustActiveTaskPreview}</span>
                    </p>
                  )}
                  {agentQueueCount > 0 && (
                    <div className="space-y-1">
                      {rustQueuedTasks.slice(0, 3).map((item) => (
                        <div key={item.id} className="text-xs text-muted-foreground truncate">
                          #{item.position} {item.task}
                        </div>
                      ))}
                    </div>
                  )}
                  {isAgentWaitingApproval && (
                    <p className="text-xs text-warning mt-2">
                      {t.ai.agentQueueWaitingApprovalHint}
                    </p>
                  )}
                  {llmRetryState && agentStatus === "running" && (
                    <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                      <p className="font-medium">
                        {t.ai.agentRetryTitle}
                        {" "}
                        {t.ai.agentRetryAttempt
                          .replace('{attempt}', String(llmRetryState.attempt))
                          .replace('{max}', String(llmRetryState.maxRetries))}
                      </p>
                      <p className="mt-0.5 text-warning/90">
                        {t.ai.agentRetryReason}: {llmRetryState.reason}
                      </p>
                      <p className="mt-0.5">
                        {t.ai.agentRetryIn.replace('{seconds}', String(retrySecondsLeft ?? 0))}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            <motion.div
              className="w-full max-w-3xl mx-auto px-4"
              initial={false}
              animate={
                reduceMotion
                  ? { opacity: 1, y: 0, scale: 1 }
                  : {
                      opacity: 1,
                      y: hasStarted ? 0 : 10,
                      scale: hasStarted ? 1 : 1.01,
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <motion.div
                className={`bg-background rounded-[24px] shadow-lg border border-border/60 transition-shadow duration-300 ${hasStarted ? "shadow-md" : "shadow-xl"
                  }`}
              >
                {/* 输入文本区域 */}
                <div className="p-4 pb-2 relative">
                  {chatMode === "agent" && showSkillMenu && (
                    <div
                      data-skill-menu
                      className="absolute left-4 right-4 bottom-full mb-2 bg-background border border-border/60 rounded-lg shadow-lg z-50 overflow-hidden"
                    >
                      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60 flex items-center justify-between">
                        <span>{t.ai.skillsTitle}</span>
                        {skillsLoading && <span className="text-[10px]">{t.ai.skillsLoading}</span>}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {filteredSkills.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                            {t.ai.skillsEmpty}
                          </div>
                        ) : (
                          filteredSkills.map((skill) => (
                            <button
                              key={`${skill.source ?? "skill"}:${skill.name}`}
                              onClick={() => handleSelectSkill(skill)}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                            >
                              <div className="font-medium text-foreground">{skill.title}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {skill.description || skill.name}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {showMention && (
                    <div
                      ref={mentionRef}
                      data-mention-menu
                      className="absolute left-4 w-72 bottom-full mb-2 bg-background border border-border/60 rounded-lg shadow-lg z-50 overflow-hidden"
                    >
                      <div className="max-h-56 overflow-y-auto">
                        {filteredMentionFiles.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                            {t.ai.noFilesFound}
                          </div>
                        ) : (
                          filteredMentionFiles.map((file, index) => (
                            <button
                              key={file.path}
                              data-selected={index === mentionIndex}
                              onClick={() => handleSelectMention(file)}
                              className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors ${
                                index === mentionIndex ? "bg-accent" : ""
                              }`}
                            >
                              <FileText size={14} className="text-slate-500 shrink-0" />
                              <span className="truncate">{file.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart)}
                    onKeyDown={handleKeyDown}
                    placeholder={chatMode === "agent" ? t.ai.agentInputPlaceholder : t.ai.chatInputPlaceholder}
                    className="w-full resize-none outline-none text-foreground placeholder:text-muted-foreground placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis min-h-[40px] max-h-[200px] bg-transparent text-base leading-relaxed"
                    rows={1}
                    autoFocus
                  />
                </div>

                {/* 已选中的 skills */}
                {chatMode === "agent" && selectedSkills.length > 0 && (
                  <div className="px-4 pt-1 flex flex-wrap gap-1">
                    {selectedSkills.map((skill) => (
                      <div
                        key={`selected-${skill.name}`}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-700 rounded-md text-xs"
                      >
                        <span className="font-medium">{skill.title}</span>
                        <button
                          onClick={() => setSelectedSkills((prev) => prev.filter((s) => s.name !== skill.name))}
                          className="hover:bg-emerald-500/20 rounded p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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

                {textSelections.length > 0 && (
                  <div className="px-4 pt-2 flex flex-wrap gap-1">
                    {textSelections.map((selection) => (
                      <div
                        key={selection.id}
                        className="flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded-md text-xs max-w-[280px]"
                        title={selection.text}
                      >
                        <Quote size={12} className="shrink-0" />
                        <span className="truncate">
                          {selection.summary || selection.text.slice(0, 36)}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          ({selection.locator || selection.source})
                        </span>
                        <button
                          onClick={() => removeTextSelection(selection.id)}
                          className="hover:bg-accent/80 rounded p-0.5 shrink-0"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 底部工具栏 */}
                <div className="ai-toolbar-row px-4 pb-3 pt-1 flex items-center justify-between">
                  <div className="ai-toolbar-left flex items-center gap-2 min-w-0 overflow-hidden">
                    {/* Chat/Agent/Codex 切换滑块 */}
                    {<ModeToggle />}

                    {/* 设置按钮：紧挨着模式切换的小齿轮，打开 AI 对话设置 */}
                    <button
                      onClick={() => setShowSettings(true)}
                      className="ml-1 flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={t.ai.aiChatSettings}
                    >
                      <Settings size={14} />
                    </button>

                    {/* Skills 管理入口 */}
                    <button
                      onClick={() => setSkillManagerOpen(true)}
                      className="ml-1 flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={t.ai.skillsManagerTitle}
                    >
                      <Sparkles size={14} />
                    </button>
                    
                    {/* 调试模式按钮：仅在 Agent 模式下显示（开发模式） */}
                    {import.meta.env.DEV && chatMode === "agent" && (
                      <button
                        onClick={() => {
                          if (debugEnabled) {
                            disableDebug();
                          } else {
                            enableDebug(vaultPath || ".");
                          }
                        }}
                        className={`ml-1 flex items-center justify-center p-1.5 rounded-md transition-colors ${
                          debugEnabled 
                            ? "text-warning bg-warning/10"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        title={debugEnabled ? t.ai.debugEnabled.replace('{path}', debugLogPath || '') : t.ai.debugEnable}
                      >
                        <Bug size={14} />
                      </button>
                    )}

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
                      className={`p-2 rounded-full transition-all duration-200 ${isRecording
                          ? "bg-destructive/20 text-destructive"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      title={isRecording ? t.ai.stopVoice : t.ai.startVoice}
                    >
                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>

                    {/* 发送/停止按钮 */}
                    {(() => {
                      const hasPayload = Boolean(input.trim() || referencedFiles.length > 0 || textSelections.length > 0);
                      const queueSend = chatMode === "agent" && agentStatus === "running" && hasPayload;
                      const stopCurrent = isLoading && !queueSend;
                      const disabled = (isAgentWaitingApproval || (!hasPayload && !stopCurrent));
                      return (
                        <button
                          onClick={() => {
                            if (queueSend) {
                              void handleSend();
                              return;
                            }
                            if (stopCurrent) {
                              handleStop();
                              return;
                            }
                            void handleSend();
                          }}
                          disabled={disabled}
                          title={queueSend ? t.ai.sendToQueue : stopCurrent ? t.ai.stop : t.ai.send}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${stopCurrent
                              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              : hasPayload
                                ? "bg-foreground text-background hover:opacity-80 shadow-md"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                            }`}
                        >
                          {stopCurrent ? (
                            <Square size={12} fill="currentColor" />
                          ) : (
                            <ArrowUp size={16} strokeWidth={3} />
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {/* 底部提示/思考模式栏（统一区域） */}
                <div className="bg-muted/30 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {supportsThinkingMode && (
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.aiSettings.thinkingMode}
                        </label>
                        <select
                          value={displayThinkingMode}
                          onChange={(e) => setConfig({ thinkingMode: e.target.value as ThinkingMode })}
                          className="h-7 min-w-[108px] text-xs px-2 rounded-md border border-border/60 bg-background"
                        >
                          <option value="auto">{t.aiSettings.thinkingModeAuto}</option>
                          <option value="thinking">{t.aiSettings.thinkingModeThinking}</option>
                          <option value="instant">{t.aiSettings.thinkingModeInstant}</option>
                        </select>
                      </div>
                    )}
                    <span className="min-w-0 flex-1 text-right">
                      {hasStarted ? t.ai.aiGeneratedWarning : t.ai.getRealtimeContent}
                    </span>
                  </div>
                </div>

                {/* AI 对话设置面板：使用悬浮窗口 */}
                <AISettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

              </motion.div>
            </motion.div>
          </div>
          )}

          {!isCodexMode && (
            <WelcomeSuggestions hasStarted={hasStarted} onSetInput={setInput} currentFile={currentFile} recentFiles={recentFiles} fileTree={fileTree} />
          )}
            </>
          )}
        </main>

        {/* 调试按钮（开发模式） */}
        {import.meta.env.DEV && (
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg hover:bg-orange-600 transition-colors text-xs font-bold"
            title={t.ai.debugPanel}
          >
            🐛
          </button>
        )}

        {/* 调试面板（开发模式） */}
        {import.meta.env.DEV && showDebug && (() => {
          // 获取完整消息（包含 system prompt）
          const fullMessages = rustAgentMessages;  // Rust Agent 消息

          return (
            <div className="fixed inset-4 z-50 bg-background/95 backdrop-blur border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/50">
                <h2 className="font-bold text-lg">🐛 {t.ai.agentDebugPanel} (🦀 Rust)</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t.ai.mode}: {chatMode} | {t.ai.status}: {agentStatus} | {t.ai.fullMsgsCount}: {fullMessages.length} | {t.ai.displayMsgsCount}: {agentMessages.length}
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
                {debugPromptStack && (
                  <div className="p-3 rounded-lg border bg-muted/30 border-border/60 mb-4 space-y-3">
                    <div className="font-bold text-muted-foreground flex items-center gap-2">
                      <span>🧠 Prompt Stack</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-info/20 text-info">
                        {debugPromptStack.provider}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(debugPromptStack.receivedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {[
                      { label: "Base System", content: debugPromptStack.baseSystem },
                      { label: "System Prompt", content: debugPromptStack.systemPrompt },
                      { label: "Role Prompt", content: debugPromptStack.rolePrompt },
                      { label: "Built-in Agent", content: debugPromptStack.builtInAgent },
                      { label: "Workspace Agent", content: debugPromptStack.workspaceAgent },
                      { label: "Skills Index", content: debugPromptStack.skillsIndex || "(none)" },
                    ].map((section) => (
                      <div key={section.label} className="rounded border border-border/70 bg-background/70">
                        <div className="px-2 py-1 border-b border-border/70 flex items-center justify-between">
                          <span className="font-semibold text-[11px]">{section.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {section.content.length} chars
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-foreground/90 p-2 max-h-[220px] overflow-auto">
                          {section.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* 意图识别调试信息 */}
                <div className="p-3 rounded-lg border bg-muted/30 border-border/60 mb-4">
                  {(() => {
                    // 使用 store 中的意图状态
                    const displayIntent = rustLastIntent;

                    return (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-muted-foreground flex items-center gap-2">
                            <span>🔍 {t.ai.intentResult}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-600">
                              🦀 Rust
                            </span>
                            {displayIntent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-success/20 text-success">
                                ✓ {t.ai.intentRecognized}
                              </span>
                            )}
                          </div>
                        </div>

                        {displayIntent ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-16 shrink-0">{t.ai.intentTypeLabel}</span>
                              <span className="font-bold text-foreground bg-background px-1 rounded border border-border/50">
                                {displayIntent.type}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-16 shrink-0">{t.ai.intentRouteLabel}</span>
                              <span className="text-foreground/80">
                                {'route' in displayIntent ? displayIntent.route : '-'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground italic opacity-70">
                            {t.ai.intentEmpty}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {fullMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${msg.role === "system"
                        ? "bg-purple-500/10 border-purple-500/30"
                        : msg.role === "user"
                          ? "bg-info/10 border-info/30"
                          : "bg-success/10 border-success/30"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${msg.role === "system"
                          ? "bg-purple-500 text-white"
                          : msg.role === "user"
                            ? "bg-info text-info-foreground"
                            : "bg-success text-success-foreground"
                        }`}>
                        {msg.role.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground">#{idx}</span>
                      <span className="text-muted-foreground">
                        {getTextFromContent(msg.content).length} chars
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-foreground/90 max-h-[600px] overflow-auto">
                      {getTextFromContent(msg.content)}
                    </pre>
                  </div>
                ))}
                {fullMessages.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    {t.ai.noMsgs}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
