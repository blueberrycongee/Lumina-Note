// Phase 5.4 guardrail: no agent test file may import a real provider SDK
// directly. Tests should drive the runtime through MockLanguageModelV3 / a
// scripted ProviderInterface / InMemoryTransport, so CI never reaches the
// network. registry.ts and ai-sdk-provider.ts are the only allowed
// importers because they are the production wrapping layers.
//
// If this test fails, you probably wrote a test that imports
// @ai-sdk/anthropic (etc.) directly. Switch to MockLanguageModelV3 from
// 'ai/test' and inject it via the modelBuilder option or a mock provider.

import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PROVIDER_PACKAGES = [
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@ai-sdk/openai-compatible',
  '@ai-sdk/google',
  '@ai-sdk/deepseek',
  '@ai-sdk/groq',
]

const ALLOWLIST = new Set([
  // Production sources where these imports belong:
  'electron/main/agent/providers/registry.ts',
])

const AGENT_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await walk(full)
      out.push(...sub)
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('agent test files do not import real provider SDKs', () => {
  it('every test file uses mocks, not @ai-sdk providers', async () => {
    const files = await walk(AGENT_DIR)
    const offenders: string[] = []
    for (const file of files) {
      if (!file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) continue
      const rel = path.relative(REPO_ROOT, file)
      if (ALLOWLIST.has(rel)) continue
      const src = await fs.readFile(file, 'utf-8')
      for (const pkg of PROVIDER_PACKAGES) {
        const re = new RegExp(`from\\s+['"]${pkg.replace(/[/\\]/g, '\\$&')}`)
        if (re.test(src)) {
          offenders.push(`${rel} imports ${pkg}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('only the allowed production sources import provider SDKs', async () => {
    const files = await walk(AGENT_DIR)
    const importers: string[] = []
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file)
      const src = await fs.readFile(file, 'utf-8')
      for (const pkg of PROVIDER_PACKAGES) {
        const re = new RegExp(`from\\s+['"]${pkg.replace(/[/\\]/g, '\\$&')}`)
        if (re.test(src)) {
          importers.push(rel)
          break
        }
      }
    }
    const unexpected = importers.filter((f) => !ALLOWLIST.has(f))
    expect(unexpected).toEqual([])
  })
})
