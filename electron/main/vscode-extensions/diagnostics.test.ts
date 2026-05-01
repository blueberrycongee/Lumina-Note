import { describe, expect, it } from 'vitest'

import {
  BUILTIN_VSCODE_AI_COMPAT_PROFILES,
  type SupportedVscodeAiExtensionId,
} from './profiles.js'
import { diagnoseHostCapabilities } from './diagnostics.js'

function profile(id: SupportedVscodeAiExtensionId) {
  const found = BUILTIN_VSCODE_AI_COMPAT_PROFILES.find(
    (item) => item.extensionId === id,
  )
  if (!found) throw new Error(`missing profile ${id}`)
  return found
}

describe('vscode extension host capability diagnostics', () => {
  it('reports missing Codex host features explicitly', () => {
    const diagnostic = diagnoseHostCapabilities(profile('openai.chatgpt'))

    expect(diagnostic.canRunWithoutMissingCapabilities).toBe(false)
    expect(diagnostic.missingCapabilities).toEqual(['diff-viewer'])
    expect(diagnostic.implementedCapabilities).toContain('webview-view')
  })

  it('reports Claude Code terminal and IDE bridge gaps explicitly', () => {
    const diagnostic = diagnoseHostCapabilities(profile('anthropic.claude-code'))

    expect(diagnostic.canRunWithoutMissingCapabilities).toBe(false)
    expect(diagnostic.missingCapabilities).toEqual([
      'diff-viewer',
      'ide-bridge',
      'terminal',
      'webview-panel',
    ])
  })

  it('passes when the caller supplies all required capabilities', () => {
    const claude = profile('anthropic.claude-code')
    const diagnostic = diagnoseHostCapabilities(
      claude,
      new Set(claude.requiredCapabilities),
    )

    expect(diagnostic.canRunWithoutMissingCapabilities).toBe(true)
    expect(diagnostic.missingCapabilities).toEqual([])
  })
})
