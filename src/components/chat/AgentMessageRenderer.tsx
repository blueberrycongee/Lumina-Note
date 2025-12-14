/**
 * Agent 消息渲染组件
 * 
 * 将 Agent 的消息渲染为：
 * - 思考过程：折叠显示，小字灰色
 * - 工具调用：折叠卡片，小字灰色
 * - 最终回答：正常大字体，Markdown 渲染
 */

import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore } from '@/stores/useLocaleStore';
import { parseMarkdown } from "@/services/markdown/markdown";
import { Message } from "@/agent/types";
import type { MessageContent, TextContent } from "@/services/llm";
import { useTimeout } from "@/hooks/useTimeout";

// 从消息内容中提取文本（处理多模态内容）
function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(item => item.type === 'text')
    .map(item => (item as TextContent).text)
    .join('\n');
}
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  Brain,
  Check,
  X,
  Loader2,
  Bot,
  Copy,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ============ 类型定义 ============

interface ToolCallInfo {
  name: string;
  params: string;
  result?: string;
  success?: boolean;
}

interface ThinkingBlock {
  content: string;
  durationHint?: string; // 如 "3s"
}

interface ParsedAgentMessage {
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCallInfo[];
  finalAnswer: string; // attempt_completion 的 result 或清理后的文本
  rawTextBeforeCompletion: string; // 工具调用前的说明文字（通常不显示）
}

// ============ 解析函数 ============

/**
 * 解析 assistant 消息，提取思考、工具调用、最终回答
 */
function parseAssistantMessage(content: string, toolResults: Map<string, { result: string; success: boolean }>): ParsedAgentMessage {
  const thinkingBlocks: ThinkingBlock[] = [];
  const toolCalls: ToolCallInfo[] = [];
  let finalAnswer = "";
  let text = content;

  // 1. 提取 thinking 块
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  let thinkingMatch;
  while ((thinkingMatch = thinkingRegex.exec(content)) !== null) {
    thinkingBlocks.push({ content: thinkingMatch[1].trim() });
  }
  text = text.replace(thinkingRegex, "");

  // 2. 提取 attempt_completion_result（我们添加的特殊标签）
  const completionResultMatch = text.match(/<attempt_completion_result>([\s\S]*?)<\/attempt_completion_result>/);
  if (completionResultMatch) {
    finalAnswer = completionResultMatch[1].trim();
    text = text.replace(/<attempt_completion_result>[\s\S]*?<\/attempt_completion_result>/, "");
  }

  // 3. 提取 attempt_completion（XML 模式）
  if (!finalAnswer) {
    const attemptMatch = text.match(/<attempt_completion>[\s\S]*?<result>([\s\S]*?)<\/result>[\s\S]*?<\/attempt_completion>/);
    if (attemptMatch) {
      finalAnswer = attemptMatch[1].trim();
    }
  }

  // 4. 提取工具调用
  const nonToolTags = ["thinking", "task", "current_note", "tool_result", "tool_error", "result",
    "directory", "recursive", "paths", "path", "content", "edits", "search", "replace",
    "attempt_completion", "attempt_completion_result", "related_notes"];
  const toolCallRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    const tagName = match[1];
    if (!nonToolTags.includes(tagName.toLowerCase())) {
      const params = match[2].trim();
      // 先尝试用精确 key 匹配，再回退到工具名
      const key = getToolCallKey(tagName, params);
      const resultData = toolResults.get(key) || toolResults.get(tagName);

      toolCalls.push({
        name: tagName,
        params: formatToolParams(params),
        result: resultData?.result,
        success: resultData?.success,
      });
    }
  }

  // 5. 清理剩余文本
  let rawTextBeforeCompletion = text
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "") // 移除所有标签对
    .replace(/<[^>]+>/g, "") // 移除单个标签
    // 只压缩连续空格，保留换行符
    .replace(/[^\S\n]+/g, " ")  // 非换行的空白字符压缩为单个空格
    .replace(/\n{3,}/g, "\n\n") // 超过2个连续换行压缩为2个
    .trim();

  // 移除 DeepSeek 的特殊标签
  rawTextBeforeCompletion = rawTextBeforeCompletion.replace(/<\|end_of_thinking\|>/g, "").trim();

  return {
    thinkingBlocks,
    toolCalls,
    finalAnswer,
    rawTextBeforeCompletion,
  };
}

/**
 * 格式化工具参数为可读形式
 */
function formatToolParams(params: string): string {
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

  return params.replace(/<[^>]+>/g, " ").trim().slice(0, 100);
}

/**
 * 生成工具摘要 - 优先显示参数信息
 */
function getToolSummary(name: string, params: string, result?: string): string {
  // 优先从参数中提取关键信息
  if (name === "list_notes") {
    const dirMatch = params.match(/目录:\s*([^\s|]+)/);
    if (dirMatch) return `目录: ${dirMatch[1] || "/"}`;
  }
  if (name === "read_note") {
    const fileMatch = params.match(/文件:\s*([^\s|]+)/);
    if (fileMatch) return `文件: ${fileMatch[1]}`;
  }
  if (name === "create_note" || name === "edit_note") {
    const fileMatch = params.match(/文件:\s*([^\s|]+)/);
    if (fileMatch) return `文件: ${fileMatch[1]}`;
  }
  if (name === "search_notes" || name === "grep_search" || name === "semantic_search") {
    // 搜索工具显示搜索关键词
    return params.slice(0, 30) + (params.length > 30 ? "..." : "");
  }

  // 如果没有匹配到，显示参数摘要
  if (params) {
    return params.slice(0, 40) + (params.length > 40 ? "..." : "");
  }

  // 最后回退到结果
  if (result) {
    return result.length > 50 ? result.slice(0, 50) + "..." : result;
  }

  return "执行中...";
}

/**
 * 生成工具调用的唯一标识（工具名 + 参数摘要）
 */
function getToolCallKey(name: string, params: string): string {
  // 提取参数中的关键信息作为签名
  // 格式化方式与后端 formatToolResult 保持一致
  const signature = params
    .replace(/\s+/g, " ")
    .slice(0, 100);
  return `${name}::${signature}`;
}

/**
 * 解码 HTML 实体（用于匹配后端转义的 params）
 */
function decodeHtmlEntities(str: string): string {
  return str.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/**
 * 从所有消息中收集工具执行结果
 * 使用 工具名::参数摘要 作为唯一 key
 */
function collectToolResults(messages: Message[]): Map<string, { result: string; success: boolean }> {
  const toolResults = new Map<string, { result: string; success: boolean }>();
  
  // 用于跟踪最近的工具调用（Rust Agent 格式）
  let lastToolCall: { name: string; params: string } | null = null;

  messages.forEach(msg => {
    const content = getTextFromContent(msg.content);

    // Rust Agent 格式：🔧 tool_name: {...}
    if (content.startsWith('🔧')) {
      const match = content.match(/🔧\s*(\w+):\s*(.+)/);
      if (match) {
        lastToolCall = { name: match[1], params: match[2] };
      }
      return;
    }
    
    // Rust Agent 格式：✅ 结果... 或 ❌ 错误...
    if (content.startsWith('✅') && lastToolCall) {
      const result = content.slice(1).trim();
      const key = getToolCallKey(lastToolCall.name, lastToolCall.params);
      toolResults.set(key, { result, success: true });
      toolResults.set(lastToolCall.name, { result, success: true });
      lastToolCall = null;
      return;
    }
    if (content.startsWith('❌') && lastToolCall) {
      const result = content.slice(1).trim();
      const key = getToolCallKey(lastToolCall.name, lastToolCall.params);
      toolResults.set(key, { result, success: false });
      toolResults.set(lastToolCall.name, { result, success: false });
      lastToolCall = null;
      return;
    }

    // 提取 tool_result：<tool_result name="xxx" params="...">结果</tool_result>
    // 或旧格式：<tool_result name="xxx">结果</tool_result>
    const resultRegex = /<tool_result name="([^"]+)"(?:\s+params="([^"]*)")?>([\s\S]*?)<\/tool_result>/g;
    let match;
    while ((match = resultRegex.exec(content)) !== null) {
      const name = match[1];
      // 解码 HTML 实体（后端会转义引号）
      const params = decodeHtmlEntities(match[2] || "");
      const result = match[3].trim();
      const key = getToolCallKey(name, params);
      toolResults.set(key, { result, success: true });
      // 同时保存仅用工具名的版本作为回退
      if (!toolResults.has(name)) {
        toolResults.set(name, { result, success: true });
      }
    }

    // 提取 tool_error
    const errorRegex = /<tool_error name="([^"]+)"(?:\s+params="([^"]*)")?>([\s\S]*?)<\/tool_error>/g;
    while ((match = errorRegex.exec(content)) !== null) {
      const name = match[1];
      const params = decodeHtmlEntities(match[2] || "");
      const result = match[3].trim();
      const key = getToolCallKey(name, params);
      toolResults.set(key, { result, success: false });
      if (!toolResults.has(name)) {
        toolResults.set(name, { result, success: false });
      }
    }
  });

  return toolResults;
}

/**
 * 判断 user 消息是否应该跳过（工具结果、系统提示等）
 */
function shouldSkipUserMessage(content: string): boolean {
  return content.includes("<tool_result") ||
    content.includes("<tool_error") ||
    content.includes("你的响应没有包含有效的工具调用") ||
    content.includes("请使用 <thinking> 标签分析错误原因") ||
    content.includes("系统错误:") ||
    content.includes("系统拒绝执行") ||
    content.includes("用户拒绝了工具调用");
}

/**
 * 清理 user 消息显示内容
 */
function cleanUserMessage(content: string): string {
  return content
    .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
    .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
    .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
    .trim();
}

// ============ 子组件 ============

/**
 * 过程步骤块 - 根据任务状态决定展开/折叠
 * - 当前轮次运行中：展开显示每个步骤
 * - 历史轮次或完成后：折叠成一行摘要
 */
const ProcessStepsBlock = memo(function ProcessStepsBlock({
  thinkingBlocks,
  toolCalls,
  totalSteps,
  isCurrentRound,
  t,
}: {
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCallInfo[];
  totalSteps: number;
  isCurrentRound: boolean;  // 是否是当前执行中的轮次
  t: any;
}) {
  const [manualExpanded, setManualExpanded] = useState(false);

  // 只有当前轮次运行中才自动展开，历史轮次保持折叠
  const isExpanded = isCurrentRound || manualExpanded;

  // 生成摘要文字
  const toolNames = [...new Set(toolCalls.map(t => t.name))];
  const summaryText = toolNames.length > 0
    ? `${toolNames.slice(0, 2).join(", ")}${toolNames.length > 2 ? "..." : ""}`
    : "思考";

  return (
    <div className="bg-muted/20 rounded-lg overflow-hidden">
      {/* 折叠头部 - 始终显示 */}
      <button
        onClick={() => setManualExpanded(!manualExpanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span>{totalSteps} 个步骤{!isExpanded && `: ${summaryText}`}</span>
      </button>

      {/* 展开内容 */}
      {isCurrentRound ? (
        // 当前轮次运行中：直接渲染，不使用动画（避免重渲染时的抖动）
        isExpanded && (
          <div className="px-3 pb-1.5 space-y-px">
            {thinkingBlocks.map((thinking, i) => (
              <ThinkingCollapsible key={`thinking-${i}`} thinking={thinking} t={t} />
            ))}
            {toolCalls.map((tool, i) => (
              <ToolCallCollapsible key={`tool-${i}`} tool={tool} t={t} />
            ))}
          </div>
        )
      ) : (
        // 完成后：使用动画进行折叠/展开
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-1.5 space-y-px">
                {thinkingBlocks.map((thinking, i) => (
                  <ThinkingCollapsible key={`thinking-${i}`} thinking={thinking} t={t} />
                ))}
                {toolCalls.map((tool, i) => (
                  <ToolCallCollapsible key={`tool-${i}`} tool={tool} t={t} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
});

/**
 * 思考块折叠组件
 */
const ThinkingCollapsible = memo(function ThinkingCollapsible({ thinking, t }: { thinking: ThinkingBlock, t: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        <span>{t.agentMessage.thinking}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 text-[11px] text-muted-foreground/60 whitespace-pre-wrap border-l border-muted-foreground/20 ml-1.5">
              {thinking.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * 工具调用折叠卡片
 */
const ToolCallCollapsible = memo(function ToolCallCollapsible({ tool, t }: { tool: ToolCallInfo, t: any }) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = tool.result !== undefined;
  const summary = getToolSummary(tool.name, tool.params, tool.result);

  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="font-medium">{tool.name}</span>

        {/* 状态图标 */}
        {isComplete ? (
          tool.success ? (
            <Check size={12} className="text-green-500/70" />
          ) : (
            <X size={12} className="text-red-500/70" />
          )
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}

        {/* 摘要 */}
        <span className="truncate flex-1 opacity-70">{summary}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-muted-foreground/20 ml-1.5">
              {tool.params && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">{t.agentMessage.params}:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto">
                    {tool.params}
                  </pre>
                </div>
              )}
              {tool.result && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">{t.agentMessage.result}:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto max-h-32 overflow-y-auto">
                    {tool.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============ 主组件 ============

interface AgentMessageRendererProps {
  messages: Message[];
  isRunning: boolean;
  className?: string;
  // 超时检测（LLM 请求级别）
  llmRequestStartTime?: number | null;
  onRetryTimeout?: () => void;
}

// 超时阈值：2 分钟
const TIMEOUT_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Agent 消息列表渲染器
 * 
 * 核心逻辑：将消息按"轮次"分组
 * - 每轮以用户消息开始
 * - 该轮内所有 assistant 消息的工具调用合并显示
 * - 最后一条 assistant 消息的 finalAnswer 作为最终回答
 */
export const AgentMessageRenderer = memo(function AgentMessageRenderer({
  messages,
  isRunning,
  className = "",
  llmRequestStartTime,
  onRetryTimeout,
}: AgentMessageRendererProps) {
  // 调试日志
  console.log("[AgentMessageRenderer] messages:", messages.length, messages.map(m => ({
    role: m.role,
    content: getTextFromContent(m.content).slice(0, 50)
  })));
  
  // 使用可复用的超时检测 hook
  const { isTimeout: isLongRunning } = useTimeout(llmRequestStartTime ?? null, {
    threshold: TIMEOUT_THRESHOLD_MS,
    enabled: isRunning,
  });

  // 收集所有工具结果
  const toolResults = useMemo(() => collectToolResults(messages), [messages]);

  const { t } = useLocaleStore();

  // 按轮次分组计算数据（只计算数据，不创建 JSX）
  const rounds = useMemo(() => {
    const result: Array<{
      userIdx: number;
      userContent: string;
      thinkingBlocks: ThinkingBlock[];
      toolCalls: ToolCallInfo[];
      finalAnswer: string;
      roundKey: string;
      hasAIContent: boolean;
    }> = [];

    // 找到所有用户消息的索引
    const userMessageIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === "user" && !shouldSkipUserMessage(getTextFromContent(msg.content))) {
        userMessageIndices.push(idx);
      }
    });

    userMessageIndices.forEach((userIdx, roundIndex) => {
      const userMsg = messages[userIdx];
      const displayContent = cleanUserMessage(getTextFromContent(userMsg.content));

      if (!displayContent) return;

      // 找到这轮的所有 assistant 消息
      const nextUserIdx = userMessageIndices[roundIndex + 1] ?? messages.length;
      const assistantMessages = messages.slice(userIdx + 1, nextUserIdx).filter(m => m.role === "assistant");

      // 聚合内容
      const allThinkingBlocks: ThinkingBlock[] = [];
      const allToolCalls: ToolCallInfo[] = [];
      let finalAnswer = "";

      assistantMessages.forEach((msg, msgIdx) => {
        const content = getTextFromContent(msg.content);
        
        // 处理 Rust Agent 的工具调用消息（格式: 🔧 tool_name: {...}）
        if (content.startsWith('🔧')) {
          const match = content.match(/🔧\s*(\w+):\s*(.+)/);
          if (match) {
            const toolName = match[1];
            const toolParams = match[2];
            // 查找对应的工具结果
            const resultKey = `${toolName}::${toolParams.slice(0, 100)}`;
            const resultData = toolResults.get(resultKey) || toolResults.get(toolName);
            allToolCalls.push({
              name: toolName,
              params: toolParams,
              result: resultData?.result,
              success: resultData?.success,
            });
          }
          return;
        }
        
        // 处理 Rust Agent 的工具结果消息（格式: ✅ 结果 或 ❌ 错误）
        if (content.startsWith('✅') || content.startsWith('❌')) {
          // 工具结果已经在 toolResults 中收集，这里跳过
          return;
        }
        
        const parsed = parseAssistantMessage(content, toolResults);
        allThinkingBlocks.push(...parsed.thinkingBlocks);
        allToolCalls.push(...parsed.toolCalls);
        
        // 优先使用 attempt_completion_result 或 attempt_completion 中的 result
        if (parsed.finalAnswer) {
          finalAnswer = parsed.finalAnswer;
        }
        
        // 如果没有结构化的 finalAnswer，使用纯文本
        // 对于 Rust Agent，优先使用最后一条消息（reporter 的回复）
        if (parsed.rawTextBeforeCompletion) {
          const fallback = parsed.rawTextBeforeCompletion.trim();
          if (fallback.length > 0) {
            // 最后一条消息的优先级最高（通常是 reporter 的总结）
            const isLastMessage = msgIdx === assistantMessages.length - 1;
            if (isLastMessage || !finalAnswer) {
              finalAnswer = fallback;
            }
          }
        }
      });

      // 使用用户消息内容的前 50 字符作为稳定 key
      const roundKey = `round-${displayContent.slice(0, 50)}`;

      // 判断是否有 AI 回复内容
      // 如果存在解析出的原始文本（即使没有结构化 finalAnswer），也应视为有回复并显示
      const hasAIContent = allThinkingBlocks.length > 0 || allToolCalls.length > 0 || !!finalAnswer;

      result.push({
        userIdx,
        userContent: displayContent,
        thinkingBlocks: allThinkingBlocks,
        toolCalls: allToolCalls,
        finalAnswer,
        roundKey,
        hasAIContent,
      });
    });

    return result;
  }, [messages, toolResults]);

  return (
    <div className={className}>
      {rounds.map((round, index) => {
        const hasProcessSteps = round.thinkingBlocks.length > 0 || round.toolCalls.length > 0;
        const totalSteps = round.thinkingBlocks.length + round.toolCalls.length;
        // 只有最后一轮且 Agent 正在运行时才是"当前轮次"
        const isCurrentRound = isRunning && index === rounds.length - 1;

        return (
          <div key={round.roundKey}>
            {/* 用户消息 */}
            <div className="flex justify-end mb-4">
              <div className="max-w-[80%] bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
                <span className="text-sm">{round.userContent}</span>
              </div>
            </div>

            {/* AI 回复 - 只有在有内容时才显示 */}
            {round.hasAIContent && (
              <div className="flex gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {hasProcessSteps && (
                    <ProcessStepsBlock
                      key={`steps-${round.roundKey}`}
                      thinkingBlocks={round.thinkingBlocks}
                      toolCalls={round.toolCalls}
                      totalSteps={totalSteps}
                      isCurrentRound={isCurrentRound}
                      t={t}
                    />
                  )}

                  {round.finalAnswer && (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: (() => {
                        let content = round.finalAnswer;
                        
                        // 如果内容换行符很少，尝试添加必要的换行
                        const newlineCount = (content.match(/\n/g) || []).length;
                        const contentLength = content.length;
                        // 如果平均每 200 字符不到一个换行，说明换行符不足
                        if (contentLength > 100 && newlineCount < contentLength / 200) {
                          // 在 Markdown 标记前添加换行符
                          content = content
                            // 标题 (# ## ### 等)
                            .replace(/(?<!^|\n)(#{1,6}\s)/g, '\n\n$1')
                            // 表格行 (| xxx | xxx |)
                            .replace(/(?<!^|\n)(\|[^|]+\|)/g, '\n$1')
                            // 粗体段落开头 (**xxx**)
                            .replace(/(?<!^|\n)(\*\*[^*]+\*\*)/g, '\n$1')
                            // emoji 段落开头 (✅ 📊 💡 等)
                            .replace(/(?<!^|\n)([\u{1F300}-\u{1F9FF}]\s)/gu, '\n\n$1')
                            // 有序列表 (1. 2. 等)
                            .replace(/(?<!^|\n)(\d+\.\s)/g, '\n$1')
                            // 无序列表 (- 开头)
                            .replace(/(?<!^|\n)(-\s+\*\*)/g, '\n$1')
                            // 分隔线
                            .replace(/(---)/g, '\n$1\n')
                            // 清理多余换行
                            .replace(/\n{3,}/g, '\n\n')
                            .trim();
                          console.log("[AgentMessageRenderer] Enhanced newlines, original:", newlineCount, "chars:", contentLength);
                        }
                        
                        const html = parseMarkdown(content);
                        return html;
                      })() }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 超时提示 */}
      {isRunning && isLongRunning && onRetryTimeout && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-sm mt-2"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span>当前 LLM 请求响应时间过长（超过 2 分钟）</span>
          <button
            onClick={onRetryTimeout}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-md transition-colors font-medium"
          >
            <RefreshCw size={14} />
            <span>中断并重试</span>
          </button>
        </motion.div>
      )}
    </div>
  );
});

/**
 * 复制按钮组件
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="复制"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

export default AgentMessageRenderer;
