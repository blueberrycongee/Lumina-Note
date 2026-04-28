/**
 * License storage in the OS keychain (Electron `safeStorage`) with a Linux
 * file fallback. Implemented in task C3.
 *
 * The functions are async because the IPC bridge to the Electron main process
 * is async; the in-memory derived state lives in `useLicenseStore` (task C4).
 */

export async function saveLicense(_license: string): Promise<void> {
  throw new Error('luminaCloud.saveLicense: not implemented yet (task C3)');
}

export async function loadLicense(): Promise<string | null> {
  throw new Error('luminaCloud.loadLicense: not implemented yet (task C3)');
}

export async function removeLicense(): Promise<void> {
  throw new Error('luminaCloud.removeLicense: not implemented yet (task C3)');
}
