/**
 * Lumina Cloud client — public barrel.
 *
 * Wire types and behaviors are pinned to `cloud/CONTRACT.md`. See
 * `cloud/TASKS.md` for the per-file rollout (C1…C13).
 */

export type {
  CloudErrorBody,
  CloudErrorCode,
  CloudModel,
  LicensePayload,
  LicenseStatus,
  LicenseVerifyResponse,
  ModelsResponse,
  RevocationsResponse,
  UsageResponse,
} from './types';

export { PUBLIC_KEY_B64 } from './PUBLIC_KEY';

export { verifyLicense } from './verify';

export { loadLicense, removeLicense, saveLicense } from './store';

export {
  createRevocationCache,
  DEFAULT_TTL_MS as REVOCATIONS_DEFAULT_TTL_MS,
  isRevoked,
  refreshRevocations,
} from './revocations';

export type {
  RevocationCache,
  RevocationCacheData,
  RevocationCacheOptions,
  RevocationStorage,
} from './revocations';

export {
  DEFAULT_BASE_URL,
  getBaseUrl,
  getModels,
  getRevocations,
  getUsage,
  LuminaCloudError,
  verifyLicenseOnline,
} from './client';

export type { LuminaCloudErrorCode } from './client';
