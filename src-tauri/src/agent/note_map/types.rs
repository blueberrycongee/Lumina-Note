//! Note Map 类型定义

use serde::{Deserialize, Serialize};

/// 笔记标签（标题信息）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteTag {
    /// 笔记文件路径（相对于工作区）
    pub path: String,
    /// 标题文本
    pub heading: String,
    /// 标题级别 (1-6, # = 1, ## = 2, ...)
    pub level: u8,
    /// 行号（1-indexed）
    pub line: usize,
    /// 章节开始位置（字符偏移）
    pub start_offset: usize,
    /// 章节结束位置（字符偏移，下一个同级或更高级标题前）
    pub end_offset: usize,
    /// 该章节字数
    pub word_count: usize,
}

/// 笔记链接（WikiLink）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteLink {
    /// 源文件路径
    pub from_path: String,
    /// 目标笔记名（[[xxx]] 中的 xxx）
    pub to_note: String,
    /// 行号
    pub line: usize,
}

/// 笔记元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMeta {
    /// 文件路径（相对于工作区）
    pub path: String,
    /// 笔记标题（第一个 # 标题或文件名）
    pub title: String,
    /// 所有标题标签
    pub tags: Vec<NoteTag>,
    /// 出链（该笔记引用的其他笔记）
    pub outlinks: Vec<NoteLink>,
    /// 入链数量（被其他笔记引用的次数）
    pub inlink_count: usize,
    /// 总字数
    pub word_count: usize,
    /// 文件修改时间
    pub mtime: u64,
}

/// 排序后的笔记
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedNote {
    /// 笔记元数据
    pub meta: NoteMeta,
    /// 重要性分数
    pub score: f64,
}

/// Note Map 配置
#[derive(Debug, Clone)]
pub struct NoteMapConfig {
    /// 最大 token 数
    pub max_tokens: usize,
    /// 是否显示字数
    pub show_word_count: bool,
    /// 最大标题深度（1-6）
    pub max_heading_depth: u8,
}

impl Default for NoteMapConfig {
    fn default() -> Self {
        Self {
            max_tokens: 1024,
            show_word_count: true,
            max_heading_depth: 3,
        }
    }
}
