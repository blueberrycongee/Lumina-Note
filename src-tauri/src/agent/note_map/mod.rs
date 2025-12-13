//! Note Map 模块
//!
//! 实现类似 Aider Repo Map 的笔记库结构摘要功能
//!
//! ## 功能
//! - 解析 Markdown 标题结构
//! - 提取 WikiLink 链接
//! - 基于引用关系排序笔记重要性
//! - 渲染笔记库大纲（Note Map）

pub mod types;
pub mod parser;
pub mod ranking;
pub mod renderer;

pub use types::*;
pub use parser::*;
pub use ranking::*;
pub use renderer::*;
