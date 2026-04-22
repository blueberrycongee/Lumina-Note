/**
 * Built-in skills — shipped with the app, always available regardless of vault.
 *
 * Each entry mirrors the shape produced by parsing a `.skills/*.md` file:
 * frontmatter fields live on SkillInfo, the Markdown body is the `prompt`.
 */

import type { SkillDetail, SkillInfo } from './loader.js'

const WIKI_SYNC_PROMPT = `You are now acting as the **Lumina Wiki Synthesizer**.
Your job: keep \`wiki/\` (relative to the vault root) in sync with the user's source notes.

## When given a specific note path

1. Read the source note. Distill the key claims, definitions, and links worth surfacing in the wiki.
2. Search \`wiki/\` for existing entries that overlap with this note's topics. Prefer extending an existing entry over creating a new one.
3. Edit existing wiki entries or create new ones. Each wiki file must have:
   - YAML frontmatter with \`title\`, \`source_paths\` (array of relative paths of the contributing source notes), and \`updated_at\` (ISO 8601 timestamp).
   - Inline \`[[wikilink]]\` references back to the original source notes.
   - Concise prose — the wiki is a synthesis layer, not a copy of the note.
4. When finished, summarize what you changed in one short paragraph.

## When no specific note is given

Scan the vault for notes that should be represented in the wiki but aren't. List them and ask the user which ones to synthesize, or synthesize all if the user confirms.

## Constraints

- Never delete user source notes. You may remove obsolete wiki entries that you previously created.
- If a source note is empty or trivially short, write a brief stub — do not fabricate content.
- Respond in the user's language.`

const BUILTIN_SKILLS: SkillDetail[] = [
  {
    info: {
      name: 'wiki-sync',
      title: 'Wiki Synthesizer',
      description: 'Read vault notes and synthesize/update wiki pages in wiki/',
      tags: ['wiki', 'knowledge', 'synthesis'],
      triggers: ['wiki', 'synthesize wiki', 'sync wiki', 'update wiki'],
      tools: ['read', 'write', 'edit', 'glob', 'grep'],
      source: 'builtin',
    },
    prompt: WIKI_SYNC_PROMPT,
    markdown: '',
  },
]

export function listBuiltinSkills(): SkillInfo[] {
  return BUILTIN_SKILLS.map((s) => s.info)
}

export function getBuiltinSkill(name: string): SkillDetail | null {
  return BUILTIN_SKILLS.find((s) => s.info.name === name) ?? null
}
