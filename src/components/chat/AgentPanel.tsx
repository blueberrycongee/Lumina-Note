/**
 * Agent 面板组件
 * 
 * 提供与 Agent 交互的聊天界面
 */

import { useState, useRef, useEffect } from "react";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useMemoryStore } from "@/stores/useMemoryStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { reverifyDurableMemoryEntry } from "@/services/memory/durableMemory";
import { ChatInput } from "./ChatInput";
import { AgentMessageRenderer } from "./AgentMessageRenderer";
import { PlanCard } from "./PlanCard";
import { MemoryReviewPanel } from "@/components/memory/MemoryReviewPanel";
import { StreamingOutput } from "./StreamingMessage";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";
import type { AttachedImage, QuoteReference } from "@/types/chat";
import type { MessageAttachment } from "@/services/llm";
import {
  Square,
  Check,
  X,
  Trash2,
  AlertCircle,
  Bot,
  Mic,
  MicOff,
  Send,
  RefreshCw,
  Bug,
  FileText,
  BookOpen,
  Layers3,
} from "lucide-react";

export function AgentPanel() {
  const { t } = useLocaleStore();
  const [input, setInput] = useState("");
  const [memoryExpanded, setMemoryExpanded] = useState(true);
  const [reverifyBusyId, setReverifyBusyId] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // 使用 Rust Agent store
  const rustStore = useRustAgentStore();
  const hydrateMemory = useMemoryStore((state) => state.hydrateFromSnapshot);
  
  // 选择实际使用的 store 数据
  const status = rustStore.status;
  const durableMemorySnapshot = rustStore.durableMemorySnapshot;
  const durableMemoryBusy = rustStore.durableMemoryBusy;
  const exploreReport = rustStore.exploreReport;
  const verificationReport = rustStore.verificationReport;
  const orchestrationStages = rustStore.orchestrationStages;
  // 转换 Rust Agent 消息格式（tool role -> assistant）
  const messages = rustStore.messages.map(m => ({
    ...m,
    role: m.role === "tool" ? "assistant" as const : m.role,
  }));
  const clearChat = rustStore.clearChat;
  const abort = rustStore.abort;
  
  // 工具审批功能
  const pendingTool = rustStore.pendingTool?.tool;
  const approve = rustStore.approveTool;
  const reject = rustStore.rejectTool;
  const llmRequestStartTime = rustStore.llmRequestStartTime;
  const llmRetryState = rustStore.llmRetryState;
  const retryTimeout = rustStore.retryTimeout;
  const queuedTasks = rustStore.queuedTasks;
  const activeTaskPreview = rustStore.activeTaskPreview;
  const isWaitingApproval = status === "waiting_approval";
  const [retryNow, setRetryNow] = useState(Date.now());

  useEffect(() => {
    if (!llmRetryState || status !== "running") return;
    const timer = window.setInterval(() => {
      setRetryNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [llmRetryState, status]);

  const retrySecondsLeft =
    llmRetryState && status === "running"
      ? Math.max(0, Math.ceil((llmRetryState.nextRetryAt - retryNow) / 1000))
      : null;
  
  // startTask
  const startTask = async (
    message: string,
    context: {
      workspacePath: string;
      activeNote?: string;
      activeNoteContent?: string;
      displayMessage?: string;
      attachments?: MessageAttachment[];
    }
  ) => {
    await rustStore.startTask(message, {
      workspace_path: context.workspacePath,
      active_note_path: context.activeNote,
      active_note_content: context.activeNoteContent,
      display_message: context.displayMessage,
      attachments: context.attachments,
    });
  };

  const vaultPath = useFileStore((state) => state.vaultPath);

  const staleEntries = (durableMemorySnapshot?.staleEntryIds ?? [])
    .map((id) => durableMemorySnapshot?.entries.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  useEffect(() => {
    hydrateMemory(durableMemorySnapshot);
  }, [durableMemorySnapshot, hydrateMemory]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  // 发送消息（支持引用文件）
  const handleSendWithFiles = async (
    message: string,
    referencedFiles: ReferencedFile[],
    _images?: AttachedImage[],
    quotedSelections: QuoteReference[] = [],
  ) => {
    if ((!message.trim() && referencedFiles.length === 0 && quotedSelections.length === 0) || isWaitingApproval) return;

    setInput("");
    const { currentFile, currentContent } = useFileStore.getState();

    // 使用共享函数处理消息和文件
    const { displayMessage, fullMessage, attachments } = await processMessageWithFiles(message, referencedFiles, quotedSelections);

    await startTask(fullMessage, {
      workspacePath: vaultPath || "",
      activeNote: currentFile || undefined,
      activeNoteContent: currentFile ? currentContent : undefined,
      displayMessage,
      attachments,
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Lumina Agent</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 调试模式按钮（开发模式） */}
          {import.meta.env.DEV && (
            <>
              <button
                onClick={() => {
                  if (rustStore.debugEnabled) {
                    rustStore.disableDebug();
                  } else {
                    rustStore.enableDebug(vaultPath || ".");
                  }
                }}
                className={`p-1.5 rounded hover:bg-muted ${
                  rustStore.debugEnabled 
                    ? "text-warning bg-warning/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={rustStore.debugEnabled ? t.ai.debugDisable : t.ai.debugEnable}
              >
                <Bug className="w-4 h-4" />
              </button>
              {/* 查看日志按钮（调试启用时显示） */}
              {rustStore.debugEnabled && rustStore.debugLogPath && (
                <button
                  onClick={() => {
                    // 在系统默认程序中打开日志文件
                    if (rustStore.debugLogPath) {
                      window.open(`file://${rustStore.debugLogPath}`, "_blank");
                    }
                  }}
                  className="p-1.5 rounded hover:bg-muted text-warning"
                  title={t.ai.debugLog.replace('{path}', rustStore.debugLogPath)}
                >
                  <FileText className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {/* 清空按钮 */}
          <button
            onClick={clearChat}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title={t.panel.clearChat}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 欢迎消息 */}
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p>{t.ai.welcomeAgent}</p>
            <p className="mt-2 text-xs opacity-70">{t.ai.startTask}</p>
          </div>
        )}

        {/* 任务计划卡片 */}
        {rustStore.currentPlan && rustStore.currentPlan.steps.length > 0 && (
          <PlanCard
            plan={rustStore.currentPlan}
            currentStage={rustStore.currentStage}
            fallbackReason={rustStore.orchestrationFallbackReason}
            className="mb-2"
          />
        )}

        {(rustStore.currentStage || orchestrationStages.length > 0) && (
          <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium flex items-center gap-1.5">
                <Layers3 className="w-3.5 h-3.5" />
                Agent Stages
              </span>
              <span className="text-muted-foreground">
                {rustStore.currentStage ? `Current: ${rustStore.currentStage}` : "Waiting for stage events"}
              </span>
            </div>
            {orchestrationStages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {orchestrationStages.map((stage) => (
                  <span
                    key={stage}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${stage === rustStore.currentStage
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground"
                    }`}
                  >
                    {stage}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {exploreReport && (
          <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
            <p className="text-xs font-medium">Explore summary</p>
            <p className="mt-1 text-xs text-muted-foreground">{exploreReport.summary}</p>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              related files: {exploreReport.related_files.slice(0, 4).join(", ") || "none"}
            </div>
          </div>
        )}

        {verificationReport && (
          <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs">
              <p className="font-medium">Verification report</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${verificationReport.verdict === "pass"
                ? "bg-success/10 text-success"
                : verificationReport.verdict === "fail"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning"
              }`}>
                {verificationReport.verdict}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{verificationReport.summary}</p>
            {verificationReport.outstanding_risks.length > 0 && (
              <p className="mt-1.5 text-[11px] text-warning truncate">
                risks: {verificationReport.outstanding_risks.slice(0, 2).join("; ")}
              </p>
            )}
          </div>
        )}

        {(queuedTasks.length > 0 || activeTaskPreview || (llmRetryState && status === "running")) && (
          <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{t.ai.agentQueueTitle}</span>
              <span className="text-muted-foreground">
                {t.ai.agentQueuePending.replace('{count}', String(queuedTasks.length))}
              </span>
            </div>
            {activeTaskPreview && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.ai.agentQueueCurrent}: <span className="text-foreground">{activeTaskPreview}</span>
              </p>
            )}
            {queuedTasks.slice(0, 3).map((item) => (
              <div key={item.id} className="mt-1 text-xs text-muted-foreground truncate">
                #{item.position} {item.task}
              </div>
            ))}
            {isWaitingApproval && (
              <p className="mt-2 text-xs text-warning">
                {t.ai.agentQueueWaitingApprovalHint}
              </p>
            )}
            {llmRetryState && status === "running" && (
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
        )}

        {(durableMemoryBusy || durableMemorySnapshot) && (
          <>
            <MemoryReviewPanel
              workspacePath={vaultPath || null}
              snapshot={durableMemorySnapshot}
              sessionSnapshot={rustStore.sessionMemorySnapshot}
              onSnapshotChanged={(nextSnapshot) => {
                if (nextSnapshot) {
                  hydrateMemory(nextSnapshot);
                  rustStore._refreshDurableMemorySnapshot(vaultPath);
                }
              }}
            />

            <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
              <button
                onClick={() => setMemoryExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-xs"
                title={memoryExpanded ? "收起 Memory Wiki 面板" : "展开 Memory Wiki 面板"}
              >
                <span className="font-medium flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Memory Wiki
                </span>
                <span className="text-muted-foreground">
                  {durableMemorySnapshot
                    ? `${durableMemorySnapshot.entries.length} entries · ${durableMemorySnapshot.wikiPages.length} pages`
                    : "loading..."}
                </span>
              </button>

              {memoryExpanded && durableMemorySnapshot && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {[
                      ["我是谁", "me"],
                      ["我的项目", "projects"],
                      ["我的人物关系", "people"],
                      ["我的工作模式", "routines"],
                    ].map(([label, id]) => {
                      const page = durableMemorySnapshot.wikiPages.find((item) => item.id === id);
                      return (
                        <button
                          key={id}
                          onClick={() => page && void useFileStore.getState().openFile(page.path)}
                          className="rounded border border-border/60 px-2 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                          disabled={!page}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {durableMemorySnapshot.wikiPages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => void useFileStore.getState().openFile(page.path)}
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
                        title={`打开 Wiki 页面：${page.title}（${page.path}）`}
                      >
                        {page.title}
                        {page.staleEntryCount > 0 ? ` (${page.staleEntryCount} stale)` : ""}
                      </button>
                    ))}
                  </div>

                  {staleEntries.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-warning">Stale memories: {staleEntries.length}</p>
                      {staleEntries.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2 text-xs bg-background/60 border border-border/50 rounded px-2 py-1">
                          <div className="min-w-0">
                            <p className="truncate text-foreground">{entry.title}</p>
                            <p className="truncate text-muted-foreground">{entry.scope}</p>
                          </div>
                          <button
                            onClick={async () => {
                              if (!vaultPath || reverifyBusyId) return;
                              setMemoryError(null);
                              setReverifyBusyId(entry.id);
                              try {
                                await reverifyDurableMemoryEntry(vaultPath, entry.id);
                                await rustStore._refreshDurableMemorySnapshot(vaultPath);
                              } catch (error) {
                                setMemoryError(error instanceof Error ? error.message : String(error));
                              } finally {
                                setReverifyBusyId(null);
                              }
                            }}
                            disabled={!vaultPath || reverifyBusyId !== null}
                            className="shrink-0 rounded border border-border/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-accent disabled:opacity-60"
                            title={
                              reverifyBusyId === entry.id
                                ? `正在重验证：${entry.title}`
                                : `重验证这条记忆并刷新 last verified 时间：${entry.title}`
                            }
                          >
                            {reverifyBusyId === entry.id ? "Reverifying..." : "Reverify"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No stale memories detected.</p>
                  )}

                  {memoryError && (
                    <p className="text-[11px] text-destructive">{memoryError}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* 消息列表 - 使用 AgentMessageRenderer 组件 */}
        <AgentMessageRenderer
          messages={messages}
          isRunning={status === "running"}
          llmRequestStartTime={llmRequestStartTime}
          onRetryTimeout={retryTimeout}
        />

        {/* 流式输出 */}
        <StreamingOutput mode="agent" />

        {/* 工具审批 */}
        {pendingTool && status === "waiting_approval" && (
          <ToolApproval
            toolName={pendingTool.name}
            params={pendingTool.params}
            onApprove={approve}
            onReject={reject}
          />
        )}

        {/* 错误状态 */}
        {status === "error" && (
          <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
            <p>{rustStore.error || t.ai.errorRetry}</p>
            <button
              onClick={() => {
                const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                if (lastUserMsg && vaultPath) {
                  const { currentFile, currentContent } = useFileStore.getState();
                  startTask(lastUserMsg.rawContent || lastUserMsg.content, {
                    workspacePath: vaultPath,
                    activeNote: currentFile || undefined,
                    activeNoteContent: currentContent || undefined,
                    displayMessage: lastUserMsg.content,
                    attachments: lastUserMsg.attachments,
                  });
                }
              }}
              className="mt-2 inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-xs hover:bg-destructive/10"
            >
              <RefreshCw size={12} /> Retry failed stage
            </button>
          </div>
        )}

        {/* Retry 按钮 - 只在有消息且不在运行时显示 */}
        {messages.length > 0 && messages.some(m => m.role === "assistant") && status !== "running" && status !== "waiting_approval" && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                // 重新发送最后一条用户消息
                const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                if (lastUserMsg && vaultPath) {
                  const { currentFile, currentContent } = useFileStore.getState();
                  startTask(lastUserMsg.rawContent || lastUserMsg.content, {
                    workspacePath: vaultPath,
                    activeNote: currentFile || undefined,
                    activeNoteContent: currentContent || undefined,
                    displayMessage: lastUserMsg.content,
                    attachments: lastUserMsg.attachments,
                  });
                }
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              title={t.ai.regenerate}
            >
              <RefreshCw size={12} />
              {t.ai.regenerate}
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 - 样式对齐 Chat 输入框（自定义 textarea + 统一底部按钮） */}
      <div className="p-3 border-t border-border/60">
        {/* 模式在后台由意图自动选择，不在 UI 显示 */}

        <div className="bg-muted/30 border border-border/60 rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSendWithFiles}
            isLoading={isWaitingApproval}
            isStreaming={false}
            onStop={abort}
            placeholder={t.ai.agentPlaceholder}
            rows={3}
            hideSendButton={true}
          />
          <div className="flex items-center mt-2 gap-2">
            <div className="flex gap-2 items-center text-xs text-muted-foreground shrink-0">
              <span>{t.ai.addFile}</span>
            </div>
            {/* 流式显示中间识别结果 */}
            <div className="flex-1 truncate text-sm text-foreground/70 italic">
              {interimText && <span className="animate-pulse">{interimText}...</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleRecording}
                className={`p-1.5 rounded-md border flex items-center justify-center transition-colors relative ${isRecording
                    ? "bg-destructive/20 border-destructive text-destructive"
                    : "bg-background border-border/60 text-muted-foreground hover:bg-accent"
                  }`}
                title={isRecording ? t.ai.stopVoice : t.ai.startVoice}
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-md animate-ping bg-destructive/30" />
                )}
                {isRecording ? <MicOff size={14} className="relative z-10" /> : <Mic size={14} />}
              </button>
              <button
                onClick={() => {
                  const hasPayload = Boolean(input.trim());
                  if (status === "running" && !hasPayload) {
                    abort();
                    return;
                  }
                  void handleSendWithFiles(input, []);
                }}
                disabled={isWaitingApproval || (!input.trim() && status !== "running")}
                className={`${status === "running" && !input.trim()
                    ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  } disabled:opacity-50 rounded p-1.5 transition-colors flex items-center justify-center`}
                title={status === "running" && !input.trim() ? t.ai.stop : (status === "running" ? t.ai.sendToQueue : t.ai.send)}
              >
                {status === "running" && !input.trim() ? (
                  <Square size={14} fill="currentColor" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 子组件 ============

function ToolApproval({
  toolName,
  params,
  onApprove,
  onReject,
}: {
  toolName: string;
  params: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useLocaleStore();
  return (
    <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-warning mb-2">
        <AlertCircle className="w-4 h-4" />
        <span className="font-medium">{t.ai.needApproval}</span>
      </div>
      <div className="text-sm text-foreground mb-3">
        <p className="mb-1">
          {t.ai.tool}: <code className="px-1 py-0.5 bg-muted rounded">{toolName}</code>
        </p>
        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
          {JSON.stringify(params, null, 2)}
        </pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex items-center gap-1 px-3 py-1.5 bg-success hover:bg-success/90
                     text-success-foreground text-sm rounded"
          title={`批准执行工具调用：${toolName}`}
        >
          <Check className="w-3 h-3" />
          {t.ai.approve}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 
                     text-foreground text-sm rounded"
          title={`拒绝执行工具调用：${toolName}`}
        >
          <X className="w-3 h-3" />
          {t.ai.reject}
        </button>
      </div>
    </div>
  );
}

export default AgentPanel;
