import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installCompatProfilesFromIndex } from './compatUpdate.js'
import { loadExternalCompatProfiles } from './profileLoader.js'
import type { FetchLike } from './sources.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vscode-compat-update-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('installCompatProfilesFromIndex', () => {
  it('downloads, validates, and installs versioned compatibility profiles', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      schemaVersion: 1,
      profiles: [
        {
          extensionId: 'openai.chatgpt',
          channel: 'stable',
          versionRange: '6.x',
          hostApiVersion: 1,
          entryViewTypes: ['chatgpt.sidebarView'],
          requiredCapabilities: ['commands', 'webview-view'],
          commandMappings: { 'vscode.diff': 'lumina.diff' },
          cspSourceDirectives: { 'connect-src': ['self'] },
          needsTerminal: false,
          needsDiffViewer: true,
          needsIdeBridge: false,
          disabledFeatures: [],
        },
      ],
    })) satisfies FetchLike

    const result = await installCompatProfilesFromIndex({
      indexUrl: 'https://updates.example.com/lumina-vscode-compat/index.json',
      profilesRoot: tmpDir,
      fetch: fetcher,
    })

    expect(result.profiles).toEqual([
      expect.objectContaining({
        extensionId: 'openai.chatgpt',
        channel: 'stable',
        versionRange: '6.x',
        filePath: path.join(tmpDir, 'openai.chatgpt', 'stable-6.x.json'),
      }),
    ])
    expect(loadExternalCompatProfiles(tmpDir)).toEqual([
      expect.objectContaining({
        extensionId: 'openai.chatgpt',
        channel: 'stable',
        versionRange: '6.x',
      }),
    ])
  })

  it('rejects profile indexes with unknown capabilities', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      schemaVersion: 1,
      profiles: [
        {
          extensionId: 'openai.chatgpt',
          channel: 'stable',
          versionRange: '6.x',
          hostApiVersion: 1,
          entryViewTypes: [],
          requiredCapabilities: ['workbench-internals'],
          commandMappings: {},
          cspSourceDirectives: {},
          needsTerminal: false,
          needsDiffViewer: false,
          needsIdeBridge: false,
          disabledFeatures: [],
        },
      ],
    })) satisfies FetchLike

    await expect(
      installCompatProfilesFromIndex({
        indexUrl: 'https://updates.example.com/index.json',
        profilesRoot: tmpDir,
        fetch: fetcher,
      }),
    ).rejects.toThrow(/unknown capability/)
  })

  it('rejects non-HTTPS profile index URLs', async () => {
    await expect(
      installCompatProfilesFromIndex({
        indexUrl: 'http://updates.example.com/index.json',
        profilesRoot: tmpDir,
        fetch: vi.fn(),
      }),
    ).rejects.toThrow(/must use https/)
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
