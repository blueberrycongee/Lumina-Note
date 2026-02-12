use crate::doc_tools;
use crate::error::AppError;
use crate::fs::{self, watcher, FileEntry};
use crate::typesetting::{
    layout_text_paragraph, shape_mixed_text, write_empty_pdf, FontManager, Glyph, PageBox,
    PageMargins, PageSize, PageStyle, ParagraphAlign, TextLayoutOptions,
};
use std::io::Read;
use std::path::PathBuf;
use tauri::webview::NewWindowResponse;
use tauri::Emitter;
use tauri::WebviewUrl;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewBuilder,
    WebviewWindowBuilder,
};
use uuid::Uuid;

// Browser / WebView 调试日志，写入与前端相同的 debug-logs 目录，方便统一排查
fn browser_debug_log(app: &AppHandle, message: String) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let content = format!("[Browser-Rust] {}\n", message);
        let _ = crate::llm::append_debug_log(app_clone, content).await;
    });
}

#[derive(serde::Serialize, Clone, Copy, Debug)]
pub struct PreviewBoxMm {
    pub x_mm: f32,
    pub y_mm: f32,
    pub width_mm: f32,
    pub height_mm: f32,
}

#[derive(serde::Serialize, Clone, Copy, Debug)]
pub struct TypesettingPreviewPageMm {
    pub page: PreviewBoxMm,
    pub body: PreviewBoxMm,
    pub header: PreviewBoxMm,
    pub footer: PreviewBoxMm,
}

#[derive(serde::Serialize, Clone, Copy, Debug)]
pub struct TypesettingTextLine {
    pub start: usize,
    pub end: usize,
    pub width: i32,
    pub x_offset: i32,
    pub y_offset: i32,
    pub start_byte: usize,
    pub end_byte: usize,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct TypesettingTextLayout {
    pub lines: Vec<TypesettingTextLine>,
}

#[derive(serde::Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AlignInput {
    Left,
    Right,
    Center,
    Justify,
}

fn page_box_to_mm(box_mm: PageBox) -> PreviewBoxMm {
    PreviewBoxMm {
        x_mm: box_mm.x_mm,
        y_mm: box_mm.y_mm,
        width_mm: box_mm.width_mm,
        height_mm: box_mm.height_mm,
    }
}

fn default_typesetting_page_style() -> PageStyle {
    PageStyle {
        size: PageSize::A4,
        margins: PageMargins {
            top_mm: 25.0,
            right_mm: 25.0,
            bottom_mm: 25.0,
            left_mm: 25.0,
        },
        header_height_mm: 12.0,
        footer_height_mm: 12.0,
    }
}

fn align_input_to_paragraph(align: AlignInput) -> ParagraphAlign {
    match align {
        AlignInput::Left => ParagraphAlign::Left,
        AlignInput::Right => ParagraphAlign::Right,
        AlignInput::Center => ParagraphAlign::Center,
        AlignInput::Justify => ParagraphAlign::Justify,
    }
}

fn cluster_end_bytes(glyphs: &[Glyph], text_len: usize) -> Vec<usize> {
    if glyphs.is_empty() {
        return Vec::new();
    }
    let mut ends = vec![text_len; glyphs.len()];
    let mut index = 0usize;
    while index < glyphs.len() {
        let cluster = glyphs[index].cluster as usize;
        let mut next = index + 1;
        while next < glyphs.len() && glyphs[next].cluster as usize == cluster {
            next += 1;
        }
        let mut end_byte = if next < glyphs.len() {
            glyphs[next].cluster as usize
        } else {
            text_len
        };
        if end_byte > text_len {
            end_byte = text_len;
        }
        for slot in &mut ends[index..next] {
            *slot = end_byte;
        }
        index = next;
    }
    ends
}

fn line_byte_ranges(
    text: &str,
    glyphs: &[Glyph],
    lines: &[crate::typesetting::PositionedLine],
) -> Vec<(usize, usize)> {
    if lines.is_empty() {
        return Vec::new();
    }
    if glyphs.is_empty() {
        return lines.iter().map(|_| (0, 0)).collect();
    }
    let text_len = text.len();
    let cluster_end = cluster_end_bytes(glyphs, text_len);
    lines
        .iter()
        .map(|line| {
            if line.end == 0 || line.start >= glyphs.len() || line.start >= line.end {
                return (0, 0);
            }
            let start_index = line.start.min(glyphs.len() - 1);
            let end_index = line.end.saturating_sub(1).min(glyphs.len() - 1);
            let mut start_byte = glyphs[start_index].cluster as usize;
            let mut end_byte = *cluster_end.get(end_index).unwrap_or(&text_len);
            if start_byte > text_len {
                start_byte = text_len;
            }
            if end_byte > text_len {
                end_byte = text_len;
            }
            if end_byte < start_byte {
                end_byte = start_byte;
            }
            (start_byte, end_byte)
        })
        .collect()
}

/// Typesetting preview defaults (mm). Used by the preview pane before document wiring.
#[tauri::command]
pub async fn typesetting_preview_page_mm() -> Result<TypesettingPreviewPageMm, AppError> {
    let style = default_typesetting_page_style();

    Ok(TypesettingPreviewPageMm {
        page: page_box_to_mm(style.page_box()),
        body: page_box_to_mm(style.body_box()),
        header: page_box_to_mm(style.header_box()),
        footer: page_box_to_mm(style.footer_box()),
    })
}

/// Fixture font path (dev-only). Returns None when the fixture is unavailable.
#[tauri::command]
pub async fn typesetting_fixture_font_path() -> Option<String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("katex-main-regular.ttf");

    if path.exists() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Typesetting PDF export (placeholder). Returns base64-encoded PDF bytes.
#[tauri::command]
pub async fn typesetting_export_pdf_base64() -> Result<String, AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let pdf = write_empty_pdf(default_typesetting_page_style())
        .map_err(|err| AppError::InvalidPath(format!("Typesetting PDF export failed: {err}")))?;

    Ok(STANDARD.encode(pdf))
}

fn find_rendered_pdf(out_dir: &PathBuf, docx_path: &PathBuf) -> Result<PathBuf, AppError> {
    if let Some(stem) = docx_path.file_stem().and_then(|s| s.to_str()) {
        let expected = out_dir.join(format!("{stem}.pdf"));
        if expected.exists() {
            return Ok(expected);
        }
    }
    let entries = std::fs::read_dir(out_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("pdf"))
            .unwrap_or(false)
        {
            return Ok(path);
        }
    }
    Err(AppError::InvalidPath(
        "OpenOffice render failed to produce a PDF".into(),
    ))
}

/// Render docx to PDF via OpenOffice/LibreOffice (soffice). Returns base64 PDF bytes.
#[tauri::command]
pub async fn typesetting_render_docx_pdf_base64(
    app: AppHandle,
    docx_path: String,
) -> Result<String, AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let docx_path = PathBuf::from(docx_path);
    if !docx_path.exists() {
        return Err(AppError::FileNotFound(
            docx_path.to_string_lossy().to_string(),
        ));
    }

    let status = doc_tools::doc_tools_get_status(app).await?;
    let soffice_path = status
        .tools
        .get("soffice")
        .and_then(|tool| tool.path.as_ref())
        .cloned()
        .ok_or_else(|| AppError::InvalidPath("soffice not available".into()))?;

    let out_dir = std::env::temp_dir()
        .join("lumina-typesetting")
        .join("soffice")
        .join(Uuid::new_v4().to_string());
    tokio::fs::create_dir_all(&out_dir).await?;

    let status = tokio::process::Command::new(soffice_path)
        .arg("--headless")
        .arg("--convert-to")
        .arg("pdf")
        .arg("--outdir")
        .arg(&out_dir)
        .arg(&docx_path)
        .status()
        .await?;
    if !status.success() {
        return Err(AppError::InvalidPath(format!(
            "OpenOffice render failed: {status}"
        )));
    }

    let pdf_path = find_rendered_pdf(&out_dir, &docx_path)?;
    let bytes = tokio::fs::read(&pdf_path).await?;
    let _ = tokio::fs::remove_dir_all(&out_dir).await;

    Ok(STANDARD.encode(bytes))
}

/// Typesetting text layout (placeholder). Returns line metrics for a single paragraph.
#[tauri::command]
pub async fn typesetting_layout_text(
    text: String,
    font_path: String,
    max_width: i32,
    line_height: i32,
    font_size: Option<i32>,
    align: Option<AlignInput>,
    first_line_indent: Option<i32>,
    space_before: Option<i32>,
    space_after: Option<i32>,
) -> Result<TypesettingTextLayout, AppError> {
    if max_width <= 0 {
        return Err(AppError::InvalidPath(
            "Typesetting layout requires a positive max_width".into(),
        ));
    }
    if line_height <= 0 {
        return Err(AppError::InvalidPath(
            "Typesetting layout requires a positive line_height".into(),
        ));
    }
    if let Some(font_size) = font_size {
        if font_size <= 0 {
            return Err(AppError::InvalidPath(
                "Typesetting layout requires a positive font_size".into(),
            ));
        }
    }
    let mut manager = FontManager::new();
    let font = manager
        .load_from_path(&font_path)
        .map_err(|err| AppError::InvalidPath(format!("Typesetting font load failed: {err}")))?;
    let options = TextLayoutOptions {
        max_width,
        line_height,
        font_size,
        align: align_input_to_paragraph(align.unwrap_or(AlignInput::Left)),
        first_line_indent: first_line_indent.unwrap_or(0),
        space_before: space_before.unwrap_or(0),
        space_after: space_after.unwrap_or(0),
    };
    let lines = layout_text_paragraph(&font, &text, options)
        .map_err(|err| AppError::InvalidPath(format!("Typesetting layout failed: {err}")))?;
    let byte_ranges = if lines.is_empty() {
        Vec::new()
    } else {
        let glyph_run = shape_mixed_text(&font, &text)
            .map_err(|err| AppError::InvalidPath(format!("Typesetting layout failed: {err}")))?;
        line_byte_ranges(&text, &glyph_run.glyphs, &lines)
    };
    let lines = lines
        .into_iter()
        .enumerate()
        .map(|(index, line)| {
            let (start_byte, end_byte) = byte_ranges.get(index).copied().unwrap_or((0, 0));
            TypesettingTextLine {
                start: line.start,
                end: line.end,
                width: line.width,
                x_offset: line.x_offset,
                y_offset: line.y_offset,
                start_byte,
                end_byte,
            }
        })
        .collect();

    Ok(TypesettingTextLayout { lines })
}

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

/// Write binary file (for images, etc.)
#[tauri::command]
pub async fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), AppError> {
    let path = std::path::Path::new(&path);
    fs::ensure_allowed_path(path, false)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, &data).map_err(AppError::from)
}

/// Read binary file and return as base64
#[tauri::command]
pub async fn read_binary_file_base64(path: String) -> Result<String, AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let path_ref = std::path::Path::new(&path);
    fs::ensure_allowed_path(path_ref, true)?;
    let data = std::fs::read(&path)?;
    Ok(STANDARD.encode(&data))
}

/// List directory with file tree
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, AppError> {
    fs::list_dir_recursive(&path)
}

/// Update runtime allowed filesystem roots (workspace-scoped).
#[tauri::command]
pub async fn fs_set_allowed_roots(roots: Vec<String>) -> Result<(), AppError> {
    fs::set_runtime_allowed_roots(roots)
}

/// List directory tree as formatted string (for Agent context)
#[tauri::command]
pub async fn list_directory_tree(
    path: String,
    max_depth: Option<usize>,
) -> Result<String, AppError> {
    use std::path::Path;
    use walkdir::WalkDir;

    let max_depth = max_depth.unwrap_or(3);
    let base_path = Path::new(&path);
    fs::ensure_allowed_path(base_path, true)?;
    let mut result = Vec::new();

    result.push(format!(
        "📁 {} (工作区根目录)",
        base_path.file_name().unwrap_or_default().to_string_lossy()
    ));

    let walker = WalkDir::new(&path)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        let entry_path = entry.path();
        if entry_path == base_path {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏文件和常见忽略目录（允许 .lumina）
        if (name.starts_with('.') && name != ".lumina")
            || name == "node_modules"
            || name == "target"
        {
            continue;
        }

        let depth = entry.depth();
        let indent = "  ".repeat(depth);
        let is_dir = entry.file_type().is_dir();
        let prefix = if is_dir { "📁" } else { "📄" };

        // 只显示 .md 文件或目录
        if is_dir || name.ends_with(".md") {
            result.push(format!("{}{} {}", indent, prefix, name));
        }
    }

    Ok(result.join("\n"))
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

/// Move a file to a target folder
/// Returns the new path of the moved file
#[tauri::command]
pub async fn move_file(source: String, target_folder: String) -> Result<String, AppError> {
    fs::move_file_to_folder(&source, &target_folder)
}

/// Move a folder to a target folder
/// Returns the new path of the moved folder
#[tauri::command]
pub async fn move_folder(source: String, target_folder: String) -> Result<String, AppError> {
    fs::move_folder_to_folder(&source, &target_folder)
}

/// Show file/folder in system file explorer
#[tauri::command]
pub async fn show_in_explorer(path: String) -> Result<(), AppError> {
    fs::ensure_allowed_path(std::path::Path::new(&path), true)?;
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
    height: f64,
) -> Result<(), AppError> {
    // 获取主窗口（通过 Manager::windows()）
    let windows = app.windows();
    let main_window = windows
        .get("main")
        .ok_or_else(|| AppError::InvalidPath("Main window not found".into()))?;

    // 如果已存在内嵌 webview，先关闭
    if let Some(webview) = app.get_webview("video-webview") {
        let _ = webview.close();
    }

    // 创建 WebView Builder
    let webview_builder = WebviewBuilder::new(
        "video-webview",
        WebviewUrl::External(
            url.parse()
                .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?,
        ),
    );

    // 创建内嵌 WebView
    let _webview = main_window
        .add_child(
            webview_builder,
            Position::Logical(LogicalPosition::new(x, y)),
            Size::Logical(LogicalSize::new(width, height)),
        )
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    println!(
        "[EmbeddedWebview] 创建成功: {} at ({}, {}) size {}x{}",
        url, x, y, width, height
    );

    Ok(())
}

/// 更新内嵌 WebView 的位置和大小
#[tauri::command]
pub async fn update_webview_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        webview
            .set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        webview
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 关闭内嵌 WebView
#[tauri::command]
pub async fn close_embedded_webview(app: AppHandle) -> Result<(), AppError> {
    if let Some(webview) = app.get_webview("video-webview") {
        webview
            .close()
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// Open a new main window
#[tauri::command]
pub async fn open_new_window(app: AppHandle) -> Result<(), AppError> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
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
    let url = format!(
        "https://api.bilibili.com/x/web-interface/view?bvid={}",
        bvid
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    let json: serde_json::Value = resp
        .json()
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
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    // 尝试解压 deflate
    let text = match flate2::read::DeflateDecoder::new(&bytes[..])
        .bytes()
        .collect::<Result<Vec<u8>, _>>()
    {
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
    danmakus.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

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
        webview
            .eval(&js)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
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
        webview
            .eval(&js)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
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
        webview
            .eval(&js)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
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
        WebviewUrl::External(
            url.parse()
                .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?,
        ),
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
        window
            .close()
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
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
            Err(e) => Err(AppError::InvalidPath(e.to_string())),
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
    fs::ensure_allowed_path(std::path::Path::new(&watch_path), true)?;
    watcher::start_watcher(app, watch_path).map_err(|e| AppError::InvalidPath(e))
}

#[derive(serde::Serialize, Clone)]
pub struct BrowserNewTabEventPayload {
    pub parent_tab_id: String,
    pub url: String,
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
    height: f64,
) -> Result<(), AppError> {
    let windows = app.windows();
    let main_window = windows
        .get("main")
        .ok_or_else(|| AppError::InvalidPath("Main window not found".into()))?;

    browser_debug_log(
        &app,
        format!(
            "create_browser_webview: tab_id={} url={} rect=({}, {}) {}x{}",
            tab_id, url, x, y, width, height
        ),
    );

    // 使用 tab_id 作为 webview 标识
    let webview_id = format!("browser-{}", tab_id);

    // 如果已存在同 id 的 webview，先关闭
    if let Some(webview) = app.get_webview(&webview_id) {
        let _ = webview.close();
    }

    // 解析 URL
    let parsed_url: tauri::Url = url
        .parse()
        .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?;

    // 拦截 window.open / 新窗口请求，通知前端创建新的网页标签页
    let app_handle = app.clone();
    let parent_tab_id = tab_id.clone();

    let webview_builder = WebviewBuilder::new(&webview_id, WebviewUrl::External(parsed_url))
        .on_new_window(move |new_url, _features| {
            if new_url.scheme() == "http" || new_url.scheme() == "https" {
                browser_debug_log(
                    &app_handle,
                    format!(
                        "on_new_window: parent_tab_id={} new_url={}",
                        parent_tab_id, new_url,
                    ),
                );
                let payload = BrowserNewTabEventPayload {
                    parent_tab_id: parent_tab_id.clone(),
                    url: new_url.to_string(),
                };
                // 向前端广播新标签事件（忽略发送错误）
                let _ = app_handle.emit("browser:new-tab", payload);
                NewWindowResponse::Deny
            } else {
                NewWindowResponse::Allow
            }
        });

    let _webview = main_window
        .add_child(
            webview_builder,
            Position::Logical(LogicalPosition::new(x, y)),
            Size::Logical(LogicalSize::new(width, height)),
        )
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    println!(
        "[Browser] WebView 创建成功: {} -> {} at ({}, {}) size {}x{}",
        webview_id, url, x, y, width, height
    );

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
    height: f64,
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(
            &app,
            format!(
                "update_browser_webview_bounds: tab_id={} rect=({}, {}) {}x{}",
                tab_id, x, y, width, height
            ),
        );
        webview
            .set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        webview
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 关闭浏览器 WebView
#[tauri::command]
pub async fn close_browser_webview(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        webview
            .close()
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        println!("[Browser] WebView 已关闭: {}", webview_id);
        browser_debug_log(&app, format!("close_browser_webview: tab_id={}", tab_id));
    }
    Ok(())
}

/// 浏览器 WebView 导航到新 URL
#[tauri::command]
pub async fn navigate_browser_webview(
    app: AppHandle,
    tab_id: String,
    url: String,
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(
            &app,
            format!("navigate_browser_webview: tab_id={} url={}", tab_id, url),
        );
        let parsed_url: tauri::Url = url
            .parse()
            .map_err(|_| AppError::InvalidPath("Invalid URL".into()))?;
        webview
            .navigate(parsed_url)
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
        browser_debug_log(&app, format!("browser_webview_go_back: tab_id={}", tab_id));
        // 通过 JS 执行后退
        webview
            .eval("history.back()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 浏览器 WebView 前进
#[tauri::command]
pub async fn browser_webview_go_forward(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(
            &app,
            format!("browser_webview_go_forward: tab_id={}", tab_id),
        );
        webview
            .eval("history.forward()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 浏览器 WebView 刷新
#[tauri::command]
pub async fn browser_webview_reload(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(&app, format!("browser_webview_reload: tab_id={}", tab_id));
        webview
            .eval("location.reload()")
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    }
    Ok(())
}

/// 设置浏览器 WebView 可见性
#[tauri::command]
pub async fn set_browser_webview_visible(
    app: AppHandle,
    tab_id: String,
    visible: bool,
) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(
            &app,
            format!(
                "set_browser_webview_visible: tab_id={} visible={}",
                tab_id, visible
            ),
        );
        if visible {
            webview
                .set_position(Position::Logical(LogicalPosition::new(0.0, 0.0)))
                .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        } else {
            // 移到屏幕外隐藏
            webview
                .set_position(Position::Logical(LogicalPosition::new(-10000.0, -10000.0)))
                .map_err(|e| AppError::InvalidPath(e.to_string()))?;
        }
    }
    Ok(())
}

/// 冻结浏览器 WebView（暂停 JS 执行，降低资源占用）
#[tauri::command]
pub async fn browser_webview_freeze(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(&app, format!("browser_webview_freeze: tab_id={}", tab_id));

        // 注入 JS 暂停页面活动
        // 1. 暂停所有定时器
        // 2. 暂停所有动画
        // 3. 暂停媒体播放
        let freeze_js = r#"
            (function() {
                // 保存原始函数
                if (!window.__lumina_frozen) {
                    window.__lumina_frozen = true;
                    window.__lumina_original_setInterval = window.setInterval;
                    window.__lumina_original_setTimeout = window.setTimeout;
                    window.__lumina_interval_ids = [];
                    window.__lumina_timeout_ids = [];
                    
                    // 暂停所有媒体
                    document.querySelectorAll('video, audio').forEach(el => {
                        if (!el.paused) {
                            el.__lumina_was_playing = true;
                            el.pause();
                        }
                    });
                    
                    // 暂停所有动画
                    document.getAnimations().forEach(anim => anim.pause());
                    
                    console.log('[Lumina] Page frozen');
                }
            })();
        "#;

        webview
            .eval(freeze_js)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;

        // 移到屏幕外
        webview
            .set_position(Position::Logical(LogicalPosition::new(-10000.0, -10000.0)))
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;

        println!("[Browser] WebView 已冻结: {}", webview_id);
    }
    Ok(())
}

/// 解冻浏览器 WebView（恢复 JS 执行）
#[tauri::command]
pub async fn browser_webview_unfreeze(app: AppHandle, tab_id: String) -> Result<(), AppError> {
    let webview_id = format!("browser-{}", tab_id);
    if let Some(webview) = app.get_webview(&webview_id) {
        browser_debug_log(&app, format!("browser_webview_unfreeze: tab_id={}", tab_id));

        // 注入 JS 恢复页面活动
        let unfreeze_js = r#"
            (function() {
                if (window.__lumina_frozen) {
                    window.__lumina_frozen = false;
                    
                    // 恢复媒体播放
                    document.querySelectorAll('video, audio').forEach(el => {
                        if (el.__lumina_was_playing) {
                            el.play().catch(() => {});
                            delete el.__lumina_was_playing;
                        }
                    });
                    
                    // 恢复动画
                    document.getAnimations().forEach(anim => anim.play());
                    
                    console.log('[Lumina] Page unfrozen');
                }
            })();
        "#;

        webview
            .eval(unfreeze_js)
            .map_err(|e| AppError::InvalidPath(e.to_string()))?;

        println!("[Browser] WebView 已解冻: {}", webview_id);
    }
    Ok(())
}

/// 检查浏览器 WebView 是否存在
#[tauri::command]
pub async fn browser_webview_exists(app: AppHandle, tab_id: String) -> Result<bool, AppError> {
    let webview_id = format!("browser-{}", tab_id);
    Ok(app.get_webview(&webview_id).is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn approx_eq(value: f32, expected: f32) {
        assert!((value - expected).abs() < 0.01);
    }

    #[tokio::test]
    async fn typesetting_preview_page_mm_defaults_to_a4_layout() {
        let preview = typesetting_preview_page_mm()
            .await
            .expect("preview should be available");

        approx_eq(preview.page.width_mm, 210.0);
        approx_eq(preview.page.height_mm, 297.0);
        approx_eq(preview.body.x_mm, 25.0);
        approx_eq(preview.body.y_mm, 37.0);
        approx_eq(preview.body.width_mm, 160.0);
        approx_eq(preview.body.height_mm, 223.0);
    }

    #[tokio::test]
    async fn typesetting_export_pdf_base64_returns_pdf_header() {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let payload = typesetting_export_pdf_base64()
            .await
            .expect("export should succeed");
        let decoded = STANDARD.decode(payload).expect("decode base64");
        let text = String::from_utf8_lossy(&decoded);

        assert!(text.starts_with("%PDF-1.7\n"));
    }

    #[tokio::test]
    async fn typesetting_fixture_font_path_returns_fixture() {
        let path = typesetting_fixture_font_path()
            .await
            .expect("expected fixture path");

        assert!(path.ends_with("katex-main-regular.ttf"));
    }

    fn fixture_font_path() -> String {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("katex-main-regular.ttf")
            .to_string_lossy()
            .to_string()
    }

    #[tokio::test]
    async fn typesetting_layout_text_handles_empty_text() {
        let layout = typesetting_layout_text(
            "".to_string(),
            fixture_font_path(),
            1000,
            1200,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect("layout should succeed");

        assert!(layout.lines.is_empty());
    }

    #[tokio::test]
    async fn typesetting_layout_text_rejects_non_positive_dimensions() {
        let err = typesetting_layout_text(
            "Hello".to_string(),
            fixture_font_path(),
            0,
            1200,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect_err("expected invalid max_width error");
        let message = format!("{err}");
        assert!(message.contains("max_width"));

        let err = typesetting_layout_text(
            "Hello".to_string(),
            fixture_font_path(),
            1000,
            0,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect_err("expected invalid line_height error");
        let message = format!("{err}");
        assert!(message.contains("line_height"));

        let err = typesetting_layout_text(
            "Hello".to_string(),
            fixture_font_path(),
            1000,
            1200,
            Some(0),
            None,
            None,
            None,
            None,
        )
        .await
        .expect_err("expected invalid font_size error");
        let message = format!("{err}");
        assert!(message.contains("font_size"));
    }

    #[tokio::test]
    async fn typesetting_layout_text_returns_single_line_for_wide_width() {
        let layout = typesetting_layout_text(
            "Hello world".to_string(),
            fixture_font_path(),
            100_000,
            1200,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect("layout should succeed");

        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].start, 0);
        assert!(layout.lines[0].end > layout.lines[0].start);
    }

    #[tokio::test]
    async fn typesetting_layout_text_includes_byte_offsets() {
        let text = "Hello world";
        let layout = typesetting_layout_text(
            text.to_string(),
            fixture_font_path(),
            100_000,
            1200,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect("layout should succeed");

        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].start_byte, 0);
        assert_eq!(layout.lines[0].end_byte, text.len());
    }

    #[tokio::test]
    async fn typesetting_layout_text_applies_alignment_and_spacing_inputs() {
        let layout = typesetting_layout_text(
            "Hello world".to_string(),
            fixture_font_path(),
            1000,
            1200,
            Some(16),
            Some(AlignInput::Right),
            Some(10),
            Some(12),
            Some(6),
        )
        .await
        .expect("layout should succeed");

        assert!(!layout.lines.is_empty());
        assert!(layout.lines[0].x_offset > 10);
        assert_eq!(layout.lines[0].y_offset, 12);
    }
}
