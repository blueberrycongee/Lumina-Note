# Product

## Register

product

## Users

Knowledge workers, researchers, writers, and students who keep a long-running markdown notebook and want AI assistance that touches their notes directly — not a chat window pasted on the side. They use the app daily, often on a 13–27" screen, in either light office light or dim evening conditions. Many keep the app open for hours at a time; visual fatigue and chrome-noise compound across that session.

The user is a tool-user, not a media consumer. They are fluent in Notion, Obsidian, iA Writer, Bear, Apple Notes, ChatGPT — they will notice subtly-off components and lose trust if the tool feels invented-for-flavor.

## Product Purpose

Lumina Note is a **local-first AI notebook**. The vault lives on disk in plain markdown. AI agents can read, edit, plan, and link inside it — but the user owns the file system, the data, and the model choice (Anthropic, OpenAI, DeepSeek, Gemini, Moonshot, Groq, OpenRouter, Ollama, etc.).

Success is invisible: the user opens the app, writes or thinks, and the tool gets out of the way. The AI surfaces (chat, agent run, skill picker, mention) feel like part of the editor, not a separate product bolted on.

## Brand Personality

**Quiet. Precise. Earned-trust.**

The voice is plain. No marketing puff, no exclamation, no "AI-powered" garnish. Tooltips, errors, empty states, and chrome copy use the same direct register a senior engineer would use writing inline docs. Personality lives in the craft (typography, motion timing, the feel of pressing a button), not in the words.

## Anti-references

What this should NOT look like:

- **Notion AI's panel proliferation** — the modern Notion habit of pasting AI surfaces on top of the editor with their own chrome (gradient buttons, sparkle icons, accent fills). Lumina's AI inherits the editor's vocabulary; it does not announce itself as a separate product.
- **Cursor's terminal-coded darkness** — heavy black surfaces, neon syntax, IDE-flavored chrome. Lumina is for prose, not code, even though it can edit code.
- **Heptabase / Anytype's color carnival** — every block tinted, every category iconified. We are monochrome plus one near-black accent.
- **SaaS landing-page aesthetics anywhere in the app** — gradient hero buttons, glassmorphism, big rotating "feature" cards, big numbers above small labels. The category cliché.
- **Obsidian's plugin-chrome accretion** — every plugin adds a toolbar, a panel, a sidebar tab. Chrome sprawl is failure.
- **Display-font flourishes anywhere in the chrome** — Cormorant Garamond, Instrument Serif, Tiempos Headline, etc. We are Inter, end of discussion. Display fonts in app UIs are the brand-bias bleed-through.

Positive references (the right neighborhood, not direct copies):

- **iA Writer, Bear** — typography-led restraint, the editor IS the product
- **Linear** — interaction craft, keyboard-driven, motion that feels physical
- **Apple Notes (modern macOS)** — sidebar density, native control feel
- **ChatGPT (current Harmony era)** — quiet AI chrome, model picker / effort picker as a precedent
- **Notion's pre-2023 editor** — before the AI panels accumulated

## Design Principles

1. **The tool disappears into the task.** Chrome never competes with content. The editor's type and motion is the spine; chat, agent, and command surfaces inherit it rather than ride on top in their own visual language.

2. **Earned familiarity over invented flavor.** Match the conventions of best-in-class tools (Apple HIG, Linear, OpenAI). Standard affordances exist for a reason — reinvent only when the standard genuinely fails the task. Novelty has to pay for its seat.

3. **One signal per state.** Selected, hover, focus, active, disabled — each reads as one clear thing. We do not stack bg + accent bar + check + bold + color. Pick the cleanest single signal that works.

4. **Local-first dignity.** The user trusted us with their entire knowledge base sitting in plain files on their disk. The interface should feel like a serious tool earning that trust — not a growth product, not a demo, not a viral artifact.

5. **AI surfaces are co-designed with the editor, not against it.** When the AI shows a row, picker, popover, or message bubble, it uses the same Row, the same Popover, the same typography scale, the same motion tokens as the rest of the app. If a new AI feature can only be expressed by reaching outside the system, the system needs to grow — but the AI feature does not get its own visual language.

## Accessibility & Inclusion

- **WCAG AA** as the floor for text contrast. Dark mode in particular has been tuned so muted-foreground hits ≥ 4.9:1 against every surface tier.
- **`prefers-reduced-motion`** is honored in framer-motion (via `useReducedMotion`) and in CSS (via `@media (prefers-reduced-motion: reduce)`). All popover / dialog entrances collapse to a fade, no scale or translation.
- **Focus rings only on `:focus-visible`** — mouse clicks never show the ring, keyboard navigation always does.
- **Keyboard parity for every chrome action.** Anything achievable by mouse must be achievable by keyboard. Command palette + slash commands + menu items expose `Kbd` hints inline.
- **i18n** — UI strings live in `src/i18n/locales/`. Eleven languages currently shipped. CJK, Cyrillic, Latin scripts all need to render at 13px regular without breaking the row rhythm; this constrains font choice (Inter is good across Latin/Cyrillic; system fallback handles CJK).
- **Tabular figures** for any data that aligns vertically (timestamps, model context-window numbers, token counts).
