# BlockMenu UI/UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the block editor left-side interaction panel from functional to polished — refined handle icons, animated menu panel with custom SVG icons, smooth transitions, and improved interaction feel.

**Architecture:** Split into 4 themed batches: (1) handle & entry visuals, (2) menu panel redesign with custom SVG icon system, (3) animations & transitions, (4) interaction polish (positioning, close behavior, viewport boundaries). Menu styling uses Tailwind classes; handle animations and complex transitions use CSS in globals.css.

**Tech Stack:** React, TypeScript, Tailwind CSS, CodeMirror 6, Vitest

---

## Batch 1: Handle & Entry Visuals

### Task 1: Redesign 6-dot gripper SVG

**Files:**
- Modify: `src/editor/extensions/blockEditor.ts:162-169`

**Step 1: Update the handle SVG**

Replace the 6-dot gripper with a refined 2×3 matrix of smaller dots:

```typescript
handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="2.5" cy="2.5" r="1.25" fill="currentColor"/>
  <circle cx="2.5" cy="6" r="1.25" fill="currentColor"/>
  <circle cx="2.5" cy="9.5" r="1.25" fill="currentColor"/>
  <circle cx="9.5" cy="2.5" r="1.25" fill="currentColor"/>
  <circle cx="9.5" cy="6" r="1.25" fill="currentColor"/>
  <circle cx="9.5" cy="9.5" r="1.25" fill="currentColor"/>
</svg>`;
```

**Step 2: Verify visually**

Run `npm run dev` (or the project's dev command), open the editor, hover over a non-empty block. The handle should show 6 smaller dots in a 2×3 grid.

**Step 3: Commit**

```bash
git add src/editor/extensions/blockEditor.ts
git commit -m "style(block-editor): refine gripper dot size and spacing"
```

---

### Task 2: Redesign plus button and add hover scale

**Files:**
- Modify: `src/editor/extensions/blockEditor.ts:292-295`
- Modify: `src/styles/globals.css:1783-1813`

**Step 1: Update plus button SVG**

In `blockEditor.ts:292-295`, replace the simple cross with a slightly more refined plus:

```typescript
btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <line x1="6" y1="2.5" x2="6" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
```

**Step 2: Update plus button styles in globals.css**

Replace `.cm-block-plus-btn` rules (lines 1783–1813):

```css
.cm-block-plus-btn {
  position: absolute;
  left: -24px;
  top: 2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground) / 0.5);
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, background-color 120ms ease, transform 120ms ease;
  border-radius: 9999px;
}

.cm-block-plus-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
  transform: scale(1.1);
}

.cm-block-line:hover .cm-block-plus-btn,
.cm-block-hovered .cm-block-plus-btn {
  opacity: 1;
}

body.lumina-block-dragging .cm-block-plus-btn {
  opacity: 0 !important;
}
```

**Step 3: Run tests**

Run: `npx vitest run src/editor/ --reporter=verbose`
Expected: All tests pass (no logic changed, only visuals).

**Step 4: Commit**

```bash
git add src/editor/extensions/blockEditor.ts src/styles/globals.css
git commit -m "style(block-editor): redesign plus button with rounded shape and hover scale"
```

---

### Task 3: Add delayed fade-in for handle appearance

**Files:**
- Modify: `src/styles/globals.css:1753-1781`

**Step 1: Update handle styles with delay and refined hover**

Replace `.cm-block-handle` rules (lines 1753–1781):

```css
.cm-block-handle {
  position: absolute;
  left: -24px;
  top: 2px;
  width: 16px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground) / 0.35);
  cursor: grab;
  opacity: 0;
  transition: opacity 120ms ease 100ms, background-color 120ms ease, color 120ms ease;
  border-radius: 4px;
}

.cm-block-handle:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground) / 0.8);
}

.cm-block-line:hover .cm-block-handle,
.cm-block-hovered .cm-block-handle {
  opacity: 1;
}

body.lumina-block-dragging .cm-block-handle {
  opacity: 0 !important;
}
```

Note: `transition: opacity 120ms ease 100ms` adds the 100ms delay.

**Step 2: Verify**

Hover quickly across blocks — handles should not flash; there should be a 100ms delay before fading in.

**Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(block-editor): add 100ms delay to handle fade-in"
```

---

## Batch 2: Menu Panel Redesign

### Task 4: Create BlockIcon custom SVG icon component

**Files:**
- Create: `src/editor/components/BlockIcon.tsx`

**Step 1: Write the icon component**

```tsx
import React from "react";

export type BlockIconName =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "divider"
  | "link"
  | "image"
  | "table"
  | "mathBlock"
  | "callout"
  | "insertAbove"
  | "delete"
  | "duplicate"
  | "insertBelow";

const ICONS: Record<BlockIconName, React.ReactNode> = {
  heading1: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v10M3 8h5M8 3v10M13 8h-1.5M13 3v10" />
    </svg>
  ),
  heading2: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v10M3 8h5M8 3v10M12 13c1.5 0 2.5-1 2.5-2.5S13.5 8 12 8s-2.5.5-2.5 2c0 1.5 1 2.5 2.5 2.5z" />
    </svg>
  ),
  heading3: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v10M3 8h5M8 3v10M12.5 7c.8 0 1.5.7 1.5 1.5S13.3 10 12.5 10" />
      <path d="M12.5 10c.8 0 1.5.7 1.5 1.5S13.3 13 12.5 13" />
    </svg>
  ),
  heading4: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v10M3 8h5M8 3v10M13 3v4M11 3h4" />
    </svg>
  ),
  heading5: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v10M3 8h5M8 3v10M14 3h-3v3.5c.5-.3 1-.5 1.5-.5 1 0 1.5.8 1.5 1.5s-.5 1.5-1.5 1.5" />
    </svg>
  ),
  bulletList: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="4" cy="4" r="1" fill="currentColor" />
      <line x1="7" y1="4" x2="13" y2="4" />
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <line x1="7" y1="8" x2="13" y2="8" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  orderedList: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <text x="2" y="5.5" fontSize="5" fill="currentColor" stroke="none">1</text>
      <line x1="7" y1="4" x2="13" y2="4" />
      <text x="2" y="9.5" fontSize="5" fill="currentColor" stroke="none">2</text>
      <line x1="7" y1="8" x2="13" y2="8" />
      <text x="2" y="13.5" fontSize="5" fill="currentColor" stroke="none">3</text>
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  taskList: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="4" x2="13" y2="4" />
      <rect x="2" y="6.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="8" x2="13" y2="8" />
      <rect x="2" y="10.5" width="3" height="3" rx="0.5" />
      <line x1="7" y1="12" x2="13" y2="12" />
    </svg>
  ),
  blockquote: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 4c-1.5 1.5-2 3.5-1.5 5.5l1.5-.5c-.5-1.5 0-3 1-4zM11 4c-1.5 1.5-2 3.5-1.5 5.5l1.5-.5c-.5-1.5 0-3 1-4z" />
    </svg>
  ),
  codeBlock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <polyline points="5 5 2 8 5 11" />
      <polyline points="11 5 14 8 11 11" />
    </svg>
  ),
  divider: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 9l2-2a2.5 2.5 0 013.5 0v0a2.5 2.5 0 010 3.5l-2.5 2.5a2.5 2.5 0 01-3.5 0" />
      <path d="M9 7L7 9a2.5 2.5 0 01-3.5 0v0a2.5 2.5 0 010-3.5l2.5-2.5a2.5 2.5 0 013.5 0" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="5.5" cy="6.5" r="1" />
      <path d="M2 11l3-3 3 3 4-4 2 2" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <line x1="2" y1="7" x2="14" y2="7" />
      <line x1="6.5" y1="3" x2="6.5" y2="13" />
      <line x1="10.5" y1="3" x2="10.5" y2="13" />
    </svg>
  ),
  mathBlock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 3l-2 5 2 5M9 5h5M11.5 3v7" />
    </svg>
  ),
  callout: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 3v6M8 11.5v.5" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  ),
  insertAbove: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 12V4M4 7l4-4 4 4" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 4h10M6 4v9a1 1 0 001 1h2a1 1 0 001-1V4M7 2h2" />
    </svg>
  ),
  duplicate: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M11 3H4a1 1 0 00-1 1v7" />
    </svg>
  ),
  insertBelow: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 4v8M4 9l4 4 4-4" />
    </svg>
  ),
};

interface BlockIconProps {
  name: BlockIconName;
  className?: string;
}

export function BlockIcon({ name, className = "" }: BlockIconProps) {
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 ${className}`}>
      {ICONS[name]}
    </span>
  );
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/editor/components/BlockIcon.tsx
git commit -m "feat(block-editor): add BlockIcon custom SVG icon component"
```

---

### Task 5: Refactor BlockMenu with new panel design

**Files:**
- Modify: `src/editor/components/BlockMenu.tsx` (full rewrite)
- Test: `src/editor/components/BlockMenu.test.tsx`

**Step 1: Rewrite BlockMenu.tsx**

Replace the entire file with:

```tsx
import { useEffect, useRef, useCallback, useState } from "react";
import { BlockIcon, BlockIconName } from "./BlockIcon";

export type BlockMenuMode = "combined" | "insert";
export type BlockActionId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "callout"
  | "mathBlock"
  | "table"
  | "divider"
  | "image"
  | "link"
  | "delete"
  | "duplicate"
  | "insertBefore"
  | "insertAfter";

interface BlockMenuProps {
  mode: BlockMenuMode;
  position: { x: number; y: number };
  onAction: (actionId: BlockActionId) => void;
  onClose: () => void;
  activeType?: string;
}

interface MenuGroup {
  label: string;
  items: { id: BlockActionId; icon: BlockIconName; title: string }[];
}

const FORMAT_GROUPS: MenuGroup[] = [
  {
    label: "Heading",
    items: [
      { id: "heading1", icon: "heading1", title: "Heading 1" },
      { id: "heading2", icon: "heading2", title: "Heading 2" },
      { id: "heading3", icon: "heading3", title: "Heading 3" },
      { id: "heading4", icon: "heading4", title: "Heading 4" },
      { id: "heading5", icon: "heading5", title: "Heading 5" },
    ],
  },
  {
    label: "List",
    items: [
      { id: "bulletList", icon: "bulletList", title: "Bullet List" },
      { id: "orderedList", icon: "orderedList", title: "Numbered List" },
      { id: "taskList", icon: "taskList", title: "Task List" },
    ],
  },
  {
    label: "Block",
    items: [
      { id: "blockquote", icon: "blockquote", title: "Quote" },
      { id: "codeBlock", icon: "codeBlock", title: "Code Block" },
      { id: "divider", icon: "divider", title: "Divider" },
    ],
  },
  {
    label: "Insert",
    items: [
      { id: "link", icon: "link", title: "Link" },
      { id: "image", icon: "image", title: "Image" },
      { id: "table", icon: "table", title: "Table" },
      { id: "mathBlock", icon: "mathBlock", title: "Math Block" },
      { id: "callout", icon: "callout", title: "Callout" },
    ],
  },
];

const MANAGE_ITEMS: {
  id: BlockActionId;
  icon: BlockIconName;
  label: string;
  title: string;
  danger?: boolean;
}[] = [
  { id: "insertBefore", icon: "insertAbove", label: "Insert above", title: "Insert block above" },
  { id: "delete", icon: "delete", label: "Delete", title: "Delete block", danger: true },
  { id: "duplicate", icon: "duplicate", label: "Duplicate", title: "Duplicate block" },
  { id: "insertAfter", icon: "insertBelow", label: "Insert below", title: "Insert block below" },
];

const TYPE_TO_ACTION: Record<string, string> = {
  ATXHeading1: "heading1",
  ATXHeading2: "heading2",
  ATXHeading3: "heading3",
  ATXHeading4: "heading4",
  ATXHeading5: "heading5",
  BulletList: "bulletList",
  OrderedList: "orderedList",
  Blockquote: "blockquote",
  FencedCode: "codeBlock",
  CodeBlock: "codeBlock",
};

export function BlockMenu({
  mode,
  position,
  onAction,
  onClose,
  activeType,
}: BlockMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 80);
  }, [onClose]);

  const handleAction = useCallback(
    (id: BlockActionId) => {
      onAction(id);
      handleClose();
    },
    [onAction, handleClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClose]);

  const isActive = (id: BlockActionId): boolean => {
    return activeType ? TYPE_TO_ACTION[activeType] === id : false;
  };

  const menuWidth = 200;
  const menuHeight = 360;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className={`fixed z-[100] min-w-[200px] max-w-[240px] bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg p-1.5 transition-all duration-150 ${
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-1.5 scale-[0.96]"
      }`}
      style={{ left, top, transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      role="menu"
    >
      {FORMAT_GROUPS.map((group, groupIndex) => {
        const items = group.items;
        if (items.length === 0) return null;

        return (
          <div key={group.label}>
            {groupIndex > 0 && <div className="h-px bg-border/50 my-1.5" />}
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-1.5 mb-1">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => {
                const active = isActive(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-100 ${
                      active
                        ? "bg-primary/10 text-primary border-primary/25 ring-2 ring-primary/40"
                        : "bg-background text-foreground border-border hover:bg-accent/60 active:scale-95"
                    }`}
                    title={item.title}
                    onClick={() => handleAction(item.id)}
                    role="menuitem"
                    aria-pressed={active}
                  >
                    <BlockIcon name={item.icon} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {mode === "combined" && (
        <>
          <div className="h-px bg-border/50 my-1.5" />
          <div className="grid grid-cols-1 gap-0.5">
            {MANAGE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg text-left transition-colors duration-100 ${
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-foreground hover:bg-accent/60"
                }`}
                title={item.title}
                onClick={() => handleAction(item.id)}
                role="menuitem"
              >
                <BlockIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Update BlockMenu test**

Update test assertions to match new icon-only buttons and icon+text manage items:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockMenu } from "./BlockMenu";

describe("BlockMenu", () => {
  it("renders in combined mode with format buttons and manage items", () => {
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Format buttons now have title attributes instead of text labels
    expect(screen.getByRole("menuitem", { name: /Heading 1/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete block/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Duplicate block/i })).toBeInTheDocument();
  });

  it("renders in insert mode without manage items", () => {
    render(
      <BlockMenu
        mode="insert"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("menuitem", { name: /Heading 1/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Delete block/i })).not.toBeInTheDocument();
  });

  it("calls onAction with actionId when button clicked", () => {
    const onAction = vi.fn();
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={onAction}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Heading 1/i }));
    expect(onAction).toHaveBeenCalledWith("heading1");
  });

  it("calls onClose when Escape pressed", () => {
    const onClose = vi.fn();
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    // onClose is called after 80ms animation delay
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(onClose).toHaveBeenCalled();
        resolve(undefined);
      }, 150);
    });
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/editor/components/BlockMenu.test.tsx --reporter=verbose`
Expected: All 4 tests pass.

**Step 4: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add src/editor/components/BlockMenu.tsx src/editor/components/BlockMenu.test.tsx src/editor/components/BlockIcon.tsx
git commit -m "feat(block-editor): redesign BlockMenu panel with custom icons and grid layout"
```

---

## Batch 3: Animations & Transitions

### Task 6: Menu open/close animation

Already partially implemented in Task 5 (the `isVisible` state + CSS transitions). Verify and refine.

**Files:**
- Already done in BlockMenu.tsx from Task 5

**Step 1: Verify animation works**

Run the dev server, click a block handle. Menu should animate in with opacity + translateY + scale.

**Step 2: Add menu close animation styles**

The close animation is already handled by `setIsVisible(false)` + `setTimeout(onClose, 80)`. Ensure the transition duration matches.

No additional changes needed — this was implemented in Task 5.

---

### Task 7: Block type conversion visual feedback

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/editor/extensions/blockEditor.ts`

**Step 1: Add flash animation keyframes**

Add to `globals.css` after existing block styles:

```css
@keyframes cm-block-flash {
  0% {
    background-color: hsl(var(--primary) / 0.12);
  }
  100% {
    background-color: transparent;
  }
}

.cm-block-flash {
  animation: cm-block-flash 200ms ease-out forwards;
}
```

**Step 2: Dispatch flash effect after block action**

In `blockEditor.ts`, after a block action is executed, the menu closes. We need a way to trigger the flash on the affected block. Add a custom event dispatch in `blockEditor.ts` after `executeBlockAction` is called.

In `CodeMirrorEditor.tsx`, where `executeBlockAction` is called (around line 5511), dispatch a flash event:

```tsx
executeBlockAction(view, block, actionId);
// Trigger flash animation on the block
window.dispatchEvent(
  new CustomEvent("lumina-block-flash", {
    detail: { from: block.from, to: block.to },
  }),
);
```

Then in `blockEditor.ts`, in the `ViewPlugin` class constructor, add a listener:

```typescript
private flashHandler: ((e: CustomEvent) => void) | null = null;

// In constructor:
this.attachFlashListener(view);

// Add method:
private attachFlashListener(view: EditorView) {
  this.flashHandler = (e: CustomEvent) => {
    const { from, to } = e.detail as { from: number; to: number };
    const blockState = view.state.field(blockEditorStateField);
    const block = findBlockAtPos(blockState.blocks, from);
    if (!block) return;

    // Add flash class to the block's DOM lines temporarily
    const startLine = view.state.doc.line(block.startLine);
    const endLine = view.state.doc.line(block.endLine);
    const flashedLines: HTMLElement[] = [];

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = view.state.doc.line(lineNum);
      const coords = view.coordsAtPos(line.from);
      if (!coords) continue;
      // Find the line DOM element by querying at the coordinates
      const el = document.elementFromPoint(coords.left + 10, coords.top + 2) as HTMLElement | null;
      if (el && el.closest(".cm-block-line")) {
        const lineEl = el.closest(".cm-block-line") as HTMLElement;
        lineEl.classList.add("cm-block-flash");
        flashedLines.push(lineEl);
      }
    }

    // Remove flash class after animation completes
    setTimeout(() => {
      flashedLines.forEach((el) => el.classList.remove("cm-block-flash"));
    }, 250);
  };

  window.addEventListener("lumina-block-flash", this.flashHandler as EventListener);
}
```

Also add cleanup in `destroy()`:

```typescript
if (this.flashHandler) {
  window.removeEventListener("lumina-block-flash", this.flashHandler as EventListener);
}
```

**Step 3: Run tests**

Run: `npx vitest run src/editor/ --reporter=verbose`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/editor/extensions/blockEditor.ts src/styles/globals.css src/editor/CodeMirrorEditor.tsx
git commit -m "feat(block-editor): add block conversion flash feedback"
```

---

## Batch 4: Interaction Polish

### Task 8: Menu positioning with viewport boundary handling

**Files:**
- Modify: `src/editor/CodeMirrorEditor.tsx:5420-5448`

**Step 1: Update menu positioning to use block top coordinate**

In the `handleBlockMenu` listener, change the positioning logic:

```tsx
const handleBlockMenu = (e: CustomEvent) => {
  const { from, to, mode } = e.detail as {
    from: number;
    to: number;
    clientX: number;
    clientY: number;
  };
  const view = viewRef.current;
  if (!view) return;

  const coords = view.coordsAtPos(from);
  if (!coords) return;

  const contentRect = view.contentDOM.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = 360;

  // Position menu to the left of the content area
  const x = Math.max(4, contentRect.left - menuWidth - 4);

  // Use block top as base, but check viewport boundaries
  let y = coords.top;

  // If menu would extend below viewport, shift it up
  const viewportHeight = window.innerHeight;
  if (y + menuHeight > viewportHeight - 8) {
    y = Math.max(8, viewportHeight - menuHeight - 8);
  }

  setBlockMenu({ mode, position: { x, y }, blockFrom: from, blockTo: to });
};
```

**Step 2: Run tests**

Run: `npx vitest run src/editor/CodeMirrorEditor.blockToolbar.test.tsx --reporter=verbose`
Expected: Tests pass (position logic changes don't affect toolbar behavior directly).

**Step 3: Commit**

```bash
git add src/editor/CodeMirrorEditor.tsx
git commit -m "feat(block-editor): improve menu positioning with viewport boundary handling"
```

---

### Task 9: Extended close behaviors

**Files:**
- Modify: `src/editor/components/BlockMenu.tsx`
- Modify: `src/editor/CodeMirrorEditor.tsx`

**Step 1: Close on editor focus/input**

In `CodeMirrorEditor.tsx`, add a `useEffect` that closes the menu when editor receives focus:

Find where `blockMenu` state is used, and add:

```tsx
useEffect(() => {
  const view = viewRef.current;
  if (!view || !blockMenu) return;

  const handleFocus = () => setBlockMenu(null);
  const handleInput = () => setBlockMenu(null);

  view.dom.addEventListener("focusin", handleFocus);
  // Use CodeMirror's update listener for typing
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && blockMenu) {
      setBlockMenu(null);
    }
  });

  // We can't easily add a dynamic listener, so instead use a mousedown on the editor
  const handleEditorMouseDown = () => setBlockMenu(null);
  view.dom.addEventListener("mousedown", handleEditorMouseDown);

  return () => {
    view.dom.removeEventListener("focusin", handleFocus);
    view.dom.removeEventListener("mousedown", handleEditorMouseDown);
  };
}, [blockMenu]);
```

Wait — this is complex. A simpler approach: in `BlockMenu.tsx`, the click-outside handler already handles most cases. For editor typing, we can listen on the window for `beforeinput` or check if the active element is the editor.

Simpler approach in `BlockMenu.tsx`:

```tsx
useEffect(() => {
  // ... existing handlers ...

  const handleEditorInput = (e: Event) => {
    // Close if user starts typing in the editor
    const target = e.target as HTMLElement;
    if (target.closest(".cm-content")) {
      handleClose();
    }
  };

  document.addEventListener("beforeinput", handleEditorInput);

  return () => {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("beforeinput", handleEditorInput);
  };
}, [handleClose]);
```

**Step 2: Verify**

Open menu, then type in editor. Menu should close.

**Step 3: Run tests**

Run: `npx vitest run src/editor/components/BlockMenu.test.tsx --reporter=verbose`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/editor/components/BlockMenu.tsx src/editor/CodeMirrorEditor.tsx
git commit -m "feat(block-editor): close menu on editor input and focus"
```

---

### Task 10: Smooth handle-to-handle switching

**Files:**
- Modify: `src/editor/CodeMirrorEditor.tsx:4149-4154`

**Step 1: Add closing animation state**

Change the blockMenu state to support a closing animation:

```tsx
const [blockMenu, setBlockMenu] = useState<{
  mode: "combined" | "insert";
  position: { x: number; y: number };
  blockFrom: number;
  blockTo: number;
} | null>(null);

const [closingMenu, setClosingMenu] = useState<typeof blockMenu>(null);
```

Then in the `handleBlockMenu` listener:

```tsx
const handleBlockMenu = (e: CustomEvent) => {
  // If menu is already open, animate out old one first
  if (blockMenu) {
    setClosingMenu(blockMenu);
    setBlockMenu(null);
    // After old menu animates out, set the new one
    setTimeout(() => {
      setClosingMenu(null);
      // Now open new menu with the event details
      const { from, to, mode } = e.detail as {
        from: number;
        to: number;
        clientX: number;
        clientY: number;
      };
      // Re-calculate position
      const view = viewRef.current;
      if (!view) return;
      const coords = view.coordsAtPos(from);
      if (!coords) return;
      const contentRect = view.contentDOM.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = 360;
      const x = Math.max(4, contentRect.left - menuWidth - 4);
      let y = coords.top;
      const viewportHeight = window.innerHeight;
      if (y + menuHeight > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - menuHeight - 8);
      }
      setBlockMenu({ mode, position: { x, y }, blockFrom: from, blockTo: to });
    }, 60);
    return;
  }

  // Normal first-open flow
  const { from, to, mode } = e.detail as {
    from: number;
    to: number;
    clientX: number;
    clientY: number;
  };
  // ... rest of positioning logic ...
};
```

This is getting complex. Actually, a simpler approach: the `BlockMenu` component already has enter animation via `isVisible`. When we render a new `BlockMenu` with a different key or position, React unmounts and remounts it, which triggers a new enter animation.

The simplest fix: ensure each BlockMenu instance gets a unique key so React treats it as a new component. Then the old one unmounts immediately (which isn't smooth)...

Better approach: pass a `key` to BlockMenu that changes when the block changes, and add an exit animation.

Actually, the simplest smooth switching is already partially there — the `isVisible` state in BlockMenu handles enter. For exit, when `blockMenu` state is set to null, the component unmounts instantly.

To get smooth switching without complex state management, we can use a wrapper component that handles exit animation:

In `CodeMirrorEditor.tsx`, add a key to BlockMenu:

```tsx
<BlockMenu
  key={`${blockMenu.blockFrom}-${blockMenu.blockTo}`}
  mode={blockMenu.mode}
  position={blockMenu.position}
  // ...
/>
```

This ensures React remounts when block changes. Combined with the enter animation in BlockMenu, each new menu will animate in. The old one unmounts instantly though.

For a truly smooth experience (old fades out 60ms, new fades in 150ms), the complexity might not be worth it for this polish round. Let's document this as a known limitation or implement the simple key approach.

**Decision for this plan:** Use `key` prop on BlockMenu to ensure remount + enter animation when switching blocks. This gives a clean "new menu animates in" experience without the complexity of exit animations.

Add to `CodeMirrorEditor.tsx` where BlockMenu is rendered:

```tsx
<BlockMenu
  key={`block-menu-${blockMenu.blockFrom}-${blockMenu.blockTo}`}
  mode={blockMenu.mode}
  // ...
/>
```

**Step 2: Commit**

```bash
git add src/editor/CodeMirrorEditor.tsx
git commit -m "feat(block-editor): add unique key to BlockMenu for smooth switching"
```

---

## Final Verification

### Task 11: Full test and type check

**Step 1: Run TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors.

**Step 2: Run all editor tests**

Run: `npx vitest run src/editor/ --reporter=verbose`
Expected: All tests pass.

**Step 3: Manual verification checklist**

- [ ] Hover over non-empty block: handle appears with 100ms delay, shows 2×3 dot grid
- [ ] Hover over empty block: + button appears as rounded circle
- [ ] Click handle: menu opens with opacity + translateY + scale animation
- [ ] Menu buttons show custom SVG icons (not emoji)
- [ ] Active format button (e.g., H1 on heading block) shows ring highlight
- [ ] Button hover: background change; button active: scale(0.95)
- [ ] Click menu item: menu fades out 80ms then closes
- [ ] Click outside / press Escape: menu closes
- [ ] Type in editor: menu closes
- [ ] Menu positioned correctly, doesn't extend below viewport
- [ ] Dark mode: all colors and shadows look correct

**Step 4: Final commit**

If all checks pass, no additional commit needed (all work already committed in batches).
