import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  VscodeExtensionCompatProfile,
  VscodeHostCapability,
} from './profiles.js'
import { installLatestVscodeExtensionUpdate } from './update.js'
import { VscodeExtensionManager } from './manager.js'
import { VscodeExtensionStore } from './store.js'
import type { BinaryFetchLike } from './download.js'
import type { FetchLike } from './sources.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vscode-ext-update-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const stableProfile: VscodeExtensionCompatProfile = {
  extensionId: 'openai.chatgpt',
  channel: 'stable',
  versionRange: '6.x',
  hostApiVersion: 1,
  entryViewTypes: ['hello.view'],
  requiredCapabilities: ['commands', 'webview-view'],
  commandMappings: {},
  cspSourceDirectives: {},
  needsTerminal: false,
  needsDiffViewer: false,
  needsIdeBridge: false,
  disabledFeatures: [],
}

describe('installLatestVscodeExtensionUpdate', () => {
  it('queries, downloads, installs, smoke-tests, and activates a stable update', async () => {
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
  vscode.window.registerWebviewViewProvider("hello.view", {
    resolveWebviewView(view) {
      view.webview.html = "<!doctype html><html><body>Hello</body></html>";
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

    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store, {
      profiles: [stableProfile],
      implementedCapabilities: new Set<VscodeHostCapability>([
        'commands',
        'webview-view',
      ]),
    })

    const result = await installLatestVscodeExtensionUpdate(manager, {
      extensionId: 'openai.chatgpt',
      source: 'open-vsx',
      cacheDir: path.join(tmpDir, 'cache'),
      installRoot: path.join(tmpDir, 'installed'),
      hostScriptPath: path.resolve('scripts/codex-vscode-host/host.mjs'),
      profiles: [stableProfile],
      implementedCapabilities: new Set<VscodeHostCapability>([
        'commands',
        'webview-view',
      ]),
      metadataFetch,
      binaryFetch,
    })

    expect(result.remote.version).toBe('6.1.0')
    expect(result.download.sha256).toBe(createHash('sha256').update(vsixBytes).digest('hex'))
    expect(result.smoke?.ok).toBe(true)
    expect(result.outcome.decision).toBe('auto-activated')
    expect(store.getActive('openai.chatgpt')?.version).toBe('6.1.0')
    expect(fs.existsSync(path.join(result.installed.extensionPath, 'extension.js'))).toBe(true)
  })
})

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
