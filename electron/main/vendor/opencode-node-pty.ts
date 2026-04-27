import { createRequire } from 'node:module'
import path from 'path'
import { app } from 'electron'

const require = createRequire(import.meta.url)
const platformPkg = `node-pty-${process.platform}-${process.arch}`

// Resolve where the platform-specific @lydell/node-pty package lives on disk.
//
// In dev (`npm run dev`): opencode is checked out at `thirdparty/opencode/`
// next to the project root. `bun install` placed the platform package under
// `thirdparty/opencode/node_modules/.bun/node_modules/@lydell/...`.
//
// In a packaged build: that path doesn't exist — the production app's CWD is
// typically `/` on macOS — so the vendor was crashing every install at
// startup with `Failed to load opencode node-pty package from /thirdparty/...`.
// We now copy the platform package into `<app>/Contents/Resources/opencode-
// node-pty/` via `electron-builder.yml`'s `extraResources` and resolve to it
// via `process.resourcesPath` here.
function resolvePackageEntry(): string {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'opencode-node-pty',
      platformPkg,
      'lib',
      'index.js',
    )
  }
  return path.resolve(
    process.cwd(),
    'thirdparty',
    'opencode',
    'node_modules',
    '.bun',
    'node_modules',
    '@lydell',
    platformPkg,
    'lib',
    'index.js',
  )
}

const packageEntry = resolvePackageEntry()

let nodePty: Record<string, unknown>

try {
  nodePty = require(packageEntry) as Record<string, unknown>
} catch (error) {
  const wrapped = new Error(
    `Failed to load opencode node-pty package from ${packageEntry}`,
  )
  ;(wrapped as Error & { cause?: unknown }).cause = error
  throw wrapped
}

export const spawn = nodePty.spawn as (...args: unknown[]) => unknown
export const fork = nodePty.fork as (...args: unknown[]) => unknown
export const createTerminal = nodePty.createTerminal as (
  ...args: unknown[]
) => unknown
export const open = nodePty.open as (...args: unknown[]) => unknown
export const native = nodePty.native

export default nodePty
