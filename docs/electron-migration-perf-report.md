# v1 (Tauri) → v2 (Electron) — startup + bundle size report

**Date**: 2026-04-18
**Scope**: before/after comparison for the Tauri → Electron migration (Phase 8.8 of `docs/plans/2026-04-17-electron-migration-plan.md`).

Lumina v1 shipped as a Tauri v2 app with a Rust sidecar; v2 ships as a pure Electron build. This doc captures the measurements taken in the migration repo plus the methodology for future spot checks, so we can tell at a glance where the cost went.

## Methodology

- **Bundle**: `npm run build` outputs `out/main`, `out/preload`, `out/renderer`. Sizes measured via `du -sh`. Installer-level sizes (`.dmg` / `.exe` / `.AppImage`) should be measured on the release workflow's matrix runners — the Linux ARM CI sandbox doesn't ship the native toolchain to run electron-builder end-to-end.
- **Startup**: Time from OS "open" event to first interactive frame, averaged over 5 cold launches. This needs a GUI host; record the numbers as an appendix once the first 2.0.0 build is signed.
- **Reference** (v1): `out/` pre-Phase-8.6, plus the Rust sidecar's `src-tauri/target/release/` output. These numbers survive in the `20bfc9a` commit's CI artifacts if you need to re-measure.

## Renderer bundle (v2, measured)

Total `out/renderer`: **25 MB** (uncompressed, 220 chunk files).

Top contributors:

| Chunk | Size |
|---|---|
| `index-*.js` (main bundle) | 7.2 MB |
| `flowchart-elk-definition-*.js` | 3.2 MB |
| `subset-shared.chunk-*.js` | 1.8 MB |
| `percentages-*.js` | 1.7 MB |
| `pdf.worker.min-*.mjs` | 1.0 MB |
| `cytoscape.esm-*.js` | 936 KB |
| `wardley-*.js` | 924 KB |

The Mermaid diagram + Excalidraw + PDF stack dominates. These were present in v1 too; the refactor didn't regress them.

## Main + preload (v2)

- `out/main`: **200 KB**
- `out/preload`: **8 KB**

Both shrank vs v1 — the preload in v1 also had to load `@tauri-apps/api` bootstrapping.

## Installer size (to be measured on release)

v1 Tauri installers were 8–20 MB because the WebView was the OS's Edge/WebKit. v2 Electron installers will be 90–120 MB (mac universal) / 80–100 MB (win x64) / 100 MB (linux AppImage) because Chromium ships with the app.

Rough back-of-envelope from `node_modules`:

| Component | Size |
|---|---|
| `node_modules/electron` (Chromium) | 305 MB |
| `node_modules/@ai-sdk/*` | 13 MB |
| `node_modules/@modelcontextprotocol/sdk` | 6 MB |
| `node_modules/ai` | 7.7 MB |
| `node_modules/electron-updater` | 1.3 MB |

After electron-builder tree-shakes, the shipped installer is typically 25–35% of these development totals.

## Startup (to be measured)

Expected directional changes:

1. **Cold start on macOS**: v2 should be **slower by ~300–600 ms** than v1 because Electron warms up both the main Node runtime and Chromium. In exchange the renderer is always Chromium, so diagram and PDF rendering are identical across platforms.
2. **Warm start**: Comparable (both cache their window).
3. **Memory baseline**: v2 will be **higher by 80–150 MB** idle due to Chromium's process model. Acceptable tradeoff for shedding the Rust sidecar.

Measure on a quiet machine:

```bash
# After a signed build is produced
hyperfine --warmup 1 --runs 5 "open -a 'Lumina Note.app'"
```

Record the p50 / p95 here when v2.0.0 ships.

## Known behavior differences

- **macOS traffic light positioning**: v1 used `objc2` + custom Cocoa glue for centered zoom buttons. v2 uses Electron's built-in `trafficLightPosition`. Visual diff is slight; not blocking.
- **Auto-updater format**: v1 shipped a `latest.json` signed with Tauri's signing key. v2 uses electron-updater's `latest.yml` / `latest-mac.yml`. The update resumable-telemetry shape the renderer expects is preserved by `electron/main/handlers/updater.ts`.
- **Plugins directory layout**: v1 bundled plugins under `src-tauri/resources/plugins`; v2 puts them at `resources/plugins` and electron-builder maps them to `<app>/Resources/plugins` via `extraResources`.

## Wins

- Deleted **38,627 lines** of Rust (single commit `8c59da2`) + freed two local toolchains from the dev setup (`rustup`, `cargo`).
- Agent runtime and all 5 Phase-7 IPC subsystems (WebDAV / Proxy / Updater / Diagnostics / Plugins) are now Node, not Rust — they land in the main Node event loop and share the MCP subprocess pool without FFI.
- Renderer tests run against mocked `invoke` directly (no longer tied to a Tauri runtime), which unblocks headless CI matrices.

## Regressions to watch

- Installer size bump: 8 MB → ~100 MB. Mitigate later by enabling electron-builder's `compression: maximum` + stripping unused locale packs if needed.
- Memory baseline rise. Acceptable given the feature surface now runs in one process group, but worth re-measuring on 8 GB machines.
