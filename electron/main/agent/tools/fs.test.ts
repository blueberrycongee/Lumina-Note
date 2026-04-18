import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  makeGrepTool,
  makeListTool,
  makeReadTool,
  makeStatTool,
  makeWriteTool,
  registerFsTools,
} from './fs.js'
import { ToolRegistry } from '../tool-registry.js'

let root = ''
const neverAbort = new AbortController().signal

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-fs-tools-'))
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('fs_read', () => {
  it('reads full content', async () => {
    const p = path.join(root, 'a.txt')
    fs.writeFileSync(p, 'hello\nworld\n!')
    const tool = makeReadTool()
    const out = await tool.execute({ path: p }, neverAbort)
    expect(out).toBe('hello\nworld\n!')
  })

  it('supports offset + limit for line paging', async () => {
    const p = path.join(root, 'a.txt')
    fs.writeFileSync(p, ['l1', 'l2', 'l3', 'l4', 'l5'].join('\n'))
    const tool = makeReadTool()
    expect(await tool.execute({ path: p, offset: 1, limit: 2 }, neverAbort)).toBe('l2\nl3')
  })

  it('rejects files larger than readMaxBytes', async () => {
    const p = path.join(root, 'big.txt')
    fs.writeFileSync(p, 'x'.repeat(2000))
    const tool = makeReadTool({ readMaxBytes: 500 })
    await expect(tool.execute({ path: p }, neverAbort)).rejects.toThrow(/too large/)
  })

  it('enforces allowedRoots', async () => {
    const tool = makeReadTool({ allowedRoots: [root] })
    const outsidePath = path.join(os.tmpdir(), 'never-exists-outside.txt')
    await expect(
      tool.execute({ path: outsidePath }, neverAbort),
    ).rejects.toThrow(/outside of allowed roots/)
  })
})

describe('fs_write', () => {
  it('creates parent dir and writes content', async () => {
    const p = path.join(root, 'sub/nested/a.md')
    const tool = makeWriteTool()
    const res = await tool.execute({ path: p, content: 'hi there' }, neverAbort)
    expect(res).toContain('wrote')
    expect(fs.readFileSync(p, 'utf-8')).toBe('hi there')
  })

  it('has requires_approval = true', () => {
    expect(makeWriteTool().requires_approval).toBe(true)
  })
})

describe('fs_list', () => {
  it('lists directory non-recursively by default', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), '')
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), '')
    const tool = makeListTool()
    const out = JSON.parse(await tool.execute({ path: root }, neverAbort)) as Array<{
      name: string
      type: string
    }>
    const names = out.map((e) => e.name).sort()
    expect(names).toEqual(['a.txt', 'sub'])
  })

  it('walks recursively when recursive=true', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), '')
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), '')
    const tool = makeListTool()
    const out = JSON.parse(
      await tool.execute({ path: root, recursive: true }, neverAbort),
    ) as Array<{ name: string; path: string }>
    const files = out.filter((e) => e.name.endsWith('.txt')).map((e) => e.path).sort()
    expect(files).toEqual(['a.txt', path.join('sub', 'b.txt')])
  })

  it('skips node_modules and .git but allows .lumina', async () => {
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.writeFileSync(path.join(root, 'node_modules', 'x.txt'), '')
    fs.mkdirSync(path.join(root, '.git'))
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), '')
    fs.mkdirSync(path.join(root, '.lumina'))
    fs.writeFileSync(path.join(root, '.lumina', 'state.json'), '{}')
    const tool = makeListTool()
    const out = JSON.parse(
      await tool.execute({ path: root, recursive: true }, neverAbort),
    ) as Array<{ name: string; path: string }>
    const names = out.map((e) => e.path)
    expect(names.some((n) => n.startsWith('.lumina'))).toBe(true)
    expect(names.some((n) => n.includes('node_modules'))).toBe(false)
    expect(names.some((n) => n.startsWith('.git'))).toBe(false)
  })
})

describe('fs_grep', () => {
  it('finds matches across files with line numbers', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'hello\nworld\nhello again')
    fs.writeFileSync(path.join(root, 'b.md'), 'no match here')
    const tool = makeGrepTool()
    const out = JSON.parse(
      await tool.execute({ path: root, pattern: 'hello' }, neverAbort),
    ) as { total_matches: number; matches: Array<{ file: string; line: number }> }
    expect(out.total_matches).toBe(2)
    expect(out.matches.map((m) => m.line).sort()).toEqual([1, 3])
  })

  it('respects glob filter', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'hit')
    fs.writeFileSync(path.join(root, 'b.md'), 'hit')
    const tool = makeGrepTool()
    const out = JSON.parse(
      await tool.execute({ path: root, pattern: 'hit', glob: '*.md' }, neverAbort),
    ) as { total_matches: number }
    expect(out.total_matches).toBe(1)
  })

  it('supports regex flags and context_lines', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'line1\nAlphA\nline3')
    const tool = makeGrepTool()
    const out = JSON.parse(
      await tool.execute(
        { path: root, pattern: 'alpha', flags: 'i', context_lines: 1 },
        neverAbort,
      ),
    ) as { matches: Array<{ context_before: string[]; context_after: string[] }> }
    expect(out.matches[0].context_before).toEqual(['line1'])
    expect(out.matches[0].context_after).toEqual(['line3'])
  })
})

describe('fs_stat', () => {
  it('returns exists=false for missing path', async () => {
    const tool = makeStatTool()
    const out = JSON.parse(
      await tool.execute({ path: path.join(root, 'nope') }, neverAbort),
    )
    expect(out).toEqual({ exists: false })
  })

  it('returns file info when path exists', async () => {
    const p = path.join(root, 'x.txt')
    fs.writeFileSync(p, 'abc')
    const tool = makeStatTool()
    const out = JSON.parse(await tool.execute({ path: p }, neverAbort)) as {
      exists: boolean
      type: string
      size: number
      mtime_ms: number
    }
    expect(out.exists).toBe(true)
    expect(out.type).toBe('file')
    expect(out.size).toBe(3)
    expect(typeof out.mtime_ms).toBe('number')
  })
})

describe('registerFsTools', () => {
  it('registers all 5 FS tools in the registry', () => {
    const reg = new ToolRegistry()
    registerFsTools(reg)
    const names = reg.definitions().map((d) => d.name).sort()
    expect(names).toEqual(['fs_grep', 'fs_list', 'fs_read', 'fs_stat', 'fs_write'])
  })
})
