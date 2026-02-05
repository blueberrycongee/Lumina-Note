use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const PLUGIN_MANIFEST: &str = "plugin.json";
const DEFAULT_ENTRYPOINT: &str = "index.js";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PluginManifestRaw {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    author: Option<String>,
    homepage: Option<String>,
    entry: Option<String>,
    permissions: Option<Vec<String>>,
    enabled_by_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub entry: String,
    pub permissions: Vec<String>,
    pub enabled_by_default: bool,
    pub source: String,
    pub root_path: String,
    pub entry_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntry {
    pub info: PluginInfo,
    pub code: String,
}

fn plugin_roots(app: &AppHandle, workspace_path: Option<&str>) -> Vec<(String, PathBuf)> {
    let mut roots = Vec::new();

    if let Some(workspace) = workspace_path {
        let workspace_root = Path::new(workspace).join(".lumina").join("plugins");
        if workspace_root.exists() {
            roots.push(("workspace".to_string(), workspace_root));
        }
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let user_root = app_data_dir.join("plugins");
        if user_root.exists() {
            roots.push(("user".to_string(), user_root));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let direct = resource_dir.join("plugins");
        if direct.exists() {
            roots.push(("builtin".to_string(), direct));
        } else {
            let nested = resource_dir.join("resources").join("plugins");
            if nested.exists() {
                roots.push(("builtin".to_string(), nested));
            }
        }
    }

    roots
}

fn read_manifest(path: &Path) -> Result<PluginManifestRaw, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in {}: {}", path.display(), e))
}

fn normalize_manifest(raw: PluginManifestRaw, folder_name: &str) -> PluginManifestRaw {
    let mut normalized = raw;
    if normalized.id.as_deref().unwrap_or_default().is_empty() {
        normalized.id = Some(folder_name.to_string());
    }
    if normalized.name.as_deref().unwrap_or_default().is_empty() {
        normalized.name = Some(
            normalized
                .id
                .clone()
                .unwrap_or_else(|| folder_name.to_string()),
        );
    }
    if normalized.version.as_deref().unwrap_or_default().is_empty() {
        normalized.version = Some("0.1.0".to_string());
    }
    if normalized.entry.as_deref().unwrap_or_default().is_empty() {
        normalized.entry = Some(DEFAULT_ENTRYPOINT.to_string());
    }
    normalized
}

fn build_info(source: &str, root: &Path, dir: &Path, manifest: PluginManifestRaw) -> PluginInfo {
    let folder_name = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("plugin");
    let normalized = normalize_manifest(manifest, folder_name);

    let entry = normalized
        .entry
        .unwrap_or_else(|| DEFAULT_ENTRYPOINT.to_string());
    let entry_path = dir.join(&entry);

    PluginInfo {
        id: normalized.id.unwrap_or_else(|| folder_name.to_string()),
        name: normalized.name.unwrap_or_else(|| folder_name.to_string()),
        version: normalized.version.unwrap_or_else(|| "0.1.0".to_string()),
        description: normalized.description,
        author: normalized.author,
        homepage: normalized.homepage,
        entry,
        permissions: normalized.permissions.unwrap_or_default(),
        enabled_by_default: normalized.enabled_by_default.unwrap_or(true),
        source: source.to_string(),
        root_path: root.to_string_lossy().to_string(),
        entry_path: entry_path.to_string_lossy().to_string(),
    }
}

fn list_plugins_in_root(root: &Path, source: &str) -> Vec<PluginInfo> {
    let mut plugins = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return plugins,
    };

    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join(PLUGIN_MANIFEST);
        if !manifest_path.exists() {
            continue;
        }
        let manifest = match read_manifest(&manifest_path) {
            Ok(m) => m,
            Err(err) => {
                eprintln!("[Plugins] {}", err);
                continue;
            }
        };
        let info = build_info(source, root, &dir, manifest);
        if Path::new(&info.entry_path).exists() {
            plugins.push(info);
        } else {
            eprintln!(
                "[Plugins] Missing entry file for {}: {}",
                info.id, info.entry_path
            );
        }
    }

    plugins
}

pub fn list_plugins(app: &AppHandle, workspace_path: Option<&str>) -> Vec<PluginInfo> {
    let roots = plugin_roots(app, workspace_path);
    let mut seen = HashSet::<String>::new();
    let mut ordered = Vec::new();

    for (source, root) in roots {
        for info in list_plugins_in_root(&root, &source) {
            if seen.contains(&info.id) {
                continue;
            }
            seen.insert(info.id.clone());
            ordered.push(info);
        }
    }

    ordered
}

pub fn read_plugin_entry(
    app: &AppHandle,
    plugin_id: &str,
    workspace_path: Option<&str>,
) -> Result<PluginEntry, String> {
    let roots = plugin_roots(app, workspace_path);

    for (source, root) in roots {
        let entries =
            fs::read_dir(&root).map_err(|e| format!("Failed to read {}: {}", root.display(), e))?;

        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let manifest_path = dir.join(PLUGIN_MANIFEST);
            if !manifest_path.exists() {
                continue;
            }

            let manifest = read_manifest(&manifest_path)?;
            let info = build_info(&source, &root, &dir, manifest);
            if info.id != plugin_id {
                continue;
            }

            let code = fs::read_to_string(&info.entry_path)
                .map_err(|e| format!("Failed to read {}: {}", info.entry_path, e))?;

            return Ok(PluginEntry { info, code });
        }
    }

    Err(format!("Plugin not found: {}", plugin_id))
}

fn ensure_workspace_plugin_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let plugin_dir = Path::new(workspace_path).join(".lumina").join("plugins");
    fs::create_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to create {}: {}", plugin_dir.display(), e))?;
    Ok(plugin_dir)
}

fn write_example_plugin(plugin_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(plugin_dir)
        .map_err(|e| format!("Failed to create {}: {}", plugin_dir.display(), e))?;

    let manifest_path = plugin_dir.join(PLUGIN_MANIFEST);
    let entry_path = plugin_dir.join(DEFAULT_ENTRYPOINT);

    if !manifest_path.exists() {
        fs::write(
            &manifest_path,
            r#"{
  "id": "hello-lumina",
  "name": "Hello Lumina",
  "version": "0.1.0",
  "description": "Example plugin that registers a slash command.",
  "author": "Lumina",
  "entry": "index.js",
  "permissions": [
    "commands:register",
    "workspace:read",
    "events:subscribe",
    "storage:write"
  ],
  "enabled_by_default": true
}
"#,
        )
        .map_err(|e| format!("Failed to write {}: {}", manifest_path.display(), e))?;
    }

    if !entry_path.exists() {
        fs::write(
            &entry_path,
            r#"module.exports = function setup(api, plugin) {
  const unregister = api.commands.registerSlashCommand({
    key: "hello-lumina",
    description: "Insert a greeting generated by the example plugin",
    prompt: "请用两句话问候我，并提到这是来自 Lumina plugin 的问候。"
  });

  const offWorkspace = api.events.on("workspace:changed", (payload) => {
    api.logger.info(`[${plugin.id}] workspace changed: ${payload.workspacePath || "<none>"}`);
  });

  api.storage.set("installedAt", new Date().toISOString());
  api.logger.info(`[${plugin.id}] plugin loaded`);

  return () => {
    unregister();
    offWorkspace();
    api.logger.info(`[${plugin.id}] plugin unloaded`);
  };
};
"#,
        )
        .map_err(|e| format!("Failed to write {}: {}", entry_path.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn plugin_list(
    app: AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<PluginInfo>, String> {
    Ok(list_plugins(&app, workspace_path.as_deref()))
}

#[tauri::command]
pub async fn plugin_read_entry(
    app: AppHandle,
    plugin_id: String,
    workspace_path: Option<String>,
) -> Result<PluginEntry, String> {
    read_plugin_entry(&app, &plugin_id, workspace_path.as_deref())
}

#[tauri::command]
pub async fn plugin_get_workspace_dir(workspace_path: String) -> Result<String, String> {
    let dir = ensure_workspace_plugin_dir(&workspace_path)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn plugin_scaffold_example(workspace_path: String) -> Result<String, String> {
    let plugins_dir = ensure_workspace_plugin_dir(&workspace_path)?;
    let example_dir = plugins_dir.join("hello-lumina");
    write_example_plugin(&example_dir)?;
    Ok(example_dir.to_string_lossy().to_string())
}
