//! Note Map 渲染器
//!
//! 将笔记结构渲染为 LLM 可读的文本格式

use super::types::{RankedNote, NoteMapConfig};

/// 渲染 Note Map
///
/// 输出格式类似 Aider 的 Repo Map：
/// ```text
/// 编程笔记/Rust/所有权.md:
/// ⋮...
/// │# 所有权
/// │## 借用规则                 (L15, 328字)
/// │## Move 语义                (L45, 256字)
/// ⋮...
/// ```
pub fn render_note_map(
    ranked_notes: &[RankedNote],
    config: &NoteMapConfig,
) -> String {
    let mut output = String::new();
    
    for ranked in ranked_notes {
        let note = &ranked.meta;
        
        // 文件路径
        output.push_str(&note.path);
        output.push_str(":\n");
        
        // 过滤标题深度
        let visible_tags: Vec<_> = note.tags
            .iter()
            .filter(|t| t.level <= config.max_heading_depth)
            .collect();
        
        if visible_tags.is_empty() {
            // 没有标题，显示笔记标题和字数
            output.push_str(&format!("│ {} ", note.title));
            if config.show_word_count {
                output.push_str(&format!("({}字)", note.word_count));
            }
            output.push('\n');
        } else {
            output.push_str("⋮...\n");
            
            for tag in visible_tags {
                // 缩进
                let indent = "│".to_string() + &"  ".repeat((tag.level - 1) as usize);
                
                // 标题前缀
                let prefix = "#".repeat(tag.level as usize);
                
                // 行号和字数
                let mut meta = format!("(L{})", tag.line);
                if config.show_word_count && tag.word_count > 0 {
                    meta = format!("(L{}, {}字)", tag.line, tag.word_count);
                }
                
                output.push_str(&format!(
                    "{}{} {}  {}\n",
                    indent,
                    prefix,
                    tag.heading,
                    meta
                ));
            }
            
            output.push_str("⋮...\n");
        }
        
        output.push('\n');
    }
    
    output
}

/// 根据 Token 预算裁剪 Note Map
///
/// 使用二分搜索找到最优的笔记数量
pub fn fit_to_token_budget(
    ranked_notes: &[RankedNote],
    config: &NoteMapConfig,
) -> Vec<RankedNote> {
    if ranked_notes.is_empty() {
        return vec![];
    }
    
    let max_tokens = config.max_tokens;
    
    // 二分搜索
    let mut lower = 1;
    let mut upper = ranked_notes.len();
    let mut best_count = 1;
    
    while lower <= upper {
        let mid = (lower + upper) / 2;
        let subset: Vec<_> = ranked_notes.iter().take(mid).cloned().collect();
        let rendered = render_note_map(&subset, config);
        let tokens = estimate_tokens(&rendered);
        
        if tokens <= max_tokens {
            best_count = mid;
            lower = mid + 1;
        } else {
            if mid == 0 {
                break;
            }
            upper = mid - 1;
        }
    }
    
    ranked_notes.iter().take(best_count).cloned().collect()
}

/// 估算 Token 数量
///
/// 简化估算：中文字符约 1 token，英文约 0.25 token/字符
pub fn estimate_tokens(text: &str) -> usize {
    let mut tokens = 0;
    let mut ascii_chars = 0;
    
    for c in text.chars() {
        if c >= '\u{4e00}' && c <= '\u{9fff}' {
            // 中文字符
            tokens += 1;
        } else if c.is_ascii() {
            ascii_chars += 1;
        } else {
            // 其他 Unicode
            tokens += 1;
        }
    }
    
    // ASCII 字符约 4 个 = 1 token
    tokens += ascii_chars / 4;
    
    tokens
}

/// 生成完整的 Note Map（包含扫描、解析、排序、渲染）
pub async fn generate_note_map(
    workspace_path: &str,
    current_notes: &[String],
    mentioned_notes: &[String],
    config: &NoteMapConfig,
) -> Result<String, String> {
    
    use super::ranking::{rank_notes, RankingConfig};
    
    
    
    // 1. 扫描工作区中的所有 .md 文件
    let mut notes = Vec::new();
    scan_markdown_files(workspace_path, workspace_path, &mut notes).await?;
    
    if notes.is_empty() {
        return Ok("(笔记库为空)".to_string());
    }
    
    // 2. 排序
    let ranking_config = RankingConfig::default();
    let ranked = rank_notes(&mut notes, current_notes, mentioned_notes, &ranking_config);
    
    // 3. Token 预算裁剪
    let fitted = fit_to_token_budget(&ranked, config);
    
    // 4. 渲染
    let map = render_note_map(&fitted, config);
    
    Ok(map)
}

/// 递归扫描 Markdown 文件
async fn scan_markdown_files(
    base_path: &str,
    current_path: &str,
    notes: &mut Vec<super::types::NoteMeta>,
) -> Result<(), String> {
    use tokio::fs;
    
    
    let mut entries = fs::read_dir(current_path)
        .await
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
        
        // 跳过隐藏文件和目录
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }
        
        if file_type.is_dir() {
            // 递归扫描子目录
            Box::pin(scan_markdown_files(
                base_path,
                path.to_str().unwrap_or(""),
                notes,
            ))
            .await?;
        } else if file_type.is_file() {
            // 检查是否是 .md 文件
            if let Some(ext) = path.extension() {
                if ext == "md" {
                    // 读取文件内容
                    if let Ok(content) = fs::read_to_string(&path).await {
                        // 获取相对路径
                        let rel_path = path
                            .strip_prefix(base_path)
                            .unwrap_or(&path)
                            .to_str()
                            .unwrap_or("")
                            .replace('\\', "/");
                        
                        // 获取修改时间
                        let mtime = entry
                            .metadata()
                            .await
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        
                        let meta = super::parser::build_note_meta(&content, &rel_path, mtime);
                        notes.push(meta);
                    }
                }
            }
        }
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        assert!(estimate_tokens("Hello") < 5);
        assert!(estimate_tokens("你好世界") == 4);
    }
}
