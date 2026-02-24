//! Deep Research 模块
//!
//! 针对笔记库进行深度研究，生成综合报告

pub mod builder;
pub mod crawler;
pub mod nodes;
pub mod tavily;
pub mod types;

pub use builder::{build_deep_research_graph, DeepResearchContext};
pub use types::*;
