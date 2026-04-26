# Welcome Screen Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the welcome screen from a minimal centered layout to an Obsidian-inspired two-pane layout with recent vaults sidebar, action cards, and create-new-vault flow.

**Architecture:** Two-pane layout: fixed 280px left sidebar for recent vaults (persisted to localStorage), flexible right pane with brand area and stacked action cards. All existing animations and theme system preserved. New `useRecentVaultStore` for MRU vault persistence.

**Tech Stack:** React, TypeScript, Tailwind CSS, Framer Motion, Zustand (persist), Tauri (invoke), Vitest, Testing Library

---

## Pre-Implementation Checklist

- [ ] Read `docs/plans/2026-04-26-welcome-screen-redesign-design.md`
- [ ] Read current `src/components/onboarding/WelcomeScreen.tsx`
- [ ] Read current `src/components/onboarding/WelcomeScreen.test.tsx`
- [ ] Read `src/stores/useFileStore.ts` (for `setVaultPath` integration point)
- [ ] Read `src/App.tsx` (for `handleOpenVault` and window size logic)

---

## Task 1: Create `useRecentVaultStore`

**Files:**
- Create: `src/stores/useRecentVaultStore.ts`
- Create: `src/stores/useRecentVaultStore.test.ts`

**Context:** We need a Zustand store that persists up to 8 recently opened vault paths to localStorage under key `lumina-recent-vaults`. When a vault is opened, it gets added to the top of the list. Users can remove individual entries or clear all.

**Step 1: Write the failing test**

Create `src/stores/useRecentVaultStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useRecentVaultStore } from "./useRecentVaultStore";

describe("useRecentVaultStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useRecentVaultStore.setState({ vaults: [] });
  });

  it("adds a vault to the list", () => {
    useRecentVaultStore.getState().addVault("/home/user/notes");
    expect(useRecentVaultStore.getState().vaults).toHaveLength(1);
    expect(useRecentVaultStore.getState().vaults[0].path).toBe("/home/user/notes");
    expect(useRecentVaultStore.getState().vaults[0].name).toBe("notes");
  });

  it("moves existing vault to top when re-added", () => {
    const store = useRecentVaultStore.getState();
    store.addVault("/home/user/notes1");
    store.addVault("/home/user/notes2");
    store.addVault("/home/user/notes1");
    expect(store.vaults[0].path).toBe("/home/user/notes1");
    expect(store.vaults).toHaveLength(2);
  });

  it("caps the list at 8 vaults", () => {
    const store = useRecentVaultStore.getState();
    for (let i = 0; i < 10; i++) {
      store.addVault(`/home/user/vault${i}`);
    }
    expect(store.vaults).toHaveLength(8);
    expect(store.vaults[0].path).toBe("/home/user/vault9");
  });

  it("removes a vault by path", () => {
    const store = useRecentVaultStore.getState();
    store.addVault("/home/user/notes");
    store.removeVault("/home/user/notes");
    expect(store.vaults).toHaveLength(0);
  });

  it("clears all vaults", () => {
    const store = useRecentVaultStore.getState();
    store.addVault("/home/user/notes1");
    store.addVault("/home/user/notes2");
    store.clearVaults();
    expect(store.vaults).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/stores/useRecentVaultStore.test.ts
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/stores/useRecentVaultStore.ts`:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentVault {
  path: string;
  name: string;
  openedAt: number;
}

interface RecentVaultState {
  vaults: RecentVault[];
  addVault: (path: string) => void;
  removeVault: (path: string) => void;
  clearVaults: () => void;
}

const MAX_RECENT_VAULTS = 8;

function getVaultName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

export const useRecentVaultStore = create<RecentVaultState>()(
  persist(
    (set, get) => ({
      vaults: [],
      addVault: (path: string) => {
        const name = getVaultName(path);
        const vaults = get().vaults.filter((v) => v.path !== path);
        vaults.unshift({ path, name, openedAt: Date.now() });
        set({ vaults: vaults.slice(0, MAX_RECENT_VAULTS) });
      },
      removeVault: (path: string) => {
        set({ vaults: get().vaults.filter((v) => v.path !== path) });
      },
      clearVaults: () => set({ vaults: [] }),
    }),
    {
      name: "lumina-recent-vaults",
      partialize: (state) => ({ vaults: state.vaults }),
    },
  ),
);
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/stores/useRecentVaultStore.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/stores/useRecentVaultStore.ts src/stores/useRecentVaultStore.test.ts
git commit -m "feat(welcome): add RecentVaultStore for persistent vault history

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create `ActionCard` Component

**Files:**
- Create: `src/components/onboarding/ActionCard.tsx`
- Create: `src/components/onboarding/ActionCard.test.tsx`

**Context:** Reusable card component for welcome screen actions. Each card has an icon, title, description, and an action button. Hover state lifts slightly with shadow increase.

**Step 1: Write the failing test**

Create `src/components/onboarding/ActionCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FolderOpen } from "lucide-react";
import { ActionCard } from "./ActionCard";

describe("ActionCard", () => {
  it("renders title, description, and button", () => {
    render(
      <ActionCard
        icon={FolderOpen}
        title="Open Folder"
        description="Select an existing folder"
        action={{ label: "Open", variant: "primary", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("Open Folder")).toBeInTheDocument();
    expect(screen.getByText("Select an existing folder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("calls onClick when button is clicked", () => {
    const onClick = vi.fn();
    render(
      <ActionCard
        icon={FolderOpen}
        title="Open Folder"
        description="Select an existing folder"
        action={{ label: "Open", variant: "primary", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/onboarding/ActionCard.test.tsx
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/components/onboarding/ActionCard.tsx`:

```typescript
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action: {
    label: string;
    variant: "primary" | "secondary";
    onClick: () => void;
  };
}

export function ActionCard({ icon: Icon, title, description, action }: ActionCardProps) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.14, ease: [0.2, 0.9, 0.1, 1] }}
      className="group flex items-center gap-4 p-4 rounded-ui-lg border border-border bg-background hover:shadow-elev-1 transition-shadow duration-200"
    >
      <div className="w-10 h-10 rounded-ui-md bg-accent flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Button variant={action.variant} size="md" onClick={action.onClick} className="shrink-0">
        {action.label}
      </Button>
    </motion.div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/onboarding/ActionCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/onboarding/ActionCard.tsx src/components/onboarding/ActionCard.test.tsx
git commit -m "feat(welcome): add ActionCard component

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create `RecentVaultList` Component

**Files:**
- Create: `src/components/onboarding/RecentVaultList.tsx`
- Create: `src/components/onboarding/RecentVaultList.test.tsx`

**Context:** Sidebar list of recently opened vaults. Each item shows vault name and truncated path. Click to open, hover to reveal remove button. Empty state shown when no vaults.

**Step 1: Write the failing test**

Create `src/components/onboarding/RecentVaultList.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentVaultList } from "./RecentVaultList";

describe("RecentVaultList", () => {
  const mockVaults = [
    { path: "/home/user/notes", name: "notes", openedAt: Date.now() },
    { path: "/home/user/work", name: "work", openedAt: Date.now() - 1000 },
  ];

  it("renders vault names", () => {
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
  });

  it("calls onSelect when vault is clicked", () => {
    const onSelect = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={onSelect}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("notes"));
    expect(onSelect).toHaveBeenCalledWith("/home/user/notes");
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("/home/user/notes");
  });

  it("calls onClear when clear history is clicked", () => {
    const onClear = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("Clear History"));
    expect(onClear).toHaveBeenCalled();
  });

  it("shows empty state when no vaults", () => {
    render(
      <RecentVaultList
        vaults={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("No recent vaults")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/onboarding/RecentVaultList.test.tsx
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/components/onboarding/RecentVaultList.tsx`:

```typescript
import { motion } from "framer-motion";
import { Folder, X } from "lucide-react";
import type { RecentVault } from "@/stores/useRecentVaultStore";

interface RecentVaultListProps {
  vaults: RecentVault[];
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.24, ease: [0.2, 0.9, 0.1, 1] } },
};

export function RecentVaultList({ vaults, onSelect, onRemove, onClear }: RecentVaultListProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recent Vaults
      </div>

      {vaults.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-muted-foreground">
          <Folder className="w-8 h-8 mb-2 opacity-40" />
          <span className="text-sm">No recent vaults</span>
        </div>
      ) : (
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 overflow-y-auto px-2"
        >
          {vaults.map((vault) => (
            <motion.div
              key={vault.path}
              variants={itemVariants}
              className="group relative flex items-center gap-2 px-2 py-2 rounded-ui-md hover:bg-accent cursor-pointer transition-colors duration-100"
              onClick={() => onSelect(vault.path)}
            >
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{vault.name}</div>
                <div className="text-xs text-muted-foreground truncate">{vault.path}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(vault.path);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background transition-opacity duration-100"
                aria-label={`Remove ${vault.name}`}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {vaults.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/onboarding/RecentVaultList.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/onboarding/RecentVaultList.tsx src/components/onboarding/RecentVaultList.test.tsx
git commit -m "feat(welcome): add RecentVaultList component

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create `VaultNamePrompt` Dialog

**Files:**
- Create: `src/components/onboarding/VaultNamePrompt.tsx`
- Create: `src/components/onboarding/VaultNamePrompt.test.tsx`

**Context:** When creating a new vault, we need a dialog to prompt for the vault name. Using a simple custom modal (not the heavy Dialog component) to keep it lightweight.

**Step 1: Write the failing test**

Create `src/components/onboarding/VaultNamePrompt.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultNamePrompt } from "./VaultNamePrompt";

describe("VaultNamePrompt", () => {
  it("renders when open", () => {
    render(
      <VaultNamePrompt isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Create New Vault")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My Notes")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <VaultNamePrompt isOpen={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText("Create New Vault")).not.toBeInTheDocument();
  });

  it("calls onSubmit with name when form is submitted", () => {
    const onSubmit = vi.fn();
    render(
      <VaultNamePrompt isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("My Notes"), {
      target: { value: "My Vault" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledWith("My Vault");
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <VaultNamePrompt isOpen={true} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/onboarding/VaultNamePrompt.test.tsx
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/components/onboarding/VaultNamePrompt.tsx`:

```typescript
import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VaultNamePromptProps {
  isOpen: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function VaultNamePrompt({ isOpen, onSubmit, onCancel }: VaultNamePromptProps) {
  const [name, setName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setName("");
    }
  };

  const handleCancel = () => {
    setName("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm p-6 rounded-ui-xl bg-popover border border-border shadow-elev-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-ui-md bg-accent flex items-center justify-center">
            <FolderPlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create New Vault</h2>
            <p className="text-sm text-muted-foreground">Enter a name for your new vault</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Notes"
            className="w-full h-10 px-3 rounded-ui-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary mb-4"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={handleCancel} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/onboarding/VaultNamePrompt.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/onboarding/VaultNamePrompt.tsx src/components/onboarding/VaultNamePrompt.test.tsx
git commit -m "feat(welcome): add VaultNamePrompt dialog

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Update App.tsx — Add Create Vault Handler and Sync Recent Vaults

**Files:**
- Modify: `src/App.tsx`

**Context:** We need to:
1. Change `WelcomeScreen` prop from `onOpenVault: () => void` to `onOpenVault: (path: string) => void`
2. Add `handleCreateVault` function that creates folder + `.lumina` structure then opens it
3. Sync recent vaults when a vault is opened

**Step 1: Add import for createDir and useRecentVaultStore**

At the top of `src/App.tsx`, add:

```typescript
import { createDir } from "@/lib/host";
import { useRecentVaultStore } from "@/stores/useRecentVaultStore";
```

**Step 2: Modify handleOpenVault to accept path parameter**

Find the existing `handleOpenVault` function (around line 733) and replace it:

```typescript
// Open folder dialog
const handleOpenVault = useCallback(async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t.welcome.openFolder,
    });

    if (selected && typeof selected === "string") {
      setVaultPath(selected);
    }
  } catch (error) {
    console.error("[App.handleOpenVault] Open folder dialog failed:", error);
  }
}, [setVaultPath, t.welcome.openFolder]);
```

Replace with:

```typescript
const addRecentVault = useRecentVaultStore((s) => s.addVault);

const handleOpenVault = useCallback(
  async (path?: string) => {
    if (path) {
      addRecentVault(path);
      await setVaultPath(path);
      return;
    }
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.welcome.openFolder,
      });

      if (selected && typeof selected === "string") {
        addRecentVault(selected);
        await setVaultPath(selected);
      }
    } catch (error) {
      console.error("[App.handleOpenVault] Open folder dialog failed:", error);
    }
  },
  [setVaultPath, t.welcome.openFolder, addRecentVault],
);

const handleCreateVault = useCallback(
  async (parentPath: string, name: string) => {
    const vaultPath = `${parentPath}/${name}`;
    try {
      await createDir(vaultPath);
      await createDir(`${vaultPath}/.lumina`);
      await createDir(`${vaultPath}/.lumina/skills`);
      await createDir(`${vaultPath}/.lumina/plugins`);
      addRecentVault(vaultPath);
      await setVaultPath(vaultPath);
    } catch (error) {
      console.error("[App.handleCreateVault] Failed to create vault:", error);
      // TODO: show error toast
    }
  },
  [setVaultPath, addRecentVault],
);
```

**Step 3: Update window event listener**

Find the listener that listens for "open-vault" event (around line 751-752):

```typescript
const onOpenVault = () => handleOpenVault();
```

Keep as-is (no-arg call is still valid).

**Step 4: Update WelcomeScreen prop usage**

Find where WelcomeScreen is rendered (around line 888):

```typescript
<WelcomeScreen onOpenVault={handleOpenVault} />
```

Update to pass both handlers:

```typescript
<WelcomeScreen
  onOpenVault={handleOpenVault}
  onCreateVault={handleCreateVault}
/>
```

Also update the hidden welcome preview (around line 1093):

```typescript
<WelcomeScreen onOpenVault={() => setWelcomePreview(false)} />
```

Keep as-is for the preview (it doesn't need create vault).

**Step 5: Run TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: PASS (or errors about WelcomeScreen props that we'll fix in Task 6)

If there are errors about `WelcomeScreen` not accepting `onCreateVault`, that's expected — we'll fix in Task 6.

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(welcome): add create-vault handler and sync recent vaults in App.tsx

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rewrite `WelcomeScreen` with Two-Pane Layout

**Files:**
- Modify: `src/components/onboarding/WelcomeScreen.tsx`
- Modify: `src/components/onboarding/WelcomeScreen.test.tsx`

**Context:** Complete rewrite using the new two-pane layout. Integrates all new components.

**Step 1: Write the new WelcomeScreen**

Replace the entire content of `src/components/onboarding/WelcomeScreen.tsx`:

```typescript
import { useState, useCallback } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { FolderOpen, FolderPlus } from "lucide-react";
import { openDialog } from "@tauri-apps/plugin-dialog";
import { TitleBar } from "@/components/layout/TitleBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useMacTopChromeEnabled } from "@/components/layout/MacTopChrome";
import { WindowControls } from "@/components/layout/WindowControls";
import { ActionCard } from "./ActionCard";
import { RecentVaultList } from "./RecentVaultList";
import { VaultNamePrompt } from "./VaultNamePrompt";
import { useRecentVaultStore } from "@/stores/useRecentVaultStore";
import { resolveRendererAssetUrl } from "@/lib/appAsset";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface WelcomeScreenProps {
  onOpenVault: (path?: string) => void;
  onCreateVault?: (parentPath: string, name: string) => void;
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.2, 0.9, 0.1, 1] },
  },
};

export function WelcomeScreen({ onOpenVault, onCreateVault }: WelcomeScreenProps) {
  const { t } = useLocaleStore();
  const showMacWindowInset = useMacTopChromeEnabled();
  const prefersReducedMotion = useReducedMotion();
  const logoUrl = resolveRendererAssetUrl("lumina.png");

  const vaults = useRecentVaultStore((s) => s.vaults);
  const removeVault = useRecentVaultStore((s) => s.removeVault);
  const clearVaults = useRecentVaultStore((s) => s.clearVaults);

  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [createParentPath, setCreateParentPath] = useState<string | null>(null);

  const handleOpenExisting = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.welcome.openFolder,
      });
      if (selected && typeof selected === "string") {
        onOpenVault(selected);
      }
    } catch (error) {
      console.error("[WelcomeScreen] Open folder dialog failed:", error);
    }
  }, [onOpenVault, t.welcome.openFolder]);

  const handleCreateVault = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Parent Folder",
      });
      if (selected && typeof selected === "string") {
        setCreateParentPath(selected);
        setShowNamePrompt(true);
      }
    } catch (error) {
      console.error("[WelcomeScreen] Create vault dialog failed:", error);
    }
  }, []);

  const handleNameSubmit = useCallback(
    (name: string) => {
      if (createParentPath && onCreateVault) {
        onCreateVault(createParentPath, name);
      }
      setShowNamePrompt(false);
      setCreateParentPath(null);
    },
    [createParentPath, onCreateVault],
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <TitleBar />

      <div className="relative flex-1 overflow-hidden flex flex-col">
        {showMacWindowInset ? (
          <div
            className="flex items-center px-4 py-2"
            data-tauri-drag-region
            data-testid="welcome-top-row"
          >
            <div className="w-16 flex justify-center shrink-0" data-tauri-drag-region="false">
              <WindowControls />
            </div>
            <div className="flex-1" />
            <LanguageSwitcher compact stopPropagation />
          </div>
        ) : (
          <LanguageSwitcher
            className="absolute top-4 right-4 z-10"
            showLabel
          />
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar: Recent vaults */}
          <div className="w-[280px] shrink-0 border-r border-border bg-ui-surface flex flex-col">
            <RecentVaultList
              vaults={vaults}
              onSelect={(path) => onOpenVault(path)}
              onRemove={removeVault}
              onClear={clearVaults}
            />
          </div>

          {/* Right pane: Brand + Actions */}
          <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
            <motion.div
              variants={containerVariants}
              initial={prefersReducedMotion ? "visible" : "hidden"}
              animate="visible"
              className="flex flex-col items-center gap-6 w-full max-w-[640px]"
            >
              {/* Logo */}
              <motion.div variants={fadeUpVariants}>
                <img src={logoUrl} alt="Lumina Note" className="w-20 h-20" />
              </motion.div>

              {/* Title */}
              <motion.h1
                variants={fadeUpVariants}
                className="text-3xl font-semibold tracking-tight text-foreground"
              >
                {t.welcome.title}
              </motion.h1>

              {/* Action cards */}
              <motion.div variants={fadeUpVariants} className="w-full flex flex-col gap-3 mt-2">
                <ActionCard
                  icon={FolderOpen}
                  title={t.welcome.openFolder}
                  description={t.welcome.selectFolder}
                  action={{ label: "Open", variant: "primary", onClick: handleOpenExisting }}
                />
                {onCreateVault && (
                  <ActionCard
                    icon={FolderPlus}
                    title="Create New Vault"
                    description="Create a new folder with Lumina workspace structure"
                    action={{ label: "Create", variant: "secondary", onClick: handleCreateVault }}
                  />
                )}
              </motion.div>

              {/* Footer */}
              <motion.div
                variants={fadeUpVariants}
                className="flex items-center justify-between w-full mt-4 text-xs text-muted-foreground"
              >
                <span>Lumina Note</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <VaultNamePrompt
        isOpen={showNamePrompt}
        onSubmit={handleNameSubmit}
        onCancel={() => {
          setShowNamePrompt(false);
          setCreateParentPath(null);
        }}
      />
    </div>
  );
}
```

**Step 2: Update tests**

Replace `src/components/onboarding/WelcomeScreen.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "./WelcomeScreen";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));

vi.mock("@/components/layout/TitleBar", () => ({
  TitleBar: () => <div data-testid="titlebar" />,
}));

vi.mock("@/components/layout/LanguageSwitcher", () => ({
  LanguageSwitcher: ({ className, compact, showLabel }: { className?: string; compact?: boolean; showLabel?: boolean }) => (
    <div
      data-testid="language-switcher"
      data-classname={className || ""}
      data-compact={compact ? "true" : "false"}
      data-show-label={showLabel ? "true" : "false"}
    >
      Language Switcher
    </div>
  ),
}));

vi.mock("@/components/layout/MacTopChrome", () => ({
  useMacTopChromeEnabled: () => macTopChromeEnabled.value,
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        title: "Lumina Note",
        openFolder: "Open Notes Folder",
        selectFolder: "Select a folder to continue",
      },
    },
  }),
}));

vi.mock("@/lib/appAsset", () => ({
  resolveRendererAssetUrl: () => "lumina.png",
}));

vi.mock("@/stores/useRecentVaultStore", () => ({
  useRecentVaultStore: (selector: (s: { vaults: never[]; removeVault: () => void; clearVaults: () => void }) => unknown) =>
    selector({ vaults: [], removeVault: vi.fn(), clearVaults: vi.fn() }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  openDialog: vi.fn(),
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    macTopChromeEnabled.value = false;
  });

  it("renders the two-pane layout", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.getByText("Lumina Note")).toBeInTheDocument();
    expect(screen.getByText("Open Notes Folder")).toBeInTheDocument();
    expect(screen.getByText("No recent vaults")).toBeInTheDocument();
  });

  it("keeps the legacy floating language switcher outside macOS overlay mode", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.getByTestId("language-switcher")).toHaveAttribute("data-classname", "absolute top-4 right-4 z-10");
  });

  it("renders the language switcher inside a real macOS top row", () => {
    macTopChromeEnabled.value = true;
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.getByTestId("welcome-top-row")).toBeInTheDocument();
  });

  it("shows Create New Vault when onCreateVault prop is provided", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} onCreateVault={vi.fn()} />);
    expect(screen.getByText("Create New Vault")).toBeInTheDocument();
  });

  it("hides Create New Vault when onCreateVault prop is not provided", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.queryByText("Create New Vault")).not.toBeInTheDocument();
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/components/onboarding/WelcomeScreen.test.tsx
```

Expected: PASS

**Step 4: Run TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: PASS

**Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (or only pre-existing failures)

**Step 6: Commit**

```bash
git add src/components/onboarding/WelcomeScreen.tsx src/components/onboarding/WelcomeScreen.test.tsx
git commit -m "feat(welcome): rewrite WelcomeScreen with two-pane layout

- Add RecentVaultList sidebar (280px)
- Add ActionCard components for Open/Create
- Integrate VaultNamePrompt for create flow
- Preserve animations and macOS top chrome

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Add i18n Strings for New Features

**Files:**
- Modify: `src/locales/en.ts` (or wherever welcome strings are defined)
- Modify: `src/locales/zh.ts` (if exists)

**Context:** Add new i18n keys for the create vault feature.

**Step 1: Find the i18n files**

```bash
grep -rn "welcome:" src/locales/ --include="*.ts" | head -5
```

**Step 2: Add new keys**

Add to the welcome section in each locale file:

```typescript
// In English locale
welcome: {
  // ... existing keys
  createVault: "Create New Vault",
  createVaultDesc: "Create a new folder with Lumina workspace structure",
  create: "Create",
  cancel: "Cancel",
  vaultNamePlaceholder: "My Notes",
  recentVaults: "Recent Vaults",
  noRecentVaults: "No recent vaults",
  clearHistory: "Clear History",
  selectParentFolder: "Select Parent Folder",
}
```

And in Chinese locale:

```typescript
welcome: {
  // ... existing keys
  createVault: "新建仓库",
  createVaultDesc: "创建包含 Lumina 工作区结构的新文件夹",
  create: "创建",
  cancel: "取消",
  vaultNamePlaceholder: "我的笔记",
  recentVaults: "最近打开",
  noRecentVaults: "无最近仓库",
  clearHistory: "清除历史",
  selectParentFolder: "选择父文件夹",
}
```

**Step 3: Update WelcomeScreen to use i18n strings**

Replace hardcoded strings in WelcomeScreen.tsx:
- "Create New Vault" → `t.welcome.createVault`
- "Create a new folder with Lumina workspace structure" → `t.welcome.createVaultDesc`
- "Recent Vaults" → `t.welcome.recentVaults`
- "No recent vaults" → `t.welcome.noRecentVaults`
- "Clear History" → `t.welcome.clearHistory`
- "Select Parent Folder" → `t.welcome.selectParentFolder`

And in VaultNamePrompt.tsx:
- "Create New Vault" → `t.welcome.createVault`
- "Enter a name for your new vault" → `t.welcome.createVaultDesc`
- "My Notes" → `t.welcome.vaultNamePlaceholder`
- "Cancel" → `t.welcome.cancel`
- "Create" → `t.welcome.create`

**Step 4: Run TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/locales/ src/components/onboarding/WelcomeScreen.tsx src/components/onboarding/VaultNamePrompt.tsx
git commit -m "feat(welcome): add i18n strings for create vault and recent vaults

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Manual Verification

**Files:** None — manual testing

**Context:** Verify the welcome screen works correctly in the actual application.

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Verify scenarios**

1. **Fresh open (no vault)**: Welcome screen shows with empty recent vaults list
2. **Open existing folder**: Click "Open" → select folder → app transitions to workspace
3. **Create new vault**: Click "Create" → select parent folder → enter name → app creates vault and transitions
4. **Recent vaults**: Reopen app → previous vault appears in sidebar → click to open instantly
5. **Remove from recent**: Hover vault → click X → vault removed
6. **Clear history**: Click "Clear History" → all vaults removed
7. **macOS top chrome**: On macOS, verify window controls and language switcher appear correctly
8. **Dark/light mode**: Toggle theme → welcome screen updates correctly
9. **Reduced motion**: Enable reduced motion in OS → animations disabled

**Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass

**Step 4: Final commit**

```bash
git commit -m "feat(welcome): complete welcome screen redesign

Obsidian-inspired two-pane layout with:
- Recent vaults sidebar (persistent, max 8)
- Action cards for Open Existing and Create New
- Vault name prompt dialog
- Full i18n support

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/stores/useRecentVaultStore.ts` | Create | MRU vault persistence (max 8) |
| `src/stores/useRecentVaultStore.test.ts` | Create | Unit tests for store |
| `src/components/onboarding/ActionCard.tsx` | Create | Reusable action card component |
| `src/components/onboarding/ActionCard.test.tsx` | Create | ActionCard tests |
| `src/components/onboarding/RecentVaultList.tsx` | Create | Sidebar vault list |
| `src/components/onboarding/RecentVaultList.test.tsx` | Create | RecentVaultList tests |
| `src/components/onboarding/VaultNamePrompt.tsx` | Create | Vault name input dialog |
| `src/components/onboarding/VaultNamePrompt.test.tsx` | Create | VaultNamePrompt tests |
| `src/App.tsx` | Modify | Add create vault handler, sync recent vaults |
| `src/components/onboarding/WelcomeScreen.tsx` | Modify | Complete rewrite with two-pane layout |
| `src/components/onboarding/WelcomeScreen.test.tsx` | Modify | Update tests for new layout |
| `src/locales/*.ts` | Modify | Add new i18n keys |
