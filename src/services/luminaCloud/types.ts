/**
 * Wire types mirroring `cloud/CONTRACT.md`. Keep this file in lock-step with
 * the contract — when the contract changes, update here and bump tests.
 */

// §1.1 License payload (canonical JSON, sorted keys, embedded in the license token)
export interface LicensePayload {
  /** Schema version — currently 1. */
  v: number;
  /** License id, ULID-shaped. */
  lid: string;
  /** Buyer email, lowercased. */
  email: string;
  /** SKU identifier — see CONTRACT.md §3. */
  sku: string;
  /** Feature flags — see CONTRACT.md §4. Unknown flags must be ignored by the client. */
  features: string[];
  /** ISO 8601 UTC, `Z` suffix. */
  issued_at: string;
  /** ISO 8601 UTC `Z`, or null for lifetime licenses. */
  expires_at: string | null;
  /** Upstream order id from Creem. */
  order_id: string;
  /** Soft, advisory device cap — clients may ignore. */
  device_limit: number;
}

// §2.1 Online verification response
export type LicenseVerifyResponse =
  | {
      valid: true;
      payload: LicensePayload;
      revoked: boolean;
      usage: UsageResponse;
    }
  | {
      valid: false;
      reason: 'signature_invalid' | 'revoked' | 'expired' | 'malformed';
    };

// §2.3 Models list
export interface CloudModel {
  id: string;
  upstream: string;
  context: number;
}

export interface ModelsResponse {
  data: CloudModel[];
}

// §2.4 Usage response
export interface UsageResponse {
  period_start: string;
  period_end: string;
  tokens_used: number;
  tokens_quota: number;
  requests_count: number;
}

// §2.5 Revocations
export interface RevocationsResponse {
  as_of: string;
  revoked_lids: string[];
}

// §6 Error format
export type CloudErrorCode =
  | 'bad_request'
  | 'invalid_license'
  | 'revoked_license'
  | 'expired_license'
  | 'quota_exceeded'
  | 'feature_disabled'
  | 'not_found'
  | 'rate_limit'
  | 'internal'
  | 'upstream_unavailable';

export interface CloudErrorBody {
  error: {
    code: CloudErrorCode;
    message: string;
  };
}

// Client-side derived state — used by the Zustand store (C4)
export type LicenseStatus = 'idle' | 'loading' | 'valid' | 'invalid';
