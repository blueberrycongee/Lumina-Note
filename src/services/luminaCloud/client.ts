import type {
  LicenseVerifyResponse,
  ModelsResponse,
  RevocationsResponse,
  UsageResponse,
} from './types';

/**
 * Typed HTTP client for the Lumina Cloud REST surface (CONTRACT.md §2).
 * Implemented in task C5 — this scaffold only fixes the public shape.
 *
 * Base URL is configurable via `LUMINA_CLOUD_BASE_URL`, default
 * `https://api.lumina-note.com`.
 */

export const DEFAULT_BASE_URL = 'https://api.lumina-note.com';

export async function verifyLicenseOnline(_license: string): Promise<LicenseVerifyResponse> {
  throw new Error('luminaCloud.client.verifyLicenseOnline: not implemented yet (task C5)');
}

export async function getModels(_license: string): Promise<ModelsResponse> {
  throw new Error('luminaCloud.client.getModels: not implemented yet (task C5)');
}

export async function getUsage(_license: string): Promise<UsageResponse> {
  throw new Error('luminaCloud.client.getUsage: not implemented yet (task C5)');
}

export async function getRevocations(_since?: string): Promise<RevocationsResponse> {
  throw new Error('luminaCloud.client.getRevocations: not implemented yet (task C5)');
}
