import { invoke } from "@tauri-apps/api/core";
import { join } from "@/lib/path";
import type { AgentConfig, Message } from "@/stores/useRustAgentStore";

export type SessionMemoryUpdateReason =
  | "token_threshold"
  | "tool_call_threshold"
  | "task_stage_completed"
  | "session_switch"
  | "compact_prepare";

export interface SessionMemory {
  sessionId: string;
  workspacePath: string;
  path: string;
  content: string;
  initialized: boolean;
}

export interface SessionMemoryConfig {
  minimumTokensToInit: number;
  minimumTokensBetweenUpdates: number;
  toolCallsBetweenUpdates: number;
  maxTranscriptChars: number;
  maxOutputTokens: number;
}

export interface SessionMemorySnapshot extends SessionMemory {
  exists: boolean;
  extractionInFlight: boolean;
  lastUpdatedAt: number | null;
  lastUpdateReason: SessionMemoryUpdateReason | null;
  tokensAtLastUpdate: number;
  toolCallsAtLastUpdate: number;
  messageCountAtLastUpdate: number;
}

interface UpdateSessionMemoryInput {
  workspacePath: string;
  sessionId: string;
  messages: Message[];
  reason: SessionMemoryUpdateReason;
  config: AgentConfig;
  force?: boolean;
  sessionMemoryConfig?: Partial<SessionMemoryConfig>;
}

interface BackendSessionMemoryConfig {
  minimum_tokens_to_init: number;
  minimum_tokens_between_updates: number;
  tool_calls_between_updates: number;
  max_transcript_chars: number;
  max_output_tokens: number;
}

interface BackendSessionMemorySnapshot {
  session_id: string;
  workspace_path: string;
  path: string;
  content: string;
  exists: boolean;
  initialized: boolean;
  extraction_in_flight: boolean;
  last_updated_at: number | null;
  last_update_reason: SessionMemoryUpdateReason | null;
  tokens_at_last_update: number;
  tool_calls_at_last_update: number;
  message_count_at_last_update: number;
}

const DEFAULT_SESSION_MEMORY_CONFIG: SessionMemoryConfig = {
  minimumTokensToInit: 3000,
  minimumTokensBetweenUpdates: 1200,
  toolCallsBetweenUpdates: 3,
  maxTranscriptChars: 24000,
  maxOutputTokens: 1400,
};

const SESSION_MEMORY_TEMPLATE = `# Session Overview
_A compact summary of what this session is about, who is doing what, and the current scope._

# Current State
_What is actively in progress right now, what is done, and what likely happens next._

# User Goal
_What the user explicitly asked for, including constraints, preferences, and intended outcome._

# Important Files and Components
_Key files, modules, functions, UI surfaces, or data structures that matter for the current work._

# Decisions and Constraints
_Important implementation decisions, tradeoffs, constraints, and assumptions that should survive compaction._

# Commands and Verification
_Notable commands, tests, checks, or runtime observations and what they showed._

# Open Questions and Risks
_Anything still uncertain, risky, incomplete, or worth double-checking later._

# Recent Progress
_Short chronological notes of what was completed during this session._
`;

function normalizeConfig(
  override?: Partial<SessionMemoryConfig>,
): SessionMemoryConfig {
  return {
    ...DEFAULT_SESSION_MEMORY_CONFIG,
    ...override,
  };
}

function sanitizeSessionId(sessionId: string) {
  const sanitized = sessionId
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
  return sanitized || "default-session";
}

function estimateTokensFromText(text: string) {
  if (!text) return 0;
  const ascii = text.replace(/[^\x00-\x7F]/g, "");
  const asciiLen = ascii.length;
  const nonAsciiLen = text.length - asciiLen;
  return Math.ceil(asciiLen / 4) + Math.ceil(nonAsciiLen / 1.5);
}

function estimateMessagesTokens(messages: Message[]) {
  return messages.reduce((total, message) => {
    if (!message?.content) return total;
    return total + estimateTokensFromText(String(message.content)) + 4;
  }, 0);
}

function countToolMessages(messages: Message[]) {
  return messages.filter((message) => message.role === "tool").length;
}

function toBackendSnapshot(
  snapshot: BackendSessionMemorySnapshot,
): SessionMemorySnapshot {
  return {
    sessionId: snapshot.session_id,
    workspacePath: snapshot.workspace_path,
    path: snapshot.path,
    content: snapshot.content,
    exists: snapshot.exists,
    initialized: snapshot.initialized,
    extractionInFlight: snapshot.extraction_in_flight,
    lastUpdatedAt: snapshot.last_updated_at,
    lastUpdateReason: snapshot.last_update_reason,
    tokensAtLastUpdate: snapshot.tokens_at_last_update,
    toolCallsAtLastUpdate: snapshot.tool_calls_at_last_update,
    messageCountAtLastUpdate: snapshot.message_count_at_last_update,
  };
}

function toBackendSessionMemoryConfig(
  config?: Partial<SessionMemoryConfig>,
): BackendSessionMemoryConfig | undefined {
  if (!config) return undefined;
  const normalized = normalizeConfig(config);
  return {
    minimum_tokens_to_init: normalized.minimumTokensToInit,
    minimum_tokens_between_updates: normalized.minimumTokensBetweenUpdates,
    tool_calls_between_updates: normalized.toolCallsBetweenUpdates,
    max_transcript_chars: normalized.maxTranscriptChars,
    max_output_tokens: normalized.maxOutputTokens,
  };
}

async function invokeSessionMemory<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Session memory command ${command} failed: ${message}`);
  }
}

export function buildSessionMemoryPath(
  workspacePath: string,
  sessionId: string,
) {
  return join(
    workspacePath,
    "memory",
    "session",
    sanitizeSessionId(sessionId),
    "session-memory.md",
  );
}

export function buildSessionMemoryTemplate() {
  return SESSION_MEMORY_TEMPLATE;
}

export function shouldUpdateSessionMemory(params: {
  messages: Message[];
  reason: SessionMemoryUpdateReason;
  snapshot: SessionMemorySnapshot | null;
  sessionMemoryConfig?: Partial<SessionMemoryConfig>;
  force?: boolean;
}) {
  const config = normalizeConfig(params.sessionMemoryConfig);
  const currentTokens = estimateMessagesTokens(params.messages);
  const currentToolCalls = countToolMessages(params.messages);
  const snapshot = params.snapshot;

  if (params.force) return true;
  if (!snapshot) {
    return currentTokens >= config.minimumTokensToInit;
  }
  if (snapshot.extractionInFlight) return false;

  const tokenDelta = currentTokens - snapshot.tokensAtLastUpdate;
  const toolDelta = currentToolCalls - snapshot.toolCallsAtLastUpdate;
  const messageDelta =
    params.messages.length - snapshot.messageCountAtLastUpdate;

  switch (params.reason) {
    case "session_switch":
      return messageDelta > 0 && currentTokens > 0;
    case "compact_prepare":
      return (
        messageDelta > 0 &&
        (tokenDelta >=
          Math.max(400, Math.floor(config.minimumTokensBetweenUpdates / 2)) ||
          toolDelta >=
            Math.max(1, Math.floor(config.toolCallsBetweenUpdates / 2)))
      );
    case "task_stage_completed":
      return (
        tokenDelta >= config.minimumTokensBetweenUpdates ||
        toolDelta >= config.toolCallsBetweenUpdates
      );
    case "token_threshold":
      return tokenDelta >= config.minimumTokensBetweenUpdates;
    case "tool_call_threshold":
      return toolDelta >= config.toolCallsBetweenUpdates;
    default:
      return false;
  }
}

export function isSessionMemoryMeaningful(content: string) {
  const normalized = content.trim();
  if (!normalized) return false;
  return normalized !== buildSessionMemoryTemplate().trim();
}

export async function loadSessionMemorySnapshot(
  workspacePath: string,
  sessionId: string,
): Promise<SessionMemorySnapshot | null> {
  if (!workspacePath || !sessionId) return null;
  const snapshot =
    await invokeSessionMemory<BackendSessionMemorySnapshot | null>(
      "agent_get_session_memory_snapshot",
      {
        workspacePath,
        sessionId,
      },
    );
  if (!snapshot) return null;
  return toBackendSnapshot(snapshot);
}

export async function updateSessionMemory(
  input: UpdateSessionMemoryInput,
): Promise<SessionMemorySnapshot | null> {
  const { workspacePath, sessionId, messages, reason, config, force } = input;
  if (!workspacePath || !sessionId || messages.length === 0) {
    return null;
  }

  const snapshot = await invokeSessionMemory<BackendSessionMemorySnapshot>(
    "agent_update_session_memory",
    {
      config,
      workspacePath,
      sessionId,
      messages: messages.map((message) => ({
        role: message.role,
        content: String(message.content ?? ""),
      })),
      reason,
      force,
      sessionMemoryConfig: toBackendSessionMemoryConfig(
        input.sessionMemoryConfig,
      ),
    },
  );

  return toBackendSnapshot(snapshot);
}

export async function resetSessionMemory(
  workspacePath: string,
  sessionId: string,
): Promise<void> {
  if (!workspacePath || !sessionId) return;
  await invokeSessionMemory<BackendSessionMemorySnapshot>(
    "agent_reset_session_memory",
    {
      workspacePath,
      sessionId,
    },
  );
}

export function resetSessionMemoryRuntimeState() {
  // Runtime state now lives in Rust; this stays as a no-op for test compatibility.
}
