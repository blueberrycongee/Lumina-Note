# Lumina Design System

This file is the **single source of truth** for visual + interaction decisions.
If a component disagrees with this doc, the component is wrong.

## Product character

Lumina is a note-taking app with an AI coding agent embedded. Two zones coexist:

- **Content zone** (editor, conversation) — Notion / Claude warmth. Content is
  the subject; chrome recedes. Generous whitespace, calm rhythm.
- **Tool zone** (popovers, approvals, settings, session list) — Linear / Amp
  precision. Keyboard-first, dense without being cramped, snap feedback.
- **Chrome** (tabs, sidebar rails, toolbars) — OpenAI restraint. Quietly
  present, never demanding attention.

We do **not** do warm-beige Apple Notes softness, dense enterprise tables, bold
playful color blocks, or AI-purple hero gradients. The design voice is
**serious-but-warm**: confident in what it shows, calm in how it shows it.

## Color

### Neutrals (near-monochrome, cool-tinted)

Tokens in `src/styles/globals.css` (`--background`, `--foreground`, `--muted`,
`--accent`, `--popover`, `--border`). Light mode is off-white (not pure white —
reduces glare against dark editor content); dark mode is near-black with a
slight cool tint (not OLED black — too harsh against long-reading content).

Use:
- `bg-background` for app shell
- `bg-muted` / `bg-accent` for subtle surfaces (muted is quieter, accent is
  hover-level)
- `bg-popover` for popovers/dialogs (pure white in light mode — deliberate
  contrast with off-white app shell)
- `text-foreground` / `text-muted-foreground` — that's it. No other text color
  tokens exist in chrome.

### Accent (one color, used sparingly)

`--primary` is a **deep teal-emerald** (`165 45% 38%` light / `165 42%
56%` dark). Deliberately *not* the indigo / purple that every other AI
and productivity tool is painted with — that's the "safe SaaS default",
and we want Lumina to read as craft, thought, library rather than
generic tech-modern. The hue is calm-confident (closer to Craft / Bear
/ Things territory than to Linear / Vercel).

Use for:
- Active nav state, selected row border
- Focus ring (always via `focus-visible`)
- Primary button fill
- Link underline
- The assistant-avatar identity chip in the conversation

Never as a large fill (no tinted header bars, no big teal panels). A
2px-wide accent stripe on a selected row carries more weight than a
full-bleed tint; the color is load-bearing precisely because it's rare.

If we ever decide the hue doesn't fit, **a single H/S/L change in
`src/styles/globals.css`** swaps it everywhere.

### Semantic

`destructive` / `success` / `warning` / `info` — muted one notch from typical
Tailwind values so they coexist with the quiet palette. Use only for the thing
they name. Info is not decoration.

## Typography

| Token | Usage |
|---|---|
| `text-xs` (12px) | hints, timestamps, kbd, tag labels, row descriptions |
| `text-[13px]` | popover/menu rows, sidebar items, form inputs (desktop control standard) |
| `text-sm` (14px) | button labels, settings labels, body chrome |
| `text-base` (16px) | conversation messages, editor body |
| `text-lg` (18px) | card titles, section titles |
| `text-xl` (20px) | dialog titles, page titles |
| `text-2xl` (24px) | welcome hero |
| `text-3xl` (30px) | reserved for onboarding / empty-state hero |

**Rules**

- 13px is our desktop control type (Apple/OpenAI standard for menus and
  list rows). Don't go below 12px — if 12 feels too big, the row padding is
  too tight, fix that first.
- Weight: **400 body, 500 selected/titles, 600 emphasis only.** No 700+.
  Default Row title is 400; 500 is reserved as a *selection signal*, not a
  decorative emphasis.
- `font-sans` = Inter everywhere in chrome. `font-mono` = JetBrains Mono for
  code/keyboard-shortcuts-inside-prose. No serif display font (yet).

## Spacing rhythm

4px base. Prefer these increments:

- Row padding (default density): `px-3 py-2` — 12 × 8 — sidebars, settings rows
- Row padding (compact density): `px-2.5 py-1.5` — 10 × 6 — popovers, menus
- Row min-height: 28px (compact), 32px (default), 40px preferred where density allows
- Card padding: `p-4` (16) — internal
- Dialog padding: `p-6` (24) — generous, never cramped
- Section gap inside dialog: `space-y-6`
- Field-to-field gap: `space-y-4`
- Label-to-input gap: `gap-1.5` (6)

## Radii

| Token | Value | Usage |
|---|---|---|
| `rounded-ui-sm` | 4px | chips, kbd, tags |
| `rounded-ui-md` | 6px | buttons, inputs, popover rows |
| `rounded-ui-lg` | 10px | cards, popover containers, toolbar pills |
| `rounded-ui-xl` | 14px | dialogs, welcome hero |
| `rounded-full` | — | avatars, status dots, floating bubbles only |

Avoid arbitrary radii. Sharper corners read as more serious — we went tighter
than the old 6/8/12 set on purpose.

## Elevation (shadows)

Three stops. Do not stack.

| Token | CSS | Usage |
|---|---|---|
| `shadow-elev-1` | hairline + 2px soft | cards, inline callouts, toolbar |
| `shadow-elev-2` | 8px subtle + hairline | popovers, toasts |
| `shadow-elev-3` | 24px soft + hairline | dialogs, command palette |

**No `backdrop-blur`.** It costs a lot to render and adds grainy texture on
low-contrast backgrounds. Popover backgrounds are solid `bg-popover`.

## Motion

Timing (read from `--motion-*` CSS vars or `duration-fast|open|exit|content` in
Tailwind):

| Stage | Duration | Easing |
|---|---|---|
| Hover / toggle state | 100ms | `ease-out-subtle` |
| Popover / tooltip open | 140ms | `ease-spring` |
| Popover / tooltip close | 100ms | `ease-out-subtle` |
| Content state change | 200ms | `ease-standard` |
| Sidebar slide | 220ms | `ease-spring` |

**Rules**

- **Keyboard navigation is NOT animated.** Arrow-key moving selection between
  rows happens instantly. Hover highlight on the SAME row fades in 100ms. This
  is Linear's rule and it's why their menus feel fast.
- **Close is faster than open.** Users are confirming an action — don't make
  them wait to see it disappear.
- **Transform-only where possible.** `translate`, `scale`, `opacity` — GPU
  smooth. Avoid animating `width`/`height`/`top`/`left`.
- **Respect `prefers-reduced-motion`.** Use Framer Motion's `useReducedMotion`
  hook OR a CSS `@media (prefers-reduced-motion: reduce)` wrapper.

## Focus + selection

- **Focus ring only on `focus-visible`.** Mouse clicks never show a ring.
  Pattern: `focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-primary/40 focus-visible:ring-offset-2
  focus-visible:ring-offset-background`.
- **Selected row** (keyboard or persistent state): `bg-accent` + title weight
  steps from 400 to 500. Hover state uses a quiet `bg-foreground/5` tint —
  the bg-intensity gap (and weight diff) keeps hover and selected
  distinguishable without an extra accent bar. We dropped the legacy left
  accent bar in favor of this single-signal pattern (Apple/OpenAI menus).
- **ESC always dismisses** overlays. **Outside click** dismisses popovers but
  not dialogs (dialogs require explicit confirm/cancel).

## Keyboard shortcuts

Every shortcut visible in chrome displays a `<Kbd>` inline. Convention:

- `⌘K` opens command palette (planned — D7)
- `Enter` confirms primary action
- `Esc` dismisses
- `↑ ↓` navigate list
- `Tab` moves focus forward; list items don't trap Tab (Tab exits the list)
- `@` triggers file mention; `/` triggers slash command

Always use the macOS glyphs (`⌘ ⌥ ⇧`) in UI, even on Windows/Linux — renderer
remaps them per-platform at display time if we add that layer later.

## Components

Canonical primitives live in `src/components/ui/`:

- `Button` — existing; primary/secondary/ghost, sm/md/lg
- `Card` — existing; replace ad-hoc wrapper divs
- `Kbd` — existing; keyboard keycap
- `Popover` — D2; trigger + content + rows for menus
- `CommandMenu` — D7; Popover variant with searchable list
- `Dialog` — D2; header + body + footer modal
- `Row` — D2; the shared list-item primitive (left icon · title+description ·
  trailing slot)
- `Field` — D2; label + control + hint + error
- `SectionHeader` — D2; section title with optional right-slot action

### "Row" composition rules

Any list item (popover, sidebar, settings row) uses `<Row>`:

```tsx
// Default density — sidebar / settings, 16px icon
<Row
  icon={<FileText size={16} />}
  title="workspace.md"
  description="recently edited"
  trailing={<Kbd>⌘O</Kbd>}
  selected={isSelected}
  onSelect={handle}
/>

// Compact density — popover / menu, 14px icon
<Row
  density="compact"
  icon={<Sparkles size={14} />}
  title="Skills"
  trailing={<Kbd>/</Kbd>}
  onSelect={handle}
/>
```

This forces visual parity across the app. If a new pattern emerges, extend
`Row` — don't reinvent.

## Anti-patterns (things NOT to do)

- **No emoji in chrome.** `🤖 Agent Settings` → replace with a `<Bot size={16}
  />` icon. Emoji belong in content the user types/sees, and in our welcome
  greeting (that's personality, distinct from chrome).
- **No hardcoded colors.** `text-slate-500` → `text-muted-foreground`.
  `bg-white` → `bg-popover` or `bg-background`.
- **No inline arbitrary sizes.** `text-[11px]` → `text-xs`. If `text-xs` is
  too big, redesign the hierarchy instead of shrinking type.
- **No `backdrop-blur`.** Use solid surfaces.
- **No gradient fills on chrome.** Gradients belong in welcome heros and
  empty-state illustrations only.
- **No shadow stacking** (`shadow-lg shadow-black/5 shadow-md` nonsense). One
  `shadow-elev-*` token, end.
- **No focus ring on mouse click.** Always `focus-visible`.
- **No scrollbar styling in chrome popovers.** They're short; if a popover is
  >10 rows, it needs a search input, not a longer scroll area.

## Dark mode

Every token has a dark-mode value. Validate both modes for every component
PR — the cheap bug is "looks great in light, broken in dark".

Dark-mode specific adjustments already applied:
- Primary is 10% more luminous (`68%` vs `58%` lightness)
- Shadows use black instead of foreground-tinted (better on dark surfaces)
- Popover bg is lifted 3% from app bg (gives visual separation against the
  darker shell)

## Migration notes

Legacy tokens and classes are aliased, not removed, so unmigrated code keeps
working:

- `rounded-ui-*` — same token names, tighter values (6/8/12 → 4/6/10)
- `shadow-ui-card` → `shadow-elev-1`, `shadow-ui-float` → `shadow-elev-2`
- `--ui-motion-*` → re-exported from the new `--motion-*` set
- `--primary` hue shifted from 200° (blue-cyan) to 234° (indigo). Existing
  `bg-primary/10` tints will become more violet. This is intentional.

When you touch a component, move it off the legacy aliases in the same commit.
