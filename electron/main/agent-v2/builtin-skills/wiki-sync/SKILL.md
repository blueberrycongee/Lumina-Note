---
name: wiki-sync
description: Synthesize a single source note into the vault's wiki/ folder — read the source, find or create the right wiki entry, write it back with proper frontmatter and source links. Used by Lumina's background wiki manager when a note changes.
---

# Wiki synthesis playbook

Lumina maintains a `wiki/` folder inside each vault that distills the user's source notes into a navigable knowledge layer. When this skill is invoked you are told the path of one source note that just changed, and your job is to update `wiki/` accordingly.

## Steps

1. **Read the source note.** Use the `read` tool on the relative path you were given. Distill the key claims, definitions, and references worth surfacing — *not* a full copy of the note.

2. **Survey existing wiki entries.** Use `list` on `wiki/` to see what's already there. Use `glob` (`wiki/**/*.md`) and `grep` (relevant terms) to find entries that overlap with the source note's topics. **Prefer extending an existing entry** over creating a new one — duplication makes the wiki worse, not better.

3. **Decide write strategy:**
   - **Update existing entry**: use `edit` for surgical changes when the entry exists and the source adds incremental information.
   - **Create new entry**: use `write` only when the topic genuinely has no home yet. Path: `wiki/<topic-slug>.md`.

4. **Wiki file format.** Every wiki entry must have:
   - YAML frontmatter:
     ```yaml
     ---
     title: <Human-readable title>
     source_paths: [<rel/path/to/source.md>, ...]
     updated_at: <ISO 8601 timestamp>
     ---
     ```
   - When you extend an existing entry, **append the source path to `source_paths`** and update `updated_at`. Don't overwrite.
   - Body: concise prose. The wiki is a synthesis layer, not a copy. Cite source notes inline using `[[wiki link]]` syntax referring to the source's relative path or title.

5. **Done signal.** When you're finished, respond with **one paragraph** summarising what you changed (which wiki files updated, which created). **Do not call more tools after this summary.**

## Constraints

- **Do not run shell commands.** Wiki sync runs in the background and shell access is not available.
- **Stay inside the vault.** Read and write paths are confined to the vault root by the agent's permission policy — going outside will fail.
- **Do not delete user source notes.** You may delete obsolete wiki entries you previously created (i.e., entries whose `source_paths` all point at removed notes).
- **Stub instead of fabricate.** If the source note is empty or trivially short, write a brief stub (1–2 sentences) instead of inventing content.
- **Don't add empty wiki entries.** If the source has nothing worth synthesising, just say so in your summary and skip the write.

## Common pitfalls

- **Creating a new wiki entry when one already exists.** Always grep first.
- **Copying source content verbatim.** The wiki should distill, not mirror.
- **Forgetting to update `updated_at`.** This breaks the wiki's freshness signals.
- **Using shell to find files.** Use `glob` and `grep`. Shell isn't registered for this agent.
