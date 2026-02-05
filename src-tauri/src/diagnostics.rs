use std::cmp::min;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

fn debug_logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    Ok(app_dir.join("debug-logs"))
}

fn write_file_tail<W: Write>(out: &mut W, path: &Path, max_bytes: u64) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Failed to open {:?}: {}", path, e))?;
    let len = file
        .metadata()
        .map_err(|e| format!("Failed to stat {:?}: {}", path, e))?
        .len();

    if len <= max_bytes {
        let mut buf = Vec::with_capacity(len as usize);
        file.read_to_end(&mut buf)
            .map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
        out.write_all(&buf)
            .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
        return Ok(());
    }

    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek {:?}: {}", path, e))?;
    let mut buf = Vec::with_capacity(min(max_bytes, usize::MAX as u64) as usize);
    file.read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
    out.write_all(b"\n[... truncated ...]\n")
        .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
    out.write_all(&buf)
        .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
    Ok(())
}

fn list_log_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return files,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            files.push(path);
        }
    }
    files.sort();
    files
}

/// Export a single diagnostics text file containing recent logs and environment info.
#[tauri::command]
pub async fn export_diagnostics(app: AppHandle, destination: String) -> Result<(), String> {
    let destination_path = PathBuf::from(destination);
    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {:?}: {}", parent, e))?;
    }

    let mut out = fs::File::create(&destination_path)
        .map_err(|e| format!("Failed to create {:?}: {}", destination_path, e))?;

    let package = app.package_info();
    writeln!(
        out,
        "Lumina Diagnostics\nversion: {}\ntimestamp: {}\nos: {}\narch: {}\n",
        package.version,
        chrono::Local::now().to_rfc3339(),
        std::env::consts::OS,
        std::env::consts::ARCH
    )
    .map_err(|e| format!("Failed to write diagnostics: {}", e))?;

    // Frontend / app debug logs (append_debug_log)
    let logs_dir = debug_logs_dir(&app)?;
    writeln!(out, "debug-logs dir: {:?}\n", logs_dir)
        .map_err(|e| format!("Failed to write diagnostics: {}", e))?;

    let files = list_log_files(&logs_dir);
    if files.is_empty() {
        writeln!(out, "(no debug logs found)\n")
            .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
    } else {
        for file in files {
            writeln!(out, "\n===== {:?} =====\n", file)
                .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
            // Keep exports bounded; 2 MiB per file is enough for debugging without huge uploads.
            write_file_tail(&mut out, &file, 2 * 1024 * 1024)?;
        }
        writeln!(out).map_err(|e| format!("Failed to write diagnostics: {}", e))?;
    }

    // If agent debug logging is enabled, include its file path (content may include sensitive data).
    if crate::agent::debug_log::is_debug_enabled() {
        if let Some(path) = crate::agent::debug_log::get_debug_file_path() {
            writeln!(out, "\nagent debug log: {:?}\n", path)
                .map_err(|e| format!("Failed to write diagnostics: {}", e))?;
            let _ = write_file_tail(&mut out, &path, 2 * 1024 * 1024);
        }
    }

    Ok(())
}

