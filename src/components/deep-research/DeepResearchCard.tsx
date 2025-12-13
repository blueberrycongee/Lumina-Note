/**
 * Deep Research Card
 *
 * 嵌入聊天界面的深度研究卡片组件
 */

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Microscope,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  BookOpen,
  ListTree,
  PenLine,
  Copy,
  Save,
  X,
  ExternalLink,
  MessageCircleQuestion,
  Send,
  Lightbulb,
  Globe,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDeepResearchStore,
  ResearchPhase,
  RESEARCH_PHASES,
  getPhaseLabel,
  getPhaseProgress,
  NoteReference,
  WebSearchResult,
} from "@/stores/useDeepResearchStore";
import ReactMarkdown from "react-markdown";
import { useFileStore } from "@/stores/useFileStore";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@/lib/path";
import { RainbowText } from "@/components/ui/rainbow-text";
import { FavIcon } from "@/components/ui/fav-icon";
import { Skeleton } from "@/components/ui/skeleton";

// ============ 子组件 ============

/** 阶段图标 */
function PhaseIcon({ phase }: { phase: ResearchPhase }) {
  const icons: Record<string, React.ReactNode> = {
    analyzing_topic: <Search className="w-4 h-4" />,
    waiting_for_clarification: <MessageCircleQuestion className="w-4 h-4" />,
    searching_notes: <FileText className="w-4 h-4" />,
    searching_web: <Globe className="w-4 h-4" />,
    crawling_web: <Download className="w-4 h-4" />,
    reading_notes: <BookOpen className="w-4 h-4" />,
    generating_outline: <ListTree className="w-4 h-4" />,
    writing_report: <PenLine className="w-4 h-4" />,
  };
  return icons[phase] || <Clock className="w-4 h-4" />;
}

/** 阶段状态图标 */
function PhaseStatus({
  phase,
  currentPhase,
}: {
  phase: ResearchPhase;
  currentPhase: ResearchPhase;
}) {
  const phaseOrder = RESEARCH_PHASES.indexOf(phase);
  const currentOrder = RESEARCH_PHASES.indexOf(currentPhase);

  if (currentPhase === "completed") {
    return <Check className="w-4 h-4 text-green-500" />;
  }

  if (currentPhase === "error") {
    return phaseOrder <= currentOrder ? (
      <AlertCircle className="w-4 h-4 text-red-500" />
    ) : (
      <Clock className="w-4 h-4 text-muted-foreground" />
    );
  }

  if (phaseOrder < currentOrder) {
    return <Check className="w-4 h-4 text-green-500" />;
  }

  if (phaseOrder === currentOrder) {
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  }

  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

/** 进度步骤 */
function ProgressSteps({
  currentPhase,
  keywords,
  foundNotes,
  webSearchResults,
  crawlingProgress,
  readingProgress,
}: {
  currentPhase: ResearchPhase;
  keywords: string[];
  foundNotes: NoteReference[];
  webSearchResults: WebSearchResult[];
  crawlingProgress: { current: number; total: number };
  readingProgress: { current: number; total: number };
}) {
  return (
    <div className="space-y-2">
      {RESEARCH_PHASES.map((phase) => {
        const isActive = phase === currentPhase;
        const phaseOrder = RESEARCH_PHASES.indexOf(phase);
        const currentOrder = RESEARCH_PHASES.indexOf(currentPhase);
        const isDone =
          currentPhase === "completed" || phaseOrder < currentOrder;

        // 额外信息
        let extra = "";
        if (phase === "analyzing_topic" && keywords.length > 0) {
          extra = `关键词: ${keywords.join(", ")}`;
        } else if (phase === "searching_notes" && foundNotes.length > 0) {
          extra = `找到 ${foundNotes.length} 篇笔记`;
        } else if (phase === "searching_web" && webSearchResults.length > 0) {
          extra = `找到 ${webSearchResults.length} 个结果`;
        } else if (phase === "crawling_web" && crawlingProgress.total > 0) {
          extra = `${crawlingProgress.current}/${crawlingProgress.total}`;
        } else if (
          phase === "reading_notes" &&
          readingProgress.total > 0
        ) {
          extra = `${readingProgress.current}/${readingProgress.total}`;
        }

        return (
          <div
            key={phase}
            className={cn(
              "flex items-center gap-2 text-sm",
              isActive && "text-foreground font-medium",
              !isActive && !isDone && "text-muted-foreground"
            )}
          >
            <PhaseStatus phase={phase} currentPhase={currentPhase} />
            <PhaseIcon phase={phase} />
            <span>{getPhaseLabel(phase)}</span>
            {extra && (
              <span className="text-xs text-muted-foreground ml-auto">
                {extra}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 笔记列表 */
function NoteList({
  notes,
  maxShow = 5,
}: {
  notes: NoteReference[];
  maxShow?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayNotes = showAll ? notes : notes.slice(0, maxShow);

  if (notes.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="text-xs text-muted-foreground mb-2">
        📚 相关笔记 ({notes.length})
      </div>
      <div className="space-y-1">
        {displayNotes.map((note) => (
          <div
            key={note.path}
            className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1 cursor-pointer"
            title={note.snippet}
          >
            <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{note.title}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {Math.round(note.score * 100)}%
            </span>
          </div>
        ))}
      </div>
      {notes.length > maxShow && (
        <button
          className="text-xs text-primary hover:underline mt-1"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "收起" : `显示全部 ${notes.length} 篇`}
        </button>
      )}
    </div>
  );
}

/** 网络搜索结果列表 */
function WebSearchResultsList({
  results,
  isSearching = false,
}: {
  results: WebSearchResult[];
  isSearching?: boolean;
}) {
  if (!isSearching && results.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="font-medium italic mb-2">
        <RainbowText
          className="flex items-center text-sm"
          animated={isSearching}
        >
          <Globe className="w-4 h-4 mr-2" />
          <span>
            {isSearching
              ? "正在搜索网络..."
              : `找到 ${results.length} 个网络结果`}
          </span>
        </RainbowText>
      </div>
      <ul className="flex flex-wrap gap-2">
        {/* 搜索中显示骨架屏 */}
        {isSearching &&
          results.length === 0 &&
          [...Array(4)].map((_, i) => (
            <li key={`skeleton-${i}`}>
              <Skeleton
                className="h-8 w-32 rounded-md"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            </li>
          ))}
        {/* 搜索结果卡片 */}
        {results.slice(0, 10).map((result, i) => (
          <motion.li
            key={`${result.url}-${i}`}
            className="text-muted-foreground bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-xs max-w-[180px]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.15,
              delay: Math.min(i * 0.05, 0.3),
              ease: "easeOut",
            }}
          >
            <FavIcon url={result.url} size={14} />
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-foreground transition-colors"
              title={result.title}
            >
              {result.title}
            </a>
          </motion.li>
        ))}
      </ul>
      {results.length > 10 && (
        <div className="text-xs text-muted-foreground mt-1">
          + {results.length - 10} 个其他结果
        </div>
      )}
    </div>
  );
}

/** 爬取网页动画列表 */
function CrawlingPagesList({
  results,
  crawlingProgress,
  isCrawling = false,
}: {
  results: WebSearchResult[];
  crawlingProgress: { current: number; total: number };
  isCrawling?: boolean;
}) {
  if (!isCrawling && crawlingProgress.total === 0) return null;

  // 当前正在爬取的页面
  const currentIndex = crawlingProgress.current - 1;
  const crawledPages = results.slice(0, crawlingProgress.current);

  return (
    <div className="mt-4">
      <div className="font-medium italic mb-2">
        <RainbowText
          className="flex items-center text-sm"
          animated={isCrawling}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          <span>
            {isCrawling
              ? `正在阅读网页 (${crawlingProgress.current}/${crawlingProgress.total})...`
              : `已阅读 ${crawlingProgress.total} 个网页`}
          </span>
        </RainbowText>
      </div>
      <ul className="flex flex-wrap gap-2">
        {/* 已爬取的页面 */}
        {crawledPages.map((result, i) => {
          const isCurrentlyCrawling = isCrawling && i === currentIndex;
          return (
            <motion.li
              key={`crawl-${result.url}-${i}`}
              className={cn(
                "text-muted-foreground bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                isCurrentlyCrawling && "ring-2 ring-primary/50"
              )}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.15,
                ease: "easeOut",
              }}
            >
              {isCurrentlyCrawling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <FavIcon url={result.url} size={14} />
              )}
              <span className="truncate max-w-[120px]" title={result.title}>
                {result.title}
              </span>
              {!isCurrentlyCrawling && (
                <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
              )}
            </motion.li>
          );
        })}
        {/* 待爬取的页面（骨架屏） */}
        {isCrawling &&
          [...Array(Math.min(crawlingProgress.total - crawlingProgress.current, 3))].map((_, i) => (
            <li key={`pending-${i}`}>
              <Skeleton
                className="h-7 w-28 rounded-md"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            </li>
          ))}
      </ul>
    </div>
  );
}

/** 澄清面板 */
function ClarificationPanel({
  question,
  suggestions,
  onSubmit,
  onSkip,
}: {
  question: string;
  suggestions: string[];
  onSubmit: (clarification: string) => void;
  onSkip: () => void;
}) {
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(input.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      {/* 问题 */}
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-medium text-sm text-amber-700 dark:text-amber-400">
            需要更多信息
          </div>
          <div className="text-sm text-foreground mt-1">{question}</div>
        </div>
      </div>

      {/* 建议选项 */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(suggestion)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full 
                         bg-muted hover:bg-muted/80 text-muted-foreground
                         hover:text-foreground transition-colors"
            >
              <Lightbulb className="w-3 h-3" />
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入您的说明..."
          className="flex-1 px-3 py-2 text-sm border border-border rounded-md 
                     bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={isSubmitting}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isSubmitting}
          className="flex items-center gap-1 px-3 py-2 rounded-md
                     bg-primary text-primary-foreground hover:bg-primary/90
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 跳过按钮 */}
      <div className="flex justify-end">
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          跳过，使用原始输入继续
        </button>
      </div>
    </div>
  );
}

/** 报告渲染 */
function ReportContent({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          // 处理 [[笔记链接]]
          p: ({ children }: { children?: React.ReactNode }) => {
            if (typeof children === "string") {
              const parts = children.split(/(\[\[[^\]]+\]\])/g);
              return (
                <p>
                  {parts.map((part, i) => {
                    const match = part.match(/\[\[([^\]]+)\]\]/);
                    if (match) {
                      return (
                        <span
                          key={i}
                          className="text-primary hover:underline cursor-pointer inline-flex items-center gap-0.5"
                        >
                          {match[1]}
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      );
                    }
                    return part;
                  })}
                </p>
              );
            }
            return <p>{children}</p>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
      )}
    </div>
  );
}

// ============ 主组件 ============

interface DeepResearchCardProps {
  className?: string;
  chatId?: string | null;  // 当前聊天对话 ID，用于过滤显示
}

export function DeepResearchCard({ className, chatId }: DeepResearchCardProps) {
  const { 
    currentSession, 
    isRunning, 
    abortResearch, 
    submitClarification,
    reset,
    selectedSessionId,
  } = useDeepResearchStore();

  // 显示逻辑：
  // 1. 如果是从历史中选择的会话（selectedSessionId 存在），始终显示
  // 2. 如果是正在运行的新会话，按 chatId 过滤
  const isHistoryView = selectedSessionId && currentSession?.id === selectedSessionId;
  const shouldShow = currentSession && (isHistoryView || !chatId || currentSession.chatId === chatId);

  const [isExpanded, setIsExpanded] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const { vaultPath, refreshFileTree, openFile } = useFileStore();

  // 当完成时自动展开报告
  useEffect(() => {
    if (currentSession?.phase === "completed") {
      setShowReport(true);
    }
  }, [currentSession?.phase]);

  // 流式报告内容
  const reportContent = useMemo(() => {
    if (!currentSession) return "";
    return (
      currentSession.finalReport ||
      currentSession.reportChunks.join("")
    );
  }, [currentSession?.finalReport, currentSession?.reportChunks]);

  const isStreaming =
    isRunning && currentSession?.phase === "writing_report";

  // 没有会话或不属于当前聊天时不渲染
  if (!shouldShow) return null;

  const { topic, phase, phaseMessage, keywords, foundNotes, webSearchResults, crawlingProgress, readingProgress, tokenUsage, error } =
    currentSession;

  const progress = getPhaseProgress(phase);

  // 复制报告
  const handleCopy = () => {
    if (reportContent) {
      navigator.clipboard.writeText(reportContent);
    }
  };

  // 打开保存对话框
  const handleSaveClick = () => {
    // 默认文件名：研究主题
    setSaveFileName(`Deep Research - ${topic}`);
    setShowSaveDialog(true);
  };

  // 保存为笔记
  const handleSave = async () => {
    if (!reportContent || !vaultPath || !saveFileName.trim()) return;
    
    setIsSaving(true);
    try {
      // 构建文件路径
      const fileName = saveFileName.trim().endsWith('.md') 
        ? saveFileName.trim() 
        : `${saveFileName.trim()}.md`;
      const filePath = await join(vaultPath, fileName);
      
      // 构建笔记内容（添加 YAML frontmatter）
      const noteContent = `---
title: ${saveFileName.trim()}
type: deep-research
date: ${new Date().toISOString().split('T')[0]}
topic: ${topic}
---

${reportContent}`;
      
      // 保存文件
      await invoke('save_file', { path: filePath, content: noteContent });
      
      // 刷新文件树并打开文件
      await refreshFileTree();
      await openFile(filePath);
      
      // 关闭对话框
      setShowSaveDialog(false);
      console.log('[DeepResearch] Report saved to:', filePath);
    } catch (error) {
      console.error('[DeepResearch] Failed to save report:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-muted/30 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Microscope className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            Deep Research: {topic}
          </div>
          <div className="text-xs text-muted-foreground">
            {phaseMessage}
          </div>
        </div>

        {/* 进度条 */}
        {isRunning && (
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        {/* 状态图标 */}
        {phase === "completed" && (
          <Check className="w-5 h-5 text-green-500" />
        )}
        {phase === "error" && (
          <AlertCircle className="w-5 h-5 text-red-500" />
        )}
        {phase === "waiting_for_clarification" && (
          <MessageCircleQuestion className="w-5 h-5 text-amber-500" />
        )}
        {isRunning && phase !== "waiting_for_clarification" && (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        )}

        {/* 展开/收起 */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* 内容区 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 py-3 space-y-3">
              {/* 错误信息 */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 澄清面板 */}
              {phase === "waiting_for_clarification" && currentSession.clarification && (
                <ClarificationPanel
                  question={currentSession.clarification.question}
                  suggestions={currentSession.clarification.suggestions}
                  onSubmit={submitClarification}
                  onSkip={() => {
                    // 跳过澄清，使用原始输入继续
                    submitClarification(currentSession.topic);
                  }}
                />
              )}

              {/* 进度步骤 */}
              {!showReport && phase !== "waiting_for_clarification" && (
                <>
                  <ProgressSteps
                    currentPhase={phase}
                    keywords={keywords}
                    foundNotes={foundNotes}
                    webSearchResults={webSearchResults}
                    crawlingProgress={crawlingProgress}
                    readingProgress={readingProgress}
                  />
                  <NoteList notes={foundNotes} />
                  <WebSearchResultsList
                    results={webSearchResults}
                    isSearching={phase === "searching_web"}
                  />
                  <CrawlingPagesList
                    results={webSearchResults}
                    crawlingProgress={crawlingProgress}
                    isCrawling={phase === "crawling_web"}
                  />
                </>
              )}

              {/* 报告内容 */}
              {(showReport || phase === "writing_report") &&
                reportContent && (
                  <div className="mt-3">
                    {!showReport && phase !== "completed" && (
                      <div className="text-xs text-muted-foreground mb-2">
                        📝 报告生成中...
                      </div>
                    )}
                    <div className="max-h-96 overflow-y-auto rounded-md border border-border p-4 bg-background">
                      <ReportContent
                        content={reportContent}
                        isStreaming={isStreaming}
                      />
                    </div>
                  </div>
                )}

              {/* 切换视图按钮 */}
              {phase === "completed" && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      !showReport
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                    onClick={() => setShowReport(false)}
                  >
                    进度详情
                  </button>
                  <button
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      showReport
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                    onClick={() => setShowReport(true)}
                  >
                    查看报告
                  </button>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                {phase === "completed" && (
                  <>
                    <button
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80"
                      onClick={handleCopy}
                    >
                      <Copy className="w-3 h-3" />
                      复制
                    </button>
                    <button
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80"
                      onClick={handleSaveClick}
                    >
                      <Save className="w-3 h-3" />
                      保存为笔记
                    </button>
                  </>
                )}

                {isRunning && (
                  <button
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-red-500/10 text-red-600 hover:bg-red-500/20"
                    onClick={abortResearch}
                  >
                    <X className="w-3 h-3" />
                    取消
                  </button>
                )}

                {(phase === "completed" || phase === "error") && (
                  <button
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 ml-auto"
                    onClick={reset}
                  >
                    关闭
                  </button>
                )}

                {/* Token 统计 */}
                {tokenUsage.totalTokens > 0 && (
                  <div className="text-xs text-muted-foreground ml-auto">
                    Token: {tokenUsage.totalTokens.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 保存对话框 */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background rounded-lg border border-border shadow-xl p-4 w-80"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-medium text-sm mb-3">保存研究报告</h3>
              <input
                type="text"
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="输入文件名..."
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary mb-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSaveDialog(false);
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !saveFileName.trim()}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default DeepResearchCard;
