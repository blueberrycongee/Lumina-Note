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
  /** 起始行号(1-indexed,对齐 Codex 的 read_file) */
  offset: z.number().int().positive().optional(),
  /** 最多返回 limit 行 */
  limit: z.number().int().positive().optional(),
})

const READ_DESCRIPTION =
  'Read a UTF-8 text file. Returns each line prefixed with "L{n}: " (1-indexed) so later apply_patch calls can reference exact line numbers. offset (1-indexed) + limit let you page large files.'

export function makeReadTool(options: FsToolsOptions = {}): Tool {
  const maxBytes = options.readMaxBytes ?? DEFAULT_READ_MAX_BYTES
  return {
    name: 'fs_read',
    description: READ_DESCRIPTION,
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
      const lines = content.split('\n')
      const totalLines = lines.length
      const startIndex = (offset ?? 1) - 1
      if (startIndex >= totalLines) {
        throw new Error('offset exceeds file length')
      }
      const endIndex = limit !== undefined ? Math.min(startIndex + limit, totalLines) : totalLines
      const out: string[] = []
      for (let i = startIndex; i < endIndex; i++) {
        out.push(`L${i + 1}: ${lines[i]}`)
      }
      return out.join('\n')
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

// ── list_dir ────────────────────────────────────────────────────────────
// Shape matches OpenAI Codex's list_dir tool:
//   { dir_path, offset (1-indexed, default 1), limit (default 25),
//     depth (default 2, ≥ 1) }
// Returns a text block: "Absolute path: {dir_path}\n" + indented entries
// (2 spaces per level, trailing "/" for directories), with a
// "More than {capped_limit} entries found" sentinel when truncated.

const LIST_DEFAULT_OFFSET = 1
const LIST_DEFAULT_LIMIT = 25
const LIST_DEFAULT_DEPTH = 2
const INDENT_SPACES = 2

const listSchema = z.object({
  dir_path: z.string().min(1, 'dir_path required'),
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  depth: z.number().int().positive().optional(),
})

interface ListEntry {
  /** Relative path from dir_path, used for sorting and indent depth. */
  relativePath: string
  /** Final path segment, appended to the indent. */
  name: string
  isDir: boolean
}

async function collectEntries(
  rootAbs: string,
  relPrefix: string,
  depth: number,
  signal: AbortSignal,
  out: ListEntry[],
): Promise<void> {
  if (signal.aborted) return
  if (depth === 0) return
  const currentAbs = relPrefix ? path.join(rootAbs, relPrefix) : rootAbs
  let entries
  try {
    entries = await fs.readdir(currentAbs, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    if (entry.isDirectory() && IGNORED_DIR_NAMES.has(entry.name)) continue
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    const isDir = entry.isDirectory()
    out.push({ relativePath: childRel, name: entry.name, isDir })
    if (isDir) {
      await collectEntries(rootAbs, childRel, depth - 1, signal, out)
    }
  }
}

const LIST_DIR_DESCRIPTION =
  'Lists entries in a local directory with 1-indexed entry numbers and simple type labels. Subdirectory entries are indented by 2 spaces per level; directories end with "/". offset/limit/depth are all 1-indexed defaults. Hidden dirs (except .lumina) and node_modules / target / out / dist / .git are skipped.'

export function makeListTool(options: FsToolsOptions = {}): Tool {
  const defaultDepth = options.listDefaultMaxDepth ?? LIST_DEFAULT_DEPTH
  return {
    name: 'list_dir',
    description: LIST_DIR_DESCRIPTION,
    input_schema: z.toJSONSchema(listSchema) as Record<string, unknown>,
    async execute(input, signal) {
      const parsed = listSchema.parse(input)
      const offset = parsed.offset ?? LIST_DEFAULT_OFFSET
      const limit = parsed.limit ?? LIST_DEFAULT_LIMIT
      const depth = parsed.depth ?? defaultDepth

      if (!path.isAbsolute(parsed.dir_path)) {
        throw new Error('dir_path must be an absolute path')
      }
      assertAllowedPath(options.allowedRoots, parsed.dir_path)
      if (signal.aborted) throw new Error('aborted')

      const rootAbs = path.resolve(parsed.dir_path)
      const entries: ListEntry[] = []
      await collectEntries(rootAbs, '', depth, signal, entries)

      entries.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0))

      const output: string[] = [`Absolute path: ${rootAbs}`]
      if (entries.length === 0) return output.join('\n')

      const startIndex = offset - 1
      if (startIndex >= entries.length) {
        throw new Error('offset exceeds directory entry count')
      }
      const remaining = entries.length - startIndex
      const cappedLimit = Math.min(limit, remaining)
      const endIndex = startIndex + cappedLimit
      const selected = entries.slice(startIndex, endIndex)
      for (const entry of selected) {
        const depthLevel = entry.relativePath.split('/').length - 1
        const indent = ' '.repeat(depthLevel * INDENT_SPACES)
        output.push(`${indent}${entry.name}${entry.isDir ? '/' : ''}`)
      }
      if (endIndex < entries.length) {
        output.push(`More than ${cappedLimit} entries found`)
      }
      return output.join('\n')
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
