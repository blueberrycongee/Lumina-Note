# Agent runtime setup

Lumina's agent is powered by [opencode](https://github.com/anomalyco/opencode),
an open-source coding-agent server embedded into the Electron main process
as an in-process HTTP/WS endpoint. This document is everything a new
contributor or CI machine needs to run `npm run dev` successfully.

## Why this setup is load-bearing

`thirdparty/opencode` is **gitignored** — the full opencode source tree
(~147 MB) plus its `node_modules` (~1.6 GB) never land in Lumina's repo.
The Electron main bundle imports a `virtual:opencode-server` module that
electron-vite resolves to
`thirdparty/opencode/packages/opencode/dist/node/node.js` — a 18 MB single
file produced by opencode's `bun build-node.ts` toolchain.

No bundle → `npm run dev` fails at the main-process build step with a
`virtual:opencode-server` resolver error.

## One-time setup per machine

1. **Install bun** (required — opencode's build uses `Bun.build`):

   ```bash
   curl -fsSL https://bun.sh/install | bash
   # macOS alternative:
   # brew install oven-sh/bun/bun
   ```

2. **Clone opencode into `thirdparty/`**:

   ```bash
   git clone https://github.com/anomalyco/opencode thirdparty/opencode
   ```

3. **Install opencode's workspace deps** (runs a postinstall native-pty
   rebuild — ~1.6 GB on disk):

   ```bash
   cd thirdparty/opencode && bun install
   ```

4. **Build the Node bundle** (rerun whenever you bump opencode):

   ```bash
   cd ~/Lumina-Note   # back to repo root
   npm run opencode:bundle
   ```

   Produces `thirdparty/opencode/packages/opencode/dist/node/node.js` plus
   three `tree-sitter-*.wasm` siblings.

After step 4, `npm run dev` boots normally.

## Smoke-testing the bundle

```bash
npm run opencode:smoke
```

Boots the server with a random port + basic auth and hits `/global/health`.
Exits 0 on success. Useful for CI.

## Behind the scenes

### Build
- `scripts/bundle_opencode.mjs` shells out to
  `bun thirdparty/opencode/packages/opencode/script/build-node.ts` with
  `OPENCODE_CHANNEL=dev`.
- `electron.vite.config.ts` has two plugins:
  - `lumina:virtual-opencode-server` — resolves the virtual id to the
    built bundle; emits a setup guide as the error message if the bundle
    is missing.
  - `lumina:copy-opencode-assets` — after Vite writes `out/main`, copies
    the `.wasm` siblings into `out/main/chunks/`.

### Runtime (Electron main)
- `electron/main/agent-v2/server.ts` imports
  `{ Log, Server } from "virtual:opencode-server"`, sets
  `OPENCODE_SERVER_USERNAME`/`OPENCODE_SERVER_PASSWORD` env vars, then
  `Server.listen({ port: 0, hostname: "127.0.0.1", cors: [...] })`. Binds
  an ephemeral port and polls `/global/health` until ready.
- `window.lumina.opencode.getServerInfo()` returns
  `{ url, username, password }` to the renderer.
- The renderer calls `createOpencodeClient({ baseUrl, headers })` from
  `@opencode-ai/sdk` and subscribes to `/event` SSE for session /
  message / permission updates.

### Native dependency
- opencode's `@lydell/node-pty` is aliased at build time to
  `electron/main/vendor/opencode-node-pty.ts`, which loads the
  platform-specific package from opencode's bun workspace via
  `createRequire` at runtime. Works for `npm run dev`; **packaging
  (`npm run dist`) is not yet wired** — see the open TODO in that file.

## Upgrading opencode

```bash
(cd thirdparty/opencode && git pull && bun install)
npm run opencode:bundle
```

No changes to Lumina's source are usually needed. If opencode changes its
`Server.listen()` signature or `@opencode-ai/sdk` exports, update
`electron/main/agent-v2/virtual-opencode-server.d.ts` and the renderer
store respectively.

## Customization via plugins

The agent can be extended without forking opencode. opencode's plugin
system exposes hooks (`chat.params`, `permission.ask`, `tool`,
`experimental.chat.system.transform`, etc.). Lumina-specific behavior
(vault context injection, custom tools, approval UX) will live under
`electron/main/opencode-plugins/` once the plugin flow is wired — see
the `P5` task in the migration memory.

## Troubleshooting

**`Rollup failed to resolve import "virtual:opencode-server"`** — run
`npm run opencode:bundle`. If that itself fails, step 3 hasn't completed
successfully.

**`ConnectionRefused` or `ConnectionClosed` during `bun install`** —
network / proxy issue, not a code problem. In mainland China you likely
need `HTTPS_PROXY=http://127.0.0.1:<port>` set before `bun install`.

**`bun install` pulls from `cdn.npmmirror.com` and URLs look mangled** —
your repo has a stale `package-lock.json` or a global `~/.npmrc`
pointing at a mirror that bun's newer versions can't parse. Use
`bun install --registry=https://registry.npmjs.org` or clear the lockfile.

**`electron/main/vendor/opencode-node-pty.ts` throws at runtime** —
`thirdparty/opencode/node_modules/.bun/node_modules/@lydell/node-pty-*`
is missing. Either step 3 didn't finish or you're running a packaged
build (not yet supported, see the TODO).
