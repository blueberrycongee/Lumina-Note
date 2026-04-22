/**
 * SkillLoader — 扫描 vault/.skills/*.md,把 markdown 解析成 Skill 对象。
 *
 * Skill frontmatter:
 *   name: short-id        (必需,纯小写 + 连字符)
 *   title: Display Name   (可选,缺省 = name)
 *   description: 一句话    (可选)
 *   version: 0.1          (可选)
 *   tags: [tag1, tag2]    (可选)
 *   triggers: [...]       (可选,字符串或字符串数组,用于自动匹配 task 触发)
 *   tools: [tool1, tool2] (可选,声明该 skill 需要哪些 tool;runtime 后续可用)
 *
 * Body 是 Markdown,作为 system 附加 prompt。
 *
 * 使用:
 *   const loader = new SkillLoader()
 *   const list = await loader.listSkills(workspacePath)
 *   const detail = await loader.readSkill(workspacePath, name)
 *   const matched = await loader.findTriggered(task, workspacePath)
 *
 *   // 中间件:task 以 /skill-name 开头时,自动剥离前缀并注入 prompt
 *   const { task: cleaned, systemAddendum } = await loader.applySlashPrefix(task, workspacePath)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { listBuiltinSkills, getBuiltinSkill } from './builtins.js'

export interface SkillFrontmatter {
  name?: string
  title?: string
  description?: string
  version?: string
  tags?: string[]
  triggers?: string[]
  tools?: string[]
}

export interface SkillInfo {
  name: string
  title: string
  description?: string
  version?: string
  tags?: string[]
  triggers?: string[]
  tools?: string[]
  source?: string
}

export interface SkillDetail {
  info: SkillInfo
  prompt: string
  markdown: string
}

const SKILLS_SUBDIR = '.skills'

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/

/** 解析 markdown 字符串为 { frontmatter, body } */
export function parseSkillMarkdown(markdown: string): {
  frontmatter: SkillFrontmatter
  body: string
} {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match) {
    return { frontmatter: {}, body: markdown }
  }
  let parsed: unknown = {}
  try {
    parsed = parseYaml(match[1])
  } catch {
    parsed = {}
  }
  const fm =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  const frontmatter: SkillFrontmatter = {
    name: typeof fm.name === 'string' ? fm.name : undefined,
    title: typeof fm.title === 'string' ? fm.title : undefined,
    description: typeof fm.description === 'string' ? fm.description : undefined,
    version: typeof fm.version === 'string' ? fm.version : String(fm.version ?? '') || undefined,
    tags: normalizeStringArray(fm.tags),
    triggers: normalizeStringArray(fm.triggers),
    tools: normalizeStringArray(fm.tools),
  }
  return { frontmatter, body: markdown.slice(match[0].length) }
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    const out = value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    return out.length > 0 ? out : undefined
  }
  return undefined
}

function deriveSkillName(filename: string, fm: SkillFrontmatter): string {
  if (fm.name && /^[a-z0-9][a-z0-9-]*$/.test(fm.name)) return fm.name
  return filename.replace(/\.md$/i, '').toLowerCase()
}

export class SkillLoader {
  /** 列出 skill 列表(只读 frontmatter,不带 body) */
  async listSkills(workspacePath: string): Promise<SkillInfo[]> {
    const dir = path.join(workspacePath, SKILLS_SUBDIR)
    const files = await this.listSkillFiles(dir)
    const vaultNames = new Set<string>()
    const out: SkillInfo[] = []
    for (const file of files) {
      try {
        const md = await fs.readFile(file, 'utf-8')
        const { frontmatter } = parseSkillMarkdown(md)
        const name = deriveSkillName(path.basename(file), frontmatter)
        vaultNames.add(name)
        out.push(this.buildInfo(file, name, frontmatter))
      } catch {
        // ignore unreadable / malformed file
      }
    }
    for (const builtin of listBuiltinSkills()) {
      if (!vaultNames.has(builtin.name)) out.push(builtin)
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }

  /** 读单个 skill 完整内容 */
  async readSkill(workspacePath: string, name: string): Promise<SkillDetail | null> {
    // Vault skills override built-ins with the same name
    const dir = path.join(workspacePath, SKILLS_SUBDIR)
    const files = await this.listSkillFiles(dir)
    for (const file of files) {
      const md = await fs.readFile(file, 'utf-8')
      const { frontmatter, body } = parseSkillMarkdown(md)
      const skillName = deriveSkillName(path.basename(file), frontmatter)
      if (skillName === name) {
        return {
          info: this.buildInfo(file, skillName, frontmatter),
          prompt: body.trim(),
          markdown: md,
        }
      }
    }
    return getBuiltinSkill(name)
  }

  /** 找出 task 触发的 skill(triggers 字符串子串或正则匹配) */
  async findTriggered(task: string, workspacePath: string): Promise<SkillInfo[]> {
    const skills = await this.listSkills(workspacePath)
    const lowered = task.toLowerCase()
    return skills.filter((skill) => {
      if (!skill.triggers || skill.triggers.length === 0) return false
      return skill.triggers.some((t) => matchesTrigger(lowered, t))
    })
  }

  /**
   * 中间件: 如果 task 以 "/skill-name" 开头,剥离前缀并附加 skill prompt 到 system。
   * 没有匹配时原样返回。
   */
  async applySlashPrefix(
    task: string,
    workspacePath: string,
  ): Promise<{ task: string; systemAddendum?: string; skill?: SkillInfo }> {
    const trimmed = task.trimStart()
    const m = trimmed.match(/^\/([a-z0-9][a-z0-9-]*)\b\s*/i)
    if (!m) return { task }
    const skillName = m[1].toLowerCase()
    const detail = await this.readSkill(workspacePath, skillName)
    if (!detail) return { task }
    const remaining = trimmed.slice(m[0].length)
    return {
      task: remaining || task,
      systemAddendum: detail.prompt,
      skill: detail.info,
    }
  }

  private buildInfo(file: string, name: string, fm: SkillFrontmatter): SkillInfo {
    return {
      name,
      title: fm.title ?? name,
      description: fm.description,
      version: fm.version,
      tags: fm.tags,
      triggers: fm.triggers,
      tools: fm.tools,
      source: file,
    }
  }

  private async listSkillFiles(dir: string): Promise<string[]> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []
      throw err
    }
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => path.join(dir, e.name))
  }
}

function matchesTrigger(loweredTask: string, trigger: string): boolean {
  if (!trigger) return false
  // 支持 /regex/flags 形式
  const regexLike = trigger.match(/^\/(.+)\/([a-z]*)$/)
  if (regexLike) {
    try {
      return new RegExp(regexLike[1], regexLike[2]).test(loweredTask)
    } catch {
      return false
    }
  }
  return loweredTask.includes(trigger.toLowerCase())
}
