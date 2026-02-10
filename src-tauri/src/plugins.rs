use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const PLUGIN_MANIFEST: &str = "plugin.json";
const DEFAULT_ENTRYPOINT: &str = "index.js";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
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
    min_app_version: Option<String>,
    api_version: Option<String>,
    is_desktop_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginValidationError {
    pub code: String,
    pub field: Option<String>,
    pub message: String,
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
    pub min_app_version: Option<String>,
    pub api_version: String,
    pub is_desktop_only: bool,
    pub source: String,
    pub root_path: String,
    pub entry_path: String,
    pub validation_error: Option<PluginValidationError>,
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

fn validation_error(code: &str, field: Option<&str>, message: impl Into<String>) -> PluginValidationError {
    PluginValidationError {
        code: code.to_string(),
        field: field.map(|v| v.to_string()),
        message: message.into(),
    }
}

fn is_valid_semver(value: &str) -> bool {
    let core = value.split('-').next().unwrap_or(value);
    let core = core.split('+').next().unwrap_or(core);
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() != 3 {
        return false;
    }
    parts.iter().all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn is_valid_plugin_id(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    value
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_' || c == '-')
}

fn contains_parent_path(value: &str) -> bool {
    value.split('/').any(|part| part == "..") || value.split('\\').any(|part| part == "..")
}

fn validate_manifest(
    raw: PluginManifestRaw,
    folder_name: &str,
) -> Result<PluginManifestRaw, PluginValidationError> {
    let id = raw.id.as_deref().unwrap_or_default().trim();
    if id.is_empty() {
        return Err(validation_error(
            "missing_required_field",
            Some("id"),
            format!("Field `id` is required for plugin folder `{}`", folder_name),
        ));
    }
    if !is_valid_plugin_id(id) {
        return Err(validation_error(
            "invalid_plugin_id",
            Some("id"),
            "Plugin id must use lowercase letters, numbers, dot, underscore or hyphen.",
        ));
    }

    let name = raw.name.as_deref().unwrap_or_default().trim();
    if name.is_empty() {
        return Err(validation_error(
            "missing_required_field",
            Some("name"),
            "Field `name` is required.",
        ));
    }

    let version = raw.version.as_deref().unwrap_or_default().trim();
    if version.is_empty() {
        return Err(validation_error(
            "missing_required_field",
            Some("version"),
            "Field `version` is required.",
        ));
    }
    if !is_valid_semver(version) {
        return Err(validation_error(
            "invalid_semver",
            Some("version"),
            "Field `version` must be semantic version format x.y.z.",
        ));
    }

    let entry = raw.entry.as_deref().unwrap_or(DEFAULT_ENTRYPOINT).trim();
    if entry.is_empty() {
        return Err(validation_error(
            "missing_required_field",
            Some("entry"),
            "Field `entry` is required.",
        ));
    }
    if Path::new(entry).is_absolute() || contains_parent_path(entry) {
        return Err(validation_error(
            "invalid_entry_path",
            Some("entry"),
            "Field `entry` must be a relative path inside plugin folder.",
        ));
    }

    if let Some(api_version) = raw.api_version.as_deref() {
        if api_version.trim().is_empty() {
            return Err(validation_error(
                "invalid_api_version",
                Some("api_version"),
                "Field `api_version` cannot be empty.",
            ));
        }
    }

    Ok(PluginManifestRaw {
        entry: Some(entry.to_string()),
        api_version: Some(raw.api_version.unwrap_or_else(|| "1".to_string())),
        ..raw
    })
}

fn build_info(source: &str, root: &Path, dir: &Path, manifest: PluginManifestRaw) -> PluginInfo {
    let folder_name = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("plugin");
    let hinted_id = manifest
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(folder_name)
        .to_string();
    let hinted_name = manifest
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(folder_name)
        .to_string();
    let validated = validate_manifest(manifest, folder_name);
    let normalized = match validated {
        Ok(value) => value,
        Err(err) => {
            return PluginInfo {
                id: hinted_id,
                name: hinted_name,
                version: "0.0.0".to_string(),
                description: None,
                author: None,
                homepage: None,
                entry: DEFAULT_ENTRYPOINT.to_string(),
                permissions: vec![],
                enabled_by_default: false,
                min_app_version: None,
                api_version: "1".to_string(),
                is_desktop_only: false,
                source: source.to_string(),
                root_path: root.to_string_lossy().to_string(),
                entry_path: dir.join(DEFAULT_ENTRYPOINT).to_string_lossy().to_string(),
                validation_error: Some(err),
            };
        }
    };

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
        min_app_version: normalized.min_app_version,
        api_version: normalized.api_version.unwrap_or_else(|| "1".to_string()),
        is_desktop_only: normalized.is_desktop_only.unwrap_or(false),
        source: source.to_string(),
        root_path: root.to_string_lossy().to_string(),
        entry_path: entry_path.to_string_lossy().to_string(),
        validation_error: None,
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
        if info.validation_error.is_some() {
            plugins.push(info);
            continue;
        }
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
    merge_discovered_plugins(roots)
}

fn merge_discovered_plugins(roots: Vec<(String, PathBuf)>) -> Vec<PluginInfo> {
    let mut seen = HashSet::<String>::new();
    let mut ordered = Vec::new();

    for (source, root) in roots {
        for info in list_plugins_in_root(&root, &source) {
            if info.validation_error.is_some() {
                ordered.push(info);
                continue;
            }
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
    read_plugin_entry_from_roots(roots, plugin_id)
}

fn read_plugin_entry_from_roots(
    roots: Vec<(String, PathBuf)>,
    plugin_id: &str,
) -> Result<PluginEntry, String> {
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
            if let Some(err) = info.validation_error.clone() {
                let payload = serde_json::to_string(&err).unwrap_or_else(|_| {
                    "{\"code\":\"manifest_validation_error\",\"message\":\"invalid plugin manifest\"}"
                        .to_string()
                });
                return Err(format!("PLUGIN_MANIFEST_VALIDATION_JSON:{}", payload));
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
  "min_app_version": "0.1.0",
  "api_version": "1",
  "permissions": [
    "commands:*",
    "vault:*",
    "events:*",
    "storage:*",
    "ui:*",
    "runtime:*",
    "workspace:panel",
    "workspace:tab"
  ],
  "enabled_by_default": true,
  "is_desktop_only": false
}
"#,
        )
        .map_err(|e| format!("Failed to write {}: {}", manifest_path.display(), e))?;
    }

    if !entry_path.exists() {
        fs::write(
            &entry_path,
            r##"module.exports = function setup(api, plugin) {
  const unregister = api.commands.registerSlashCommand({
    key: "hello-lumina",
    description: "Insert a greeting generated by the example plugin",
    prompt: "请用两句话问候我，并提到这是来自 Lumina plugin 的问候。"
  });
  const unregisterCommand = api.commands.registerCommand({
    id: "open-hello-view",
    title: "Open Hello Lumina view",
    description: "Open a plugin-defined custom tab view",
    hotkey: "Mod+Shift+H",
    run: () => {
      api.workspace.openRegisteredTab("hello-view", { now: new Date().toISOString() });
    }
  });

  const offWorkspace = api.events.on("workspace:changed", (payload) => {
    api.logger.info(`[${plugin.id}] workspace changed: ${payload.workspacePath || "<none>"}`);
  });

  const cleanupTheme = api.ui.setThemeVariables({
    "--lumina-plugin-accent": "#0ea5e9"
  });
  const cleanupStyle = api.ui.injectStyle(`
    :root {
      --plugin-hello-ring: color-mix(in srgb, var(--lumina-plugin-accent) 40%, transparent);
    }
  `, "hello-lumina");
  const timer = api.runtime.setInterval(() => {
    api.logger.info(`[${plugin.id}] heartbeat`);
  }, 60_000);
  const removePanel = api.workspace.registerPanel({
    id: "hello-panel",
    title: "Hello Panel",
    html: "<p>This panel is registered by hello-lumina.</p>"
  });
  const unregisterView = api.workspace.registerTabType({
    type: "hello-view",
    title: "Hello View",
    render: (payload) =>
      `<h3>Hello from ${plugin.id}</h3><p>Opened at: ${payload.now || "unknown"}</p>`
  });

  api.storage.set("installedAt", new Date().toISOString());
  api.ui.notify("hello-lumina loaded");
  api.logger.info(`[${plugin.id}] plugin loaded`);

  return () => {
    unregister();
    unregisterCommand();
    unregisterView();
    removePanel();
    offWorkspace();
    api.runtime.clearInterval(timer);
    cleanupStyle();
    cleanupTheme();
    api.logger.info(`[${plugin.id}] plugin unloaded`);
  };
};
"##,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(name: &str) -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("lumina-plugin-tests-{}-{}", name, ts));
        fs::create_dir_all(&path).expect("create test root");
        path
    }

    fn write_plugin(root: &Path, folder: &str, manifest: &str, entry: Option<&str>) -> PathBuf {
        let dir = root.join(folder);
        fs::create_dir_all(&dir).expect("create plugin dir");
        fs::write(dir.join("plugin.json"), manifest).expect("write plugin manifest");
        if let Some(code) = entry {
            fs::write(dir.join("index.js"), code).expect("write plugin entry");
        }
        dir
    }

    #[test]
    fn merge_keeps_invalid_without_shadowing_valid_plugin() {
        let workspace_root = test_root("workspace");
        let user_root = test_root("user");

        write_plugin(
            &workspace_root,
            "hello-lumina",
            r#"{"id":"hello-lumina","name":"Bad","version":"bad","entry":"index.js"}"#,
            Some("module.exports = () => {};"),
        );
        write_plugin(
            &user_root,
            "hello-lumina",
            r#"{"id":"hello-lumina","name":"Good","version":"1.0.0","entry":"index.js"}"#,
            Some("module.exports = () => {};"),
        );

        let merged = merge_discovered_plugins(vec![
            ("workspace".to_string(), workspace_root.clone()),
            ("user".to_string(), user_root.clone()),
        ]);

        let invalid = merged
            .iter()
            .find(|p| p.source == "workspace")
            .expect("workspace plugin should be present");
        assert!(invalid.validation_error.is_some());

        let valid = merged
            .iter()
            .find(|p| p.source == "user" && p.id == "hello-lumina")
            .expect("user plugin should not be shadowed by invalid one");
        assert!(valid.validation_error.is_none());

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(user_root);
    }

    #[test]
    fn read_entry_skips_other_invalid_plugins_until_target() {
        let root = test_root("read-entry");
        write_plugin(
            &root,
            "bad-plugin",
            r#"{"id":"bad-plugin","name":"Bad","version":"bad","entry":"index.js"}"#,
            Some("module.exports = () => {};"),
        );
        write_plugin(
            &root,
            "good-plugin",
            r#"{"id":"good-plugin","name":"Good","version":"1.0.0","entry":"index.js"}"#,
            Some("module.exports = () => {};"),
        );

        let entry = read_plugin_entry_from_roots(vec![("workspace".to_string(), root.clone())], "good-plugin")
            .expect("target plugin should still load");
        assert_eq!(entry.info.id, "good-plugin");

        let _ = fs::remove_dir_all(root);
    }
}
