import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';

import { canonicalizeToBytes } from './canonical-json';
import type { LicensePayload } from './types';
import { verifyLicense } from './verify';

ed.hashes.sha512 = sha512;

// Deterministic test seed — keeps fixture licenses reproducible across runs
// without checking in any private key the production system would use.
const TEST_SECRET = new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff);
const TEST_PUBLIC = ed.getPublicKey(TEST_SECRET);
const TEST_PUBLIC_B64 = bytesToBase64(TEST_PUBLIC);

const FIXTURE_PAYLOAD: LicensePayload = {
  v: 1,
  lid: 'lic_01HXTEST',
  email: 'fixture@example.com',
  sku: 'lumina-lifetime-founders',
  features: ['cloud_ai', 'sync'],
  issued_at: '2026-04-28T12:00:00Z',
  expires_at: null,
  order_id: 'creem_ord_test',
  device_limit: 5,
};

function signFixture(payload: LicensePayload, secretKey: Uint8Array = TEST_SECRET): string {
  const payloadBytes = canonicalizeToBytes(payload);
  const sig = ed.sign(payloadBytes, secretKey);
  return bytesToBase64Url(payloadBytes) + '.' + bytesToBase64Url(sig);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('verifyLicense', () => {
  it('returns the payload for a valid fixture license', () => {
    const license = signFixture(FIXTURE_PAYLOAD);
    const result = verifyLicense(license, TEST_PUBLIC_B64);
    expect(result).toEqual(FIXTURE_PAYLOAD);
  });

  it('returns null when a payload byte is tampered', () => {
    const license = signFixture(FIXTURE_PAYLOAD);
    const [payloadB64, sigB64] = license.split('.');
    // Flip one char in the payload — any base64url char will decode to
    // different bytes (unless equal to the original, which is exceedingly unlikely
    // for a deterministic seed).
    const tamperedPayload = payloadB64.slice(0, 5) + (payloadB64[5] === 'A' ? 'B' : 'A') + payloadB64.slice(6);
    const tampered = tamperedPayload + '.' + sigB64;
    expect(verifyLicense(tampered, TEST_PUBLIC_B64)).toBeNull();
  });

  it('returns null when a signature byte is tampered', () => {
    const license = signFixture(FIXTURE_PAYLOAD);
    const [payloadB64, sigB64] = license.split('.');
    const tamperedSig = sigB64.slice(0, 5) + (sigB64[5] === 'A' ? 'B' : 'A') + sigB64.slice(6);
    const tampered = payloadB64 + '.' + tamperedSig;
    expect(verifyLicense(tampered, TEST_PUBLIC_B64)).toBeNull();
  });

  it('returns null when verified against the wrong public key', () => {
    const license = signFixture(FIXTURE_PAYLOAD);
    const wrongSecret = new Uint8Array(32).fill(0x42);
    const wrongPublic = bytesToBase64(ed.getPublicKey(wrongSecret));
    expect(verifyLicense(license, wrongPublic)).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['missing signature', 'AAAA'],
    ['too many parts', 'a.b.c'],
    ['empty payload part', '.AAAA'],
    ['empty signature part', 'AAAA.'],
    ['non-base64 payload', '!!!.AAAA'],
    ['non-base64 signature', 'AAAA.!!!'],
    ['signature wrong length', 'AAAA.BBBB'],
  ])('returns null for malformed input: %s', (_label, license) => {
    expect(verifyLicense(license, TEST_PUBLIC_B64)).toBeNull();
  });

  it('does not throw on malformed input — returns null instead', () => {
    expect(() => verifyLicense('garbage', TEST_PUBLIC_B64)).not.toThrow();
    // Non-string input shouldn't throw either, even with the type guard.
    // Cast through `unknown` so the type-checker lets us pass garbage.
    expect(() => verifyLicense(null as unknown as string, TEST_PUBLIC_B64)).not.toThrow();
    expect(() => verifyLicense(undefined as unknown as string, TEST_PUBLIC_B64)).not.toThrow();
  });

  it('uses the bundled PUBLIC_KEY_B64 when no second argument is provided', () => {
    // The bundled placeholder pubkey is all-zero; signing with our test key
    // will not verify against it. So the bundled-key path must return null,
    // proving the default is wired up.
    const license = signFixture(FIXTURE_PAYLOAD);
    expect(verifyLicense(license)).toBeNull();
  });
});
