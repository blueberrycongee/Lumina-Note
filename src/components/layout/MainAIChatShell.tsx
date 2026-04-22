import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import {
  useOpencodeAgent,
  initOpencodeAgentListeners,
} from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles } from "@/hooks/useChatSend";
import { resolve } from "@/lib/path";
import { isIMEComposing } from "@/lib/imeUtils";
import { createDir, saveFile, exists } from "@/lib/host";
import {
  ArrowUp,
  FileText,
  History,
  Plus,
  Paperclip,
  Quote,
  Sparkles,
  X,
  Square,
  Mic,
  MicOff,
  AlertCircle,
  Check,
  Settings,
  Lightbulb,
} from "lucide-react";
import { useSessionManagement } from "./hooks/useSessionManagement";
import { useSkillSearch } from "./hooks/useSkillSearch";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { ChatToolbar } from "./ChatToolbar";
import { WelcomeGreeting, WelcomeSuggestions } from "./WelcomeSection";
import { AgentMessageRenderer } from "../chat/AgentMessageRenderer";
import { StreamingOutput } from "../chat/StreamingMessage";
import { SelectableConversationList } from "../chat/SelectableConversationList";
import { getTextFromContent } from "../chat/messageContentUtils";
import {
  filterMentionFiles,
  flattenFileTreeToReferences,
  parseMentionQueryAtCursor,
} from "../chat/fileMentionUtils";
import type { ReferencedFile } from "@/hooks/useChatSend";
import { useShallow } from "zustand/react/shallow";
import { AISettingsModal } from "../ai/AISettingsModal";
import { join as joinPath } from "@/lib/host";
import {
  buildAgentExportMessages,
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

export function MainAIChatShell() {
  const { t } = useLocaleStore();
  const { setSkillManagerOpen, toggleLeftSidebar, toggleRightSidebar } = useUIStore();
  // chatMode is always "agent" now (codex moved to plugin system)
  const chatMode = "agent" as const;
  const isCodexMode = false;
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
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

  // Auto-resize textarea to fit content.
  //
  // Only pin a height when the textarea actually has text. An empty textarea
  // falls back to its CSS `rows={1}` resting height so a placeholder that
  // wrapped during initial layout (container width not yet stable, fallback
  // font not yet swapped to the final one) can't leak into a pinned height
  // that the user then sees as a "giant chunky input box" on cold start.
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (el.value.length === 0) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    autoResizeTextarea();
  }, [input, autoResizeTextarea]);

  // Re-measure after fonts finish loading (first paint's fallback font has
  // different metrics) and whenever the textarea's width changes (sidebar
  // toggles, window resize, or the welcome-section spacer settling in).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const scheduleResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        autoResizeTextarea();
      });
    };

    const ro = new ResizeObserver(scheduleResize);
    ro.observe(el);

    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(scheduleResize).catch(() => undefined);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [autoResizeTextarea]);

  // Extracted hooks
  const {
    allSessions,
    handleSwitchSession: _sessionSwitch,
    handleDeleteSession,
    isCurrentSession,
    handleNewChat: _sessionNewChat,
    rustSessionId,
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

  // ========== Rust Agent ==========
  const {
    status: agentStatus,
    messages: rustAgentMessages,
    error: _rustError,
    startTask: rustStartTask,
    abort: agentAbort,
    pendingTool: rustPendingTool,
    approveTool: approve,
    rejectTool: reject,
    queuedTasks: rustQueuedTasks,
    activeTaskPreview: rustActiveTaskPreview,
    debugPromptStack,
    llmRequestStartTime,
    llmRetryState,
    retryTimeout,
  } = useOpencodeAgent();

  // 初始化 Rust Agent 事件监听器
  useEffect(() => {
    initOpencodeAgentListeners();
  }, []);

  // 工具审批 - 提取 tool 对象
  const pendingTool = rustPendingTool?.tool;
  const [retryNow, setRetryNow] = useState(Date.now());
  useEffect(() => {
    if (!llmRetryState || chatMode !== "agent" || agentStatus !== "running")
      return;
    const timer = window.setInterval(() => {
      setRetryNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [llmRetryState, chatMode, agentStatus]);
  const retrySecondsLeft =
    llmRetryState && chatMode === "agent" && agentStatus === "running"
      ? Math.max(0, Math.ceil((llmRetryState.nextRetryAt - retryNow) / 1000))
      : null;

  const agentMessages = useMemo(
    () => rustAgentMessages.map((msg) => ({ ...msg, content: msg.content })),
    [rustAgentMessages],
  );

  // AI store — config, text selections, and input appends (chat messages no longer used)
  const {
    config,
    setConfig,
    textSelections,
    removeTextSelection,
    clearTextSelections,
    pendingInputAppends,
    consumeInputAppends,
  } = useAIStore(
    useShallow((state) => ({
      config: state.config,
      setConfig: state.setConfig,
      textSelections: state.textSelections,
      removeTextSelection: state.removeTextSelection,
      clearTextSelections: state.clearTextSelections,
      pendingInputAppends: state.pendingInputAppends,
      consumeInputAppends: state.consumeInputAppends,
    })),
  );
  const effectiveModelForThinking =
    config.model === "custom" ? config.customModelId || "custom" : config.model;
  const supportsThinkingMode = supportsThinkingModeSwitch(
    config.provider as LLMProviderType,
    effectiveModelForThinking,
  );
  const displayThinkingMode = normalizeThinkingMode(config.thinkingMode);

  // Wrap session hooks with local state side effects
  const handleSwitchSession = useCallback(
    (id: string, type: "agent" | "chat") => {
      _sessionSwitch(id, type);
      setShowHistory(false);
    },
    [_sessionSwitch],
  );

  const handleNewChat = useCallback(() => {
    setIsExportSelectionMode(false);
    setSelectedExportIds([]);
    setSelectedSkills([]);
    _sessionNewChat();
    setShowHistory(false);
  }, [_sessionNewChat, setSelectedSkills]);

  const {
    vaultPath,
    currentFile,
    currentContent,
    fileTree,
    recentFiles,
    openFile,
    refreshFileTree,
  } = useFileStore(
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

  const { isRecording, interimText, toggleRecording } = useSpeechToText(
    (text: string) => {
      setInput((prev) => (prev ? prev + " " + text : text));
    },
  );

  // 判断是否有对话历史（用于控制动画状态）
  const hasStarted = isCodexMode
    ? true
    : agentMessages.length > 0 || agentStatus === "error";

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
          "lumina:hasStarted:true",
        );
      } catch {
        // ignore missing marks
      }
    }
  }, [hasStarted]);

  // 获取当前消息列表（agent-only）
  const messages = agentMessages;

  // 判断是否正在加载
  const isLoading = agentStatus === "running";
  const isAgentWaitingApproval = agentStatus === "waiting_approval";
  const agentQueueCount = rustQueuedTasks.length;

  const isConversationMode = chatMode === "agent";
  const exportCandidates = useMemo<ExportMessage[]>(() => {
    if (chatMode !== "agent") return [];
    const normalizedMessages: RawConversationMessage[] = agentMessages.map(
      (message) => ({
        id: message.id,
        role: message.role as RawConversationMessage["role"],
        content: message.content,
      }),
    );
    return buildAgentExportMessages(normalizedMessages);
  }, [chatMode, agentMessages]);

  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );
  const allExportSelected =
    exportCandidates.length > 0 &&
    selectedExportIds.length === exportCandidates.length;

  const currentConversationTitle = useMemo(() => {
    const currentSession = allSessions.find(
      (s) => s.type === "agent" && s.id === rustSessionId,
    );
    return currentSession?.title || t.ai.conversation;
  }, [allSessions, rustSessionId, t.ai.conversation]);

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
    setSelectedExportIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const handleToggleSelectAllExportMessages = useCallback(() => {
    if (allExportSelected) {
      setSelectedExportIds([]);
      return;
    }
    setSelectedExportIds(exportCandidates.map((message) => message.id));
  }, [allExportSelected, exportCandidates]);

  const handleExportSelectedMessages = useCallback(async () => {
    if (
      !vaultPath ||
      selectedExportIds.length === 0 ||
      !isConversationMode ||
      isExportingConversation
    ) {
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

      const modeName = "agent";
      const markdown = buildConversationExportMarkdown({
        title: currentConversationTitle,
        modeLabel: `${t.ai.mode}: ${t.ai.modeAgent}`,
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
      let exportFilePath = await joinPath(
        exportDir,
        `${modeName}-${safeTitle}.md`,
      );
      while (await exists(exportFilePath)) {
        suffix += 1;
        exportFilePath = await joinPath(
          exportDir,
          `${modeName}-${safeTitle}-${suffix}.md`,
        );
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
      performance.measure(
        "lumina:scroll",
        "lumina:scroll:before",
        "lumina:scroll:after",
      );
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

  // Chat mode removed — no firstLoad check needed

  // 点击外部关闭临时菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-skill-menu]") && !target.closest("textarea")) {
        setShowSkillMenu(false);
      }
      if (
        !target.closest("[data-mention-menu]") &&
        !target.closest("textarea")
      ) {
        setShowMention(false);
      }
      if (!target.closest("[data-plus-menu]")) {
        setShowPlusMenu(false);
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
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        return;

      // 添加文件引用（避免重复）
      setReferencedFiles((prev) => {
        if (prev.some((f) => f.path === filePath)) return prev;
        return [...prev, { path: filePath, name: fileName, isFolder: false }];
      });

      // 聚焦输入框
      textareaRef.current?.focus();
    };

    window.addEventListener("lumina-drop", handleLuminaDrop);
    return () => window.removeEventListener("lumina-drop", handleLuminaDrop);
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

    window.addEventListener(
      "ai-input-append",
      handleAppendInput as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ai-input-append",
        handleAppendInput as EventListener,
      );
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

  const allFiles = useMemo(
    () => flattenFileTreeToReferences(fileTree),
    [fileTree],
  );

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

  const handleInputChange = useCallback(
    (value: string, cursorPos?: number) => {
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
    },
    [chatMode],
  );

  const handleSelectMention = useCallback(
    (file: ReferencedFile) => {
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

      setReferencedFiles((prev) =>
        prev.some((f) => f.path === file.path) ? prev : [...prev, file],
      );

      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [input],
  );

  const handleSelectSkill = useCallback(
    async (skill: Parameters<typeof _handleSelectSkill>[0]) => {
      await _handleSelectSkill(skill);
      setInput((prev) =>
        prev.replace(/(?:^|\s)\/[^\s]*$/, (match) =>
          match.startsWith(" ") ? " " : "",
        ),
      );
    },
    [_handleSelectSkill],
  );

  // 发送消息
  const handleSend = useCallback(
    async (overrideInput?: string) => {
      const finalizePerf = () => {
        if (!import.meta.env.DEV || typeof performance === "undefined") {
          return;
        }
        performance.mark("lumina:send:done");
        performance.measure(
          "lumina:send:total",
          "lumina:send:start",
          "lumina:send:done",
        );
        performance.measure(
          "lumina:send:process",
          "lumina:send:start",
          "lumina:send:processed",
        );
        performance.measure(
          "lumina:send:dispatch",
          "lumina:send:processed",
          "lumina:send:done",
        );
      };
      if (import.meta.env.DEV && typeof performance !== "undefined") {
        performance.mark("lumina:send:start");
      }
      if (isExportSelectionMode) {
        return;
      }
      const fallbackMessage = autoSendMessageRef.current?.trim() ?? "";
      const overrideMessage = overrideInput?.trim() ?? "";
      const effectiveInput = overrideMessage || input.trim() || fallbackMessage;
      if (
        (!effectiveInput &&
          referencedFiles.length === 0 &&
          textSelections.length === 0) ||
        isAgentWaitingApproval
      ) {
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

      const { displayMessage, fullMessage, attachments } =
        await processMessageWithFiles(message, files, quotedSelections);
      if (import.meta.env.DEV && typeof performance !== "undefined") {
        performance.mark("lumina:send:processed");
      }

      await rustStartTask(fullMessage, {
        workspace_path: vaultPath || "",
        active_note_path: currentFile || undefined,
        active_note_content: currentFile ? currentContent : undefined,
        display_message: displayMessage,
        attachments,
      });
      setSelectedSkills([]);
      finalizePerf();
    },
    [
      input,
      isLoading,
      isAgentWaitingApproval,
      vaultPath,
      currentFile,
      currentContent,
      referencedFiles,
      textSelections,
      clearTextSelections,
      rustStartTask,
      config,
      selectedSkills,
      isExportSelectionMode,
    ],
  );

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
    autoSendRef.current = true;
    handleNewChat();
    autoSendMessageRef.current = t.ai.performanceDebugMessage;
    setInput(t.ai.performanceDebugMessage);
    setTimeout(() => {
      handleSendRef.current(t.ai.performanceDebugMessage);
    }, 200);
  }, [handleNewChat, t]);

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
          setMentionIndex(
            (idx) =>
              (idx - 1 + filteredMentionFiles.length) %
              filteredMentionFiles.length,
          );
        }
        return;
      }
      if (
        (e.key === "Enter" || e.key === "Tab") &&
        filteredMentionFiles.length > 0
      ) {
        e.preventDefault();
        handleSelectMention(
          filteredMentionFiles[mentionIndex] ?? filteredMentionFiles[0],
        );
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
    agentAbort();
  }, [agentAbort]);

  const resolveCreatedFilePath = useCallback(
    (path: string): string => {
      const cleaned = path.trim().replace(/^["'`](.*)["'`]$/, "$1");
      return resolve(vaultPath || "", cleaned);
    },
    [vaultPath],
  );

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
      const fieldMatch = payload.match(
        /(?:filePath|file_path|path|file)\s*[:=]\s*["']?([^"'\n|]+)["']?/i,
      );
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
    <div
      ref={chatContainerRef}
      className="h-full bg-background text-foreground flex flex-col overflow-hidden relative"
    >
      {/* Toolbar */}
      <ChatToolbar
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        isExportSelectionMode={isExportSelectionMode}
        isLoading={isLoading}
        exportCandidates={exportCandidates}
        onStartExportSelection={handleStartExportSelection}
        onCancelExportSelection={handleCancelExportSelection}
        onNewChat={handleNewChat}
        onToggleLeftSidebar={toggleLeftSidebar}
        onToggleRightSidebar={toggleRightSidebar}
        title={currentConversationTitle}
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
          <WelcomeGreeting hasStarted={hasStarted} />

          {/* Spacer: push input + cards toward center when idle */}
          {!hasStarted && <div className="flex-1" />}

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
              {isExportSelectionMode ? (
                <>
                  <div className="mb-4 rounded-xl border border-border/60 bg-card/70 px-3 py-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t.ai.exportSelectedCount.replace(
                        "{count}",
                        String(selectedExportIds.length),
                      )}
                    </span>
                    <button
                      onClick={handleToggleSelectAllExportMessages}
                      className="px-2 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 transition-colors"
                    >
                      {allExportSelected
                        ? t.ai.exportUnselectAll
                        : t.ai.exportSelectAll}
                    </button>
                    <button
                      onClick={handleExportSelectedMessages}
                      disabled={
                        selectedExportIds.length === 0 ||
                        isExportingConversation
                      }
                      className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExportingConversation
                        ? t.ai.exporting
                        : t.ai.exportConfirm}
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
              ) : (
                <AgentMessageRenderer
                  messages={agentMessages}
                  isRunning={agentStatus === "running"}
                  llmRequestStartTime={llmRequestStartTime}
                  onRetryTimeout={retryTimeout}
                />
              )}

              {/* 创建/编辑的文件链接 */}
              {!isExportSelectionMode &&
                agentStatus !== "running" &&
                (() => {
                  const createdFiles = extractCreatedFiles();
                  if (createdFiles.length === 0) return null;

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.3,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="mb-5 flex gap-3"
                    >
                      <div className="w-7 h-7 shrink-0" />
                      <div className="flex flex-wrap gap-1.5">
                        {createdFiles.map((file) => (
                          <button
                            key={file}
                            onClick={() => openFile(file)}
                            className="group flex items-center gap-1.5 px-3 py-1.5 bg-primary/[0.07] hover:bg-primary/15 text-primary/80 hover:text-primary rounded-xl text-xs transition-all duration-200 border border-primary/10 hover:border-primary/25 hover:shadow-sm"
                          >
                            <FileText size={13} className="shrink-0" />
                            <span className="truncate max-w-[200px]">
                              {file.split(/[/\\]/).pop()}
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })()}

              {/* 工具审批 */}
              {!isExportSelectionMode &&
                pendingTool &&
                agentStatus === "waiting_approval" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-5 max-w-[85%]"
                  >
                    <div className="bg-warning/[0.06] backdrop-blur-sm border border-warning/20 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-warning mb-3">
                        <div className="w-6 h-6 rounded-full bg-warning/15 flex items-center justify-center">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-sm">
                          {t.ai.needApproval}
                        </span>
                      </div>
                      <div className="text-sm text-foreground mb-3">
                        <p className="mb-2 text-muted-foreground text-xs">
                          {t.ai.tool}:{" "}
                          <code className="px-1.5 py-0.5 bg-foreground/[0.06] border border-border/40 rounded-md text-xs font-mono text-foreground">
                            {pendingTool.name}
                          </code>
                        </p>
                        <pre className="p-3 bg-foreground/[0.03] border border-border/30 rounded-xl text-xs overflow-x-auto max-h-36 font-mono leading-relaxed">
                          {JSON.stringify(pendingTool.params, null, 2)}
                        </pre>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={approve}
                          className="flex items-center gap-1.5 px-4 py-2 bg-success/90 hover:bg-success text-success-foreground text-xs font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t.ai.approve}
                        </button>
                        <button
                          onClick={reject}
                          className="flex items-center gap-1.5 px-4 py-2 bg-foreground/[0.06] hover:bg-foreground/[0.1] text-foreground text-xs font-medium rounded-xl transition-all duration-200"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t.ai.reject}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

              {/* 流式输出 - Agent 和 Chat 模式统一使用 StreamingOutput 组件 */}
              {!isExportSelectionMode && chatMode === "agent" && (
                <StreamingOutput mode={chatMode} />
              )}

              {/* Agent 错误提示 */}
              {chatMode === "agent" && agentStatus === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 text-sm text-destructive/90 px-4 py-3 bg-destructive/[0.06] border border-destructive/15 rounded-xl mb-5"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">
                    {_rustError || t.ai.errorRetry}
                  </span>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </motion.div>
          </div>

          {/* 输入框容器 */}
          <div className={`w-full shrink-0 ${hasStarted ? "pb-4" : ""}`}>
            {!isExportSelectionMode &&
              (agentQueueCount > 0 ||
                rustActiveTaskPreview ||
                (llmRetryState && agentStatus === "running")) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="w-full max-w-3xl mx-auto px-4 mb-2"
                >
                  <div className="bg-foreground/[0.03] backdrop-blur-sm border border-border/40 rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <span>{t.ai.agentQueueTitle}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {t.ai.agentQueuePending.replace(
                          "{count}",
                          String(agentQueueCount),
                        )}
                      </span>
                    </div>
                    {rustActiveTaskPreview && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {t.ai.agentQueueCurrent}:{" "}
                        <span className="text-foreground">
                          {rustActiveTaskPreview}
                        </span>
                      </p>
                    )}
                    {agentQueueCount > 0 && (
                      <div className="space-y-1">
                        {rustQueuedTasks.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="text-xs text-muted-foreground truncate"
                          >
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
                          {t.ai.agentRetryTitle}{" "}
                          {t.ai.agentRetryAttempt
                            .replace("{attempt}", String(llmRetryState.attempt))
                            .replace("{max}", String(llmRetryState.maxRetries))}
                        </p>
                        <p className="mt-0.5 text-warning/90">
                          {t.ai.agentRetryReason}: {llmRetryState.reason}
                        </p>
                        <p className="mt-0.5">
                          {t.ai.agentRetryIn.replace(
                            "{seconds}",
                            String(retrySecondsLeft ?? 0),
                          )}
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
              {/* Tags area — above the pill, only when non-empty */}
              {(selectedSkills.length > 0 ||
                referencedFiles.length > 0 ||
                textSelections.length > 0) && (
                <div className="max-w-3xl mx-auto w-full mb-2 flex flex-wrap gap-1 px-2">
                  {selectedSkills.map((skill) => (
                    <div
                      key={`selected-${skill.name}`}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-xs"
                    >
                      <Sparkles size={11} className="shrink-0" />
                      <span className="font-medium">{skill.title}</span>
                      <button
                        onClick={() =>
                          setSelectedSkills((prev) =>
                            prev.filter((s) => s.name !== skill.name),
                          )
                        }
                        className="hover:bg-emerald-500/20 rounded-full p-0.5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {referencedFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs"
                    >
                      <FileText size={11} className="shrink-0" />
                      <span className="max-w-[120px] truncate">
                        {file.name}
                      </span>
                      <button
                        onClick={() =>
                          setReferencedFiles((files) =>
                            files.filter((f) => f.path !== file.path),
                          )
                        }
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {textSelections.map((selection) => (
                    <div
                      key={selection.id}
                      className="flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded-full text-xs max-w-[280px]"
                      title={selection.text}
                    >
                      <Quote size={11} className="shrink-0" />
                      <span className="truncate">
                        {selection.summary || selection.text.slice(0, 36)}
                      </span>
                      <button
                        onClick={() => removeTextSelection(selection.id)}
                        className="hover:bg-accent/80 rounded-full p-0.5 shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pill-shaped input bar */}
              <div
                className={`relative bg-background/80 backdrop-blur-xl border border-border/50 transition-all duration-300 ${
                  input.includes("\n") || input.length > 80
                    ? "rounded-3xl"
                    : "rounded-full"
                } ${
                  hasStarted
                    ? "shadow-sm shadow-black/[0.03]"
                    : "shadow-md shadow-black/[0.05]"
                }`}
              >
                {/* Popover menus — skill menu */}
                {showSkillMenu && (
                  <div
                    data-skill-menu
                    className="absolute left-12 right-12 bottom-full mb-2 bg-background/95 backdrop-blur-lg border border-border/40 rounded-xl shadow-lg shadow-black/[0.06] z-50 overflow-hidden"
                  >
                    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/40 flex items-center justify-between">
                      <span>{t.ai.skillsTitle}</span>
                      {skillsLoading && (
                        <span className="text-[10px]">
                          {t.ai.skillsLoading}
                        </span>
                      )}
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
                            <div className="font-medium text-foreground">
                              {skill.title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {skill.description || skill.name}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Popover menus — mention menu */}
                {showMention && (
                  <div
                    ref={mentionRef}
                    data-mention-menu
                    className="absolute left-12 w-72 bottom-full mb-2 bg-background/95 backdrop-blur-lg border border-border/40 rounded-xl shadow-lg shadow-black/[0.06] z-50 overflow-hidden"
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
                            <FileText
                              size={14}
                              className="text-slate-500 shrink-0"
                            />
                            <span className="truncate">{file.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* "+" popover menu */}
                {showPlusMenu && (
                  <div
                    data-plus-menu
                    className="absolute left-2 bottom-full mb-2 w-56 bg-background/95 backdrop-blur-lg border border-border/40 rounded-xl shadow-lg shadow-black/[0.06] z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        textareaRef.current?.focus();
                        handleInputChange(input + "@", input.length + 1);
                        setShowPlusMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        <Paperclip
                          size={16}
                          className="text-muted-foreground"
                        />
                        {"Reference file"}
                      </span>
                      <kbd className="text-[11px] text-muted-foreground">@</kbd>
                    </button>
                    <button
                      onClick={() => {
                        setSkillManagerOpen(true);
                        setShowPlusMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        <Sparkles size={16} className="text-muted-foreground" />
                        Skills
                      </span>
                      <kbd className="text-[11px] text-muted-foreground">/</kbd>
                    </button>
                    <div className="border-t border-border/30 my-0.5" />
                    {supportsThinkingMode && (
                      <div className="px-3 py-2 flex items-center justify-between">
                        <span className="flex items-center gap-2.5 text-sm">
                          <Lightbulb
                            size={16}
                            className="text-muted-foreground"
                          />
                          {t.aiSettings.thinkingMode}
                        </span>
                        <select
                          value={displayThinkingMode}
                          onChange={(e) =>
                            setConfig({
                              thinkingMode: e.target.value as ThinkingMode,
                            })
                          }
                          className="h-6 text-xs px-1.5 rounded-md border border-border/30 bg-background/80"
                        >
                          <option value="auto">
                            {t.aiSettings.thinkingModeAuto}
                          </option>
                          <option value="thinking">
                            {t.aiSettings.thinkingModeThinking}
                          </option>
                          <option value="instant">
                            {t.aiSettings.thinkingModeInstant}
                          </option>
                        </select>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setShowPlusMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2.5"
                    >
                      <Settings size={16} className="text-muted-foreground" />
                      {t.ai.aiChatSettings}
                    </button>
                  </div>
                )}

                {/* Pill inner layout: (+) | textarea | mic send */}
                <div className="flex items-end gap-1 px-2 py-2">
                  {/* "+" button */}
                  <button
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                      showPlusMenu
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title={"More"}
                  >
                    <Plus size={18} />
                  </button>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) =>
                      handleInputChange(e.target.value, e.target.selectionStart)
                    }
                    onKeyDown={handleKeyDown}
                    placeholder={t.ai.agentInputPlaceholder}
                    className="flex-1 resize-none outline-none text-foreground placeholder:text-muted-foreground max-h-[200px] bg-transparent text-sm leading-relaxed py-1 overflow-y-auto scrollbar-hide"
                    rows={1}
                    autoFocus
                  />

                  {/* Mic button */}
                  <button
                    onClick={toggleRecording}
                    className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 ${
                      isRecording
                        ? "bg-destructive/20 text-destructive"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title={isRecording ? t.ai.stopVoice : t.ai.startVoice}
                  >
                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>

                  {/* Send / Stop button */}
                  {(() => {
                    const hasPayload = Boolean(
                      input.trim() ||
                      referencedFiles.length > 0 ||
                      textSelections.length > 0,
                    );
                    const queueSend = agentStatus === "running" && hasPayload;
                    const stopCurrent = isLoading && !queueSend;
                    const disabled =
                      isAgentWaitingApproval || (!hasPayload && !stopCurrent);
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
                        title={
                          queueSend
                            ? t.ai.sendToQueue
                            : stopCurrent
                              ? t.ai.stop
                              : t.ai.send
                        }
                        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 ${
                          stopCurrent
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

                {/* Interim speech text */}
                {interimText && (
                  <div className="px-12 pb-2">
                    <span className="text-xs text-muted-foreground italic animate-pulse truncate">
                      {interimText}...
                    </span>
                  </div>
                )}
              </div>

              {/* AI settings modal */}
              <AISettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
              />
            </motion.div>
          </div>

          <WelcomeSuggestions
            hasStarted={hasStarted}
            onSetInput={setInput}
            currentFile={currentFile}
            recentFiles={recentFiles}
            fileTree={fileTree}
          />
          {!hasStarted && <div className="flex-[2]" />}
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
        {import.meta.env.DEV &&
          showDebug &&
          (() => {
            // 获取完整消息（包含 system prompt）
            const fullMessages = rustAgentMessages; // Rust Agent 消息

            return (
              <div className="fixed inset-4 z-50 bg-background/95 backdrop-blur border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/50">
                  <h2 className="font-bold text-lg">
                    🐛 {t.ai.agentDebugPanel} (🦀 Rust)
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t.ai.mode}: {chatMode} | {t.ai.status}: {agentStatus} |{" "}
                      {t.ai.fullMsgsCount}: {fullMessages.length} |{" "}
                      {t.ai.displayMsgsCount}: {agentMessages.length}
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
                          {new Date(
                            debugPromptStack.receivedAt,
                          ).toLocaleTimeString()}
                        </span>
                      </div>

                      {[
                        {
                          label: "Base System",
                          content: debugPromptStack.baseSystem,
                        },
                        {
                          label: "System Prompt",
                          content: debugPromptStack.systemPrompt,
                        },
                        {
                          label: "Role Prompt",
                          content: debugPromptStack.rolePrompt,
                        },
                        {
                          label: "Built-in Agent",
                          content: debugPromptStack.builtInAgent,
                        },
                        {
                          label: "Workspace Agent",
                          content: debugPromptStack.workspaceAgent,
                        },
                        {
                          label: "Skills Index",
                          content: debugPromptStack.skillsIndex || "(none)",
                        },
                      ].map((section) => (
                        <div
                          key={section.label}
                          className="rounded border border-border/70 bg-background/70"
                        >
                          <div className="px-2 py-1 border-b border-border/70 flex items-center justify-between">
                            <span className="font-semibold text-[11px]">
                              {section.label}
                            </span>
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

                  {fullMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        msg.role === "system"
                          ? "bg-purple-500/10 border-purple-500/30"
                          : msg.role === "user"
                            ? "bg-info/10 border-info/30"
                            : "bg-success/10 border-success/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2 font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            msg.role === "system"
                              ? "bg-purple-500 text-white"
                              : msg.role === "user"
                                ? "bg-info text-info-foreground"
                                : "bg-success text-success-foreground"
                          }`}
                        >
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
