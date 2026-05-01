import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  VscodeExtensionStore,
  type VscodeExtensionInstallRecord,
} from './store.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vscode-ext-store-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function record(
  version: string,
  installedAt: string,
): VscodeExtensionInstallRecord {
  return {
    extensionId: 'openai.chatgpt',
    version,
    extensionPath: path.join(tmpDir, `openai.chatgpt-${version}`),
    source: 'manual-vsix',
    installedAt,
    smokeTestPassed: true,
    compatibility: {
      status: 'stable',
      reason: 'verified in test',
      autoUpdateEligible: true,
      profileVersionRange: '6.x',
    },
  }
}

describe('VscodeExtensionStore', () => {
  it('starts with an empty state when no file exists', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })

    expect(store.getState()).toEqual({
      schemaVersion: 1,
      activeById: {},
      previousById: {},
      installed: {},
    })
  })

  it('records installs and lists newest first', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })

    store.recordInstall(record('6.0.0', '2026-05-01T10:00:00.000Z'))
    store.recordInstall(record('6.1.0', '2026-05-01T11:00:00.000Z'))

    expect(store.listInstalled('openai.chatgpt').map((item) => item.version)).toEqual([
      '6.1.0',
      '6.0.0',
    ])
  })

  it('activates an installed version and persists across instances', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    store.recordInstall(record('6.0.0', '2026-05-01T10:00:00.000Z'))
    store.activate('openai.chatgpt', '6.0.0')

    const store2 = new VscodeExtensionStore({ baseDir: tmpDir })
    expect(store2.getActive('openai.chatgpt')?.version).toBe('6.0.0')
  })

  it('tracks previous active version and rolls back', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })
    store.recordInstall(record('6.0.0', '2026-05-01T10:00:00.000Z'))
    store.recordInstall(record('6.1.0', '2026-05-01T11:00:00.000Z'))

    store.activate('openai.chatgpt', '6.0.0')
    store.activate('openai.chatgpt', '6.1.0')

    expect(store.getState().previousById['openai.chatgpt']).toBe('6.0.0')

    const rolledBack = store.rollback('openai.chatgpt')
    expect(rolledBack.version).toBe('6.0.0')
    expect(store.getActive('openai.chatgpt')?.version).toBe('6.0.0')
    expect(store.getState().previousById['openai.chatgpt']).toBe('6.1.0')
  })

  it('refuses to activate a missing version', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })

    expect(() => store.activate('openai.chatgpt', '6.0.0')).toThrow(
      /Cannot activate missing extension/,
    )
  })

  it('refuses rollback when no previous version exists', () => {
    const store = new VscodeExtensionStore({ baseDir: tmpDir })

    expect(() => store.rollback('openai.chatgpt')).toThrow(
      /No previous extension version/,
    )
  })
})
