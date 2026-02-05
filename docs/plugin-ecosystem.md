# Lumina Plugin Ecosystem (Developer Preview)

Lumina now exposes a first-party plugin runtime for developers.

## Plugin locations

Lumina discovers plugins from these folders (in order):

1. Workspace: `<vault>/.lumina/plugins`
2. User: `<app_data>/plugins`
3. Built-in: bundled app resources

If multiple plugins share the same `id`, the first one found wins (workspace overrides user overrides built-in).

## Plugin manifest

Each plugin lives in its own folder and must include `plugin.json`:

```json
{
  "id": "hello-lumina",
  "name": "Hello Lumina",
  "version": "0.1.0",
  "description": "Example plugin",
  "author": "Lumina",
  "entry": "index.js",
  "permissions": [
    "commands:register",
    "events:subscribe",
    "workspace:read",
    "workspace:write",
    "storage:read",
    "storage:write",
    "network:fetch"
  ],
  "enabled_by_default": true
}
```

### Required fields

- `id`: unique plugin identifier
- `name`: display name
- `version`: semantic version string
- `entry`: JavaScript entry file path relative to plugin folder

### Optional fields

- `description`, `author`, `homepage`
- `permissions`: capability list
- `enabled_by_default`: defaults to `true`

## Entry contract

Lumina executes plugin entry as CommonJS-style code. The entry must export a setup function:

```js
module.exports = function setup(api, plugin) {
  // register features
  return () => {
    // optional cleanup when plugin unloads
  };
};
```

You can also return `{ dispose() {} }`.

## Runtime API

### `api.meta`

Plugin metadata:

- `id`, `name`, `version`, `source`, `permissions`

### `api.logger`

- `info(message)`
- `warn(message)`
- `error(message)`

### `api.ui`

- `notify(message)`

### `api.commands`

- `registerSlashCommand({ key, description, prompt })`
- Returns `unregister()` cleanup function

### `api.workspace`

- `getPath()`
- `readFile(path)`
- `writeFile(path, content)`

Workspace read/write operations are restricted to the current workspace path.

### `api.storage`

- `get(key)`
- `set(key, value)`
- `remove(key)`

Data is namespaced by plugin id in local storage.

### `api.events`

- `on("app:ready" | "workspace:changed" | "active-file:changed", handler)`

### `api.network`

- `fetch(input, init)`

## Permission model

Every sensitive API checks permissions declared in `plugin.json`.

- `commands:register`
- `events:subscribe`
- `workspace:read`
- `workspace:write`
- `storage:read`
- `storage:write`
- `network:fetch`

You can also use `"*"` to allow all capabilities.

## Plugin manager (UI)

Open `Settings -> Plugins (Developer Preview)` to:

- Refresh plugin discovery
- Reload plugin runtime
- Enable/disable plugins
- Open workspace plugin folder
- Scaffold an example plugin

## Quick start

1. Open a workspace in Lumina.
2. Go to `Settings -> Plugins (Developer Preview)`.
3. Click `Scaffold Example Plugin`.
4. Enable `hello-lumina` if needed.
5. In chat input, type `/hello-lumina` and send.

## Tauri commands (for frontend integrations)

- `plugin_list(workspace_path?)`
- `plugin_read_entry(plugin_id, workspace_path?)`
- `plugin_get_workspace_dir(workspace_path)`
- `plugin_scaffold_example(workspace_path)`
