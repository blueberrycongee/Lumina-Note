# Callout Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign callout rendering to Notion-style blocks with fold/unfold support and live-preview click-to-edit behavior.

**Architecture:** Extract shared callout config, rewrite CodeMirror decorations to use `Decoration.replace` widget for inactive callouts (with `shouldShowSource` for click-to-edit), update CSS to Notion style (no left border, solid bg, large emoji), add fold/unfold state management. Update markdown preview renderer to match.

**Tech Stack:** CodeMirror 6 (WidgetType, StateField, Decoration), CSS, marked (preview renderer)

---

### Task 1: Extract shared callout config

**Files:**
- Create: `src/editor/calloutConfig.ts`

**Step 1: Create the shared config file**

```typescript
// src/editor/calloutConfig.ts

export interface CalloutTypeConfig {
  icon: string;
  color: string;
}

export const CALLOUT_CONFIG: Record<string, CalloutTypeConfig> = {
  note:     { icon: '📝', color: 'blue' },
  abstract: { icon: '📄', color: 'blue' },
  summary:  { icon: '📄', color: 'blue' },
  info:     { icon: 'ℹ️', color: 'blue' },
  tip:      { icon: '💡', color: 'green' },
  hint:     { icon: '💡', color: 'green' },
  success:  { icon: '✅', color: 'green' },
  check:    { icon: '✅', color: 'green' },
  done:     { icon: '✅', color: 'green' },
  question: { icon: '❓', color: 'yellow' },
  warning:  { icon: '⚠️', color: 'yellow' },
  caution:  { icon: '⚠️', color: 'yellow' },
  danger:   { icon: '🔴', color: 'red' },
  failure:  { icon: '❌', color: 'red' },
  fail:     { icon: '❌', color: 'red' },
  missing:  { icon: '❌', color: 'red' },
  bug:      { icon: '🐛', color: 'red' },
  example:  { icon: '📋', color: 'purple' },
  quote:    { icon: '💬', color: 'gray' },
  cite:     { icon: '💬', color: 'gray' },
};

const EMOJI_REGEX = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;

export function isEmoji(str: string): boolean {
  return EMOJI_REGEX.test(str);
}

export function resolveCalloutType(rawType: string): { icon: string; color: string; label: string } {
  const type = rawType.toLowerCase();
  const emojiType = isEmoji(rawType);
  const config = emojiType
    ? { icon: rawType, color: 'blue' }
    : (CALLOUT_CONFIG[type] || { icon: '📝', color: 'gray' });
  const label = emojiType ? '' : type.charAt(0).toUpperCase() + type.slice(1);
  return { ...config, label };
}

/** Parse fold modifier from callout header: + (open), - (closed), none (open) */
export function parseFoldModifier(header: string): 'open' | 'closed' {
  const match = header.match(/^>\s*\[![^\]]+\]\s*([+-])/);
  if (match) return match[1] === '-' ? 'closed' : 'open';
  return 'open';
}

/** Match callout header line, returns [rawType, titleText, foldModifier] or null */
export function matchCalloutHeader(line: string): { rawType: string; title: string; foldable: boolean; defaultFolded: boolean } | null {
  const m = line.match(/^>\s*\[!([^\]]+)\]\s*([+-])?\s*(.*)?$/);
  if (!m) return null;
  const rawType = m[1].trim();
  const modifier = m[2] as '+' | '-' | undefined;
  const titleText = (m[3] || '').trim();
  const resolved = resolveCalloutType(rawType);
  return {
    rawType,
    title: titleText || resolved.label,
    foldable: modifier !== undefined,
    defaultFolded: modifier === '-',
  };
}
```

**Step 2: Commit**

```bash
git add src/editor/calloutConfig.ts
git commit -m "feat(callout): extract shared callout config with fold support"
```

---

### Task 2: Write tests for shared callout config

**Files:**
- Create: `src/editor/calloutConfig.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCalloutType, matchCalloutHeader, parseFoldModifier, isEmoji, CALLOUT_CONFIG } from './calloutConfig';

describe('calloutConfig', () => {
  describe('resolveCalloutType', () => {
    it('resolves known types', () => {
      expect(resolveCalloutType('note')).toEqual({ icon: '📝', color: 'blue', label: 'Note' });
      expect(resolveCalloutType('tip')).toEqual({ icon: '💡', color: 'green', label: 'Tip' });
      expect(resolveCalloutType('warning')).toEqual({ icon: '⚠️', color: 'yellow', label: 'Warning' });
    });

    it('is case-insensitive', () => {
      expect(resolveCalloutType('NOTE')).toEqual({ icon: '📝', color: 'blue', label: 'Note' });
      expect(resolveCalloutType('Warning')).toEqual({ icon: '⚠️', color: 'yellow', label: 'Warning' });
    });

    it('resolves emoji types with blue default', () => {
      const result = resolveCalloutType('🔥');
      expect(result.icon).toBe('🔥');
      expect(result.color).toBe('blue');
      expect(result.label).toBe('');
    });

    it('falls back to gray for unknown types', () => {
      expect(resolveCalloutType('unknown')).toEqual({ icon: '📝', color: 'gray', label: 'Unknown' });
    });
  });

  describe('matchCalloutHeader', () => {
    it('matches basic callout', () => {
      const result = matchCalloutHeader('> [!note] My Title');
      expect(result).toEqual({ rawType: 'note', title: 'My Title', foldable: false, defaultFolded: false });
    });

    it('matches callout with + modifier', () => {
      const result = matchCalloutHeader('> [!tip]+ Expanded');
      expect(result).toEqual({ rawType: 'tip', title: 'Expanded', foldable: true, defaultFolded: false });
    });

    it('matches callout with - modifier', () => {
      const result = matchCalloutHeader('> [!warning]- Collapsed');
      expect(result).toEqual({ rawType: 'warning', title: 'Collapsed', foldable: true, defaultFolded: true });
    });

    it('uses type label as default title', () => {
      const result = matchCalloutHeader('> [!danger]');
      expect(result?.title).toBe('Danger');
    });

    it('returns null for non-callout lines', () => {
      expect(matchCalloutHeader('> regular quote')).toBeNull();
      expect(matchCalloutHeader('not a quote')).toBeNull();
    });
  });

  describe('parseFoldModifier', () => {
    it('parses + as open', () => {
      expect(parseFoldModifier('> [!note]+ Title')).toBe('open');
    });

    it('parses - as closed', () => {
      expect(parseFoldModifier('> [!note]- Title')).toBe('closed');
    });

    it('defaults to open when no modifier', () => {
      expect(parseFoldModifier('> [!note] Title')).toBe('open');
    });
  });

  describe('isEmoji', () => {
    it('detects emoji', () => {
      expect(isEmoji('🔥')).toBe(true);
      expect(isEmoji('💡')).toBe(true);
    });

    it('rejects non-emoji', () => {
      expect(isEmoji('note')).toBe(false);
      expect(isEmoji('abc')).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/calloutConfig.test.ts`
Expected: PASS (config file already created in Task 1)

**Step 3: Commit**

```bash
git add src/editor/calloutConfig.test.ts
git commit -m "test(callout): add unit tests for shared callout config"
```

---

### Task 3: Rewrite CSS to Notion style

**Files:**
- Modify: `src/styles/globals.css:697-833` (replace entire callout section)

**Step 1: Replace callout CSS**

Remove everything from line 697 (`/* ===== Obsidian Callout Styles ===== */`) through line 832 (end of `.codemirror-wrapper .callout + .callout`).

Replace with new Notion-style CSS:

```css
/* ===== Callout Styles (Notion-style) ===== */

/* --- Base callout block --- */
.callout {
  display: flex;
  gap: 0.75rem;
  margin: 0.75rem 0;
  padding: 1rem 1.25rem;
  border-radius: 0.375rem;
  font-size: inherit;
  line-height: 1.6;
}

.callout-icon {
  flex-shrink: 0;
  font-size: 1.5em;
  line-height: 1;
  padding-top: 0.1em;
}

.callout-body {
  flex: 1;
  min-width: 0;
}

.callout-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.callout-fold {
  margin-left: auto;
  font-size: 0.75rem;
  opacity: 0.5;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.callout-fold:hover {
  opacity: 0.8;
}

.callout-folded .callout-fold {
  transform: rotate(-90deg);
}

.callout-content {
  margin-top: 0.375rem;
}

.callout-content p {
  margin: 0.375rem 0;
}

.callout-content p:first-child {
  margin-top: 0;
}

.callout-content p:last-child {
  margin-bottom: 0;
}

.callout-folded .callout-content {
  display: none;
}

/* --- Colors (light) --- */
.callout-blue   { background: hsl(210 30% 95%); }
.callout-green  { background: hsl(140 25% 95%); }
.callout-yellow { background: hsl(45 35% 94%); }
.callout-red    { background: hsl(0 30% 96%); }
.callout-purple { background: hsl(270 25% 96%); }
.callout-gray   { background: hsl(0 0% 95%); }

.callout-blue   .callout-title { color: hsl(210 40% 40%); }
.callout-green  .callout-title { color: hsl(140 35% 35%); }
.callout-yellow .callout-title { color: hsl(40 50% 35%); }
.callout-red    .callout-title { color: hsl(0 40% 40%); }
.callout-purple .callout-title { color: hsl(270 35% 42%); }
.callout-gray   .callout-title { color: hsl(0 0% 40%); }

/* --- Colors (dark) --- */
.dark .callout-blue   { background: hsl(210 25% 18%); }
.dark .callout-green  { background: hsl(140 20% 18%); }
.dark .callout-yellow { background: hsl(45 25% 18%); }
.dark .callout-red    { background: hsl(0 25% 18%); }
.dark .callout-purple { background: hsl(270 20% 18%); }
.dark .callout-gray   { background: hsl(0 0% 20%); }

.dark .callout-blue   .callout-title { color: hsl(210 40% 72%); }
.dark .callout-green  .callout-title { color: hsl(140 35% 68%); }
.dark .callout-yellow .callout-title { color: hsl(45 45% 68%); }
.dark .callout-red    .callout-title { color: hsl(0 40% 72%); }
.dark .callout-purple .callout-title { color: hsl(270 35% 74%); }
.dark .callout-gray   .callout-title { color: hsl(0 0% 70%); }

/* --- CodeMirror editor: editing mode (active callout) --- */
.codemirror-wrapper .callout-editing {
  margin: 0;
  padding: 0.15rem 0.75rem;
  border-radius: 0;
  border-left: 3px solid;
  display: block;
}

.codemirror-wrapper .callout-editing.callout-editing-first {
  border-top-left-radius: 0.375rem;
  border-top-right-radius: 0.375rem;
  padding-top: 0.5rem;
}

.codemirror-wrapper .callout-editing.callout-editing-last {
  border-bottom-left-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
  padding-bottom: 0.5rem;
}

.callout-editing.callout-blue   { border-color: hsl(210 40% 55%); }
.callout-editing.callout-green  { border-color: hsl(140 35% 50%); }
.callout-editing.callout-yellow { border-color: hsl(45 50% 55%); }
.callout-editing.callout-red    { border-color: hsl(0 40% 55%); }
.callout-editing.callout-purple { border-color: hsl(270 35% 55%); }
.callout-editing.callout-gray   { border-color: hsl(0 0% 55%); }

.dark .callout-editing.callout-blue   { border-color: hsl(210 40% 55%); }
.dark .callout-editing.callout-green  { border-color: hsl(140 35% 50%); }
.dark .callout-editing.callout-yellow { border-color: hsl(45 50% 55%); }
.dark .callout-editing.callout-red    { border-color: hsl(0 40% 55%); }
.dark .callout-editing.callout-purple { border-color: hsl(270 35% 55%); }
.dark .callout-editing.callout-gray   { border-color: hsl(0 0% 50%); }
```

**Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(callout): rewrite CSS to Notion-style with fold support"
```

---

### Task 4: Rewrite CodeMirror callout decorations

This is the largest task. Replace `CalloutIconWidget`, `CALLOUT_COLORS`, `CALLOUT_ICONS`, `buildCalloutDecorations`, and `calloutStateField` in `CodeMirrorEditor.tsx`.

**Files:**
- Modify: `src/editor/CodeMirrorEditor.tsx`
  - Lines ~799-816: Replace `CalloutIconWidget` with new `CalloutBlockWidget`
  - Lines ~2837-2927: Replace `CALLOUT_COLORS`, `CALLOUT_ICONS`, `buildCalloutDecorations`, `calloutStateField`

**Step 1: Add import for shared config at top of file**

At the imports section (around line 1-55), add:

```typescript
import { resolveCalloutType, matchCalloutHeader } from '@/editor/calloutConfig';
```

**Step 2: Replace `CalloutIconWidget` (lines ~799-816) with `CalloutBlockWidget`**

```typescript
class CalloutBlockWidget extends WidgetType {
  constructor(
    readonly icon: string,
    readonly title: string,
    readonly content: string,
    readonly color: string,
    readonly foldable: boolean,
    readonly defaultFolded: boolean,
  ) {
    super();
  }
  eq(other: CalloutBlockWidget) {
    return (
      other.icon === this.icon &&
      other.title === this.title &&
      other.content === this.content &&
      other.color === this.color &&
      other.foldable === this.foldable &&
      other.defaultFolded === this.defaultFolded
    );
  }
  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = `callout callout-${this.color}${this.defaultFolded ? ' callout-folded' : ''}`;

    const icon = document.createElement('span');
    icon.className = 'callout-icon';
    icon.textContent = this.icon;

    const body = document.createElement('div');
    body.className = 'callout-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'callout-title';

    const titleText = document.createElement('span');
    titleText.className = 'callout-title-text';
    titleText.textContent = this.title;
    titleRow.appendChild(titleText);

    if (this.foldable) {
      const fold = document.createElement('span');
      fold.className = 'callout-fold';
      fold.textContent = '▼';
      titleRow.appendChild(fold);

      titleRow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.toggle('callout-folded');
      });
    }

    body.appendChild(titleRow);

    if (this.content) {
      const contentEl = document.createElement('div');
      contentEl.className = 'callout-content';
      contentEl.innerHTML = this.content;
      body.appendChild(contentEl);
    }

    wrapper.appendChild(icon);
    wrapper.appendChild(body);
    return wrapper;
  }
  ignoreEvent(e: Event) {
    // Allow click events for fold toggle, but let CodeMirror handle focus
    return e.type === 'mousedown';
  }
}
```

**Step 3: Replace callout StateField section (lines ~2837-2927)**

Delete `CALLOUT_COLORS`, `CALLOUT_ICONS`, `buildCalloutDecorations`, `calloutStateField`.

Replace with:

```typescript
// ============ Callout StateField ============
let calloutPositionsCache: { from: number; to: number }[] = [];

function shouldShowCalloutSource(state: EditorState, from: number, to: number): boolean {
  const shouldCollapse = state.facet(collapseOnSelectionFacet);
  if (!shouldCollapse) return false;
  const isDragging = state.field(mouseSelectingField, false);
  if (isDragging) return false;
  return state.selection.ranges.some((range) => {
    if (range.from === range.to) {
      return range.from >= from && range.from <= to;
    }
    return range.from >= from && range.to <= to;
  });
}

function parseCalloutContent(doc: any, startLineNo: number): { lines: { from: number; text: string }[]; endLineNo: number } {
  const lines: { from: number; text: string }[] = [];
  let nextLineNo = startLineNo;
  while (nextLineNo <= doc.lines) {
    const nextLine = doc.line(nextLineNo);
    if (/^>\s?/.test(nextLine.text)) {
      lines.push({ from: nextLine.from, text: nextLine.text.replace(/^>\s?/, '') });
      nextLineNo++;
    } else if (nextLine.text.trim() === '') {
      // Empty line ends the callout
      break;
    } else {
      break;
    }
  }
  return { lines, endLineNo: nextLineNo };
}

function buildCalloutDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  calloutPositionsCache = [];
  let lineNo = 1;

  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    const header = matchCalloutHeader(line.text);
    if (!header) {
      lineNo++;
      continue;
    }

    const resolved = resolveCalloutType(header.rawType);

    // Collect all lines in this callout block
    const contentResult = parseCalloutContent(doc, lineNo + 1);
    const allLineFroms = [line.from, ...contentResult.lines.map(l => l.from)];
    const lastLineFrom = allLineFroms[allLineFroms.length - 1];
    const lastLine = doc.lineAt(lastLineFrom);
    const blockFrom = line.from;
    const blockTo = lastLine.to;

    calloutPositionsCache.push({ from: blockFrom, to: blockTo });

    if (shouldShowCalloutSource(state, blockFrom, blockTo)) {
      // Active: show source with line decorations (editing mode)
      allLineFroms.forEach((from, idx) => {
        let cls = `callout-editing callout-${resolved.color}`;
        if (idx === 0) cls += ' callout-editing-first';
        if (idx === allLineFroms.length - 1) cls += ' callout-editing-last';
        decorations.push(Decoration.line({ class: cls }).range(from));
      });
    } else {
      // Inactive: replace entire block with rendered widget
      const contentHtml = contentResult.lines
        .map(l => l.text)
        .filter(t => t.trim() !== '')
        .map(t => `<p>${t}</p>`)
        .join('');

      decorations.push(
        Decoration.replace({
          widget: new CalloutBlockWidget(
            resolved.icon,
            header.title,
            contentHtml,
            resolved.color,
            header.foldable,
            header.defaultFolded,
          ),
          block: true,
        }).range(blockFrom, blockTo),
      );
    }

    lineNo = contentResult.endLineNo;
  }

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

const calloutStateField = StateField.define<DecorationSet>({
  create: buildCalloutDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildCalloutDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildCalloutDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number; to: number }) =>
        calloutPositionsCache.some(
          (c) =>
            (sel.from >= c.from && sel.from <= c.to) ||
            (sel.to >= c.from && sel.to <= c.to) ||
            (sel.from <= c.from && sel.to >= c.to),
        );
      if (
        touches(oldSel) !== touches(newSel) ||
        (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
      ) {
        return buildCalloutDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: all existing tests pass

**Step 5: Commit**

```bash
git add src/editor/CodeMirrorEditor.tsx
git commit -m "feat(callout): rewrite editor decorations with widget blocks and click-to-edit"
```

---

### Task 5: Update markdown preview renderer

**Files:**
- Modify: `src/services/markdown/markdown.ts:1-70`

**Step 1: Replace callout rendering in `markdown.ts`**

Replace the `calloutTypes` constant (lines 7-20) and update the `renderer.blockquote` function (lines 31-70).

Remove `calloutTypes` and the `isEmoji` function. Import from shared config instead:

```typescript
import { resolveCalloutType, isEmoji } from '@/editor/calloutConfig';
```

Update `renderer.blockquote`:

```typescript
renderer.blockquote = function (quote: string | { text: string }) {
  try {
    const text = typeof quote === "string" ? quote : (quote?.text || "");
    const calloutMatch = text.match(/^\s*\[!([^\]]+)\]\s*([+-])?\s*(.*)$/m);

    if (calloutMatch) {
      const rawType = calloutMatch[1].trim();
      const modifier = calloutMatch[2] as '+' | '-' | undefined;
      const titleText = (calloutMatch[3] || '').trim();
      const resolved = resolveCalloutType(rawType);
      const title = titleText || resolved.label;
      const foldable = modifier !== undefined;
      const folded = modifier === '-';

      const content = text.replace(/^\s*\[![^\]]+\].*$/m, "").trim();

      const foldArrow = foldable ? `<span class="callout-fold">▼</span>` : '';
      const foldedClass = folded ? ' callout-folded' : '';

      return `
        <div class="callout callout-${resolved.color}${foldedClass}">
          <span class="callout-icon">${resolved.icon}</span>
          <div class="callout-body">
            <div class="callout-title">
              <span class="callout-title-text">${title}</span>
              ${foldArrow}
            </div>
            <div class="callout-content">${content}</div>
          </div>
        </div>
      `;
    }

    return `<blockquote>${text}</blockquote>`;
  } catch (e) {
    const text = typeof quote === "string" ? quote : (quote?.text || String(quote));
    return `<blockquote>${text}</blockquote>`;
  }
};
```

**Step 2: Run tests**

Run: `npx vitest run src/services/markdown/markdown.test.ts`
Expected: some tests may fail due to changed HTML structure

**Step 3: Update markdown tests**

In `src/services/markdown/markdown.test.ts`, update the callout tests (lines ~104-121):

```typescript
describe('callouts', () => {
  it('should parse note callout', () => {
    const result = parseMarkdown('> [!note] Title\n> Content');
    expect(result).toContain('class="callout');
    expect(result).toContain('callout-blue');
    expect(result).toContain('callout-icon');
    expect(result).toContain('📝');
  });

  it('should parse warning callout', () => {
    const result = parseMarkdown('> [!warning]\n> Be careful');
    expect(result).toContain('callout-yellow');
    expect(result).toContain('⚠️');
  });

  it('should parse tip callout', () => {
    const result = parseMarkdown('> [!tip] Pro tip\n> Do this');
    expect(result).toContain('callout-green');
    expect(result).toContain('💡');
  });

  it('should parse foldable callout with - modifier', () => {
    const result = parseMarkdown('> [!note]- Collapsed\n> Hidden content');
    expect(result).toContain('callout-folded');
    expect(result).toContain('callout-fold');
  });

  it('should parse foldable callout with + modifier', () => {
    const result = parseMarkdown('> [!note]+ Expanded\n> Visible content');
    expect(result).toContain('callout-fold');
    expect(result).not.toContain('callout-folded');
  });
});
```

**Step 4: Run full tests**

Run: `npx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/markdown/markdown.ts src/services/markdown/markdown.test.ts
git commit -m "feat(callout): update preview renderer to use shared config and Notion style"
```

---

### Task 6: Add fold toggle JavaScript for preview mode

**Files:**
- Modify: `src/services/markdown/markdown.ts` (add script for fold toggle in preview)

The preview HTML is static, so fold toggle needs a delegated click handler. Check how the app mounts preview HTML.

**Step 1: Find where preview HTML is rendered**

Search for where `parseMarkdown` output is rendered in the DOM and add a delegated event listener for `.callout-title` click to toggle `.callout-folded` on the parent `.callout`.

Look for the preview component that uses `dangerouslySetInnerHTML` or equivalent. Add an `useEffect` that attaches:

```typescript
// In the preview component's useEffect:
const handleCalloutFold = (e: MouseEvent) => {
  const title = (e.target as HTMLElement).closest('.callout-title');
  if (!title) return;
  const callout = title.closest('.callout');
  if (!callout?.querySelector('.callout-fold')) return;
  callout.classList.toggle('callout-folded');
};
container.addEventListener('click', handleCalloutFold);
return () => container.removeEventListener('click', handleCalloutFold);
```

**Step 2: Commit**

```bash
git add <modified-files>
git commit -m "feat(callout): add fold toggle click handler in preview mode"
```

---

### Task 7: Visual testing and polish

**Step 1: Manual visual testing**

Launch the app (`npm run tauri dev` or `npm run dev`) and test:

1. Create a note with various callout types:
   ```markdown
   > [!note] This is a note
   > Some content here

   > [!warning]- Collapsed warning
   > This should be hidden by default

   > [!tip]+ Expanded tip
   > This should be visible with fold arrow

   > [!🔥] Custom emoji callout
   > With custom emoji icon
   ```

2. Verify in each mode:
   - **Source mode**: line decorations with left border only
   - **Live mode**: Notion-style blocks, click to edit, fold/unfold
   - **Reading mode**: Notion-style blocks, fold/unfold

3. Verify dark mode colors

**Step 2: Fix any visual issues found**

**Step 3: Final commit**

```bash
git commit -m "style(callout): polish visual details after testing"
```

---

### Task 8: Cleanup and final test run

**Step 1: Remove dead code**

Verify no remaining references to old `CALLOUT_COLORS`, `CALLOUT_ICONS`, `CalloutIconWidget`, or `calloutTypes` in `markdown.ts`.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all 1042+ tests pass

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

**Step 4: Final commit if any cleanup needed**

```bash
git commit -m "refactor(callout): remove dead code from old callout implementation"
```
