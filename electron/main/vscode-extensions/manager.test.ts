import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VscodeExtensionManager } from './manager.js'
import { VscodeExtensionStore } from './store.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vscode-ext-manager-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('VscodeExtensionManager', () => {
  it('records preview-compatible installs without auto-activating them', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store)

    const outcome = manager.registerCandidateInstall({
      packageJson: {
        publisher: 'Anthropic',
        name: 'claude-code',
        version: '2.1.81',
        engines: { vscode: '^1.98.0' },
      },
      extensionPath: path.join(tmpDir, 'anthropic.claude-code-2.1.81'),
      source: 'marketplace',
      installedAt: '2026-05-01T12:00:00.000Z',
      packageBytes: new TextEncoder().encode('vsix-bytes'),
      smokeTestPassed: true,
    })

    expect(outcome.decision).toBe('pending-manual-opt-in')
    expect(outcome.record?.compatibility.status).toBe('preview')
    expect(outcome.record?.packageSha256).toHaveLength(64)
    expect(store.getActive('anthropic.claude-code')).toBeNull()
    expect(store.listInstalled('anthropic.claude-code')).toHaveLength(1)
  })

  it('keeps stable-compatible installs pending until smoke test passes', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store)

    const outcome = manager.registerCandidateInstall({
      packageJson: {
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
      },
      extensionPath: path.join(tmpDir, 'openai.chatgpt-6.1.0'),
      source: 'manual-vsix',
      installedAt: '2026-05-01T12:00:00.000Z',
      smokeTestPassed: false,
    })

    expect(outcome.decision).toBe('pending-smoke-test')
    expect(store.getActive('openai.chatgpt')).toBeNull()
  })

  it('blocks unsupported extensions before writing store state', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store)

    const outcome = manager.registerCandidateInstall({
      packageJson: {
        publisher: 'ms-python',
        name: 'python',
        version: '2026.1.0',
      },
      extensionPath: path.join(tmpDir, 'ms-python.python-2026.1.0'),
      source: 'open-vsx',
      smokeTestPassed: true,
    })

    expect(outcome.decision).toBe('blocked')
    expect(outcome.record).toBeNull()
    expect(store.getState().installed).toEqual({})
  })
})
