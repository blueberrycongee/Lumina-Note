# lumina-cloud ↔ Lumina-Note — Wire Contract

**Status:** Draft v0.1 · 2026-04-28
**This file MUST be byte-identical in both repos.** When you change one, change the other in the same commit.

---

## 0. Conventions

- All endpoints are HTTPS; production base URL is `https://api.lumina-note.com`. Dev: `https://lumina-cloud-dev.<account>.workers.dev`.
- All request and response bodies are JSON unless noted.
- All timestamps are ISO 8601 UTC with `Z` suffix.
- All money is in USD cents (integer).
- All token counts are upstream-reported (OpenRouter `usage` block).
- All errors follow §6.

---

## 1. License format

A **license** is a compact, URL-safe string that the client can verify offline using the bundled public key.

```
license = base64url(payload_json) + "." + base64url(signature)
```

### 1.1 Payload (canonical JSON, sorted keys)

```jsonc
{
  "v": 1,                              // schema version
  "lid": "lic_01HX...",                // license id, ULID
  "email": "user@example.com",         // buyer email, lowercased
  "sku": "lumina-lifetime-founders",   // see §3
  "features": ["cloud_ai", "sync"],    // see §4
  "issued_at": "2026-04-28T12:00:00Z",
  "expires_at": null,                  // null = no expiry (lifetime)
  "order_id": "creem_ord_123",         // upstream order id from Creem
  "device_limit": 5                    // soft, advisory; client may ignore
}
```

### 1.2 Signature

- Algorithm: **Ed25519** over the **canonical JSON of the payload** (RFC 8785 / JCS, or simplest: `JSON.stringify` with sorted keys, no whitespace).
- Public key: bundled in `Lumina-Note/src/services/luminaCloud/PUBLIC_KEY.ts` as a base64-encoded 32-byte raw Ed25519 public key.
- Private key: lives only as a Cloudflare Worker secret named `LICENSE_SIGNING_KEY` (base64-encoded 32-byte seed). Never in any repo.

### 1.3 Verification (client side)

```ts
function verifyLicense(license: string): null | LicensePayload {
  const [payloadB64, sigB64] = license.split(".");
  if (!payloadB64 || !sigB64) return null;
  const payloadBytes = base64urlDecode(payloadB64);
  const sigBytes = base64urlDecode(sigB64);
  const ok = ed25519.verify(sigBytes, payloadBytes, PUBLIC_KEY);
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(payloadBytes));
}
```

A license is **valid** iff: signature verifies, `expires_at` is null or in the future, and `lid` is not in the locally-cached revocation list (refreshed daily).

---

## 2. Endpoints

All authenticated endpoints expect `Authorization: Bearer <license>` unless noted.

### 2.1 `POST /v1/license/verify`

**Auth:** none (the license itself is the input).

Request:
```json
{ "license": "<license string>" }
```

Response 200:
```json
{
  "valid": true,
  "payload": { /* §1.1 */ },
  "revoked": false,
  "usage": { /* §2.5 inline */ }
}
```

Response 200 (invalid):
```json
{ "valid": false, "reason": "signature_invalid" | "revoked" | "expired" | "malformed" }
```

### 2.2 `POST /v1/ai/chat/completions`

**Auth:** `Authorization: Bearer <license>`

OpenAI-compatible chat completions. Request body is forwarded to OpenRouter unchanged except:

- `model` is rewritten if it has a `lumina:` prefix (e.g. `lumina:claude-opus-4-7` → `anthropic/claude-opus-4-7`)
- `stream: true` is supported (SSE pass-through)

Response: identical to OpenAI Chat Completions API.

Headers added by the gateway on response:
- `X-Lumina-Tokens-Used: <int>` — input + output tokens for this request
- `X-Lumina-Quota-Remaining: <int>` — remaining tokens this billing period

### 2.3 `GET /v1/ai/models`

**Auth:** `Authorization: Bearer <license>`

Returns the list of models accessible to this license.

Response 200:
```json
{
  "data": [
    { "id": "lumina:claude-opus-4-7", "upstream": "anthropic/claude-opus-4-7", "context": 1000000 },
    { "id": "lumina:gpt-5",           "upstream": "openai/gpt-5",              "context": 400000  }
  ]
}
```

### 2.4 `GET /v1/account/usage`

**Auth:** `Authorization: Bearer <license>`

Response 200:
```json
{
  "period_start": "2026-04-01T00:00:00Z",
  "period_end":   "2026-04-30T23:59:59Z",
  "tokens_used":  123456,
  "tokens_quota": 5000000,
  "requests_count": 489
}
```

### 2.5 `GET /v1/license/revocations?since=<iso>`

**Auth:** none (public; license ids are non-secret).

Response 200:
```json
{ "as_of": "2026-04-28T12:00:00Z", "revoked_lids": ["lic_01HX...", "lic_01HY..."] }
```

Client polls daily, caches result.

### 2.6 `POST /v1/webhook/creem`

**Auth:** Creem signature header (HMAC, scheme TBD per Creem docs).

Body: Creem's order event payload. Side effects:

- On `order.paid`: create row in `licenses`, generate license string, send email via Resend.
- On `order.refunded`: insert `lid` into `revocations`.

Response: `200 { "ok": true }` always (idempotent on `order_id`).

---

## 3. SKUs

| SKU                              | Price   | Type         | Features                              | Quota                  |
|----------------------------------|---------|--------------|---------------------------------------|------------------------|
| `lumina-lifetime-founders`       | $99     | one-time     | `cloud_ai`, `sync`, `lifetime`        | 500k tokens / month    |
| `lumina-cloud-ai-monthly`        | $10/mo  | subscription | `cloud_ai`                            | 5M tokens / month      |
| `lumina-cloud-ai-annual`         | $100/yr | subscription | `cloud_ai`                            | 5M tokens / month      |
| `lumina-sync-monthly` (P2)       | $4/mo   | subscription | `sync`                                | 100GB vault            |

The `features` array on the license is the source of truth for what the client unlocks. Quota is enforced server-side per `lid` per calendar UTC month.

---

## 4. Feature flags

| Flag        | Unlocks in client                                           |
|-------------|-------------------------------------------------------------|
| `cloud_ai`  | "Lumina Cloud" provider visible in AI settings              |
| `sync`      | "Sync to Lumina" toggle visible in cloud sync settings (P2) |
| `lifetime`  | Cosmetic badge in settings; no functional effect            |

If the client sees a feature it doesn't recognize, it ignores it. Forward-compatible.

---

## 5. Rate limits

Per-license:
- 60 AI requests / minute (sliding window, KV-backed)
- 10 license verify requests / minute
- 10,000 tokens / single request input (block oversize)

Returns `429 rate_limit` with `Retry-After` header.

---

## 6. Error format

All errors:

```json
{ "error": { "code": "<machine_readable>", "message": "<human_readable>" } }
```

Standard codes:

| HTTP | code                    | meaning                                          |
|------|-------------------------|--------------------------------------------------|
| 400  | `bad_request`           | malformed request                                |
| 401  | `invalid_license`       | license missing, malformed, or signature bad     |
| 401  | `revoked_license`       | license is in revocation list                    |
| 401  | `expired_license`       | `expires_at` in the past                         |
| 402  | `quota_exceeded`        | over monthly token quota                         |
| 403  | `feature_disabled`      | license valid but lacks the required feature    |
| 404  | `not_found`             | unknown resource                                 |
| 429  | `rate_limit`            | too many requests                                |
| 500  | `internal`              | bug; retry with exponential backoff              |
| 502  | `upstream_unavailable`  | OpenRouter or other upstream failed              |

---

## 7. Public key distribution

The Ed25519 **public key** lives at:

- `Lumina-Note/src/services/luminaCloud/PUBLIC_KEY.ts` (hardcoded, shipped in client builds)
- `https://api.lumina-note.com/.well-known/lumina-pubkey` (mirror for tooling, not used by client at runtime)

Rotation: not supported in v1. If we ever need to rotate, ship a client update with the new key first, then start signing with the new key after a transition window.

---

## 8. Versioning

- `v` field in license payload is currently `1`.
- API path prefix `/v1/`.
- Breaking changes bump both. Non-breaking additive changes do not.
- Client must tolerate unknown fields in any response.
