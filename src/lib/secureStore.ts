import { invoke } from '@tauri-apps/api/core';

const CLOUD_TOKEN_KEY = 'cloud-auth-token';

export async function getSecureToken(): Promise<string | null> {
  return invoke<string | null>('secure_store_get', { key: CLOUD_TOKEN_KEY });
}

export async function setSecureToken(token: string): Promise<void> {
  await invoke('secure_store_set', { key: CLOUD_TOKEN_KEY, value: token });
}

export async function deleteSecureToken(): Promise<void> {
  await invoke('secure_store_delete', { key: CLOUD_TOKEN_KEY });
}
