import { describe, expect, it } from 'vitest'

import {
  extensionIdFromPackage,
  isSupportedVscodeAiExtensionId,
  resolveCompatibilityProfile,
  type VscodeExtensionCompatProfile,
} from './profiles.js'

const stableCodexProfile: VscodeExtensionCompatProfile = {
  extensionId: 'openai.chatgpt',
  channel: 'stable',
  versionRange: '6.x',
  hostApiVersion: 1,
  entryViewTypes: ['chatgpt.sidebarView'],
  requiredCapabilities: ['commands', 'webview-view'],
  commandMappings: {},
  cspSourceDirectives: {},
  needsTerminal: false,
  needsDiffViewer: true,
  needsIdeBridge: false,
  disabledFeatures: [],
}

describe('vscode extension compatibility profiles', () => {
  it('normalizes marketplace package metadata into a stable extension id', () => {
    expect(
      extensionIdFromPackage({
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.2.1',
      }),
    ).toBe('openai.chatgpt')

    expect(isSupportedVscodeAiExtensionId('Anthropic.claude-code')).toBe(true)
    expect(isSupportedVscodeAiExtensionId('unknown.extension')).toBe(false)
  })

  it('does not auto-enable preview profiles', () => {
    const result = resolveCompatibilityProfile({
      publisher: 'Anthropic',
      name: 'claude-code',
      version: '2.1.81',
      engines: { vscode: '^1.98.0' },
    })

    expect(result.status).toBe('preview')
    expect(result.autoUpdateEligible).toBe(false)
    expect(result.profile?.needsTerminal).toBe(true)
    expect(result.profile?.needsIdeBridge).toBe(true)
    expect(result.reason).toContain('manual opt-in')
  })

  it('allows auto-update only when a stable profile covers the version', () => {
    const result = resolveCompatibilityProfile(
      {
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '6.9.0',
        engines: { vscode: '>=1.98.0' },
      },
      [stableCodexProfile],
    )

    expect(result.status).toBe('stable')
    expect(result.autoUpdateEligible).toBe(true)
    expect(result.profile?.entryViewTypes).toEqual(['chatgpt.sidebarView'])
  })

  it('marks target plugin versions without matching profiles as unknown-version', () => {
    const result = resolveCompatibilityProfile(
      {
        publisher: 'OpenAI',
        name: 'chatgpt',
        version: '7.0.0',
        engines: { vscode: '>=1.98.0' },
      },
      [stableCodexProfile],
    )

    expect(result.status).toBe('unknown-version')
    expect(result.autoUpdateEligible).toBe(false)
    expect(result.profile).toBeNull()
  })

  it('rejects extensions that require a newer VS Code engine than the host targets', () => {
    const result = resolveCompatibilityProfile(
      {
        publisher: 'Anthropic',
        name: 'claude-code',
        version: '3.0.0',
        engines: { vscode: '>=1.100.0' },
      },
      [],
    )

    expect(result.status).toBe('incompatible-vscode-engine')
    expect(result.autoUpdateEligible).toBe(false)
    expect(result.reason).toContain('requires VS Code >=1.100.0')
  })

  it('rejects unrelated VS Code extensions', () => {
    const result = resolveCompatibilityProfile({
      publisher: 'ms-python',
      name: 'python',
      version: '2026.1.0',
    })

    expect(result.status).toBe('unknown-extension')
    expect(result.autoUpdateEligible).toBe(false)
  })
})
