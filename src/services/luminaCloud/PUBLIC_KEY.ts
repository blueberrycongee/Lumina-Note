/**
 * Ed25519 public key for verifying Lumina Cloud licenses (CONTRACT.md §1.2, §7).
 *
 * Format: base64-encoded 32-byte raw Ed25519 public key.
 *
 * LEAD: replace with real public key from lumina-cloud T3 output.
 *
 * Until the real key is delivered, tests use a fixture keypair (see C2 task).
 * The placeholder below is deliberately a recognizably-fake all-`A` string so
 * any accidental ship-to-prod fails verification immediately.
 */
export const PUBLIC_KEY_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
