// Isolate the embedded opencode server from the user's opencode CLI.
//
// Opencode resolves its config / data / cache / state directories from
// xdg-basedir at module load (thirdparty/opencode/packages/opencode/src/
// global/index.ts:10-13), and still uses Global.Path.home for ~/.opencode
// discovery. Without this file it happily picks up ~/.config/opencode,
// ~/.local/share/opencode, ~/.opencode, project .opencode, ~/.claude, etc.
// — i.e. every config file the user left behind from the `opencode` CLI.
// Those configs have bit us repeatedly:
//
//   - `default_agent: "Sisyphus - Ultraworker"` pointed at a missing
//     plugin-backed agent → prompt_async failed.
//   - `oh-my-openagent` plugin imported `bun:*` modules → WARN on every
//     bootstrap.
//   - ~50+ skills under ~/.claude/skills produced a multi-MB log flood.
//
// Lumina shouldn't inherit any of that. We redirect opencode's XDG base and
// test-home override under <userData>/opencode-runtime/ so the embedded
// server has its own clean home. Session history, auth tokens, caches, and
// state all live here — completely isolated from the user's opencode CLI.
//
// IMPORTANT: this module must be imported *before* anything that pulls
// in `virtual:opencode-server`. Opencode's global/index.ts reads XDG env
// vars at module load, so setting them later has no effect. Put this as
// the very first import in electron/main/index.ts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// We can't use electron's app.getPath("userData") here: it throws until
// app is ready, and imports are evaluated before app.whenReady(). Derive
// a platform-appropriate path from os.homedir() directly. This matches
// Electron's defaults closely enough that users won't see a surprising
// location.
function resolveLuminaBase(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "lumina-note");
    case "win32":
      return path.join(process.env.APPDATA ?? home, "lumina-note");
    default:
      return path.join(home, ".config", "lumina-note");
  }
}

const base = path.join(resolveLuminaBase(), "opencode-runtime");
const runtimeHome = path.join(base, "home");

process.env.XDG_CONFIG_HOME = path.join(base, "config");
process.env.XDG_DATA_HOME = path.join(base, "data");
process.env.XDG_CACHE_HOME = path.join(base, "cache");
process.env.XDG_STATE_HOME = path.join(base, "state");
process.env.OPENCODE_TEST_HOME = runtimeHome;
process.env.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
process.env.OPENCODE_DISABLE_CLAUDE_CODE = "1";
process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS = "1";
process.env.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS = "1";

// Opencode's global/index.ts does `fs.mkdir(..., {recursive: true})` on
// the XDG roots at module load. It does not create Global.Path.home, so make
// the private home deterministic before opencode scans it for ~/.opencode.
fs.mkdirSync(runtimeHome, { recursive: true });

// eslint-disable-next-line no-console
console.log(`[opencode-xdg] isolated XDG base: ${base} home: ${runtimeHome}`);
