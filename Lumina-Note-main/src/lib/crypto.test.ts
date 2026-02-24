/**
 * Crypto 工具测试
 */
import { describe, it, expect } from 'vitest';
import { isEncrypted } from './crypto';

// Note: encryptApiKey and decryptApiKey require browser crypto API
// which is available in test environment but behavior may differ

describe('isEncrypted', () => {
  it('should return true for encrypted format', () => {
    expect(isEncrypted('encrypted:abc123')).toBe(true);
  });

  it('should return false for plain text', () => {
    expect(isEncrypted('sk-abc123')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });

  it('should return false for string containing "encrypted" but not prefix', () => {
    expect(isEncrypted('my-encrypted-key')).toBe(false);
  });
});

// Integration tests for encrypt/decrypt cycle
// These tests use the actual crypto API
describe('encryption cycle', () => {
  // Skip if crypto.subtle is not available (some test environments)
  const hasCrypto = typeof crypto !== 'undefined' && crypto.subtle;

  it.skipIf(!hasCrypto)('should encrypt and produce encrypted: prefix', async () => {
    const { encryptApiKey } = await import('./crypto');
    const result = await encryptApiKey('test-api-key');
    expect(result.startsWith('encrypted:')).toBe(true);
  });

  it.skipIf(!hasCrypto)('should return empty string for empty input', async () => {
    const { encryptApiKey } = await import('./crypto');
    const result = await encryptApiKey('');
    expect(result).toBe('');
  });

  it.skipIf(!hasCrypto)('should decrypt back to original', async () => {
    const { encryptApiKey, decryptApiKey } = await import('./crypto');
    const original = 'sk-test-12345';
    const encrypted = await encryptApiKey(original);
    const decrypted = await decryptApiKey(encrypted);
    expect(decrypted).toBe(original);
  });

  it.skipIf(!hasCrypto)('should return plain text if not encrypted format', async () => {
    const { decryptApiKey } = await import('./crypto');
    const plainKey = 'sk-plain-key';
    const result = await decryptApiKey(plainKey);
    expect(result).toBe(plainKey);
  });

  it.skipIf(!hasCrypto)('should return empty for empty decrypt input', async () => {
    const { decryptApiKey } = await import('./crypto');
    const result = await decryptApiKey('');
    expect(result).toBe('');
  });
});
