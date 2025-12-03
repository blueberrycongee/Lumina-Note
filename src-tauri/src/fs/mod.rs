mod manager;

// 文件监听仅桌面端可用
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod watcher;

pub use manager::*;
