# @lumina/plugin-ui

Utility typings and helpers for appearance-focused Lumina plugins.

## What it provides

- Token categories for color / radius / typography / motion
- Theme preset helper typing
- CSS variable helper typing

## Example

```ts
import { createThemePreset } from "@lumina/plugin-ui";

const preset = createThemePreset({
  id: "ocean",
  tokens: {
    "--primary": "199 78% 49%",
  },
});

module.exports = (api) => {
  const disposePreset = api.theme.registerPreset(preset);
  api.theme.applyPreset("ocean");
  return () => disposePreset();
};
```
