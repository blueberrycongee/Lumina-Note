# Editor Font Size Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a font size slider with live preview to the settings modal, allowing users to adjust editor font size (10-32px).

**Architecture:** Store font size in useUIStore (persisted), display slider in SettingsModal editor section, apply to CodeMirrorEditor via Compartment reconfiguration.

**Tech Stack:** React, Zustand, CodeMirror 6, TailwindCSS

---

## Task 1: Add editorFontSize to useUIStore

**Files:**
- Modify: `src/stores/useUIStore.ts:15-89` (interface), `src/stores/useUIStore.ts:91-195` (implementation)

**Step 1: Add state field and setter to interface**

Add to `UIState` interface after line 88:
```typescript
  // Editor font size
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
```

**Step 2: Add implementation**

Add to store implementation after `setDiagnosticsEnabled`:
```typescript
      // Editor font size (10-32px)
      editorFontSize: 16,
      setEditorFontSize: (size) => set({ editorFontSize: Math.max(10, Math.min(32, size)) }),
```

**Step 3: Commit**

```bash
git add src/stores/useUIStore.ts
git commit -m "feat(store): add editorFontSize to useUIStore"
```

---

## Task 2: Add i18n translations

**Files:**
- Modify: `src/i18n/locales/en.ts:1056-1061`
- Modify: `src/i18n/locales/zh-CN.ts` (same location)
- Modify: `src/i18n/locales/ja.ts` (same location)
- Modify: `src/i18n/locales/zh-TW.ts` (same location)

**Step 1: Add English translations**

After `readingMode` in settingsModal.editor section:
```typescript
    editorFontSize: 'Editor Font Size',
    editorFontSizeDesc: 'Adjust the font size for the editor (10-32px)',
    fontPreview: 'Preview',
```

**Step 2: Add Chinese (Simplified) translations**

```typescript
    editorFontSize: '编辑器字体大小',
    editorFontSizeDesc: '调整编辑器的字体大小 (10-32px)',
    fontPreview: '预览',
```

**Step 3: Add Japanese translations**

```typescript
    editorFontSize: 'エディタのフォントサイズ',
    editorFontSizeDesc: 'エディタのフォントサイズを調整 (10-32px)',
    fontPreview: 'プレビュー',
```

**Step 4: Add Chinese (Traditional) translations**

```typescript
    editorFontSize: '編輯器字體大小',
    editorFontSizeDesc: '調整編輯器的字體大小 (10-32px)',
    fontPreview: '預覽',
```

**Step 5: Commit**

```bash
git add src/i18n/locales/
git commit -m "feat(i18n): add font size setting translations"
```

---

## Task 3: Add font size slider UI to SettingsModal

**Files:**
- Modify: `src/components/layout/SettingsModal.tsx:250-283`

**Step 1: Import useUIStore editorFontSize**

Update the destructure on line 37:
```typescript
const { themeId, setThemeId, editorMode, setEditorMode, editorFontSize, setEditorFontSize } = useUIStore();
```

**Step 2: Add slider UI after editor mode selector**

Insert after the editor mode `</div>` (around line 282), before `</section>`:

```tsx
            {/* 字体大小 */}
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.settingsModal.editorFontSize}</p>
                  <p className="text-sm text-muted-foreground">{t.settingsModal.editorFontSizeDesc}</p>
                </div>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{editorFontSize}px</span>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-6">10</span>
                <input
                  type="range"
                  min={10}
                  max={32}
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-xs text-muted-foreground w-6">32</span>
              </div>

              {/* Preview */}
              <div
                className="p-3 rounded-lg border border-border bg-background/60"
                style={{ fontSize: `${editorFontSize}px` }}
              >
                <p className="leading-relaxed">The quick brown fox</p>
                <p className="leading-relaxed">敏捷的棕色狐狸 123</p>
              </div>
            </div>
```

**Step 3: Commit**

```bash
git add src/components/layout/SettingsModal.tsx
git commit -m "feat(settings): add font size slider with preview"
```

---

## Task 4: Apply dynamic font size to CodeMirrorEditor

**Files:**
- Modify: `src/editor/CodeMirrorEditor.tsx:4` (imports)
- Modify: `src/editor/CodeMirrorEditor.tsx:55-58` (compartment)
- Modify: `src/editor/CodeMirrorEditor.tsx:78-79` (theme)

**Step 1: Add editorFontSize to useUIStore import**

The component already imports useUIStore. Add `editorFontSize` to the destructure where it's used.

**Step 2: Create a font size compartment**

Add after line 58:
```typescript
const fontSizeCompartment = new Compartment();
```

**Step 3: Create dynamic theme function**

Replace hardcoded `editorTheme` with a function:
```typescript
const createEditorTheme = (fontSize: number) => EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: `${fontSize}px`, height: "100%" },
  // ... rest of theme unchanged
});
```

**Step 4: Apply compartment in editor setup and add effect to update**

Use `fontSizeCompartment.of(createEditorTheme(editorFontSize))` in extensions and add useEffect to reconfigure when fontSize changes.

**Step 5: Commit**

```bash
git add src/editor/CodeMirrorEditor.tsx
git commit -m "feat(editor): apply dynamic font size from store"
```

---

## Task 5: Verify and test

**Steps:**
1. Run `npm run dev` and open the app
2. Go to Settings > Editor section
3. Adjust slider and verify preview updates
4. Close settings and verify editor font size changed
5. Refresh app and verify font size persisted

**Commit:**
```bash
git commit --allow-empty -m "test: verify font size settings functionality"
```
