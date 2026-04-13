use crate::agent::llm_client::LlmClient;
use crate::agent::types::{AgentConfig, Message, MessageRole};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tokio::sync::Mutex;

const SESSION_MEMORY_TEMPLATE: &str = r#"# Session Overview
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
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionMemoryUpdateReason {
    TokenThreshold,
    ToolCallThreshold,
    TaskStageCompleted,
    SessionSwitch,
    CompactPrepare,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMemory {
    pub session_id: String,
    pub workspace_path: String,
    pub path: String,
    pub content: String,
    pub initialized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMemoryConfig {
    pub minimum_tokens_to_init: usize,
    pub minimum_tokens_between_updates: usize,
    pub tool_calls_between_updates: usize,
    pub max_transcript_chars: usize,
    pub max_output_tokens: usize,
}

impl Default for SessionMemoryConfig {
    fn default() -> Self {
        Self {
            minimum_tokens_to_init: 3000,
            minimum_tokens_between_updates: 1200,
            tool_calls_between_updates: 3,
            max_transcript_chars: 24_000,
            max_output_tokens: 1400,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMemorySnapshot {
    pub session_id: String,
    pub workspace_path: String,
    pub path: String,
    pub content: String,
    pub exists: bool,
    pub initialized: bool,
    pub extraction_in_flight: bool,
    pub last_updated_at: Option<u64>,
    pub last_update_reason: Option<SessionMemoryUpdateReason>,
    pub tokens_at_last_update: usize,
    pub tool_calls_at_last_update: usize,
    pub message_count_at_last_update: usize,
}

#[derive(Debug, Clone, Default)]
struct SessionMemoryRuntimeState {
    initialized: bool,
    extraction_in_flight: bool,
    last_updated_at: Option<u64>,
    last_update_reason: Option<SessionMemoryUpdateReason>,
    tokens_at_last_update: usize,
    tool_calls_at_last_update: usize,
    message_count_at_last_update: usize,
}

static SESSION_MEMORY_STATE: Lazy<Mutex<HashMap<String, SessionMemoryRuntimeState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn runtime_key(workspace_path: &str, session_id: &str) -> String {
    format!("{}::{}", workspace_path, session_id)
}

async fn load_runtime_state(workspace_path: &str, session_id: &str) -> SessionMemoryRuntimeState {
    let key = runtime_key(workspace_path, session_id);
    let mut states = SESSION_MEMORY_STATE.lock().await;
    states.entry(key).or_default().clone()
}

async fn store_runtime_state(
    workspace_path: &str,
    session_id: &str,
    state: SessionMemoryRuntimeState,
) {
    let key = runtime_key(workspace_path, session_id);
    let mut states = SESSION_MEMORY_STATE.lock().await;
    states.insert(key, state);
}

fn sanitize_session_id(session_id: &str) -> String {
    let sanitized = session_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let collapsed = sanitized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "default-session".to_string()
    } else {
        collapsed
    }
}

fn build_session_memory_dir(workspace_path: &str, session_id: &str) -> PathBuf {
    PathBuf::from(workspace_path)
        .join("memory")
        .join("session")
        .join(sanitize_session_id(session_id))
}

fn build_session_memory_path(workspace_path: &str, session_id: &str) -> PathBuf {
    build_session_memory_dir(workspace_path, session_id).join("session-memory.md")
}

fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let ascii = text.chars().filter(|ch| ch.is_ascii()).count();
    let non_ascii = text.chars().count().saturating_sub(ascii);
    ascii.div_ceil(4) + non_ascii.div_ceil(2)
}

fn estimate_message_tokens(messages: &[Message]) -> usize {
    messages
        .iter()
        .map(|message| estimate_tokens(&message.content) + 4)
        .sum()
}

fn count_tool_messages(messages: &[Message]) -> usize {
    messages
        .iter()
        .filter(|message| message.role == MessageRole::Tool)
        .count()
}

fn format_messages_for_memory(messages: &[Message], max_chars: usize) -> String {
    let blocks = messages
        .iter()
        .map(|message| {
            let role = match message.role {
                MessageRole::System => "SYSTEM",
                MessageRole::User => "USER",
                MessageRole::Assistant => "ASSISTANT",
                MessageRole::Tool => "TOOL",
            };
            format!("[{}] {}", role, message.content.trim())
        })
        .collect::<Vec<_>>();

    let mut total = 0usize;
    let mut kept = Vec::new();
    for block in blocks.into_iter().rev() {
        if total + block.len() > max_chars {
            continue;
        }
        total += block.len();
        kept.push(block);
    }
    kept.reverse();
    kept.join("\n\n")
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_config(config: Option<SessionMemoryConfig>) -> SessionMemoryConfig {
    config.unwrap_or_default()
}

fn should_initialize(
    state: &SessionMemoryRuntimeState,
    current_tokens: usize,
    config: &SessionMemoryConfig,
) -> bool {
    state.initialized || current_tokens >= config.minimum_tokens_to_init
}

fn should_update(
    reason: &SessionMemoryUpdateReason,
    state: &SessionMemoryRuntimeState,
    current_tokens: usize,
    current_tool_calls: usize,
    current_message_count: usize,
    force: bool,
    config: &SessionMemoryConfig,
) -> bool {
    if force {
        return true;
    }
    if state.extraction_in_flight {
        return false;
    }
    if !should_initialize(state, current_tokens, config) {
        return false;
    }

    let token_delta = current_tokens.saturating_sub(state.tokens_at_last_update);
    let tool_delta = current_tool_calls.saturating_sub(state.tool_calls_at_last_update);
    let message_delta = current_message_count.saturating_sub(state.message_count_at_last_update);

    match reason {
        SessionMemoryUpdateReason::SessionSwitch => message_delta > 0 && current_tokens > 0,
        SessionMemoryUpdateReason::CompactPrepare => {
            message_delta > 0
                && (token_delta >= (config.minimum_tokens_between_updates / 2).max(400)
                    || tool_delta >= (config.tool_calls_between_updates / 2).max(1))
        }
        SessionMemoryUpdateReason::TaskStageCompleted => {
            token_delta >= config.minimum_tokens_between_updates
                || tool_delta >= config.tool_calls_between_updates
        }
        SessionMemoryUpdateReason::TokenThreshold => {
            token_delta >= config.minimum_tokens_between_updates
        }
        SessionMemoryUpdateReason::ToolCallThreshold => {
            tool_delta >= config.tool_calls_between_updates
        }
    }
}

async fn ensure_session_memory_file(
    workspace_path: &str,
    session_id: &str,
) -> Result<PathBuf, String> {
    let dir = build_session_memory_dir(workspace_path, session_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|err| format!("Failed to create session memory dir: {}", err))?;
    let path = build_session_memory_path(workspace_path, session_id);
    if tokio::fs::metadata(&path).await.is_err() {
        tokio::fs::write(&path, SESSION_MEMORY_TEMPLATE)
            .await
            .map_err(|err| format!("Failed to initialize session memory file: {}", err))?;
    }
    Ok(path)
}

fn build_snapshot(
    workspace_path: &str,
    session_id: &str,
    content: String,
    exists: bool,
    state: &SessionMemoryRuntimeState,
) -> SessionMemorySnapshot {
    SessionMemorySnapshot {
        session_id: session_id.to_string(),
        workspace_path: workspace_path.to_string(),
        path: build_session_memory_path(workspace_path, session_id)
            .display()
            .to_string(),
        content,
        exists,
        initialized: state.initialized,
        extraction_in_flight: state.extraction_in_flight,
        last_updated_at: state.last_updated_at,
        last_update_reason: state.last_update_reason.clone(),
        tokens_at_last_update: state.tokens_at_last_update,
        tool_calls_at_last_update: state.tool_calls_at_last_update,
        message_count_at_last_update: state.message_count_at_last_update,
    }
}

pub async fn get_session_memory_snapshot(
    workspace_path: &str,
    session_id: &str,
) -> Result<SessionMemorySnapshot, String> {
    let state = load_runtime_state(workspace_path, session_id).await;
    let path = build_session_memory_path(workspace_path, session_id);
    let exists = tokio::fs::metadata(&path).await.is_ok();
    let content = if exists {
        tokio::fs::read_to_string(&path).await.unwrap_or_default()
    } else {
        String::new()
    };
    Ok(build_snapshot(
        workspace_path,
        session_id,
        content,
        exists,
        &state,
    ))
}

pub async fn reset_session_memory_impl(
    workspace_path: &str,
    session_id: &str,
) -> Result<SessionMemorySnapshot, String> {
    let path = ensure_session_memory_file(workspace_path, session_id).await?;
    tokio::fs::write(&path, SESSION_MEMORY_TEMPLATE)
        .await
        .map_err(|err| format!("Failed to reset session memory file: {}", err))?;
    let state = SessionMemoryRuntimeState::default();
    store_runtime_state(workspace_path, session_id, state.clone()).await;
    Ok(build_snapshot(
        workspace_path,
        session_id,
        SESSION_MEMORY_TEMPLATE.to_string(),
        true,
        &state,
    ))
}

pub async fn update_session_memory_impl(
    app: &tauri::AppHandle,
    config: AgentConfig,
    workspace_path: &str,
    session_id: &str,
    messages: &[Message],
    reason: SessionMemoryUpdateReason,
    force: bool,
    memory_config: Option<SessionMemoryConfig>,
) -> Result<SessionMemorySnapshot, String> {
    if workspace_path.trim().is_empty() || session_id.trim().is_empty() {
        return Err("workspace_path and session_id are required".to_string());
    }
    if messages.is_empty() {
        return get_session_memory_snapshot(workspace_path, session_id).await;
    }

    let cfg = normalize_config(memory_config);
    let mut state = load_runtime_state(workspace_path, session_id).await;
    let current_tokens = estimate_message_tokens(messages);
    let current_tool_calls = count_tool_messages(messages);
    let current_message_count = messages.len();

    if !should_initialize(&state, current_tokens, &cfg) && !force {
        return get_session_memory_snapshot(workspace_path, session_id).await;
    }

    if !should_update(
        &reason,
        &state,
        current_tokens,
        current_tool_calls,
        current_message_count,
        force,
        &cfg,
    ) {
        if current_tokens >= cfg.minimum_tokens_to_init {
            state.initialized = true;
            store_runtime_state(workspace_path, session_id, state.clone()).await;
        }
        return get_session_memory_snapshot(workspace_path, session_id).await;
    }

    if state.extraction_in_flight {
        return get_session_memory_snapshot(workspace_path, session_id).await;
    }

    let path = ensure_session_memory_file(workspace_path, session_id).await?;
    let current_content = tokio::fs::read_to_string(&path)
        .await
        .unwrap_or_else(|_| SESSION_MEMORY_TEMPLATE.to_string());
    let transcript = format_messages_for_memory(messages, cfg.max_transcript_chars);
    if transcript.trim().is_empty() {
        return Ok(build_snapshot(
            workspace_path,
            session_id,
            current_content,
            true,
            &state,
        ));
    }

    if config.api_key.trim().is_empty()
        && config.provider != "ollama"
        && config.provider != "custom"
    {
        return Ok(build_snapshot(
            workspace_path,
            session_id,
            current_content,
            true,
            &state,
        ));
    }

    state.extraction_in_flight = true;
    store_runtime_state(workspace_path, session_id, state.clone()).await;

    let llm_result = async {
        let http_client = app
            .state::<crate::proxy::ProxyState>()
            .client_with_timeout(Duration::from_secs(300))
            .await
            .map_err(|err| format!("Failed to build LLM client: {}", err))?;
        let mut llm_config = config.clone();
        llm_config.temperature = 0.2;
        llm_config.max_tokens = cfg.max_output_tokens;
        let llm = LlmClient::new(llm_config, http_client);
        let prompt = format!(
            "You are updating Lumina's session-memory.md file.\n\
Return the FULL updated markdown document only. Preserve the exact section headings.\n\
Do not add code fences. Keep the notes compact, concrete, and implementation-focused.\n\
Do not mention these instructions.\n\n\
Update reason: {:?}\n\
Session id: {}\n\n\
Current session-memory.md:\n{}\n\n\
Recent conversation and tool activity:\n{}",
            reason, session_id, current_content, transcript
        );
        let response = llm
            .call(
                &[
                    Message {
                        role: MessageRole::System,
                        content: "Maintain a structured session memory markdown file for later context restoration. Return only the updated markdown file.".to_string(),
                        name: None,
                        tool_call_id: None,
                    },
                    Message {
                        role: MessageRole::User,
                        content: prompt,
                        name: None,
                        tool_call_id: None,
                    },
                ],
                None,
            )
            .await
            .map_err(|err| format!("Session memory extraction failed: {}", err))?;
        Ok::<String, String>(response.content)
    }
    .await;

    let mut final_state = load_runtime_state(workspace_path, session_id).await;
    final_state.extraction_in_flight = false;

    let result = match llm_result {
        Ok(content) => {
            let normalized = if content.contains("# Session Overview") {
                content.trim().to_string()
            } else {
                current_content.clone()
            };
            tokio::fs::write(&path, &normalized)
                .await
                .map_err(|err| format!("Failed to write session memory file: {}", err))?;
            final_state.initialized = true;
            final_state.last_updated_at = Some(now_millis());
            final_state.last_update_reason = Some(reason);
            final_state.tokens_at_last_update = current_tokens;
            final_state.tool_calls_at_last_update = current_tool_calls;
            final_state.message_count_at_last_update = current_message_count;
            Ok(build_snapshot(
                workspace_path,
                session_id,
                normalized,
                true,
                &final_state,
            ))
        }
        Err(err) => Err(err),
    };

    store_runtime_state(workspace_path, session_id, final_state).await;
    result
}

#[tauri::command]
pub async fn agent_get_session_memory_snapshot(
    workspace_path: String,
    session_id: String,
) -> Result<SessionMemorySnapshot, String> {
    get_session_memory_snapshot(&workspace_path, &session_id).await
}

#[tauri::command]
pub async fn agent_update_session_memory(
    app: tauri::AppHandle,
    config: AgentConfig,
    workspace_path: String,
    session_id: String,
    messages: Vec<Message>,
    reason: SessionMemoryUpdateReason,
    force: Option<bool>,
    session_memory_config: Option<SessionMemoryConfig>,
) -> Result<SessionMemorySnapshot, String> {
    update_session_memory_impl(
        &app,
        config,
        &workspace_path,
        &session_id,
        &messages,
        reason,
        force.unwrap_or(false),
        session_memory_config,
    )
    .await
}

#[tauri::command]
pub async fn agent_reset_session_memory(
    workspace_path: String,
    session_id: String,
) -> Result<SessionMemorySnapshot, String> {
    reset_session_memory_impl(&workspace_path, &session_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_session_ids_for_path_use() {
        assert_eq!(
            sanitize_session_id("rust/session:1"),
            "rust-session-1".to_string()
        );
    }

    #[test]
    fn formats_recent_messages_with_tail_budget() {
        let formatted = format_messages_for_memory(
            &[
                Message {
                    role: MessageRole::User,
                    content: "hello".to_string(),
                    name: None,
                    tool_call_id: None,
                },
                Message {
                    role: MessageRole::Assistant,
                    content: "world".to_string(),
                    name: None,
                    tool_call_id: None,
                },
            ],
            30,
        );
        assert!(formatted.contains("[ASSISTANT] world"));
    }
}
