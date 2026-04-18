/**
 * Agent 类型定义 — renderer ↔ main 共用的协议类型。
 *
 * 这是 Phase 1 的骨架。后续 Phase 1.3 填 runtime,1.4 填 approval gate,
 * Phase 2 接 Vercel AI SDK 作为 ProviderInterface 的具体实现。
 */

export type SessionId = string

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface Message {
  role: MessageRole
  content: string | ContentBlock[]
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface TaskContext {
  workspace_path: string
  active_note_path?: string
  active_note_content?: string
  display_message?: string
  attachments?: unknown[]
}

export type RunStatus =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'aborted'
  | 'error'

export interface UsageInfo {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// main → renderer push events (沿 'agent:event' IPC channel)
export type AgentEvent =
  | { type: 'status'; session_id: SessionId; status: RunStatus }
  | { type: 'text_delta'; session_id: SessionId; text: string }
  | {
      type: 'tool_call_start'
      session_id: SessionId
      tool_call: ToolCall
    }
  | {
      type: 'tool_call_end'
      session_id: SessionId
      tool_call_id: string
      result?: string
      error?: string
    }
  | {
      type: 'approval_requested'
      session_id: SessionId
      tool_call: ToolCall
    }
  | { type: 'usage'; session_id: SessionId; usage: UsageInfo }
  | {
      type: 'finish'
      session_id: SessionId
      reason: 'done' | 'aborted' | 'error' | 'max_turns'
      message?: string
    }
  | { type: 'error'; session_id: SessionId; error: string }

export type ApprovalDecision = 'approve' | 'reject'

// renderer → main (via ipcRenderer.invoke)
export interface StartTaskRequest {
  task: string
  context: TaskContext
}

export interface ApproveToolRequest {
  tool_call_id: string
  decision: ApprovalDecision
  reason?: string
}

// Provider abstraction — Phase 2 会用 Vercel AI SDK 实现这个接口
export interface ProviderChunk {
  type: 'text' | 'tool_call' | 'usage' | 'finish' | 'error'
  text?: string
  tool_call?: ToolCall
  usage?: UsageInfo
  finish_reason?: string
  error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ProviderInterface {
  stream(
    messages: Message[],
    tools: ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk>
}
