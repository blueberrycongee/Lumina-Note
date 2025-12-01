/**
 * Agent 面板组件
 * 
 * 提供与 Agent 交互的聊天界面
 */

import { useState, useRef, useEffect } from "react";
import { useAgentStore } from "@/stores/useAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { MODES, getModeList } from "@/agent/modes";
import { AgentModeSlug, Message } from "@/agent/types";
import { parseMarkdown } from "@/lib/markdown";
import { ChatInput } from "./ChatInput";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";
import {
  Square,
  Check,
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Bot,
  Wrench,
  Mic,
  MicOff,
  Send,
  RefreshCw,
} from "lucide-react";

export function AgentPanel() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  const {
    status,
    messages,
    pendingTool,
    mode,
    setMode,
    startTask,
    abort,
    approve,
    reject,
    clearChat,
    retry,
  } = useAgentStore();

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
            {/* 模式选择 */}
            <ModeSelector mode={mode} onChange={setMode} />
            {/* 清空按钮 */}
            <button
              onClick={clearChat}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="清空对话"
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
              <p>{MODES[mode].roleDefinition}</p>
              <p className="mt-2 text-xs opacity-70">输入任务指令开始</p>
            </div>
          )}

          {/* 消息列表 - 聚合工具调用和结果 */}
          {renderMessages(messages)}

          {/* 工具审批 */}
          {pendingTool && status === "waiting_approval" && (
            <ToolApproval
              toolName={pendingTool.name}
              params={pendingTool.params}
              onApprove={approve}
              onReject={reject}
            />
          )}

          {/* 加载状态 */}
          {status === "running" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>思考中...</span>
            </div>
          )}

          {/* 错误状态 */}
          {status === "error" && (
            <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
              发生错误，请重试
            </div>
          )}

          {/* Retry 按钮 - 只在有消息且不在运行时显示 */}
          {messages.length > 0 && messages.some(m => m.role === "assistant") && status !== "running" && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (!vaultPath) return;
                  retry({
                    workspacePath: vaultPath,
                    activeNote: currentFile || undefined,
                    activeNoteContent: currentContent || undefined,
                  });
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

        {/* 输入区域 - 样式对齐 Chat 输入框（自定义 textarea + 统一底部按钮） */}
        <div className="p-3 border-t border-border">
          <div className="mb-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {MODES[mode].name}
            </span>
          </div>

          <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSendWithFiles}
              isLoading={status === "running"}
              isStreaming={status === "running"}
              onStop={abort}
              placeholder="输入任务指令... (@ 引用文件)"
              rows={3}
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
                  onClick={() => status === "running" ? abort() : handleSendWithFiles(input, [])}
                  disabled={(!input.trim() && status !== "running")}
                  className={`${
                    status === "running" 
                      ? "bg-red-500 hover:bg-red-600 text-white" 
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  } disabled:opacity-50 rounded p-1.5 transition-colors flex items-center justify-center`}
                  title={status === "running" ? "停止" : "发送"}
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

// ============ 消息渲染 ============

// 聚合并渲染所有消息
function renderMessages(messages: Message[]) {
  // 检测任务是否完成（最后有 attempt_completion 的结果）
  const isTaskComplete = messages.some(m => 
    m.content.includes("<tool_result") && 
    m.content.includes("attempt_completion")
  );
  
  // 收集所有工具调用和结果
  const toolResults = new Map<string, { result: string; success: boolean }>();
  
  // 第一遍：收集所有工具结果
  messages.forEach(msg => {
    const content = msg.content;
    
    // 提取 tool_result
    const resultRegex = /<tool_result name="([^"]+)">([\s\S]*?)<\/tool_result>/g;
    let match;
    while ((match = resultRegex.exec(content)) !== null) {
      toolResults.set(match[1], { result: match[2].trim(), success: true });
    }
    
    // 提取 tool_error
    const errorRegex = /<tool_error name="([^"]+)">([\s\S]*?)<\/tool_error>/g;
    while ((match = errorRegex.exec(content)) !== null) {
      toolResults.set(match[1], { result: match[2].trim(), success: false });
    }
  });

  // 第二遍：渲染消息，跳过纯工具结果消息
  const rendered: JSX.Element[] = [];
  
  messages.forEach((msg, i) => {
    const content = msg.content;
    const isUser = msg.role === "user";
    
    // 跳过工具结果消息和系统提示
    if (content.includes("<tool_result") || 
        content.includes("<tool_error") ||
        content.includes("你的响应没有包含有效的工具调用")) {
      return;
    }
    
    // 用户消息
    if (isUser) {
      let displayContent = content;
      displayContent = displayContent.replace(/<task>([\s\S]*?)<\/task>/g, "$1");
      displayContent = displayContent.replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "");
      displayContent = displayContent.replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, ""); // 过滤 RAG 注入内容
      displayContent = displayContent.trim();
      
      if (displayContent) {
        rendered.push(
          <div key={`user-${i}`} className="flex justify-end">
            <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
              {displayContent}
            </div>
          </div>
        );
      }
      return;
    }
    
    // AI 消息 - 解析工具调用
    const toolCalls: { name: string; params: string; result?: string; success?: boolean }[] = [];
    let text = content;
    
    // 移除 thinking
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
    
    // 提取工具调用
    const nonToolTags = ["thinking", "task", "current_note", "tool_result", "tool_error", "result",
                         "directory", "recursive", "paths", "path", "content", "edits", "search", "replace"];
    const toolCallRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let match;
    
    while ((match = toolCallRegex.exec(content)) !== null) {
      const tagName = match[1];
      if (!nonToolTags.includes(tagName.toLowerCase())) {
        const params = match[2].trim();
        
        // 获取关联的结果
        const resultData = toolResults.get(tagName);
        
        // 特殊处理 attempt_completion - 不作为卡片，直接显示结果文本
        if (tagName === "attempt_completion") {
          const resultMatch = params.match(/<result>([\s\S]*?)<\/result>/);
          if (resultMatch) {
            // 将结果添加到文本显示，不添加到工具卡片
            text = resultMatch[1].trim();
          }
        } else {
          toolCalls.push({
            name: tagName,
            params: formatToolParams(params),
            result: resultData?.result,
            success: resultData?.success,
          });
        }
        // 从原文中移除工具调用标签
        text = text.replace(match[0], "");
      }
    }
    
    // 清理文本
    text = text.replace(/<[^>]+>/g, "").trim();
    
    // 如果有内容，渲染
    if (toolCalls.length > 0 || text) {
      rendered.push(
        <div key={`ai-${i}`} className="space-y-2">
          {toolCalls.map((tool, j) => (
            <ToolCallCard
              key={`${tool.name}-${j}`}
              name={tool.name}
              params={tool.params}
              result={tool.result}
              success={tool.success}
              isTaskComplete={isTaskComplete}
            />
          ))}
          {text && (
            <div 
              className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(text) }}
            />
          )}
        </div>
      );
    }
  });
  
  return rendered;
}

// 格式化工具参数为可读形式
function formatToolParams(params: string): string {
  // 提取常见参数
  const parts: string[] = [];
  
  const dirMatch = params.match(/<directory>([^<]*)<\/directory>/);
  if (dirMatch) parts.push(`目录: ${dirMatch[1] || "/"}`);
  
  const recursiveMatch = params.match(/<recursive>([^<]*)<\/recursive>/);
  if (recursiveMatch) parts.push(`递归: ${recursiveMatch[1]}`);
  
  const pathsMatch = params.match(/<paths>([^<]*)<\/paths>/);
  if (pathsMatch) parts.push(`路径: ${pathsMatch[1]}`);
  
  const pathMatch = params.match(/<path>([^<]*)<\/path>/);
  if (pathMatch) parts.push(`文件: ${pathMatch[1]}`);
  
  if (parts.length > 0) {
    return parts.join(" | ");
  }
  
  // 如果没有识别的参数，返回简化的原始内容
  return params.replace(/<[^>]+>/g, " ").trim().slice(0, 100);
}

// ============ 子组件 ============

function ModeSelector({ mode, onChange }: { mode: AgentModeSlug; onChange: (m: AgentModeSlug) => void }) {
  const [open, setOpen] = useState(false);
  const modes = getModeList();
  const current = MODES[mode];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-sm bg-muted rounded
                   hover:bg-muted/80 text-foreground"
      >
        <span>{current.name}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-background border border-border 
                        rounded-lg shadow-lg z-10">
          {modes.map((m) => (
            <button
              key={m.slug}
              onClick={() => {
                onChange(m.slug);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted
                         ${m.slug === mode ? "bg-muted text-primary" : "text-foreground"}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 生成工具结果摘要
function getToolSummary(name: string, result?: string): string {
  if (!result) return "执行中...";
  
  // 根据工具类型生成摘要
  if (name === "list_notes") {
    const fileCount = (result.match(/📄/g) || []).length;
    const dirCount = (result.match(/📁/g) || []).length;
    if (fileCount > 0 || dirCount > 0) {
      return `发现 ${fileCount} 个文件${dirCount > 0 ? `，${dirCount} 个目录` : ""}`;
    }
  }
  if (name === "read_note") {
    const lines = result.split("\n").length;
    return `读取了 ${lines} 行内容`;
  }
  if (name === "create_note" || name === "edit_note") {
    return "文件已修改";
  }
  if (name === "attempt_completion") {
    return "任务完成";
  }
  
  // 默认：截取前 50 字符
  return result.length > 50 ? result.slice(0, 50) + "..." : result;
}

// 工具调用卡片组件
function ToolCallCard({ 
  name, 
  params, 
  result, 
  success,
  isTaskComplete 
}: { 
  name: string; 
  params: string; 
  result?: string; 
  success?: boolean;
  isTaskComplete?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = result !== undefined;
  const summary = getToolSummary(name, result);
  
  // 任务完成后自动折叠
  useEffect(() => {
    if (isTaskComplete && expanded) {
      // 延迟一下，让用户看到动画
      const timer = setTimeout(() => {
        setExpanded(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isTaskComplete, expanded]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-muted/30">
      {/* 卡片头部 - 可点击展开 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium text-foreground">{name}</span>
        
        {/* 状态图标 */}
        {isComplete ? (
          success ? (
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <X className="w-4 h-4 text-red-500 flex-shrink-0" />
          )
        ) : (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
        )}
        
        {/* 摘要 */}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {summary}
        </span>
        
        {/* 展开图标 */}
        <ChevronRight 
          className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
            expanded ? "rotate-90" : ""
          }`} 
        />
      </button>
      
      {/* 展开的详情 - 带动画 */}
      <div 
        className={`border-t border-border bg-muted/20 overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 border-t-0'
        }`}
      >
        <div className="px-3 py-2">
          {params && (
            <div className="mb-2">
              <div className="text-xs text-muted-foreground mb-1">参数:</div>
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                {params}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">结果:</div>
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
        <AlertCircle className="w-4 h-4" />
        <span className="font-medium">需要审批</span>
      </div>
      <div className="text-sm text-foreground mb-3">
        <p className="mb-1">
          工具: <code className="px-1 py-0.5 bg-muted rounded">{toolName}</code>
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
          批准
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 
                     text-foreground text-sm rounded"
        >
          <X className="w-3 h-3" />
          拒绝
        </button>
      </div>
    </div>
  );
}

export default AgentPanel;
