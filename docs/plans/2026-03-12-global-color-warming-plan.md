# Global Color Warming Implementation Plan

> **Execution note:** Use `executing-plans` to implement this plan task-by-task, or another equivalent execution workflow supported by the current agent runtime.

**Goal:** Warm Lumina-Note's default fallback palette and reinforce hierarchy accents across sidebar, tabs, ribbon, and right panel without breaking theme overrides.

**Architecture:** Keep the theme system intact by only adjusting fallback CSS custom properties in `src/styles/globals.css` and updating component class names that already consume semantic tokens or local Tailwind colors. Cover the behavior with small, targeted tests that assert the new CSS token values and the intended icon or active-state classes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Lock the fallback palette changes with CSS tests

**Files:**
- Modify: `src/styles/globals.test.ts`
- Modify: `src/styles/globals.css`

**Step 1: Write the failing test**

Assert that:
- `:root` includes the warmed fallback tokens and `--md-heading`
- `.dark` includes the warmed dark tokens and `--md-heading`
- `.ui-app-bg` and `.dark .ui-app-bg` use `--primary` glow layers

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/styles/globals.test.ts`
Expected: FAIL because the CSS still uses the previous token values and foreground glow.

**Step 3: Write minimal implementation**

Update `src/styles/globals.css` fallback tokens, heading color, and app background gradients to the new warm values.

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/styles/globals.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/styles/globals.css src/styles/globals.test.ts
git commit -m "style: warm fallback theme tokens"
```

### Task 2: Lock sidebar and tab icon color hierarchy

**Files:**
- Modify: `src/components/layout/TabBar.test.tsx`
- Create: `src/components/layout/Sidebar.test.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/TabBar.tsx`

**Step 1: Write the failing test**

Assert that:
- default file tabs use `text-primary/50`
- database tabs use `text-indigo-500`
- sidebar folders use amber classes
- sidebar default files use `text-primary/50`
- sidebar database files use `text-indigo-500`
- favorites header gets the warm accent treatment

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/layout/TabBar.test.tsx src/components/layout/Sidebar.test.tsx`
Expected: FAIL because current classes still use muted gray or slate values.

**Step 3: Write minimal implementation**

Update sidebar and tab icon classes plus the favorites section accent classes.

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/layout/TabBar.test.tsx src/components/layout/Sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/TabBar.tsx src/components/layout/TabBar.test.tsx
git commit -m "style: add warm icon hierarchy to navigation"
```

### Task 3: Strengthen right panel and ribbon active states

**Files:**
- Modify: `src/components/layout/Ribbon.test.tsx`
- Create: `src/components/layout/RightPanel.test.tsx`
- Modify: `src/components/layout/RightPanel.tsx`
- Modify: `src/components/layout/Ribbon.tsx`

**Step 1: Write the failing test**

Assert that:
- active right panel tabs use `border-primary` and `bg-primary/5`
- right panel empty-state icons use `text-primary/25`
- active ribbon buttons use `bg-primary/15`, `border-primary/30`, and `hover:bg-primary/20`

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/layout/Ribbon.test.tsx src/components/layout/RightPanel.test.tsx`
Expected: FAIL because classes still use the softer old styles.

**Step 3: Write minimal implementation**

Update the active-state class strings and empty-state icon colors.

**Step 4: Run test to verify it passes**

Run: `pnpm test:run src/components/layout/Ribbon.test.tsx src/components/layout/RightPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/layout/Ribbon.tsx src/components/layout/Ribbon.test.tsx src/components/layout/RightPanel.tsx src/components/layout/RightPanel.test.tsx
git commit -m "style: strengthen panel and ribbon accents"
```

### Task 4: Verify integrated behavior and record the atomic delivery

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/TabBar.tsx`
- Modify: `src/components/layout/RightPanel.tsx`
- Modify: `src/components/layout/Ribbon.tsx`

**Step 1: Run targeted tests**

Run:
- `pnpm test:run src/styles/globals.test.ts`
- `pnpm test:run src/components/layout/TabBar.test.tsx src/components/layout/Sidebar.test.tsx`
- `pnpm test:run src/components/layout/Ribbon.test.tsx src/components/layout/RightPanel.test.tsx`

Expected: PASS

**Step 2: Run broader verification**

Run: `pnpm typecheck`
Expected: PASS

If `typecheck` is not defined, run: `pnpm exec tsc --noEmit`

**Step 3: Manual confidence check**

Run: `pnpm dev`
Check light mode, dark mode, and one non-default theme to confirm the fallback tokens are overridden by themes as expected.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-12-global-color-warming-plan.md
git commit -m "docs: add global color warming plan"
```
