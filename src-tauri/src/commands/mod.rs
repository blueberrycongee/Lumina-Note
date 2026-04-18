use crate::error::AppError;
use crate::fs::{self, watcher, FileEntry};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

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

/// Check whether a file or directory exists.
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, AppError> {
    fs::path_exists_in_allowed_roots(&path)
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

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Lumina Note")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    #[cfg(target_os = "macos")]
    {
        crate::traffic_lights::observe_resize(&window);

        let win = window.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::ThemeChanged(..)) {
                crate::traffic_lights::center_in_titlebar(&win);
            }
        });
    }

    Ok(())
}

/// Start file system watcher
/// Emits "fs:change" events when files are created, modified, or deleted
#[tauri::command]
pub async fn start_file_watcher(app: AppHandle, watch_path: String) -> Result<(), AppError> {
    fs::ensure_allowed_path(std::path::Path::new(&watch_path), true)?;
    watcher::start_watcher(app, watch_path).map_err(|e| AppError::InvalidPath(e))
}
