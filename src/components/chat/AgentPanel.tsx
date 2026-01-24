/**
 * Agent 面板组件
 * 
 * 提供与 Agent 交互的聊天界面
 */

import { useState, useRef, useEffect } from "react";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ChatInput } from "./ChatInput";
import { AgentMessageRenderer } from "./AgentMessageRenderer";
import { PlanCard } from "./PlanCard";
import { StreamingOutput } from "./StreamingMessage";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";
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
} from "lucide-react";

export function AgentPanel() {
  const { t } = useLocaleStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // 使用 Rust Agent store
  const rustStore = useRustAgentStore();
  
  // 选择实际使用的 store 数据
  const status = rustStore.status;
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
  const retryTimeout = rustStore.retryTimeout;
  
  // startTask
  const startTask = async (message: string, context: { workspacePath: string; activeNote?: string; activeNoteContent?: string; displayMessage?: string }) => {
    await rustStore.startTask(message, {
      workspace_path: context.workspacePath,
      active_note_path: context.activeNote,
      active_note_content: context.activeNoteContent,
    });
  };

  const { vaultPath, currentFile, currentContent } = useFileStore();

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  // 发送消息（支持引用文件）
  const handleSendWithFiles = async (message: string, referencedFiles: ReferencedFile[]) => {
    if ((!message.trim() && referencedFiles.length === 0) || status === "running") return;

    setInput("");

    // 使用共享函数处理消息和文件
    const { displayMessage, fullMessage } = await processMessageWithFiles(message, referencedFiles);

    await startTask(fullMessage, {
      workspacePath: vaultPath || "",
      activeNote: currentFile || undefined,
      activeNoteContent: currentFile ? currentContent : undefined,
      displayMessage,
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
                    ? "text-yellow-500 bg-yellow-500/10" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={rustStore.debugEnabled ? "禁用调试模式" : "启用调试模式"}
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
                  className="p-1.5 rounded hover:bg-muted text-yellow-500"
                  title={`查看调试日志: ${rustStore.debugLogPath}`}
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
          <PlanCard plan={rustStore.currentPlan} className="mb-2" />
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
          <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
            {rustStore.error || t.ai.errorRetry}
          </div>
        )}

        {/* Retry 按钮 - 只在有消息且不在运行时显示 */}
        {messages.length > 0 && messages.some(m => m.role === "assistant") && status !== "running" && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                // 重新发送最后一条用户消息
                const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                if (lastUserMsg && vaultPath) {
                  startTask(lastUserMsg.content, {
                    workspacePath: vaultPath,
                    activeNote: currentFile || undefined,
                    activeNoteContent: currentContent || undefined,
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
      <div className="p-3 border-t border-border">
        {/* 模式在后台由意图自动选择，不在 UI 显示 */}

        <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSendWithFiles}
            isLoading={status === "running"}
            isStreaming={status === "running"}
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
                    ? "bg-red-500/20 border-red-500 text-red-500"
                    : "bg-background border-border text-muted-foreground hover:bg-accent"
                  }`}
                title={isRecording ? t.ai.stopVoice : t.ai.startVoice}
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-md animate-ping bg-red-500/30" />
                )}
                {isRecording ? <MicOff size={14} className="relative z-10" /> : <Mic size={14} />}
              </button>
              <button
                onClick={() => status === "running" ? abort() : handleSendWithFiles(input, [])}
                disabled={(!input.trim() && status !== "running")}
                className={`${status === "running"
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  } disabled:opacity-50 rounded p-1.5 transition-colors flex items-center justify-center`}
                title={status === "running" ? t.ai.stop : t.ai.send}
              >
                {status === "running" ? (
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
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
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
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 
                     text-white text-sm rounded"
        >
          <Check className="w-3 h-3" />
          {t.ai.approve}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 
                     text-foreground text-sm rounded"
        >
          <X className="w-3 h-3" />
          {t.ai.reject}
        </button>
      </div>
    </div>
  );
}

export default AgentPanel;
