//! Source importers for the raw/ layer.
//!
//! Each importer takes content from an external source and saves it as
//! a markdown file in the raw/ directory with appropriate frontmatter.

pub mod web_clipper;
pub mod bookmark;

use serde::{Deserialize, Serialize};

/// Input for any source importer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInput {
    /// Workspace root path.
    pub workspace_path: String,
    /// Source URL or file path.
    pub source: String,
    /// Optional user-provided title.
    pub title: Option<String>,
    /// Optional tags.
    pub tags: Vec<String>,
}

/// Result from a source importer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    /// Path to the created raw source file (relative to workspace).
    pub file_path: String,
    /// Extracted or provided title.
    pub title: String,
    /// Source type.
    pub source_type: String,
}
