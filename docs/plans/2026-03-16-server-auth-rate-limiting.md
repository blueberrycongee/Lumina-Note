# Server Auth Rate Limiting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Protect `/auth/register`, `/auth/login`, `/auth/refresh` endpoints from brute-force and credential stuffing attacks via per-IP rate limiting.

**Architecture:** Add a `governor` crate-based in-memory rate limiter as a new `rate_limit` module. Each auth endpoint calls a shared `check_rate_limit()` function keyed by client IP. Rate limit state lives in `AppState` as an `Arc<RateLimiter>`. No external middleware layer—handler-level checks keep it simple, explicit, and testable. 429 responses include a `Retry-After` header.

**Tech Stack:** `governor` (token-bucket algorithm), `dashmap` (concurrent hashmap, transitive dep of governor), Axum extractors

---

## Current State

- `server/src/routes.rs:37` — `register` handler, no rate check
- `server/src/routes.rs:60` — `login` handler, no rate check
- `server/src/routes.rs:91` — `refresh` handler, no rate check
- `server/src/error.rs` — `AppError` enum has no 429 variant
- `server/src/state.rs` — `AppState` has no rate limiter field
- `server/src/config.rs` — no rate limit config
- `server/Cargo.toml` — no `governor` dependency

---

### Task 1: Add `AppError::RateLimited` variant

**Files:**
- Modify: `server/src/error.rs:7-19` (AppError enum)
- Modify: `server/src/error.rs:28-38` (code() method)
- Modify: `server/src/error.rs:41-55` (IntoResponse impl)

**Step 1: Write the failing test**

Add to `server/src/error.rs` at the bottom of the existing `mod tests` block (line 73):

```rust
#[tokio::test]
async fn rate_limited_returns_429_with_retry_after() {
    let response = AppError::RateLimited(30).into_response();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        response.headers().get("retry-after").unwrap().to_str().unwrap(),
        "30"
    );
    let body = to_bytes(response.into_body()).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["code"], "rate_limited");
}
```

**Step 2: Run test to verify it fails**

Run: `cd server && cargo test error::tests::rate_limited_returns_429_with_retry_after`
Expected: compile error — `RateLimited` variant doesn't exist

**Step 3: Write minimal implementation**

In `server/src/error.rs`:

1. Add variant to `AppError` (after `Internal(String)`):
```rust
#[error("too many requests")]
RateLimited(u64),
```

2. Add to `code()` match:
```rust
AppError::RateLimited(_) => "rate_limited",
```

3. Modify `IntoResponse` — replace the entire impl:
```rust
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let code = self.code().to_string();
        let (status, message, retry_after) = match self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string(), None),
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string(), None),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string(), None),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg, None),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg, None),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg, None),
            AppError::RateLimited(secs) => {
                (StatusCode::TOO_MANY_REQUESTS, self.to_string(), Some(secs))
            }
        };

        let body = axum::Json(ErrorResponse { code, message });
        let mut response = (status, body).into_response();
        if let Some(secs) = retry_after {
            response.headers_mut().insert(
                axum::http::header::RETRY_AFTER,
                axum::http::HeaderValue::from_str(&secs.to_string()).unwrap(),
            );
        }
        response
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && cargo test error::tests`
Expected: all tests pass (both old and new)

**Step 5: Commit**

```bash
git add server/src/error.rs
git commit -m "feat(server): add AppError::RateLimited variant with 429 + Retry-After"
```

---

### Task 2: Add `governor` dependency and `rate_limit` module

**Files:**
- Modify: `server/Cargo.toml:6` (dependencies)
- Create: `server/src/rate_limit.rs`
- Modify: `server/src/main.rs:1` (add `mod rate_limit`)

**Step 1: Add dependency**

In `server/Cargo.toml`, add after the `futures-util` line:

```toml
governor = "0.8"
```

**Step 2: Create the rate limiter module**

Create `server/src/rate_limit.rs`:

```rust
use governor::clock::DefaultClock;
use governor::state::keyed::DashMapStateStore;
use governor::state::NotKeyed;
use governor::{Quota, RateLimiter as GovRateLimiter};
use std::num::NonZeroU32;
use std::sync::Arc;

/// Keyed rate limiter — one bucket per IP string.
pub type KeyedRateLimiter = GovRateLimiter<String, DashMapStateStore<String>, DefaultClock>;

/// Shared, cloneable handle.
#[derive(Clone)]
pub struct AuthRateLimiter {
    inner: Arc<KeyedRateLimiter>,
}

impl AuthRateLimiter {
    /// Create a new limiter: `burst` requests allowed, replenishing at
    /// `burst / window_secs` per second.
    pub fn new(burst: u32, window_secs: u64) -> Self {
        let quota = Quota::with_period(std::time::Duration::from_secs(window_secs))
            .unwrap()
            .allow_burst(NonZeroU32::new(burst).unwrap());
        Self {
            inner: Arc::new(GovRateLimiter::dashmap(quota)),
        }
    }

    /// Check whether `key` (IP address) is within limits.
    /// Returns `Ok(())` or `Err(retry_after_secs)`.
    pub fn check(&self, key: &str) -> Result<(), u64> {
        self.inner
            .check_key(&key.to_string())
            .map_err(|e| e.wait_time_from(governor::clock::DefaultClock::default().now())
                .as_secs()
                .max(1))
    }
}
```

**Step 3: Register the module**

In `server/src/main.rs`, add after `mod relay;` (line 9):

```rust
mod rate_limit;
```

**Step 4: Verify it compiles**

Run: `cd server && cargo check`
Expected: clean compile, no errors

**Step 5: Commit**

```bash
git add server/Cargo.toml server/src/rate_limit.rs server/src/main.rs
git commit -m "feat(server): add governor-based rate_limit module"
```

---

### Task 3: Extend Config and AppState with rate limiter

**Files:**
- Modify: `server/src/config.rs:4-9` (Config struct)
- Modify: `server/src/config.rs:12-26` (from_env)
- Modify: `server/src/state.rs:37-44` (AppState struct)
- Modify: `server/src/main.rs:59-66` (state construction)

**Step 1: Extend Config**

In `server/src/config.rs`, add two fields to `Config` struct:

```rust
pub auth_rate_limit_burst: u32,
pub auth_rate_limit_window_secs: u64,
```

And populate in `from_env()`:

```rust
let auth_rate_limit_burst = env::var("LUMINA_AUTH_RATE_BURST")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(10);
let auth_rate_limit_window_secs = env::var("LUMINA_AUTH_RATE_WINDOW_SECS")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(60);
```

**Step 2: Add to AppState**

In `server/src/state.rs`, add field:

```rust
pub auth_limiter: crate::rate_limit::AuthRateLimiter,
```

**Step 3: Construct in main.rs**

In `server/src/main.rs`, before the `let state = AppState { ... }` block, add:

```rust
let auth_limiter = rate_limit::AuthRateLimiter::new(
    config.auth_rate_limit_burst,
    config.auth_rate_limit_window_secs,
);
```

And add `auth_limiter` field inside the `AppState { ... }` block.

**Step 4: Fix test helper**

In `server/src/routes.rs` test module, update `test_state()` to include the new field:

```rust
auth_limiter: crate::rate_limit::AuthRateLimiter::new(100, 1),
```

Use a very generous limit (100 per 1s) to prevent rate limiting from affecting existing tests.

**Step 5: Verify all tests pass**

Run: `cd server && cargo test`
Expected: all existing tests pass

**Step 6: Commit**

```bash
git add server/src/config.rs server/src/state.rs server/src/main.rs server/src/routes.rs
git commit -m "feat(server): wire rate limiter into Config and AppState"
```

---

### Task 4: Add IP extraction helper

**Files:**
- Modify: `server/src/rate_limit.rs` (add `extract_client_ip` function)

**Step 1: Write the failing test**

Add a `#[cfg(test)]` block at the bottom of `server/src/rate_limit.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn extracts_ip_from_x_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.50, 70.41.3.18".parse().unwrap());
        assert_eq!(extract_client_ip(&headers), "203.0.113.50");
    }

    #[test]
    fn extracts_ip_from_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "198.51.100.1".parse().unwrap());
        assert_eq!(extract_client_ip(&headers), "198.51.100.1");
    }

    #[test]
    fn falls_back_to_unknown() {
        let headers = HeaderMap::new();
        assert_eq!(extract_client_ip(&headers), "unknown");
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd server && cargo test rate_limit::tests`
Expected: compile error — `extract_client_ip` doesn't exist

**Step 3: Implement**

Add to `server/src/rate_limit.rs` (before the `#[cfg(test)]` block):

```rust
use axum::http::HeaderMap;

/// Extract client IP from proxy headers, falling back to "unknown".
pub fn extract_client_ip(headers: &HeaderMap) -> String {
    if let Some(forwarded) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = forwarded.split(',').next() {
            let ip = first.trim();
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }
    if let Some(real_ip) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        let ip = real_ip.trim();
        if !ip.is_empty() {
            return ip.to_string();
        }
    }
    "unknown".to_string()
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && cargo test rate_limit::tests`
Expected: 3 tests pass

**Step 5: Commit**

```bash
git add server/src/rate_limit.rs
git commit -m "feat(server): add extract_client_ip helper for rate limiting"
```

---

### Task 5: Apply rate limiting to auth handlers

**Files:**
- Modify: `server/src/routes.rs:31-99` (register, login, refresh handlers)

**Step 1: Write the failing test**

Add to the existing `mod tests` block in `server/src/routes.rs`:

```rust
#[tokio::test]
async fn login_rejects_after_rate_limit_exceeded() {
    // Create state with very tight limit: 2 requests per 60s
    let data_dir = tempfile::tempdir().unwrap();
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::db::init_db(&pool).await.unwrap();

    let state = AppState {
        pool,
        config: Config {
            bind: "127.0.0.1:0".to_string(),
            db_url: "sqlite::memory:".to_string(),
            data_dir: data_dir.path().display().to_string(),
            jwt_secret: "test-secret".to_string(),
            auth_rate_limit_burst: 2,
            auth_rate_limit_window_secs: 60,
        },
        relay: RelayHub::new(),
        collab: CollabHub::new(&data_dir.path().display().to_string()),
        metrics: Arc::new(ServerMetrics::new()),
        notify: crate::notify_ws::NotifyHub::new(),
        auth_limiter: crate::rate_limit::AuthRateLimiter::new(2, 60),
    };

    // First register a user
    register(
        State(state.clone()),
        fake_ip_headers("10.0.0.99"),
        Json(RegisterRequest {
            email: "ratelimit@example.com".to_string(),
            password: "strongpass123".to_string(),
        }),
    )
    .await
    .unwrap();

    // Second request — still within limit
    let _ = login(
        State(state.clone()),
        fake_ip_headers("10.0.0.99"),
        Json(LoginRequest {
            email: "ratelimit@example.com".to_string(),
            password: "strongpass123".to_string(),
        }),
    )
    .await;

    // Third request — should be rate limited
    let result = login(
        State(state),
        fake_ip_headers("10.0.0.99"),
        Json(LoginRequest {
            email: "ratelimit@example.com".to_string(),
            password: "strongpass123".to_string(),
        }),
    )
    .await;

    match result {
        Err(AppError::RateLimited(secs)) => {
            assert!(secs > 0);
        }
        other => panic!("expected RateLimited, got {other:?}"),
    }
}

fn fake_ip_headers(ip: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-forwarded-for",
        HeaderValue::from_str(ip).unwrap(),
    );
    headers
}
```

**Step 2: Run test to verify it fails**

Run: `cd server && cargo test routes::tests::login_rejects_after_rate_limit_exceeded`
Expected: compile error — `register` and `login` don't accept `HeaderMap` parameter yet

**Step 3: Modify auth handlers to accept headers and check rate limit**

In `server/src/routes.rs`, update the three handlers:

**register** (line 31):
```rust
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::extract_client_ip(&headers);
    state.auth_limiter.check(&ip).map_err(AppError::RateLimited)?;

    let email = payload.email.trim().to_lowercase();
    // ... rest unchanged
```

**login** (line 60):
```rust
pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::extract_client_ip(&headers);
    state.auth_limiter.check(&ip).map_err(AppError::RateLimited)?;

    let email = payload.email.trim().to_lowercase();
    // ... rest unchanged
```

**refresh** (line 91, already takes headers — just add rate check):
```rust
pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TokenResponse>, AppError> {
    let ip = crate::rate_limit::extract_client_ip(&headers);
    state.auth_limiter.check(&ip).map_err(AppError::RateLimited)?;

    let token = extract_bearer(&headers).ok_or(AppError::Unauthorized)?;
    // ... rest unchanged
```

**Step 4: Update existing tests**

Existing tests call `register(State(state), Json(...))` without headers. Add empty `HeaderMap::new()` as the second argument to all existing `register(...)` and `login(...)` calls in tests. Since `test_state()` uses burst=100, they won't hit the limit.

**Step 5: Run all tests**

Run: `cd server && cargo test`
Expected: all tests pass including the new rate limit test

**Step 6: Commit**

```bash
git add server/src/routes.rs
git commit -m "feat(server): apply per-IP rate limiting to auth endpoints"
```

---

### Task 6: Verify formatting and clippy

**Step 1: Run fmt**

Run: `cd server && cargo fmt --check`
Expected: no formatting issues (fix if any)

**Step 2: Run clippy**

Run: `cd server && cargo clippy -- -D warnings`
Expected: no warnings

**Step 3: Fix any issues found and commit if needed**

```bash
git add -A server/src/
git commit -m "style(server): apply rustfmt and clippy fixes"
```

---

### Task 7: Add rate limit metrics (optional enrichment)

**Files:**
- Modify: `server/src/state.rs:47-55` (ServerMetrics)

**Step 1: Add counter**

In `ServerMetrics`, add:

```rust
pub auth_rate_limited: AtomicU64,
```

In `ServerMetricsSnapshot`, add:

```rust
pub auth_rate_limited: u64,
```

Wire through in `snapshot()` method.

**Step 2: Increment in rate_limit check**

In `server/src/routes.rs`, after each `state.auth_limiter.check(&ip).map_err(...)` line, the error path already returns. To count hits, create a small helper or increment in the error mapping:

```rust
state.auth_limiter.check(&ip).map_err(|secs| {
    state.metrics.auth_rate_limited.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    AppError::RateLimited(secs)
})?;
```

**Step 3: Run all tests**

Run: `cd server && cargo test`
Expected: all pass

**Step 4: Commit**

```bash
git add server/src/state.rs server/src/routes.rs
git commit -m "feat(server): track auth rate limit hits in metrics"
```

---

## Summary

| Task | What | Files changed |
|------|------|---------------|
| 1 | `AppError::RateLimited` + 429 + `Retry-After` | `error.rs` |
| 2 | `governor` dep + `rate_limit` module | `Cargo.toml`, `rate_limit.rs`, `main.rs` |
| 3 | Config env vars + AppState wiring | `config.rs`, `state.rs`, `main.rs`, `routes.rs` |
| 4 | `extract_client_ip` helper with tests | `rate_limit.rs` |
| 5 | Apply to `register`/`login`/`refresh` | `routes.rs` |
| 6 | fmt + clippy | all touched files |
| 7 | Rate limit metrics counter | `state.rs`, `routes.rs` |

**Defaults:** 10 requests / 60 seconds per IP, configurable via `LUMINA_AUTH_RATE_BURST` and `LUMINA_AUTH_RATE_WINDOW_SECS`.

**Not in scope (intentionally):**
- Global rate limiting for non-auth routes — different concern, separate plan
- Redis/persistent storage — in-memory is correct for single-instance; revisit if clustering
- Account lockout — separate feature, requires DB schema changes
