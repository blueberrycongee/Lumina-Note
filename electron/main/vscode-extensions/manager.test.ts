import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VscodeExtensionManager } from './manager.js'
import type {
  VscodeExtensionCompatProfile,
  VscodeHostCapability,
} from './profiles.js'
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
    const manager = new VscodeExtensionManager(store, {
      implementedCapabilities: new Set<VscodeHostCapability>([
        'authentication.getSession',
        'commands',
        'diagnostics-read',
        'diff-viewer',
        'env-open-external',
        'ide-bridge',
        'memento',
        'secret-storage',
        'terminal',
        'webview-panel',
        'webview-view',
        'window-notifications',
        'workspace-documents',
        'workspace-fs',
        'workspace-selection',
      ]),
    })

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

  it('blocks installs when host capabilities do not satisfy the profile', () => {
    const profile: VscodeExtensionCompatProfile = {
      extensionId: 'openai.chatgpt',
      channel: 'preview',
      versionRange: '*',
      hostApiVersion: 1,
      entryViewTypes: ['chatgpt.sidebarView'],
      requiredCapabilities: ['commands', 'webview-panel'],
      commandMappings: {},
      cspSourceDirectives: {},
      needsTerminal: false,
      needsDiffViewer: false,
      needsIdeBridge: false,
      disabledFeatures: [],
    }
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store, {
      profiles: [profile],
      implementedCapabilities: new Set<VscodeHostCapability>(['commands']),
    })

    const outcome = manager.registerCandidateInstall({
      packageJson: {
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
      },
      extensionPath: path.join(tmpDir, 'openai.chatgpt-6.1.0'),
      source: 'manual-vsix',
      installedAt: '2026-05-01T12:00:00.000Z',
      smokeTestPassed: true,
    })

    expect(outcome.decision).toBe('blocked')
    expect(outcome.reason).toContain('webview-panel')
    expect(store.getActive('openai.chatgpt')).toBeNull()
  })

  it('keeps stable-compatible installs pending until smoke test passes', () => {
    const stableProfile: VscodeExtensionCompatProfile = {
      extensionId: 'openai.chatgpt',
      channel: 'stable',
      versionRange: '6.x',
      hostApiVersion: 1,
      entryViewTypes: ['chatgpt.sidebarView'],
      requiredCapabilities: ['commands'],
      commandMappings: {},
      cspSourceDirectives: {},
      needsTerminal: false,
      needsDiffViewer: false,
      needsIdeBridge: false,
      disabledFeatures: [],
    }
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    const manager = new VscodeExtensionManager(store, {
      profiles: [stableProfile],
      implementedCapabilities: new Set<VscodeHostCapability>(['commands']),
    })

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
