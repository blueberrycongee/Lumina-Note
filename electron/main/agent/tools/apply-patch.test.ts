import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyPatch,
  makeApplyPatchTool,
  parsePatch,
  registerApplyPatchTool,
  seekSequence,
  ApplyPatchParseError,
} from './apply-patch.js'
import { ToolRegistry } from '../tool-registry.js'

let root = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-apply-patch-'))
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

const neverAbort = new AbortController().signal

describe('parsePatch', () => {
  it('parses a single Add File hunk', () => {
    const text = [
      '*** Begin Patch',
      '*** Add File: hello.txt',
      '+hello',
      '+world',
      '*** End Patch',
    ].join('\n')
    const hunks = parsePatch(text)
    expect(hunks).toEqual([
      { type: 'add', path: 'hello.txt', contents: 'hello\nworld' },
    ])
  })

  it('parses Delete File', () => {
    const hunks = parsePatch(
      ['*** Begin Patch', '*** Delete File: old.md', '*** End Patch'].join('\n'),
    )
    expect(hunks).toEqual([{ type: 'delete', path: 'old.md' }])
  })

  it('parses an Update File with @@ context + hunks', () => {
    const text = [
      '*** Begin Patch',
      '*** Update File: src/app.ts',
      '@@ export function greet()',
      '-  return "hi"',
      '+  return "hello"',
      '*** End Patch',
    ].join('\n')
    const hunks = parsePatch(text)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe('update')
    const updateHunk = hunks[0] as {
      type: 'update'
      path: string
      movePath: string | null
      chunks: Array<{
        changeContext: string | null
        oldLines: string[]
        newLines: string[]
        isEndOfFile: boolean
      }>
    }
    expect(updateHunk.path).toBe('src/app.ts')
    expect(updateHunk.movePath).toBeNull()
    expect(updateHunk.chunks[0].changeContext).toBe('export function greet()')
    expect(updateHunk.chunks[0].oldLines).toEqual(['  return "hi"'])
    expect(updateHunk.chunks[0].newLines).toEqual(['  return "hello"'])
  })

  it('parses Update + Move to (rename)', () => {
    const text = [
      '*** Begin Patch',
      '*** Update File: src/old.ts',
      '*** Move to: src/new.ts',
      '@@',
      '-a',
      '+b',
      '*** End Patch',
    ].join('\n')
    const hunks = parsePatch(text)
    expect((hunks[0] as { movePath: string }).movePath).toBe('src/new.ts')
  })

  it('rejects patch missing Begin marker', () => {
    expect(() => parsePatch('*** Add File: a\n+x\n*** End Patch')).toThrow(
      ApplyPatchParseError,
    )
  })

  it('rejects patch missing End marker', () => {
    expect(() => parsePatch('*** Begin Patch\n*** Add File: a\n+x')).toThrow(
      ApplyPatchParseError,
    )
  })
})

describe('seekSequence', () => {
  it('exact match', () => {
    expect(seekSequence(['a', 'b', 'c'], ['b', 'c'], 0, false)).toBe(1)
  })
  it('ignores trailing whitespace', () => {
    expect(seekSequence(['foo   ', 'bar\t'], ['foo', 'bar'], 0, false)).toBe(0)
  })
  it('ignores leading + trailing whitespace', () => {
    expect(seekSequence(['   foo', '   bar'], ['foo', 'bar'], 0, false)).toBe(0)
  })
  it('fuzzy unicode normalization: em-dash ↔ hyphen, smart quotes', () => {
    // em-dash + curly quote in source; patch uses ascii - and '.
    expect(
      seekSequence(['return \u2014 \u201chi\u201d'], ['return - "hi"'], 0, false),
    ).toBe(0)
  })
  it('returns null when pattern longer than input', () => {
    expect(seekSequence(['only'], ['too', 'many'], 0, false)).toBeNull()
  })
  it('eof=true prefers the tail of the file', () => {
    // "a" appears twice; eof=true picks the last occurrence.
    expect(seekSequence(['a', 'b', 'a'], ['a'], 0, true)).toBe(2)
  })
})

describe('applyPatch — add/delete', () => {
  it('creates a new file under rootDir', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: notes/daily.md',
      '+# Today',
      '+line 2',
      '*** End Patch',
    ].join('\n')
    await applyPatch(patch, { rootDir: root })
    const abs = path.join(root, 'notes/daily.md')
    expect(fs.readFileSync(abs, 'utf-8')).toBe('# Today\nline 2')
  })

  it('deletes an existing file', async () => {
    const abs = path.join(root, 'old.md')
    fs.writeFileSync(abs, 'bye')
    await applyPatch(
      ['*** Begin Patch', '*** Delete File: old.md', '*** End Patch'].join('\n'),
      { rootDir: root },
    )
    expect(fs.existsSync(abs)).toBe(false)
  })

  it('refuses absolute paths', async () => {
    const absPath = path.join(root, 'x.md')
    const patch = ['*** Begin Patch', `*** Add File: ${absPath}`, '+x', '*** End Patch'].join(
      '\n',
    )
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow(/relative paths/)
  })

  it('refuses ../ escapes', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: ../escape.md',
      '+x',
      '*** End Patch',
    ].join('\n')
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow(/outside the allowed root/)
  })

  it('rejects Add File when target already exists', async () => {
    fs.writeFileSync(path.join(root, 'exists.md'), 'stay')
    const patch = [
      '*** Begin Patch',
      '*** Add File: exists.md',
      '+new',
      '*** End Patch',
    ].join('\n')
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow(/already exists/)
    expect(fs.readFileSync(path.join(root, 'exists.md'), 'utf-8')).toBe('stay')
  })
})

describe('applyPatch — update', () => {
  it('applies a simple hunk in-place', async () => {
    const abs = path.join(root, 'a.md')
    fs.writeFileSync(abs, 'alpha\nbeta\ngamma\n')
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.md',
      '@@',
      '-beta',
      '+bravo',
      '*** End Patch',
    ].join('\n')
    await applyPatch(patch, { rootDir: root })
    expect(fs.readFileSync(abs, 'utf-8')).toBe('alpha\nbravo\ngamma\n')
  })

  it('supports @@ context to disambiguate', async () => {
    const abs = path.join(root, 'a.py')
    fs.writeFileSync(
      abs,
      [
        'def foo():',
        '    return 1',
        '',
        'def bar():',
        '    return 1',
        '',
      ].join('\n'),
    )
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.py',
      '@@ def bar():',
      '-    return 1',
      '+    return 2',
      '*** End Patch',
    ].join('\n')
    await applyPatch(patch, { rootDir: root })
    const updated = fs.readFileSync(abs, 'utf-8')
    expect(updated).toContain('def foo():\n    return 1')
    expect(updated).toContain('def bar():\n    return 2')
  })

  it('applies the move/rename path', async () => {
    const src = path.join(root, 'old.md')
    fs.writeFileSync(src, 'alpha\n')
    const patch = [
      '*** Begin Patch',
      '*** Update File: old.md',
      '*** Move to: new.md',
      '@@',
      '-alpha',
      '+omega',
      '*** End Patch',
    ].join('\n')
    await applyPatch(patch, { rootDir: root })
    expect(fs.existsSync(src)).toBe(false)
    expect(fs.readFileSync(path.join(root, 'new.md'), 'utf-8')).toBe('omega\n')
  })

  it('returns a clear error when old_lines cannot be found', async () => {
    const abs = path.join(root, 'a.md')
    fs.writeFileSync(abs, 'alpha\nbeta\n')
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.md',
      '@@',
      '-does not exist',
      '+new',
      '*** End Patch',
    ].join('\n')
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow(
      /could not locate old lines/,
    )
    // File untouched because hunk failed pre-write.
    expect(fs.readFileSync(abs, 'utf-8')).toBe('alpha\nbeta\n')
  })

  it('is atomic across files: a later failure rolls back earlier changes', async () => {
    const aPath = path.join(root, 'a.md')
    const bPath = path.join(root, 'b.md')
    fs.writeFileSync(aPath, 'alpha\n')
    fs.writeFileSync(bPath, 'beta\n')
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.md',
      '@@',
      '-alpha',
      '+APPLES',
      '*** Update File: b.md',
      '@@',
      '-does not exist',
      '+fail',
      '*** End Patch',
    ].join('\n')
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow(
      /could not locate old lines/,
    )
    // First file was written, but rollback should have restored it.
    expect(fs.readFileSync(aPath, 'utf-8')).toBe('alpha\n')
    expect(fs.readFileSync(bPath, 'utf-8')).toBe('beta\n')
  })

  it('rolls back an Add File when a later hunk fails', async () => {
    fs.writeFileSync(path.join(root, 'b.md'), 'beta\n')
    const patch = [
      '*** Begin Patch',
      '*** Add File: new.md',
      '+created',
      '*** Update File: b.md',
      '@@',
      '-does not exist',
      '+fail',
      '*** End Patch',
    ].join('\n')
    await expect(applyPatch(patch, { rootDir: root })).rejects.toThrow()
    expect(fs.existsSync(path.join(root, 'new.md'))).toBe(false)
  })
})

describe('apply_patch tool integration', () => {
  it('registers under name apply_patch with requires_approval=true', () => {
    const reg = new ToolRegistry()
    registerApplyPatchTool(reg, { rootDir: root })
    const tool = reg.get('apply_patch')
    expect(tool).toBeDefined()
    expect(tool!.requires_approval).toBe(true)
    expect(tool!.description).toMatch(/\*\*\* Begin Patch/)
  })

  it('executes through the tool interface', async () => {
    const tool = makeApplyPatchTool({ rootDir: root })
    const patch = [
      '*** Begin Patch',
      '*** Add File: readme.md',
      '+hi',
      '*** End Patch',
    ].join('\n')
    const result = await tool.execute({ input: patch }, neverAbort)
    expect(result).toContain('A  readme.md')
    expect(fs.readFileSync(path.join(root, 'readme.md'), 'utf-8')).toBe('hi')
  })

  it('throws a parse error when the envelope is broken', async () => {
    const tool = makeApplyPatchTool({ rootDir: root })
    await expect(
      tool.execute({ input: 'not a patch at all' }, neverAbort),
    ).rejects.toThrow(/must start with/)
  })
})
