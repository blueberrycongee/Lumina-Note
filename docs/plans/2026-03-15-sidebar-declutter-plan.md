# Sidebar Visual Declutter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce visual fragmentation in the left sidebar by removing excess borders and using gap-based spacing instead.

**Architecture:** CSS-only changes across 3 files. Wrap toolbar modules (quick actions, team, OpenClaw, favorites) in a unified flex-col + gap container. Remove individual borders, keep only 2 horizontal dividers.

**Tech Stack:** React + Tailwind CSS (existing)

---

### Task 1: Add divider below SidebarHeader

**Files:**
- Modify: `src/components/layout/SidebarHeader.tsx:34`

**Step 1: Add border-b to the header container**

Change line 34 from:
```tsx
<div className="p-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase">
```
to:
```tsx
<div className="p-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase border-b border-border/60">
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

---

### Task 2: Remove button borders in SidebarQuickActions

**Files:**
- Modify: `src/components/layout/SidebarQuickActions.tsx:22,26,80`

**Step 1: Remove outer container margin-bottom**

Change line 22 from:
```tsx
<div className="px-2 mb-2 space-y-2">
```
to:
```tsx
<div className="px-2 space-y-1">
```

(Remove `mb-2` since the parent gap container will handle spacing. Change `space-y-2` to `space-y-1` for tighter internal spacing.)

**Step 2: Remove border from "Today Note" button**

Change line 26 from:
```tsx
className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
```
to:
```tsx
className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground rounded-ui-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
```

(Remove `border border-border`, `bg-background`, `shadow-sm`. Add `text-muted-foreground` + `hover:text-foreground`. Use `rounded-ui-sm` for consistency. Reduce vertical padding `py-2` → `py-1.5`.)

**Step 3: Remove border from "Voice Note" button**

Change line 80 from:
```tsx
className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
```
to:
```tsx
className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground rounded-ui-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
```

(Same changes as the Today Note button.)

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

---

### Task 3: Remove OpenClaw outer border

**Files:**
- Modify: `src/components/layout/OpenClawSection.tsx:230`

**Step 1: Remove border and adjust outer container**

Change line 230 from:
```tsx
<div className="mx-2 mb-2 rounded-lg border border-border bg-background/70 p-2">
```
to:
```tsx
<div className="px-2">
```

(Remove `mx-2` → `px-2` for consistent horizontal padding with other modules. Remove `mb-2` (parent gap handles it). Remove `rounded-lg border border-border bg-background/70 p-2` entirely — no more boxed appearance.)

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

---

### Task 4: Wrap toolbar modules in gap container and clean up Sidebar.tsx

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:246-395`

**Step 1: Add toolbar zone wrapper with gap and bottom divider**

Wrap the Quick Actions, Team, OpenClaw, and Favorites sections (lines 246-395) in a single container div. Replace:

```tsx
{/* Quick Actions */}
<SidebarQuickActions vaultPath={vaultPath} onQuickNote={handleQuickNote} />

{/* Team Organization Section */}
<div className="px-2 py-1">
```

with:

```tsx
{/* Toolbar Zone */}
<div className="flex flex-col gap-3 py-2 border-b border-border/60">
  {/* Quick Actions */}
  <SidebarQuickActions vaultPath={vaultPath} onQuickNote={handleQuickNote} />

  {/* Team Organization Section */}
  <div className="px-2">
```

Note the Team section outer div changes from `className="px-2 py-1"` to `className="px-2"` (remove `py-1`, let gap handle vertical spacing).

**Step 2: Close the toolbar zone wrapper after Favorites**

After the Favorites closing `</div>` (around line 395), add the closing `</div>` for the toolbar zone wrapper:

```tsx
      </div>
    </div>{/* end toolbar zone */}
```

**Step 3: Remove Favorites mb-2**

Change the Favorites container (line 288) from:
```tsx
<div className="px-2 mb-2">
```
to:
```tsx
<div className="px-2">
```

**Step 4: Remove vault name border-b**

Change the vault name div (line 440) from:
```tsx
className={cn(
  "cursor-pointer select-none px-3 py-2 text-sm font-medium truncate border-b border-border/60 bg-background/35 transition-colors hover:bg-background/45",
```
to:
```tsx
className={cn(
  "cursor-pointer select-none px-3 py-2 text-sm font-medium truncate bg-background/35 transition-colors hover:bg-background/45",
```

And the renaming variant (line 399) from:
```tsx
<div className="border-b border-border/60 bg-background/35 px-2 py-1.5">
```
to:
```tsx
<div className="bg-background/35 px-2 py-1.5">
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors

---

### Task 5: Run tests and verify

**Step 1: Run full test suite**

Run: `npx vitest run 2>&1 | tail -30`
Expected: all tests pass (1042+)

**Step 2: Commit**

```bash
git add src/components/layout/SidebarHeader.tsx src/components/layout/SidebarQuickActions.tsx src/components/layout/OpenClawSection.tsx src/components/layout/Sidebar.tsx
git commit -m "style: declutter sidebar by removing excess borders and using gap spacing

Remove OpenClaw outer border, quick action button borders, and inter-module
dividers. Wrap toolbar modules in a unified flex-col gap container. Keep only
two horizontal dividers: header→toolbar and toolbar→content."
```
