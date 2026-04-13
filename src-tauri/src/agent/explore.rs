use crate::agent::llm_client::LlmClient;
use crate::agent::types::{
    AgentConfig, ExploreContextEntry, ExploreFileRef, ExploreReport, GraphState,
};
use regex::Regex;
use serde::Deserialize;
use std::cmp::Reverse;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use tokio::task;

const MAX_FILE_MATCHES: usize = 10;
const MAX_CONTENT_MATCHES: usize = 10;
const MAX_CONTEXT_ENTRIES: usize = 8;
const MAX_SCAN_FILE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
struct ProbeHit {
    file_path: String,
    reason: String,
    score: usize,
}

#[derive(Debug, Deserialize)]
struct ExploreLlmOutput {
    summary: String,
    #[serde(default)]
    related_files: Vec<String>,
    #[serde(default)]
    key_locations: Vec<ExploreFileRef>,
    #[serde(default)]
    similar_patterns: Vec<ExploreFileRef>,
    #[serde(default)]
    risks: Vec<String>,
    #[serde(default)]
    recommended_entry_points: Vec<String>,
}

pub async fn run_explore(
    config: &AgentConfig,
    state: &GraphState,
    http_client: reqwest::Client,
) -> ExploreReport {
    let workspace = state.workspace_path().to_string();
    let task = state.user_task().to_string();
    let active_note = state.task.active_note_path.clone();
    let retrieved_context = build_retrieved_context(state);
    let terms = extract_terms(&task, active_note.as_deref());

    let filename_scan = {
        let workspace = workspace.clone();
        let terms = terms.clone();
        task::spawn_blocking(move || scan_filename_matches(&workspace, &terms))
    };
    let content_scan = {
        let workspace = workspace.clone();
        let terms = terms.clone();
        task::spawn_blocking(move || scan_content_matches(&workspace, &terms))
    };

    let filename_hits = filename_scan
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();
    let content_hits = content_scan
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();

    let fallback = fallback_report(
        &task,
        active_note.as_deref(),
        &filename_hits,
        &content_hits,
        &retrieved_context,
    );

    summarize_with_llm(
        config,
        http_client,
        &task,
        active_note.as_deref(),
        &filename_hits,
        &content_hits,
        &retrieved_context,
        fallback,
    )
    .await
}

fn build_retrieved_context(state: &GraphState) -> Vec<ExploreContextEntry> {
    let rag_entries = state
        .explore
        .rag_results
        .iter()
        .take(MAX_CONTEXT_ENTRIES)
        .map(|item| ExploreContextEntry {
            source: "rag".to_string(),
            file_path: item.file_path.clone(),
            note: trim_snippet(&item.content, 240),
        });
    let link_entries = state
        .explore
        .resolved_links
        .iter()
        .take(MAX_CONTEXT_ENTRIES)
        .map(|item| ExploreContextEntry {
            source: format!("wikilink:{}", item.link_name),
            file_path: item.file_path.clone(),
            note: trim_snippet(&item.content, 240),
        });

    rag_entries
        .chain(link_entries)
        .take(MAX_CONTEXT_ENTRIES)
        .collect()
}

fn extract_terms(task: &str, active_note: Option<&str>) -> Vec<String> {
    let regex = Regex::new(r"[A-Za-z_][A-Za-z0-9_./:-]{2,}").expect("valid regex");
    let mut terms = BTreeSet::new();

    for capture in regex.find_iter(task) {
        let token = capture
            .as_str()
            .trim_matches(|ch: char| matches!(ch, '/' | '.' | ':' | '-'));
        let lowered = token.to_ascii_lowercase();
        if lowered.len() < 3 || is_noise_token(&lowered) {
            continue;
        }
        terms.insert(lowered);
    }

    if task.to_ascii_lowercase().contains("phase2") || task.contains("phase2") {
        for token in ["agent", "orchestrator", "explore", "plan", "verify"] {
            terms.insert(token.to_string());
        }
    }

    if task.contains("记忆") || task.to_ascii_lowercase().contains("memory") {
        terms.insert("memory".to_string());
    }

    if let Some(path) = active_note {
        if let Some(name) = Path::new(path).file_stem().and_then(|name| name.to_str()) {
            let lowered = name.to_ascii_lowercase();
            if lowered.len() >= 3 {
                terms.insert(lowered);
            }
        }
    }

    terms.into_iter().take(10).collect()
}

fn is_noise_token(token: &str) -> bool {
    matches!(
        token,
        "the"
            | "and"
            | "that"
            | "this"
            | "with"
            | "from"
            | "todo"
            | "todolist"
            | "claude"
            | "code"
            | "local"
            | "files"
            | "phase"
    )
}

fn scan_filename_matches(workspace: &str, terms: &[String]) -> Result<Vec<ProbeHit>, String> {
    if workspace.trim().is_empty() || terms.is_empty() {
        return Ok(Vec::new());
    }

    let root = PathBuf::from(workspace);
    let mut hits = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if should_skip_path(&rel) {
            continue;
        }

        let lowered = rel.to_ascii_lowercase();
        let matched_terms = terms
            .iter()
            .filter(|term| lowered.contains(term.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        if matched_terms.is_empty() {
            continue;
        }

        hits.push(ProbeHit {
            file_path: rel,
            reason: format!("filename/path matches {}", matched_terms.join(", ")),
            score: matched_terms.len(),
        });
    }

    hits.sort_by_key(|hit| (Reverse(hit.score), hit.file_path.clone()));
    hits.truncate(MAX_FILE_MATCHES);
    Ok(hits)
}

fn scan_content_matches(workspace: &str, terms: &[String]) -> Result<Vec<ProbeHit>, String> {
    if workspace.trim().is_empty() || terms.is_empty() {
        return Ok(Vec::new());
    }

    let root = PathBuf::from(workspace);
    let mut hits = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if should_skip_path(&rel) || !is_searchable_file(&rel) {
            continue;
        }

        let bytes = match std::fs::read(entry.path()) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if bytes.len() > MAX_SCAN_FILE_BYTES {
            continue;
        }
        let content = match String::from_utf8(bytes) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let lowered = content.to_ascii_lowercase();

        let matched_terms = terms
            .iter()
            .filter(|term| lowered.contains(term.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        if matched_terms.is_empty() {
            continue;
        }

        let snippet = content
            .lines()
            .find(|line| {
                let line = line.to_ascii_lowercase();
                matched_terms.iter().any(|term| line.contains(term))
            })
            .map(|line| trim_snippet(line, 140))
            .unwrap_or_else(|| "content match".to_string());

        hits.push(ProbeHit {
            file_path: rel,
            reason: format!(
                "content matches {} -> {}",
                matched_terms.join(", "),
                snippet
            ),
            score: matched_terms.len(),
        });
    }

    hits.sort_by_key(|hit| (Reverse(hit.score), hit.file_path.clone()));
    hits.truncate(MAX_CONTENT_MATCHES);
    Ok(hits)
}

fn should_skip_path(path: &str) -> bool {
    [
        "/node_modules/",
        "/target/",
        "/dist/",
        "/build/",
        "/coverage/",
        "/.git/",
        "/vendor/",
    ]
    .iter()
    .any(|item| path.contains(item))
}

fn is_searchable_file(path: &str) -> bool {
    matches!(
        Path::new(path).extension().and_then(|ext| ext.to_str()),
        Some("rs")
            | Some("ts")
            | Some("tsx")
            | Some("js")
            | Some("jsx")
            | Some("md")
            | Some("json")
            | Some("toml")
            | Some("yml")
            | Some("yaml")
    )
}

fn fallback_report(
    task: &str,
    active_note: Option<&str>,
    filename_hits: &[ProbeHit],
    content_hits: &[ProbeHit],
    retrieved_context: &[ExploreContextEntry],
) -> ExploreReport {
    let mut related = Vec::new();
    let mut seen = BTreeSet::new();
    if let Some(path) = active_note {
        if seen.insert(path.to_string()) {
            related.push(path.to_string());
        }
    }
    for file in filename_hits
        .iter()
        .chain(content_hits.iter())
        .map(|item| item.file_path.as_str())
    {
        if seen.insert(file.to_string()) {
            related.push(file.to_string());
        }
    }
    for item in retrieved_context {
        if seen.insert(item.file_path.clone()) {
            related.push(item.file_path.clone());
        }
    }
    related.truncate(MAX_FILE_MATCHES);

    let key_locations = related
        .iter()
        .take(5)
        .map(|file_path| ExploreFileRef {
            file_path: file_path.clone(),
            reason: filename_hits
                .iter()
                .chain(content_hits.iter())
                .find(|item| item.file_path == *file_path)
                .map(|item| item.reason.clone())
                .or_else(|| {
                    retrieved_context
                        .iter()
                        .find(|item| item.file_path == *file_path)
                        .map(|item| format!("retrieved {} context", item.source))
                })
                .unwrap_or_else(|| "candidate entry point".to_string()),
        })
        .collect::<Vec<_>>();

    let similar_patterns = content_hits
        .iter()
        .filter(|item| {
            !key_locations
                .iter()
                .any(|loc| loc.file_path == item.file_path)
        })
        .take(4)
        .map(|item| ExploreFileRef {
            file_path: item.file_path.clone(),
            reason: item.reason.clone(),
        })
        .collect::<Vec<_>>();

    let mut risks = Vec::new();
    if related.len() > 4 {
        risks.push("任务可能跨多个文件，执行时需要避免只改一半逻辑。".to_string());
    }
    if retrieved_context.is_empty() {
        risks.push("当前没有预取的 RAG / WikiLink 上下文，可能需要执行阶段补充阅读。".to_string());
    }
    if task.contains("phase2") || task.contains("Phase 2") {
        risks.push("该任务涉及编排、数据结构与 UI 联动，容易出现前后端字段不同步。".to_string());
    }

    ExploreReport {
        summary: format!(
            "已基于任务描述、工作区文件命中以及预取上下文整理出 {} 个候选文件。",
            related.len()
        ),
        related_files: related.clone(),
        key_locations,
        similar_patterns,
        risks,
        recommended_entry_points: related.into_iter().take(3).collect(),
        retrieved_context: retrieved_context.to_vec(),
    }
}

async fn summarize_with_llm(
    config: &AgentConfig,
    http_client: reqwest::Client,
    task: &str,
    active_note: Option<&str>,
    filename_hits: &[ProbeHit],
    content_hits: &[ProbeHit],
    retrieved_context: &[ExploreContextEntry],
    fallback: ExploreReport,
) -> ExploreReport {
    let mut llm_config = config.clone();
    llm_config.temperature = 0.2;
    llm_config.max_tokens = llm_config.max_tokens.min(1800).max(600);
    let llm = LlmClient::new(llm_config, http_client);

    let mut prompt = String::from(
        "You are Lumina's ExploreAgent.\n\
Return JSON only with keys: summary, related_files, key_locations, similar_patterns, risks, recommended_entry_points.\n\
Each key_locations/similar_patterns item must be an object with file_path and reason.\n\
Do not propose edits. Focus on code-reading guidance and risk discovery.\n\n",
    );
    prompt.push_str(&format!("Task:\n{}\n\n", task));
    if let Some(path) = active_note {
        prompt.push_str(&format!("Active note:\n{}\n\n", path));
    }
    prompt.push_str("Filename/path matches:\n");
    prompt.push_str(&render_hits(filename_hits));
    prompt.push_str("\n\nContent matches:\n");
    prompt.push_str(&render_hits(content_hits));
    prompt.push_str("\n\nRetrieved context:\n");
    if retrieved_context.is_empty() {
        prompt.push_str("(none)\n");
    } else {
        for item in retrieved_context {
            prompt.push_str(&format!(
                "- [{}] {} :: {}\n",
                item.source, item.file_path, item.note
            ));
        }
    }

    let raw = match llm.call_simple(&prompt).await {
        Ok(raw) => raw,
        Err(_) => return fallback,
    };

    let payload = match extract_json_object(&raw) {
        Some(payload) => payload,
        None => return fallback,
    };
    let parsed = match serde_json::from_str::<ExploreLlmOutput>(&payload) {
        Ok(parsed) => parsed,
        Err(_) => return fallback,
    };

    let mut report = fallback;
    if !parsed.summary.trim().is_empty() {
        report.summary = parsed.summary;
    }
    if !parsed.related_files.is_empty() {
        report.related_files = dedupe_strings(parsed.related_files, MAX_FILE_MATCHES);
    }
    if !parsed.key_locations.is_empty() {
        report.key_locations = parsed.key_locations.into_iter().take(6).collect();
    }
    if !parsed.similar_patterns.is_empty() {
        report.similar_patterns = parsed.similar_patterns.into_iter().take(6).collect();
    }
    if !parsed.risks.is_empty() {
        report.risks = dedupe_strings(parsed.risks, 6);
    }
    if !parsed.recommended_entry_points.is_empty() {
        report.recommended_entry_points =
            dedupe_strings(parsed.recommended_entry_points, MAX_FILE_MATCHES);
    }
    report
}

fn render_hits(hits: &[ProbeHit]) -> String {
    if hits.is_empty() {
        return "(none)".to_string();
    }
    hits.iter()
        .map(|item| format!("- {} :: {}", item.file_path, item.reason))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_json_object(raw: &str) -> Option<String> {
    if let Some(stripped) = raw.split("```json").nth(1) {
        let candidate = stripped.split("```").next()?.trim();
        if candidate.starts_with('{') {
            return Some(candidate.to_string());
        }
    }
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(raw[start..=end].to_string())
}

fn trim_snippet(content: &str, limit: usize) -> String {
    let single_line = content.replace('\n', " ").replace('\r', " ");
    let trimmed = single_line.trim();
    if trimmed.chars().count() <= limit {
        return trimmed.to_string();
    }
    let mut out = trimmed
        .chars()
        .take(limit.saturating_sub(1))
        .collect::<String>();
    out.push('…');
    out
}

fn dedupe_strings(items: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for item in items {
        let trimmed = item.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        out.push(trimmed.to_string());
        if out.len() >= limit {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_json_from_code_fence() {
        let raw = "before\n```json\n{\"summary\":\"ok\"}\n```\nafter";
        let json = extract_json_object(raw).unwrap();
        assert_eq!(json, "{\"summary\":\"ok\"}");
    }

    #[test]
    fn extracts_ascii_terms_from_task() {
        let terms = extract_terms(
            "根据 phase2 todo 完成 Explore / Plan / Verify agent",
            Some("/tmp/src-tauri/src/agent/orchestrator.rs"),
        );
        assert!(terms.iter().any(|item| item == "explore"));
        assert!(terms.iter().any(|item| item == "orchestrator"));
    }
}
