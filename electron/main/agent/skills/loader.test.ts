import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseSkillMarkdown, SkillLoader } from './loader.js'

let workspace = ''

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-skills-'))
})

afterEach(() => {
  try {
    fs.rmSync(workspace, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function writeSkill(name: string, content: string): void {
  const dir = path.join(workspace, '.skills')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), content)
}

describe('parseSkillMarkdown', () => {
  it('parses frontmatter + body', () => {
    const md = `---\nname: my-skill\ndescription: hi\ntriggers: [foo, bar]\n---\nbody text\n`
    const { frontmatter, body } = parseSkillMarkdown(md)
    expect(frontmatter.name).toBe('my-skill')
    expect(frontmatter.description).toBe('hi')
    expect(frontmatter.triggers).toEqual(['foo', 'bar'])
    expect(body.trim()).toBe('body text')
  })

  it('returns empty frontmatter when none present', () => {
    const { frontmatter, body } = parseSkillMarkdown('# heading\nplain content')
    expect(frontmatter).toEqual({
      name: undefined,
      title: undefined,
      description: undefined,
      version: undefined,
      tags: undefined,
      triggers: undefined,
      tools: undefined,
    })
    expect(body).toContain('# heading')
  })

  it('coerces single string triggers to array', () => {
    const { frontmatter } = parseSkillMarkdown(
      `---\nname: x\ntriggers: just-one\n---\n`,
    )
    expect(frontmatter.triggers).toEqual(['just-one'])
  })

  it('tolerates malformed YAML by returning empty frontmatter', () => {
    const { frontmatter, body } = parseSkillMarkdown(
      `---\nname: [unbalanced\n---\nbody`,
    )
    expect(frontmatter.name).toBeUndefined()
    expect(body.trim()).toBe('body')
  })
})

describe('SkillLoader.listSkills', () => {
  it('returns [] when .skills missing', async () => {
    const loader = new SkillLoader()
    const out = await loader.listSkills(workspace)
    expect(out).toEqual([])
  })

  it('lists frontmatter from each .md file', async () => {
    writeSkill(
      'note-organizer.md',
      `---\nname: note-organizer\ntitle: Note Organizer\ndescription: tidies notes\ntriggers: [organize]\ntools: [fs_read, fs_write]\n---\nprompt body\n`,
    )
    writeSkill('plain.md', `# no frontmatter\nbody\n`)
    const loader = new SkillLoader()
    const out = await loader.listSkills(workspace)
    expect(out).toHaveLength(2)
    const organizer = out.find((s) => s.name === 'note-organizer')
    expect(organizer?.title).toBe('Note Organizer')
    expect(organizer?.tools).toEqual(['fs_read', 'fs_write'])
    expect(organizer?.triggers).toEqual(['organize'])
    const plain = out.find((s) => s.name === 'plain')
    expect(plain?.title).toBe('plain')
  })

  it('skips non-md files', async () => {
    writeSkill('a.md', `---\nname: a\n---\nx`)
    fs.writeFileSync(path.join(workspace, '.skills', 'README.txt'), 'ignore me')
    const loader = new SkillLoader()
    const out = await loader.listSkills(workspace)
    expect(out.map((s) => s.name)).toEqual(['a'])
  })
})

describe('SkillLoader.readSkill', () => {
  it('returns SkillDetail with prompt body', async () => {
    writeSkill(
      'foo.md',
      `---\nname: foo\ndescription: d\n---\nthe prompt content\n`,
    )
    const loader = new SkillLoader()
    const detail = await loader.readSkill(workspace, 'foo')
    expect(detail).not.toBeNull()
    expect(detail?.info.name).toBe('foo')
    expect(detail?.prompt).toBe('the prompt content')
    expect(detail?.markdown.startsWith('---')).toBe(true)
  })

  it('returns null when skill missing', async () => {
    const loader = new SkillLoader()
    expect(await loader.readSkill(workspace, 'nope')).toBeNull()
  })
})

describe('SkillLoader.findTriggered', () => {
  it('matches substring triggers (case insensitive)', async () => {
    writeSkill(
      'a.md',
      `---\nname: a\ntriggers: [refactor]\n---\nbody`,
    )
    writeSkill(
      'b.md',
      `---\nname: b\ntriggers: [release]\n---\nbody`,
    )
    const loader = new SkillLoader()
    const found = await loader.findTriggered('Please REFACTOR this', workspace)
    expect(found.map((s) => s.name)).toEqual(['a'])
  })

  it('supports /regex/ triggers', async () => {
    writeSkill(
      'r.md',
      `---\nname: r\ntriggers: ["/^todo:/i"]\n---\nbody`,
    )
    const loader = new SkillLoader()
    const found = await loader.findTriggered('Todo: do thing', workspace)
    expect(found.map((s) => s.name)).toEqual(['r'])
    const none = await loader.findTriggered('do todo: thing', workspace)
    expect(none).toEqual([])
  })

  it('skips skills with no triggers', async () => {
    writeSkill('s.md', `---\nname: s\n---\nbody`)
    const loader = new SkillLoader()
    expect(await loader.findTriggered('anything', workspace)).toEqual([])
  })
})

describe('SkillLoader.applySlashPrefix', () => {
  it('strips /skill-name prefix and returns systemAddendum', async () => {
    writeSkill(
      'organizer.md',
      `---\nname: organizer\n---\nYou are an organizer.\n`,
    )
    const loader = new SkillLoader()
    const out = await loader.applySlashPrefix('/organizer help me', workspace)
    expect(out.task).toBe('help me')
    expect(out.systemAddendum?.trim()).toContain('You are an organizer.')
    expect(out.skill?.name).toBe('organizer')
  })

  it('passes through when no prefix', async () => {
    const loader = new SkillLoader()
    const out = await loader.applySlashPrefix('hello', workspace)
    expect(out).toEqual({ task: 'hello' })
  })

  it('passes through when skill not found', async () => {
    const loader = new SkillLoader()
    const out = await loader.applySlashPrefix('/missing some task', workspace)
    expect(out.task).toBe('/missing some task')
    expect(out.systemAddendum).toBeUndefined()
  })
})
