//! Deep Research 节点实现

use std::sync::Arc;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::agent::llm_client::LlmClient;
use crate::agent::deep_research::types::*;
use crate::agent::deep_research::tavily::TavilyClient;
use crate::agent::deep_research::crawler::JinaClient;
use crate::langgraph::error::{GraphError, Interrupt};

/// 节点执行结果
pub struct NodeResult {
    pub state: DeepResearchState,
    pub next_node: Option<String>,
}

/// 发送事件到前端
fn emit_event(app: &AppHandle, event: DeepResearchEvent) {
    let _ = app.emit("deep-research-event", &event);
}

/// 从 LLM 响应中提取 JSON
/// 
/// 处理多种常见格式：
/// - 纯 JSON
/// - ```json ... ``` 代码块
/// - ``` ... ``` 代码块
/// - 带有前缀/后缀文字的 JSON
fn extract_json(text: &str) -> Result<String, String> {
    let text = text.trim();
    
    // 空响应
    if text.is_empty() {
        return Err("LLM 返回了空响应".to_string());
    }
    
    // 1. 尝试处理 ```json ... ``` 格式
    if let Some(start_idx) = text.find("```json") {
        let json_start = start_idx + 7; // 跳过 "```json"
        if let Some(end_idx) = text[json_start..].find("```") {
            let json_str = text[json_start..json_start + end_idx].trim();
            if !json_str.is_empty() {
                return Ok(json_str.to_string());
            }
        }
    }
    
    // 2. 尝试处理 ``` ... ``` 格式（无语言标识）
    if text.starts_with("```") && !text.starts_with("```json") {
        let json_start = text.find('\n').map(|i| i + 1).unwrap_or(3);
        if let Some(end_idx) = text[json_start..].find("```") {
            let json_str = text[json_start..json_start + end_idx].trim();
            if !json_str.is_empty() {
                return Ok(json_str.to_string());
            }
        }
    }
    
    // 3. 尝试找到 JSON 对象的边界 { ... }
    if let Some(start_idx) = text.find('{') {
        // 找到匹配的结束括号
        let mut depth = 0;
        let mut end_idx = start_idx;
        let chars: Vec<char> = text.chars().collect();
        
        for (i, &ch) in chars.iter().enumerate().skip(start_idx) {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end_idx = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        
        if depth == 0 && end_idx > start_idx {
            let json_str: String = chars[start_idx..=end_idx].iter().collect();
            return Ok(json_str);
        }
    }
    
    // 4. 尝试找到 JSON 数组的边界 [ ... ]
    if let Some(start_idx) = text.find('[') {
        let mut depth = 0;
        let mut end_idx = start_idx;
        let chars: Vec<char> = text.chars().collect();
        
        for (i, &ch) in chars.iter().enumerate().skip(start_idx) {
            match ch {
                '[' => depth += 1,
                ']' => {
                    depth -= 1;
                    if depth == 0 {
                        end_idx = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        
        if depth == 0 && end_idx > start_idx {
            let json_str: String = chars[start_idx..=end_idx].iter().collect();
            return Ok(json_str);
        }
    }
    
    // 5. 如果都找不到，返回原文（让 JSON 解析器报告具体错误）
    Ok(text.to_string())
}

/// 解析 JSON 并提供更好的错误信息
fn parse_json<T: serde::de::DeserializeOwned>(text: &str, context: &str) -> Result<T, String> {
    let json_str = extract_json(text)?;
    
    serde_json::from_str(&json_str).map_err(|e| {
        // 提供更详细的错误信息
        let preview: String = json_str.chars().take(200).collect();
        format!(
            "{}: {} (响应预览: {}...)",
            context,
            e,
            preview
        )
    })
}

// ============ 节点实现 ============

/// 分析主题节点
/// 
/// 分析用户输入的研究主题，提取关键词用于搜索
/// - 如果是简单问候/闲聊，直接回复
/// - 如果主题不够明确，触发 interrupt 请求用户澄清
/// - 如果有 clarification，使用它来增强研究主题
pub async fn analyze_topic_node(
    app: &AppHandle,
    llm: &Arc<LlmClient>,
    mut state: DeepResearchState,
) -> Result<NodeResult, String> {
    state.phase = ResearchPhase::AnalyzingTopic;
    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: "正在分析研究主题...".to_string(),
    });

    // 如果有用户澄清，将其合并到主题中
    let effective_topic = if let Some(ref clarification) = state.clarification {
        format!("{}\n\n用户补充说明：{}", state.topic, clarification)
    } else {
        state.topic.clone()
    };

    // 第一步：让 LLM 判断意图和是否需要澄清
    let intent_prompt = format!(
        r#"分析用户的研究请求，返回 JSON 格式：

用户输入：{}

请返回：
{{
    "intent": "RESEARCH" 或 "CHAT" 或 "CLARIFY",
    "reason": "判断原因",
    "clarify_question": "如果需要澄清，这里是要问用户的问题",
    "clarify_suggestions": ["建议1", "建议2", "建议3"]
}}

判断标准：
- CHAT: 问候、闲聊、感谢、告别等非研究请求
- CLARIFY: 主题太模糊、太宽泛、不知道具体想了解什么（如"帮我研究一下"、"看看这个"、单个词且含义不明确）
- RESEARCH: 明确的研究主题，可以直接开始搜索

只返回 JSON，不要其他内容。"#,
        effective_topic
    );

    let intent_response = llm.call_simple(&intent_prompt).await
        .unwrap_or_else(|_| r#"{"intent": "RESEARCH"}"#.to_string());

    // 解析意图（使用健壮的 JSON 提取）
    let intent_json: serde_json::Value = extract_json(&intent_response)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({"intent": "RESEARCH"}));
    
    let intent = intent_json["intent"].as_str().unwrap_or("RESEARCH").to_uppercase();

    // 如果是闲聊，直接回复
    if intent == "CHAT" {
        // 获取工作区上下文（轻量级）
        let recent_notes = get_recent_note_titles(&state.workspace_path, 3);
        let random_tags = get_random_tags(&state.workspace_path, 5);
        
        let context_hint = if !recent_notes.is_empty() || !random_tags.is_empty() {
            let notes_str = if !recent_notes.is_empty() {
                format!("最近在研究：{}", recent_notes.join("、"))
            } else {
                String::new()
            };
            let tags_str = if !random_tags.is_empty() {
                format!("笔记库标签：{}", random_tags.join("、"))
            } else {
                String::new()
            };
            format!("\n\n用户笔记库概况：\n{}{}{}", 
                notes_str,
                if !notes_str.is_empty() && !tags_str.is_empty() { "\n" } else { "" },
                tags_str
            )
        } else {
            String::new()
        };
        
        let chat_prompt = format!(
            r#"你是 Deep Research 助手。用户发来了一条非研究请求的消息，请友好地回复，并简短引导用户输入研究主题。

用户消息：{}{}

要求：
1. 回复要简短友好（2-3句话）
2. 基于用户笔记库内容，给出 2 个个性化的研究建议
3. 如果没有笔记库信息，可以给通用建议"#,
            state.topic,
            context_hint
        );

        let response = llm.call_simple(&chat_prompt).await
            .unwrap_or_else(|_| "你好！请输入一个研究主题，我来帮你在笔记库中搜索相关内容。".to_string());

        state.phase = ResearchPhase::Completed;
        state.report = Some(response.clone());

        emit_event(app, DeepResearchEvent::ReportChunk {
            content: response.clone(),
        });
        emit_event(app, DeepResearchEvent::Complete {
            report: response,
        });

        return Ok(NodeResult {
            state,
            next_node: None,
        });
    }

    // 如果需要澄清且还没有收到澄清
    if intent == "CLARIFY" && state.clarification.is_none() {
        let question = intent_json["clarify_question"]
            .as_str()
            .unwrap_or("请问您具体想研究什么内容？")
            .to_string();
        
        let suggestions: Vec<String> = intent_json["clarify_suggestions"]
            .as_array()
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect())
            .unwrap_or_else(|| vec![
                "可以说明具体想了解的方面".to_string(),
                "可以提供一些关键词".to_string(),
                "可以描述您的使用场景".to_string(),
            ]);

        // 创建中断
        let interrupt = Interrupt::new(
            serde_json::json!({
                "type": "clarification",
                "question": question,
                "suggestions": suggestions,
                "original_topic": state.topic,
            }),
            "analyze_topic"
        );

        // 更新状态
        state.phase = ResearchPhase::WaitingForClarification;
        
        // 发送事件到前端
        emit_event(app, DeepResearchEvent::NeedsClarification {
            question: question.clone(),
            suggestions: suggestions.clone(),
            interrupt_id: interrupt.id.clone(),
        });

        // 返回中断错误（会被 builder 捕获并转换为 GraphError::Interrupted）
        return Err(format!("INTERRUPT:{}", serde_json::to_string(&interrupt).unwrap_or_default()));
    }

    // 正常研究流程：提取关键词（使用可能包含澄清的有效主题）
    let prompt = format!(
        r#"你是一个研究助手。请分析以下研究主题，提取 3-5 个关键词用于在笔记库中搜索相关内容。

研究主题：{}

请直接返回关键词列表，每行一个关键词，不要其他内容。例如：
React
性能优化
虚拟DOM
组件设计"#,
        effective_topic
    );

    let response = llm.call_simple(&prompt).await?;
    
    // 解析关键词
    let keywords: Vec<String> = response
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.len() < 50)
        .take(5)
        .collect();

    if keywords.is_empty() {
        // 如果没有提取到关键词，使用原始主题
        state.keywords = vec![state.topic.clone()];
    } else {
        state.keywords = keywords;
    }

    emit_event(app, DeepResearchEvent::KeywordsExtracted {
        keywords: state.keywords.clone(),
    });

    Ok(NodeResult {
        state,
        next_node: Some("search_notes".to_string()),
    })
}

/// 搜索笔记节点
/// 
/// 根据搜索模式使用不同策略：
/// - Semantic: 使用前端传入的 RAG 搜索结果
/// - Keyword: 使用关键词文件搜索
/// - Hybrid: 合并两者结果
/// 
/// 同时可选支持网络搜索（Tavily）
pub async fn search_notes_node(
    app: &AppHandle,
    _llm: &Arc<LlmClient>,
    mut state: DeepResearchState,
    max_results: usize,
    tavily: Option<&Arc<TavilyClient>>,
    max_web_results: usize,
) -> Result<NodeResult, String> {
    state.phase = ResearchPhase::SearchingNotes;
    
    let search_mode_msg = match state.search_mode {
        SearchMode::Semantic => "语义搜索",
        SearchMode::Keyword => "关键词搜索",
        SearchMode::Hybrid => "混合搜索",
    };
    
    let web_search_msg = if tavily.is_some() { " + 网络搜索" } else { "" };
    
    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: format!("正在{}笔记库{}（关键词：{}）...", search_mode_msg, web_search_msg, state.keywords.join(", ")),
    });

    let mut all_results: Vec<NoteReference> = Vec::new();
    
    // 根据搜索模式选择策略
    match state.search_mode {
        SearchMode::Semantic => {
            // 使用前端传入的 RAG 搜索结果
            if !state.pre_searched_notes.is_empty() {
                all_results = state.pre_searched_notes.clone();
                #[cfg(debug_assertions)]
                println!("[DeepResearch] 使用语义搜索结果：{} 篇笔记", all_results.len());
            } else {
                // 没有预搜索结果，回退到关键词搜索
                #[cfg(debug_assertions)]
                println!("[DeepResearch] 没有预搜索结果，回退到关键词搜索");
                all_results = keyword_search(&state.workspace_path, &state.search_scope, &state.keywords, max_results);
            }
        }
        SearchMode::Keyword => {
            // 使用关键词搜索
            all_results = keyword_search(&state.workspace_path, &state.search_scope, &state.keywords, max_results);
        }
        SearchMode::Hybrid => {
            // 混合搜索：先用语义搜索，再用关键词补充
            if !state.pre_searched_notes.is_empty() {
                all_results = state.pre_searched_notes.clone();
            }
            
            // 用关键词搜索补充
            let keyword_results = keyword_search(&state.workspace_path, &state.search_scope, &state.keywords, max_results);
            for note in keyword_results {
                if !all_results.iter().any(|r| r.path == note.path) {
                    all_results.push(note);
                }
            }
        }
    }

    // 按分数排序，取前 N 个
    all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(max_results);

    state.found_notes = all_results;

    emit_event(app, DeepResearchEvent::NotesFound {
        notes: state.found_notes.clone(),
    });

    // ============ 网络搜索 ============
    if let Some(tavily_client) = tavily {
        // 切换到网络搜索阶段
        state.phase = ResearchPhase::SearchingWeb;
        emit_event(app, DeepResearchEvent::PhaseChange {
            phase: state.phase.clone(),
            message: "正在搜索网络获取相关内容...".to_string(),
        });
        
        #[cfg(debug_assertions)]
        println!("[DeepResearch] 执行网络搜索...");
        
        // 使用主题作为搜索查询
        let query = format!("{} {}", state.topic, state.keywords.join(" "));
        
        match tavily_client.search(&query, max_web_results).await {
            Ok(web_results) => {
                #[cfg(debug_assertions)]
                println!("[DeepResearch] 网络搜索找到 {} 个结果", web_results.len());
                state.web_search_results = web_results;
                
                emit_event(app, DeepResearchEvent::WebSearchComplete {
                    results: state.web_search_results.clone(),
                });
            }
            Err(e) => {
                // 网络搜索失败不影响主流程，只记录警告
                eprintln!("[DeepResearch] 网络搜索失败: {}", e);
            }
        }
    }

    // 如果既没有笔记也没有网络搜索结果，才报错
    if state.found_notes.is_empty() && state.web_search_results.is_empty() {
        state.phase = ResearchPhase::Error;
        state.error = Some("未找到相关笔记或网络内容".to_string());
        emit_event(app, DeepResearchEvent::Error {
            message: "未找到与主题相关的笔记或网络内容".to_string(),
        });
        return Ok(NodeResult {
            state,
            next_node: None,
        });
    }

    Ok(NodeResult {
        state,
        next_node: Some("crawl_web".to_string()),
    })
}

/// 爬取网页节点
/// 
/// 逐个爬取网络搜索结果的网页内容
pub async fn crawl_web_node(
    app: &AppHandle,
    mut state: DeepResearchState,
    jina: Option<&Arc<JinaClient>>,
    max_pages: usize,
) -> Result<NodeResult, String> {
    // 如果没有网络搜索结果，直接跳到下一步
    if state.web_search_results.is_empty() {
        return Ok(NodeResult {
            state,
            next_node: Some("read_notes".to_string()),
        });
    }

    // 如果没有 Jina 客户端，跳过爬取
    let jina_client = match jina {
        Some(client) => client,
        None => {
            #[cfg(debug_assertions)]
            println!("[DeepResearch] 无 Jina 客户端，跳过网页爬取");
            return Ok(NodeResult {
                state,
                next_node: Some("read_notes".to_string()),
            });
        }
    };

    state.phase = ResearchPhase::CrawlingWeb;
    let pages_to_crawl = state.web_search_results.iter().take(max_pages).collect::<Vec<_>>();
    let total = pages_to_crawl.len();

    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: format!("正在爬取 {} 个网页内容...", total),
    });

    for (index, web_result) in pages_to_crawl.into_iter().enumerate() {
        emit_event(app, DeepResearchEvent::CrawlingPage {
            url: web_result.url.clone(),
            title: web_result.title.clone(),
            index: index + 1,
            total,
        });

        #[cfg(debug_assertions)]
        println!("[DeepResearch] 爬取网页 {}/{}: {}", index + 1, total, web_result.url);

        match jina_client.crawl(&web_result.url).await {
            Ok(crawled) => {
                let content_preview: String = crawled.content.chars().take(200).collect();
                
                emit_event(app, DeepResearchEvent::PageCrawled {
                    url: crawled.url.clone(),
                    title: crawled.title.clone(),
                    content_preview: content_preview.clone(),
                });

                state.crawled_pages.push(CrawledPageContent {
                    url: crawled.url,
                    title: crawled.title,
                    content: crawled.content,
                });
            }
            Err(e) => {
                #[cfg(debug_assertions)]
                eprintln!("[DeepResearch] 爬取网页失败: {} - {}", web_result.url, e);
                // 爬取失败不影响整体流程，继续处理下一个
            }
        }
    }

    #[cfg(debug_assertions)]
    println!("[DeepResearch] 成功爬取 {} 个网页", state.crawled_pages.len());

    Ok(NodeResult {
        state,
        next_node: Some("read_notes".to_string()),
    })
}

/// 关键词文件搜索（只匹配标题和H2，要求>=2个关键词）
fn keyword_search(
    workspace_path: &str,
    search_scope: &Option<String>,
    keywords: &[String],
    max_results: usize,
) -> Vec<NoteReference> {
    let mut results: Vec<NoteReference> = Vec::new();
    
    let search_path = match search_scope {
        Some(scope) => Path::new(workspace_path).join(scope),
        None => Path::new(workspace_path).to_path_buf(),
    };

    let walker = WalkDir::new(&search_path)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        if results.len() >= max_results * 3 {
            break;
        }
        
        let path = entry.path();
        
        if !path.extension().map(|e| e == "md").unwrap_or(false) {
            continue;
        }

        let path_str = path.to_string_lossy();
        if path_str.contains("/.") || path_str.contains("\\.") {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(path) {
            let title = extract_title(&content, path);
            let title_lower = title.to_lowercase();
            
            // 提取 H2 标题
            let h2_headings: Vec<String> = content.lines()
                .filter(|l| l.trim().starts_with("## "))
                .map(|l| l.trim()[3..].to_lowercase())
                .collect();
            
            let mut score = 0.0;
            let mut match_count = 0;
            let mut matched_in: Vec<String> = Vec::new();
            
            for keyword in keywords {
                let kw = keyword.to_lowercase();
                let mut matched = false;
                
                // 标题匹配 (权重 3.0)
                if title_lower.contains(&kw) {
                    score += 3.0;
                    matched = true;
                    if !matched_in.contains(&format!("标题: {}", title)) {
                        matched_in.push(format!("标题: {}", title));
                    }
                }
                
                // H2 匹配 (权重 1.5)
                for h2 in &h2_headings {
                    if h2.contains(&kw) {
                        score += 1.5;
                        matched = true;
                        let h2_display = format!("## {}", h2);
                        if !matched_in.contains(&h2_display) {
                            matched_in.push(h2_display);
                        }
                        break;
                    }
                }
                
                if matched {
                    match_count += 1;
                }
            }
            
            // 要求匹配 >= 2 个关键词
            if match_count >= 2 {
                let relative_path = path.strip_prefix(workspace_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.to_string_lossy().to_string());
                
                results.push(NoteReference {
                    path: relative_path,
                    title,
                    score,
                    snippet: if matched_in.is_empty() {
                        None
                    } else {
                        Some(matched_in.join(" | ").chars().take(200).collect())
                    },
                });
            }
        }
    }

    results
}

/// 从笔记内容中提取标题
fn extract_title(content: &str, path: &Path) -> String {
    // 尝试从 frontmatter 中提取 title
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("\n---") {
            let frontmatter = &content[3..3 + end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if line.starts_with("title:") {
                    return line[6..].trim().trim_matches('"').trim_matches('\'').to_string();
                }
            }
        }
    }
    
    // 尝试从第一个 # 标题提取
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("# ") {
            return line[2..].to_string();
        }
    }
    
    // 使用文件名
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "未命名".to_string())
}

/// 获取最近修改的笔记标题
fn get_recent_note_titles(workspace_path: &str, count: usize) -> Vec<String> {
    use std::fs;
    
    let mut notes: Vec<(String, std::time::SystemTime)> = Vec::new();
    
    for entry in WalkDir::new(workspace_path)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.extension().map(|e| e == "md").unwrap_or(false) {
            continue;
        }
        // 跳过隐藏文件
        let path_str = path.to_string_lossy();
        if path_str.contains("/.") || path_str.contains("\\.") {
            continue;
        }
        
        if let Ok(metadata) = fs::metadata(path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(content) = fs::read_to_string(path) {
                    let title = extract_title(&content, path);
                    notes.push((title, modified));
                }
            }
        }
    }
    
    // 按修改时间排序，取最近的
    notes.sort_by(|a, b| b.1.cmp(&a.1));
    notes.into_iter().take(count).map(|(t, _)| t).collect()
}

/// 获取随机标签
fn get_random_tags(workspace_path: &str, count: usize) -> Vec<String> {
    use std::collections::HashSet;
    use rand::seq::SliceRandom;
    
    let mut all_tags: HashSet<String> = HashSet::new();
    
    for entry in WalkDir::new(workspace_path)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
        .take(100)  // 只扫描前 100 个文件以提高效率
    {
        let path = entry.path();
        if !path.extension().map(|e| e == "md").unwrap_or(false) {
            continue;
        }
        
        if let Ok(content) = std::fs::read_to_string(path) {
            // 从 frontmatter 提取 tags
            if content.starts_with("---") {
                if let Some(end) = content[3..].find("\n---") {
                    let frontmatter = &content[3..3 + end];
                    for line in frontmatter.lines() {
                        let line = line.trim();
                        if line.starts_with("tags:") {
                            // 支持 tags: [tag1, tag2] 或 tags: tag1, tag2
                            let tags_str = line[5..].trim();
                            let tags_str = tags_str.trim_start_matches('[').trim_end_matches(']');
                            for tag in tags_str.split(',') {
                                let tag = tag.trim().trim_matches('"').trim_matches('\'').trim_matches('#');
                                if !tag.is_empty() && tag.len() < 20 {
                                    all_tags.insert(tag.to_string());
                                }
                            }
                        }
                    }
                }
            }
            
            // 从内容中提取 #tag 格式的标签
            for word in content.split_whitespace() {
                if word.starts_with('#') && word.len() > 1 && word.len() < 20 {
                    let tag = word[1..].trim_end_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-');
                    if !tag.is_empty() && !tag.chars().all(|c| c.is_numeric()) {
                        all_tags.insert(tag.to_string());
                    }
                }
            }
        }
    }
    
    // 随机选择
    let mut tags: Vec<String> = all_tags.into_iter().collect();
    let mut rng = rand::thread_rng();
    tags.shuffle(&mut rng);
    tags.into_iter().take(count).collect()
}

/// 阅读笔记节点
/// 
/// 批量读取找到的笔记内容
/// 如果没有本地笔记但有网络结果，跳过此阶段直接生成大纲
pub async fn read_notes_node(
    app: &AppHandle,
    llm: &Arc<LlmClient>,
    mut state: DeepResearchState,
    max_notes: usize,
) -> Result<NodeResult, String> {
    // 如果没有本地笔记，检查是否有网络结果
    if state.found_notes.is_empty() {
        if !state.web_search_results.is_empty() {
            // 有网络结果，跳过阅读笔记阶段，直接生成大纲
            #[cfg(debug_assertions)]
            println!("[DeepResearch] 无本地笔记，使用 {} 个网络搜索结果生成报告", state.web_search_results.len());
            
            emit_event(app, DeepResearchEvent::PhaseChange {
                phase: ResearchPhase::ReadingNotes,
                message: "本地无相关笔记，将基于网络搜索结果生成报告...".to_string(),
            });
            
            return Ok(NodeResult {
                state,
                next_node: Some("generate_outline".to_string()),
            });
        } else {
            // 既没有笔记也没有网络结果
            state.phase = ResearchPhase::Error;
            state.error = Some("未找到相关笔记或网络内容".to_string());
            return Ok(NodeResult {
                state,
                next_node: None,
            });
        }
    }

    state.phase = ResearchPhase::ReadingNotes;
    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: format!("正在阅读 {} 篇相关笔记...", state.found_notes.len().min(max_notes)),
    });

    let notes_to_read: Vec<_> = state.found_notes.iter().take(max_notes).cloned().collect();
    let total = notes_to_read.len();

    for (index, note_ref) in notes_to_read.into_iter().enumerate() {
        emit_event(app, DeepResearchEvent::ReadingNote {
            path: note_ref.path.clone(),
            title: note_ref.title.clone(),
            index: index + 1,
            total,
        });

        // 读取笔记内容
        let full_path = std::path::Path::new(&state.workspace_path).join(&note_ref.path);
        let content = match tokio::fs::read_to_string(&full_path).await {
            Ok(c) => c,
            Err(e) => {
                #[cfg(debug_assertions)]
                eprintln!("[DeepResearch] 读取笔记 {} 失败: {}", note_ref.path, e);
                continue;
            }
        };

        // 生成摘要（如果内容较长）
        let summary = if content.len() > 1000 {
            let summary_prompt = format!(
                r#"请用 2-3 句话总结以下笔记的主要内容：

{}

摘要："#,
                content.chars().take(3000).collect::<String>()
            );
            match llm.call_simple(&summary_prompt).await {
                Ok(s) => Some(s.trim().to_string()),
                Err(_) => None,
            }
        } else {
            None
        };

        let note_content = NoteContent {
            path: note_ref.path.clone(),
            title: note_ref.title.clone(),
            content,
            summary: summary.clone(),
        };

        emit_event(app, DeepResearchEvent::NoteRead {
            path: note_ref.path,
            title: note_ref.title,
            summary,
        });

        state.read_notes.push(note_content);
    }

    // 即使部分笔记读取失败，只要有爬取的网页内容或读取到的笔记，就继续
    if state.read_notes.is_empty() && state.crawled_pages.is_empty() {
        state.phase = ResearchPhase::Error;
        state.error = Some("无法读取任何笔记或网页内容".to_string());
        return Ok(NodeResult {
            state,
            next_node: None,
        });
    }

    Ok(NodeResult {
        state,
        next_node: Some("generate_outline".to_string()),
    })
}

/// 生成大纲节点
/// 
/// 基于阅读的笔记内容和/或网络搜索结果，生成报告大纲
pub async fn generate_outline_node(
    app: &AppHandle,
    llm: &Arc<LlmClient>,
    mut state: DeepResearchState,
) -> Result<NodeResult, String> {
    state.phase = ResearchPhase::GeneratingOutline;
    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: "正在生成报告大纲...".to_string(),
    });

    // 构建笔记摘要
    let notes_summary: String = if state.read_notes.is_empty() {
        "（无本地笔记）".to_string()
    } else {
        state.read_notes
            .iter()
            .map(|n| {
                let summary = n.summary.as_ref().map(|s| format!("\n   摘要: {}", s)).unwrap_or_default();
                format!("- {} ({}){}", n.title, n.path, summary)
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    // 构建爬取的网页内容摘要
    let web_summary: String = if state.crawled_pages.is_empty() {
        // 如果没有爬取内容，使用搜索结果摘要
        if state.web_search_results.is_empty() {
            String::new()
        } else {
            let web_content = state.web_search_results
                .iter()
                .map(|w| format!("- {} ({})\n  {}", w.title, w.url, w.content.chars().take(200).collect::<String>()))
                .collect::<Vec<_>>()
                .join("\n");
            format!("\n\n网络搜索结果：\n{}", web_content)
        }
    } else {
        // 使用爬取的完整网页内容
        let crawled_content = state.crawled_pages
            .iter()
            .map(|p| format!("## {} ({})\n{}", p.title, p.url, p.content.chars().take(500).collect::<String>()))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");
        format!("\n\n网络资料：\n{}", crawled_content)
    };

    let prompt = format!(
        r#"你是一个研究助手。基于以下内容，为研究主题生成一个报告大纲。

研究主题：{}

相关笔记：
{}{}

请生成一个 JSON 格式的报告大纲，包含标题和 3-5 个章节，每个章节有要点和相关引用来源。
格式：
{{
  "title": "报告标题",
  "sections": [
    {{
      "heading": "章节标题",
      "points": ["要点1", "要点2"],
      "related_notes": ["来源1", "来源2"]
    }}
  ]
}}

请直接返回 JSON，不要其他内容："#,
        state.topic,
        notes_summary,
        web_summary
    );

    let response = llm.call_simple(&prompt).await?;
    
    // 解析 JSON（使用健壮的 JSON 提取）
    let outline: ReportOutline = parse_json(&response, "解析大纲失败")?;

    emit_event(app, DeepResearchEvent::OutlineGenerated {
        outline: outline.clone(),
    });

    state.outline = Some(outline);

    Ok(NodeResult {
        state,
        next_node: Some("write_report".to_string()),
    })
}

/// 撰写报告节点
/// 
/// 基于大纲和笔记内容/网络搜索结果，生成完整报告
pub async fn write_report_node(
    app: &AppHandle,
    llm: &Arc<LlmClient>,
    mut state: DeepResearchState,
    include_citations: bool,
) -> Result<NodeResult, String> {
    state.phase = ResearchPhase::WritingReport;
    emit_event(app, DeepResearchEvent::PhaseChange {
        phase: state.phase.clone(),
        message: "正在撰写研究报告...".to_string(),
    });

    let outline = state.outline.as_ref().ok_or("缺少报告大纲")?;
    
    // 构建笔记内容参考（移除 .md 后缀以便 LLM 正确生成双链）
    let notes_content: String = if state.read_notes.is_empty() {
        "（无本地笔记）".to_string()
    } else {
        state.read_notes
            .iter()
            .map(|n| {
                let content_preview = n.content.chars().take(2000).collect::<String>();
                // 移除 .md 后缀
                let note_name = n.title.trim_end_matches(".md");
                format!(
                    "## {}\n笔记名: {}\n\n{}\n\n---\n",
                    note_name, note_name, content_preview
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    // 构建网络内容参考（优先使用爬取的完整内容）
    let web_content: String = if !state.crawled_pages.is_empty() {
        let crawled_refs: String = state.crawled_pages
            .iter()
            .map(|p| {
                format!(
                    "## {}\n来源: {}\n\n{}\n\n---\n",
                    p.title, p.url, p.content
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        format!("\n网络资料（已爬取）：\n{}", crawled_refs)
    } else if !state.web_search_results.is_empty() {
        // 回退到搜索结果摘要
        let web_refs: String = state.web_search_results
            .iter()
            .map(|w| {
                format!(
                    "## {}\n来源: {}\n\n{}\n\n---\n",
                    w.title, w.url, w.content
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        format!("\n网络搜索结果：\n{}", web_refs)
    } else {
        String::new()
    };

    let has_web_content = !state.crawled_pages.is_empty() || !state.web_search_results.is_empty();
    let citation_instruction = if include_citations {
        let web_note = if has_web_content {
            " 引用网络来源时，请使用 Markdown 链接格式 [标题](URL)。"
        } else {
            ""
        };
        format!(
            "在引用笔记内容时，请使用 [[笔记名]] 格式标注来源（不要包含 .md 后缀，例如 [[我的笔记]] 而不是 [[我的笔记.md]]）。{}",
            web_note
        )
    } else {
        "不需要标注来源。".to_string()
    };

    let prompt = format!(
        r#"你是一个专业的研究报告撰写者。请基于以下大纲、笔记内容和网络搜索结果，撰写一份完整的 Markdown 格式研究报告。

研究主题：{}

报告大纲：
{}

参考笔记内容：
{}
{}

要求：
1. 使用 Markdown 格式
2. 结构清晰，层次分明
3. 内容详实，有理有据
4. {}
5. 报告长度适中，不少于 500 字
6. 优先使用笔记库中的内容，网络搜索结果作为补充

请直接输出报告内容："#,
        state.topic,
        serde_json::to_string_pretty(&outline).unwrap_or_default(),
        notes_content,
        web_content,
        citation_instruction
    );

    // 使用流式输出
    let mut report = String::new();
    let mut receiver = llm.call_stream_simple(&prompt).await?;
    
    while let Some(chunk) = receiver.recv().await {
        report.push_str(&chunk);
        state.report_chunks.push(chunk.clone());
        
        emit_event(app, DeepResearchEvent::ReportChunk {
            content: chunk,
        });
    }

    state.report = Some(report.clone());
    state.phase = ResearchPhase::Completed;

    emit_event(app, DeepResearchEvent::Complete {
        report,
    });

    Ok(NodeResult {
        state,
        next_node: None,
    })
}
