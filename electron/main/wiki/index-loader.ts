/**
 * Wiki index loader — 扫描 vault/wiki/*.md,把每个 wiki 页的 frontmatter 摘成
 * renderer 期待的 WikiIndex 形状。是 vault_load_index IPC 的实现。
 *
 * 这里不参与同步逻辑(那是 WikiManager 的事),只是把磁盘上"已合成"的产物
 * 列给前端 viewer 用。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export type WikiPageType = 'index' | 'concept' | 'entity' | 'summary' | 'collection'

export interface WikiPageEntry {
  path: string
  title: string
  page_type: WikiPageType
  summary: string
}

export interface WikiIndex {
  pages: WikiPageEntry[]
  last_updated: number
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/

const VALID_PAGE_TYPES: WikiPageType[] = [
  'index',
  'concept',
  'entity',
  'summary',
  'collection',
]

export async function loadWikiIndex(vaultPath: string): Promise<WikiIndex> {
  const wikiDir = path.join(vaultPath, 'wiki')
  const pages: WikiPageEntry[] = []
  let lastUpdated = 0

  const files = await collectMarkdown(wikiDir)
  for (const abs of files) {
    let raw: string
    let stat: import('node:fs').Stats
    try {
      raw = await fs.readFile(abs, 'utf-8')
      stat = await fs.stat(abs)
    } catch {
      continue
    }
    if (stat.mtimeMs > lastUpdated) lastUpdated = stat.mtimeMs

    const frontmatter = parseFrontmatter(raw)
    const rel = path.relative(vaultPath, abs).replace(/\\/g, '/')
    const title =
      typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0
        ? frontmatter.title.trim()
        : path.basename(abs).replace(/\.md$/i, '')
    const summary =
      typeof frontmatter.summary === 'string' ? frontmatter.summary : firstParagraph(raw)
    const pageType =
      typeof frontmatter.page_type === 'string' &&
      (VALID_PAGE_TYPES as string[]).includes(frontmatter.page_type)
        ? (frontmatter.page_type as WikiPageType)
        : 'concept'
    pages.push({ path: rel, title, page_type: pageType, summary })
  }

  pages.sort((a, b) => a.title.localeCompare(b.title))
  return { pages, last_updated: Math.round(lastUpdated) }
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return {}
  try {
    const parsed = parseYaml(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fallthrough
  }
  return {}
}

function firstParagraph(raw: string): string {
  const body = raw.replace(FRONTMATTER_RE, '').trim()
  const para = body.split(/\n{2,}/)[0] ?? ''
  return para.trim().slice(0, 240)
}

async function collectMarkdown(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(d: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return
      throw err
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const abs = path.join(d, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(abs)
      }
    }
  }
  await walk(dir)
  return out
}
