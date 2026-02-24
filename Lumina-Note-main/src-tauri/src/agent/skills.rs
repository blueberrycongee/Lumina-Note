//! Skills registry (text-only for now)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillManifest {
    pub name: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub prompt: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub runtime: Option<String>,
    pub entrypoint: Option<String>,
    pub permissions: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub title: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDetail {
    pub info: SkillInfo,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub markdown: Option<String>,
}

fn skill_roots(app: &AppHandle, workspace_path: Option<&str>) -> Vec<(String, PathBuf)> {
    let mut roots = Vec::new();

    if let Some(workspace) = workspace_path {
        let workspace_root = Path::new(workspace).join(".lumina").join("skills");
        if workspace_root.exists() {
            roots.push(("workspace".to_string(), workspace_root));
        }
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let user_root = app_data_dir.join("skills");
        if user_root.exists() {
            roots.push(("user".to_string(), user_root));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let builtin_root = resource_dir.join("skills");
        if builtin_root.exists() {
            roots.push(("builtin".to_string(), builtin_root));
        } else {
            let nested_root = resource_dir.join("resources").join("skills");
            if nested_root.exists() {
                roots.push(("builtin".to_string(), nested_root));
            }
        }
    }

    roots
}

pub fn builtin_skills_root(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let direct = resource_dir.join("skills");
        if direct.exists() {
            return Some(direct);
        }
        let nested = resource_dir.join("resources").join("skills");
        if nested.exists() {
            return Some(nested);
        }
    }
    None
}

fn read_manifest(dir: &Path) -> Option<SkillManifest> {
    let manifest_path = dir.join("skill.json");
    let content = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str(&content).ok()
}

fn read_markdown(dir: &Path) -> Option<String> {
    let markdown_path = dir.join("SKILL.md");
    fs::read_to_string(markdown_path).ok()
}

fn extract_title_description(markdown: &str) -> (Option<String>, Option<String>) {
    let mut title: Option<String> = None;
    let mut description: Option<String> = None;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if title.is_none() {
            if let Some(stripped) = trimmed.strip_prefix("# ") {
                title = Some(stripped.to_string());
                continue;
            }
            title = Some(trimmed.to_string());
            continue;
        }
        if description.is_none() {
            description = Some(trimmed.to_string());
            break;
        }
    }
    (title, description)
}

fn build_info(
    dir_name: &str,
    source: &str,
    manifest: Option<SkillManifest>,
    markdown: Option<&str>,
) -> SkillInfo {
    let mut info = SkillInfo {
        name: dir_name.to_string(),
        title: dir_name.to_string(),
        description: None,
        version: None,
        tags: None,
        source: source.to_string(),
    };

    if let Some(manifest) = manifest {
        if let Some(name) = manifest.name {
            info.name = name;
        }
        if let Some(title) = manifest.title {
            info.title = title;
        }
        info.description = manifest.description;
        info.version = manifest.version;
        info.tags = manifest.tags;
        if info.description.is_none() {
            if let Some(markdown) = markdown {
                let (_title, desc) = extract_title_description(markdown);
                if desc.is_some() {
                    info.description = desc;
                }
            }
        }
    } else if let Some(markdown) = markdown {
        let (title, desc) = extract_title_description(markdown);
        if let Some(t) = title {
            info.title = t;
        }
        info.description = desc;
    }

    info
}

fn list_skills_in_root(root: &Path, source: &str) -> Vec<SkillInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(items) => items,
        Err(_) => return results,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let manifest = read_manifest(&path);
        let markdown = read_markdown(&path);
        let info = build_info(&dir_name, source, manifest, markdown.as_deref());
        results.push(info);
    }

    results
}

pub fn list_skills(app: &AppHandle, workspace_path: Option<&str>) -> Vec<SkillInfo> {
    let roots = skill_roots(app, workspace_path);
    let mut seen = HashMap::<String, SkillInfo>::new();
    let mut ordered = Vec::new();

    for (source, root) in roots {
        for info in list_skills_in_root(&root, &source) {
            if seen.contains_key(&info.name) {
                continue;
            }
            seen.insert(info.name.clone(), info.clone());
            ordered.push(info);
        }
    }

    ordered
}

pub fn read_skill(
    app: &AppHandle,
    workspace_path: Option<&str>,
    name: &str,
) -> Result<SkillDetail, String> {
    let roots = skill_roots(app, workspace_path);
    for (source, root) in roots {
        let dir = root.join(name);
        if dir.exists() {
            let manifest = read_manifest(&dir);
            let markdown = read_markdown(&dir);
            let info = build_info(name, &source, manifest.clone(), markdown.as_deref());
            let prompt = manifest
                .and_then(|m| m.prompt)
                .or_else(|| markdown.clone())
                .unwrap_or_default();

            return Ok(SkillDetail {
                info,
                prompt,
                markdown,
            });
        }

        // Fallback: scan directories to find a manifest with matching name
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let manifest = read_manifest(&path);
                if let Some(ref manifest) = manifest {
                    if manifest.name.as_deref() != Some(name) {
                        continue;
                    }
                } else {
                    continue;
                }
                let markdown = read_markdown(&path);
                let info = build_info(name, &source, manifest.clone(), markdown.as_deref());
                let prompt = manifest
                    .and_then(|m| m.prompt)
                    .or_else(|| markdown.clone())
                    .unwrap_or_default();

                return Ok(SkillDetail {
                    info,
                    prompt,
                    markdown,
                });
            }
        }
    }

    Err(format!("Skill not found: {}", name))
}
