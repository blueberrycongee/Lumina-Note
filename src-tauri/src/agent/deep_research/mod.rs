//! Deep Research 模块
//! 
//! 针对笔记库进行深度研究，生成综合报告

pub mod types;
pub mod nodes;
pub mod builder;
pub mod tavily;
pub mod crawler;

pub use types::*;
pub use builder::{build_deep_research_graph, DeepResearchContext};
pub use tavily::TavilyClient;
pub use crawler::JinaClient;
