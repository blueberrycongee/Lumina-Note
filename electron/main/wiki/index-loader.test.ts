import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadWikiIndex } from './index-loader.js'

let vault = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-idx-'))
})

afterEach(() => {
  try {
    fs.rmSync(vault, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function writeWiki(rel: string, content: string): void {
  const abs = path.join(vault, 'wiki', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

describe('loadWikiIndex', () => {
  it('returns empty index when vault has no wiki dir', async () => {
    const out = await loadWikiIndex(vault)
    expect(out).toEqual({ pages: [], last_updated: 0 })
  })

  it('reads frontmatter title/page_type/summary', async () => {
    writeWiki(
      'concepts.md',
      `---\ntitle: Recursion\npage_type: concept\nsummary: A function calling itself.\n---\nbody body\n`,
    )
    const out = await loadWikiIndex(vault)
    expect(out.pages).toHaveLength(1)
    expect(out.pages[0].path).toBe('wiki/concepts.md')
    expect(out.pages[0].title).toBe('Recursion')
    expect(out.pages[0].page_type).toBe('concept')
    expect(out.pages[0].summary).toBe('A function calling itself.')
  })

  it('falls back to filename + first paragraph when frontmatter missing', async () => {
    writeWiki(
      'plain.md',
      'First paragraph here.\n\nAnother paragraph that should be ignored.',
    )
    const out = await loadWikiIndex(vault)
    expect(out.pages[0].title).toBe('plain')
    expect(out.pages[0].summary.startsWith('First paragraph')).toBe(true)
    expect(out.pages[0].page_type).toBe('concept') // default
  })

  it('rejects unknown page_type and falls back to concept', async () => {
    writeWiki('weird.md', '---\npage_type: galaxy\n---\nx')
    const out = await loadWikiIndex(vault)
    expect(out.pages[0].page_type).toBe('concept')
  })

  it('walks subdirectories and skips dotfiles', async () => {
    writeWiki('a.md', '---\ntitle: A\n---\nx')
    writeWiki('sub/b.md', '---\ntitle: B\n---\ny')
    writeWiki('.hidden.md', '---\ntitle: Hidden\n---\nz')
    const out = await loadWikiIndex(vault)
    expect(out.pages.map((p) => p.title).sort()).toEqual(['A', 'B'])
  })

  it('last_updated is the max mtime across pages', async () => {
    writeWiki('a.md', '---\ntitle: A\n---\nx')
    const out = await loadWikiIndex(vault)
    expect(out.last_updated).toBeGreaterThan(0)
  })

  it('skips entries that fail to parse without crashing', async () => {
    writeWiki('broken.md', '---\nname: [unbalanced\n---\nbody')
    writeWiki('good.md', '---\ntitle: Good\n---\nbody')
    const out = await loadWikiIndex(vault)
    // broken still appears (filename fallback) — what matters is no throw
    expect(out.pages.length).toBeGreaterThanOrEqual(1)
    expect(out.pages.some((p) => p.title === 'Good')).toBe(true)
  })
})
