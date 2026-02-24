use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use crate::error::AppError;

static RUNTIME_ALLOWED_ROOTS: Lazy<RwLock<Vec<PathBuf>>> = Lazy::new(|| RwLock::new(Vec::new()));

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

fn absolute_path(path: &Path) -> Result<PathBuf, AppError> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(env::current_dir()?.join(path))
    }
}

fn canonicalize_existing_ancestor(path: &Path) -> Result<PathBuf, AppError> {
    let mut cursor = path.to_path_buf();
    loop {
        if cursor.exists() {
            return fs::canonicalize(&cursor).map_err(AppError::from);
        }
        if !cursor.pop() {
            break;
        }
    }
    Err(AppError::InvalidPath(
        "Path has no existing ancestor".to_string(),
    ))
}

fn normalize_roots(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for path in paths {
        if !path.exists() {
            continue;
        }
        let Ok(canonical) = fs::canonicalize(path) else {
            continue;
        };
        let key = canonical.to_string_lossy().to_string();
        if seen.insert(key) {
            normalized.push(canonical);
        }
    }

    normalized
}

fn default_allowed_roots() -> Vec<PathBuf> {
    if let Some(value) = env::var_os("LUMINA_ALLOWED_FS_ROOTS") {
        return normalize_roots(env::split_paths(&value).collect());
    }

    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        roots.push(home.clone());
        roots.push(home.join("Documents"));
        roots.push(home.join("Desktop"));
    }
    if let Some(appdata) = env::var_os("APPDATA") {
        roots.push(PathBuf::from(appdata));
    }
    if let Some(local_appdata) = env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(local_appdata));
    }
    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd);
    }

    normalize_roots(roots)
}

fn runtime_allowed_roots() -> Vec<PathBuf> {
    match RUNTIME_ALLOWED_ROOTS.read() {
        Ok(guard) => guard.clone(),
        Err(_) => Vec::new(),
    }
}

fn allowed_roots() -> Vec<PathBuf> {
    if env::var_os("LUMINA_ALLOWED_FS_ROOTS").is_some() {
        return default_allowed_roots();
    }

    let mut roots = runtime_allowed_roots();
    roots.extend(default_allowed_roots());
    normalize_roots(roots)
}

pub fn set_runtime_allowed_roots(roots: Vec<String>) -> Result<(), AppError> {
    let normalized = normalize_roots(roots.into_iter().map(PathBuf::from).collect());
    let mut guard = RUNTIME_ALLOWED_ROOTS
        .write()
        .map_err(|_| AppError::InvalidPath("Failed to update allowed roots".to_string()))?;
    *guard = normalized;
    Ok(())
}

pub fn ensure_allowed_path(path: &Path, must_exist: bool) -> Result<(), AppError> {
    let absolute = absolute_path(path)?;
    let candidate = if must_exist {
        fs::canonicalize(&absolute).map_err(AppError::from)?
    } else {
        canonicalize_existing_ancestor(&absolute)?
    };

    let roots = allowed_roots();
    if roots.is_empty() {
        return Err(AppError::InvalidPath(
            "No allowed roots configured".to_string(),
        ));
    }

    if roots.iter().any(|root| candidate.starts_with(root)) {
        Ok(())
    } else {
        Err(AppError::InvalidPath(format!(
            "Path not permitted: {}",
            path.display()
        )))
    }
}

/// Read file content as UTF-8 string
pub fn read_file_content(path: &str) -> Result<String, AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, true)?;
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    fs::read_to_string(path).map_err(AppError::from)
}

/// Write content to file, creating parent directories if needed
pub fn write_file_content(path: &str, content: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(AppError::from)
}

/// Check whether a file or directory exists under allowed roots.
pub fn path_exists_in_allowed_roots(path: &str) -> Result<bool, AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    Ok(path.exists())
}

/// List directory contents recursively (all files)
pub fn list_dir_recursive(path: &str) -> Result<Vec<FileEntry>, AppError> {
    let root = Path::new(path);
    ensure_allowed_path(root, true)?;
    if !root.exists() {
        return Err(AppError::FileNotFound(path.to_string()));
    }
    if !root.is_dir() {
        return Err(AppError::InvalidPath("Path is not a directory".to_string()));
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories (except .lumina)
        if name.starts_with('.') && name != ".lumina" {
            continue;
        }

        // Skip node_modules and other common non-user directories
        if name == "node_modules" || name == "target" || name == ".git" {
            continue;
        }

        if path.is_dir() {
            let children = list_dir_recursive(&path.to_string_lossy())?;
            // Include all directories (including empty ones)
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
            });
        } else {
            // Include all files
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Create a new .md file
pub fn create_new_file(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, "").map_err(AppError::from)
}

/// Delete a file or directory (move to trash/recycle bin)
pub fn delete_entry(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, true)?;
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    // 移动到回收站而非永久删除
    trash::delete(path)?;
    Ok(())
}

/// Create a new directory
pub fn create_new_dir(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    fs::create_dir_all(path).map_err(AppError::from)
}

/// Rename/move a file or directory
pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), AppError> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);
    ensure_allowed_path(old, true)?;
    ensure_allowed_path(new, false)?;
    if !old.exists() {
        return Err(AppError::FileNotFound(old_path.to_string()));
    }
    if new.exists() {
        return Err(AppError::FileExists(new_path.to_string()));
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(old, new).map_err(AppError::from)
}

/// Move a file to a target folder
/// Returns the new path of the moved file
pub fn move_file_to_folder(source: &str, target_folder: &str) -> Result<String, AppError> {
    let source_path = Path::new(source);
    let target_folder_path = Path::new(target_folder);
    ensure_allowed_path(source_path, true)?;
    ensure_allowed_path(target_folder_path, true)?;

    // Check source exists and is a file
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if source_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Source is a directory, use move_folder instead".to_string(),
        ));
    }

    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Target is not a directory".to_string(),
        ));
    }

    // Build new path
    let file_name = source_path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid source file name".to_string()))?;
    let new_path = target_folder_path.join(file_name);

    // Check if target already exists
    if new_path.exists() {
        return Err(AppError::FileExists(new_path.display().to_string()));
    }

    // Move the file
    fs::rename(source_path, &new_path).map_err(AppError::from)?;

    Ok(new_path.to_string_lossy().to_string())
}

/// Move a folder to a target folder
/// Returns the new path of the moved folder
pub fn move_folder_to_folder(source: &str, target_folder: &str) -> Result<String, AppError> {
    let source_path = Path::new(source);
    let target_folder_path = Path::new(target_folder);
    ensure_allowed_path(source_path, true)?;
    ensure_allowed_path(target_folder_path, true)?;

    // Check source exists and is a directory
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if !source_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Source is not a directory".to_string(),
        ));
    }

    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Target is not a directory".to_string(),
        ));
    }

    // Build new path
    let folder_name = source_path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid source folder name".to_string()))?;
    let new_path = target_folder_path.join(folder_name);

    // Check if moving to self or subdirectory
    let source_canonical = source_path
        .canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve source path".to_string()))?;
    let target_canonical = target_folder_path
        .canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve target path".to_string()))?;

    if target_canonical.starts_with(&source_canonical) {
        return Err(AppError::InvalidPath(
            "Cannot move folder into itself or its subdirectory".to_string(),
        ));
    }

    // Check if target already exists
    if new_path.exists() {
        return Err(AppError::FileExists(new_path.display().to_string()));
    }

    // Move the folder
    fs::rename(source_path, &new_path).map_err(AppError::from)?;

    Ok(new_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use once_cell::sync::Lazy;
    use std::sync::Mutex;
    use tempfile::TempDir;

    static ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

    fn with_allowed_root<F: FnOnce()>(root: &Path, f: F) {
        let _guard = ENV_LOCK.lock().unwrap();
        let original = env::var_os("LUMINA_ALLOWED_FS_ROOTS");
        env::set_var("LUMINA_ALLOWED_FS_ROOTS", root);
        f();
        match original {
            Some(value) => env::set_var("LUMINA_ALLOWED_FS_ROOTS", value),
            None => env::remove_var("LUMINA_ALLOWED_FS_ROOTS"),
        }
    }

    #[test]
    fn write_and_read_within_allowed_root() {
        let dir = TempDir::new().expect("temp dir");
        let file_path = dir.path().join("note.md");
        with_allowed_root(dir.path(), || {
            write_file_content(file_path.to_string_lossy().as_ref(), "hello")
                .expect("write within allowed root");
            let content = read_file_content(file_path.to_string_lossy().as_ref())
                .expect("read within allowed root");
            assert_eq!(content, "hello");
        });
    }

    #[test]
    fn rejects_access_outside_allowed_root() {
        let allowed = TempDir::new().expect("allowed temp dir");
        let outside = TempDir::new().expect("outside temp dir");
        let outside_file = outside.path().join("secret.txt");
        with_allowed_root(allowed.path(), || {
            let err = write_file_content(outside_file.to_string_lossy().as_ref(), "nope")
                .expect_err("should reject outside root");
            assert!(matches!(err, AppError::InvalidPath(_)));
        });
    }

    #[test]
    fn path_exists_within_allowed_root() {
        let dir = TempDir::new().expect("temp dir");
        let file_path = dir.path().join("exists.md");
        with_allowed_root(dir.path(), || {
            fs::write(&file_path, "ok").expect("write fixture");
            let exists = path_exists_in_allowed_roots(file_path.to_string_lossy().as_ref())
                .expect("check exists");
            assert!(exists);
        });
    }

    #[test]
    fn path_exists_rejects_outside_allowed_root() {
        let allowed = TempDir::new().expect("allowed temp dir");
        let outside = TempDir::new().expect("outside temp dir");
        with_allowed_root(allowed.path(), || {
            let err = path_exists_in_allowed_roots(outside.path().to_string_lossy().as_ref())
                .expect_err("should reject outside root");
            assert!(matches!(err, AppError::InvalidPath(_)));
        });
    }
}
