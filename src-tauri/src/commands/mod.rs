use crate::error::AppError;
use crate::fs::{self, FileEntry, watcher};
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewBuilder, LogicalPosition, LogicalSize, Position, Size};
use tauri::WebviewUrl;
use std::io::Read;

/// Read file content
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    fs::read_file_content(&path)
}

/// Save file content
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), AppError> {
    fs::write_file_content(&path, &content)
}

/// List directory with file tree
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, AppError> {
    fs::list_dir_recursive(&path)
}

/// Create a new file
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), AppError> {
    fs::create_new_file(&path)
}

/// Create a new directory
#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), AppError> {
    fs::create_new_dir(&path)
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), AppError> {
    fs::delete_entry(&path)
}

/// Rename/move a file
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), AppError> {
    fs::rename_entry(&old_path, &new_path)
}

/// Show file/folder in system file explorer
#[tauri::command]
pub async fn show_in_explorer(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open for the parent directory
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()?;
    }
    
    Ok(())
}

/// 在主窗口内创建内嵌 WebView
#[tauri::command]
pub async fn create_embedded_webview(
    app: AppHandle, 
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64
) -> Result<(), AppError> {
    // 获取主窗口（通过 Manager::windows()）
    let windows = app.windows();
    let main_window = windows.get("main")
        .ok_or_else(|| AppError::InvalidPath("Main window not found".into()))?;
    
    // 如果已存在内嵌 webview，先关闭
    if let Some(webview) = app.get_webview("video-webview") {
        let _ = webview.close();
    }
    
    // 创建 WebView Builder
    let webview_builder = WebviewBuilder::new(
        "video-webview",
        WebviewUrl::External(url.parse().map_err(|_| AppError::InvalidPath("Invalid URL".into()))?)
    );
    
    // 创建内嵌 WebView
    let _webview = main_window.add_child(
        webview_builder,
        Position::Logical(LogicalPosition::new(x, y)),
        Size::Logical(LogicalSize::new(width, height)),
    ).map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    println!("[EmbeddedWebview] 创建成功: {} at ({}, {}) size {}x{}", url, x, y, width, height);
    
    Ok(())
}

/// 更新内嵌 WebView 的位置和大小
#[tauri::command]
pub async fn update_webview_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64
) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        webview.set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        webview.set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 关闭内嵌 WebView
#[tauri::command]
pub async fn close_embedded_webview(app: AppHandle) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        webview.close().map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// Open a new main window
#[tauri::command]
pub async fn open_new_window(app: AppHandle) -> Result<(), AppError> {
    let label = format!("window-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App("index.html".into())
    )
    .title("Lumina Note")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    Ok(())
}

/// 获取 B站视频 CID
#[tauri::command]
pub async fn get_bilibili_cid(bvid: String) -> Result<Option<u64>, AppError> {
    let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
    
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    let json: serde_json::Value = resp.json()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    if json["code"].as_i64() == Some(0) {
        if let Some(cid) = json["data"]["cid"].as_u64() {
            return Ok(Some(cid));
        }
    }
    
    Ok(None)
}

/// 获取 B站弹幕列表
#[tauri::command]
pub async fn get_bilibili_danmaku(cid: u64) -> Result<Vec<DanmakuItem>, AppError> {
    let url = format!("https://api.bilibili.com/x/v1/dm/list.so?oid={}", cid);
    
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    let bytes = resp.bytes()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    // 尝试解压 deflate
    let text = match flate2::read::DeflateDecoder::new(&bytes[..]).bytes().collect::<Result<Vec<u8>, _>>() {
        Ok(decompressed) => String::from_utf8_lossy(&decompressed).to_string(),
        Err(_) => String::from_utf8_lossy(&bytes).to_string(),
    };
    
    // 使用正则解析 XML 中的 <d> 标签
    let mut danmakus = Vec::new();
    
    // 查找所有 <d p="...">...</d> 模式
    let mut pos = 0;
    while let Some(start) = text[pos..].find("<d p=\"") {
        let abs_start = pos + start;
        
        // 找到 p 属性的结束引号
        if let Some(attr_end) = text[abs_start + 6..].find("\"") {
            let attr = &text[abs_start + 6..abs_start + 6 + attr_end];
            let parts: Vec<&str> = attr.split(',').collect();
            
            // 找到 > 和 </d>
            let content_start = abs_start + 6 + attr_end + 2; // 跳过 ">
            if let Some(content_end) = text[content_start..].find("</d>") {
                let content = &text[content_start..content_start + content_end];
                
                if parts.len() >= 5 {
                    danmakus.push(DanmakuItem {
                        time: parts[0].parse().unwrap_or(0.0),
                        content: content.to_string(),
                        timestamp: parts[4].parse().unwrap_or(0),
                    });
                }
                
                pos = content_start + content_end + 4; // 跳过 </d>
            } else {
                pos = abs_start + 1;
            }
        } else {
            pos = abs_start + 1;
        }
    }
    
    // 按时间排序
    danmakus.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    
    println!("[Danmaku] 解析到 {} 条弹幕", danmakus.len());
    
    Ok(danmakus)
}

#[derive(serde::Serialize)]
pub struct DanmakuItem {
    pub time: f64,
    pub content: String,
    pub timestamp: u64,
}

/// 在内嵌 WebView 中执行 JS 来跳转视频时间
#[tauri::command]
pub async fn seek_video_time(app: AppHandle, seconds: f64) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        // B站播放器的 video 元素
        let js = format!(
            r#"
            (function() {{
                const video = document.querySelector('video');
                if (video) {{
                    video.currentTime = {};
                    console.log('[LuminaNote] Seek to:', {});
                }}
            }})();
            "#,
            seconds, seconds
        );
        webview.eval(&js).map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 在 B站弹幕输入框中填充前缀（仅当输入框为空时）
#[tauri::command]
pub async fn fill_danmaku_prefix(app: AppHandle, prefix: String) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        let js = format!(
            r#"
            (function() {{
                // 尝试多种选择器
                const selectors = [
                    '.bpx-player-dm-input',
                    '.bpx-player-sending-area input',
                    '.bilibili-player-video-danmaku-input input',
                    'input[placeholder*="发个友善的弹幕"]',
                    'input[placeholder*="弹幕"]'
                ];
                
                for (const sel of selectors) {{
                    const input = document.querySelector(sel);
                    if (input) {{
                        // 只有当输入框为空时才填充
                        if (!input.value || input.value.trim() === '') {{
                            input.focus();
                            input.value = '{}';
                            // 触发 input 事件
                            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            console.log('[LuminaNote] 已填充前缀:', '{}');
                        }} else {{
                            console.log('[LuminaNote] 输入框非空，跳过填充');
                        }}
                        return;
                    }}
                }}
                console.log('[LuminaNote] 未找到弹幕输入框');
            }})();
            "#,
            prefix, prefix
        );
        webview.eval(&js).map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 监听弹幕输入框，为空时自动填充前缀
#[tauri::command]
pub async fn setup_danmaku_autofill(app: AppHandle, prefix: String) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        let js = format!(
            r#"
            (function() {{
                const prefix = '{}';
                
                // 移除旧的监听器
                if (window._luminaAutofillObserver) {{
                    window._luminaAutofillObserver.disconnect();
                }}
                
                // 定期检查输入框
                const checkAndFill = () => {{
                    const selectors = [
                        '.bpx-player-dm-input',
                        '.bpx-player-sending-area input',
                        'input[placeholder*="发个友善的弹幕"]',
                        'input[placeholder*="弹幕"]'
                    ];
                    
                    for (const sel of selectors) {{
                        const input = document.querySelector(sel);
                        if (input && (!input.value || input.value.trim() === '')) {{
                            input.value = prefix;
                            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            console.log('[LuminaNote] 自动填充前缀');
                            return true;
                        }}
                    }}
                    return false;
                }};
                
                // 监听焦点事件
                document.addEventListener('focusin', (e) => {{
                    if (e.target && e.target.tagName === 'INPUT') {{
                        const placeholder = e.target.placeholder || '';
                        if (placeholder.includes('弹幕') && (!e.target.value || e.target.value.trim() === '')) {{
                            e.target.value = prefix;
                            e.target.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            console.log('[LuminaNote] 焦点时自动填充');
                        }}
                    }}
                }});
                
                console.log('[LuminaNote] 弹幕自动填充已启用，前缀:', prefix);
            }})();
            "#,
            prefix
        );
        webview.eval(&js).map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 打开视频播放窗口（独立窗口备用）
#[tauri::command]
pub async fn open_video_window(app: AppHandle, url: String) -> Result<(), AppError> {
    // 如果窗口已存在，先关闭
    if let Some(window) = app.get_webview_window("video-player") {
        let _ = window.close();
    }
    
    // 创建新的 WebView 窗口
    let _window = WebviewWindowBuilder::new(
        &app,
        "video-player",
        WebviewUrl::External(url.parse().map_err(|_| AppError::InvalidPath("Invalid URL".into()))?)
    )
    .title("视频播放器 - Lumina Note")
    .inner_size(960.0, 640.0)
    .min_inner_size(640.0, 480.0)
    .center()
    .build()
    .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    println!("[VideoWindow] 窗口已创建: {}", url);
    
    Ok(())
}

/// 关闭视频播放窗口
#[tauri::command]
pub async fn close_video_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("video-player") {
        window.close().map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 获取视频当前时间（轮询方式）
/// 返回 JSON 字符串: {"currentTime": 123.45, "duration": 600.0, "paused": false} 或 null
#[tauri::command]
pub async fn get_video_time(app: AppHandle) -> Result<Option<String>, AppError> {
    if let Some(window) = app.get_webview_window("video-player") {
        // 使用 eval 执行 JS 并获取返回值
        let script = r#"
            (function() {
                const video = document.querySelector('video');
                if (video) {
                    return JSON.stringify({
                        currentTime: video.currentTime,
                        duration: video.duration || 0,
                        paused: video.paused
                    });
                }
                return null;
            })();
        "#;
        
        match window.eval(script) {
            Ok(_) => {
                // eval 不直接返回值，需要用其他方式
                // 使用 webview 的 evaluate_script 或轮询 title 等
                // 暂时返回 None，让前端用其他方式处理
                Ok(None)
            }
            Err(e) => {
                Err(AppError::InvalidPath(e.to_string()))
            }
        }
    } else {
        Ok(None)
    }
}

/// 读取视频时间（从窗口标题获取，由 initialization_script 更新）
#[tauri::command]
pub async fn sync_video_time(app: AppHandle) -> Result<Option<VideoTimeInfo>, AppError> {
    if let Some(window) = app.get_webview_window("video-player") {
        // 直接读取标题（由 initialization_script 定期更新）
        if let Ok(title) = window.title() {
            if title.starts_with("MX:") {
                let parts: Vec<&str> = title.trim_start_matches("MX:").split(':').collect();
                if parts.len() >= 3 {
                    // 时间以毫秒存储，转回秒
                    let current_time = parts[0].parse::<f64>().unwrap_or(0.0) / 1000.0;
                    let duration = parts[1].parse::<f64>().unwrap_or(0.0) / 1000.0;
                    let paused = parts[2] == "1";
                    
                    return Ok(Some(VideoTimeInfo {
                        current_time,
                        duration,
                        paused,
                    }));
                }
            }
        }
    }
    Ok(None)
}

#[derive(serde::Serialize)]
pub struct VideoTimeInfo {
    pub current_time: f64,
    pub duration: f64,
    pub paused: bool,
}

/// Start file system watcher
/// Emits "fs:change" events when files are created, modified, or deleted
#[tauri::command]
pub async fn start_file_watcher(app: AppHandle, watch_path: String) -> Result<(), AppError> {
    watcher::start_watcher(app, watch_path)
        .map_err(|e| AppError::InvalidPath(e))
}

// ============== Browser WebView Commands ==============

/// 创建浏览器 WebView（支持多标签页）
#[tauri::command]
pub async fn create_browser_webview(
    app: AppHandle,
    tab_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64
) -> Result<(), AppError> {
    let windows = app.windows();
    let main_window = windows.get("main")
        .ok_or_else(|| AppError::InvalidPath("Main window not found".into()))?;
    
    // 使用 tab_id 作为 webview 标识
    let webview_id = format!("browser-{}", tab_id);
    
    // 如果已存在同 id 的 webview，先关闭
    if let Some(webview) = app.get_webview(&webview_id) {
        let _ = webview.close();
    }
    
    let webview_builder = WebviewBuilder::new(
        &webview_id,
        WebviewUrl::External(url.parse().map_err(|_| AppError::InvalidPath("Invalid URL".into()))?)
    );
    
    let _webview = main_window.add_child(
        webview_builder,
        Position::Logical(LogicalPosition::new(x, y)),
        Size::Logical(LogicalSize::new(width, height)),
    ).map_err(|e| AppError::InvalidPath(e.to_string()))?;
    
    println!("[Browser] WebView 创建成功: {} -> {} at ({}, {}) size {}x{}", webview_id, url, x, y, width, height);
    
    Ok(())
}

/// 更新浏览器 WebView 的位置和大小
#[tauri::command]
pub async fn update_browser_webview_bounds(
    app: AppHandle,
    tab_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        webview.set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        webview.set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 关闭浏览器 WebView
#[tauri::command]
pub async fn close_browser_webview(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        webview.close().map_err(|e| AppError::InvalidPath(e.to_string()))?;
        println!("[Browser] WebView 已关闭: {}", webview_id);
    }
    Ok(())
}

/// 浏览器 WebView 导航到新 URL
#[tauri::command]
pub async fn navigate_browser_webview(
    app: AppHandle,
    tab_id: String,
    url: String
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        let parsed_url: tauri::Url = url.parse()
            .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?;
        webview.navigate(parsed_url)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        println!("[Browser] 导航到: {}", url);
    }
    Ok(())
}

/// 浏览器 WebView 后退
#[tauri::command]
pub async fn browser_webview_go_back(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        // 通过 JS 执行后退
        webview.eval("history.back()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 浏览器 WebView 前进
#[tauri::command]
pub async fn browser_webview_go_forward(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        webview.eval("history.forward()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 浏览器 WebView 刷新
#[tauri::command]
pub async fn browser_webview_reload(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        webview.eval("location.reload()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 设置浏览器 WebView 可见性
#[tauri::command]
pub async fn set_browser_webview_visible(
    app: AppHandle,
    tab_id: String,
    visible: bool
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        if visible {
            webview.set_position(Position::Logical(LogicalPosition::new(0.0, 0.0)))
                .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        } else {
            // 移到屏幕外隐藏
            webview.set_position(Position::Logical(LogicalPosition::new(-10000.0, -10000.0)))
                .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        }
    }
    Ok(())
}
