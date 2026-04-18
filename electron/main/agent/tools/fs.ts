/**
 * FS 工具集 — agent 可用的文件系统操作。
 *
 * 5 个工具:
 *  - read(path, offset?, limit?) → 文件内容(按行切片)
 *  - write(path, content)       → 创建父目录后写 utf-8
 *  - list(path, recursive?, maxDepth?) → 目录列表(跳过 .lumina 外的隐藏)
 *  - grep(path, pattern, glob?, contextLines?) → ripgrep 风格搜索(JS 正则,不起子进程)
 *  - stat(path) → { type, size, mtime_ms }
 *
 * read/write 默认不要审批;write/shell 审批策略由 runtime 设计。
 * 所有工具签 Zod schema 方便 AI SDK 生成参数 + input_schema 给 LLM 使用。
 * 失败抛 Error,runtime 转为 tool_call_end 的 error。
 *
 * 可选 allowedRoots: 限制所有路径必须落在这些 root 下(agent 不应该越权访问)。
 * 未设 allowedRoots 时不做路径限制(单测方便)。
 */

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import type { Tool, ToolRegistry } from '../tool-registry.js'

export interface FsToolsOptions {
  /** 允许访问的根目录 — 每个工具参数的 path 必须落在其中之一下 */
  allowedRoots?: string[]
  /** 单文件读取上限(bytes),默认 2 MB */
  readMaxBytes?: number
  /** grep 单次最大命中数,默认 200 */
  grepMaxMatches?: number
  /** list 默认 maxDepth */
  listDefaultMaxDepth?: number
}

const DEFAULT_READ_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_GREP_MAX_MATCHES = 200
const DEFAULT_LIST_MAX_DEPTH = 4

const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'target',
  'out',
  'dist',
  '.next',
  '.vite',
  '.tmp',
])

// Hidden-name rule: leading dot is hidden, but .lumina is allowed (vault data dir)
function isHidden(name: string): boolean {
  return name.startsWith('.') && name !== '.lumina'
}

function normalizeForCheck(p: string): string {
  return path.resolve(p)
}

function assertAllowedPath(rootsOrUndef: string[] | undefined, targetPath: string): void {
  if (!rootsOrUndef || rootsOrUndef.length === 0) return
  const resolved = normalizeForCheck(targetPath)
  const allowed = rootsOrUndef.map((r) => normalizeForCheck(r))
  for (const root of allowed) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return
  }
  throw new Error(
    `Path outside of allowed roots: ${targetPath} (allowed: ${allowed.join(', ')})`,
  )
}

// ── read ─────────────────────────────────────────────────────────────────

const readSchema = z.object({
  path: z.string().min(1, 'path required'),
  /** 从第 offset 行开始(0-indexed) */
  offset: z.number().int().nonnegative().optional(),
  /** 最多返回 limit 行 */
  limit: z.number().int().positive().optional(),
})

export function makeReadTool(options: FsToolsOptions = {}): Tool {
  const maxBytes = options.readMaxBytes ?? DEFAULT_READ_MAX_BYTES
  return {
    name: 'fs_read',
    description:
      'Read a UTF-8 text file. Supports optional line range via offset + limit (0-indexed).',
    input_schema: z.toJSONSchema(readSchema) as Record<string, unknown>,
    async execute(input, signal) {
      const { path: targetPath, offset, limit } = readSchema.parse(input)
      assertAllowedPath(options.allowedRoots, targetPath)
      if (signal.aborted) throw new Error('aborted')
      const stat = await fs.stat(targetPath)
      if (stat.size > maxBytes) {
        throw new Error(
          `File too large (${stat.size} bytes > ${maxBytes}); use offset+limit to page`,
        )
      }
      const content = await fs.readFile(targetPath, 'utf-8')
      if (offset === undefined && limit === undefined) return content
      const lines = content.split('\n')
      const start = offset ?? 0
      const end = limit !== undefined ? start + limit : lines.length
      return lines.slice(start, end).join('\n')
    },
  }
}

// ── write ────────────────────────────────────────────────────────────────

const writeSchema = z.object({
  path: z.string().min(1, 'path required'),
  content: z.string(),
})

export function makeWriteTool(options: FsToolsOptions = {}): Tool {
  return {
    name: 'fs_write',
    description: 'Write UTF-8 text content to a file; creates parent directories as needed.',
    input_schema: z.toJSONSchema(writeSchema) as Record<string, unknown>,
    requires_approval: true,
    async execute(input, signal) {
      const { path: targetPath, content } = writeSchema.parse(input)
      assertAllowedPath(options.allowedRoots, targetPath)
      if (signal.aborted) throw new Error('aborted')
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, content, 'utf-8')
      return `wrote ${content.length} chars to ${targetPath}`
    },
  }
}

// ── list ─────────────────────────────────────────────────────────────────

const listSchema = z.object({
  path: z.string().min(1, 'path required'),
  recursive: z.boolean().optional(),
  max_depth: z.number().int().positive().optional(),
})

interface ListEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

async function walkDir(
  rootAbs: string,
  currentAbs: string,
  currentDepth: number,
  maxDepth: number,
  out: ListEntry[],
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return
  const entries = await fs.readdir(currentAbs, { withFileTypes: true })
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    if (entry.isDirectory() && IGNORED_DIR_NAMES.has(entry.name)) continue
    const abs = path.join(currentAbs, entry.name)
    const rel = path.relative(rootAbs, abs)
    if (entry.isDirectory()) {
      out.push({ name: entry.name, path: rel, type: 'dir' })
      if (currentDepth + 1 < maxDepth) {
        await walkDir(rootAbs, abs, currentDepth + 1, maxDepth, out, signal)
      }
    } else if (entry.isFile()) {
      let size: number | undefined
      try {
        const st = await fs.stat(abs)
        size = st.size
      } catch {
        // ignore
      }
      out.push({ name: entry.name, path: rel, type: 'file', size })
    }
  }
}

export function makeListTool(options: FsToolsOptions = {}): Tool {
  const defaultMaxDepth = options.listDefaultMaxDepth ?? DEFAULT_LIST_MAX_DEPTH
  return {
    name: 'fs_list',
    description:
      'List directory entries. Set recursive=true to walk subdirectories (up to max_depth, default 4). Hidden dirs (except .lumina) and node_modules/target/out/dist/.git are skipped.',
    input_schema: z.toJSONSchema(listSchema) as Record<string, unknown>,
    async execute(input, signal) {
      const parsed = listSchema.parse(input)
      assertAllowedPath(options.allowedRoots, parsed.path)
      const recursive = parsed.recursive ?? false
      const maxDepth = parsed.max_depth ?? defaultMaxDepth

      const rootAbs = path.resolve(parsed.path)
      const out: ListEntry[] = []
      if (recursive) {
        await walkDir(rootAbs, rootAbs, 0, maxDepth, out, signal)
      } else {
        const entries = await fs.readdir(rootAbs, { withFileTypes: true })
        for (const entry of entries) {
          if (isHidden(entry.name)) continue
          if (entry.isDirectory()) {
            out.push({ name: entry.name, path: entry.name, type: 'dir' })
          } else if (entry.isFile()) {
            try {
              const st = await fs.stat(path.join(rootAbs, entry.name))
              out.push({
                name: entry.name,
                path: entry.name,
                type: 'file',
                size: st.size,
              })
            } catch {
              out.push({ name: entry.name, path: entry.name, type: 'file' })
            }
          }
        }
      }
      return JSON.stringify(out, null, 2)
    },
  }
}

// ── grep ─────────────────────────────────────────────────────────────────

const grepSchema = z.object({
  path: z.string().min(1, 'path required'),
  pattern: z.string().min(1, 'pattern required'),
  glob: z.string().optional(),
  /** 正则 flags,如 'i' 忽略大小写 */
  flags: z.string().optional(),
  /** 每个命中前后返回几行上下文 */
  context_lines: z.number().int().nonnegative().optional(),
  max_matches: z.number().int().positive().optional(),
})

interface GrepMatch {
  file: string
  line: number
  text: string
  context_before?: string[]
  context_after?: string[]
}

function matchesGlob(name: string, glob: string | undefined): boolean {
  if (!glob) return true
  // Very small glob matcher: '*' → '[^/]*', '**' → '.*', '?' → '.'
  const regexSrc =
    '^' +
    glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '@@DBLSTAR@@')
      .replace(/\*/g, '[^/]*')
      .replace(/@@DBLSTAR@@/g, '.*')
      .replace(/\?/g, '.') +
    '$'
  return new RegExp(regexSrc).test(name)
}

async function collectFiles(
  rootAbs: string,
  glob: string | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    if (signal.aborted) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (isHidden(entry.name)) continue
      if (entry.isDirectory() && IGNORED_DIR_NAMES.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile() && matchesGlob(entry.name, glob)) {
        out.push(abs)
      }
    }
  }
  const stat = await fs.stat(rootAbs)
  if (stat.isFile()) {
    if (matchesGlob(path.basename(rootAbs), glob)) out.push(rootAbs)
  } else {
    await walk(rootAbs)
  }
  return out
}

export function makeGrepTool(options: FsToolsOptions = {}): Tool {
  const defaultMax = options.grepMaxMatches ?? DEFAULT_GREP_MAX_MATCHES
  return {
    name: 'fs_grep',
    description:
      'Search for a regex pattern across files. path can be a file or a directory. glob filters filenames; flags are JS regex flags (e.g. "i"); context_lines adds before/after context.',
    input_schema: z.toJSONSchema(grepSchema) as Record<string, unknown>,
    async execute(input, signal) {
      const parsed = grepSchema.parse(input)
      assertAllowedPath(options.allowedRoots, parsed.path)
      const rootAbs = path.resolve(parsed.path)
      const files = await collectFiles(rootAbs, parsed.glob, signal)
      const regex = new RegExp(parsed.pattern, parsed.flags)
      const maxMatches = parsed.max_matches ?? defaultMax
      const ctx = parsed.context_lines ?? 0
      const matches: GrepMatch[] = []
      for (const file of files) {
        if (signal.aborted) break
        if (matches.length >= maxMatches) break
        let content: string
        try {
          content = await fs.readFile(file, 'utf-8')
        } catch {
          continue
        }
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxMatches) break
          if (regex.test(lines[i])) {
            const match: GrepMatch = {
              file,
              line: i + 1,
              text: lines[i],
            }
            if (ctx > 0) {
              match.context_before = lines.slice(Math.max(0, i - ctx), i)
              match.context_after = lines.slice(i + 1, Math.min(lines.length, i + 1 + ctx))
            }
            matches.push(match)
          }
        }
      }
      return JSON.stringify(
        { total_matches: matches.length, truncated: matches.length >= maxMatches, matches },
        null,
        2,
      )
    },
  }
}

// ── stat ─────────────────────────────────────────────────────────────────

const statSchema = z.object({
  path: z.string().min(1, 'path required'),
})

export function makeStatTool(options: FsToolsOptions = {}): Tool {
  return {
    name: 'fs_stat',
    description: 'Return { type: file|dir, size, mtime_ms, exists } for a path.',
    input_schema: z.toJSONSchema(statSchema) as Record<string, unknown>,
    async execute(input) {
      const { path: targetPath } = statSchema.parse(input)
      assertAllowedPath(options.allowedRoots, targetPath)
      try {
        const st = await fs.stat(targetPath)
        return JSON.stringify({
          exists: true,
          type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
          size: st.size,
          mtime_ms: Math.round(st.mtimeMs),
        })
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e.code === 'ENOENT') {
          return JSON.stringify({ exists: false })
        }
        throw err
      }
    },
  }
}

// ── registration helper ─────────────────────────────────────────────────

export function registerFsTools(
  registry: ToolRegistry,
  options: FsToolsOptions = {},
): void {
  registry.register(makeReadTool(options))
  registry.register(makeWriteTool(options))
  registry.register(makeListTool(options))
  registry.register(makeGrepTool(options))
  registry.register(makeStatTool(options))
}

// Keep fsSync import alive (avoid tree-shaking); future tools may use it.
void fsSync
