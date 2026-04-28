import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

import { PUBLIC_KEY_B64 } from './PUBLIC_KEY';
import type { LicensePayload } from './types';

// Wire SHA-512 once at module load so synchronous Ed25519 verify works in any
// environment (Node, Electron renderer, jsdom). `@noble/ed25519` v3 leaves
// this slot empty by design.
ed.hashes.sha512 = sha512;

/**
 * Offline license verification per CONTRACT.md §1.3.
 *
 * Returns the decoded payload iff the Ed25519 signature verifies against the
 * public key. Returns `null` for any invalid input — never throws. The
 * caller is still responsible for downstream checks (`expires_at`, revocation
 * list — CONTRACT.md §1.3 second paragraph).
 *
 * The optional second argument exists for tests and multi-key scenarios;
 * production callers should use the bundled `PUBLIC_KEY_B64` default.
 */
export function verifyLicense(
  license: string,
  publicKeyB64: string = PUBLIC_KEY_B64
): LicensePayload | null {
  if (typeof license !== 'string' || license.length === 0) return null;

  const dot = license.indexOf('.');
  if (dot <= 0 || dot === license.length - 1) return null;
  const payloadB64 = license.slice(0, dot);
  const sigB64 = license.slice(dot + 1);
  if (sigB64.includes('.')) return null;

  const payloadBytes = base64urlDecode(payloadB64);
  const sigBytes = base64urlDecode(sigB64);
  const pubBytes = base64Decode(publicKeyB64);
  if (!payloadBytes || !sigBytes || !pubBytes) return null;
  if (sigBytes.length !== 64 || pubBytes.length !== 32) return null;

  let ok = false;
  try {
    ok = ed.verify(sigBytes, payloadBytes, pubBytes);
  } catch {
    return null;
  }
  if (!ok) return null;

  return decodePayload(payloadBytes);
}

function decodePayload(bytes: Uint8Array): LicensePayload | null {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as LicensePayload;
}

function base64urlDecode(s: string): Uint8Array | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return base64Decode(b64);
}

function base64Decode(s: string): Uint8Array | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
