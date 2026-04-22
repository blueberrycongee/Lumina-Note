// Smoke test: confirm the opencode Node bundle loads in plain Node and a
// Server.listen() instance answers /global/health.
//
// Run with: node scripts/opencode_smoke.mjs
// (requires `npm run opencode:bundle` first)

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundlePath = path.join(
  root,
  "thirdparty",
  "opencode",
  "packages",
  "opencode",
  "dist",
  "node",
  "node.js",
);

if (!fs.existsSync(bundlePath)) {
  console.error(
    `opencode-smoke: bundle missing at ${bundlePath}. Run: npm run opencode:bundle`,
  );
  process.exit(1);
}

const mod = await import(bundlePath);
const { Server, Log } = mod;
if (!Server) {
  console.error("opencode-smoke: Server export missing");
  process.exit(2);
}

await Log.init({ level: "WARN" });

const port = Number(process.env.OPENCODE_SMOKE_PORT || 14096);
const hostname = "127.0.0.1";
const password = randomUUID();

const listener = await Server.listen({
  port,
  hostname,
  username: "opencode",
  password,
  cors: ["oc://renderer"],
});

const healthUrl = `http://${hostname}:${port}/global/health`;
const headers = new Headers({
  authorization:
    "Basic " + Buffer.from(`opencode:${password}`).toString("base64"),
});

let ok = false;
for (let attempt = 0; attempt < 40; attempt++) {
  await new Promise((r) => setTimeout(r, 100));
  try {
    const res = await fetch(healthUrl, {
      headers,
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      ok = true;
      console.log(`opencode-smoke: /global/health OK (${attempt + 1} attempts)`);
      break;
    }
  } catch {
    // retry
  }
}

listener.stop?.();

if (!ok) {
  console.error("opencode-smoke: /global/health never OK");
  process.exit(3);
}

process.exit(0);
