/**
 * apply_patch — file edit tool aligned with OpenAI Codex.
 *
 * Accepts the Codex patch envelope:
 *
 *   *** Begin Patch
 *   [ one or more file sections ]
 *   *** End Patch
 *
 * File sections:
 *   *** Add File: <rel/path>           — every following `+ ` line is the
 *                                         initial content.
 *   *** Delete File: <rel/path>        — removes an existing file.
 *   *** Update File: <rel/path>        — in-place edit; may be followed by
 *       *** Move to: <new rel/path>     — optional rename.
 *     Then one or more `@@` hunks where each line starts with
 *     " " (context), "-" (removed), or "+" (added). The trailing
 *     `*** End of File` marker pins a hunk to EOF.
 *
 * The tool's description must match Codex's wording because frontier models
 * were trained against it — swapping synonyms visibly degrades their ability
 * to emit correct patches.
 *
 * All paths are relative to `options.rootDir` (or the injected allowedRoots[0]
 * when no explicit root is given). Absolute paths are rejected.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import type { Tool, ToolRegistry } from '../tool-registry.js'

// ── Parser ────────────────────────────────────────────────────────────────

const BEGIN_PATCH = '*** Begin Patch'
const END_PATCH = '*** End Patch'
const ADD_FILE = '*** Add File: '
const DELETE_FILE = '*** Delete File: '
const UPDATE_FILE = '*** Update File: '
const MOVE_TO = '*** Move to: '
const EOF_MARKER = '*** End of File'
const CHANGE_CONTEXT_PREFIX = '@@'

export interface UpdateChunk {
  /** `@@ …` header context line, if any */
  changeContext: string | null
  oldLines: string[]
  newLines: string[]
  isEndOfFile: boolean
}

export type Hunk =
  | { type: 'add'; path: string; contents: string }
  | { type: 'delete'; path: string }
  | { type: 'update'; path: string; movePath: string | null; chunks: UpdateChunk[] }

export class ApplyPatchParseError extends Error {
  constructor(
    message: string,
    public lineNumber?: number,
  ) {
    super(lineNumber !== undefined ? `line ${lineNumber}: ${message}` : message)
    this.name = 'ApplyPatchParseError'
  }
}

interface Cursor {
  lines: string[]
  idx: number
}

function peek(c: Cursor): string | null {
  return c.idx < c.lines.length ? c.lines[c.idx] : null
}

function advance(c: Cursor): string | null {
  const line = peek(c)
  if (line !== null) c.idx++
  return line
}

export function parsePatch(text: string): Hunk[] {
  const rawLines = text.split('\n')
  // Trim leading blank lines so the Begin marker can tolerate whitespace.
  while (rawLines.length > 0 && rawLines[0].trim() === '') rawLines.shift()
  if (rawLines.length === 0) {
    throw new ApplyPatchParseError('patch is empty')
  }
  if (rawLines[0].trim() !== BEGIN_PATCH) {
    throw new ApplyPatchParseError(`patch must start with '${BEGIN_PATCH}'`, 1)
  }
  // Drop a trailing blank line that results from text-ending-in-\n.
  if (rawLines[rawLines.length - 1] === '') rawLines.pop()
  const c: Cursor = { lines: rawLines, idx: 1 }

  const hunks: Hunk[] = []
  while (c.idx < c.lines.length) {
    const line = peek(c)
    if (line === null) break
    const trimmed = line.trim()
    if (trimmed === END_PATCH) {
      advance(c)
      if (c.idx !== c.lines.length) {
        // Allow trailing blank lines after End Patch.
        while (c.idx < c.lines.length) {
          const rest = advance(c)!
          if (rest.trim() !== '') {
            throw new ApplyPatchParseError(`unexpected content after '${END_PATCH}'`, c.idx)
          }
        }
      }
      return hunks
    }
    if (trimmed.startsWith(ADD_FILE)) {
      advance(c)
      const addPath = trimmed.slice(ADD_FILE.length).trim()
      const contents: string[] = []
      while (c.idx < c.lines.length) {
        const next = peek(c)
        if (next === null) break
        const nextTrimmed = next.trim()
        if (
          nextTrimmed === END_PATCH ||
          nextTrimmed.startsWith(ADD_FILE) ||
          nextTrimmed.startsWith(DELETE_FILE) ||
          nextTrimmed.startsWith(UPDATE_FILE)
        ) {
          break
        }
        if (!next.startsWith('+')) {
          throw new ApplyPatchParseError(
            `Add File hunk expects lines starting with '+', got: ${JSON.stringify(next)}`,
            c.idx + 1,
          )
        }
        contents.push(next.slice(1))
        advance(c)
      }
      hunks.push({ type: 'add', path: addPath, contents: contents.join('\n') })
      continue
    }
    if (trimmed.startsWith(DELETE_FILE)) {
      advance(c)
      hunks.push({ type: 'delete', path: trimmed.slice(DELETE_FILE.length).trim() })
      continue
    }
    if (trimmed.startsWith(UPDATE_FILE)) {
      advance(c)
      const updatePath = trimmed.slice(UPDATE_FILE.length).trim()
      let movePath: string | null = null
      const afterMove = peek(c)
      if (afterMove !== null && afterMove.trim().startsWith(MOVE_TO)) {
        movePath = afterMove.trim().slice(MOVE_TO.length).trim()
        advance(c)
      }
      const chunks: UpdateChunk[] = []
      while (c.idx < c.lines.length) {
        const next = peek(c)
        if (next === null) break
        const nextTrimmed = next.trim()
        if (
          nextTrimmed === END_PATCH ||
          nextTrimmed.startsWith(ADD_FILE) ||
          nextTrimmed.startsWith(DELETE_FILE) ||
          nextTrimmed.startsWith(UPDATE_FILE)
        ) {
          break
        }
        const chunk = parseUpdateChunk(c)
        chunks.push(chunk)
      }
      if (chunks.length === 0) {
        throw new ApplyPatchParseError(
          `Update File '${updatePath}' has no hunks`,
          c.idx + 1,
        )
      }
      hunks.push({ type: 'update', path: updatePath, movePath, chunks })
      continue
    }
    if (trimmed === '') {
      advance(c)
      continue
    }
    throw new ApplyPatchParseError(
      `unexpected line inside patch: ${JSON.stringify(line)}`,
      c.idx + 1,
    )
  }
  throw new ApplyPatchParseError(`patch missing '${END_PATCH}' terminator`)
}

function parseUpdateChunk(c: Cursor): UpdateChunk {
  let changeContext: string | null = null
  const first = peek(c)
  if (first !== null) {
    const t = first.trim()
    if (t === CHANGE_CONTEXT_PREFIX) {
      advance(c)
    } else if (t.startsWith(CHANGE_CONTEXT_PREFIX + ' ')) {
      changeContext = t.slice(CHANGE_CONTEXT_PREFIX.length + 1)
      advance(c)
    } else if (t === CHANGE_CONTEXT_PREFIX + ' ') {
      advance(c)
    }
  }

  const oldLines: string[] = []
  const newLines: string[] = []
  let isEndOfFile = false

  while (c.idx < c.lines.length) {
    const next = peek(c)
    if (next === null) break
    const nextTrimmed = next.trim()
    if (
      nextTrimmed === END_PATCH ||
      nextTrimmed.startsWith(ADD_FILE) ||
      nextTrimmed.startsWith(DELETE_FILE) ||
      nextTrimmed.startsWith(UPDATE_FILE) ||
      nextTrimmed === CHANGE_CONTEXT_PREFIX ||
      nextTrimmed.startsWith(CHANGE_CONTEXT_PREFIX + ' ')
    ) {
      break
    }
    if (nextTrimmed === EOF_MARKER) {
      isEndOfFile = true
      advance(c)
      break
    }
    advance(c)
    if (next.length === 0) {
      oldLines.push('')
      newLines.push('')
      continue
    }
    const marker = next[0]
    const rest = next.slice(1)
    if (marker === ' ') {
      oldLines.push(rest)
      newLines.push(rest)
    } else if (marker === '-') {
      oldLines.push(rest)
    } else if (marker === '+') {
      newLines.push(rest)
    } else {
      throw new ApplyPatchParseError(
        `hunk line must start with ' ', '-', or '+', got: ${JSON.stringify(next)}`,
        c.idx,
      )
    }
  }
  if (oldLines.length === 0 && newLines.length === 0) {
    throw new ApplyPatchParseError('Update hunk has no lines', c.idx + 1)
  }
  return { changeContext, oldLines, newLines, isEndOfFile }
}

// ── Fuzzy line matcher (ports seek_sequence.rs) ───────────────────────────

function normalizeUnicode(s: string): string {
  const trimmed = s.trim()
  let out = ''
  for (const ch of trimmed) {
    const code = ch.codePointAt(0)!
    if (
      code === 0x2010 ||
      code === 0x2011 ||
      code === 0x2012 ||
      code === 0x2013 ||
      code === 0x2014 ||
      code === 0x2015 ||
      code === 0x2212
    ) {
      out += '-'
    } else if (code === 0x2018 || code === 0x2019 || code === 0x201a || code === 0x201b) {
      out += "'"
    } else if (code === 0x201c || code === 0x201d || code === 0x201e || code === 0x201f) {
      out += '"'
    } else if (
      code === 0x00a0 ||
      (code >= 0x2002 && code <= 0x200a) ||
      code === 0x202f ||
      code === 0x205f ||
      code === 0x3000
    ) {
      out += ' '
    } else {
      out += ch
    }
  }
  return out
}

export function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  if (pattern.length === 0) return start
  if (pattern.length > lines.length) return null
  const searchStart =
    eof && lines.length >= pattern.length ? lines.length - pattern.length : start

  const matchers: Array<(a: string, b: string) => boolean> = [
    (a, b) => a === b,
    (a, b) => a.replace(/\s+$/, '') === b.replace(/\s+$/, ''),
    (a, b) => a.trim() === b.trim(),
    (a, b) => normalizeUnicode(a) === normalizeUnicode(b),
  ]

  for (const match of matchers) {
    for (let i = searchStart; i <= lines.length - pattern.length; i++) {
      let ok = true
      for (let p = 0; p < pattern.length; p++) {
        if (!match(lines[i + p], pattern[p])) {
          ok = false
          break
        }
      }
      if (ok) return i
    }
  }
  return null
}

// ── Applier ───────────────────────────────────────────────────────────────

export interface ApplyPatchOptions {
  /** Root directory all patch paths must be resolved against. */
  rootDir: string
}

export interface ApplyPatchResult {
  /** One human line per hunk, suitable for returning to the model. */
  summary: string
}

interface Snapshot {
  path: string
  /** null means the file did not exist before the patch. */
  previous: string | null
}

export async function applyPatch(
  patchText: string,
  options: ApplyPatchOptions,
): Promise<ApplyPatchResult> {
  const hunks = parsePatch(patchText)
  const rootAbs = path.resolve(options.rootDir)

  function resolveInsideRoot(rel: string): string {
    if (path.isAbsolute(rel)) {
      throw new Error(
        `apply_patch only accepts relative paths; got absolute path '${rel}'`,
      )
    }
    const abs = path.resolve(rootAbs, rel)
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
      throw new Error(
        `path '${rel}' resolves outside the allowed root; apply_patch refuses to escape via '..'`,
      )
    }
    return abs
  }

  const snapshots: Snapshot[] = []
  const summary: string[] = []

  try {
    for (const hunk of hunks) {
      if (hunk.type === 'add') {
        const abs = resolveInsideRoot(hunk.path)
        snapshots.push({ path: abs, previous: await readOrNull(abs) })
        if ((await readOrNull(abs)) !== null) {
          throw new Error(`Add File: '${hunk.path}' already exists`)
        }
        await fs.mkdir(path.dirname(abs), { recursive: true })
        await fs.writeFile(abs, hunk.contents, 'utf-8')
        summary.push(`A  ${hunk.path}`)
        continue
      }
      if (hunk.type === 'delete') {
        const abs = resolveInsideRoot(hunk.path)
        const existing = await readOrNull(abs)
        if (existing === null) {
          throw new Error(`Delete File: '${hunk.path}' not found`)
        }
        snapshots.push({ path: abs, previous: existing })
        await fs.rm(abs)
        summary.push(`D  ${hunk.path}`)
        continue
      }
      // update
      const srcAbs = resolveInsideRoot(hunk.path)
      const existing = await readOrNull(srcAbs)
      if (existing === null) {
        throw new Error(`Update File: '${hunk.path}' not found`)
      }
      snapshots.push({ path: srcAbs, previous: existing })

      const destAbs = hunk.movePath ? resolveInsideRoot(hunk.movePath) : srcAbs
      if (destAbs !== srcAbs) {
        const destExisting = await readOrNull(destAbs)
        if (destExisting !== null) {
          throw new Error(
            `Move to: '${hunk.movePath}' already exists`,
          )
        }
        snapshots.push({ path: destAbs, previous: null })
      }

      const updated = applyChunksToFile(existing, hunk.chunks, hunk.path)
      if (destAbs !== srcAbs) {
        await fs.rm(srcAbs)
        await fs.mkdir(path.dirname(destAbs), { recursive: true })
        await fs.writeFile(destAbs, updated, 'utf-8')
        summary.push(`R  ${hunk.path} -> ${hunk.movePath}`)
      } else {
        await fs.writeFile(srcAbs, updated, 'utf-8')
        summary.push(`M  ${hunk.path}`)
      }
    }
  } catch (err) {
    await rollback(snapshots)
    throw err
  }

  return { summary: summary.join('\n') }
}

async function readOrNull(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function rollback(snapshots: Snapshot[]): Promise<void> {
  // Restore in reverse order so that move/rename pairs unwind cleanly.
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const { path: abs, previous } = snapshots[i]
    try {
      if (previous === null) {
        await fs.rm(abs, { force: true })
      } else {
        await fs.mkdir(path.dirname(abs), { recursive: true })
        await fs.writeFile(abs, previous, 'utf-8')
      }
    } catch {
      // best-effort rollback; swallow
    }
  }
}

function applyChunksToFile(
  existing: string,
  chunks: UpdateChunk[],
  relPath: string,
): string {
  const lines = existing.split('\n')
  const trailingNewline = existing.endsWith('\n')
  // Drop the empty tail that split produces when text ends with \n so line
  // indexing stays intuitive; we'll restore it on join.
  if (trailingNewline && lines[lines.length - 1] === '') lines.pop()

  let cursor = 0
  let chunkIdx = 0
  for (const chunk of chunks) {
    chunkIdx++
    const contextSearchStart = chunk.changeContext
      ? findContext(lines, chunk.changeContext, cursor)
      : cursor
    if (contextSearchStart === null) {
      throw new Error(
        `Update File: '${relPath}' hunk ${chunkIdx}: context '@@ ${chunk.changeContext}' not found after line ${cursor + 1}`,
      )
    }
    const hit = seekSequence(lines, chunk.oldLines, contextSearchStart, chunk.isEndOfFile)
    if (hit === null) {
      const preview =
        chunk.oldLines.slice(0, 3).join('\n') + (chunk.oldLines.length > 3 ? '\n…' : '')
      throw new Error(
        `Update File: '${relPath}' hunk ${chunkIdx}: could not locate old lines starting near line ${contextSearchStart + 1}:\n${preview}`,
      )
    }
    lines.splice(hit, chunk.oldLines.length, ...chunk.newLines)
    cursor = hit + chunk.newLines.length
  }
  const joined = lines.join('\n')
  return trailingNewline ? joined + '\n' : joined
}

function findContext(lines: string[], context: string, start: number): number | null {
  const needle = context.trim()
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === needle) return i + 1
    if (normalizeUnicode(lines[i]) === normalizeUnicode(needle)) return i + 1
  }
  return null
}

// ── Tool binding ──────────────────────────────────────────────────────────

export interface ApplyPatchToolOptions {
  /**
   * Root dir all patch paths are resolved against. Accepts either a static
   * string (tests, wiki synthesizer) or a supplier that the tool queries at
   * execute time (production — the active vault path changes between
   * sessions).
   */
  rootDir: string | (() => string | null | undefined)
}

const applyPatchSchema = z.object({
  input: z.string().min(1, 'input (full apply_patch envelope) is required'),
})

const APPLY_PATCH_DESCRIPTION = `Use the \`apply_patch\` tool to edit files.
Your patch language is a stripped‑down, file‑oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high‑level envelope:

*** Begin Patch
[ one or more file sections ]
*** End Patch

Within that envelope, you get a sequence of file operations.
You MUST include a header to specify the action you are taking.
Each operation starts with one of three headers:

*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).
*** Delete File: <path> - remove an existing file. Nothing follows.
*** Update File: <path> - patch an existing file in place (optionally with a rename).

May be immediately followed by *** Move to: <new path> if you want to rename the file.
Then one or more "hunks", each introduced by @@ (optionally followed by a hunk header).
Within a hunk each line starts with:

For instructions on [context_before] and [context_after]:
- By default, show 3 lines of code immediately above and 3 lines immediately below each change. If a change is within 3 lines of a previous change, do NOT duplicate the first change's [context_after] lines in the second change's [context_before] lines.
- If 3 lines of context is insufficient to uniquely identify the snippet of code within the file, use the @@ operator to indicate the class or function to which the snippet belongs.

The full grammar definition is below:
Patch := Begin { FileOp } End
Begin := "*** Begin Patch" NEWLINE
End := "*** End Patch" NEWLINE
FileOp := AddFile | DeleteFile | UpdateFile
AddFile := "*** Add File: " path NEWLINE { "+" line NEWLINE }
DeleteFile := "*** Delete File: " path NEWLINE
UpdateFile := "*** Update File: " path NEWLINE [ MoveTo ] { Hunk }
MoveTo := "*** Move to: " newPath NEWLINE
Hunk := "@@" [ header ] NEWLINE { HunkLine } [ "*** End of File" NEWLINE ]
HunkLine := (" " | "-" | "+") text NEWLINE

A full patch can combine several operations:

*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch

It is important to remember:
- You must include a header with your intended action (Add/Delete/Update)
- You must prefix new lines with \`+\` even when creating a new file
- File references can only be relative, NEVER ABSOLUTE.`

export function makeApplyPatchTool(options: ApplyPatchToolOptions): Tool {
  if (!options.rootDir) {
    throw new Error('apply_patch tool requires a rootDir')
  }
  const resolveRoot = (): string => {
    const raw =
      typeof options.rootDir === 'function' ? options.rootDir() : options.rootDir
    if (!raw) {
      throw new Error(
        'apply_patch: no root directory is set for this session (open a workspace first)',
      )
    }
    return raw
  }
  return {
    name: 'apply_patch',
    description: APPLY_PATCH_DESCRIPTION,
    input_schema: z.toJSONSchema(applyPatchSchema) as Record<string, unknown>,
    requires_approval: true,
    async execute(input, signal) {
      const { input: patchText } = applyPatchSchema.parse(input)
      if (signal.aborted) throw new Error('aborted')
      const result = await applyPatch(patchText, { rootDir: resolveRoot() })
      return result.summary || 'no-op patch (empty)'
    },
  }
}

export function registerApplyPatchTool(
  registry: ToolRegistry,
  options: ApplyPatchToolOptions,
): void {
  registry.register(makeApplyPatchTool(options))
}
