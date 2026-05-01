import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { runVscodeHostSmokeTest } from './smoke.js'

describe('runVscodeHostSmokeTest', () => {
  it('starts codex-vscode-host and validates expected view types', async () => {
    const result = await runVscodeHostSmokeTest({
      hostScriptPath: path.resolve('scripts/codex-vscode-host/host.mjs'),
      extensionPath: path.resolve('scripts/codex-vscode-host/fixtures/hello-ext'),
      expectedViewTypes: ['hello.view'],
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(true)
    expect(result.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(result.health.viewTypes).toContain('hello.view')
  })

  it('returns ok=false when expected view types are missing', async () => {
    const result = await runVscodeHostSmokeTest({
      hostScriptPath: path.resolve('scripts/codex-vscode-host/host.mjs'),
      extensionPath: path.resolve('scripts/codex-vscode-host/fixtures/hello-ext'),
      expectedViewTypes: ['missing.view'],
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(false)
    expect(result.health.missingViewTypes).toEqual(['missing.view'])
  })
})
