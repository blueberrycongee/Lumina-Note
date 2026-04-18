import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPluginsHandlers, type PluginInfo } from './plugins.js'

let root = ''
let userDir = ''
let builtinDir = ''
let workspaceDir = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-plugins-'))
  userDir = path.join(root, 'user')
  builtinDir = path.join(root, 'builtin')
  workspaceDir = path.join(root, 'workspace')
  fs.mkdirSync(userDir, { recursive: true })
  fs.mkdirSync(builtinDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function writePlugin(
  root: string,
  folder: string,
  manifest: Record<string, unknown>,
  entry: string | null = 'module.exports = () => {};',
): string {
  const dir = path.join(root, folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest))
  if (entry !== null) {
    fs.writeFileSync(path.join(dir, 'index.js'), entry)
  }
  return dir
}

function build() {
  return createPluginsHandlers({
    userPluginsDir: userDir,
    builtinPluginsDir: builtinDir,
  })
}

describe('plugin_list', () => {
  it('returns [] when all roots are empty', async () => {
    const handlers = build()
    const plugins = (await handlers.plugin_list({})) as PluginInfo[]
    expect(plugins).toEqual([])
  })

  it('prefers workspace over user over builtin (first id wins)', async () => {
    writePlugin(path.join(workspaceDir, '.lumina', 'plugins'), 'p', {
      id: 'p',
      name: 'ws',
      version: '1.0.0',
    })
    writePlugin(userDir, 'p', { id: 'p', name: 'user', version: '1.0.0' })
    writePlugin(builtinDir, 'p', { id: 'p', name: 'builtin', version: '1.0.0' })

    const handlers = build()
    const plugins = (await handlers.plugin_list({ workspacePath: workspaceDir })) as PluginInfo[]
    const p = plugins.find((x) => x.id === 'p')
    expect(p).toBeDefined()
    expect(p?.name).toBe('ws')
    expect(p?.source).toBe('workspace')
  })

  it('keeps invalid plugins with a validation_error entry', async () => {
    writePlugin(userDir, 'broken', { id: 'broken', name: 'X', version: 'not-semver' })
    const handlers = build()
    const plugins = (await handlers.plugin_list({})) as PluginInfo[]
    const broken = plugins.find((x) => x.id === 'broken')
    expect(broken?.validation_error?.code).toBe('invalid_semver')
  })

  it('skips plugins whose entry file is missing', async () => {
    writePlugin(userDir, 'ghost', { id: 'ghost', name: 'G', version: '1.0.0' }, null)
    const handlers = build()
    const plugins = (await handlers.plugin_list({})) as PluginInfo[]
    expect(plugins.find((x) => x.id === 'ghost')).toBeUndefined()
  })
})

describe('plugin_read_entry', () => {
  it('returns the source of the first matching plugin', async () => {
    writePlugin(userDir, 'demo', { id: 'demo', name: 'D', version: '1.0.0' }, 'exports.marker = 42;')
    const handlers = build()
    const result = (await handlers.plugin_read_entry({ pluginId: 'demo' })) as {
      info: PluginInfo
      code: string
    }
    expect(result.info.id).toBe('demo')
    expect(result.code).toContain('exports.marker = 42;')
  })

  it('throws PLUGIN_MANIFEST_VALIDATION_JSON when manifest is invalid', async () => {
    writePlugin(userDir, 'bad', { id: 'bad', name: 'B', version: 'bad' })
    const handlers = build()
    await expect(handlers.plugin_read_entry({ pluginId: 'bad' })).rejects.toThrow(
      /PLUGIN_MANIFEST_VALIDATION_JSON/,
    )
  })

  it('throws "Plugin not found" when id is unknown', async () => {
    const handlers = build()
    await expect(handlers.plugin_read_entry({ pluginId: 'nope' })).rejects.toThrow(
      /Plugin not found/,
    )
  })
})

describe('plugin_get_workspace_dir + scaffold', () => {
  it('returns the user plugin dir after ensuring it exists', async () => {
    fs.rmSync(userDir, { recursive: true, force: true })
    const handlers = build()
    const dir = (await handlers.plugin_get_workspace_dir({})) as string
    expect(dir).toBe(userDir)
    expect(fs.existsSync(userDir)).toBe(true)
  })

  it('plugin_scaffold_example writes hello-lumina manifest + entry', async () => {
    const handlers = build()
    const dir = (await handlers.plugin_scaffold_example({})) as string
    expect(dir).toBe(path.join(userDir, 'hello-lumina'))
    expect(fs.existsSync(path.join(dir, 'plugin.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'index.js'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf-8'))
    expect(manifest.id).toBe('hello-lumina')
  })

  it('plugin_scaffold_theme writes theme-oceanic template', async () => {
    const handlers = build()
    const dir = (await handlers.plugin_scaffold_theme({})) as string
    expect(path.basename(dir)).toBe('theme-oceanic')
    expect(fs.existsSync(path.join(dir, 'plugin.json'))).toBe(true)
  })

  it('plugin_scaffold_ui_overhaul writes ui-overhaul-lab template', async () => {
    const handlers = build()
    const dir = (await handlers.plugin_scaffold_ui_overhaul({})) as string
    expect(path.basename(dir)).toBe('ui-overhaul-lab')
    expect(fs.existsSync(path.join(dir, 'plugin.json'))).toBe(true)
  })

  it('scaffold does not overwrite an existing plugin.json', async () => {
    const dir = path.join(userDir, 'hello-lumina')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'plugin.json'), '{"keep":true}')
    const handlers = build()
    await handlers.plugin_scaffold_example({})
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf-8'))
    expect(manifest.keep).toBe(true)
  })
})
