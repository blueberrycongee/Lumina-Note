# Block Editor Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the block editor (handles, +button, block menu, drag-reorder) opt-in via a new "块编辑器交互" switch in Settings → 通用 → 编辑器, default off, immediately effective.

**Architecture:** Add `blockEditorEnabled` to `useUIStore` (persisted via existing zustand persist). Conditionally spread `blockEditorExtensions` in `CodeMirrorEditor`'s mode-switched extensions factory, with `blockEditorEnabled` as a `useMemo` dependency so toggling rebuilds EditorState the same way `mode` changes already do. Render the switch in `GeneralSection.tsx` next to "默认编辑模式".

**Tech Stack:** React, Zustand (persist middleware), CodeMirror 6, Vitest, four locale files (`en/zh-CN/zh-TW/ja`).

**Reference design doc:** `docs/plans/2026-04-25-block-editor-toggle-design.md`

---

## Task 1: Add `blockEditor` / `blockEditorDesc` keys to all four locales

**Files:**
- Modify: `src/i18n/locales/zh-CN.ts` (under `settingsModal`, near `defaultEditMode` block at lines ~1166-1172)
- Modify: `src/i18n/locales/zh-TW.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/ja.ts`

**Step 1: Add keys to `zh-CN.ts`**

Find the `settingsModal` block. After the existing `editorFontSize` / `editorFontSizeDesc` lines (or anywhere inside `settingsModal`), add:

```ts
    blockEditor: "块编辑器交互",
    blockEditorDesc: "启用块手柄、块菜单和拖拽排序;关闭后编辑器为纯 Markdown",
```

**Step 2: Add the same keys to `zh-TW.ts`**

```ts
    blockEditor: "區塊編輯器互動",
    blockEditorDesc: "啟用區塊手柄、區塊選單和拖曳排序;關閉後編輯器為純 Markdown",
```

**Step 3: Add the same keys to `en.ts`**

```ts
    blockEditor: "Block editor",
    blockEditorDesc: "Enable block handles, block menu, and drag-to-reorder.",
```

**Step 4: Add the same keys to `ja.ts`**

```ts
    blockEditor: "ブロックエディタ",
    blockEditorDesc: "ブロックハンドル、ブロックメニュー、ドラッグ並べ替えを有効化",
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: PASS (no errors). `Record<Locale, typeof zhCN>` enforces all four locales stay in sync; if any locale is missing the keys, this fails.

**Step 6: Run i18n tests**

Run: `npx vitest run src/i18n`
Expected: PASS (existing tests, including `authLocaleConsistency.test.ts`, still pass).

**Step 7: Commit**

```bash
git add src/i18n/locales
git commit -m "feat(i18n): add block editor toggle strings to all locales"
```

---

## Task 2: Add `blockEditorEnabled` field to `useUIStore` (TDD)

**Files:**
- Modify: `src/stores/useUIStore.ts`
- Test: `src/stores/useUIStore.test.ts`

**Step 1: Write the failing test**

Open `src/stores/useUIStore.test.ts`. Add this `it` block at the bottom of the existing `describe("useUIStore", ...)`:

```ts
  it("defaults blockEditorEnabled to false and persists changes", async () => {
    const { useUIStore } = await loadStore();

    expect(useUIStore.getState().blockEditorEnabled).toBe(false);

    useUIStore.getState().setBlockEditorEnabled(true);

    expect(useUIStore.getState().blockEditorEnabled).toBe(true);
    const persisted = parsePersistedState("lumina-ui");
    expect(persisted.blockEditorEnabled).toBe(true);
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/useUIStore.test.ts -t "blockEditorEnabled"`
Expected: FAIL — `blockEditorEnabled` is not on state, `setBlockEditorEnabled` is not a function.

**Step 3: Add the field, setter, persist key, and TS type**

In `src/stores/useUIStore.ts`:

1. Inside `interface UIState` (somewhere near the editor mode block, ~line 60-62), add:

```ts
  // Block editor (handles, +button, block menu, drag-reorder)
  blockEditorEnabled: boolean;
  setBlockEditorEnabled: (enabled: boolean) => void;
```

2. Inside `partializeUIState` (~line 101-120), add the field so it persists:

```ts
  editorMode: state.editorMode,
  blockEditorEnabled: state.blockEditorEnabled,   // <- new
  splitView: state.splitView,
```

3. Inside the `create<UIState>()(persist((set) => ({...})))` body, near the editor mode default (~line 198-200), add the default and setter:

```ts
      // Editor mode - default to live preview
      editorMode: "live",
      setEditorMode: (mode) => set({ editorMode: mode }),

      // Block editor — default off; user opts in via Settings
      blockEditorEnabled: false,
      setBlockEditorEnabled: (enabled) => set({ blockEditorEnabled: enabled }),
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/useUIStore.test.ts -t "blockEditorEnabled"`
Expected: PASS.

**Step 5: Run the full UIStore test file to confirm no regression**

Run: `npx vitest run src/stores/useUIStore.test.ts`
Expected: PASS (all 5 cases now: theme toggle, set theme, persist durable, skip transient, legacy migration, blockEditorEnabled).

**Step 6: Type check**

Run: `npx tsc --noEmit --pretty`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/stores/useUIStore.ts src/stores/useUIStore.test.ts
git commit -m "feat(ui-store): add blockEditorEnabled flag (default off, persisted)"
```

---

## Task 3: Render the toggle in `GeneralSection` (TDD)

**Files:**
- Modify: `src/components/settings/GeneralSection.tsx` (insert toggle row inside the "Editor" section, after the `defaultEditMode` row at ~line 195-209, before the `editorFontSize` row at ~line 211-241)
- Modify: `src/components/layout/SettingsModal.test.tsx` (extend the `useUIStore` and `useLocaleStore` mocks; add a test asserting the toggle row renders and clicking it calls `setBlockEditorEnabled`)

**Step 1: Write the failing test**

Open `src/components/layout/SettingsModal.test.tsx`. Find the `vi.mock("@/stores/useUIStore", ...)` block (~line 26-39) and extend the returned object to capture the setter and seed the new field:

```ts
const setBlockEditorEnabledMock = vi.fn();

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: () => ({
    themeId: "default",
    setThemeId: () => undefined,
    editorMode: "live",
    setEditorMode: () => undefined,
    editorFontSize: 16,
    setEditorFontSize: () => undefined,
    proxyUrl: "",
    proxyEnabled: false,
    setProxyUrl: () => undefined,
    setProxyEnabled: () => undefined,
    blockEditorEnabled: false,                      // <- new
    setBlockEditorEnabled: setBlockEditorEnabledMock, // <- new
  }),
}));
```

(Hoist `setBlockEditorEnabledMock` via `vi.hoisted` like the existing `getVersionMock`, since `vi.mock` is also hoisted — see existing pattern at the top of the file.)

In the same test file, find the `useLocaleStore` mock and add the two new keys to the `settingsModal` object:

```ts
        settingsModal: {
          // ...existing keys...
          blockEditor: "Block editor",
          blockEditorDesc: "Enable block handles, block menu, and drag-to-reorder.",
        },
```

Then add a new test inside the existing `describe(...)`:

```ts
  it("renders the block editor toggle and toggles state on click", async () => {
    render(
      <SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={() => undefined} />,
    );

    const toggle = await screen.findByRole("switch", { name: /block editor/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(setBlockEditorEnabledMock).toHaveBeenCalledWith(true);
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/SettingsModal.test.tsx -t "block editor toggle"`
Expected: FAIL — no element with role `switch` named "block editor".

**Step 3: Implement the toggle row in `GeneralSection.tsx`**

In `src/components/settings/GeneralSection.tsx`:

1. Pull the new field from the store hook (~line 17):

```tsx
  const {
    themeId, setThemeId,
    editorMode, setEditorMode,
    editorFontSize, setEditorFontSize,
    blockEditorEnabled, setBlockEditorEnabled,   // <- new
  } = useUIStore();
```

2. Insert the toggle row between the existing `defaultEditMode` row (`</div>` at ~line 209) and the `editorFontSize` row (`<div className="py-2 space-y-3">` at ~line 211). Use the same inline switch markup that `ProxySection.tsx:91-110` uses:

```tsx
        {/* 块编辑器交互 */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">{t.settingsModal.blockEditor}</p>
            <p className="text-sm text-muted-foreground">{t.settingsModal.blockEditorDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={blockEditorEnabled}
            aria-label={t.settingsModal.blockEditor}
            onClick={() => setBlockEditorEnabled(!blockEditorEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              blockEditorEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                blockEditorEnabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/SettingsModal.test.tsx -t "block editor toggle"`
Expected: PASS.

**Step 5: Run the full SettingsModal test file to confirm no regression**

Run: `npx vitest run src/components/layout/SettingsModal.test.tsx`
Expected: PASS (all existing tests + the new one).

**Step 6: Type check**

Run: `npx tsc --noEmit --pretty`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/components/settings/GeneralSection.tsx src/components/layout/SettingsModal.test.tsx
git commit -m "feat(settings): add block editor toggle in General → Editor"
```

---

## Task 4: Conditionally inject `blockEditorExtensions` in `CodeMirrorEditor` (TDD)

**Files:**
- Modify: `src/editor/CodeMirrorEditor.tsx`
- Test: `src/editor/CodeMirrorEditor.blockEditorToggle.test.tsx` (new)

**Step 1: Write the failing test**

Create `src/editor/CodeMirrorEditor.blockEditorToggle.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { setHoveredBlock } from "./extensions/blockEditor";
import { useUIStore } from "@/stores/useUIStore";

function setupEditor(content: string) {
  const onChange = vi.fn();
  const rendered = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />,
  );
  const editor = rendered.container.querySelector(".cm-editor");
  if (!editor) throw new Error("CodeMirror editor root not found");
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) throw new Error("EditorView instance not found");
  return { ...rendered, view, onChange };
}

function hoverBlock(view: EditorView, content: string) {
  vi.spyOn(view, "coordsAtPos").mockReturnValue({
    left: 180, right: 320, top: 48, bottom: 76,
  } as any);
  act(() => {
    view.dispatch({
      effects: setHoveredBlock.of({
        from: 0, to: content.length, type: "Paragraph", startLine: 1, endLine: 1,
      }),
    });
  });
}

describe("CodeMirrorEditor block editor toggle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    useUIStore.setState({ blockEditorEnabled: false });
  });

  it("does not render block decorations when blockEditorEnabled is false", () => {
    useUIStore.setState({ blockEditorEnabled: false });
    const content = "Plain paragraph";
    const { container, view } = setupEditor(content);

    // Even attempting to hover, the extension is not loaded so
    // setHoveredBlock effect has no listener and no decoration appears.
    hoverBlock(view, content);

    expect(container.querySelector(".cm-block-handle")).toBeNull();
    expect(container.querySelector(".cm-block-line")).toBeNull();
  });

  it("renders block handle when blockEditorEnabled is true", () => {
    useUIStore.setState({ blockEditorEnabled: true });
    const content = "Plain paragraph";
    const { container, view } = setupEditor(content);

    hoverBlock(view, content);

    expect(container.querySelector(".cm-block-handle")).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/CodeMirrorEditor.blockEditorToggle.test.tsx`
Expected: FAIL — first case currently fails because `blockEditorExtensions` is hardcoded; `.cm-block-handle` exists even with `blockEditorEnabled = false`.

**Step 3: Wire the flag through `CodeMirrorEditor.tsx`**

In `src/editor/CodeMirrorEditor.tsx`:

1. Find the existing `useUIStore` call(s). The editor already uses `useUIStore` via `useShallow` somewhere — locate it (search for `useUIStore`) and add `blockEditorEnabled` to the destructured selector. If no shared selector exists in the relevant scope, add a new line near where `mode` is read:

```tsx
const blockEditorEnabled = useUIStore((s) => s.blockEditorEnabled);
```

(Do not add a setter dependency — only the boolean.)

2. Find the `useMemo` extensions factory at line ~4369-4393. Replace the `live` and `source` branches with:

```tsx
        case "live":
          return [
            collapseOnSelectionFacet.of(true),
            livePreviewPlugin,
            tableEditorPlugin(),
            editableCodeBlockField,
            ...widgets,
            ...(blockEditorEnabled ? blockEditorExtensions : []),
          ];
        case "source":
        default:
          return [
            calloutStateField,
            ...(blockEditorEnabled ? blockEditorExtensions : []),
          ];
```

3. Update the `useMemo` dependency array (line ~4392) to include `blockEditorEnabled`:

```tsx
    },
    [resolvedFilePath, vaultPath, blockEditorEnabled],
  );
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/CodeMirrorEditor.blockEditorToggle.test.tsx`
Expected: PASS (both cases).

**Step 5: Run the existing block toolbar test to confirm no regression**

The existing `CodeMirrorEditor.blockToolbar.test.tsx` assumes the flag is on. Update it to set the flag before each test, or leave it alone if `useUIStore` retains state across tests in vitest's default mode — verify by running:

Run: `npx vitest run src/editor/CodeMirrorEditor.blockToolbar.test.tsx`
Expected: If FAIL because `blockEditorEnabled` defaults to `false`, add to the top of the file:

```ts
import { useUIStore } from "@/stores/useUIStore";

beforeEach(() => {
  useUIStore.setState({ blockEditorEnabled: true });
});
```

Re-run. Expected: PASS.

**Step 6: Run all editor tests for sanity**

Run: `npx vitest run src/editor`
Expected: PASS (all editor test files, including modeTransition, undoIntegration, codeblockEditing, jumpNavigation, interactionTrace).

**Step 7: Type check**

Run: `npx tsc --noEmit --pretty`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/editor/CodeMirrorEditor.tsx src/editor/CodeMirrorEditor.blockEditorToggle.test.tsx src/editor/CodeMirrorEditor.blockToolbar.test.tsx
git commit -m "feat(editor): gate block editor extensions on blockEditorEnabled flag"
```

---

## Task 5: End-to-end verification

**Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS (~843 tests, +3 new ones from Tasks 2/3/4).

**Step 2: Type check**

Run: `npx tsc --noEmit --pretty`
Expected: PASS.

**Step 3: Manual smoke (optional, not gating)**

If a Tauri dev server is available:
1. Launch the app with a fresh user profile (or clear `localStorage` `lumina-ui`).
2. Confirm the editor opens without block handles or `+` buttons.
3. Open Settings → 通用 → 编辑器 → toggle "块编辑器交互" on.
4. Confirm block handles and `+` buttons appear immediately on the open editor.
5. Toggle off — confirm they disappear immediately.
6. Reload the app — confirm the toggle state persists.

**Step 4: Final state check**

Run: `git log --oneline -5`
Expected: 4 new commits (i18n, store, settings UI, editor wiring) on top of `9a3c99c docs(editor): add block editor toggle design`.

---

## Rollback Notes

Each task is an independent commit, so rolling back the feature is `git revert <commit>` per task. Order of revert (safe direction): Task 4 → Task 3 → Task 2 → Task 1. Reverting Task 1 (locale keys) last avoids transient TypeScript errors during the revert sequence.
