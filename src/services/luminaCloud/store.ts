import { invoke } from '@/lib/hostBridge';

/**
 * Renderer-side bridge to the main-process license storage.
 *
 * Persistence (Electron `safeStorage` on macOS / Windows, 0600 fallback file
 * on Linux without an unlocked keychain) lives in
 * `electron/main/handlers/luminaCloudLicense.ts`. This module just forwards
 * calls over IPC. The in-memory derived state lives in `useLicenseStore`
 * (task C4).
 */

export async function saveLicense(license: string): Promise<void> {
  await invoke('lumina_cloud_save_license', { license });
}

export async function loadLicense(): Promise<string | null> {
  const result = await invoke<string | null>('lumina_cloud_load_license');
  return typeof result === 'string' ? result : null;
}

export async function removeLicense(): Promise<void> {
  await invoke('lumina_cloud_remove_license');
}
