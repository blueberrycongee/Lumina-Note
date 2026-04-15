//! Vault data model and initialization for the LLM Wiki transformation.
//!
//! Three-layer vault structure:
//! - **Raw**: ingested source material (articles, papers, bookmarks, transcripts, notes)
//! - **Wiki**: distilled, interlinked wiki pages (concepts, entities, summaries)
//! - **Schema**: WIKI.md governs structure, tone, and linking rules

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use walkdir::WalkDir;

// === Types ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VaultLayer {
    Raw,
    Wiki,
    Schema,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultConfig {
    pub root_path: PathBuf,
    pub raw_dir: String,
    pub wiki_dir: String,
    pub schema_file: String,
}

impl VaultConfig {
    pub fn new(root_path: impl Into<PathBuf>) -> Self {
        Self {
            root_path: root_path.into(),
            raw_dir: "raw".to_string(),
            wiki_dir: "wiki".to_string(),
            schema_file: "WIKI.md".to_string(),
        }
    }

    pub fn raw_path(&self) -> PathBuf {
        self.root_path.join(&self.raw_dir)
    }

    pub fn wiki_path(&self) -> PathBuf {
        self.root_path.join(&self.wiki_dir)
    }

    pub fn schema_path(&self) -> PathBuf {
        self.root_path.join(&self.schema_file)
    }

    pub fn index_path(&self) -> PathBuf {
        self.wiki_path().join("index.md")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RawSourceType {
    Article,
    Paper,
    Pdf,
    Bookmark,
    Transcript,
    Note,
    WebClip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSourceMetadata {
    pub url: Option<String>,
    pub author: Option<String>,
    pub date: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSource {
    pub id: String,
    pub source_type: RawSourceType,
    pub title: String,
    pub file_path: String,
    pub ingested: bool,
    pub ingested_at: Option<u64>,
    pub metadata: RawSourceMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WikiPageType {
    Index,
    Concept,
    Entity,
    Summary,
    Collection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPageEntry {
    pub path: String,
    pub title: String,
    pub page_type: WikiPageType,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiIndex {
    pub pages: Vec<WikiPageEntry>,
    pub last_updated: u64,
}

// === Lint Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokenLink {
    pub from_page: String,
    pub link_text: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LintReport {
    pub checked_pages: usize,
    pub broken_links: Vec<BrokenLink>,
    pub orphaned_pages: Vec<String>,
    pub stale_pages: Vec<String>,
    pub overall_health: f32,
}

// === Functions ===

/// Create the full vault directory tree and default files.
///
/// Idempotent: existing directories and files are left untouched.
pub fn initialize_vault(workspace_path: &str) -> Result<VaultConfig, String> {
    let config = VaultConfig::new(workspace_path);

    // Raw layer sub-directories
    let raw_subdirs = [
        "articles",
        "papers",
        "bookmarks",
        "transcripts",
        "notes",
    ];
    for sub in &raw_subdirs {
        let dir = config.raw_path().join(sub);
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    // Wiki layer sub-directories
    let wiki_subdirs = ["concepts", "entities", "summaries"];
    for sub in &wiki_subdirs {
        let dir = config.wiki_path().join(sub);
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    // Schema file (WIKI.md)
    let schema = config.schema_path();
    if !schema.exists() {
        std::fs::write(&schema, default_wiki_schema())
            .map_err(|e| format!("Failed to write {}: {}", schema.display(), e))?;
    }

    // Index file (wiki/index.md)
    let index = config.index_path();
    if !index.exists() {
        std::fs::write(&index, default_wiki_index())
            .map_err(|e| format!("Failed to write {}: {}", index.display(), e))?;
    }

    Ok(config)
}

/// Load an existing vault config, validating that the wiki directory is present.
pub fn load_vault_config(workspace_path: &str) -> Result<VaultConfig, String> {
    let config = VaultConfig::new(workspace_path);
    let wiki = config.wiki_path();
    if !wiki.is_dir() {
        return Err(format!(
            "Wiki directory does not exist: {}. Run initialize_vault first.",
            wiki.display()
        ));
    }
    Ok(config)
}

/// Default content for `WIKI.md` — the schema / rules that govern the wiki layer.
pub fn default_wiki_schema() -> String {
    r#"# Wiki Schema

This file defines the structure and rules for the wiki layer of this vault.

## Directory Layout

```
wiki/
  index.md          — master index of all wiki pages
  concepts/         — one page per concept / topic
  entities/         — one page per named entity (person, project, org)
  summaries/        — digests that combine multiple raw sources
```

## Page Format

Every wiki page MUST start with a YAML front-matter block:

```yaml
---
title: Page Title
type: concept | entity | summary | collection
sources:
  - raw/articles/some-source.md
tags: [tag1, tag2]
created: 2025-01-01
updated: 2025-01-01
---
```

## Linking Rules

- Use **[[wikilinks]]** to connect pages: `[[concepts/machine-learning]]`.
- Links are relative to `wiki/`. A link `[[concepts/foo]]` resolves to `wiki/concepts/foo.md`.
- Every new page MUST be added to `wiki/index.md`.
- Prefer linking to existing pages over creating duplicates.

## Ingestion Flow

1. New material lands in `raw/` (articles, papers, bookmarks, transcripts, notes).
2. The agent reads the raw source and distills it into one or more wiki pages.
3. Existing pages are updated with new information; new pages are created when the concept is novel.
4. `wiki/index.md` is updated to reflect any new or removed pages.
5. [[wikilinks]] are added to connect related concepts.

## Tone & Style

- Write in clear, concise prose.
- Prefer short paragraphs and bullet lists.
- Use headers (##, ###) to organize sections within a page.
- Attribute claims to their raw sources.
"#
    .to_string()
}

/// Default content for `wiki/index.md` — the master page index.
pub fn default_wiki_index() -> String {
    r#"# Wiki Index

> Auto-maintained index of all wiki pages. The agent updates this file after each ingestion.

## Concepts

_No concepts yet._

## Entities

_No entities yet._

## Summaries

_No summaries yet._
"#
    .to_string()
}

/// Build the wiki-aware system prompt by reading `WIKI.md` and `wiki/index.md`.
///
/// This is the key function that makes the agent aware of the vault structure.
/// It injects the schema rules and the current page inventory into the LLM context.
pub fn build_wiki_system_prompt(workspace_path: &str) -> String {
    let config = VaultConfig::new(workspace_path);

    let schema_content = std::fs::read_to_string(config.schema_path()).unwrap_or_default();
    let index_content = std::fs::read_to_string(config.index_path()).unwrap_or_default();

    // Collect raw source listing so the agent knows what material is available.
    let raw_listing = build_raw_listing(&config);

    let mut prompt = String::with_capacity(4096);

    prompt.push_str(
        "You are a wiki-aware knowledge agent operating inside a three-layer vault.\n\n",
    );

    // Layer overview
    prompt.push_str("## Vault Layers\n\n");
    prompt.push_str(&format!("- **Root**: `{}`\n", config.root_path.display()));
    prompt.push_str(&format!(
        "- **Raw**:  `{}` — ingested source material\n",
        config.raw_path().display()
    ));
    prompt.push_str(&format!(
        "- **Wiki**: `{}` — distilled, interlinked wiki pages\n",
        config.wiki_path().display()
    ));
    prompt.push_str(&format!(
        "- **Schema**: `{}` — rules governing the wiki\n\n",
        config.schema_path().display()
    ));

    // Schema rules
    if !schema_content.is_empty() {
        prompt.push_str("## Wiki Schema (from WIKI.md)\n\n");
        prompt.push_str(&schema_content);
        prompt.push_str("\n\n");
    }

    // Current index
    if !index_content.is_empty() {
        prompt.push_str("## Current Wiki Index (from wiki/index.md)\n\n");
        prompt.push_str(&index_content);
        prompt.push_str("\n\n");
    }

    // Raw sources inventory
    if !raw_listing.is_empty() {
        prompt.push_str("## Raw Sources Inventory\n\n");
        prompt.push_str(&raw_listing);
        prompt.push_str("\n\n");
    }

    // Operational instructions
    prompt.push_str("## Your Responsibilities\n\n");
    prompt.push_str(
        "1. When the user adds raw material, ingest it: read the source, distill key concepts, \
         and create or update wiki pages.\n",
    );
    prompt.push_str(
        "2. Always update `wiki/index.md` after adding or removing pages.\n",
    );
    prompt.push_str(
        "3. Use [[wikilinks]] (e.g., `[[concepts/machine-learning]]`) to interlink related pages.\n",
    );
    prompt.push_str(
        "4. Respect the schema rules in WIKI.md — page format, front-matter, linking conventions.\n",
    );
    prompt.push_str(
        "5. When answering questions, ground your response in wiki pages and cite raw sources.\n",
    );
    prompt.push_str(
        "6. Prefer updating existing pages over creating duplicates.\n",
    );

    prompt
}

/// Run a structural lint over the wiki layer.
///
/// Checks every `wiki/**/*.md` file for broken [[wikilinks]], finds orphaned pages
/// (not referenced from index.md), and computes an overall health score.
pub fn run_structural_lint(workspace_path: &str) -> LintReport {
    let config = VaultConfig::new(workspace_path);
    let wiki_root = config.wiki_path();

    // Regex matching [[wikilinks]], capturing the link target.
    let wikilink_re = Regex::new(r"\[\[([^\]]+)\]\]").expect("invalid wikilink regex");

    // 1. Collect all wiki .md files (relative paths from wiki_root, without .md extension).
    let mut all_pages: HashSet<String> = HashSet::new();
    // Map: relative path (no ext) -> absolute path
    let mut page_abs: HashMap<String, PathBuf> = HashMap::new();

    for entry in WalkDir::new(&wiki_root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
            if let Ok(rel) = path.strip_prefix(&wiki_root) {
                let key = rel
                    .with_extension("")
                    .to_string_lossy()
                    .replace('\\', "/");
                all_pages.insert(key.clone());
                page_abs.insert(key, path.to_path_buf());
            }
        }
    }

    let checked_pages = all_pages.len();
    let mut broken_links: Vec<BrokenLink> = Vec::new();

    // 2. For each page, extract [[wikilinks]] and verify targets exist.
    // Track all referenced pages (useful for future cross-reference analysis).
    let mut _referenced_pages: HashSet<String> = HashSet::new();

    for (rel_key, abs_path) in &page_abs {
        let content = match std::fs::read_to_string(abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for cap in wikilink_re.captures_iter(&content) {
            let target = cap[1].trim().to_string();
            // Normalize: strip .md extension if provided, normalize separators.
            let normalized = target.replace('\\', "/");
            let normalized = normalized.strip_suffix(".md").unwrap_or(&normalized);

            _referenced_pages.insert(normalized.to_string());

            if !all_pages.contains(normalized) {
                broken_links.push(BrokenLink {
                    from_page: rel_key.clone(),
                    link_text: target.clone(),
                    target: normalized.to_string(),
                });
            }
        }
    }

    // 3. Find orphaned pages: present in wiki/ but not referenced from index.md.
    //    (index itself is never orphaned.)
    let index_content = std::fs::read_to_string(config.index_path()).unwrap_or_default();
    let mut index_refs: HashSet<String> = HashSet::new();
    for cap in wikilink_re.captures_iter(&index_content) {
        let target = cap[1].trim().to_string();
        let normalized = target.replace('\\', "/");
        let normalized = normalized.strip_suffix(".md").unwrap_or(&normalized);
        index_refs.insert(normalized.to_string());
    }

    let mut orphaned_pages: Vec<String> = Vec::new();
    for page in &all_pages {
        // index itself is not orphaned
        if page == "index" {
            continue;
        }
        if !index_refs.contains(page.as_str()) {
            orphaned_pages.push(page.clone());
        }
    }
    orphaned_pages.sort();

    // 4. Health score: simple heuristic.
    //    Start at 1.0, deduct for broken links and orphans relative to total pages.
    let overall_health = if checked_pages == 0 {
        1.0
    } else {
        let total = checked_pages as f32;
        let broken_penalty = (broken_links.len() as f32 / total).min(1.0) * 0.5;
        let orphan_penalty = (orphaned_pages.len() as f32 / total).min(1.0) * 0.3;
        (1.0 - broken_penalty - orphan_penalty).max(0.0)
    };

    LintReport {
        checked_pages,
        broken_links,
        orphaned_pages,
        stale_pages: Vec::new(), // TODO: implement staleness detection based on updated timestamps
        overall_health,
    }
}

// === Internal helpers ===

/// Build a short textual listing of files under `raw/` for inclusion in the system prompt.
fn build_raw_listing(config: &VaultConfig) -> String {
    let raw_root = config.raw_path();
    if !raw_root.is_dir() {
        return String::new();
    }

    let mut lines: Vec<String> = Vec::new();
    for entry in WalkDir::new(&raw_root)
        .max_depth(3)
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Ok(rel) = path.strip_prefix(&config.root_path) {
                lines.push(format!("- `{}`", rel.display()));
            }
        }
    }

    if lines.is_empty() {
        "_No raw sources yet._".to_string()
    } else {
        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_config_paths() {
        let cfg = VaultConfig::new("/home/user/notes");
        assert_eq!(cfg.raw_path(), PathBuf::from("/home/user/notes/raw"));
        assert_eq!(cfg.wiki_path(), PathBuf::from("/home/user/notes/wiki"));
        assert_eq!(cfg.schema_path(), PathBuf::from("/home/user/notes/WIKI.md"));
        assert_eq!(
            cfg.index_path(),
            PathBuf::from("/home/user/notes/wiki/index.md")
        );
    }

    #[test]
    fn test_initialize_vault_creates_structure() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        let config = initialize_vault(root).expect("initialize_vault");

        // Directories
        assert!(config.raw_path().join("articles").is_dir());
        assert!(config.raw_path().join("papers").is_dir());
        assert!(config.raw_path().join("bookmarks").is_dir());
        assert!(config.raw_path().join("transcripts").is_dir());
        assert!(config.raw_path().join("notes").is_dir());
        assert!(config.wiki_path().join("concepts").is_dir());
        assert!(config.wiki_path().join("entities").is_dir());
        assert!(config.wiki_path().join("summaries").is_dir());

        // Default files
        assert!(config.schema_path().is_file());
        assert!(config.index_path().is_file());

        let schema = std::fs::read_to_string(config.schema_path()).unwrap();
        assert!(schema.contains("Wiki Schema"));

        let index = std::fs::read_to_string(config.index_path()).unwrap();
        assert!(index.contains("Wiki Index"));
    }

    #[test]
    fn test_initialize_vault_is_idempotent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();

        // Write custom content to WIKI.md
        let config = VaultConfig::new(root);
        std::fs::write(config.schema_path(), "custom schema").unwrap();

        // Re-initialize should NOT overwrite existing files
        initialize_vault(root).unwrap();
        let schema = std::fs::read_to_string(config.schema_path()).unwrap();
        assert_eq!(schema, "custom schema");
    }

    #[test]
    fn test_load_vault_config_missing_wiki() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        let result = load_vault_config(root);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_load_vault_config_ok() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();
        let config = load_vault_config(root).unwrap();
        assert_eq!(config.wiki_dir, "wiki");
    }

    #[test]
    fn test_build_wiki_system_prompt_contains_layers() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();
        let prompt = build_wiki_system_prompt(root);

        assert!(prompt.contains("wiki-aware knowledge agent"));
        assert!(prompt.contains("Vault Layers"));
        assert!(prompt.contains("Wiki Schema"));
        assert!(prompt.contains("Wiki Index"));
        assert!(prompt.contains("Your Responsibilities"));
    }

    #[test]
    fn test_run_structural_lint_empty_wiki() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();
        let report = run_structural_lint(root);

        // index.md is the only page
        assert_eq!(report.checked_pages, 1);
        assert!(report.broken_links.is_empty());
        assert!(report.orphaned_pages.is_empty());
        assert!(report.overall_health >= 0.99);
    }

    #[test]
    fn test_run_structural_lint_detects_broken_link() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();
        let config = VaultConfig::new(root);

        // Create a concept page that links to a non-existent page
        let concept = config.wiki_path().join("concepts").join("rust.md");
        std::fs::write(&concept, "# Rust\n\nSee also [[concepts/nonexistent]].\n").unwrap();

        let report = run_structural_lint(root);
        assert!(!report.broken_links.is_empty());
        assert_eq!(report.broken_links[0].target, "concepts/nonexistent");
    }

    #[test]
    fn test_run_structural_lint_detects_orphan() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().to_str().unwrap();

        initialize_vault(root).unwrap();
        let config = VaultConfig::new(root);

        // Create a concept page but do NOT add it to index.md
        let concept = config.wiki_path().join("concepts").join("orphan.md");
        std::fs::write(&concept, "# Orphan\n\nA lonely page.\n").unwrap();

        let report = run_structural_lint(root);
        assert!(report.orphaned_pages.contains(&"concepts/orphan".to_string()));
    }

    #[test]
    fn test_default_schema_not_empty() {
        let schema = default_wiki_schema();
        assert!(!schema.is_empty());
        assert!(schema.contains("Linking Rules"));
        assert!(schema.contains("Ingestion Flow"));
    }

    #[test]
    fn test_default_index_not_empty() {
        let index = default_wiki_index();
        assert!(!index.is_empty());
        assert!(index.contains("Concepts"));
        assert!(index.contains("Entities"));
        assert!(index.contains("Summaries"));
    }
}
