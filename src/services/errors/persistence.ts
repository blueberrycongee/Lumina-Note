/**
 * On-disk persistence sink for error envelopes.
 *
 * Subscribes to reportError() and appends each envelope as one ndjson
 * line in `<vault>/.lumina/logs/errors.ndjson`. Rotates at 10 MB by
 * renaming to `errors.ndjson.1` (single-generation rotation — older
 * generations get overwritten on each rotation, which is fine; the
 * goal is "the last few hundred errors", not full audit trail).
 *
 * Resilient by design: a write failure here must NEVER tear down the
 * reporter chain. Any throw is swallowed and logged once to console.
 * Without this, a transient FS error would mask every subsequent
 * envelope.
 *
 * Cause objects are stringified defensively. Errors with circular
 * references fall back to {message, name, stack}.
 */

import {
  exists as fsExists,
  fsStat,
  createDir,
  readFile,
  rename,
  writeTextFile,
} from "@/lib/host";
import { useFileStore } from "@/stores/useFileStore";

import { subscribeErrors } from "./reporter";
import type { ErrorEnvelope } from "./types";

const ROTATE_AT_BYTES = 10 * 1024 * 1024; // 10 MiB

let wired = false;
let writeChain: Promise<void> = Promise.resolve();
let lastWriteWarned = false;

export function wireErrorPersistence(): void {
  if (wired) return;
  wired = true;
  subscribeErrors((env) => {
    // Serialize writes via a chained promise so concurrent reportError
    // calls don't race on read-modify-write of the log file.
    writeChain = writeChain.then(() => persistEnvelope(env)).catch((err) => {
      if (!lastWriteWarned) {
        lastWriteWarned = true;
        // eslint-disable-next-line no-console
        console.warn("[lumina:error] persistence sink failed (suppressing further warnings)", err);
      }
    });
  });
}

async function persistEnvelope(env: ErrorEnvelope): Promise<void> {
  const vaultPath = useFileStore.getState().vaultPath;
  if (!vaultPath) return; // welcome screen — no vault, nothing to write

  const dir = `${vaultPath}/.lumina/logs`;
  const file = `${dir}/errors.ndjson`;

  if (!(await fsExists(dir))) {
    await createDir(dir, { recursive: true });
  }

  const line = serialize(env) + "\n";

  let prev = "";
  if (await fsExists(file)) {
    const stat = await fsStat(file);
    if (stat.size + line.length > ROTATE_AT_BYTES) {
      const rotated = `${file}.1`;
      // Overwrite any prior rotation; rename in tauri/our host throws
      // if dest exists, so prepare a clean slot.
      if (await fsExists(rotated)) {
        // best-effort: write empty then rename will succeed when impl
        // permits, otherwise just write through.
        await writeTextFile(rotated, "");
      }
      try {
        await rename(file, rotated);
      } catch {
        // Some hosts can't overwrite via rename; fall back to copy via
        // read+write of just the most recent contents.
        const tail = await readFile(file).catch(() => "");
        await writeTextFile(rotated, tail);
      }
      prev = "";
    } else {
      prev = await readFile(file).catch(() => "");
    }
  }

  await writeTextFile(file, prev + line);
}

function serialize(env: ErrorEnvelope): string {
  try {
    return JSON.stringify({
      ...env,
      cause: causeToJson(env.cause),
    });
  } catch {
    // Defensive fallback — circular ref or non-serializable cause.
    return JSON.stringify({
      id: env.id,
      kind: env.kind,
      severity: env.severity,
      message: env.message,
      timestamp: env.timestamp,
      sessionId: env.sessionId,
      traceId: env.traceId,
      retryable: env.retryable,
      cause: "[unserializable]",
    });
  }
}

function causeToJson(cause: unknown): unknown {
  if (cause === undefined || cause === null) return null;
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  if (typeof cause === "object") {
    // Strip prototype chain to avoid weird tojson; keep own enumerable.
    return JSON.parse(JSON.stringify(cause));
  }
  return cause;
}
