import { afterEach, describe, expect, it, vi } from 'vitest'
import plugin from './index.js'
import type { SearchConfig } from './search.js'

async function configure(config: SearchConfig) {
  const hooks = await plugin.server({})
  await hooks.config!(config)
  return config
}

describe('default Parallel Search MCP', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('registers anonymous HTTP search and fetch through the installed plugin hook', async () => {
    const config = await configure({})
    expect(config.mcp).toEqual({
      lumina_parallel: {
        type: 'remote', url: 'https://search.parallel.ai/mcp', oauth: false,
        timeout: 30_000, headers: { 'User-Agent': expect.stringMatching(/^Lumina-Note\//) },
      },
    })
    expect(config.permission).toEqual({ 'lumina_parallel_*': 'ask' })
  })

  it.each([{}, { other: { type: 'remote', url: 'https://example.com/mcp' } },
    { lumina_parallel: { enabled: false } },
    { lumina_parallel: { type: 'remote', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer saved' } } },
  ])('preserves an explicit MCP configuration unchanged', async (mcp) => {
    const config = { mcp }
    const saved = structuredClone(config)
    await configure(config)
    expect(config).toEqual(saved)
  })

  it.each(['OPENCODE_ENABLE_EXA', 'OPENCODE_EXPERIMENTAL', 'OPENCODE_EXPERIMENTAL_EXA', 'EXA_API_KEY', 'PARALLEL_API_KEY'])('preserves explicit %s configuration', async (name) => {
    vi.stubEnv(name, '1')
    expect((await configure({})).mcp).toBeUndefined()
  })

  it.each<SearchConfig>([
    { permission: 'deny' }, { permission: { 'web*': 'deny' } }, { permission: { 'websearch *': 'deny' } }, { permission: { '*': 'deny' } },
    { permission: { websearch: 'deny' } }, { permission: { webfetch: { '*': 'deny', 'https://allowed.test/*': 'allow' } } },
    { tools: { websearch: false } }, { tools: { webfetch: true } },
  ])('preserves explicit network tool policies', async (config) => {
    const saved = structuredClone(config)
    await configure(config)
    expect(config).toEqual(saved)
  })

  it('keeps auto-approve and unrelated permissions', async () => {
    expect((await configure({ permission: 'allow' })).permission).toBe('allow')
    expect((await configure({ permission: { edit: 'ask' } })).permission).toEqual({
      'lumina_parallel_*': 'ask', edit: 'ask',
    })
  })

  it.each([
    { tools: { websearch: true }, permission: { websearch: 'deny' } },
    { permission: { websearch: 'deny', 'web*': 'allow' } },
    { permission: { 'web*': 'allow', websearch: 'deny' } },
    { permission: { websearch: 'deny', '*web*': 'allow' } },
    { permission: { 'websearch *': 'deny' } },
  ])('keeps exact network denials above deprecated tools and wildcard allows', async (agent) => {
    const config = await configure({ agent: { restricted: agent } })
    expect(config.agent!.restricted.permission).toMatchObject({ lumina_parallel_web_search: 'deny' })
  })

  it('preserves an agent’s explicit MCP permissions', async () => {
    const config = await configure({ agent: { custom: { permission: {
      websearch: 'deny', 'lumina_parallel_*': 'ask',
    } } } })
    expect(config.agent!.custom.permission).toEqual({
      websearch: 'deny', 'lumina_parallel_*': 'ask',
    })
  })

  it('carries background wiki restrictions over to both MCP tools', async () => {
    const config = await configure({ agent: {
      'wiki-sync': { permission: { read: 'allow', websearch: 'deny', webfetch: 'deny' } },
      wildcard: { permission: { 'web*': 'deny' } },
      limited: { tools: { websearch: false }, permission: { webfetch: { 'https://allowed.test/*': 'allow' } } },
    } })
    expect(config.agent!['wiki-sync'].permission).toEqual({
      read: 'allow', websearch: 'deny', webfetch: 'deny',
      lumina_parallel_web_search: 'deny', lumina_parallel_web_fetch: 'deny',
    })
    expect(config.agent!.wildcard.permission).toMatchObject({
      lumina_parallel_web_search: 'deny', lumina_parallel_web_fetch: 'deny',
    })
    expect(config.agent!.limited.permission).toMatchObject({
      lumina_parallel_web_search: 'deny', lumina_parallel_web_fetch: 'deny',
    })
  })
})
