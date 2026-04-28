/**
 * Lumina Cloud license storage. macOS / Windows encrypt via Electron
 * `safeStorage`; Linux without an unlocked keychain falls back to a
 * `0600`-mode file under `userData/lumina-cloud-license.bin`.
 *
 * The handler module is testable in isolation: `createLuminaCloudLicenseHandlers`
 * takes `{ filePath, safeStorage, log }` so the round-trip test can drive it
 * with a stub safeStorage and a temp file path.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface LuminaCloudLicenseHandlersOptions {
  /** Absolute path to the on-disk license blob. */
  filePath: string;
  /** Electron `safeStorage` (or a test stub matching the same surface). */
  safeStorage: SafeStorageLike;
  /** Optional logger; defaults to console. */
  log?: (line: string) => void;
}

/** Subset of Electron's `safeStorage` we depend on. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export type LuminaCloudLicenseHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>;

// Magic prefix on the on-disk blob indicates whether the bytes are an encrypted
// safeStorage ciphertext or a plaintext fallback. Lets the loader recover from
// a switch in encryption availability across runs (e.g. user logs into their
// keychain after first using the Linux fallback).
const ENCRYPTED_PREFIX = Buffer.from('LCE1\n');
const PLAINTEXT_PREFIX = Buffer.from('LCP1\n');

export function createLuminaCloudLicenseHandlers(
  options: LuminaCloudLicenseHandlersOptions
): LuminaCloudLicenseHandlerMap {
  const { filePath, safeStorage } = options;
  const log = options.log ?? ((line: string) => console.log(line));

  function ensureDir(): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  return {
    async lumina_cloud_save_license(args) {
      const license = typeof args.license === 'string' ? args.license : null;
      if (!license) {
        throw new Error('lumina_cloud_save_license: missing string `license` arg');
      }
      ensureDir();

      let body: Buffer;
      if (safeStorage.isEncryptionAvailable()) {
        const ciphertext = safeStorage.encryptString(license);
        body = Buffer.concat([ENCRYPTED_PREFIX, ciphertext]);
      } else {
        log('[lumina-cloud] safeStorage unavailable; writing plaintext 0600 fallback');
        body = Buffer.concat([PLAINTEXT_PREFIX, Buffer.from(license, 'utf-8')]);
      }
      fs.writeFileSync(filePath, body, { mode: 0o600 });
      // writeFileSync's `mode` only applies on file creation; chmod after to
      // tighten permissions if the file already existed (e.g. previous run).
      try {
        fs.chmodSync(filePath, 0o600);
      } catch (err) {
        // chmod can fail on Windows where modes are advisory; ignore.
        log(`[lumina-cloud] chmod 0600 failed (likely non-POSIX): ${String(err)}`);
      }
      return null;
    },

    async lumina_cloud_load_license() {
      let body: Buffer;
      try {
        body = fs.readFileSync(filePath);
      } catch (err) {
        if (isNoEnt(err)) return null;
        throw err;
      }

      if (startsWith(body, ENCRYPTED_PREFIX)) {
        if (!safeStorage.isEncryptionAvailable()) {
          log('[lumina-cloud] stored ciphertext but safeStorage unavailable; returning null');
          return null;
        }
        const ciphertext = body.subarray(ENCRYPTED_PREFIX.length);
        try {
          return safeStorage.decryptString(ciphertext);
        } catch (err) {
          log(`[lumina-cloud] safeStorage.decryptString failed: ${String(err)}`);
          return null;
        }
      }
      if (startsWith(body, PLAINTEXT_PREFIX)) {
        return body.subarray(PLAINTEXT_PREFIX.length).toString('utf-8');
      }
      // Unknown prefix — corrupt or written by a future version. Treat as
      // missing rather than throwing; the caller will prompt for re-entry.
      log('[lumina-cloud] unknown blob prefix; treating as missing');
      return null;
    },

    async lumina_cloud_remove_license() {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        if (!isNoEnt(err)) throw err;
      }
      return null;
    },
  };
}

function startsWith(haystack: Buffer, needle: Buffer): boolean {
  if (haystack.length < needle.length) return false;
  return haystack.subarray(0, needle.length).equals(needle);
}

function isNoEnt(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
