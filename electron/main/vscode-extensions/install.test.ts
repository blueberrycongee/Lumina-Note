import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { VscodeExtensionDownloadResult } from './download.js'
import { installDownloadedVsix, installLocalVsixFile } from './install.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vsix-install-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeDownload(
  itemName: string,
  version: string,
  entries: Record<string, string>,
): VscodeExtensionDownloadResult {
  const vsixPath = path.join(tmpDir, `${itemName}-${version}.vsix`)
  const bytes = createZip(entries)
  fs.writeFileSync(vsixPath, bytes)
  return {
    remote: {
      extensionId: itemName as 'openai.chatgpt',
      source: 'open-vsx',
      version,
      downloadUrl: 'https://example.com/ext.vsix',
      itemUrl: 'https://example.com/item',
    },
    filePath: vsixPath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  }
}

describe('installDownloadedVsix', () => {
  it('extracts a VSIX and reads extension/package.json', async () => {
    const download = makeDownload('openai.chatgpt', '6.1.0', {
      'extension/package.json': JSON.stringify({
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
        main: './extension.js',
      }),
      'extension/extension.js': 'exports.activate = () => {}',
    })

    const result = await installDownloadedVsix(download, {
      installRoot: path.join(tmpDir, 'installed'),
      platform: 'test-platform',
    })

    expect(result.extensionPath).toBe(
      path.join(tmpDir, 'installed', 'openai.chatgpt-6.1.0-test-platform', 'extension'),
    )
    expect(result.packageJson).toMatchObject({
      publisher: 'OpenAI',
      name: 'chatgpt',
      version: '6.1.0',
    })
    expect(fs.existsSync(path.join(result.extensionPath, 'extension.js'))).toBe(true)
  })

  it('rejects VSIX packages whose package id does not match the remote metadata', async () => {
    const download = makeDownload('openai.chatgpt', '6.1.0', {
      'extension/package.json': JSON.stringify({
        publisher: 'Anthropic',
        name: 'claude-code',
        version: '6.1.0',
      }),
    })

    await expect(
      installDownloadedVsix(download, {
        installRoot: path.join(tmpDir, 'installed'),
        platform: 'test-platform',
      }),
    ).rejects.toThrow(/package id mismatch/)
  })

  it('rejects VSIX packages whose package version does not match the remote metadata', async () => {
    const download = makeDownload('openai.chatgpt', '6.1.0', {
      'extension/package.json': JSON.stringify({
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.2.0',
      }),
    })

    await expect(
      installDownloadedVsix(download, {
        installRoot: path.join(tmpDir, 'installed'),
        platform: 'test-platform',
      }),
    ).rejects.toThrow(/package version mismatch/)
  })

  it('imports a local VSIX after reading its package metadata', async () => {
    const vsixPath = path.join(tmpDir, 'claude-code.vsix')
    fs.writeFileSync(
      vsixPath,
      createZip({
        'extension/package.json': JSON.stringify({
          publisher: 'Anthropic',
          name: 'claude-code',
          version: '2.1.81',
        }),
      }),
    )

    const result = await installLocalVsixFile(vsixPath, {
      installRoot: path.join(tmpDir, 'installed'),
      platform: 'test-platform',
      expectedExtensionId: 'anthropic.claude-code',
    })

    expect(result.extensionId).toBe('anthropic.claude-code')
    expect(result.version).toBe('2.1.81')
    expect(result.extensionPath).toBe(
      path.join(tmpDir, 'installed', 'anthropic.claude-code-2.1.81-test-platform', 'extension'),
    )
  })

  it('rejects local VSIX files for unsupported extensions', async () => {
    const vsixPath = path.join(tmpDir, 'python.vsix')
    fs.writeFileSync(
      vsixPath,
      createZip({
        'extension/package.json': JSON.stringify({
          publisher: 'ms-python',
          name: 'python',
          version: '2026.1.0',
        }),
      }),
    )

    await expect(
      installLocalVsixFile(vsixPath, {
        installRoot: path.join(tmpDir, 'installed'),
        platform: 'test-platform',
      }),
    ).rejects.toThrow(/Unsupported VS Code extension/)
  })
})

function createZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

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
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
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
