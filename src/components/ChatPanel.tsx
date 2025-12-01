/**
 * Chat 面板组件
 * 统一的 Chat 界面，可在 RightPanel 和悬浮球中复用
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { EditSuggestion, applyEdit } from "@/lib/ai";
import {
  Send,
  X,
  FileText,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
} from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { ChatInput } from "./ChatInput";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";

// Edit suggestion card
function EditCard({ 
  edit, 
  onApply, 
  onReject 
}: { 
  edit: EditSuggestion; 
  onApply: () => void; 
  onReject: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="truncate flex-1">{edit.description || "修改建议"}</span>
      <div className="flex gap-1 ml-2">
        <button 
          onClick={onApply}
          className="px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          预览
        </button>
        <button 
          onClick={onReject}
          className="px-2 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80"
        >
          忽略
        </button>
      </div>
    </div>
  );
}

interface ChatPanelProps {
  compact?: boolean; // 紧凑模式（用于悬浮球）
}

export function ChatPanel({ compact = false }: ChatPanelProps) {
  const { 
    messages, 
    isLoading, 
    error, 
    referencedFiles,
    pendingEdits,
    sendMessage,
    retry,
    removeFileReference,
    clearPendingEdits,
    setPendingDiff,
  } = useAIStore();
  const { currentFile, currentContent } = useFileStore();
  
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInputValue((prev) => (prev ? prev + " " + text : text));
  });

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading]);

  // 当前文件信息
  const currentFileInfo = useMemo(() => {
    if (!currentFile) return null;
    const name = currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "";
    return {
      path: currentFile,
      name,
      content: currentContent,
    };
  }, [currentFile, currentContent]);

  // Handle send message with referenced files
  const handleSendWithFiles = useCallback(async (message: string, files: ReferencedFile[]) => {
    if (!message.trim() && files.length === 0) return;
    if (isLoading) return;

    const { displayMessage, fullMessage } = await processMessageWithFiles(message, files);

    setInputValue("");
    await sendMessage(fullMessage, files.length === 0 ? (currentFileInfo || undefined) : undefined, displayMessage);
  }, [isLoading, sendMessage, currentFileInfo]);

  // Preview edit in diff view
  const handlePreviewEdit = useCallback((edit: EditSuggestion) => {
    const editFileName = edit.filePath.replace(/\.md$/, "").toLowerCase();
    
    let file = referencedFiles.find(f => {
      const refName = f.name.replace(/\.md$/, "").toLowerCase();
      return f.path.toLowerCase().includes(editFileName) || 
             refName.includes(editFileName) ||
             editFileName.includes(refName);
    });
    
    if (!file && currentFileInfo) {
      const currentName = currentFileInfo.name.toLowerCase();
      if (
        currentFileInfo.path.toLowerCase().includes(editFileName) ||
        currentName.includes(editFileName) ||
        editFileName.includes(currentName) ||
        currentName === editFileName
      ) {
        file = currentFileInfo;
      }
    }

    if (file && file.content && file.path) {
      const modified = applyEdit(file.content, edit);
      if (modified !== file.content) {
        setPendingDiff({
          fileName: file.name,
          filePath: file.path,
          original: file.content,
          modified,
          description: edit.description,
        });
      }
    } else {
      alert("❌ 找不到要修改的文件");
    }
  }, [referencedFiles, currentFileInfo, setPendingDiff]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Context indicator - shows which file(s) will be sent to AI */}
      {!compact && (
        <div className="p-2 border-b border-border">
          <div className="text-xs text-muted-foreground mb-1">上下文:</div>
          <div className="flex flex-wrap gap-1">
            {referencedFiles.length > 0 ? (
              referencedFiles.map((file) => (
                <span
                  key={file.path}
                  className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded"
                >
                  <FileText size={10} />
                  {file.name}
                  <button onClick={() => removeFileReference(file.path)}>
                    <X size={10} />
                  </button>
                </span>
              ))
            ) : currentFileInfo ? (
              <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                <FileText size={10} />
                {currentFileInfo.name}
                <span className="text-[10px] opacity-60">(自动)</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/60">无文件</span>
            )}
          </div>
        </div>
      )}

      {/* Chat History */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p>你好！我可以帮你编辑笔记。</p>
            {!compact && <p className="mt-2 text-xs opacity-70">当前笔记会自动作为上下文</p>}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <div key={idx} className={`${msg.role === "user" ? "flex justify-end" : ""}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Pending edits */}
        {pendingEdits.length > 0 && (
          <div className="space-y-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
              📝 待确认的修改 ({pendingEdits.length})
            </p>
            {pendingEdits.map((edit, idx) => (
              <EditCard
                key={idx}
                edit={edit}
                onApply={() => handlePreviewEdit(edit)}
                onReject={clearPendingEdits}
              />
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span>思考中...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
            {error}
          </div>
        )}

        {/* Retry button */}
        {messages.length > 0 && messages.some(m => m.role === "assistant") && !isLoading && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                retry(currentFile ? {
                  path: currentFile,
                  name: currentFile.split(/[/\\]/).pop() || currentFile,
                  content: currentContent || "",
                } : undefined);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              title="重新生成"
            >
              <RefreshCw size={12} />
              重新生成
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={compact ? "p-2 border-t border-border" : "p-3 border-t border-border"}>
        <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendWithFiles}
            isLoading={isLoading}
            placeholder="输入消息... (@ 引用文件)"
            rows={compact ? 2 : 2}
            hideSendButton={true}
          />
          <div className="flex items-center mt-2 gap-2">
            <div className="flex gap-2 items-center text-xs text-muted-foreground shrink-0">
              <span>@ 添加文件</span>
            </div>
            {/* 流式显示中间识别结果 */}
            <div className="flex-1 truncate text-sm text-foreground/70 italic">
              {interimText && <span className="animate-pulse">{interimText}...</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleRecording}
                className={`p-1.5 rounded-md border flex items-center justify-center transition-colors relative ${
                  isRecording
                    ? "bg-red-500/20 border-red-500 text-red-500"
                    : "bg-background border-border text-muted-foreground hover:bg-accent"
                }`}
                title={isRecording ? "停止语音输入" : "开始语音输入"}
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-md animate-ping bg-red-500/30" />
                )}
                {isRecording ? <MicOff size={14} className="relative z-10" /> : <Mic size={14} />}
              </button>
              <button
                onClick={() => handleSendWithFiles(inputValue, [])}
                disabled={!inputValue.trim() || isLoading}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded p-1.5 transition-colors flex items-center justify-center"
                title="发送"
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
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
