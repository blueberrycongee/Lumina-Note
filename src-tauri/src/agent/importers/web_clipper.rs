//! Web clipper: fetch a URL and save as markdown in raw/articles/.

use super::{ImportInput, ImportResult};
use chrono::Utc;
use reqwest;
use std::fs;
use std::path::Path;

/// Fetch a URL, extract text content, and save as markdown.
pub async fn clip_url(input: &ImportInput) -> Result<ImportResult, String> {
    let url = &input.source;

    // Fetch HTML
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(url)
        .header("User-Agent", "LuminaWiki/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} for {url}"));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    // Convert HTML to markdown using html2md
    let markdown = html2md::parse_html(&html);

    // Extract title from HTML
    let title = input.title.clone().unwrap_or_else(|| {
        extract_html_title(&html).unwrap_or_else(|| slug_from_url(url))
    });

    // Build frontmatter
    let date = Utc::now().format("%Y-%m-%d").to_string();
    let slug = slugify(&title);
    let filename = format!("{date}-{slug}.md");
    let relative_path = format!("raw/articles/{filename}");
    let full_path = Path::new(&input.workspace_path).join(&relative_path);

    // Ensure directory exists
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    // Build file content
    let tags_str = if input.tags.is_empty() {
        String::new()
    } else {
        format!(
            "\ntags:\n{}",
            input.tags.iter().map(|t| format!("  - {t}")).collect::<Vec<_>>().join("\n")
        )
    };

    let content = format!(
        "---\ntitle: \"{title}\"\ntype: article\nurl: \"{url}\"\ndate: {date}\nconfidence: medium{tags_str}\n---\n\n# {title}\n\n> Source: {url}\n\n{markdown}\n"
    );

    fs::write(&full_path, &content)
        .map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(ImportResult {
        file_path: relative_path,
        title,
        source_type: "article".to_string(),
    })
}

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title>")?;
    let end = lower[start..].find("</title>")?;
    let title = &html[start + 7..start + end];
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn slug_from_url(url: &str) -> String {
    url.split('/')
        .filter(|s| !s.is_empty())
        .last()
        .unwrap_or("untitled")
        .chars()
        .take(50)
        .collect()
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
