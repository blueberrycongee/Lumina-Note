//! Agent 调试日志模块
//!
//! 记录 Agent 执行的完整过程到文件

#![allow(dead_code)]

use chrono::Local;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

/// 是否启用调试模式
static DEBUG_ENABLED: AtomicBool = AtomicBool::new(false);

/// 调试日志文件句柄
static DEBUG_FILE: OnceLock<Mutex<Option<File>>> = OnceLock::new();

/// 当前日志文件路径
static DEBUG_FILE_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn get_debug_file() -> &'static Mutex<Option<File>> {
    DEBUG_FILE.get_or_init(|| Mutex::new(None))
}

fn get_debug_file_path_lock() -> &'static Mutex<Option<PathBuf>> {
    DEBUG_FILE_PATH.get_or_init(|| Mutex::new(None))
}

/// 启用调试模式
pub fn enable_debug(workspace_path: &str) -> Result<PathBuf, String> {
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let filename = format!("agent-debug-{}.md", timestamp);
    let path = PathBuf::from(workspace_path).join(&filename);

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Failed to create debug log: {}", e))?;

    // 写入文件头
    {
        let mut file_guard = get_debug_file().lock().unwrap();
        *file_guard = Some(file);
    }

    {
        let mut path_guard = get_debug_file_path_lock().lock().unwrap();
        *path_guard = Some(path.clone());
    }

    DEBUG_ENABLED.store(true, Ordering::SeqCst);

    // 写入标题
    log_raw(&format!(
        r#"# Agent 调试日志

**生成时间**: {}
**工作区**: {}

---

"#,
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        workspace_path
    ));

    Ok(path)
}

/// 禁用调试模式
pub fn disable_debug() {
    DEBUG_ENABLED.store(false, Ordering::SeqCst);

    // 写入结束标记
    log_raw("\n\n---\n\n# 调试日志结束\n");

    let mut file_guard = get_debug_file().lock().unwrap();
    *file_guard = None;

    let mut path_guard = get_debug_file_path_lock().lock().unwrap();
    *path_guard = None;
}

/// 检查调试模式是否启用
pub fn is_debug_enabled() -> bool {
    DEBUG_ENABLED.load(Ordering::SeqCst)
}

/// 获取当前日志文件路径
pub fn get_debug_file_path() -> Option<PathBuf> {
    get_debug_file_path_lock().lock().unwrap().clone()
}

/// 写入原始内容
fn log_raw(content: &str) {
    if !is_debug_enabled() {
        return;
    }

    if let Ok(mut guard) = get_debug_file().lock() {
        if let Some(ref mut file) = *guard {
            let _ = Write::write_all(file, content.as_bytes());
            let _ = Write::flush(file);
        }
    }
}

/// 记录分隔线
pub fn log_separator(title: &str) {
    log_raw(&format!("\n## {}\n\n", title));
}

/// 记录子标题
pub fn log_subsection(title: &str) {
    log_raw(&format!("\n### {}\n\n", title));
}

/// 记录键值对
pub fn log_kv(key: &str, value: &str) {
    log_raw(&format!("**{}**: {}\n\n", key, value));
}

/// 记录代码块
pub fn log_code(lang: &str, content: &str) {
    if content.is_empty() {
        log_raw("*(空内容)*\n\n");
    } else {
        log_raw(&format!("```{}\n{}\n```\n\n", lang, content));
    }
}

/// 记录 JSON
pub fn log_json(label: &str, value: &serde_json::Value) {
    log_raw(&format!(
        "**{}**:\n```json\n{}\n```\n\n",
        label,
        serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
    ));
}

/// 记录配置信息
pub fn log_config(provider: &str, model: &str, temperature: f32) {
    log_separator("配置信息");
    log_kv("Provider", provider);
    log_kv("Model", model);
    log_kv("Temperature", &temperature.to_string());
}

/// 记录用户任务
pub fn log_task(task: &str) {
    log_separator("用户任务");
    log_code("", task);
}

/// 记录 Skills
pub fn log_skills(skills: &[crate::agent::types::SkillContext]) {
    if skills.is_empty() {
        return;
    }
    log_separator("Skills");
    let names: Vec<String> = skills
        .iter()
        .map(|s| s.title.as_deref().unwrap_or(&s.name).to_string())
        .collect();
    log_kv("已启用", &names.join(", "));
}

/// 记录意图分析
pub fn log_intent(intent_type: &str, route: &str, reason: &str) {
    log_separator("意图分析");
    log_kv("类型", intent_type);
    log_kv("路由", route);
    log_kv("原因", reason);
}

/// 安全截断字符串（处理多字节字符）
fn safe_truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{}...\n\n[内容已截断，共 {} 字符]", truncated, s.len())
    }
}

/// 记录发送给 LLM 的消息
pub fn log_llm_request(
    messages: &[crate::agent::types::Message],
    tools: Option<&[serde_json::Value]>,
) {
    log_subsection("LLM 请求");

    log_raw("**消息列表**:\n\n");
    for (i, msg) in messages.iter().enumerate() {
        log_raw(&format!(
            "#### 消息 {} - {}\n\n",
            i + 1,
            format!("{:?}", msg.role)
        ));

        // 安全截断过长的内容（处理中文等多字节字符）
        let content = safe_truncate(&msg.content, 2000);

        log_code("", &content);
    }

    if let Some(tools) = tools {
        log_raw(&format!("**工具数量**: {}\n\n", tools.len()));
        // 只记录工具名称，不记录完整定义
        let tool_names: Vec<String> = tools
            .iter()
            .filter_map(|t| t["function"]["name"].as_str().map(|s| s.to_string()))
            .collect();
        log_kv("可用工具", &tool_names.join(", "));
    }
}

/// 记录 LLM 响应
pub fn log_llm_response(
    content: &str,
    tool_calls: Option<&[crate::agent::types::ToolCall]>,
    tokens: (usize, usize, usize),
) {
    log_subsection("LLM 响应");

    log_kv(
        "Token 使用",
        &format!(
            "prompt={}, completion={}, total={}",
            tokens.0, tokens.1, tokens.2
        ),
    );

    if !content.is_empty() {
        log_raw("**思考/内容**:\n");
        log_code("", content);
    }

    if let Some(calls) = tool_calls {
        log_raw(&format!("**工具调用数量**: {}\n\n", calls.len()));
        for (i, call) in calls.iter().enumerate() {
            log_raw(&format!("#### 工具调用 {}: `{}`\n\n", i + 1, call.name));
            log_raw("**参数**:\n");
            log_code(
                "json",
                &serde_json::to_string_pretty(&call.params).unwrap_or_default(),
            );
        }
    }
}

/// 记录工具执行结果
pub fn log_tool_result(tool_name: &str, success: bool, content: &str, error: Option<&str>) {
    log_subsection(&format!("工具结果: `{}`", tool_name));

    log_kv("状态", if success { "✅ 成功" } else { "❌ 失败" });

    if success {
        // 安全截断过长的内容（处理中文等多字节字符）
        let display = safe_truncate(content, 3000);
        log_raw("**返回内容**:\n");
        log_code("", &display);
    } else if let Some(err) = error {
        log_kv("错误", err);
    }
}

/// 记录最终结果
pub fn log_final_result(result: &str) {
    log_separator("最终结果");
    log_code("", result);
}

/// 记录迭代开始
pub fn log_iteration(n: usize) {
    log_separator(&format!("迭代 {}", n));
}

/// 记录错误
pub fn log_error(error: &str) {
    log_separator("❌ 错误");
    log_code("", error);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_debug_log() {
        let dir = tempdir().unwrap();
        let path = enable_debug(dir.path().to_str().unwrap()).unwrap();

        assert!(is_debug_enabled());

        log_task("测试任务");
        log_intent("Create", "writer", "用户想创建笔记");

        disable_debug();

        assert!(!is_debug_enabled());

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("测试任务"));
        assert!(content.contains("Create"));
    }
}
