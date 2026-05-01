import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadExternalCompatProfiles } from './profileLoader.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-compat-profiles-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadExternalCompatProfiles', () => {
  it('loads versioned profile JSON files from extension subdirectories', () => {
    const dir = path.join(tmpDir, 'openai.chatgpt')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, '6.x.json'),
      JSON.stringify({
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
      }),
      'utf-8',
    )

    const profiles = loadExternalCompatProfiles(tmpDir)

    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      extensionId: 'openai.chatgpt',
      channel: 'stable',
      versionRange: '6.x',
      requiredCapabilities: ['commands', 'webview-view'],
    })
  })

  it('rejects profiles that name unknown host capabilities', () => {
    const dir = path.join(tmpDir, 'openai.chatgpt')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'bad.json'),
      JSON.stringify({
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
      }),
      'utf-8',
    )

    expect(() => loadExternalCompatProfiles(tmpDir)).toThrow(/unknown capability/)
  })

  it('returns an empty list when the profile root does not exist', () => {
    expect(loadExternalCompatProfiles(path.join(tmpDir, 'missing'))).toEqual([])
  })
})
