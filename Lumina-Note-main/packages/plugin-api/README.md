# @lumina/plugin-api

Type definitions for Lumina plugins.

## Usage

```ts
import type { LuminaPluginEntrypoint } from "@lumina/plugin-api";

const setup: LuminaPluginEntrypoint = (api, plugin) => {
  api.logger.info(`${plugin.id} loaded`);
  return () => api.logger.info(`${plugin.id} unloaded`);
};

module.exports = setup;
```

For manifest fields and permissions, see:

- `docs/plugin-manifest.v1.md`
- `docs/plugin-open-strategy.md`
