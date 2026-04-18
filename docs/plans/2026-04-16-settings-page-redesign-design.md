# Settings Page Redesign (Layout Only)

Date: 2026-04-16
Status: Approved, ready for implementation

## Problem

`SettingsModal.tsx` (411 lines) currently renders 15 sections stacked in a single
vertical scroll container at 600px wide. There is no category navigation,
so the user has to scroll past everything from Theme → Editor → Publish →
Profile → AI → DocTools → MobileGateway → MobileOptions → CloudRelay →
Proxy → WebDAV → Update → Diagnostics → About to find a
specific setting.

Additional issues:
- Theme / Editor / Update / About sections are inlined in `SettingsModal.tsx`
  instead of being extracted sub-components
- AI settings live in a separate `AISettingsModal` (two-modal architecture)
- Modal is 600px wide — tight for complex sections

The goal is **pure layout/navigation refactor**. Do not rewrite child
sections, do not touch business logic, do not change i18n strings.

## Design

### Modal shell

```
┌─────────────────────────────────────────────────────┐
│  设置                                            ×  │
├─────────────┬───────────────────────────────────────┤
│ ◉ 通用      │                                       │
│   AI        │  [content of active tab, scrollable]  │
│   同步      │                                       │
│   网络      │                                       │
│   发布      │                                       │
│   系统      │                                       │
└─────────────┴───────────────────────────────────────┘
     160px              560px   (total 720px, max-h 80vh)
```

- Width: **720px** (was 600px).
- Left nav: 160px wide, 6 tab buttons with icon + label.
- Right content: scrollable, renders only the active tab's sections.
- Active tab state: `const [activeTab, setActiveTab] = useState<TabId>("general")`.

### Tab → section mapping

| Tab ID      | Label (zh-CN) | Icon         | Sections rendered |
|-------------|---------------|--------------|-------------------|
| `general`   | 通用          | `Settings`   | Theme, Language, Editor mode, Font size |
| `ai`        | AI            | `Bot`        | AI Settings (extracted from AISettingsModal) |
| `sync`      | 同步          | `RefreshCw`  | WebDAV, Mobile Gateway, Mobile Options |
| `network`   | 网络          | `Globe`      | Proxy, Cloud Relay |
| `publish`   | 发布          | `Upload`     | Publish, Profile |
| `system`    | 系统          | `Info`       | Update, DocTools, Diagnostics, About |

Labels reuse existing i18n keys where possible; add new keys under
`t.settingsModal.tabs.*` for the 6 tab names.

### New components

Create two small extraction components to remove inline sections from
`SettingsModal.tsx`:

1. **`src/components/settings/GeneralSection.tsx`**
   - Moves lines 118-312 of current `SettingsModal.tsx` (Theme grids +
     LanguageSwitcher + editor mode + font-size slider).
   - Keeps Theme Editor sub-modal logic here (it's triggered from Theme
     cards).

2. **`src/components/settings/SystemSection.tsx`**
   - Moves Update check + version display + About block.
   - Composes `DocToolsSection` and `DiagnosticsSection` inside.

### AI section

Extract renderable content from `AISettingsModal.tsx` into
`AISettingsContent` (exported alongside `AISettingsModal`). The original
`AISettingsModal` stays (other callers may depend on it) but just wraps
`AISettingsContent` in its modal chrome. The new settings page's AI tab
renders `AISettingsContent` directly — no nested modal.

If extraction turns out to be too invasive (e.g. the modal closes itself
on save via props), fall back to rendering a single "Open AI settings"
button in the AI tab that opens the existing modal. Decide per-file, not
upfront.

### Component changes in `SettingsModal.tsx`

- Replace the single scroll column with a flex row: nav (160px) +
  content area (flex-1, overflow-y-auto).
- Remove inline Theme / Editor / Update / About markup; delegate to the
  new section components.
- Add `<nav>` with 6 buttons, each highlighting when `activeTab` matches.
- Keep `ThemeEditor` modal overlay at the shell level (it's triggered
  from inside `GeneralSection` but renders outside the scroll area).

### What stays the same

- `useUIStore`, `useAIStore`, `useFileStore`, `useLocaleStore` usage.
- All child section components: `PublishSettingsSection`,
  `WebDAVSettings`, etc. are untouched.
- i18n strings for existing settings.
- Settings persistence / effect chains.
- The close-on-backdrop behavior.

### Risks

- **AI extraction complexity**: `AISettingsModal` is 544 lines with its
  own modal lifecycle. If `AISettingsContent` extraction fails, fallback
  to a "Open AI Settings" button in the AI tab. Do not block the whole
  refactor on this.
- **720px on small screens**: if viewport < 800px the modal may feel
  cramped. Acceptable for now; we can add a responsive tweak later if
  someone reports it.
- **Tab persistence**: `activeTab` resets each time the modal opens.
  That's fine — the desktop pattern is to start on "general".

## Non-goals

- No visual redesign of individual sections.
- No business-logic changes.
- No splitting of oversized sections like `WebDAVSettings` or
  other large existing sections.
- No i18n string rewording.

## Success criteria

- Opening settings shows left nav with 6 tabs, right content area, 720px
  wide modal.
- Clicking each tab swaps the right content with no layout shift in the
  nav.
- All 15 existing sections still function exactly as before.
- `npx tsc --noEmit` passes.
- `npx vitest run` passes with no new failures.
