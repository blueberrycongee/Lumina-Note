//! 分层消息架构
//!
//! 将 LLM 消息分成多个逻辑块，便于管理和组装

mod chunks;

pub use chunks::*;
