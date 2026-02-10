# Lumina Plugin Ecosystem (Developer Preview)

> 建议先阅读：
>
> - `docs/plugin-open-strategy.md`
> - `docs/plugin-manifest.v1.md`
> - `packages/plugin-api/index.d.ts`
> - `packages/plugin-ui/README.md`

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
  "min_app_version": "0.1.0",
  "api_version": "1",
  "permissions": [
    "commands:*",
    "events:*",
    "vault:*",
    "workspace:*",
    "editor:*",
    "ui:*",
    "storage:*",
    "network:*",
    "runtime:*"
  ],
  "enabled_by_default": true,
  "is_desktop_only": false
}
```

### Required fields

- `id`: unique plugin identifier
- `name`: display name
- `version`: semantic version string
- `entry`: JavaScript entry file path relative to plugin folder

### Optional fields

- `description`, `author`, `homepage`
- `min_app_version`, `api_version`, `is_desktop_only`
- `permissions`: capability list
- `enabled_by_default`: defaults to `true`

### Compatibility behavior

- If `api_version` does not match host API version, plugin will not load.
- If `min_app_version` is greater than current app version, plugin will not load.
- Incompatible reasons are shown in `Settings -> Plugins`.

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
- `injectStyle(css, scopeId?)`
  - `css` also supports `{ css, scopeId?, global?, layer? }`
  - `layer`: `base | theme | component | override` (injection order low -> high)
- `setThemeVariables(record)`
- `registerRibbonItem({ id, title, icon?, section?, order?, run })`
- `registerStatusBarItem({ id, text, align?, order?, run? })`
- `registerSettingSection({ id, title, html })`
- `registerContextMenuItem({ id, title, order?, run })`
- `registerCommandPaletteGroup({ id, title, commands })`

### `api.theme`

- `registerPreset({ id, name?, tokens?, light?, dark? })`
- `applyPreset(id)`
- `setToken({ token, value, mode? })`
- `resetToken({ token, mode? })`

### `api.vault`

- `getPath()`
- `readFile(path)`
- `writeFile(path, content)`
- `deleteFile(path)`
- `renameFile(oldPath, newPath)`
- `moveFile(sourcePath, targetFolder)`
- `listFiles()`

### `api.metadata`

- `getFileMetadata(path)` returns:
  - `frontmatter`
  - `links`
  - `tags`

### `api.commands`

- `registerSlashCommand({ key, description, prompt })`
- Returns `unregister()` cleanup function
- `registerCommand({ id, title, description?, hotkey?, run })`
  - Appears in command palette
  - Supports default hotkey and conflict detection

### `api.workspace`

- `getPath()`
- `getActiveFile()`
- `openFile(path)`
- `readFile(path)`
- `writeFile(path, content)`
- `registerPanel({ id, title, html })`
- `registerTabType({ type, title, render(payload) })`
- `openRegisteredTab(type, payload?)`
- `mountView({ viewType, title, html })`
- `registerShellSlot({ slotId, html, order? })`
- `registerLayoutPreset({ id, ...layout })`
- `applyLayoutPreset(id)`

Workspace/vault operations are restricted to the current workspace path.

### `api.editor`

- `getActiveFile()`
- `getActiveContent()`
- `setActiveContent(next)`
- `replaceRange(start, end, next)`
- `registerDecoration(className, css)`
- `getSelection()`
- `registerEditorExtension(cmExtension)` for CodeMirror extensions
- `registerEditorExtension({ id, css?, layer?, scopeId? })` for style-only editor extensions

### `api.render`

- `registerMarkdownPostProcessor({ id, process })`
- `registerCodeBlockRenderer({ id, language, render })`
- `registerReadingViewPostProcessor({ id, process(container) })` (supports cleanup return)

### `api.storage`

- `get(key)`
- `set(key, value)`
- `remove(key)`

Data is namespaced by plugin id in local storage.

### `api.events`

- `on("app:ready" | "workspace:changed" | "active-file:changed", handler)`

### `api.network`

- `fetch(input, init)`

### `api.runtime`

- `setInterval(handler, ms)`
- `clearInterval(id)`
- `setTimeout(handler, ms)`
- `clearTimeout(id)`

### `api.interop`

- `openExternal(url)`

## Permission model

Every sensitive API checks permissions declared in `plugin.json`.

- `commands:*` / `commands:register`
- `events:*` / `events:subscribe`
- `vault:*` (`vault:read`, `vault:write`, `vault:delete`, `vault:move`, `vault:list`)
- `metadata:read`
- `workspace:*` (`workspace:read`, `workspace:open`)
- `workspace:*` (`workspace:read`, `workspace:open`, `workspace:panel`, `workspace:tab`)
- `editor:*` (`editor:read`, `editor:write`, `editor:decorate`)
- `ui:*` (`ui:notify`, `ui:theme`, `ui:decorate`)
- `storage:*` (`storage:read`, `storage:write`)
- `network:*` (`network:fetch`)
- `runtime:*` (`runtime:timer`)
- `interop:*` (`interop:open-external`)

You can also use `"*"` to allow all capabilities. `namespace:*` wildcard is also supported.

## Plugin manager (UI)

Open `Settings -> Plugins (Developer Preview)` to:

- Refresh plugin discovery
- Reload plugin runtime
- Enable/disable plugins
- Open workspace plugin folder
- Scaffold an example plugin
- Scaffold a theme plugin template
- Scaffold a UI-overhaul plugin template
- Toggle `Appearance Safe Mode` (disables appearance-heavy plugins)
- Unload all plugin styles with one click

Open `Settings -> Plugin Style Runtime (Dev)` to inspect:

- active style layers
- selector conflicts across plugins

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
