import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createVscodeExtensionHandlers,
  type VscodeExtensionHandlerMap,
} from './vscodeExtensions.js'
import type { BinaryFetchLike } from '../vscode-extensions/download.js'
import type { FetchLike } from '../vscode-extensions/sources.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vscode-ext-handlers-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('vscode extension handlers', () => {
  it('checks latest Open VSX metadata', async () => {
    const metadataFetch = vi.fn(async () => jsonResponse({
      namespace: 'OpenAI',
      name: 'chatgpt',
      version: '6.1.0',
      files: { download: 'https://example.com/openai.chatgpt-6.1.0.vsix' },
    })) satisfies FetchLike
    const handlers = createHandlers({ metadataFetch })

    const latest = await handlers.vscode_extensions_check_latest({
      extensionId: 'openai.chatgpt',
      source: 'open-vsx',
    })

    expect(latest).toMatchObject({
      extensionId: 'openai.chatgpt',
      version: '6.1.0',
      source: 'open-vsx',
    })
  })

  it('checks latest GitHub release metadata when configured', async () => {
    const metadataFetch = vi.fn(async () => jsonResponse({
      tag_name: 'v6.1.0',
      html_url: 'https://github.com/openai/codex/releases/tag/v6.1.0',
      assets: [
        {
          name: 'openai.chatgpt-6.1.0.vsix',
          browser_download_url: 'https://github.example/openai.chatgpt-6.1.0.vsix',
        },
      ],
    })) satisfies FetchLike
    const handlers = createHandlers({ metadataFetch })

    const latest = await handlers.vscode_extensions_check_latest({
      extensionId: 'openai.chatgpt',
      source: 'github-release',
      githubOwner: 'openai',
      githubRepo: 'codex',
      githubAssetPattern: 'chatgpt',
    })

    expect(latest).toMatchObject({
      extensionId: 'openai.chatgpt',
      version: '6.1.0',
      source: 'github-release',
      downloadUrl: 'https://github.example/openai.chatgpt-6.1.0.vsix',
    })
  })

  it('rejects Marketplace checks without explicit terms acceptance', async () => {
    const handlers = createHandlers()

    await expect(
      handlers.vscode_extensions_check_latest({
        extensionId: 'openai.chatgpt',
        source: 'marketplace',
      }),
    ).rejects.toThrow(/terms acceptance/)
  })

  it('rolls back to the previous active install', async () => {
    const handlers = createHandlers()
    await seedInstall(handlers, '6.0.0')
    await seedInstall(handlers, '6.1.0')

    await handlers.vscode_extensions_activate_installed({
      extensionId: 'openai.chatgpt',
      version: '6.0.0',
    })
    await handlers.vscode_extensions_activate_installed({
      extensionId: 'openai.chatgpt',
      version: '6.1.0',
    })

    const rolledBack = await handlers.vscode_extensions_rollback({
      extensionId: 'openai.chatgpt',
    })

    expect(rolledBack).toMatchObject({ extensionId: 'openai.chatgpt', version: '6.0.0' })
  })

  it('returns diagnostics for supported AI extensions', async () => {
    const handlers = createHandlers()
    await seedInstall(handlers, '6.1.0')
    await handlers.vscode_extensions_activate_installed({
      extensionId: 'openai.chatgpt',
      version: '6.1.0',
    })

    const diagnostics = await handlers.vscode_extensions_get_diagnostics({})

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensionId: 'openai.chatgpt',
          displayName: 'Codex',
          active: expect.objectContaining({ version: '6.1.0' }),
          compatibility: expect.objectContaining({ status: 'preview' }),
          hostCapabilities: expect.objectContaining({
            missingCapabilities: [],
          }),
        }),
        expect.objectContaining({
          extensionId: 'anthropic.claude-code',
          displayName: 'Claude Code',
          active: null,
        }),
      ]),
    )
  })

  it('installs latest through the full update pipeline', async () => {
    const vsixBytes = createZip({
      'extension/package.json': JSON.stringify({
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
        main: './extension.js',
      }),
      'extension/extension.js': `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("chatgpt.sidebarView", {
    resolveWebviewView(view) {
      view.webview.html = "<!doctype html><html><body>Codex</body></html>";
    },
  });
};`,
    })
    const metadataFetch = vi.fn(async () => jsonResponse({
      namespace: 'OpenAI',
      name: 'chatgpt',
      version: '6.1.0',
      files: { download: 'https://example.com/openai.chatgpt-6.1.0.vsix' },
    })) satisfies FetchLike
    const binaryFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      async arrayBuffer() {
        return toArrayBuffer(vsixBytes)
      },
    })) satisfies BinaryFetchLike
    const handlers = createHandlers({ metadataFetch, binaryFetch })

    const result = await handlers.vscode_extensions_install_latest({
      extensionId: 'openai.chatgpt',
      source: 'open-vsx',
    })

    expect(result).toMatchObject({
      remote: { extensionId: 'openai.chatgpt', version: '6.1.0' },
      smoke: { ok: true },
      outcome: { decision: 'pending-manual-opt-in' },
    })
    const state = await handlers.vscode_extensions_get_state({})
    expect(JSON.stringify(state)).toContain('6.1.0')
  })

  it('auto-activates latest installs when an external stable profile covers the version', async () => {
    const compatDir = path.join(tmpDir, 'compat')
    writeStableCodexProfile(compatDir)
    const vsixBytes = createZip({
      'extension/package.json': JSON.stringify({
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
        main: './extension.js',
      }),
      'extension/extension.js': `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("chatgpt.sidebarView", {
    resolveWebviewView(view) {
      view.webview.html = "<!doctype html><html><body>Codex</body></html>";
    },
  });
};`,
    })
    const metadataFetch = vi.fn(async () => jsonResponse({
      namespace: 'OpenAI',
      name: 'chatgpt',
      version: '6.1.0',
      files: { download: 'https://example.com/openai.chatgpt-6.1.0.vsix' },
    })) satisfies FetchLike
    const binaryFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      async arrayBuffer() {
        return toArrayBuffer(vsixBytes)
      },
    })) satisfies BinaryFetchLike
    const handlers = createHandlers({ metadataFetch, binaryFetch, compatProfilesDir: compatDir })

    const result = await handlers.vscode_extensions_install_latest({
      extensionId: 'openai.chatgpt',
      source: 'open-vsx',
    })

    expect(result).toMatchObject({
      smoke: { ok: true },
      outcome: { decision: 'auto-activated' },
    })
    const state = await handlers.vscode_extensions_get_state({})
    expect(state).toMatchObject({
      activeById: { 'openai.chatgpt': '6.1.0' },
    })
  })

  it('imports a local VSIX through the manual install handler', async () => {
    const vsixPath = path.join(tmpDir, 'openai.chatgpt.vsix')
    fs.writeFileSync(
      vsixPath,
      createZip({
        'extension/package.json': JSON.stringify({
          publisher: 'OpenAI',
          name: 'chatgpt',
          version: '6.1.0',
          main: './extension.js',
        }),
        'extension/extension.js': `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("chatgpt.sidebarView", {
    resolveWebviewView(view) {
      view.webview.html = "<!doctype html><html><body>Codex</body></html>";
    },
  });
};`,
      }),
    )
    const handlers = createHandlers()

    const result = await handlers.vscode_extensions_install_local_vsix({
      extensionId: 'openai.chatgpt',
      vsixPath,
    })

    expect(result).toMatchObject({
      installed: {
        extensionId: 'openai.chatgpt',
        version: '6.1.0',
      },
      smoke: { ok: true },
      outcome: { decision: 'pending-manual-opt-in' },
    })
  })
})

function createHandlers(options: {
  metadataFetch?: FetchLike
  binaryFetch?: BinaryFetchLike
  compatProfilesDir?: string
} = {}): VscodeExtensionHandlerMap {
  return createVscodeExtensionHandlers({
    baseDir: tmpDir,
    hostScriptPath: path.resolve('scripts/codex-vscode-host/host.mjs'),
    compatProfilesDir: options.compatProfilesDir,
    metadataFetch: options.metadataFetch,
    binaryFetch: options.binaryFetch,
  })
}

function writeStableCodexProfile(root: string) {
  const dir = path.join(root, 'openai.chatgpt')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '6.x.json'),
    JSON.stringify({
      extensionId: 'openai.chatgpt',
      channel: 'stable',
      versionRange: '6.x',
      hostApiVersion: 1,
      entryViewTypes: ['chatgpt.sidebarView'],
      requiredCapabilities: [
        'commands',
        'diff-viewer',
        'env-open-external',
        'memento',
        'secret-storage',
        'webview-view',
        'window-notifications',
        'workspace-documents',
        'workspace-fs',
        'workspace-selection',
      ],
      commandMappings: { 'vscode.diff': 'lumina.diff' },
      cspSourceDirectives: {
        'connect-src': ['self'],
        'font-src': ['self', 'data:'],
        'script-src': ['self', "'unsafe-eval'"],
      },
      needsTerminal: false,
      needsDiffViewer: true,
      needsIdeBridge: false,
      disabledFeatures: [],
    }),
    'utf-8',
  )
}

async function seedInstall(handlers: VscodeExtensionHandlerMap, version: string) {
  const state = (await handlers.vscode_extensions_get_state({})) as {
    installed: Record<string, Record<string, unknown>>
  }
  state.installed['openai.chatgpt'] = {
    ...(state.installed['openai.chatgpt'] ?? {}),
    [version]: {
      extensionId: 'openai.chatgpt',
      version,
      extensionPath: path.join(tmpDir, `openai.chatgpt-${version}`),
      source: 'manual-vsix',
      installedAt: `2026-05-01T${version.endsWith('0') ? '10' : '11'}:00:00.000Z`,
      compatibility: {
        status: 'stable',
        reason: 'seeded',
        autoUpdateEligible: true,
        profileVersionRange: '6.x',
      },
    },
  }
  fs.writeFileSync(
    path.join(tmpDir, 'lumina-vscode-extensions.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf-8',
  )
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body)
    },
    async json() {
      return body
    },
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const result = new ArrayBuffer(buffer.length)
  new Uint8Array(result).set(buffer)
  return result
}

function createZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  const names = Object.keys(entries)

  for (const [name, content] of Object.entries(entries)) {
    const fileName = Buffer.from(name)
    const data = Buffer.from(content)
    const crc = crc32(data)
    const local = Buffer.alloc(30 + fileName.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(fileName.length, 26)
    local.writeUInt16LE(0, 28)
    fileName.copy(local, 30)
    localParts.push(local, data)

    const central = Buffer.alloc(46 + fileName.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(fileName.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    fileName.copy(central, 46)
    centralParts.push(central)
    offset += local.length + data.length
  }

  const centralDir = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(names.length, 8)
  end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDir, end])
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let offset = 0; offset < data.length; offset += 1) {
    const byte = data[offset]
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
