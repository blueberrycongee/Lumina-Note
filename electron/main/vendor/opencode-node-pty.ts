import { createRequire } from 'node:module'
import path from 'path'

const require = createRequire(import.meta.url)
const packageEntry = path.resolve(
  process.cwd(),
  'thirdparty',
  'opencode',
  'node_modules',
  '.bun',
  'node_modules',
  '@lydell',
  `node-pty-${process.platform}-${process.arch}`,
  'lib',
  'index.js',
)

let nodePty: Record<string, unknown>

try {
  // Load the platform package from opencode's own Bun workspace so its native
  // module keeps resolving relative to the original package layout.
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
