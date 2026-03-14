# Callout Redesign Design

## Goal

Redesign callout rendering for both CodeMirror editor and markdown preview to achieve a modern Notion-style appearance with consistent visuals, fold/unfold support, and live-preview editing.

## Visual Style

Notion-style: no left border, solid low-saturation background block, large emoji icon, `border-radius: 0.375rem`.

Layout:
```
+-------------------------------+
|  [icon]  Title Text        [>]|
|          Content paragraph    |
|          More content...      |
+-------------------------------+
```

- `padding: 1rem 1.25rem`
- Icon (1.5em) top-aligned left, title + content stacked right
- Fold arrow on title row right side
- Title: `font-weight: 600`, deeper shade of background color
- Content: same `font-size` as body text

## Color System (6 colors, light/dark)

| Type   | Light bg            | Dark bg             |
|--------|---------------------|---------------------|
| blue   | `hsl(210 30% 95%)` | `hsl(210 25% 18%)` |
| green  | `hsl(140 25% 95%)` | `hsl(140 20% 18%)` |
| yellow | `hsl(45 35% 94%)`  | `hsl(45 25% 18%)`  |
| red    | `hsl(0 30% 96%)`   | `hsl(0 25% 18%)`   |
| purple | `hsl(270 25% 96%)` | `hsl(270 20% 18%)` |
| gray   | `hsl(0 0% 95%)`    | `hsl(0 0% 20%)`    |

Saturation unified at 25-35% for consistent visual weight.
Title color: same hue, lower lightness (e.g. blue title `hsl(210 30% 40%)` light / `hsl(210 30% 75%)` dark).

## Fold/Unfold

- Syntax: `> [!type]+` default open, `> [!type]-` default closed, no symbol = open
- Collapsed: show icon + title only, content hidden
- Click title row or arrow to toggle
- Fold state is runtime-only (not written back to file)

## Editor Interaction (Live Preview)

- **Inactive**: rendered as complete Notion-style block via `Decoration.replace` widget
- **Active (clicked)**: switch to editable source with light background + left border hint
- **Blur**: return to rendered state

Implementation: replace current `StateField` line decorations with `Decoration.replace` widget for inactive callouts. On cursor-inside, fall back to line decorations for editing.

## Shared Config

Extract `CALLOUT_CONFIG` (type -> icon/color mapping) into `src/editor/calloutConfig.ts`, shared by:
- `CodeMirrorEditor.tsx` (editor decorations)
- `markdown.ts` (preview renderer)

Unify type coverage: add missing types in preview (`summary`, `hint`, `check`, `done`, `info`, `success`, `question`, `example`).

## Icon Handling

Keep emoji icons. Fix display by:
- Enlarging to 1.5em
- Using independent flex container for alignment
- Vertical align to top of content area

## Files to Modify

1. `src/editor/calloutConfig.ts` (new) - shared config
2. `src/editor/CodeMirrorEditor.tsx` - widget decoration, fold state, active/inactive logic
3. `src/styles/globals.css` - new callout styles
4. `src/services/markdown/markdown.ts` - unified preview rendering
5. `src/services/markdown/markdown.test.ts` - update tests
