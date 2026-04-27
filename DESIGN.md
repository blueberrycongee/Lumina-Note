---
name: Lumina Note
description: Local-first AI markdown notebook — Inter-led, monochrome, Apple/OpenAI-restraint
colors:
  background: "#fbfcfd"
  foreground: "#181c22"
  muted: "#f1f3f5"
  muted-foreground: "#6b7177"
  accent: "#e6e9ed"
  popover: "#ffffff"
  border: "#d9dde2"
  ribbon: "#e3e6ea"
  primary: "#171717"
  destructive: "#db2c2c"
  success: "#2d9e5b"
  warning: "#eb8d09"
  info: "#2c7be5"
  background-dark: "#161719"
  foreground-dark: "#f3f4f5"
  muted-dark: "#222426"
  popover-dark: "#36383a"
  border-dark: "#43464a"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  control:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  mono:
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.popover}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    typography: "{typography.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    typography: "{typography.control}"
  row-default:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.control}"
  row-compact:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.control}"
  row-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.control}"
  popover-content:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "4px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "0 8px"
    height: "28px"
    typography: "{typography.label}"
  kbd:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.sm}"
    padding: "1px 5px"
    typography: "{typography.label}"
---

# Design System: Lumina Note

## 1. Overview

**Creative North Star: "The Quiet Workshop"**

Lumina Note is a desk for thinking, not a stage. The interface is the surface a serious notebook sits on — the wood, the lamp, the margin. The user's writing, the AI's edits, the graph of links between them — those are what move and change. Everything else stays still, neutral, and quiet enough that hours of editing don't accumulate visual fatigue.

The system is monochrome by default — a near-white canvas with cool-gray panels and near-black text. There is no brand color tinting the chrome, because the *brand is the restraint*. Color appears only as semantic state (destructive red, success green, warning orange, info blue), and even those are muted one notch from typical Tailwind defaults so they coexist with notes the user pastes in. AI surfaces — chat, agent runs, model pickers, mention menus — share the editor's typography, motion timing, and component vocabulary. They are not visually announced as a separate product.

The aesthetic owes most to Apple's modern HIG (control density, focus discipline, material elevation) and OpenAI's current ChatGPT shell (text-first menus, near-zero accent color in chrome, motion that conveys state without performing it). It explicitly rejects the SaaS-landing-page aesthetic — gradient buttons, glassmorphism, hero metrics, decorated AI panels — and the IDE-darkness aesthetic — neon syntax, terminal flavoring, heavy black surfaces.

**Key Characteristics:**
- Inter for everything in the chrome. Display fonts are banned from UI labels, buttons, data, and AI surfaces.
- 13px regular as the desktop control standard. 14px is reserved for body labels and form inputs; 16px is reserved for editor body and conversation messages.
- Selection signals are single-channel: bg fill + weight step, never bg + bar + check stacked.
- Motion is fast and physical: 100–200ms with spring or exponential ease-out. No bounce, no elastic, no orchestrated entrances.
- Chrome stays still while content moves. Sidebar files animate in/out; the sidebar itself does not.

## 2. Colors

A near-monochrome cool-tinted neutral spine with one achromatic primary and four muted semantic colors. Color carries state, never decoration.

### Primary

- **Near-Black Achromatic** (`#171717` light / `#fafafa` dark): The action color. Buttons, links, focus rings, selection accents. Achromatic on purpose — the Notion / Linear pattern. The product's identity comes from typography and layout, not from a brand hue painted over the UI.

### Neutral

- **Off-White Canvas** (`#fbfcfd` light / `#161719` dark): The editing surface. Cool-tinted (HSL 220) so it doesn't read as flat white; tinted dark in dark mode so it doesn't read as pure black. `hsl(var(--background))` is the canonical CSS reference.
- **Near-Black Foreground** (`#181c22` light / `#f3f4f5` dark): Body text and primary chrome.
- **Subtle Surface — Muted** (`#f1f3f5` light / `#222426` dark): Sidebars, status bar, secondary panels. One step lifted from canvas in dark mode (cool-tinted L=14% vs canvas L=9%).
- **Hover Surface — Accent** (`#e6e9ed` light / `#2a2c2e` dark): Hover/active fill on muted panels. Stronger than muted, weaker than primary.
- **Crisp Popover White** (`#ffffff` light / `#36383a` dark): Floating panels — popovers, dropdowns, tooltips. Pure white in light mode (the only place we use it) so popovers feel crisp against the off-white canvas. In dark mode lifted to L=23% so popovers stand visibly off the page.
- **Hairline Border** (`#d9dde2` light / `#43464a` dark): Borders are visible and precise — never a vague gradient. At `/40` they soften for dividers; at full opacity they delineate.
- **Recessed Ribbon** (`#e3e6ea` light / `#0e0f10` dark): The toolbar / ribbon bar. In dark mode, the only surface DARKER than canvas — it reads as set-into the chrome rather than lifted off it.

### Semantic (muted one notch — no neon)

- **Destructive Red** (`#db2c2c`): Delete confirms, error states. Never used for inactive negative space.
- **Success Green** (`#2d9e5b`): Save confirmation, sync success. Never used decoratively.
- **Warning Orange** (`#eb8d09`): Pre-destructive prompts, low-severity alerts.
- **Info Blue** (`#2c7be5`): Wiki-link hover, neutral inline notices. Never used as an "AI accent."

### Named Rules

**The No-Brand-Color Rule.** The chrome has no brand hue. Primary is achromatic; the only colors that appear in normal use are the four semantic ones, and they appear only on state-bearing elements. If you find yourself adding a "brand teal" or "AI purple" to a button or panel background, the rule has been violated.

**The Canvas-Stays-Quiet Rule.** The editor canvas itself never receives ambient color, gradients, vignettes, or animated background flourishes. Everything decorative belongs on chrome elements (buttons, chips, popovers) or in user content — never on the canvas they're editing.

## 3. Typography

**Display Font:** Inter (with `-apple-system`, `BlinkMacSystemFont`, `Segoe UI` fallbacks for cold-start)
**Body Font:** Inter (same family throughout — no display/body pairing)
**Mono Font:** JetBrains Mono (with `SF Mono`, `Fira Code`, `Menlo`, `Consolas` fallbacks)

**Character:** A single well-tuned humanist sans across every surface. Inter at 13px regular is the base voice; weight steps to 500 carry selected and emphasis states. We do not pair Inter with a serif display, an editorial italic, or a geometric heading font. The hierarchy comes from scale and weight contrast within Inter — adding a second family would create the boutique-magazine feel we explicitly reject.

### Hierarchy

- **Display** (Inter 500, 20px, line-height 1.3): Dialog titles, hero greetings.
- **Headline** (Inter 500, 18px, line-height 1.35): Card titles, section titles inside panels.
- **Title** (Inter 500, 16px, line-height 1.4): Subheadings inside dialogs and detail panes.
- **Body** (Inter 400, 16px, line-height 1.6, max 65–75ch in prose contexts): Conversation messages, editor body, long-form notes.
- **Control** (Inter 400, 13px, line-height 1.4): Popover rows, sidebar items, form inputs, menu items, button labels in dense surfaces. Selected control rows step weight to 500.
- **Label** (Inter 500, 12px, line-height 1.3): Hints, timestamps, kbd captions, tag labels, chip text. Letter-spacing only on all-caps labels (`+0.05em` to `+0.08em`).
- **Mono** (JetBrains Mono 400, 13px, line-height 1.5): Inline `code` in prose, keyboard shortcuts inside running text, code blocks in chat messages.

### Named Rules

**The 13px Rule.** Desktop control type is 13px regular. Apple, Linear, OpenAI, Raycast all sit there for a reason — it's the density that disappears into the task on a 13–27" screen viewed at arm's length. `text-sm` (14px) is reserved for buttons and form inputs that benefit from a slightly larger hit target's perceived size. Anything below 12px is forbidden in chrome.

**The Single-Family Rule.** Inter carries everything in the UI. No display serif, no editorial script, no expressive secondary face. If a screen needs more typographic presence, get it from scale and weight, not from a second font.

**The Selection-Weight Rule.** Selected list rows step the title from 400 to 500. Combined with the bg-accent fill, that's the *complete* selection signal. We do not add a left accent bar, a leading dot, or a colored title on top of it.

## 4. Elevation

The system uses three deliberate stops of soft shadow, layered with surface-color tier shifts. Surfaces are flat at rest — shadows only appear on lifted things (popovers, toasts, dialogs) and on hover/focus state changes that need to read as a physical lift.

### Shadow Vocabulary

- **elev-1** (`box-shadow: 0 1px 2px 0 hsl(var(--foreground) / 0.04)`): Cards, inline callouts, the toolbar pill at rest. A barely-there 2px soft drop. In dark mode: same drop, no inner highlight (a highlight at this elevation reads as busy).
- **elev-2** (`box-shadow: 0 4px 14px -3px hsl(var(--foreground) / 0.14), 0 1px 3px hsl(var(--foreground) / 0.08)`): Popovers, tooltips, model-picker chips when open, toasts. A diffuse 14px lift plus a 3px contact shadow. In dark mode: layered with `inset 0 1px 0 hsl(0 0% 100% / 0.07)` so popovers read as physical objects under light.
- **elev-3** (`box-shadow: 0 12px 32px -8px hsl(var(--foreground) / 0.20), 0 2px 6px hsl(var(--foreground) / 0.10)`): Dialogs, command palette. A serious 32px diffuse cast plus a 6px contact shadow. In dark mode: layered with `inset 0 1px 0 hsl(0 0% 100% / 0.08)`.

### Named Rules

**The No-Stacking Rule.** A surface gets exactly one shadow token. Never `shadow-md shadow-lg shadow-sm/20` triple-stacked. If elev-2 isn't strong enough, the surface needs to move to elev-3, not accumulate.

**The Inset-Highlight Rule (dark mode).** elev-2 and elev-3 in dark mode include a 1px inset top highlight at `hsl(0 0% 100% / 0.07–0.08)`. This is the signature Apple touch — without it, dark popovers read as flat squares; with it, they sit as physical objects with light catching the upper edge. Never apply this to elev-1 (too busy at small lifts).

**The No-Backdrop-Blur Rule.** Popover backgrounds are solid — `bg-popover`, full opacity. We do not use `backdrop-blur` for "glass" effects. Glass costs paint and adds grainy texture against low-contrast backgrounds; we get our depth from elevation tokens, not blur.

## 5. Components

### Buttons (`src/components/ui/button.tsx`)
- **Shape:** `rounded-ui-md` (6px). All button variants share the same radius — primary, secondary, ghost, destructive — so they read as a family.
- **Primary:** `bg-primary text-primary-foreground` (near-black on near-white in light, inverted in dark). Padding `8px 14px`. Hover steps lightness 5%; no scale, no translate.
- **Ghost:** `text-foreground hover:bg-accent`. The default for icon-only buttons in dense areas.
- **Destructive:** `bg-destructive text-destructive-foreground`. Reserved for confirms inside delete dialogs.
- **Hover / Focus:** Background transition at `--motion-fast` (100ms) with `--motion-ease-out`. Focus ring on `:focus-visible` only — `ring-2 ring-primary/40 ring-offset-2 ring-offset-background`.
- **Loading state:** spinner replaces label inline; button width does not shift.
- **Disabled:** `opacity-50 pointer-events-none`.

### Row (`src/components/ui/row.tsx`) — the shared list-item primitive

Used everywhere a list of options appears: popover menus, sidebar items, settings rows, command palette results.

- **Anatomy:** `[icon] [title + optional description] [trailing slot]` — left-to-right.
- **Density default:** `px-3 py-2`, `gap-2.5`, 16px icon container — sidebars, settings rows.
- **Density compact:** `px-2.5 py-1.5`, `gap-2`, 14px icon container — popovers, menus.
- **Title typography:** Control (13px Inter regular). Selected steps to 500.
- **Description:** 12px muted-foreground.
- **Hover (non-selected):** `bg-foreground/5` — a barely-there tint, OpenAI-quiet.
- **Selected:** `bg-accent` plus title weight steps to 500. No left accent bar. No colored title.
- **Trailing slot:** `Kbd`, chevron, or 14px lucide check icon. The check is the explicit selection confirmation when the row appears in a multi-option picker.

### Chip (`ChipButton` in `ModelEffortPicker.tsx`)
- **Shape:** `rounded-full`, `h-7`, `px-2`.
- **Style at rest:** transparent bg, `text-muted-foreground`, label class typography (12px medium).
- **Style on hover / open:** `bg-accent text-foreground`, lifted `-translate-y-px shadow-elev-1`. Spotify-style micro-motion: bg + 1px lift + soft shadow ride together on a single 200ms ease.
- **Use:** chrome-level toggles that open a popover (model, mode, effort). Never used as a tag, badge, or filter.

### Popover (`src/components/ui/popover.tsx`)
- **Surface:** `bg-popover text-popover-foreground border border-border rounded-ui-lg shadow-elev-2`.
- **Open:** 140ms with `cubic-bezier(0.2, 0.9, 0.1, 1)` (ease-spring). Scales from the corner closest to the trigger so it reads as "popping out from the chip" rather than ballooning from its own center.
- **Close:** 100ms with `ease-out-subtle` — close is faster than open.
- **Focus:** outside click + `Esc` dismisses; focus returns to the trigger on close.
- **Reduced motion:** scale + translate collapse to opacity-only.
- **Width:** content-natural by default; explicit `width` prop available for fixed-size cases (model picker = 240px, mode/effort pickers = 200px).

### Inputs (`src/components/ui/field.tsx`)
- **Style:** 1px `border` at rest, `rounded-ui-md` (6px), `bg-background`. Padding `8px 12px`. Typography 14px regular for input contents.
- **Focus:** ring-2 `ring-primary/30 ring-offset-1` plus `border-foreground/40`. No glow, no shadow.
- **Error:** `border-destructive` with a 12px error message below in `text-destructive`.
- **Disabled:** `opacity-50` plus `bg-muted`.

### Tooltip (auto-attached, `src/components/ui/tooltip.tsx`)
- **Trigger:** any `button`, `[role=button]`, or `a[href]` with an `aria-label`, `data-tooltip`, or `title` AND no visible letter-character label inline. Buttons that show "Send" or "Save" inline don't get a redundant tooltip.
- **Style:** `bg-foreground text-background`, 12px line-height-tight, `rounded-md`, `px-2 py-1`, `shadow-md`. Centered on the trigger horizontally, clamped 8px inside the viewport.
- **Timing:** 350ms hover delay, 60ms hide delay, immediate on keyboard focus.
- **Animation:** `fade-in zoom-in-95 duration-100` — quiet entrance, no overshoot.

### Scrollbars (global, `src/styles/globals.css` + `src/lib/scrollFadeGlobal.ts`)
- **Style at rest:** invisible — `scrollbar-color: transparent transparent`.
- **Style while scrolling:** thumb fades in to `hsl(var(--muted-foreground) / 0.26)` over 180ms ease-spring; fades out 720ms after the last scroll event.
- **Triggering:** a single document-level capture-phase scroll listener (`installGlobalScrollFade`) toggles `.is-scroll-active` on the scrolling element. No per-component wiring needed.
- **Width:** 8px (default), 6px (editor / sidebar overrides via `.editor-scroll-shell` / `.sidebar-file-tree-scroll`).

## 6. Do's and Don'ts

### Do:
- **Do** use Inter (with `-apple-system` fallback) for everything in the chrome. JetBrains Mono is the only second face, reserved for code.
- **Do** keep popover/menu/sidebar row text at 13px regular. Step to 500 weight only for selected rows and titles.
- **Do** signal selection as a single channel — `bg-accent` plus weight-500. Drop the legacy left accent bar; keep the trailing check icon only when the row sits inside a picker that explicitly confirms the active choice.
- **Do** use the existing motion tokens — `--motion-fast` (100ms) for hover, `--motion-open` (140ms) for popover entrances, `--motion-exit` (100ms) for close, `--motion-content` (200ms) for content state changes. Pair them with `--motion-ease-spring` on entrances and `--motion-ease-out` on exits.
- **Do** anchor scale animations to the corner closest to the trigger. Popovers scale-in from `bottom-left`, `top-end`, etc.; not from their own center.
- **Do** suppress hover tooltips on buttons that already render their label inline. Use `data-tooltip-force="true"` only when the visible text is a value (e.g. "100%") rather than a label.
- **Do** clamp popover and tooltip positioning inside the viewport — both primitives already do this, and any new floating surface has to as well.
- **Do** honor `prefers-reduced-motion`. Framer Motion's `useReducedMotion` collapses animations to opacity-only; CSS animations cap at 0.01ms via the global `@media` rule.
- **Do** keep tabular figures on data that aligns vertically — `font-variant-numeric: tabular-nums`.

### Don't:
- **Don't** introduce a second typeface for "personality" — no Cormorant Garamond, no Instrument Serif, no editorial italic, no expressive display font anywhere in the chrome. Inter carries it.
- **Don't** use display or fluid typography (`clamp()`) in the app UI. Headings in dialogs and panels are fixed-size at the chosen scale step.
- **Don't** stack selection signals — `bg-accent` + left accent bar + check + bold + colored title is four things doing one job. Pick one.
- **Don't** add a brand hue to chrome surfaces. Primary is achromatic on purpose. AI surfaces don't get a "AI purple" or "AI teal" accent.
- **Don't** paint the editor canvas with ambient color, gradients, vignettes, or background flourishes. Visual silence on the canvas is the design.
- **Don't** use bouncy or elastic easing curves. They feel tacky in 2026. Use `cubic-bezier(0.2, 0.9, 0.1, 1)` (spring) for entrances, `cubic-bezier(0.2, 0, 0.4, 1)` (ease-out) for exits, exponential out for micro-interactions.
- **Don't** animate `width` / `height` / `top` / `left`. Use `transform` (translate, scale) and `opacity` only. Accordions use `grid-template-rows: 0fr → 1fr` instead of animating height.
- **Don't** use `backdrop-blur` decoratively. Popover backgrounds are solid `bg-popover`.
- **Don't** add a left accent bar (`border-left` ≥ 2px as a colored stripe) on cards, list items, callouts, or alerts. Banned by `impeccable`'s shared design laws and by our own selection-signal rule.
- **Don't** clip text with gradients (`background-clip: text`). Decorative, never meaningful here.
- **Don't** ship hero-metric templates (big number, small label, gradient accent) anywhere. SaaS cliché — the antithesis of "tool disappears into the task."
- **Don't** reach for a modal as the first answer to a UX problem. Inline editing, progressive disclosure, and popovers exhaust the alternatives first.
- **Don't** use em dashes in chrome copy (`—`). Use commas, colons, semicolons, periods, or parentheses.
- **Don't** add hover tooltips to buttons that already show their label. The aria-label is for screen readers; the visual tooltip would just be duplicate noise.
