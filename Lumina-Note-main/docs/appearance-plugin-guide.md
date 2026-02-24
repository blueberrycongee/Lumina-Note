# Lumina Appearance Plugin Guide

This guide focuses on one goal: let plugin developers reshape Lumina UI quickly, safely, and predictably.

## Scope

Appearance plugins can now affect all key host surfaces:

1. Theme tokens (`api.theme`)
2. Layered style injection (`api.ui.injectStyle`)
3. Visible host entry points (ribbon/status/settings/context menu/palette)
4. Workspace shell and layout presets
5. Editor appearance hooks (CodeMirror extensions + style overlays)
6. Reading view render hooks (HTML + DOM lifecycle)
7. Reusable UI SDK (`@lumina/plugin-ui`)
8. Rollback and isolation tools (safe mode + style cleanup)

## Start Fast

1. Open `Settings -> Plugins (Developer Preview)`.
2. Scaffold a theme or UI plugin template.
3. Enable the plugin and verify the first visual change.
4. Add layered styles and shell slots.
5. Add editor/reading hooks only when needed.

## 1) Theme API v1

Use tokens first. This keeps themes portable and reduces brittle CSS overrides.

```js
module.exports = (api) => {
  const removePreset = api.theme.registerPreset({
    id: "neo-paper",
    name: "Neo Paper",
    light: {
      "--background": "40 33% 98%",
      "--foreground": "24 11% 12%",
      "--radius": "14px",
      "--shadow-md": "0 10px 30px rgba(60, 42, 18, 0.12)",
      "--font-sans": "\"IBM Plex Sans\", sans-serif",
      "--motion-fast": "120ms",
    },
    dark: {
      "--background": "26 20% 10%",
      "--foreground": "38 20% 95%",
      "--radius": "14px",
      "--shadow-md": "0 10px 30px rgba(0, 0, 0, 0.45)",
      "--font-sans": "\"IBM Plex Sans\", sans-serif",
      "--motion-fast": "120ms",
    },
  });

  api.theme.applyPreset("neo-paper");
  return () => removePreset();
};
```

Also supported:

- `api.theme.setToken({ token, value, mode })`
- `api.theme.resetToken({ token, mode })`

## 2) Style Scope + Layer

Inject styles through explicit layers to avoid plugin conflicts:

- `base < theme < component < override`

```js
api.ui.injectStyle({
  css: ".reading-view .callout { border-radius: var(--radius); }",
  scopeId: "reading-view",
  layer: "component",
});
```

Guidelines:

- Use `theme` for design-system-level styling.
- Use `component` for local visual components.
- Use `override` only when intentionally replacing host/plugin rules.
- Keep `global: true` for rare top-level overrides.

## 3) Host UI Entry Points

Expose visible UI affordances so users discover your plugin naturally:

- `api.ui.registerRibbonItem`
- `api.ui.registerStatusBarItem`
- `api.ui.registerSettingSection`
- `api.ui.registerContextMenuItem`
- `api.ui.registerCommandPaletteGroup`

These are persistent host entry points, not one-off scripts.

## 4) Workspace Shell + Layout

For large visual redesigns:

- `api.workspace.registerShellSlot({ slotId, html, order })`
- `api.workspace.mountView({ viewType, title, html })`
- `api.workspace.registerLayoutPreset(...)`
- `api.workspace.applyLayoutPreset(id)`

Use shell slots for chrome-level UI modules and layout presets for repeatable workspace geometry.

## 5) Editor Appearance Hooks

Two extension paths are supported:

- `api.editor.registerEditorExtension(cmExtension)` for real CodeMirror extensions
- `api.editor.registerEditorExtension({ id, css, layer, scopeId })` for style-only editor overlays

Use CodeMirror extensions when you need decorations/widgets/behavior attached to editor state.

## 6) Reading View Hooks

Two levels are supported:

- `api.render.registerMarkdownPostProcessor({ id, process(html) })`
- `api.render.registerReadingViewPostProcessor({ id, process(container) })`

`registerReadingViewPostProcessor` may return a cleanup function. Cleanup is called on unmount and plugin unload.

## 7) UI SDK

`@lumina/plugin-ui` provides typed helpers for theme/token-driven plugins.

```ts
import { createThemePreset } from "@lumina/plugin-ui";
```

Prefer SDK helpers for consistent token naming and easier maintenance.

## 8) Rollback and Safety

Even with high freedom, keep recovery paths:

- `Appearance Safe Mode`: disables appearance-heavy plugins.
- Unload plugin styles from plugin manager.
- Disable plugin or reload runtime to return to host default visuals.

## Dev Workflow

1. Design token-first (colors/radius/type/motion).
2. Add component styles in `component` layer.
3. Add host entry points for discoverability.
4. Add shell/view changes for structural redesign.
5. Add editor/reading hooks only where plain CSS is not enough.
6. Validate with safe mode and plugin unload.

## Troubleshooting

- Styles not applied: check permission `ui:decorate` and layer choice.
- Theme not applied: check permission `ui:theme` and preset id.
- Editor extension inert: ensure you passed a valid CodeMirror extension.
- Reading DOM leaks: return cleanup from reading post-processor.
- Conflicts: use `Settings -> Plugin Style Runtime (Dev)` to inspect style layer collisions.

## Recommended Permissions

For full appearance plugins:

```json
{
  "permissions": [
    "ui:*",
    "workspace:*",
    "editor:*",
    "commands:*"
  ]
}
```

Use narrower permissions in production when possible.
