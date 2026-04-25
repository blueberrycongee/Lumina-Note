# Block Editor Toggle (Default Off)

Date: 2026-04-25
Status: Approved, ready for implementation

## Problem

`blockEditorExtensions` (defined in `src/editor/extensions/blockEditor.ts`)
is wired into the `live` and `source` editor modes by default. It adds:

- six-dot block handle on every non-empty block
- `+` button on every empty paragraph / empty line
- combined block menu (`lumina-block-menu` event) and insert menu
- block drag-and-drop with ghost + drop indicator
- block hover / selected surface highlight

For users who treat the app as a pure-Markdown editor, these affordances
are visual noise. The product should default to a clean Markdown surface
and let the user opt in to block-style editing from settings.

## Design

### State

`useUIStore` gains:

- `blockEditorEnabled: boolean` — default `false`
- `setBlockEditorEnabled(enabled: boolean)`
- `blockEditorEnabled` is added to `partializeUIState` so it persists in
  the existing `lumina-ui` zustand store (no new persist key, no migration
  needed — missing field falls back to default `false`)

### Editor wiring

In `src/editor/CodeMirrorEditor.tsx`, the extensions `useMemo` already
rebuilds the extension array per `mode`. The change:

- read `blockEditorEnabled` from `useUIStore`
- in the `live` branch, conditionally spread `...blockEditorExtensions`
- in the `source` branch, conditionally spread `...blockEditorExtensions`
  (when disabled, that branch reduces to `[calloutStateField]`, which is
  the pre-block-editor baseline)
- add `blockEditorEnabled` to the `useMemo` dependency list so toggling
  the switch rebuilds the EditorState — same mechanism as switching
  `mode`. Document content survives because the rebuild reuses the doc;
  undo history resets, which is acceptable for a low-frequency toggle.

`BlockMenu` (the React popover in `CodeMirrorEditor.tsx`) does not need
to change. It only opens in response to the `lumina-block-menu` window
event, which is dispatched from inside `blockEditorExtensions`. When the
extension is not loaded, no event fires, so the menu can never open.

### UI

In `src/components/settings/GeneralSection.tsx`, inside the existing
"Editor" section (`<section>` containing `defaultEditMode` and
`editorFontSize`), add a new row directly under the edit-mode select:

```
┌────────────────────────────────────────────────────────────────┐
│  块编辑器交互                                       [○────●]   │
│  启用块手柄、+ 按钮、块菜单和拖拽排序                            │
└────────────────────────────────────────────────────────────────┘
```

Markup mirrors the existing rows in this section (label + description on
the left, control on the right). The control is a checkbox styled with
the project's existing toggle visual language, or a plain native checkbox
if no shared toggle component exists — match what the codebase already
has rather than introducing a new one.

### i18n

Add two keys to all four locale files
(`src/i18n/locales/{en,zh-CN,zh-TW,ja}.ts`) under `settingsModal`:

- `blockEditor` — toggle title
- `blockEditorDesc` — toggle description

Suggested copy (final wording can be adjusted in implementation):

| locale | blockEditor          | blockEditorDesc                                         |
| ------ | -------------------- | ------------------------------------------------------- |
| zh-CN  | 块编辑器交互         | 启用块手柄、块菜单和拖拽排序;关闭后编辑器为纯 Markdown    |
| zh-TW  | 區塊編輯器互動       | 啟用區塊手柄、區塊選單和拖曳排序;關閉後編輯器為純 Markdown |
| en     | Block editor         | Enable block handles, block menu, and drag-to-reorder.  |
| ja     | ブロックエディタ     | ブロックハンドル、ブロックメニュー、ドラッグ並べ替えを有効化 |

`Record<Locale, typeof zhCN>` in `src/i18n/index.ts` enforces all four
locales to keep the keys in sync — TypeScript will fail compilation if
any locale is missing them.

## Tests

- `useUIStore` unit: default value is `false`; `setBlockEditorEnabled`
  flips it; persist round-trip preserves the value (only if there is
  already a store unit-test pattern; otherwise inline the assertion in
  the GeneralSection or CodeMirrorEditor test)
- `GeneralSection` test: the toggle row renders, label/description come
  from i18n, clicking calls the setter
- `CodeMirrorEditor` integration: with `blockEditorEnabled = false`, the
  rendered editor contains no `.cm-block-handle` or `.cm-block-plus-btn`;
  flipping the store value to `true` causes those decorations to appear

## Non-Goals

- No CodeMirror Compartment refactor. The existing `mode`-driven rebuild
  is the same mechanism, and consistency outweighs preserving undo
  history for this toggle.
- No data migration. New users see `false`; existing users get `false`
  on next launch (zustand persist falls back to the default for missing
  fields).
- No "restart required" prompt. The toggle takes effect immediately on
  the open editor.
- No per-file or per-vault override. Single global preference.

## Rejected Alternatives

- **Compartment-based hot reconfigure.** Avoids EditorState rebuild and
  preserves undo. Adds complexity and is inconsistent with how `mode`
  changes already work. Toggling is rare; rebuild cost is invisible.
- **Restart prompt.** Cheap to implement, poor UX. Rejected during
  brainstorming.
- **Separate "Experimental features" tab.** Premature. Block editor is
  the only such toggle today; adding a tab for one row is over-design.
