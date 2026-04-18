import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProxyHandlers, type ProxyConfig } from './proxy.js'

let baseDir = ''
let configPath = ''

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-proxy-'))
  configPath = path.join(baseDir, 'proxy.json')
})

afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function buildHandlers(opts: {
  setProxy?: (rules: { proxyRules?: string }) => Promise<void>
  testProbe?: (proxyUrl: string) => Promise<void>
} = {}) {
  const setProxy = vi.fn(opts.setProxy ?? (async () => undefined))
  const testProbe = opts.testProbe
    ? vi.fn(opts.testProbe)
    : vi.fn(async () => undefined)
  const handlers = createProxyHandlers({
    configPath,
    session: { setProxy },
    testProbe,
  })
  return { handlers, setProxy, testProbe }
}

describe('set_proxy_config', () => {
  it('persists config + applies to session when enabled', async () => {
    const { handlers, setProxy } = buildHandlers()
    await handlers.set_proxy_config({
      proxyUrl: 'http://localhost:8080',
      enabled: true,
    })
    expect(setProxy).toHaveBeenCalledWith({ proxyRules: 'http://localhost:8080' })
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(persisted.proxy_url).toBe('http://localhost:8080')
    expect(persisted.enabled).toBe(true)
  })

  it('clears proxy when disabled', async () => {
    const { handlers, setProxy } = buildHandlers()
    await handlers.set_proxy_config({
      proxyUrl: 'http://localhost:8080',
      enabled: false,
    })
    expect(setProxy).toHaveBeenCalledWith({ proxyRules: '' })
  })

  it('accepts snake_case proxy_url too', async () => {
    const { handlers, setProxy } = buildHandlers()
    await handlers.set_proxy_config({
      proxy_url: 'http://x:1',
      enabled: true,
    })
    expect(setProxy).toHaveBeenCalledWith({ proxyRules: 'http://x:1' })
  })

  it('ignores session.setProxy errors but still persists', async () => {
    const { handlers } = buildHandlers({
      setProxy: async () => {
        throw new Error('boom')
      },
    })
    await expect(
      handlers.set_proxy_config({ proxyUrl: 'http://x:1', enabled: true }),
    ).resolves.toBeNull()
    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8')).proxy_url).toBe('http://x:1')
  })
})

describe('get_proxy_config', () => {
  it('returns defaults when no file', async () => {
    const { handlers } = buildHandlers()
    const cfg = (await handlers.get_proxy_config({})) as ProxyConfig
    expect(cfg).toEqual({ proxy_url: '', enabled: false })
  })

  it('returns saved value', async () => {
    const { handlers } = buildHandlers()
    await handlers.set_proxy_config({ proxyUrl: 'http://x:9', enabled: true })
    const cfg = (await handlers.get_proxy_config({})) as ProxyConfig
    expect(cfg).toEqual({ proxy_url: 'http://x:9', enabled: true })
  })

  it('survives malformed JSON', async () => {
    fs.writeFileSync(configPath, '{not json')
    const { handlers } = buildHandlers()
    const cfg = (await handlers.get_proxy_config({})) as ProxyConfig
    expect(cfg).toEqual({ proxy_url: '', enabled: false })
  })
})

describe('test_proxy_connection', () => {
  it('throws if proxyUrl missing', async () => {
    const { handlers } = buildHandlers()
    await expect(handlers.test_proxy_connection({})).rejects.toThrow(/required/)
  })

  it('runs the probe with the given url', async () => {
    const probe = vi.fn(async () => undefined)
    const { handlers } = buildHandlers({ testProbe: probe })
    await handlers.test_proxy_connection({ proxyUrl: 'http://x:1' })
    expect(probe).toHaveBeenCalledWith('http://x:1')
  })

  it('bubbles probe failure', async () => {
    const probe = vi.fn(async () => {
      throw new Error('refused')
    })
    const { handlers } = buildHandlers({ testProbe: probe })
    await expect(
      handlers.test_proxy_connection({ proxyUrl: 'http://x:1' }),
    ).rejects.toThrow(/refused/)
  })
})
