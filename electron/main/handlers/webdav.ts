/**
 * WebDAV handlers for the Electron renderer.
 *
 * The Tauri side shipped 14 webdav_* commands but the renderer only exercises
 * four of them (set_config / upload / create_dir / delete via
 * src/services/publish/cloudUpload.ts and src/services/webdav/index.ts).
 * Implement those four against the `webdav` npm client + a JSON-backed config
 * store, and provide thin happy-path implementations for the read/sync surface
 * so any future renderer code paths still work without resurrecting the Rust
 * orchestrator.
 *
 * Config persists in userData/lumina-webdav-config.json.
 *
 * The handler module is testable in isolation: createWebDAVHandlers takes
 * { configPath, clientFactory } so we can drive it with a stub WebDAV client.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  createClient as defaultCreateClient,
  type FileStat,
  type WebDAVClient,
} from 'webdav'

export interface WebDAVConfig {
  server_url: string
  username: string
  password: string
  remote_base_path: string
  auto_sync: boolean
  sync_interval_secs: number
}

export interface RemoteEntry {
  path: string
  name: string
  is_dir: boolean
  size: number
  modified: number
  etag: string | null
  content_type: string | null
}

export interface LocalFileInfo {
  relative_path: string
  absolute_path: string
  is_dir: boolean
  size: number
  modified: number
}

export type WebDAVHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

export type ClientFactory = (config: WebDAVConfig) => WebDAVClient

export interface CreateWebDAVHandlersOptions {
  /** 配置文件路径,默认 userData/lumina-webdav-config.json */
  configPath: string
  /** 注入 client 工厂便于测试 */
  clientFactory?: ClientFactory
}

const DEFAULT_CONFIG: WebDAVConfig = {
  server_url: '',
  username: '',
  password: '',
  remote_base_path: '/',
  auto_sync: false,
  sync_interval_secs: 300,
}

export function createWebDAVHandlers(
  options: CreateWebDAVHandlersOptions,
): WebDAVHandlerMap {
  const factory = options.clientFactory ?? defaultClient
  let cachedConfig: WebDAVConfig | null = null

  function loadConfig(): WebDAVConfig {
    if (cachedConfig) return cachedConfig
    try {
      const raw = fs.readFileSync(options.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<WebDAVConfig>
      cachedConfig = { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      cachedConfig = { ...DEFAULT_CONFIG }
    }
    return cachedConfig
  }

  function saveConfig(config: WebDAVConfig): void {
    cachedConfig = { ...DEFAULT_CONFIG, ...config }
    try {
      fs.mkdirSync(path.dirname(options.configPath), { recursive: true })
      fs.writeFileSync(
        options.configPath,
        JSON.stringify(cachedConfig, null, 2),
        'utf-8',
      )
    } catch (err) {
      console.error('[webdav] save config failed', err)
    }
  }

  function pickConfig(args: Record<string, unknown>): WebDAVConfig {
    const argConfig = args.config as Partial<WebDAVConfig> | undefined
    if (argConfig?.server_url) {
      return { ...DEFAULT_CONFIG, ...argConfig }
    }
    return loadConfig()
  }

  function joinRemote(base: string, rel: string): string {
    const a = base.replace(/\/+$/, '')
    const b = rel.replace(/^\/+/, '')
    if (!b) return a || '/'
    return `${a}/${b}`
  }

  return {
    async webdav_set_config(args) {
      const cfg = (args.config as WebDAVConfig | undefined) ?? loadConfig()
      saveConfig(cfg)
      return null
    },

    async webdav_get_config() {
      return loadConfig()
    },

    async webdav_test_connection(args) {
      const cfg = pickConfig(args)
      try {
        const client = factory(cfg)
        await client.exists(cfg.remote_base_path || '/')
        return true
      } catch (err) {
        console.error('[webdav] test connection failed', err)
        return false
      }
    },

    async webdav_set_config_password(args) {
      const cfg = loadConfig()
      const next: WebDAVConfig = {
        ...cfg,
        password: typeof args.password === 'string' ? args.password : cfg.password,
      }
      saveConfig(next)
      return null
    },

    async webdav_list_remote(args) {
      const cfg = pickConfig(args)
      const remotePath = joinRemote(
        cfg.remote_base_path,
        typeof args.path === 'string' ? args.path : '',
      )
      const client = factory(cfg)
      const items = (await client.getDirectoryContents(remotePath)) as FileStat[]
      return items.map(toRemoteEntry)
    },

    async webdav_list_all_remote(args) {
      const cfg = pickConfig(args)
      const client = factory(cfg)
      const items = (await client.getDirectoryContents(
        cfg.remote_base_path || '/',
        { deep: true },
      )) as FileStat[]
      return items.map(toRemoteEntry)
    },

    async webdav_download(args) {
      const cfg = pickConfig(args)
      const remotePath = joinRemote(
        cfg.remote_base_path,
        String(args.remotePath ?? args.remote_path ?? ''),
      )
      const client = factory(cfg)
      const buf = (await client.getFileContents(remotePath)) as Buffer
      return buf.toString('utf-8')
    },

    async webdav_upload(args) {
      const cfg = pickConfig(args)
      const remotePath = joinRemote(
        cfg.remote_base_path,
        String(args.remotePath ?? args.remote_path ?? ''),
      )
      const content = String(args.content ?? '')
      const client = factory(cfg)
      // Ensure parent dir exists; ignore failure if already there.
      const parent = path.posix.dirname(remotePath)
      if (parent && parent !== '/' && parent !== '.') {
        try {
          await client.createDirectory(parent, { recursive: true })
        } catch {
          // best effort
        }
      }
      await client.putFileContents(remotePath, content, { overwrite: true })
      return null
    },

    async webdav_create_dir(args) {
      const cfg = pickConfig(args)
      const remotePath = joinRemote(
        cfg.remote_base_path,
        String(args.remotePath ?? args.remote_path ?? ''),
      )
      const client = factory(cfg)
      try {
        await client.createDirectory(remotePath, { recursive: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // 405 Method Not Allowed = already exists; treat as ok.
        if (!/already exists|405|409/i.test(msg)) throw err
      }
      return null
    },

    async webdav_delete(args) {
      const cfg = pickConfig(args)
      const remotePath = joinRemote(
        cfg.remote_base_path,
        String(args.remotePath ?? args.remote_path ?? ''),
      )
      const client = factory(cfg)
      await client.deleteFile(remotePath)
      return null
    },

    async webdav_scan_local(args) {
      const vaultPath = String(args.vaultPath ?? args.vault_path ?? '')
      if (!vaultPath) return []
      return scanLocalFiles(vaultPath)
    },

    // Sync planning surface — the renderer never calls these in the current
    // flow but ship a sensible empty plan so any latent caller does not crash.
    async webdav_compute_sync_plan() {
      return { items: [], upload_count: 0, download_count: 0, conflict_count: 0 }
    },
    async webdav_execute_sync() {
      return {
        success: true,
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        conflicts: 0,
        errors: [],
        duration_ms: 0,
      }
    },
    async webdav_quick_sync() {
      return {
        success: true,
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        conflicts: 0,
        errors: [],
        duration_ms: 0,
      }
    },
  }
}

function defaultClient(config: WebDAVConfig): WebDAVClient {
  return defaultCreateClient(config.server_url, {
    username: config.username,
    password: config.password,
  })
}

function toRemoteEntry(stat: FileStat): RemoteEntry {
  return {
    path: stat.filename,
    name: path.posix.basename(stat.filename),
    is_dir: stat.type === 'directory',
    size: typeof stat.size === 'number' ? stat.size : 0,
    modified: stat.lastmod ? Math.floor(new Date(stat.lastmod).getTime() / 1000) : 0,
    etag: typeof stat.etag === 'string' ? stat.etag : null,
    content_type: typeof stat.mime === 'string' ? stat.mime : null,
  }
}

function scanLocalFiles(vaultPath: string): LocalFileInfo[] {
  const out: LocalFileInfo[] = []
  walk(vaultPath, vaultPath, out)
  return out
}

function walk(root: string, dir: string, out: LocalFileInfo[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (
      entry.name === '.lumina' ||
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name.startsWith('.')
    ) {
      continue
    }
    const abs = path.join(dir, entry.name)
    const rel = path.relative(root, abs)
    if (entry.isDirectory()) {
      out.push({
        relative_path: rel,
        absolute_path: abs,
        is_dir: true,
        size: 0,
        modified: 0,
      })
      walk(root, abs, out)
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(abs)
        out.push({
          relative_path: rel,
          absolute_path: abs,
          is_dir: false,
          size: stat.size,
          modified: Math.floor(stat.mtimeMs / 1000),
        })
      } catch {
        // ignore
      }
    }
  }
}
