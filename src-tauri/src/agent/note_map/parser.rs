//! Markdown 解析器
//!
//! 解析 Markdown 文件，提取标题结构和 WikiLink 链接

use super::types::{NoteTag, NoteLink, NoteMeta};
use regex::Regex;
use std::path::Path;

/// 解析 Markdown 文件内容
///
/// 返回 (标题标签列表, WikiLink 链接列表)
pub fn parse_markdown(content: &str, file_path: &str) -> (Vec<NoteTag>, Vec<NoteLink>) {
    let tags = extract_headings(content, file_path);
    let links = extract_wikilinks(content, file_path);
    (tags, links)
}

/// 提取 Markdown 标题
fn extract_headings(content: &str, file_path: &str) -> Vec<NoteTag> {
    let mut tags = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut char_offset = 0;
    
    // 收集所有标题的位置
    let mut heading_positions: Vec<(usize, u8, String, usize)> = Vec::new(); // (line, level, text, offset)
    
    for (line_num, line) in lines.iter().enumerate() {
        // 检查是否是标题行（以 # 开头）
        if let Some(heading) = parse_heading_line(line) {
            heading_positions.push((line_num + 1, heading.0, heading.1, char_offset));
        }
        char_offset += line.len() + 1; // +1 for newline
    }
    
    let total_len = content.len();
    
    // 计算每个标题的结束位置和字数
    for i in 0..heading_positions.len() {
        let (line, level, text, start_offset) = &heading_positions[i];
        
        // 找到下一个同级或更高级标题的位置作为结束
        let end_offset = find_section_end(&heading_positions, i, total_len);
        
        // 计算该章节的字数（安全地处理 UTF-8 边界）
        let section_content = if end_offset > *start_offset {
            // 找到安全的字符边界
            let safe_start = content.char_indices()
                .find(|(i, _)| *i >= *start_offset)
                .map(|(i, _)| i)
                .unwrap_or(*start_offset);
            let safe_end = content.char_indices()
                .find(|(i, _)| *i >= end_offset)
                .map(|(i, _)| i)
                .unwrap_or(content.len());
            if safe_end > safe_start && safe_end <= content.len() {
                &content[safe_start..safe_end]
            } else {
                ""
            }
        } else {
            ""
        };
        let word_count = count_words(section_content);
        
        tags.push(NoteTag {
            path: file_path.to_string(),
            heading: text.clone(),
            level: *level,
            line: *line,
            start_offset: *start_offset,
            end_offset,
            word_count,
        });
    }
    
    tags
}

/// 解析单行标题，返回 (级别, 标题文本)
fn parse_heading_line(line: &str) -> Option<(u8, String)> {
    let trimmed = line.trim_start();
    
    // 计算 # 的数量
    let hash_count = trimmed.chars().take_while(|c| *c == '#').count();
    
    if hash_count == 0 || hash_count > 6 {
        return None;
    }
    
    // 确保 # 后面有空格或直接是标题内容
    let rest = &trimmed[hash_count..];
    if rest.is_empty() {
        return None;
    }
    
    // # 后应该有空格
    if !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }
    
    let heading_text = rest.trim().to_string();
    if heading_text.is_empty() {
        return None;
    }
    
    Some((hash_count as u8, heading_text))
}

/// 找到章节的结束位置
fn find_section_end(
    positions: &[(usize, u8, String, usize)],
    current_idx: usize,
    total_len: usize,
) -> usize {
    let current_level = positions[current_idx].1;
    
    // 查找下一个同级或更高级（数字更小）的标题
    for i in (current_idx + 1)..positions.len() {
        if positions[i].1 <= current_level {
            return positions[i].3;
        }
    }
    
    // 没有找到，返回文件末尾
    total_len
}

/// 计算字数（支持中英文）
fn count_words(text: &str) -> usize {
    let mut count = 0;
    let mut in_word = false;
    
    for c in text.chars() {
        if c.is_ascii_alphabetic() {
            if !in_word {
                in_word = true;
            }
        } else {
            if in_word {
                count += 1;
                in_word = false;
            }
            // 中文字符直接计数
            if c >= '\u{4e00}' && c <= '\u{9fff}' {
                count += 1;
            }
        }
    }
    
    // 处理最后一个单词
    if in_word {
        count += 1;
    }
    
    count
}

/// 提取 WikiLink 链接
fn extract_wikilinks(content: &str, file_path: &str) -> Vec<NoteLink> {
    let mut links = Vec::new();
    
    // 匹配 [[link]] 或 [[link|alias]] 格式
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    
    for (line_num, line) in content.lines().enumerate() {
        for cap in re.captures_iter(line) {
            if let Some(link_match) = cap.get(1) {
                let link_text = link_match.as_str().trim();
                if !link_text.is_empty() {
                    links.push(NoteLink {
                        from_path: file_path.to_string(),
                        to_note: link_text.to_string(),
                        line: line_num + 1,
                    });
                }
            }
        }
    }
    
    links
}

/// 从文件路径提取笔记标题
pub fn extract_title_from_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

/// 从内容提取笔记标题（第一个 # 标题或使用文件名）
pub fn extract_title(content: &str, file_path: &str) -> String {
    // 查找第一个 # 标题
    for line in content.lines() {
        if let Some((1, title)) = parse_heading_line(line) {
            return title;
        }
    }
    
    // 没有找到 # 标题，使用文件名
    extract_title_from_path(file_path)
}

/// 构建笔记元数据
pub fn build_note_meta(content: &str, path: &str, mtime: u64) -> NoteMeta {
    let (tags, outlinks) = parse_markdown(content, path);
    let title = extract_title(content, path);
    let word_count = count_words(content);
    
    NoteMeta {
        path: path.to_string(),
        title,
        tags,
        outlinks,
        inlink_count: 0, // 稍后在 ranking 阶段计算
        word_count,
        mtime,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heading() {
        assert_eq!(parse_heading_line("# Hello"), Some((1, "Hello".to_string())));
        assert_eq!(parse_heading_line("## World"), Some((2, "World".to_string())));
        assert_eq!(parse_heading_line("### Test"), Some((3, "Test".to_string())));
        assert_eq!(parse_heading_line("Not a heading"), None);
        assert_eq!(parse_heading_line("#NoSpace"), None);
    }

    #[test]
    fn test_extract_wikilinks() {
        let content = "This is a [[link]] and [[another|alias]] link.";
        let links = extract_wikilinks(content, "test.md");
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].to_note, "link");
        assert_eq!(links[1].to_note, "another");
    }

    #[test]
    fn test_count_words() {
        assert_eq!(count_words("Hello world"), 2);
        assert_eq!(count_words("你好世界"), 4);
        // "Hello" = 1, "你" = 1, "好" = 1, "world" = 1 = 4
        assert_eq!(count_words("Hello 你好 world"), 4);
    }
}
