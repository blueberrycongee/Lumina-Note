# Welcome Screen Redesign Design

## Overview

Redesign the application's welcome/onboarding screen from a minimal centered layout to an Obsidian-inspired two-pane layout. The current screen is too sparse and only offers a single "Open Folder" action. The new design adds a recent vault list for quick access and a "Create New Vault" action, while preserving our existing animation and theme systems.

## Motivation

- The current welcome screen feels empty on wide screens
- Users must re-select their folder every time they open the app (no history)
- There is no way to create a new vault from the welcome screen
- Obsidian's welcome screen has proven UX patterns we can adapt

## Layout Structure

### Two-Pane Layout

```
+----------------------------------------------------------+
| TitleBar                                                 |
+----------------+------------------+----------------------+
|                |                                     |   |
|  Recent Vaults |         Brand Area                  |   |
|                |         - Logo                      |   |
|  - vault 1     |         - App Name                  |   |
|  - vault 2     |                                     |   |
|  - vault 3     +------------------+----------------------+
|  - vault 4     |                                     |   |
|                |  Action Cards                       |   |
|  [clear]       |  - Open Existing                    |   |
|                |  - Create New                       |   |
+----------------+------------------+----------------------+
|                |  Language Switcher + Version        |   |
+----------------+------------------+----------------------+
```

### Left Pane: Recent Vaults Sidebar

- **Width**: 280px fixed
- **Content**: List of recently opened vault paths (max 8 items)
- **Each item**:
  - Vault name (folder name)
  - Truncated full path (gray, smaller text)
  - Click to open
  - Hover: subtle background highlight + "Open" indicator
  - Right side: remove-from-history button (X) on hover
- **Empty state**: "No recent vaults" with a subtle icon
- **Footer**: "Clear History" link (small, muted)
- **Scrollable** when list exceeds available height

### Right Pane: Main Content

- **Layout**: Centered content with `max-width: 640px`
- **Brand Area**:
  - Lumina logo (80x80, same as current)
  - "Lumina Note" title (text-3xl, font-semibold)
  - No subtitle (the action cards provide enough context)
- **Action Cards** (vertical stack, gap-3):
  - **Open Existing Vault**
    - Title: "Open Existing Vault"
    - Description: "Select a folder containing your Markdown notes"
    - Button: "Open Folder" (primary variant, right-aligned)
  - **Create New Vault**
    - Title: "Create New Vault"
    - Description: "Create a new folder with Lumina workspace structure"
    - Button: "Create" (secondary variant, right-aligned)
- **Bottom Bar**:
  - Language switcher (left)
  - Version number (right, muted text)

## Component Breakdown

### New Components

1. **`RecentVaultList`** (`src/components/onboarding/RecentVaultList.tsx`)
   - Props: `vaults: RecentVault[]`, `onSelect: (path: string) => void`, `onRemove: (path: string) => void`, `onClear: () => void`
   - Renders scrollable list with hover states

2. **`ActionCard`** (`src/components/onboarding/ActionCard.tsx`)
   - Props: `icon: LucideIcon`, `title: string`, `description: string`, `action: { label: string, variant: ButtonVariant, onClick: () => void }`
   - Reusable card for each action

### Modified Components

1. **`WelcomeScreen`** (`src/components/onboarding/WelcomeScreen.tsx`)
   - Complete rewrite of layout
   - Integrates `RecentVaultList` and `ActionCard`
   - Handles "Create New Vault" flow

2. **New Store: `useRecentVaultStore`**
   - Persist recent vault paths to localStorage (separate key: `lumina-recent-vaults`)
   - Max 8 entries, MRU order
   - Add vault on open, remove on user request

## Data Flow

### Opening a Vault (Existing Flow)

```
User clicks "Open Folder" or a recent vault
  → openDialog/select from recent
  → setVaultPath(path)
  → useRecentVaultStore.add(path)  [NEW]
  → App transitions to workspace view
```

### Creating a New Vault (New Flow)

```
User clicks "Create New Vault"
  → openDialog({ directory: true, title: "Select Parent Folder" })
  → User selects parent folder
  → Prompt for vault name (modal or inline)
  → createDir(`${parent}/${vaultName}`)
  → createDir(`${parent}/${vaultName}/.lumina`)
  → createDir(`${parent}/${vaultName}/.lumina/skills`)
  → createDir(`${parent}/${vaultName}/.lumina/plugins`)
  → setVaultPath(`${parent}/${vaultName}`)
  → useRecentVaultStore.add(path)
  → App transitions to workspace view
```

### Recent Vaults Persistence

```typescript
interface RecentVault {
  path: string;
  name: string;
  openedAt: number;
}

// Stored in localStorage under "lumina-recent-vaults"
// Max 8 items, sorted by openedAt desc
// When vaultPath changes in useFileStore, sync to recent vaults
```

## Fixed Size Handling

- **Window**: Not fixed — Tauri window remains resizable as normal
- **Left pane**: Fixed 280px width, full height below TitleBar
- **Right pane**: Flexible width, content centered with `max-width: 640px`
- **Content alignment**: When window is very wide, right pane content stays centered; when narrow, right pane shrinks with padding
- **Min window**: The two-pane layout should work down to ~900px window width (280px sidebar + 620px content)

## Animation

- **Left pane list**: Stagger fade-in (same spring ease as current, 0.06s stagger)
- **Right pane**: Stagger fade-up (logo → title → cards → footer, 0.08s stagger)
- **Action cards**: Subtle hover lift (translateY -1px, shadow increase)
- **Recent vault items**: Hover background transition (100ms)
- **Reduced motion**: All animations disabled when `prefers-reduced-motion` is set

## Theme Compatibility

- Uses existing CSS variables: `--background`, `--foreground`, `--muted`, `--accent`, `--border`, `--ui-panel`, etc.
- Left pane: slightly different background (`--ui-panel` or `--ui-surface`) to create visual separation
- Action cards: bordered containers with hover state
- All 15 themes must look correct without per-theme customization

## Testing Strategy

- **WelcomeScreen.test.tsx**: Update existing tests
  - Render with recent vaults list
  - Test opening from recent
  - Test removing from recent
  - Test empty state
  - Test "Create New Vault" flow
- **RecentVaultList.test.tsx**: New tests for the list component
  - Rendering items
  - Click to select
  - Remove button
  - Clear history
  - Empty state
- **useRecentVaultStore.test.ts**: Unit tests for store logic
  - Add vault
  - Max 8 limit
  - Remove vault
  - Clear all
  - Persistence

## Related Files

- `src/components/onboarding/WelcomeScreen.tsx` — rewrite
- `src/components/onboarding/WelcomeScreen.test.tsx` — update
- `src/components/onboarding/RecentVaultList.tsx` — new
- `src/components/onboarding/ActionCard.tsx` — new
- `src/stores/useRecentVaultStore.ts` — new
- `src/App.tsx` — minor updates to integrate new flow
