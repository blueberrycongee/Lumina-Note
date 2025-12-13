//! ChatChunks - 分层消息结构
//!
//! 将消息分成多个逻辑块：
//! 1. System: 身份定义 + 工具说明 + 基础提醒
//! 2. Note Map: 笔记库结构（对话注入）
//! 3. Current Note: 当前编辑的笔记（对话注入）
//! 4. History: 历史对话
//! 5. Current: 当前任务 + 工具结果
//! 6. Reminder: 动态格式提醒

use crate::agent::types::{Message, MessageRole};

/// 分层消息结构
#[derive(Debug, Clone, Default)]
pub struct ChatChunks {
    /// 系统提示（身份 + 规则 + 基础提醒）
    pub system: String,
    
    /// Note Map 内容（笔记库结构摘要）
    pub note_map: Option<String>,
    
    /// 当前编辑的笔记路径
    pub current_note_path: Option<String>,
    
    /// 当前编辑的笔记内容
    pub current_note_content: Option<String>,
    
    /// 历史对话消息
    pub history: Vec<Message>,
    
    /// 当前用户任务
    pub current_task: String,
    
    /// 本轮工具执行结果
    pub tool_results: Vec<String>,
    
    /// 动态格式提醒（出错时添加）
    pub reminder: Option<String>,
}

impl ChatChunks {
    /// 创建新的 ChatChunks
    pub fn new(system: String) -> Self {
        Self {
            system,
            ..Default::default()
        }
    }
    
    /// 设置 Note Map
    pub fn with_note_map(mut self, note_map: String) -> Self {
        self.note_map = Some(note_map);
        self
    }
    
    /// 设置当前笔记
    pub fn with_current_note(mut self, path: String, content: String) -> Self {
        self.current_note_path = Some(path);
        self.current_note_content = Some(content);
        self
    }
    
    /// 设置历史对话
    pub fn with_history(mut self, history: Vec<Message>) -> Self {
        self.history = history;
        self
    }
    
    /// 设置当前任务
    pub fn with_task(mut self, task: String) -> Self {
        self.current_task = task;
        self
    }
    
    /// 添加工具结果
    pub fn add_tool_result(&mut self, result: String) {
        self.tool_results.push(result);
    }
    
    /// 设置动态提醒
    pub fn with_reminder(mut self, reminder: String) -> Self {
        self.reminder = Some(reminder);
        self
    }
    
    /// 转换为消息列表
    pub fn to_messages(&self) -> Vec<Message> {
        let mut messages = Vec::new();
        
        // 1. System 消息
        messages.push(Message {
            role: MessageRole::System,
            content: self.system.clone(),
            name: None,
            tool_call_id: None,
        });
        
        // 2. Note Map（对话注入）
        if let Some(ref note_map) = self.note_map {
            messages.push(Message {
                role: MessageRole::User,
                content: format!(
                    "以下是笔记库的结构摘要，请先了解。如需查看具体内容，请使用工具。\n\n{}",
                    note_map
                ),
                name: None,
                tool_call_id: None,
            });
            messages.push(Message {
                role: MessageRole::Assistant,
                content: "好的，我已了解笔记库结构。需要查看或编辑具体内容时，我会使用相应工具。".to_string(),
                name: None,
                tool_call_id: None,
            });
        }
        
        // 3. 当前笔记（对话注入）
        if let (Some(ref path), Some(ref content)) = (&self.current_note_path, &self.current_note_content) {
            // 添加行号
            let numbered = content.lines()
                .enumerate()
                .map(|(i, line)| format!("{:4} | {}", i + 1, line))
                .collect::<Vec<_>>()
                .join("\n");
            
            messages.push(Message {
                role: MessageRole::User,
                content: format!(
                    "当前正在编辑的笔记（你可以直接使用 edit_note 编辑）：\n\n\
                     文件：{}\n\
                     ---\n\
                     {}\n\
                     ---",
                    path, numbered
                ),
                name: None,
                tool_call_id: None,
            });
            messages.push(Message {
                role: MessageRole::Assistant,
                content: "好的，我看到了当前笔记的完整内容。".to_string(),
                name: None,
                tool_call_id: None,
            });
        }
        
        // 4. 历史对话
        for msg in &self.history {
            messages.push(msg.clone());
        }
        
        // 5. 当前任务
        messages.push(Message {
            role: MessageRole::User,
            content: self.current_task.clone(),
            name: None,
            tool_call_id: None,
        });
        
        // 6. 工具结果（用 user 角色，兼容所有模型）
        for result in &self.tool_results {
            messages.push(Message {
                role: MessageRole::User,
                content: format!("[工具执行结果]\n{}", result),
                name: None,
                tool_call_id: None,
            });
        }
        
        // 7. 动态格式提醒
        if let Some(ref reminder) = self.reminder {
            messages.push(Message {
                role: MessageRole::User,
                content: format!("[系统提醒] {}", reminder),
                name: None,
                tool_call_id: None,
            });
        }
        
        messages
    }
}

/// 基础格式提醒（放在 system prompt 末尾）
pub const FORMAT_REMINDER: &str = r#"
重要提醒：
1. 使用 edit_note 时，old_string 必须与文件内容完全匹配（包括空格和换行）
2. 编辑前建议先 read_note 或 read_section 获取最新内容
3. 如果编辑失败，请重新读取文件后再试
"#;

/// 检测是否需要动态提醒
pub fn detect_reminder_needed(last_error: Option<&str>) -> Option<String> {
    if let Some(error) = last_error {
        if error.contains("old_string not found") || error.contains("not found in file") {
            return Some(
                "上次编辑失败（找不到要替换的内容）。请先使用 read_note 获取最新内容，确保 old_string 完全匹配后再尝试编辑。".to_string()
            );
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_chunks_basic() {
        let chunks = ChatChunks::new("你是一个 AI 助手".to_string())
            .with_task("帮我看看笔记".to_string());
        
        let messages = chunks.to_messages();
        assert_eq!(messages.len(), 2); // system + task
        assert_eq!(messages[0].role, MessageRole::System);
        assert_eq!(messages[1].role, MessageRole::User);
    }

    #[test]
    fn test_chat_chunks_with_note_map() {
        let chunks = ChatChunks::new("你是一个 AI 助手".to_string())
            .with_note_map("笔记结构...".to_string())
            .with_task("帮我看看笔记".to_string());
        
        let messages = chunks.to_messages();
        assert_eq!(messages.len(), 4); // system + note_map(2) + task
    }
}
