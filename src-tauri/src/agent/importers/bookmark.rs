//! Bookmark importer: parse browser bookmark HTML exports and save as
//! categorized markdown files in raw/bookmarks/.

use super::{ImportInput, ImportResult};
use chrono::Utc;
use std::fs;
use std::path::Path;

/// Import bookmarks from a browser HTML export file.
///
/// Parses the standard Netscape bookmark format exported by Chrome, Firefox, etc.
/// Creates one markdown file per top-level folder in raw/bookmarks/.
pub fn import_bookmarks(input: &ImportInput) -> Result<Vec<ImportResult>, String> {
    let file_path = Path::new(&input.source);
    let html =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read bookmark file: {e}"))?;

    let bookmarks = parse_bookmarks(&html);
    let date = Utc::now().format("%Y-%m-%d").to_string();
    let bookmarks_dir = Path::new(&input.workspace_path).join("raw/bookmarks");
    fs::create_dir_all(&bookmarks_dir)
        .map_err(|e| format!("Failed to create bookmarks dir: {e}"))?;

    let mut results = Vec::new();

    // Group by folder
    let mut folders: std::collections::HashMap<String, Vec<Bookmark>> =
        std::collections::HashMap::new();
    for bm in bookmarks {
        let folder = bm
            .folder
            .clone()
            .unwrap_or_else(|| "uncategorized".to_string());
        folders.entry(folder).or_default().push(bm);
    }

    for (folder_name, bms) in &folders {
        let slug = slugify(folder_name);
        let filename = format!("{slug}.md");
        let relative_path = format!("raw/bookmarks/{filename}");
        let full_path = Path::new(&input.workspace_path).join(&relative_path);

        let mut content = format!(
            "---\ntitle: \"Bookmarks: {folder_name}\"\ntype: bookmark\ndate: {date}\n---\n\n# {folder_name}\n\n"
        );

        for bm in bms {
            content.push_str(&format!("- [{}]({})\n", bm.title, bm.url));
        }

        fs::write(&full_path, &content)
            .map_err(|e| format!("Failed to write {relative_path}: {e}"))?;

        results.push(ImportResult {
            file_path: relative_path,
            title: format!("Bookmarks: {folder_name}"),
            source_type: "bookmark".to_string(),
        });
    }

    Ok(results)
}

#[derive(Debug, Clone)]
struct Bookmark {
    title: String,
    url: String,
    folder: Option<String>,
}

/// Simple parser for Netscape bookmark HTML format.
fn parse_bookmarks(html: &str) -> Vec<Bookmark> {
    let mut bookmarks = Vec::new();
    let mut current_folder: Option<String> = None;

    for line in html.lines() {
        let trimmed = line.trim();

        // Detect folder headers: <DT><H3 ...>Folder Name</H3>
        if let Some(start) = trimmed.find("<H3") {
            if let Some(end) = trimmed[start..].find("</H3>") {
                let tag_content = &trimmed[start..start + end + 5];
                if let Some(title_start) = tag_content.find('>') {
                    let title = &tag_content[title_start + 1..tag_content.len() - 5];
                    current_folder = Some(title.to_string());
                }
            }
        }

        // Detect bookmark links: <DT><A HREF="..." ...>Title</A>
        if let Some(href_start) = trimmed.find("HREF=\"") {
            let rest = &trimmed[href_start + 6..];
            if let Some(href_end) = rest.find('"') {
                let url = &rest[..href_end];
                // Find the title between > and </A>
                if let Some(title_start) = trimmed.find("\">") {
                    let after = &trimmed[title_start + 2..];
                    if let Some(title_end) = after.find("</A>") {
                        let title = &after[..title_end];
                        if !url.is_empty() {
                            bookmarks.push(Bookmark {
                                title: title.to_string(),
                                url: url.to_string(),
                                folder: current_folder.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    bookmarks
}

fn slugify(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_lowercase().next().unwrap_or(c)
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(60)
        .collect()
}
