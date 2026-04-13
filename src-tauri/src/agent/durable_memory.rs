use crate::agent::llm_client::LlmClient;
use crate::agent::orchestrator::OrchestrationDecision;
use crate::agent::types::TaskContext;
use crate::agent::types::{AgentConfig, Message, MessageRole};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tokio::sync::Mutex;
use uuid::Uuid;

const MEMORY_STALE_AFTER_DAYS: u64 = 30;

const WIKI_SECTIONS: [(&str, &str); 7] = [
    ("Me", "me"),
    ("Timeline", "timeline"),
    ("Projects", "projects"),
    ("People", "people"),
    ("Preferences", "preferences"),
    ("Routines", "routines"),
    ("Beliefs-Open-Questions", "beliefs_open_questions"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScope {
    Session,
    #[serde(alias = "identity")]
    UserIdentity,
    #[serde(alias = "projects")]
    Project,
    LocalContext,
    #[serde(alias = "relationships")]
    Relationship,
    #[serde(alias = "patterns")]
    Pattern,
    TeamShared,
}

impl MemoryScope {
    fn dir_name(&self) -> &'static str {
        match self {
            Self::Session => "session",
            Self::UserIdentity => "identity",
            Self::Project => "projects",
            Self::LocalContext => "local_context",
            Self::Relationship => "relationships",
            Self::Pattern => "patterns",
            Self::TeamShared => "team_shared",
        }
    }

    fn display_name(&self) -> &'static str {
        match self {
            Self::Session => "Session",
            Self::UserIdentity => "User Identity",
            Self::Project => "Project",
            Self::LocalContext => "Local Context",
            Self::Relationship => "Relationship",
            Self::Pattern => "Pattern",
            Self::TeamShared => "Team Shared",
        }
    }

    fn default_visibility(&self) -> MemoryVisibility {
        match self {
            Self::TeamShared => MemoryVisibility::Shared,
            _ => MemoryVisibility::Private,
        }
    }

    fn write_rule(&self) -> &'static str {
        match self {
            Self::Session => "Reserved for session memory summaries; do not persist as durable entries.",
            Self::UserIdentity => {
                "Store stable user profile, preferences, communication style, and long-lived personal context."
            }
            Self::Project => {
                "Store durable project goals, constraints, timelines, and non-derivable ongoing context."
            }
            Self::LocalContext => {
                "Store device, environment, local toolchain, filesystem, or workflow constraints tied to this machine."
            }
            Self::Relationship => {
                "Store important people, collaboration roles, and recurring interpersonal context."
            }
            Self::Pattern => {
                "Store recurring habits, workflows, templates, and decision patterns that should shape future help."
            }
            Self::TeamShared => {
                "Store broadly shareable team/project knowledge that is safe for shared context."
            }
        }
    }

    fn read_rule(&self) -> &'static str {
        match self {
            Self::Session => "Load only for continuity within the active session.",
            Self::UserIdentity => "Load when tone, explanation style, or user-specific preferences matter.",
            Self::Project => "Load for most workspace tasks that depend on broader initiative context.",
            Self::LocalContext => {
                "Load when commands, environment, installation, filesystem, or device constraints matter."
            }
            Self::Relationship => {
                "Load when the task mentions collaborators, stakeholders, reviewers, or team coordination."
            }
            Self::Pattern => {
                "Load when planning, formatting, or execution style should follow recurring user habits."
            }
            Self::TeamShared => {
                "Load when project-wide conventions, shared policies, or team knowledge matter."
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MemoryVisibility {
    Private,
    Shared,
}

impl Default for MemoryVisibility {
    fn default() -> Self {
        Self::Private
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MemoryConfidence {
    Low,
    Medium,
    High,
}

impl Default for MemoryConfidence {
    fn default() -> Self {
        Self::Medium
    }
}

impl MemoryConfidence {
    fn rank(&self) -> u8 {
        match self {
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySourceRef {
    pub session_id: String,
    pub extracted_at: u64,
    pub source_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntryVersion {
    pub version: u32,
    pub summary: String,
    pub details: String,
    pub confidence: MemoryConfidence,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub scope: MemoryScope,
    #[serde(default)]
    pub visibility: MemoryVisibility,
    pub title: String,
    pub summary: String,
    pub details: String,
    pub confidence: MemoryConfidence,
    pub tags: Vec<String>,
    pub file_path: String,
    pub version: u32,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub last_verified_at: Option<u64>,
    pub source_refs: Vec<MemorySourceRef>,
    pub history: Vec<MemoryEntryVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPageSummary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub entry_ids: Vec<String>,
    pub stale_entry_count: usize,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurableMemoryManifest {
    pub version: u32,
    pub updated_at: u64,
    pub entries: Vec<MemoryEntry>,
}

impl Default for DurableMemoryManifest {
    fn default() -> Self {
        Self {
            version: 1,
            updated_at: 0,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryMergeAction {
    Created,
    Updated,
    Deduped,
    SkippedLowConfidence,
    SkippedEmpty,
    SkippedInvalidScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMergeResult {
    pub action: MemoryMergeAction,
    pub entry_id: Option<String>,
    pub scope: Option<MemoryScope>,
    pub title: String,
    pub path: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurableMemorySnapshot {
    pub workspace_path: String,
    pub manifest_path: String,
    pub entries: Vec<MemoryEntry>,
    pub wiki_root: String,
    pub wiki_pages: Vec<WikiPageSummary>,
    pub stale_entry_ids: Vec<String>,
    pub merge_results: Vec<MemoryMergeResult>,
    pub extraction_in_flight: bool,
    pub last_extracted_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurableMemoryConfig {
    pub minimum_messages_to_extract: usize,
    pub minimum_tokens_to_extract: usize,
    pub max_transcript_chars: usize,
    pub max_manifest_entries_in_prompt: usize,
    pub max_candidates: usize,
    pub minimum_confidence_to_write: MemoryConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntryInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub scope: MemoryScope,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<MemoryVisibility>,
    pub title: String,
    pub summary: String,
    pub details: String,
    #[serde(default)]
    pub confidence: MemoryConfidence,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl Default for DurableMemoryConfig {
    fn default() -> Self {
        Self {
            minimum_messages_to_extract: 6,
            minimum_tokens_to_extract: 1200,
            max_transcript_chars: 20_000,
            max_manifest_entries_in_prompt: 40,
            max_candidates: 5,
            minimum_confidence_to_write: MemoryConfidence::Medium,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DurableMemoryCandidate {
    scope: MemoryScope,
    #[serde(default)]
    visibility: Option<MemoryVisibility>,
    title: String,
    summary: String,
    details: String,
    confidence: MemoryConfidence,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    existing_entry_id: Option<String>,
    #[serde(default)]
    source_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct DurableMemoryCandidateEnvelope {
    #[serde(default)]
    candidates: Vec<DurableMemoryCandidate>,
}

#[derive(Debug, Clone, Default)]
struct DurableMemoryRuntimeState {
    extraction_in_flight: bool,
    last_extracted_at: Option<u64>,
    last_session_id: Option<String>,
    last_transcript_fingerprint: Option<String>,
}

static DURABLE_MEMORY_STATE: Lazy<Mutex<HashMap<String, DurableMemoryRuntimeState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_filename_fragment(raw: &str) -> String {
    let lowered = raw.trim().to_ascii_lowercase();
    let mut chars = lowered
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    while chars.contains("--") {
        chars = chars.replace("--", "-");
    }
    chars.trim_matches('-').to_string()
}

fn normalize_for_compare(raw: &str) -> String {
    raw.to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn workspace_state_key(workspace_path: &str) -> String {
    workspace_path.to_string()
}

async fn load_runtime_state(workspace_path: &str) -> DurableMemoryRuntimeState {
    let key = workspace_state_key(workspace_path);
    let mut states = DURABLE_MEMORY_STATE.lock().await;
    states.entry(key).or_default().clone()
}

async fn store_runtime_state(workspace_path: &str, state: DurableMemoryRuntimeState) {
    let key = workspace_state_key(workspace_path);
    let mut states = DURABLE_MEMORY_STATE.lock().await;
    states.insert(key, state);
}

fn build_durable_root(workspace_path: &str) -> PathBuf {
    PathBuf::from(workspace_path).join("memory")
}

fn build_manifest_dir(workspace_path: &str) -> PathBuf {
    build_durable_root(workspace_path).join("durable")
}

fn build_manifest_path(workspace_path: &str) -> PathBuf {
    build_manifest_dir(workspace_path).join("manifest.json")
}

fn build_wiki_root(workspace_path: &str) -> PathBuf {
    build_durable_root(workspace_path).join("wiki")
}

fn build_wiki_section_path(workspace_path: &str, section: &str) -> PathBuf {
    build_wiki_root(workspace_path)
        .join(section)
        .join("README.md")
}

fn build_scope_dir(workspace_path: &str, scope: &MemoryScope) -> PathBuf {
    build_durable_root(workspace_path).join(scope.dir_name())
}

fn build_entry_path(
    workspace_path: &str,
    scope: &MemoryScope,
    title: &str,
    entry_id: &str,
) -> String {
    let slug = sanitize_filename_fragment(title);
    let short_id = entry_id.chars().take(8).collect::<String>();
    build_scope_dir(workspace_path, scope)
        .join(format!("{}--{}.md", slug, short_id))
        .display()
        .to_string()
}

fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let ascii = text.chars().filter(|ch| ch.is_ascii()).count();
    let non_ascii = text.chars().count().saturating_sub(ascii);
    ascii.div_ceil(4) + non_ascii.div_ceil(2)
}

fn age_days_from(now: u64, timestamp: u64) -> u64 {
    if now <= timestamp {
        return 0;
    }
    (now - timestamp) / 86_400_000
}

fn entry_last_verified_at(entry: &MemoryEntry) -> u64 {
    entry.last_verified_at.unwrap_or(entry.updated_at)
}

fn entry_is_stale(entry: &MemoryEntry, now: u64) -> bool {
    age_days_from(now, entry_last_verified_at(entry)) > MEMORY_STALE_AFTER_DAYS
}

fn likely_doc_ref(token: &str) -> bool {
    let cleaned = token
        .trim()
        .trim_matches(|ch: char| "()[]{}<>,.:;\"'`".contains(ch));
    if cleaned.is_empty() || cleaned.contains("//") {
        return false;
    }
    let lower = cleaned.to_ascii_lowercase();
    [
        ".md", ".ts", ".tsx", ".js", ".jsx", ".rs", ".py", ".json", ".toml", ".yaml", ".yml",
    ]
    .iter()
    .any(|suffix| lower.ends_with(suffix))
}

fn extract_document_refs(entry: &MemoryEntry) -> Vec<String> {
    let mut refs = BTreeSet::new();
    for token in entry
        .summary
        .split_whitespace()
        .chain(entry.details.split_whitespace())
    {
        if likely_doc_ref(token) {
            refs.insert(
                token
                    .trim_matches(|ch: char| "()[]{}<>,.:;\"'`".contains(ch))
                    .to_string(),
            );
        }
    }
    refs.into_iter().take(6).collect()
}

fn estimate_message_tokens(messages: &[Message]) -> usize {
    messages
        .iter()
        .map(|message| estimate_tokens(&message.content) + 4)
        .sum()
}

fn format_messages_for_extraction(messages: &[Message], max_chars: usize) -> String {
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

fn transcript_fingerprint(session_id: &str, transcript: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    hasher.update(b"\n");
    hasher.update(transcript.as_bytes());
    hex::encode(hasher.finalize())
}

fn format_manifest_for_prompt(manifest: &DurableMemoryManifest, max_entries: usize) -> String {
    if manifest.entries.is_empty() {
        return "No durable memories saved yet.".to_string();
    }

    let mut entries = manifest.entries.clone();
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    entries
        .into_iter()
        .take(max_entries)
        .map(|entry| {
            format!(
                "- {} [{} / {:?} / {:?} / v{}] {}",
                entry.id,
                entry.scope.display_name(),
                entry.visibility,
                entry.confidence,
                entry.version,
                entry.title
            ) + &format!(" — {}", entry.summary)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

async fn ensure_memory_layout(workspace_path: &str) -> Result<(), String> {
    let manifest_dir = build_manifest_dir(workspace_path);
    tokio::fs::create_dir_all(&manifest_dir)
        .await
        .map_err(|err| format!("Failed to create durable manifest dir: {}", err))?;

    for scope in [
        MemoryScope::UserIdentity,
        MemoryScope::Project,
        MemoryScope::LocalContext,
        MemoryScope::Relationship,
        MemoryScope::Pattern,
        MemoryScope::TeamShared,
    ] {
        tokio::fs::create_dir_all(build_scope_dir(workspace_path, &scope))
            .await
            .map_err(|err| format!("Failed to create durable memory dir: {}", err))?;
    }
    Ok(())
}

async fn load_manifest(workspace_path: &str) -> Result<DurableMemoryManifest, String> {
    ensure_memory_layout(workspace_path).await?;
    let path = build_manifest_path(workspace_path);
    if tokio::fs::metadata(&path).await.is_err() {
        return Ok(DurableMemoryManifest::default());
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|err| format!("Failed to read durable manifest: {}", err))?;
    serde_json::from_str(&raw).map_err(|err| format!("Failed to parse durable manifest: {}", err))
}

async fn save_manifest(
    workspace_path: &str,
    manifest: &DurableMemoryManifest,
) -> Result<(), String> {
    ensure_memory_layout(workspace_path).await?;
    let path = build_manifest_path(workspace_path);
    let body = serde_json::to_string_pretty(manifest)
        .map_err(|err| format!("Failed to serialize durable manifest: {}", err))?;
    tokio::fs::write(path, body)
        .await
        .map_err(|err| format!("Failed to write durable manifest: {}", err))
}

fn render_memory_markdown(entry: &MemoryEntry) -> String {
    let now = now_millis();
    let verified_at = entry_last_verified_at(entry);
    let stale_days = age_days_from(now, verified_at);
    let stale_note = if stale_days > MEMORY_STALE_AFTER_DAYS {
        format!(
            "Potentially stale ({} days since last verification)",
            stale_days
        )
    } else {
        "Fresh enough for default use".to_string()
    };
    let tags = if entry.tags.is_empty() {
        "[]".to_string()
    } else {
        format!(
            "[{}]",
            entry
                .tags
                .iter()
                .map(|tag| format!("\"{}\"", tag))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let sources = if entry.source_refs.is_empty() {
        "- None".to_string()
    } else {
        entry
            .source_refs
            .iter()
            .rev()
            .take(5)
            .map(|source| {
                let excerpt = source
                    .source_excerpt
                    .as_ref()
                    .map(|text| format!(" — {}", text))
                    .unwrap_or_default();
                format!(
                    "- session `{}` at {}{}",
                    source.session_id, source.extracted_at, excerpt
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let history = if entry.history.is_empty() {
        "- v1 created".to_string()
    } else {
        entry
            .history
            .iter()
            .rev()
            .take(5)
            .map(|version| {
                format!(
                    "- v{} at {} ({:?}) — {}",
                    version.version, version.updated_at, version.confidence, version.summary
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        "---\nid: {}\nscope: {}\nvisibility: {:?}\nconfidence: {:?}\nversion: {}\ncreated_at: {}\nupdated_at: {}\nlast_verified_at: {}\ntags: {}\n---\n\n# {}\n\n{}\n\n## Verification\n\n- Last verified at: {}\n- Staleness: {}\n\n## Scope Guidance\n\n- Read rule: {}\n- Write rule: {}\n\n## Details\n\n{}\n\n## Sources\n\n{}\n\n## History\n\n{}\n",
        entry.id,
        entry.scope.dir_name(),
        entry.visibility,
        entry.confidence,
        entry.version,
        entry.created_at,
        entry.updated_at,
        verified_at,
        tags,
        entry.title,
        entry.summary,
        verified_at,
        stale_note,
        entry.scope.read_rule(),
        entry.scope.write_rule(),
        entry.details,
        sources,
        history
    )
}

async fn write_entry_file(entry: &MemoryEntry) -> Result<(), String> {
    let body = render_memory_markdown(entry);
    tokio::fs::write(&entry.file_path, body)
        .await
        .map_err(|err| format!("Failed to write durable memory entry: {}", err))
}

fn render_sources_line(entry: &MemoryEntry) -> String {
    let mut parts = Vec::new();
    for source in entry.source_refs.iter().rev().take(2) {
        parts.push(format!("conversation:{}", source.session_id));
    }
    for doc in extract_document_refs(entry) {
        parts.push(format!("doc:{}", doc));
    }
    if parts.is_empty() {
        "none".to_string()
    } else {
        parts.join(", ")
    }
}

fn render_entry_wiki_bullet(entry: &MemoryEntry, now: u64) -> String {
    let stale = if entry_is_stale(entry, now) {
        "stale"
    } else {
        "fresh"
    };
    format!(
        "- [[{}]] (`{}` / {:?} / {:?}, {})\n  - sources: {}\n  - last_verified_at: {}",
        entry.title,
        entry.id,
        entry.scope,
        entry.confidence,
        stale,
        render_sources_line(entry),
        entry_last_verified_at(entry)
    )
}

fn section_entries<'a>(manifest: &'a DurableMemoryManifest, page_id: &str) -> Vec<&'a MemoryEntry> {
    let mut entries = manifest.entries.iter().collect::<Vec<_>>();
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    match page_id {
        "me" => entries
            .into_iter()
            .filter(|entry| entry.scope == MemoryScope::UserIdentity)
            .collect(),
        "timeline" => entries,
        "projects" => entries
            .into_iter()
            .filter(|entry| entry.scope == MemoryScope::Project)
            .collect(),
        "people" => entries
            .into_iter()
            .filter(|entry| entry.scope == MemoryScope::Relationship)
            .collect(),
        "preferences" => entries
            .into_iter()
            .filter(|entry| {
                entry.scope == MemoryScope::UserIdentity || entry.scope == MemoryScope::Pattern
            })
            .collect(),
        "routines" => entries
            .into_iter()
            .filter(|entry| entry.scope == MemoryScope::Pattern)
            .collect(),
        "beliefs_open_questions" => entries
            .into_iter()
            .filter(|entry| {
                entry.confidence == MemoryConfidence::Low
                    || entry.summary.contains("?")
                    || entry.details.contains("待确认")
                    || entry.details.to_ascii_lowercase().contains("open question")
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn render_wiki_page(title: &str, page_id: &str, entries: &[&MemoryEntry], now: u64) -> String {
    let nav = WIKI_SECTIONS
        .iter()
        .map(|(section_title, _)| format!("[[{}]]", section_title))
        .collect::<Vec<_>>()
        .join(" · ");
    let stale_count = entries
        .iter()
        .filter(|entry| entry_is_stale(entry, now))
        .count();
    let body = if entries.is_empty() {
        "- No mapped durable memories yet.".to_string()
    } else {
        entries
            .iter()
            .take(50)
            .map(|entry| render_entry_wiki_bullet(entry, now))
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        "---\npage: {}\nentry_count: {}\nstale_entry_count: {}\ngenerated_at: {}\n---\n\n# {}\n\n## Navigation\n\n{}\n\n## Entries\n\n{}\n",
        page_id,
        entries.len(),
        stale_count,
        now,
        title,
        nav,
        body
    )
}

fn build_wiki_page_summaries(
    workspace_path: &str,
    manifest: &DurableMemoryManifest,
) -> Vec<WikiPageSummary> {
    let now = now_millis();
    WIKI_SECTIONS
        .iter()
        .map(|(section_title, page_id)| {
            let entries = section_entries(manifest, page_id);
            WikiPageSummary {
                id: (*page_id).to_string(),
                title: (*section_title).to_string(),
                path: build_wiki_section_path(workspace_path, section_title)
                    .display()
                    .to_string(),
                entry_ids: entries.iter().map(|entry| entry.id.clone()).collect(),
                stale_entry_count: entries
                    .iter()
                    .filter(|entry| entry_is_stale(entry, now))
                    .count(),
                updated_at: entries.iter().map(|entry| entry.updated_at).max(),
            }
        })
        .collect()
}

async fn sync_wiki_from_manifest(
    workspace_path: &str,
    manifest: &DurableMemoryManifest,
) -> Result<(), String> {
    let wiki_root = build_wiki_root(workspace_path);
    tokio::fs::create_dir_all(&wiki_root)
        .await
        .map_err(|err| format!("Failed to create wiki root: {}", err))?;

    let now = now_millis();
    for (section_title, page_id) in WIKI_SECTIONS {
        let section_dir = wiki_root.join(section_title);
        tokio::fs::create_dir_all(&section_dir)
            .await
            .map_err(|err| format!("Failed to create wiki section dir: {}", err))?;
        let entries = section_entries(manifest, page_id);
        let markdown = render_wiki_page(section_title, page_id, &entries, now);
        tokio::fs::write(section_dir.join("README.md"), markdown)
            .await
            .map_err(|err| format!("Failed to write wiki page {}: {}", section_title, err))?;
    }

    Ok(())
}

fn trim_for_storage(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    trimmed
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>()
        + "…"
}

fn merge_tags(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for tag in existing.iter().chain(incoming.iter()) {
        let normalized = tag.trim();
        if !normalized.is_empty() {
            tags.insert(normalized.to_string());
        }
    }
    tags.into_iter().collect()
}

fn merge_source_refs(
    existing: &[MemorySourceRef],
    incoming: MemorySourceRef,
) -> Vec<MemorySourceRef> {
    let mut refs = existing.to_vec();
    let duplicate = refs.iter().any(|item| {
        item.session_id == incoming.session_id && item.source_excerpt == incoming.source_excerpt
    });
    if !duplicate {
        refs.push(incoming);
    }
    refs
}

fn find_existing_entry_index(
    manifest: &DurableMemoryManifest,
    candidate: &DurableMemoryCandidate,
) -> Option<usize> {
    if let Some(entry_id) = &candidate.existing_entry_id {
        if let Some(index) = manifest
            .entries
            .iter()
            .position(|entry| &entry.id == entry_id)
        {
            return Some(index);
        }
    }

    let normalized_title = normalize_for_compare(&candidate.title);
    manifest.entries.iter().position(|entry| {
        entry.scope == candidate.scope && normalize_for_compare(&entry.title) == normalized_title
    })
}

fn build_source_ref(session_id: &str, candidate: &DurableMemoryCandidate) -> MemorySourceRef {
    MemorySourceRef {
        session_id: session_id.to_string(),
        extracted_at: now_millis(),
        source_excerpt: candidate
            .source_excerpt
            .as_ref()
            .map(|text| trim_for_storage(text, 220)),
    }
}

fn candidate_is_meaningful(candidate: &DurableMemoryCandidate) -> bool {
    !(candidate.title.trim().is_empty()
        || candidate.summary.trim().is_empty()
        || candidate.details.trim().is_empty())
}

fn merge_candidate(
    workspace_path: &str,
    session_id: &str,
    manifest: &mut DurableMemoryManifest,
    candidate: DurableMemoryCandidate,
    config: &DurableMemoryConfig,
) -> (MemoryMergeResult, Option<usize>) {
    if matches!(candidate.scope, MemoryScope::Session) {
        return (
            MemoryMergeResult {
                action: MemoryMergeAction::SkippedInvalidScope,
                entry_id: None,
                scope: Some(candidate.scope),
                title: candidate.title,
                path: None,
                detail: "Session scope is managed by session memory, not durable memory"
                    .to_string(),
            },
            None,
        );
    }

    if !candidate_is_meaningful(&candidate) {
        return (
            MemoryMergeResult {
                action: MemoryMergeAction::SkippedEmpty,
                entry_id: None,
                scope: Some(candidate.scope),
                title: candidate.title,
                path: None,
                detail: "Candidate missing title, summary, or details".to_string(),
            },
            None,
        );
    }

    if candidate.confidence.rank() < config.minimum_confidence_to_write.rank() {
        return (
            MemoryMergeResult {
                action: MemoryMergeAction::SkippedLowConfidence,
                entry_id: None,
                scope: Some(candidate.scope),
                title: candidate.title,
                path: None,
                detail: "Confidence below durable write threshold".to_string(),
            },
            None,
        );
    }

    if let Some(index) = find_existing_entry_index(manifest, &candidate) {
        let source_ref = build_source_ref(session_id, &candidate);
        let entry = manifest.entries.get_mut(index).expect("entry exists");
        let previous_updated_at = entry.updated_at;
        let normalized_summary = normalize_for_compare(&candidate.summary);
        let normalized_details = normalize_for_compare(&candidate.details);
        let changed = normalize_for_compare(&entry.summary) != normalized_summary
            || normalize_for_compare(&entry.details) != normalized_details
            || entry.confidence != candidate.confidence
            || entry.scope != candidate.scope
            || entry.visibility
                != candidate
                    .visibility
                    .clone()
                    .unwrap_or(entry.visibility.clone());

        entry.tags = merge_tags(&entry.tags, &candidate.tags);
        entry.source_refs = merge_source_refs(&entry.source_refs, source_ref);
        entry.updated_at = now_millis();
        entry.last_verified_at = Some(entry.updated_at);

        if changed {
            let next_scope = candidate.scope.clone();
            entry.history.push(MemoryEntryVersion {
                version: entry.version,
                summary: entry.summary.clone(),
                details: entry.details.clone(),
                confidence: entry.confidence.clone(),
                updated_at: previous_updated_at,
            });
            entry.version += 1;
            entry.summary = trim_for_storage(&candidate.summary, 500);
            entry.details = trim_for_storage(&candidate.details, 2000);
            entry.confidence = candidate.confidence;
            entry.visibility = candidate
                .visibility
                .clone()
                .unwrap_or_else(|| next_scope.default_visibility());
            entry.scope = next_scope;
            entry.file_path =
                build_entry_path(workspace_path, &entry.scope, &entry.title, &entry.id);

            return (
                MemoryMergeResult {
                    action: MemoryMergeAction::Updated,
                    entry_id: Some(entry.id.clone()),
                    scope: Some(entry.scope.clone()),
                    title: entry.title.clone(),
                    path: Some(entry.file_path.clone()),
                    detail: "Merged into existing durable memory and incremented version"
                        .to_string(),
                },
                Some(index),
            );
        }

        return (
            MemoryMergeResult {
                action: MemoryMergeAction::Deduped,
                entry_id: Some(entry.id.clone()),
                scope: Some(entry.scope.clone()),
                title: entry.title.clone(),
                path: Some(entry.file_path.clone()),
                detail: "Matched existing durable memory without material content changes"
                    .to_string(),
            },
            Some(index),
        );
    }

    let entry_id = Uuid::new_v4().to_string();
    let created_at = now_millis();
    let source_ref = build_source_ref(session_id, &candidate);
    let entry = MemoryEntry {
        id: entry_id.clone(),
        scope: candidate.scope.clone(),
        visibility: candidate
            .visibility
            .clone()
            .unwrap_or_else(|| candidate.scope.default_visibility()),
        title: trim_for_storage(&candidate.title, 120),
        summary: trim_for_storage(&candidate.summary, 500),
        details: trim_for_storage(&candidate.details, 2000),
        confidence: candidate.confidence,
        tags: merge_tags(&[], &candidate.tags),
        file_path: build_entry_path(
            workspace_path,
            &candidate.scope,
            &candidate.title,
            &entry_id,
        ),
        version: 1,
        created_at,
        updated_at: created_at,
        last_verified_at: Some(created_at),
        source_refs: vec![source_ref],
        history: Vec::new(),
    };
    let path = entry.file_path.clone();
    let scope = entry.scope.clone();
    let title = entry.title.clone();
    manifest.entries.push(entry);
    let index = manifest.entries.len().saturating_sub(1);
    (
        MemoryMergeResult {
            action: MemoryMergeAction::Created,
            entry_id: Some(entry_id),
            scope: Some(scope),
            title,
            path: Some(path),
            detail: "Created new durable memory entry".to_string(),
        },
        Some(index),
    )
}

fn build_snapshot(
    workspace_path: &str,
    manifest: DurableMemoryManifest,
    merge_results: Vec<MemoryMergeResult>,
    state: &DurableMemoryRuntimeState,
) -> DurableMemorySnapshot {
    let now = now_millis();
    let stale_entry_ids = manifest
        .entries
        .iter()
        .filter(|entry| entry_is_stale(entry, now))
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    let wiki_pages = build_wiki_page_summaries(workspace_path, &manifest);
    DurableMemorySnapshot {
        workspace_path: workspace_path.to_string(),
        manifest_path: build_manifest_path(workspace_path).display().to_string(),
        entries: manifest.entries,
        wiki_root: build_wiki_root(workspace_path).display().to_string(),
        wiki_pages,
        stale_entry_ids,
        merge_results,
        extraction_in_flight: state.extraction_in_flight,
        last_extracted_at: state.last_extracted_at,
    }
}

pub async fn get_durable_memory_snapshot(
    workspace_path: &str,
) -> Result<DurableMemorySnapshot, String> {
    let manifest = load_manifest(workspace_path).await?;
    sync_wiki_from_manifest(workspace_path, &manifest).await?;
    let state = load_runtime_state(workspace_path).await;
    Ok(build_snapshot(workspace_path, manifest, Vec::new(), &state))
}

fn infer_relevant_scopes(task: &str, context: &TaskContext) -> Vec<MemoryScope> {
    let lower = task.to_ascii_lowercase();
    let mut scopes = BTreeSet::new();
    scopes.insert(MemoryScope::UserIdentity);
    scopes.insert(MemoryScope::Project);
    scopes.insert(MemoryScope::Pattern);

    let environmentish = [
        "install",
        "env",
        "environment",
        "terminal",
        "shell",
        "path",
        "local",
        "machine",
        "设备",
        "环境",
        "本地",
        "终端",
        "路径",
        "安装",
    ];
    if environmentish.iter().any(|term| lower.contains(term))
        || context
            .active_note_path
            .as_deref()
            .map(|path| path.contains("/Users/") || path.contains(":\\"))
            .unwrap_or(false)
    {
        scopes.insert(MemoryScope::LocalContext);
    }

    let collaborationish = [
        "team",
        "reviewer",
        "review",
        "stakeholder",
        "manager",
        "teammate",
        "collabor",
        "团队",
        "同事",
        "评审",
        "reviewer",
        "负责人",
    ];
    if collaborationish.iter().any(|term| lower.contains(term)) {
        scopes.insert(MemoryScope::Relationship);
        scopes.insert(MemoryScope::TeamShared);
    }

    let shareish = [
        "policy",
        "convention",
        "shared",
        "release",
        "project",
        "repo",
        "workflow",
        "规范",
        "约定",
        "共享",
        "发布",
        "项目",
    ];
    if shareish.iter().any(|term| lower.contains(term)) {
        scopes.insert(MemoryScope::TeamShared);
    }

    scopes.into_iter().collect()
}

fn format_scope_rule_summary(scopes: &[MemoryScope]) -> String {
    scopes
        .iter()
        .map(|scope| {
            format!(
                "- {}: read when {}; write rule: {}",
                scope.display_name(),
                scope.read_rule(),
                scope.write_rule()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn select_relevant_entries(
    manifest: &DurableMemoryManifest,
    scopes: &[MemoryScope],
) -> Vec<MemoryEntry> {
    let allowed = scopes.iter().cloned().collect::<BTreeSet<_>>();
    let mut by_scope = HashMap::<MemoryScope, Vec<MemoryEntry>>::new();
    for entry in manifest.entries.iter().cloned() {
        if allowed.contains(&entry.scope) {
            by_scope.entry(entry.scope.clone()).or_default().push(entry);
        }
    }

    let mut selected = Vec::new();
    for scope in scopes {
        let mut items = by_scope.remove(scope).unwrap_or_default();
        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        let per_scope_limit = match scope {
            MemoryScope::UserIdentity | MemoryScope::Project | MemoryScope::Pattern => 3,
            MemoryScope::LocalContext | MemoryScope::Relationship | MemoryScope::TeamShared => 2,
            MemoryScope::Session => 1,
        };
        selected.extend(items.into_iter().take(per_scope_limit));
    }
    selected
}

pub async fn build_memory_context_message(
    workspace_path: &str,
    task: &str,
    context: &TaskContext,
    decision: &OrchestrationDecision,
) -> Result<Option<String>, String> {
    if workspace_path.trim().is_empty() {
        return Ok(None);
    }

    let manifest = load_manifest(workspace_path).await?;
    let mut scopes = infer_relevant_scopes(task, context);
    if decision.mode == crate::agent::types::AgentExecutionMode::Orchestrated {
        scopes.push(MemoryScope::Relationship);
        scopes.push(MemoryScope::TeamShared);
    }
    scopes.sort();
    scopes.dedup();

    let selected_entries = select_relevant_entries(&manifest, &scopes);
    let entries_block = if selected_entries.is_empty() {
        "(no matching durable memories loaded)".to_string()
    } else {
        selected_entries
            .iter()
            .map(|entry| {
                format!(
                    "- [{} / {:?} / {:?}] {} — {}\n  how to use: {}",
                    entry.scope.display_name(),
                    entry.visibility,
                    entry.confidence,
                    entry.title,
                    entry.summary,
                    entry.scope.read_rule()
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    if entries_block == "(no matching durable memories loaded)" {
        return Ok(None);
    }

    Ok(Some(format!(
        "# Layered Memory Context\nSelected layers for this task:\n{}\n\n## Durable Layers\n{}",
        format_scope_rule_summary(&scopes),
        entries_block
    )))
}

pub async fn upsert_durable_memory_entry_impl(
    workspace_path: &str,
    entry: MemoryEntryInput,
) -> Result<DurableMemorySnapshot, String> {
    if workspace_path.trim().is_empty() {
        return Err("workspace_path is required".to_string());
    }
    if matches!(entry.scope, MemoryScope::Session) {
        return Err(
            "Session scope is managed by session memory and cannot be edited here".to_string(),
        );
    }

    let mut manifest = load_manifest(workspace_path).await?;
    let session_id = "manual-edit";
    let candidate = DurableMemoryCandidate {
        scope: entry.scope,
        visibility: entry.visibility,
        title: entry.title,
        summary: entry.summary,
        details: entry.details,
        confidence: entry.confidence,
        tags: entry.tags,
        existing_entry_id: entry.id,
        source_excerpt: Some("Manually updated by user/editor".to_string()),
    };
    let (merge_result, touched_index) = merge_candidate(
        workspace_path,
        session_id,
        &mut manifest,
        candidate,
        &DurableMemoryConfig::default(),
    );
    manifest.updated_at = now_millis();
    save_manifest(workspace_path, &manifest).await?;
    sync_wiki_from_manifest(workspace_path, &manifest).await?;
    if let Some(index) = touched_index {
        if let Some(memory_entry) = manifest.entries.get(index) {
            write_entry_file(memory_entry).await?;
        }
    }
    let state = load_runtime_state(workspace_path).await;
    Ok(build_snapshot(
        workspace_path,
        manifest,
        vec![merge_result],
        &state,
    ))
}

pub async fn delete_durable_memory_entry_impl(
    workspace_path: &str,
    entry_id: &str,
) -> Result<DurableMemorySnapshot, String> {
    if workspace_path.trim().is_empty() {
        return Err("workspace_path is required".to_string());
    }

    let mut manifest = load_manifest(workspace_path).await?;
    let mut removed_path = None::<String>;
    manifest.entries.retain(|entry| {
        if entry.id == entry_id {
            removed_path = Some(entry.file_path.clone());
            false
        } else {
            true
        }
    });
    manifest.updated_at = now_millis();
    save_manifest(workspace_path, &manifest).await?;
    sync_wiki_from_manifest(workspace_path, &manifest).await?;
    if let Some(path) = removed_path {
        let _ = tokio::fs::remove_file(path).await;
    }
    let state = load_runtime_state(workspace_path).await;
    Ok(build_snapshot(workspace_path, manifest, Vec::new(), &state))
}

pub async fn reverify_durable_memory_entry_impl(
    workspace_path: &str,
    entry_id: &str,
) -> Result<DurableMemorySnapshot, String> {
    if workspace_path.trim().is_empty() {
        return Err("workspace_path is required".to_string());
    }

    let mut manifest = load_manifest(workspace_path).await?;
    let now = now_millis();
    let mut found = false;
    for entry in manifest.entries.iter_mut() {
        if entry.id == entry_id {
            entry.last_verified_at = Some(now);
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Durable memory entry not found: {}", entry_id));
    }

    manifest.updated_at = now;
    save_manifest(workspace_path, &manifest).await?;
    sync_wiki_from_manifest(workspace_path, &manifest).await?;
    let state = load_runtime_state(workspace_path).await;
    Ok(build_snapshot(workspace_path, manifest, Vec::new(), &state))
}

fn extract_json_payload(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("```") {
        let without_fence = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        if without_fence.starts_with('{') && without_fence.ends_with('}') {
            return Some(without_fence.to_string());
        }
    }
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    (start < end).then(|| trimmed[start..=end].to_string())
}

fn parse_candidate_response(raw: &str) -> Result<DurableMemoryCandidateEnvelope, String> {
    let json = extract_json_payload(raw).ok_or_else(|| {
        "Durable memory extraction response did not contain a JSON object".to_string()
    })?;
    serde_json::from_str::<DurableMemoryCandidateEnvelope>(&json).map_err(|err| {
        format!(
            "Failed to parse durable memory extraction response: {}",
            err
        )
    })
}

pub async fn extract_durable_memories_impl(
    app: &tauri::AppHandle,
    config: AgentConfig,
    workspace_path: &str,
    session_id: &str,
    messages: &[Message],
    force: bool,
    durable_memory_config: Option<DurableMemoryConfig>,
) -> Result<DurableMemorySnapshot, String> {
    if workspace_path.trim().is_empty() {
        return Err("workspace_path is required".to_string());
    }
    if session_id.trim().is_empty() || messages.is_empty() {
        return get_durable_memory_snapshot(workspace_path).await;
    }

    let cfg = durable_memory_config.unwrap_or_default();
    let transcript = format_messages_for_extraction(messages, cfg.max_transcript_chars);
    let token_count = estimate_message_tokens(messages);
    if !force
        && (messages.len() < cfg.minimum_messages_to_extract
            || token_count < cfg.minimum_tokens_to_extract
            || transcript.trim().is_empty())
    {
        return get_durable_memory_snapshot(workspace_path).await;
    }

    let mut runtime = load_runtime_state(workspace_path).await;
    if runtime.extraction_in_flight {
        return get_durable_memory_snapshot(workspace_path).await;
    }

    let fingerprint = transcript_fingerprint(session_id, &transcript);
    if !force
        && runtime.last_session_id.as_deref() == Some(session_id)
        && runtime.last_transcript_fingerprint.as_deref() == Some(fingerprint.as_str())
    {
        return get_durable_memory_snapshot(workspace_path).await;
    }

    let mut manifest = load_manifest(workspace_path).await?;
    let prompt_manifest = format_manifest_for_prompt(&manifest, cfg.max_manifest_entries_in_prompt);

    if config.api_key.trim().is_empty()
        && config.provider != "ollama"
        && config.provider != "custom"
    {
        return Ok(build_snapshot(
            workspace_path,
            manifest,
            Vec::new(),
            &runtime,
        ));
    }

    runtime.extraction_in_flight = true;
    store_runtime_state(workspace_path, runtime.clone()).await;

    let llm_result = async {
        let http_client = app
            .state::<crate::proxy::ProxyState>()
            .client_with_timeout(Duration::from_secs(300))
            .await
            .map_err(|err| format!("Failed to build LLM client: {}", err))?;
        let mut llm_config = config.clone();
        llm_config.temperature = 0.1;
        llm_config.max_tokens = 1800;
        let llm = LlmClient::new(llm_config, http_client);
        let prompt = format!(
            "You extract durable memories for Lumina.\n\
Return JSON only with this shape:\n\
{{\"candidates\":[{{\"scope\":\"user_identity|project|local_context|relationship|pattern|team_shared\",\"visibility\":\"private|shared\",\"title\":\"...\",\"summary\":\"...\",\"details\":\"...\",\"confidence\":\"low|medium|high\",\"tags\":[\"...\"],\"existing_entry_id\":\"optional-id\",\"source_excerpt\":\"optional supporting quote or paraphrase\"}}]}}\n\n\
Only include knowledge worth keeping beyond the current task. Do NOT save:\n\
- code structure, file paths, implementation details derivable from the repo\n\
- temporary debugging state or current task progress\n\
- vague impressions or speculative claims\n\
- low-confidence facts\n\n\
Prioritize:\n\
- stable user preferences and communication patterns\n\
- long-lived project context, goals, and constraints\n\
- local environment or machine-specific constraints only when they are recurrent and durable\n\
- recurring collaboration patterns or relationships\n\
- durable facts that will still help in future sessions\n\
- shared team/project knowledge only when it is safe to treat as shared context\n\n\
If a fact mentions relative dates, convert them to absolute dates.\n\
Do not output session scope. Session continuity is handled separately.\n\
Prefer updating an existing memory via existing_entry_id instead of creating duplicates.\n\
Return at most {} candidates.\n\n\
Existing durable memory manifest:\n{}\n\n\
Recent session transcript:\n{}",
            cfg.max_candidates, prompt_manifest, transcript
        );
        let response = llm
            .call(
                &[
                    Message {
                        role: MessageRole::System,
                        content: "Extract durable, high-confidence long-term memory candidates. Return JSON only."
                            .to_string(),
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
            .map_err(|err| format!("Durable memory extraction failed: {}", err))?;
        Ok::<String, String>(response.content)
    }
    .await;

    let mut final_state = load_runtime_state(workspace_path).await;
    final_state.extraction_in_flight = false;

    let result = match llm_result {
        Ok(content) => {
            let envelope = parse_candidate_response(&content)?;
            let mut merge_results = Vec::new();
            let mut touched_indices = BTreeSet::new();

            for candidate in envelope.candidates.into_iter().take(cfg.max_candidates) {
                let (merge_result, touched_index) =
                    merge_candidate(workspace_path, session_id, &mut manifest, candidate, &cfg);
                if let Some(index) = touched_index {
                    touched_indices.insert(index);
                }
                merge_results.push(merge_result);
            }

            manifest.updated_at = now_millis();
            save_manifest(workspace_path, &manifest).await?;
            sync_wiki_from_manifest(workspace_path, &manifest).await?;

            for index in touched_indices {
                if let Some(entry) = manifest.entries.get(index) {
                    write_entry_file(entry).await?;
                }
            }

            final_state.last_extracted_at = Some(now_millis());
            final_state.last_session_id = Some(session_id.to_string());
            final_state.last_transcript_fingerprint = Some(fingerprint);

            Ok(build_snapshot(
                workspace_path,
                manifest,
                merge_results,
                &final_state,
            ))
        }
        Err(err) => Err(err),
    };

    store_runtime_state(workspace_path, final_state).await;
    result
}

#[tauri::command]
pub async fn agent_get_durable_memory_snapshot(
    workspace_path: String,
) -> Result<DurableMemorySnapshot, String> {
    get_durable_memory_snapshot(&workspace_path).await
}

#[tauri::command]
pub async fn agent_extract_durable_memories(
    app: tauri::AppHandle,
    config: AgentConfig,
    workspace_path: String,
    session_id: String,
    messages: Vec<Message>,
    force: Option<bool>,
    durable_memory_config: Option<DurableMemoryConfig>,
) -> Result<DurableMemorySnapshot, String> {
    extract_durable_memories_impl(
        &app,
        config,
        &workspace_path,
        &session_id,
        &messages,
        force.unwrap_or(false),
        durable_memory_config,
    )
    .await
}

#[tauri::command]
pub async fn agent_upsert_durable_memory_entry(
    workspace_path: String,
    entry: MemoryEntryInput,
) -> Result<DurableMemorySnapshot, String> {
    upsert_durable_memory_entry_impl(&workspace_path, entry).await
}

#[tauri::command]
pub async fn agent_delete_durable_memory_entry(
    workspace_path: String,
    entry_id: String,
) -> Result<DurableMemorySnapshot, String> {
    delete_durable_memory_entry_impl(&workspace_path, &entry_id).await
}

#[tauri::command]
pub async fn agent_reverify_durable_memory_entry(
    workspace_path: String,
    entry_id: String,
) -> Result<DurableMemorySnapshot, String> {
    reverify_durable_memory_entry_impl(&workspace_path, &entry_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        scope: MemoryScope,
        title: &str,
        confidence: MemoryConfidence,
    ) -> DurableMemoryCandidate {
        DurableMemoryCandidate {
            scope,
            visibility: None,
            title: title.to_string(),
            summary: "Summary".to_string(),
            details: "Details".to_string(),
            confidence,
            tags: vec!["alpha".to_string()],
            existing_entry_id: None,
            source_excerpt: Some("excerpt".to_string()),
        }
    }

    #[test]
    fn low_confidence_candidates_are_skipped() {
        let mut manifest = DurableMemoryManifest::default();
        let config = DurableMemoryConfig::default();
        let (result, touched) = merge_candidate(
            "/tmp/workspace",
            "session-1",
            &mut manifest,
            candidate(
                MemoryScope::UserIdentity,
                "User preference",
                MemoryConfidence::Low,
            ),
            &config,
        );
        assert_eq!(result.action, MemoryMergeAction::SkippedLowConfidence);
        assert!(touched.is_none());
        assert!(manifest.entries.is_empty());
    }

    #[test]
    fn matching_titles_merge_and_increment_version() {
        let created_at = now_millis();
        let mut manifest = DurableMemoryManifest {
            version: 1,
            updated_at: created_at,
            entries: vec![MemoryEntry {
                id: "entry-1".to_string(),
                scope: MemoryScope::Project,
                visibility: MemoryVisibility::Private,
                title: "Release freeze".to_string(),
                summary: "Old summary".to_string(),
                details: "Old details".to_string(),
                confidence: MemoryConfidence::Medium,
                tags: vec!["release".to_string()],
                file_path: "/tmp/workspace/memory/projects/release-freeze--entry-1.md".to_string(),
                version: 1,
                created_at,
                updated_at: created_at,
                last_verified_at: Some(created_at),
                source_refs: Vec::new(),
                history: Vec::new(),
            }],
        };
        let mut next = candidate(
            MemoryScope::Project,
            "Release freeze",
            MemoryConfidence::High,
        );
        next.summary = "New summary".to_string();
        next.details = "New details".to_string();

        let (result, touched) = merge_candidate(
            "/tmp/workspace",
            "session-1",
            &mut manifest,
            next,
            &DurableMemoryConfig::default(),
        );
        assert_eq!(result.action, MemoryMergeAction::Updated);
        assert_eq!(touched, Some(0));
        assert_eq!(manifest.entries[0].version, 2);
        assert_eq!(manifest.entries[0].history.len(), 1);
        assert_eq!(manifest.entries[0].confidence, MemoryConfidence::High);
    }

    #[test]
    fn new_entries_get_scope_specific_paths() {
        let mut manifest = DurableMemoryManifest::default();
        let (result, touched) = merge_candidate(
            "/tmp/workspace",
            "session-1",
            &mut manifest,
            candidate(
                MemoryScope::Relationship,
                "Core reviewer responsibilities",
                MemoryConfidence::High,
            ),
            &DurableMemoryConfig::default(),
        );
        assert_eq!(result.action, MemoryMergeAction::Created);
        assert_eq!(touched, Some(0));
        assert!(manifest.entries[0]
            .file_path
            .contains("/memory/relationships/"));
    }

    #[test]
    fn local_context_scope_is_selected_for_environment_tasks() {
        let scopes = infer_relevant_scopes(
            "帮我排查本地 terminal 环境里的 cargo path 问题",
            &TaskContext::default(),
        );
        assert!(scopes.contains(&MemoryScope::LocalContext));
    }
}
