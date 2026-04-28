import type { LicensePayload } from './types';

/**
 * Offline license verification per CONTRACT.md §1.3.
 *
 * Returns the decoded payload iff the Ed25519 signature verifies against the
 * bundled public key, otherwise returns `null`. Never throws — malformed
 * input yields `null` too.
 *
 * Implemented in task C2 with `@noble/ed25519`.
 */
export function verifyLicense(_license: string): LicensePayload | null {
  throw new Error('luminaCloud.verifyLicense: not implemented yet (task C2)');
}
