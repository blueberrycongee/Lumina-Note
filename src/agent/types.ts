/**
 * Agent 系统类型定义
 */

import type { Message, LLMConfig } from "@/services/llm";

// 重新导出 LLM 类型供外部使用
export type { 
  Message, 
  LLMOptions, 
  LLMResponse, 
  LLMProvider,
  LLMConfig,
  LLMProviderType,
} from "@/services/llm";

// ============ Agent 状态 ============

export type AgentStatus = 
  | "idle" 
  | "running" 
  | "waiting_approval" 
  | "completed" 
  | "error" 
  | "aborted";

export interface AgentState {
  status: AgentStatus;
  messages: Message[];
  currentTask: string | null;
  pendingTool: ToolCall | null;
  consecutiveErrors: number;
  lastError: string | null;
}

// ============ 工具系统 ============

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  raw: string; // 原始 XML 字符串
}

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  definition: string; // 给 LLM 看的完整描述
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
}

export interface ToolExecutor {
  name: string;
  requiresApproval: boolean;
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  workspacePath: string;
  activeNotePath?: string;
}

// ============ 任务上下文 ============

export interface TaskContext {
  workspacePath: string;
  activeNote?: string;
  activeNoteContent?: string;
  fileTree?: string;
  recentNotes?: string[];
  mode?: AgentMode;
}

// ============ Agent 模式 ============

export type AgentModeSlug = "editor" | "organizer" | "researcher" | "writer";

export interface AgentMode {
  slug: AgentModeSlug;
  name: string;
  icon: string;
  roleDefinition: string;
  tools: string[];
  systemPromptAdditions?: string;
}

// ============ 事件系统 ============

export type AgentEventType = 
  | "message" 
  | "tool_call" 
  | "tool_result" 
  | "status_change" 
  | "error" 
  | "complete";

export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
  timestamp: number;
}

export type AgentEventHandler = (event: AgentEvent) => void;

// ============ Agent 配置 ============

export interface AgentConfig {
  // AI 提供商配置 (使用统一的 LLMConfig)
  ai: LLMConfig;

  // Agent 配置
  agent: {
    defaultMode: AgentModeSlug;
    autoApproveReadTools: boolean;
    maxConsecutiveErrors: number;
    streamingEnabled: boolean;
  };
}
