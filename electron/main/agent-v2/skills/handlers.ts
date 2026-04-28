/**
 * Skill CRUD handlers — file-system writes to <vault>/.claude/skills/<name>/SKILL.md.
 *
 * Listing / reading skills is the renderer's job (it hits opencode's /skill
 * endpoint directly via the cached server info). The main process only
 * handles writes, since the renderer doesn't have direct fs access for
 * security reasons.
 *
 * All writes are constrained to the vault's .claude/skills/<name>/ directory
 * — name must match a strict kebab-case regex so we can't be tricked into
 * writing outside that scope (`../../etc` etc.).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface SkillFrontmatter {
  name: string
  description: string
  /** Optional fields users can add — passed through verbatim. */
  [extra: string]: unknown
}

export interface WriteSkillInput {
  vaultPath: string
  name: string
  /** Frontmatter fields (must include `name` and `description`). */
  frontmatter: SkillFrontmatter
  /** Markdown body (no leading frontmatter delimiter). */
  body: string
}

export interface DeleteSkillInput {
  vaultPath: string
  name: string
}

function assertValidName(name: string): void {
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(
      `Invalid skill name '${name}'. Use lowercase letters, digits, and hyphens (1–64 chars), starting with a letter or digit.`,
    )
  }
}

function skillDir(vaultPath: string, name: string): string {
  // .claude/skills/<name>/ — Anthropic skill convention; opencode's
  // walk-up discovery finds it without explicit config.
  return path.join(vaultPath, '.claude', 'skills', name)
}

/**
 * Build a SKILL.md file from frontmatter + body. We hand-emit YAML to
 * avoid pulling in a yaml dependency for a 2-field frontmatter; if the
 * frontmatter ever grows non-trivial this is the place to swap in a real
 * serializer.
 */
function buildSkillMarkdown(frontmatter: SkillFrontmatter, body: string): string {
  const lines: string[] = ['---']
  lines.push(`name: ${frontmatter.name}`)
  // Description may contain colons / quotes — wrap in a literal scalar
  // when it has anything beyond plain text.
  const desc = String(frontmatter.description ?? '').trim()
  if (/[:#&*?,\\\n]/.test(desc) || desc.startsWith(' ') || desc.startsWith('-')) {
    // Emit as literal block scalar to escape funky chars.
    lines.push('description: |')
    for (const line of desc.split('\n')) {
      lines.push(`  ${line}`)
    }
  } else {
    lines.push(`description: ${desc}`)
  }
  // Pass through extras (tags, version, etc.) as-is, scalars only.
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'name' || key === 'description') continue
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      const items = value.filter((v) => typeof v === 'string')
      if (items.length === 0) continue
      lines.push(`${key}: [${items.map((v) => JSON.stringify(v)).join(', ')}]`)
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${JSON.stringify(value).slice(1, -1)}`)
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n') + body.trimStart()
}

export async function writeSkill(input: WriteSkillInput): Promise<{ path: string }> {
  const { vaultPath, name, frontmatter, body } = input
  if (!vaultPath) throw new Error('vaultPath is required')
  assertValidName(name)
  if (frontmatter.name !== name) {
    throw new Error(
      `Skill name in frontmatter ('${frontmatter.name}') does not match parameter ('${name}').`,
    )
  }
  if (
    typeof frontmatter.description !== 'string' ||
    frontmatter.description.trim().length === 0
  ) {
    throw new Error('Skill description is required.')
  }

  const dir = skillDir(vaultPath, name)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, 'SKILL.md')
  const content = buildSkillMarkdown(frontmatter, body)
  await fs.writeFile(filePath, content, 'utf-8')
  return { path: filePath }
}

export async function deleteSkill(input: DeleteSkillInput): Promise<void> {
  const { vaultPath, name } = input
  if (!vaultPath) throw new Error('vaultPath is required')
  assertValidName(name)
  const dir = skillDir(vaultPath, name)

  // Defense-in-depth: refuse to delete if the resolved path escapes the
  // vault's skills root. Should be impossible given assertValidName, but
  // a second check costs nothing.
  const skillsRoot = path.join(vaultPath, '.claude', 'skills')
  const resolved = path.resolve(dir)
  if (!resolved.startsWith(path.resolve(skillsRoot) + path.sep)) {
    throw new Error(`Refusing to delete outside ${skillsRoot}: ${dir}`)
  }

  await fs.rm(dir, { recursive: true, force: true })
}
