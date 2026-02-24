# Typesetting IR Operations (Draft)

Goal: Provide a minimal, stable instruction set for AI-driven edits over the IR layer.

## Core operations
- `insert`: insert a block relative to a target node.
- `replace`: replace a block node by id.
- `delete`: remove a node by id.
- `move`: move a node before/after/inside another node.
- `style`: update `styleId` or marks on a target node.
- `replaceInline`: swap a single inline node by id.

## Targeting
- `id`: stable node id (required).
- `path`: optional index path to disambiguate nodes under the same parent.

## Example
```json
{
  "op": "insert",
  "target": { "id": "p_01" },
  "position": "after",
  "block": {
    "id": "p_02",
    "type": "paragraph",
    "children": [
      { "id": "t_03", "type": "text", "text": "New paragraph" }
    ]
  }
}
```

## References
- Type definitions: `src/typesetting/irOps.ts`
- IR schema: `src/typesetting/irSchema.ts`
