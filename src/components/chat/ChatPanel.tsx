/**
 * Chat 面板组件
 * 统一的 Chat 界面，可在 RightPanel 和悬浮球中复用
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { diffLines } from "diff";
import { useAIStore } from "@/stores/useAIStore";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useFileStore } from "@/stores/useFileStore";
import { EditSuggestion, applyEdit } from "@/services/ai/ai";
import {
  Send,
  X,
  FileText,
  Mic,
  MicOff,
  RefreshCw,
  Square,
} from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { ChatInput, type ChatInputRef } from "./ChatInput";
import type { AttachedImage } from "@/types/chat";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";
import type { MessageContent, TextContent, ImageContent } from "@/services/llm";

// 渲染消息内容（支持多模态）
function renderMessageContent(content: MessageContent): React.ReactNode {
  if (typeof content === 'string') {
    return content;
  }
  // 多模态内容
  return content.map((part, i) => {
    if (part.type === 'text') {
      return <span key={i}>{(part as TextContent).text}</span>;
    } else if (part.type === 'image') {
      const img = part as ImageContent;
      return (
        <img
          key={i}
          src={`data:${img.source.mediaType};base64,${img.source.data}`}
          alt="attached"
          className="max-w-[200px] max-h-[200px] rounded-lg mt-1"
        />
      );
    }
    return null;
  });
}

// 从消息内容提取文本用于 Markdown 渲染
function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(part => part.type === 'text')
    .map(part => (part as TextContent).text)
    .join('\n');
}

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
  const diff = useMemo(() => {
    return diffLines(edit.originalContent, edit.newContent);
  }, [edit.originalContent, edit.newContent]);

  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary flex items-center gap-1">
          <FileText size={12} />
          {edit.filePath.split(/[/\\]/).pop()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onApply}
            className="px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-xs font-medium"
            title="预览修改"
          >
            预览
          </button>
          <button
            onClick={onReject}
            className="p-1 rounded bg-red-500/20 text-red-600 hover:bg-red-500/30 transition-colors"
            title="忽略"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{edit.description}</p>
      
      <div className="text-xs font-mono bg-background/50 rounded border border-border overflow-hidden max-h-[200px] overflow-y-auto">
        {diff.map((part, index) => {
          if (part.added) {
            return (
              <div key={index} className="bg-green-500/10 text-green-600 px-2 py-0.5 whitespace-pre-wrap border-l-2 border-green-500">
                {part.value}
              </div>
            );
          }
          if (part.removed) {
            return (
              <div key={index} className="bg-red-500/10 text-red-600 px-2 py-0.5 whitespace-pre-wrap line-through opacity-70 border-l-2 border-red-500">
                {part.value}
              </div>
            );
          }
          // Context
          return (
            <div key={index} className="text-muted-foreground px-2 py-0.5 whitespace-pre-wrap opacity-50">
              {part.value}
            </div>
          );
        })}
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
    isStreaming,
    streamingContent,
    error, 
    referencedFiles,
    pendingEdits,
    sendMessageStream,
    stopStreaming,
    retry,
    removeFileReference,
    clearPendingEdits,
    setPendingDiff,
  } = useAIStore();
  const { currentFile, currentContent } = useFileStore();
  
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInputValue((prev) => (prev ? prev + " " + text : text));
  });

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading, isStreaming]);

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

  // Handle send message with referenced files and images
  const handleSendWithFiles = useCallback(async (message: string, files: ReferencedFile[], images?: AttachedImage[]) => {
    if (!message.trim() && files.length === 0 && (!images || images.length === 0)) return;
    if (isLoading || isStreaming) return;

    const { displayMessage, fullMessage } = await processMessageWithFiles(message, files);

    setInputValue("");
    await sendMessageStream(fullMessage, files.length === 0 ? (currentFileInfo || undefined) : undefined, displayMessage, images);
  }, [isLoading, isStreaming, sendMessageStream, currentFileInfo]);

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
                {renderMessageContent(msg.content)}
              </div>
            ) : (
              <div 
                className="text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_*]:!text-xs [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-xs"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(getTextFromContent(msg.content)) }}
              />
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

        {/* Streaming / Loading - 使用和普通消息相同的样式 */}
        {(isLoading || isStreaming) && (
          <div>
            {streamingContent ? (
              <div 
                className="text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_*]:!text-xs [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-xs"
              >
                <span dangerouslySetInnerHTML={{ __html: parseMarkdown(streamingContent) }} />
                {/* 闪烁光标 | */}
                <span 
                  className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse"
                  style={{ animationDuration: '1s' }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1 h-6">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
            {error}
          </div>
        )}

        {/* Retry button */}
        {messages.length > 0 && messages.some(m => m.role === "assistant") && !isLoading && !isStreaming && (
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
            ref={chatInputRef}
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendWithFiles}
            isLoading={isLoading || isStreaming}
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
                onClick={() => (isLoading || isStreaming) ? stopStreaming() : handleSendWithFiles(inputValue, [])}
                disabled={(!inputValue.trim() && !(isLoading || isStreaming))}
                className={`${
                  (isLoading || isStreaming)
                    ? "bg-red-500 hover:bg-red-600 text-white" 
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                } disabled:opacity-50 rounded p-1.5 transition-colors flex items-center justify-center`}
                title={(isLoading || isStreaming) ? "停止" : "发送"}
              >
                {(isLoading || isStreaming) ? (
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
