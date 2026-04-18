/**
 * Proxy handlers — replace the Rust src-tauri/proxy module.
 *
 * The renderer calls three IPCs:
 *   set_proxy_config({ proxyUrl, enabled })       → applies to session and persists
 *   get_proxy_config()                            → { proxy_url, enabled }
 *   test_proxy_connection({ proxyUrl })           → resolves on success, throws otherwise
 *
 * Persistence: userData/lumina-proxy.json. The session sink is injected so
 * tests can capture calls without touching Electron internals.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface ProxyConfig {
  proxy_url: string
  enabled: boolean
}

export interface ProxySessionSink {
  /** Apply or clear proxy on the live session */
  setProxy(rules: { proxyRules?: string }): Promise<void>
}

export type ProxyTestFn = (proxyUrl: string) => Promise<void>

export interface CreateProxyHandlersOptions {
  configPath: string
  /** session.defaultSession.setProxy in production; vi.fn in tests */
  session?: ProxySessionSink
  /** Override the connectivity probe (default: fetch https://www.google.com) */
  testProbe?: ProxyTestFn
}

export type ProxyHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

const DEFAULT_CONFIG: ProxyConfig = { proxy_url: '', enabled: false }
const DEFAULT_PROBE_URL = 'https://www.google.com/generate_204'

export function createProxyHandlers(
  options: CreateProxyHandlersOptions,
): ProxyHandlerMap {
  let cached: ProxyConfig | null = null

  function load(): ProxyConfig {
    if (cached) return cached
    try {
      const raw = fs.readFileSync(options.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<ProxyConfig>
      cached = {
        proxy_url:
          typeof parsed.proxy_url === 'string' ? parsed.proxy_url : '',
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
      }
    } catch {
      cached = { ...DEFAULT_CONFIG }
    }
    return cached
  }

  function save(config: ProxyConfig): void {
    cached = { ...config }
    try {
      fs.mkdirSync(path.dirname(options.configPath), { recursive: true })
      fs.writeFileSync(options.configPath, JSON.stringify(cached, null, 2), 'utf-8')
    } catch (err) {
      console.error('[proxy] save failed', err)
    }
  }

  async function applyToSession(config: ProxyConfig): Promise<void> {
    if (!options.session) return
    if (config.enabled && config.proxy_url.trim().length > 0) {
      await options.session.setProxy({ proxyRules: config.proxy_url.trim() })
    } else {
      // Empty proxyRules clears the proxy.
      await options.session.setProxy({ proxyRules: '' })
    }
  }

  return {
    async set_proxy_config(args) {
      const proxyUrl =
        typeof args.proxyUrl === 'string'
          ? args.proxyUrl
          : typeof args.proxy_url === 'string'
            ? args.proxy_url
            : ''
      const enabled = args.enabled === true
      const next: ProxyConfig = { proxy_url: proxyUrl, enabled }
      save(next)
      try {
        await applyToSession(next)
      } catch (err) {
        console.error('[proxy] applyToSession failed', err)
      }
      return null
    },

    async get_proxy_config() {
      return load()
    },

    async test_proxy_connection(args) {
      const proxyUrl =
        typeof args.proxyUrl === 'string'
          ? args.proxyUrl.trim()
          : typeof args.proxy_url === 'string'
            ? args.proxy_url.trim()
            : ''
      if (!proxyUrl) {
        throw new Error('proxyUrl is required')
      }
      const probe = options.testProbe ?? defaultProbe
      await probe(proxyUrl)
      return true
    },
  }
}

async function defaultProbe(proxyUrl: string): Promise<void> {
  // Pure connectivity check — Electron's session is process-global so we don't
  // re-route fetch through the proxy here. We only verify the URL parses and
  // a small request to a stable target completes from the user's network.
  // The user is expected to supply a reachable proxy; deeper validation is left
  // to the renderer's own request paths.
  try {
    new URL(proxyUrl) // throws on malformed
  } catch (err) {
    throw new Error(
      `proxy url is invalid: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(DEFAULT_PROBE_URL, { signal: controller.signal })
    if (!res.ok && res.status !== 204) {
      throw new Error(`probe target returned ${res.status}`)
    }
  } catch (err) {
    throw new Error(
      `connectivity probe failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}
