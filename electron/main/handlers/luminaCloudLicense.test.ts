import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createLuminaCloudLicenseHandlers,
  type SafeStorageLike,
} from './luminaCloudLicense';

let tempDir: string;
let filePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-cloud-license-'));
  filePath = path.join(tempDir, 'lumina-cloud-license.bin');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function realisticEncryptingSafeStorage(): SafeStorageLike {
  // XOR with a fixed key. Not real encryption — just a way to prove the
  // ciphertext on disk isn't the plaintext, while staying deterministic for
  // the test.
  const KEY = Buffer.from('test-key-test-key', 'utf-8');
  function xor(input: Buffer): Buffer {
    const out = Buffer.alloc(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = input[i] ^ KEY[i % KEY.length];
    }
    return out;
  }
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext) => xor(Buffer.from(plaintext, 'utf-8')),
    decryptString: (ciphertext) => xor(ciphertext).toString('utf-8'),
  };
}

function unavailableSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('encryptString called when encryption unavailable');
    },
    decryptString: () => {
      throw new Error('decryptString called when encryption unavailable');
    },
  };
}

describe('luminaCloudLicense handlers — encrypted path', () => {
  it('save → load round-trips the same string', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });

    await handlers.lumina_cloud_save_license({ license: 'fixture-license-token' });
    const loaded = await handlers.lumina_cloud_load_license({});

    expect(loaded).toBe('fixture-license-token');
  });

  it('writes ciphertext to disk, not plaintext', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });

    await handlers.lumina_cloud_save_license({ license: 'fixture-license-token' });
    const onDisk = fs.readFileSync(filePath);

    expect(onDisk.toString('utf-8')).not.toContain('fixture-license-token');
    // Encrypted prefix `LCE1\n` is 5 bytes.
    expect(onDisk.subarray(0, 5).toString('utf-8')).toBe('LCE1\n');
  });

  it('writes the file with mode 0600 on POSIX', async () => {
    if (process.platform === 'win32') return;
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });
    await handlers.lumina_cloud_save_license({ license: 'fixture-license-token' });
    const mode = fs.statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('remove → load returns null', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });

    await handlers.lumina_cloud_save_license({ license: 'fixture-license-token' });
    await handlers.lumina_cloud_remove_license({});

    expect(await handlers.lumina_cloud_load_license({})).toBeNull();
  });

  it('load returns null when the file does not exist (cold start)', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });

    expect(await handlers.lumina_cloud_load_license({})).toBeNull();
  });

  it('load returns null when stored ciphertext fails to decrypt', async () => {
    // Write blob with the encrypted prefix but garbage payload.
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from('LCE1\n'), Buffer.from('garbage')]));
    const safeStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => {
        throw new Error('keychain locked');
      },
    };
    const log: string[] = [];
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage,
      log: (line) => log.push(line),
    });

    expect(await handlers.lumina_cloud_load_license({})).toBeNull();
    expect(log.join('\n')).toContain('decryptString failed');
  });
});

describe('luminaCloudLicense handlers — plaintext fallback (Linux without keychain)', () => {
  it('save persists plaintext (with prefix) and round-trips', async () => {
    const log: string[] = [];
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: unavailableSafeStorage(),
      log: (line) => log.push(line),
    });

    await handlers.lumina_cloud_save_license({ license: 'fallback-license-token' });
    const onDisk = fs.readFileSync(filePath);
    expect(onDisk.subarray(0, 5).toString('utf-8')).toBe('LCP1\n');
    expect(onDisk.toString('utf-8')).toContain('fallback-license-token');
    expect(log.some((l) => l.includes('plaintext 0600 fallback'))).toBe(true);

    expect(await handlers.lumina_cloud_load_license({})).toBe('fallback-license-token');
  });

  it('returns null for ciphertext blob when safeStorage becomes unavailable', async () => {
    // Write something the encrypted prefix says is ciphertext.
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from('LCE1\n'), Buffer.from('whatever')]));

    const log: string[] = [];
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: unavailableSafeStorage(),
      log: (line) => log.push(line),
    });

    expect(await handlers.lumina_cloud_load_license({})).toBeNull();
    expect(log.some((l) => l.includes('safeStorage unavailable'))).toBe(true);
  });
});

describe('luminaCloudLicense handlers — defensive', () => {
  it('save_license rejects missing string `license` arg', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });
    await expect(handlers.lumina_cloud_save_license({})).rejects.toThrow(/missing string `license`/);
    await expect(handlers.lumina_cloud_save_license({ license: 42 })).rejects.toThrow(
      /missing string `license`/
    );
  });

  it('treats an unknown blob prefix as missing rather than throwing', async () => {
    fs.writeFileSync(filePath, Buffer.from('FUTURE_PREFIX\nopaque-payload'));
    const log: string[] = [];
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
      log: (line) => log.push(line),
    });
    expect(await handlers.lumina_cloud_load_license({})).toBeNull();
    expect(log.some((l) => l.includes('unknown blob prefix'))).toBe(true);
  });

  it('remove_license is a no-op when no file exists', async () => {
    const handlers = createLuminaCloudLicenseHandlers({
      filePath,
      safeStorage: realisticEncryptingSafeStorage(),
    });
    await expect(handlers.lumina_cloud_remove_license({})).resolves.toBeNull();
  });
});
