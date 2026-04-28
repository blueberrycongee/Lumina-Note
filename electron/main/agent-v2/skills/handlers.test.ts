import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { deleteSkill, writeSkill } from './handlers.js'

let vaultDir = ''

beforeEach(async () => {
  vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumina-skill-handlers-'))
})

afterEach(async () => {
  await fs.rm(vaultDir, { recursive: true, force: true }).catch(() => undefined)
})

describe('writeSkill', () => {
  it('creates .claude/skills/<name>/SKILL.md with frontmatter and body', async () => {
    const result = await writeSkill({
      vaultPath: vaultDir,
      name: 'note-summarizer',
      frontmatter: {
        name: 'note-summarizer',
        description: 'Summarize the user\'s long notes into a 3-bullet TL;DR.',
      },
      body: '# Note summarizer\n\nWhen invoked, …\n',
    })
    const expected = path.join(vaultDir, '.claude', 'skills', 'note-summarizer', 'SKILL.md')
    expect(result.path).toBe(expected)
    const content = await fs.readFile(expected, 'utf-8')
    expect(content).toContain('name: note-summarizer')
    expect(content).toContain('description: ')
    expect(content).toContain('# Note summarizer')
  })

  it('rejects names with invalid characters', async () => {
    await expect(
      writeSkill({
        vaultPath: vaultDir,
        name: 'bad/../escape',
        frontmatter: { name: 'bad/../escape', description: 'x' },
        body: '',
      }),
    ).rejects.toThrow(/Invalid skill name/)
  })

  it('rejects when frontmatter.name and parameter disagree', async () => {
    await expect(
      writeSkill({
        vaultPath: vaultDir,
        name: 'a',
        frontmatter: { name: 'b', description: 'x' },
        body: '',
      }),
    ).rejects.toThrow(/does not match/)
  })

  it('rejects empty description', async () => {
    await expect(
      writeSkill({
        vaultPath: vaultDir,
        name: 'a',
        frontmatter: { name: 'a', description: '   ' },
        body: '',
      }),
    ).rejects.toThrow(/description/)
  })

  it('escapes descriptions containing colons via literal block scalar', async () => {
    await writeSkill({
      vaultPath: vaultDir,
      name: 'colon-test',
      frontmatter: {
        name: 'colon-test',
        description: 'Format: thing — with: many: colons',
      },
      body: '',
    })
    const content = await fs.readFile(
      path.join(vaultDir, '.claude', 'skills', 'colon-test', 'SKILL.md'),
      'utf-8',
    )
    expect(content).toMatch(/description: \|\n {2}Format: thing — with: many: colons/)
  })
})

describe('deleteSkill', () => {
  it('removes the entire skill directory', async () => {
    await writeSkill({
      vaultPath: vaultDir,
      name: 'temp-skill',
      frontmatter: { name: 'temp-skill', description: 'placeholder' },
      body: 'body',
    })
    const dir = path.join(vaultDir, '.claude', 'skills', 'temp-skill')
    expect(await fs.stat(dir)).toBeTruthy()

    await deleteSkill({ vaultPath: vaultDir, name: 'temp-skill' })
    await expect(fs.stat(dir)).rejects.toThrow()
  })

  it('rejects names with invalid characters', async () => {
    await expect(
      deleteSkill({ vaultPath: vaultDir, name: '../something' }),
    ).rejects.toThrow(/Invalid skill name/)
  })

  it('is a no-op for skills that do not exist', async () => {
    await expect(
      deleteSkill({ vaultPath: vaultDir, name: 'nonexistent' }),
    ).resolves.toBeUndefined()
  })
})
