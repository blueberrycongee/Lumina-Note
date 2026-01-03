use std::fs;
use std::path::Path;
use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

/// Read file content as UTF-8 string
pub fn read_file_content(path: &str) -> Result<String, AppError> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    fs::read_to_string(path).map_err(AppError::from)
}

/// Write content to file, creating parent directories if needed
pub fn write_file_content(path: &str, content: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(AppError::from)
}

/// List directory contents recursively (all files)
pub fn list_dir_recursive(path: &str) -> Result<Vec<FileEntry>, AppError> {
    let root = Path::new(path);
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

        // Skip hidden files and directories
        if name.starts_with('.') {
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
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

/// Create a new .md file
pub fn create_new_file(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
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
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    fs::create_dir_all(path).map_err(AppError::from)
}

/// Rename/move a file or directory
pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), AppError> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);
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
    
    // Check source exists and is a file
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if source_path.is_dir() {
        return Err(AppError::InvalidPath("Source is a directory, use move_folder instead".to_string()));
    }
    
    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath("Target is not a directory".to_string()));
    }
    
    // Build new path
    let file_name = source_path.file_name()
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
    
    // Check source exists and is a directory
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if !source_path.is_dir() {
        return Err(AppError::InvalidPath("Source is not a directory".to_string()));
    }
    
    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath("Target is not a directory".to_string()));
    }
    
    // Build new path
    let folder_name = source_path.file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid source folder name".to_string()))?;
    let new_path = target_folder_path.join(folder_name);
    
    // Check if moving to self or subdirectory
    let source_canonical = source_path.canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve source path".to_string()))?;
    let target_canonical = target_folder_path.canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve target path".to_string()))?;
    
    if target_canonical.starts_with(&source_canonical) {
        return Err(AppError::InvalidPath("Cannot move folder into itself or its subdirectory".to_string()));
    }
    
    // Check if target already exists
    if new_path.exists() {
        return Err(AppError::FileExists(new_path.display().to_string()));
    }
    
    // Move the folder
    fs::rename(source_path, &new_path).map_err(AppError::from)?;
    
    Ok(new_path.to_string_lossy().to_string())
}
