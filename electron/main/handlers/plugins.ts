/**
 * Plugins handler — reimplements src-tauri/src/plugins.rs in Node. The
 * renderer's plugin loader invokes five commands:
 *   plugin_list({workspacePath?})              → PluginInfo[]
 *   plugin_read_entry({pluginId, workspacePath?}) → { info, code }
 *   plugin_get_workspace_dir()                  → string
 *   plugin_scaffold_example()                   → string (dir)
 *   plugin_scaffold_theme()                     → string (dir)
 *   plugin_scaffold_ui_overhaul()               → string (dir)
 *
 * Discovery order (first id wins; invalid plugins kept with validation_error):
 *   1. {workspace}/.lumina/plugins
 *   2. {userData}/plugins
 *   3. {resources}/plugins (bundled)
 */

import fs from 'node:fs'
import path from 'node:path'

const PLUGIN_MANIFEST = 'plugin.json'
const DEFAULT_ENTRYPOINT = 'index.js'

export interface PluginValidationError {
  code: string
  field: string | null
  message: string
}

export interface PluginThemeInfo {
  auto_apply: boolean
  tokens: Record<string, string>
  light: Record<string, string>
  dark: Record<string, string>
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string | null
  author: string | null
  homepage: string | null
  entry: string
  permissions: string[]
  enabled_by_default: boolean
  min_app_version: string | null
  api_version: string
  is_desktop_only: boolean
  source: string
  root_path: string
  entry_path: string
  validation_error: PluginValidationError | null
  theme: PluginThemeInfo | null
}

export interface PluginEntry {
  info: PluginInfo
  code: string
}

interface PluginManifestRaw {
  id?: string
  name?: string
  version?: string
  description?: string
  author?: string
  homepage?: string
  entry?: string
  permissions?: string[]
  enabled_by_default?: boolean
  min_app_version?: string
  api_version?: string
  is_desktop_only?: boolean
  theme?: {
    auto_apply?: boolean
    tokens?: Record<string, string>
    light?: Record<string, string>
    dark?: Record<string, string>
  }
}

export interface CreatePluginsHandlersOptions {
  /** Writable user plugin root ({userData}/plugins) */
  userPluginsDir: string
  /** Bundled read-only plugins directory (shipped with the app) */
  builtinPluginsDir?: string | null
  /** Optional fallback writable dir (Rust used a secondary under app data) */
  fallbackPluginsDir?: string | null
  /** Override for tests */
  fs?: typeof fs
}

export type PluginsHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

export function createPluginsHandlers(
  options: CreatePluginsHandlersOptions,
): PluginsHandlerMap {
  const io = options.fs ?? fs

  function pluginRoots(workspacePath: string | undefined): Array<{ source: string; root: string }> {
    const roots: Array<{ source: string; root: string }> = []
    const seen = new Set<string>()

    function push(source: string, root: string): void {
      if (!root) return
      if (!existsSync(io, root)) return
      if (seen.has(root)) return
      seen.add(root)
      roots.push({ source, root })
    }

    if (workspacePath) {
      push('workspace', path.join(workspacePath, '.lumina', 'plugins'))
    }
    push('user', options.userPluginsDir)
    if (options.fallbackPluginsDir) {
      push('user', options.fallbackPluginsDir)
    }
    if (options.builtinPluginsDir) {
      push('builtin', options.builtinPluginsDir)
    }
    return roots
  }

  function listPluginsInRoot(root: string, source: string): PluginInfo[] {
    const entries = readDirSafe(io, root)
    const plugins: PluginInfo[] = []
    for (const name of entries) {
      const dir = path.join(root, name)
      let isDir = false
      try {
        isDir = io.statSync(dir).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      const manifestPath = path.join(dir, PLUGIN_MANIFEST)
      if (!existsSync(io, manifestPath)) continue
      let manifest: PluginManifestRaw
      try {
        const raw = io.readFileSync(manifestPath, 'utf-8')
        manifest = JSON.parse(raw) as PluginManifestRaw
      } catch (err) {
        console.warn(`[plugins] invalid manifest at ${manifestPath}:`, err)
        continue
      }
      const info = buildInfo(source, root, dir, manifest)
      if (info.validation_error) {
        plugins.push(info)
        continue
      }
      if (existsSync(io, info.entry_path)) {
        plugins.push(info)
      } else {
        console.warn(`[plugins] missing entry file for ${info.id}: ${info.entry_path}`)
      }
    }
    return plugins
  }

  function mergeDiscovered(roots: Array<{ source: string; root: string }>): PluginInfo[] {
    const seen = new Set<string>()
    const ordered: PluginInfo[] = []
    for (const { source, root } of roots) {
      for (const info of listPluginsInRoot(root, source)) {
        if (info.validation_error) {
          ordered.push(info)
          continue
        }
        if (seen.has(info.id)) continue
        seen.add(info.id)
        ordered.push(info)
      }
    }
    return ordered
  }

  function ensureWritableDir(dir: string): void {
    io.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, '.lumina-plugin-write-probe')
    io.writeFileSync(probe, 'probe')
    try {
      io.rmSync(probe, { force: true })
    } catch {
      // ignore
    }
  }

  function ensureDefaultPluginDir(): string {
    try {
      ensureWritableDir(options.userPluginsDir)
      return options.userPluginsDir
    } catch (err) {
      if (options.fallbackPluginsDir) {
        try {
          ensureWritableDir(options.fallbackPluginsDir)
          return options.fallbackPluginsDir
        } catch {
          // fall through
        }
      }
      throw new Error(
        `Failed to prepare plugin dir ${options.userPluginsDir}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return {
    async plugin_list(args) {
      const workspacePath = typeof args.workspacePath === 'string' ? args.workspacePath : undefined
      return mergeDiscovered(pluginRoots(workspacePath))
    },

    async plugin_read_entry(args) {
      const pluginId = typeof args.pluginId === 'string' ? args.pluginId : ''
      const workspacePath = typeof args.workspacePath === 'string' ? args.workspacePath : undefined
      if (!pluginId) throw new Error('plugin_read_entry: pluginId is required')
      const roots = pluginRoots(workspacePath)
      for (const { source, root } of roots) {
        for (const name of readDirSafe(io, root)) {
          const dir = path.join(root, name)
          if (!io.existsSync(dir) || !io.statSync(dir).isDirectory()) continue
          const manifestPath = path.join(dir, PLUGIN_MANIFEST)
          if (!existsSync(io, manifestPath)) continue
          let manifest: PluginManifestRaw
          try {
            manifest = JSON.parse(io.readFileSync(manifestPath, 'utf-8')) as PluginManifestRaw
          } catch {
            continue
          }
          const info = buildInfo(source, root, dir, manifest)
          if (info.id !== pluginId) continue
          if (info.validation_error) {
            throw new Error(
              `PLUGIN_MANIFEST_VALIDATION_JSON:${JSON.stringify(info.validation_error)}`,
            )
          }
          const code = io.readFileSync(info.entry_path, 'utf-8')
          return { info, code } satisfies PluginEntry
        }
      }
      throw new Error(`Plugin not found: ${pluginId}`)
    },

    async plugin_get_workspace_dir() {
      return ensureDefaultPluginDir()
    },

    async plugin_scaffold_example() {
      const dir = path.join(ensureDefaultPluginDir(), 'hello-lumina')
      writeTemplate(io, dir, EXAMPLE_MANIFEST, EXAMPLE_ENTRY)
      return dir
    },

    async plugin_scaffold_theme() {
      const dir = path.join(ensureDefaultPluginDir(), 'theme-oceanic')
      writeTemplate(io, dir, THEME_MANIFEST, THEME_ENTRY)
      return dir
    },

    async plugin_scaffold_ui_overhaul() {
      const dir = path.join(ensureDefaultPluginDir(), 'ui-overhaul-lab')
      writeTemplate(io, dir, UI_MANIFEST, UI_ENTRY)
      return dir
    },
  }
}

function existsSync(io: typeof fs, p: string): boolean {
  try {
    return io.existsSync(p)
  } catch {
    return false
  }
}

function readDirSafe(io: typeof fs, dir: string): string[] {
  try {
    return io.readdirSync(dir)
  } catch {
    return []
  }
}

function writeTemplate(io: typeof fs, dir: string, manifest: string, entry: string): void {
  io.mkdirSync(dir, { recursive: true })
  const manifestPath = path.join(dir, PLUGIN_MANIFEST)
  const entryPath = path.join(dir, DEFAULT_ENTRYPOINT)
  if (!existsSync(io, manifestPath)) io.writeFileSync(manifestPath, manifest)
  if (!existsSync(io, entryPath)) io.writeFileSync(entryPath, entry)
}

function validationError(
  code: string,
  field: string | null,
  message: string,
): PluginValidationError {
  return { code, field, message }
}

function isValidSemver(value: string): boolean {
  const core = value.split('-')[0].split('+')[0]
  const parts = core.split('.')
  if (parts.length !== 3) return false
  return parts.every((p) => p.length > 0 && /^\d+$/.test(p))
}

function isValidPluginId(value: string): boolean {
  if (!value) return false
  return /^[a-z0-9._-]+$/.test(value)
}

function containsParentPath(value: string): boolean {
  return value.split(/[/\\]/).some((part) => part === '..')
}

function validateManifest(
  raw: PluginManifestRaw,
  folderName: string,
): { ok: PluginManifestRaw } | { err: PluginValidationError } {
  const id = (raw.id ?? '').trim()
  if (!id) {
    return {
      err: validationError(
        'missing_required_field',
        'id',
        `Field \`id\` is required for plugin folder \`${folderName}\``,
      ),
    }
  }
  if (!isValidPluginId(id)) {
    return {
      err: validationError(
        'invalid_plugin_id',
        'id',
        'Plugin id must use lowercase letters, numbers, dot, underscore or hyphen.',
      ),
    }
  }

  const name = (raw.name ?? '').trim()
  if (!name) {
    return { err: validationError('missing_required_field', 'name', 'Field `name` is required.') }
  }

  const version = (raw.version ?? '').trim()
  if (!version) {
    return {
      err: validationError('missing_required_field', 'version', 'Field `version` is required.'),
    }
  }
  if (!isValidSemver(version)) {
    return {
      err: validationError(
        'invalid_semver',
        'version',
        'Field `version` must be semantic version format x.y.z.',
      ),
    }
  }

  const entry = (raw.entry ?? DEFAULT_ENTRYPOINT).trim()
  if (!entry) {
    return {
      err: validationError('missing_required_field', 'entry', 'Field `entry` is required.'),
    }
  }
  if (path.isAbsolute(entry) || containsParentPath(entry)) {
    return {
      err: validationError(
        'invalid_entry_path',
        'entry',
        'Field `entry` must be a relative path inside plugin folder.',
      ),
    }
  }

  if (raw.api_version !== undefined && raw.api_version.trim() === '') {
    return {
      err: validationError(
        'invalid_api_version',
        'api_version',
        'Field `api_version` cannot be empty.',
      ),
    }
  }

  return { ok: { ...raw, entry, api_version: raw.api_version ?? '1' } }
}

function buildInfo(
  source: string,
  root: string,
  dir: string,
  manifest: PluginManifestRaw,
): PluginInfo {
  const folderName = path.basename(dir) || 'plugin'
  const hintedId = (manifest.id ?? '').trim() || folderName
  const hintedName = (manifest.name ?? '').trim() || folderName
  const validated = validateManifest(manifest, folderName)

  if ('err' in validated) {
    return {
      id: hintedId,
      name: hintedName,
      version: '0.0.0',
      description: null,
      author: null,
      homepage: null,
      entry: DEFAULT_ENTRYPOINT,
      permissions: [],
      enabled_by_default: false,
      min_app_version: null,
      api_version: '1',
      is_desktop_only: false,
      source,
      root_path: root,
      entry_path: path.join(dir, DEFAULT_ENTRYPOINT),
      validation_error: validated.err,
      theme: null,
    }
  }

  const normalized = validated.ok
  const entry = normalized.entry ?? DEFAULT_ENTRYPOINT
  return {
    id: (normalized.id ?? folderName).trim(),
    name: (normalized.name ?? folderName).trim(),
    version: (normalized.version ?? '0.1.0').trim(),
    description: normalized.description ?? null,
    author: normalized.author ?? null,
    homepage: normalized.homepage ?? null,
    entry,
    permissions: normalized.permissions ?? [],
    enabled_by_default: normalized.enabled_by_default ?? true,
    min_app_version: normalized.min_app_version ?? null,
    api_version: normalized.api_version ?? '1',
    is_desktop_only: normalized.is_desktop_only ?? false,
    source,
    root_path: root,
    entry_path: path.join(dir, entry),
    validation_error: null,
    theme: normalized.theme
      ? {
          auto_apply: normalized.theme.auto_apply ?? false,
          tokens: normalized.theme.tokens ?? {},
          light: normalized.theme.light ?? {},
          dark: normalized.theme.dark ?? {},
        }
      : null,
  }
}

// ── Scaffold templates ────────────────────────────────────────────────────

const EXAMPLE_MANIFEST = `{
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
  "enabled_by_default": false,
  "is_desktop_only": false
}
`

const EXAMPLE_ENTRY = `module.exports = function setup(api, plugin) {
  const unregister = api.commands.registerSlashCommand({
    key: "hello-lumina",
    description: "Insert a greeting generated by the example plugin",
    prompt: "请用两句话问候我，并提到这是来自 Lumina plugin 的问候。"
  });
  api.ui.notify("hello-lumina loaded");
  api.logger.info(\`[\${plugin.id}] plugin loaded\`);
  return () => {
    unregister();
    api.logger.info(\`[\${plugin.id}] plugin unloaded\`);
  };
};
`

const THEME_MANIFEST = `{
  "id": "theme-oceanic",
  "name": "Theme Oceanic",
  "version": "0.1.0",
  "entry": "index.js",
  "permissions": ["ui:theme", "ui:decorate"],
  "enabled_by_default": false
}
`

const THEME_ENTRY = `module.exports = function setup(api) {
  const removePreset = api.theme.registerPreset({
    id: "oceanic",
    tokens: {
      "--primary": "199 82% 48%",
      "--ui-radius-md": "16px",
      "--ui-radius-lg": "22px"
    },
    dark: {
      "--background": "210 35% 9%",
      "--foreground": "205 40% 95%"
    }
  });
  api.theme.applyPreset("oceanic");
  return () => { removePreset(); };
};
`

const UI_MANIFEST = `{
  "id": "ui-overhaul-lab",
  "name": "UI Overhaul Lab",
  "version": "0.1.0",
  "entry": "index.js",
  "permissions": ["commands:*", "ui:*", "workspace:panel", "workspace:tab"],
  "enabled_by_default": false
}
`

const UI_ENTRY = `module.exports = function setup(api) {
  const removeRibbon = api.ui.registerRibbonItem({
    id: "launch-ui-overhaul",
    title: "UI Lab",
    icon: "🧪",
    run: () => api.workspace.mountView({
      viewType: "ui-lab",
      title: "UI Overhaul Lab",
      html: "<h2>UI Overhaul Lab</h2><p>This view is mounted from a plugin.</p>"
    })
  });
  return () => { removeRibbon(); };
};
`
