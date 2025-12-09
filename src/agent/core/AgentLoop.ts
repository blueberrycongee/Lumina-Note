/**
 * Agent 主循环
 * 
 * 负责：
 * 1. 管理 Agent 生命周期
 * 2. 协调 LLM 调用和工具执行
 * 3. 处理用户审批流程
 */

import {
  Message,
  TaskContext,
  ToolCall,
  ToolResult,
  AgentEventHandler,
  AgentEventType,
  LLMResponse,
  RAGSearchResult,
  LLMConfig,
  ResolvedLink
} from "../types";
import { StateManager } from "./StateManager";
import { parseResponse, formatToolResult, getNoToolUsedPrompt } from "./MessageParser";
import { PromptBuilder } from "../prompts/PromptBuilder";
import { ToolRegistry } from "../tools/ToolRegistry";
import { callLLM } from "../providers";
import { useRAGStore } from "@/stores/useRAGStore";
import { useNoteIndexStore, extractWikiLinks } from "@/stores/useNoteIndexStore";
import { readFile } from "@/lib/tauri";
import { getToolSchemas } from "../tools/schemas";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { cacheToolOutput } from "./ToolOutputCache";

const MAX_CONSECUTIVE_ERRORS = 3;
const LONG_TOOL_RESULT_THRESHOLD = 4000;

export class AgentLoop {
  private stateManager: StateManager;
  private promptBuilder: PromptBuilder;
  private toolRegistry: ToolRegistry;
  private abortController: AbortController | null = null;
  private approvalResolver: ((approved: boolean) => void) | null = null;

  constructor() {
    this.stateManager = new StateManager();
    this.promptBuilder = new PromptBuilder();
    this.toolRegistry = new ToolRegistry();
  }

  // ============ 公共 API ============

  /**
   * 设置消息历史（用于恢复会话）
   */
  setMessages(messages: Message[]): void {
    this.stateManager.setMessages(messages);
  }

  /**
   * 启动 Agent 任务
   */
  async startTask(userMessage: string, context: TaskContext, configOverride?: Partial<LLMConfig>): Promise<void> {
    // 保存现有消息（不重置）
    const existingMessages = this.stateManager.getMessages();
    const hasHistory = existingMessages.length > 1; // 除了 system 消息外还有其他消息

    // 重置状态但保留消息历史
    this.stateManager.setStatus("running");
    this.stateManager.setTask(userMessage);
    this.stateManager.resetErrors();
    this.stateManager.setLLMConfig(configOverride);
    this.abortController = new AbortController();

    // 1. 显式引用解析：从用户消息和当前笔记中提取 [[wikilinks]] 并读取内容
    let enrichedContext = await this.resolveWikiLinks(userMessage, context);

    // 2. RAG 自动注入：搜索相关笔记（排除已解析的显式引用）
    enrichedContext = await this.enrichContextWithRAG(userMessage, enrichedContext);

    // 构建消息
    const systemPrompt = this.promptBuilder.build(enrichedContext);
    const userContent = this.buildUserContent(userMessage, enrichedContext);

    if (hasHistory) {
      // 保留历史，更新 system prompt，添加新用户消息
      let newMessages = existingMessages.map((msg, i) =>
        i === 0 && msg.role === "system"
          ? { role: "system" as const, content: systemPrompt }
          : msg
      );
      newMessages.push({ role: "user", content: userContent });
      this.stateManager.setMessages(newMessages);
    } else {
      // 首次任务，初始化消息
      this.stateManager.setMessages([
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ]);
    }

    // 进入主循环
    try {
      await this.runLoop(context);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
      } else {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error instanceof Error ? error.message : getCurrentTranslations().prompts.agentLoop.unknownError);
      }
    }
  }

  /**
   * 中止当前任务
   */
  abort(): void {
    this.abortController?.abort();
    this.stateManager.setStatus("aborted");

    // 如果正在等待审批，拒绝
    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  /**
   * 审批工具调用
   */
  approveToolCall(approved: boolean): void {
    if (this.approvalResolver) {
      this.approvalResolver(approved);
      this.approvalResolver = null;
    }
  }

  /**
   * 继续执行循环（用于超时重试）
   * 不创建新任务，直接从当前消息状态继续
   */
  async continueLoop(context: TaskContext, configOverride?: Partial<LLMConfig>): Promise<void> {
    this.abortController = new AbortController();
    this.stateManager.setLLMConfig(configOverride);
    this.stateManager.setStatus("running");

    try {
      await this.runLoop(context);

      const status = this.stateManager.getStatus();
      if (status === "running") {
        this.stateManager.setStatus("completed");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
      } else {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error instanceof Error ? error.message : getCurrentTranslations().prompts.agentLoop.unknownError);
      }
    }
  }

  /**
   * 添加超时提示（用于 LLM 请求超时时追加提示消息）
   */
  addTimeoutHint(hint: string): void {
    this.stateManager.addMessage({
      role: "user",
      content: hint,
    });
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * 事件监听
   */
  on(event: AgentEventType, handler: AgentEventHandler): () => void {
    return this.stateManager.on(event, handler);
  }

  // ============ 私有方法 ============

  /**
   * Agent 主循环
   */
  private async runLoop(context: TaskContext): Promise<void> {
    while (
      this.stateManager.getStatus() === "running" &&
      !this.abortController?.signal.aborted
    ) {
      try {
        const messages = this.stateManager.getMessages();

        // 1. 获取当前模式可用的工具名称
        const toolNames = context.mode?.tools || [];

        // 2. 调用 LLM（传入工具用于 FC 模式）
        const response = await this.callLLM(messages, toolNames);

        // 3. 优先使用 FC 响应中的 toolCalls，否则回退到 XML 解析
        let toolCalls: ToolCall[];
        let isCompletion = false;
        let isFCMode = false;

        if (response.toolCalls && response.toolCalls.length > 0) {
          // FC 模式：直接使用结构化的工具调用
          isFCMode = true;
          toolCalls = response.toolCalls.map(tc => ({
            name: tc.name,
            params: tc.arguments,
            raw: JSON.stringify(tc),
          }));
          isCompletion = toolCalls.some(tc => tc.name === "attempt_completion");
          console.log("[Agent] 使用 Function Calling 模式，工具调用:", toolCalls.map(tc => tc.name));
        } else {
          // XML 解析模式：从文本中解析工具调用
          const parsedResponse = parseResponse(response.content);
          toolCalls = parsedResponse.toolCalls;
          isCompletion = parsedResponse.isCompletion;
        }

        // 4. 添加 assistant 消息
        // FC 模式下，把工具调用转换为 XML 格式附加到 content，便于前端解析显示
        let assistantContent = response.content;
        if (isFCMode && toolCalls.length > 0) {
          const toolCallsXml = toolCalls.map(tc => {
            const paramsXml = Object.entries(tc.params)
              .map(([key, value]) => `<${key}>${typeof value === 'string' ? value : JSON.stringify(value)}</${key}>`)
              .join('\n');
            return `<${tc.name}>\n${paramsXml}\n</${tc.name}>`;
          }).join('\n\n');
          assistantContent = `${response.content}\n\n${toolCallsXml}`;
        }

        this.stateManager.addMessage({
          role: "assistant",
          content: assistantContent,
        });

        // 5. 处理工具调用
        if (toolCalls.length > 0) {
          await this.handleToolCalls(toolCalls, context);

          // 如果调用了 attempt_completion，任务完成，退出循环
          if (isCompletion) {
            this.stateManager.setStatus("completed");
            break;
          }
        } else if (isCompletion) {
          // 任务完成（无工具调用但有完成标记）
          this.stateManager.setStatus("completed");
          break;
        } else {
          // 没有工具调用也没有完成标记

          // 检查是否是纯文本回复（可能是闲聊）
          // 移除 thinking 标签后，如果剩余内容不包含类似工具调用的标签，则视为普通回复
          const cleanContent = response.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();

          // 移除代码块，避免误判代码中的标签
          const contentWithoutCode = cleanContent.replace(/```[\s\S]*?```/g, "");

          // 检查是否有潜在的工具标签（简单的启发式：包含下划线的标签通常是工具，如 <read_note>）
          // 如果 parseResponse 没解析出来，但这里匹配到了，说明可能是格式错误的工具调用
          const hasPotentialToolTag = /<[a-z]+(_[a-z]+)+/i.test(contentWithoutCode);

          // 只有在非严格模式下（如 chat/writer/researcher），或者看起来像是提问时，才允许纯文本结束
          // 对于 editor/organizer，我们期望它至少调用 ask_user 或 attempt_completion
          const currentMode = context.mode?.slug;
          const intent = context.intent;

          // 如果意图明确是 chat，则允许纯文本回复
          if (intent === "chat") {
            this.stateManager.setStatus("completed");
            break;
          }

          // 否则，如果是操作模式，则强制要求使用工具
          const isActionOrientedMode = currentMode === "editor" || currentMode === "organizer";
          // 检查是否是明确的操作意图 (create/edit/organize)
          const isExplicitActionIntent = intent === "create" || intent === "edit" || intent === "organize";

          if (!hasPotentialToolTag && cleanContent.length > 0) {
            if (isActionOrientedMode || isExplicitActionIntent) {
              // 在操作模式或操作意图下，如果回复很短（可能是简单的确认或拒绝），或者包含问号（可能是提问），则允许通过
              // 否则，强制要求使用工具，防止 Agent 幻觉（说做了但没做）
              const isShortReply = cleanContent.length < 50;
              const isQuestion = cleanContent.includes("?") || cleanContent.includes("？");

              // 只有当意图不是明确的操作意图时，才允许简短回复通过
              // 如果意图明确是 create/edit/organize，即使回复很短，也必须使用工具（除非是提问）

              if ((isShortReply || isQuestion) && (!isExplicitActionIntent || isQuestion)) {
                this.stateManager.setStatus("completed");
                break;
              }
              // 否则，继续执行下面的错误处理，强制要求使用工具
            } else {
              // 非操作模式（Writer/Researcher），允许纯文本回复
              this.stateManager.setStatus("completed");
              break;
            }
          }

          this.stateManager.incrementErrors();

          if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
            this.stateManager.setStatus("error");
            this.stateManager.setError(getCurrentTranslations().prompts.agentLoop.toolUseFailed);
            break;
          }

          // 提示 LLM 使用工具
          this.stateManager.addMessage({
            role: "user",
            content: getNoToolUsedPrompt(),
          });
        }
      } catch (error) {
        this.handleError(error);

        if (this.stateManager.getStatus() === "error") {
          break;
        }
      }
    }
  }

  /**
   * 调用 LLM
   * 支持 Function Calling 模式（DeepSeek/OpenAI 等）
   */
  private async callLLM(messages: Message[], toolNames?: string[]): Promise<LLMResponse> {
    const configOverride = this.stateManager.getLLMConfig();

    // 记录 LLM 请求开始时间并增加计数
    this.stateManager.setLLMRequestStartTime(Date.now());
    this.stateManager.incrementLLMRequestCount();

    const requestCount = this.stateManager.getLLMRequestCount();
    console.log(`[Agent] LLM 请求 #${requestCount} 开始`);

    // 获取工具 schemas 用于 FC 模式
    const tools = toolNames ? getToolSchemas(toolNames) : undefined;

    try {
      const response = await callLLM(messages, {
        signal: this.abortController?.signal,
        tools,
      }, configOverride);

      console.log(`[Agent] LLM 请求 #${requestCount} 完成`);

      // 请求完成后清除开始时间（但保留计数）
      this.stateManager.setLLMRequestStartTime(null);

      // 累计 token 使用量
      if (response.usage) {
        this.stateManager.addTokenUsage({
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        });
      }

      return response;
    } catch (error) {
      console.error(`[Agent] LLM 请求 #${requestCount} 失败:`, error);
      this.stateManager.setLLMRequestStartTime(null);
      throw error;
    }
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(toolCalls: ToolCall[], context: TaskContext): Promise<void> {
    for (const toolCall of toolCalls) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 协议动作：attempt_completion 直接处理，不再走工具执行器
      if (toolCall.name === "attempt_completion") {
        const completionResult = typeof toolCall.params.result === "string" ? toolCall.params.result : "";
        if (completionResult) {
          this.stateManager.addMessage({
            role: "assistant",
            content: `<attempt_completion_result>\n${completionResult}\n</attempt_completion_result>`,
          });
        }
        this.stateManager.setStatus("completed");
        this.stateManager.setPendingTool(null);
        return;
      }

      // 协议动作：ask_user 直接写入问题，不再走工具执行器，并进入 waiting_user
      if (toolCall.name === "ask_user") {
        const question = typeof toolCall.params.question === "string" ? toolCall.params.question : "";
        const options = Array.isArray(toolCall.params.options) ? toolCall.params.options : null;
        const t = getCurrentTranslations().prompts.agentLoop;
        const optionsText = options && options.length > 0 ? `\n\n${t.options}:\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "";
        const content = `**${t.agentQuestion}**\n${question}${optionsText}`.trim();

        const askResult: ToolResult = {
          success: true,
          content: content || getCurrentTranslations().prompts.agentLoop.noQuestionProvided,
        };

        const askMessage = formatToolResult(toolCall, askResult);
        this.stateManager.addMessage({
          role: "user",
          content: askMessage,
        });

        this.stateManager.setStatus("running");
        this.stateManager.setPendingTool(null);
        this.stateManager.resetErrors();
        this.stateManager.setStatus("waiting_user");
        return;
      }

      // 检查是否需要用户审批
      if (this.requiresApproval(toolCall)) {
        // 先创建等待 Promise（设置 resolver），再更新状态
        // 这样自动审批的回调才能正确调用 resolver
        const approvalPromise = this.waitForApproval();

        this.stateManager.setStatus("waiting_approval");
        this.stateManager.setPendingTool(toolCall);

        // 等待用户审批
        const approved = await approvalPromise;

        if (!approved) {
          this.stateManager.addMessage({
            role: "user",
            content: getCurrentTranslations().prompts.agentLoop.userRejected.replace('{toolName}', toolCall.name),
          });
          this.stateManager.setStatus("running");
          continue;
        }
      }

      // 执行工具
      let result = await this.executeTool(toolCall, context);

      // 长输出：摘要 + 缓存，避免占用上下文
      if (
        toolCall.name !== "attempt_completion" &&
        result.success &&
        typeof result.content === "string" &&
        result.content.length > LONG_TOOL_RESULT_THRESHOLD
      ) {
        const cacheId = cacheToolOutput(toolCall.name, result.content);
        const summary = await this.summarizeToolOutput(result.content, toolCall.name);
        const summaryText = summary?.trim() || result.content.slice(0, LONG_TOOL_RESULT_THRESHOLD);
        result = {
          ...result,
          content: `${summaryText}\n\n${getCurrentTranslations().prompts.agentLoop.longOutputCached.replace(/{cacheId}/g, cacheId)}`,
        };
      }

      // 将结果添加到消息
      let resultMsg = formatToolResult(toolCall, result);

      // 如果执行失败，追加反思提示
      if (!result.success) {
        resultMsg += `\n\n${getCurrentTranslations().prompts.agentLoop.toolErrorReflection}`;
      }

      this.stateManager.addMessage({
        role: "user",
        content: resultMsg,
      });

      this.stateManager.resetErrors();
    }

    this.stateManager.setStatus("running");
    this.stateManager.setPendingTool(null);
  }

  /**
   * 判断工具是否需要用户审批
   */
  private requiresApproval(toolCall: ToolCall): boolean {
    return this.toolRegistry.requiresApproval(toolCall.name);
  }

  /**
   * 等待用户审批
   */
  private waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
    });
  }

  /**
   * 使用当前 Chat 模型配置对长结果生成摘要
   */
  private async summarizeToolOutput(content: string, toolName: string): Promise<string | null> {
    const configOverride = this.stateManager.getLLMConfig();
    const t = getCurrentTranslations().prompts.agentLoop;
    const messages: Message[] = [
      {
        role: "system",
        content: t.summarySystem,
      },
      {
        role: "user",
        content: `${t.summaryUser.replace('{toolName}', toolName)}\n\n<output>\n${content}\n</output>`,
      },
    ];

    try {
      const response = await callLLM(
        messages,
        { signal: this.abortController?.signal },
        configOverride
      );
      return response.content?.trim() || null;
    } catch (error) {
      console.error("[Agent] 摘要工具输出失败:", error);
      return null;
    }
  }

  /**
   * 执行工具
   */
  private async executeTool(toolCall: ToolCall, context: TaskContext): Promise<ToolResult> {
    try {
      return await this.toolRegistry.execute(toolCall.name, toolCall.params, {
        workspacePath: context.workspacePath,
        activeNotePath: context.activeNote,
      });
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : getCurrentTranslations().prompts.agentLoop.toolExecutionFailed,
      };
    }
  }

  /**
   * 显式引用解析：从用户消息和当前笔记中提取 [[wikilinks]] 并读取内容
   * "顺藤摸瓜" 策略 - 用户显式写了 [[link]]，就一定要把它加载进来
   */
  private async resolveWikiLinks(userMessage: string, context: TaskContext): Promise<TaskContext> {
    try {
      // 从用户消息和当前笔记内容中提取所有 [[wikilinks]]
      const linksFromMessage = extractWikiLinks(userMessage);
      const linksFromNote = context.activeNoteContent 
        ? extractWikiLinks(context.activeNoteContent) 
        : [];
      
      // 合并去重
      const allLinks = [...new Set([...linksFromMessage, ...linksFromNote])];
      
      if (allLinks.length === 0) {
        return context;
      }

      console.log(`[Agent] 显式引用解析: 发现 ${allLinks.length} 个 wikilinks:`, allLinks);

      // 获取笔记索引，用于将链接名解析为文件路径
      const noteIndex = useNoteIndexStore.getState().noteIndex;
      
      // 构建 name -> path 映射
      const nameToPath = new Map<string, string>();
      noteIndex.forEach((note) => {
        nameToPath.set(note.name.toLowerCase(), note.path);
      });

      // 解析每个链接
      const resolvedLinks: ResolvedLink[] = [];
      const resolvedPaths = new Set<string>(); // 用于去重

      // 排除当前打开的笔记
      if (context.activeNote) {
        resolvedPaths.add(context.activeNote);
      }

      for (const linkName of allLinks) {
        const filePath = nameToPath.get(linkName.toLowerCase());
        
        if (!filePath || resolvedPaths.has(filePath)) {
          continue;
        }

        try {
          const content = await readFile(filePath);
          resolvedLinks.push({
            linkName,
            filePath,
            content,
          });
          resolvedPaths.add(filePath);
        } catch (e) {
          console.warn(`[Agent] 无法读取引用笔记: ${linkName} (${filePath})`, e);
        }
      }

      if (resolvedLinks.length > 0) {
        console.log(`[Agent] 显式引用注入: 成功解析 ${resolvedLinks.length} 个笔记`);
      }

      return {
        ...context,
        resolvedLinks,
      };
    } catch (error) {
      console.error("[Agent] 显式引用解析失败:", error);
      return context;
    }
  }

  /**
   * RAG 自动注入：搜索相关笔记并增强上下文
   */
  private async enrichContextWithRAG(userMessage: string, context: TaskContext): Promise<TaskContext> {
    // 如果消息太短（少于 5 个字符），不进行搜索
    if (userMessage.length < 5) {
      return context;
    }

    try {
      const ragStore = useRAGStore.getState();
      const ragManager = ragStore.ragManager;
      const ragConfig = ragStore.config;

      // 检查 RAG 是否启用和初始化
      if (!ragConfig.enabled || !ragManager?.isInitialized()) {
        return context;
      }

      // 执行语义搜索
      const results = await ragManager.search(userMessage, { limit: 10 });

      if (results.length === 0) {
        return context;
      }

      // 获取已解析的显式引用路径，用于去重
      const resolvedPaths = new Set(
        (context.resolvedLinks || []).map(l => l.filePath)
      );

      // 转换为 RAGSearchResult 格式，确保字段有效，并排除已解析的显式引用
      const ragResults: RAGSearchResult[] = results
        .filter(r => r.filePath && r.content && !resolvedPaths.has(r.filePath))
        .map(r => ({
          filePath: r.filePath || getCurrentTranslations().prompts.agentLoop.unknownFile,
          content: r.content || "",
          score: typeof r.score === "number" && !isNaN(r.score) ? r.score : 0,
          heading: r.heading || undefined,
        }));

      console.log(`[Agent] RAG 自动注入: 找到 ${ragResults.length} 个相关笔记 (已排除显式引用)`);

      return {
        ...context,
        ragResults,
      };
    } catch (error) {
      console.error("[Agent] RAG 搜索失败:", error);
      return context;
    }
  }

  /**
   * 构建用户消息内容
   */
  private buildUserContent(message: string, context: TaskContext): string {
    let content = `<task>\n${message}\n</task>`;

    // 如果有当前打开的笔记，添加其内容
    if (context.activeNote && context.activeNoteContent) {
      content += `\n\n<current_note path="${context.activeNote}">\n${context.activeNoteContent}\n</current_note>`;
    }

    // 显式引用注入：用户在消息或笔记中写了 [[link]]，优先级最高
    if (context.resolvedLinks && context.resolvedLinks.length > 0) {
      content += `\n\n<referenced_notes hint="${getCurrentTranslations().prompts.agentLoop.referencedNotesHint}">`;
      context.resolvedLinks.forEach((link, i) => {
        // 显式引用给更多内容（最多 1500 字符），因为用户明确想要这些
        const preview = link.content.length > 1500 
          ? link.content.slice(0, 1500) + "..." 
          : link.content;
        content += `\n\n### ${i + 1}. [[${link.linkName}]] → ${link.filePath}\n${preview}`;
      });
      content += `\n</referenced_notes>`;
    }

    // RAG 自动注入：添加 top 3 相关笔记的详细内容
    if (context.ragResults && context.ragResults.length > 0) {
      const topResults = context.ragResults.slice(0, 3);
      content += `\n\n<related_notes hint="${getCurrentTranslations().prompts.agentLoop.relatedNotesHint}">`;
      topResults.forEach((r, i) => {
        const preview = r.content.length > 600 ? r.content.slice(0, 600) + "..." : r.content;
        content += `\n\n### ${i + 1}. ${r.filePath} (${getCurrentTranslations().prompts.agentLoop.relevance}: ${(r.score * 100).toFixed(0)}%)${r.heading ? ` - ${r.heading}` : ""}\n${preview}`;
      });
      content += `\n</related_notes>`;
    }

    return content;
  }

  /**
   * 处理错误
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
        return;
      }

      this.stateManager.incrementErrors();

      if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error.message);
      } else {
        // 添加错误信息让 LLM 重试
        this.stateManager.addMessage({
          role: "user",
          content: getCurrentTranslations().prompts.agentLoop.systemError.replace('{message}', error.message),
        });
      }
    }
  }
}

// 导出单例
let agentLoop: AgentLoop | null = null;

export function getAgentLoop(): AgentLoop {
  if (!agentLoop) {
    agentLoop = new AgentLoop();
  }
  return agentLoop;
}

export function resetAgentLoop(): void {
  agentLoop = null;
}
