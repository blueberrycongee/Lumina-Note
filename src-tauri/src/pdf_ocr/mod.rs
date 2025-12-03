// PDF OCR 模块
// 纯 Rust 实现 PDF 解析 + OCR

pub mod server;
pub mod pdf;
pub mod ocr;
pub mod layout;

pub use server::start_server;
