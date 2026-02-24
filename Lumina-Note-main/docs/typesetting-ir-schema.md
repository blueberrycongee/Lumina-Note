# Typesetting IR Schema (Draft v1)

Goal: Provide a stable, AI-editable structural IR that becomes the single source of truth for layout/render/export.

## Principles
- Stable IDs for every node (block + inline).
- Block/inline separation.
- Style is referenced by `styleId` (shared style registry to be added later).
- Keep structure lossless enough to round-trip docx.

## Document Shape (high level)
```json
{
  "version": 1,
  "id": "doc_...",
  "meta": {
    "title": "...",
    "author": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "blocks": [/* block nodes */],
  "headers": [/* block nodes */],
  "footers": [/* block nodes */]
}
```

## Block Nodes
- `paragraph`: text runs
- `heading`: level 1-6
- `list`: ordered/unordered, nested items
- `table`: rows/cells with nested blocks
- `image`: embed id + size hints
- `pageBreak`
- `sectionBreak`

## Inline Nodes
- `text`: leaf text with marks
- `span`: inline grouping with marks/style
- `link`: hyperlink
- `lineBreak`

## Example
```json
{
  "version": 1,
  "id": "doc_01",
  "blocks": [
    {
      "id": "p_01",
      "type": "paragraph",
      "children": [
        { "id": "t_01", "type": "text", "text": "Hello ", "marks": [] },
        { "id": "t_02", "type": "text", "text": "world", "marks": ["bold"] }
      ]
    },
    { "id": "pb_01", "type": "pageBreak" }
  ]
}
```

## Operation Hints (for AI)
- Insert: add a node before/after a target id.
- Replace: swap a node by id.
- Move: move a node into another container by id.
- Style: apply/replace `styleId` or `marks`.

## References
- Runtime schema: `src/typesetting/irSchema.ts`
- Draft converter: `src/typesetting/docxToIr.ts`
