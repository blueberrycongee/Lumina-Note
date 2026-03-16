# Rate Limit IP Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three review findings: (1) IP extraction trusts spoofable forwarding headers, (2) zero config values panic at startup, (3) missing socket fallback creates shared rate-limit bucket.

**Architecture:** Replace the current `extract_client_ip(headers)` with `resolve_client_ip(socket_ip, headers, trusted_proxy_hops)` that defaults to the TCP socket address. Forwarding headers are only parsed when `LUMINA_TRUSTED_PROXY_HOPS > 0`, using the rightward-counting algorithm (XFF[len - N]) that correctly handles multi-layer proxy chains. Enable Axum's `ConnectInfo<SocketAddr>` extractor to obtain the real socket address. Clamp config values to ≥ 1 at parse time.

**Tech Stack:** Axum 0.6 (`ConnectInfo`, `into_make_service_with_connect_info`), existing `governor` rate limiter

---

## Current State (what's broken)

1. `rate_limit.rs:41-57` — `extract_client_ip` trusts `X-Forwarded-For` first entry blindly; attacker can spoof any bucket key
2. `config.rs:21-28` — accepts `burst=0` or `window=0`; `rate_limit.rs:21-23` calls `NonZeroU32::new(0).unwrap()` → panic
3. `rate_limit.rs:56` — falls back to `"unknown"` string when no headers; all unproxied clients share one bucket
4. `main.rs:171` — uses `into_make_service()` (no socket info); handlers have no access to `ConnectInfo<SocketAddr>`

---

### Task 1: Clamp rate limit config values to ≥ 1

**Files:**
- Modify: `server/src/config.rs:21-28`
- Test: inline `#[cfg(test)]` in `server/src/config.rs`

**Step 1: Write the failing test**

Add at the bottom of `server/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_burst_clamps_to_one() {
        std::env::set_var("LUMINA_AUTH_RATE_BURST", "0");
        let config = Config::from_env();
        assert!(config.auth_rate_limit_burst >= 1);
        std::env::remove_var("LUMINA_AUTH_RATE_BURST");
    }

    #[test]
    fn zero_window_clamps_to_one() {
        std::env::set_var("LUMINA_AUTH_RATE_WINDOW_SECS", "0");
        let config = Config::from_env();
        assert!(config.auth_rate_limit_window_secs >= 1);
        std::env::remove_var("LUMINA_AUTH_RATE_WINDOW_SECS");
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd server && cargo test config::tests -- --test-threads=1`

Expected: `zero_burst_clamps_to_one` fails — value is 0.

**Step 3: Implement — add `.max(1)` clamp**

In `config.rs`, change the two parsing blocks:

```rust
let auth_rate_limit_burst = env::var("LUMINA_AUTH_RATE_BURST")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(10)
    .max(1);
let auth_rate_limit_window_secs = env::var("LUMINA_AUTH_RATE_WINDOW_SECS")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(60)
    .max(1);
```

**Step 4: Run tests**

Run: `cd server && cargo test config::tests -- --test-threads=1`

Expected: 2 tests pass.

**Step 5: Run full test suite**

Run: `cd server && cargo test`

Expected: all 9 existing tests + 2 new = 11 pass.

**Step 6: Commit**

```bash
git add server/src/config.rs
git commit -m "fix(server): clamp rate limit config values to minimum 1 to prevent startup panic"
```

---

### Task 2: Add `trusted_proxy_hops` to Config

**Files:**
- Modify: `server/src/config.rs:4-11` (Config struct)
- Modify: `server/src/config.rs:14-38` (from_env)
- Modify: `server/src/routes.rs` (test_state Config)

**Step 1: Add field and env parsing**

In `Config` struct, add:

```rust
pub trusted_proxy_hops: u32,
```

In `from_env()`, add before `Self { ... }`:

```rust
let trusted_proxy_hops = env::var("LUMINA_TRUSTED_PROXY_HOPS")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0);
```

Add `trusted_proxy_hops` to the `Self { ... }` block.

**Step 2: Fix test_state in routes.rs**

In `routes.rs` test module, add `trusted_proxy_hops: 0` to the `Config` inside `test_state()`.

Also add `trusted_proxy_hops: 0` to the `Config` inside `login_rejects_after_rate_limit_exceeded`.

**Step 3: Verify compilation and tests**

Run: `cd server && cargo test`

Expected: all tests pass.

**Step 4: Commit**

```bash
git add server/src/config.rs server/src/routes.rs
git commit -m "feat(server): add LUMINA_TRUSTED_PROXY_HOPS config (default 0)"
```

---

### Task 3: Rewrite `resolve_client_ip` with socket-first logic

**Files:**
- Modify: `server/src/rate_limit.rs:40-85` (replace `extract_client_ip` + tests)

This is the core security fix. The new function:
- `trusted_proxy_hops == 0` → use socket IP directly (ignore all forwarding headers)
- `trusted_proxy_hops == N` → parse X-Forwarded-For, take entry at index `len - N`; if index out of bounds, fall back to socket IP

**Step 1: Write the failing tests**

Replace the entire `#[cfg(test)] mod tests` block in `rate_limit.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    const SOCKET_IP: IpAddr = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));

    // ── trusted_proxy_hops = 0: always use socket IP ──

    #[test]
    fn zero_hops_uses_socket_ip_ignoring_xff() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "10.0.0.1, 10.0.0.2".parse().unwrap());
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 0), "192.168.1.1");
    }

    #[test]
    fn zero_hops_uses_socket_ip_ignoring_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "10.0.0.1".parse().unwrap());
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 0), "192.168.1.1");
    }

    #[test]
    fn zero_hops_no_headers_uses_socket_ip() {
        let headers = HeaderMap::new();
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 0), "192.168.1.1");
    }

    // ── trusted_proxy_hops = 1: single reverse proxy ──

    #[test]
    fn one_hop_takes_rightmost_xff_entry() {
        // XFF: client, proxy1 — 1 trusted hop → take XFF[len-1] = proxy1? No.
        // Actually: app ← proxy ← client
        // Proxy appends client IP: XFF = spoofed_by_client, real_client_ip
        // 1 hop → take XFF[len - 1] = real_client_ip (last = what proxy saw)
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "spoofed.by.client, 203.0.113.50".parse().unwrap(),
        );
        assert_eq!(
            resolve_client_ip(SOCKET_IP, &headers, 1),
            "203.0.113.50"
        );
    }

    #[test]
    fn one_hop_single_entry_xff() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.50".parse().unwrap());
        assert_eq!(
            resolve_client_ip(SOCKET_IP, &headers, 1),
            "203.0.113.50"
        );
    }

    // ── trusted_proxy_hops = 2: two reverse proxies ──

    #[test]
    fn two_hops_takes_second_from_right() {
        // app ← proxy2 ← proxy1 ← client
        // proxy1 appends client IP, proxy2 appends proxy1 IP
        // XFF = spoofed, real_client, proxy1
        // 2 hops → take XFF[len - 2] = real_client
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "spoofed, 198.51.100.1, 10.0.0.2".parse().unwrap(),
        );
        assert_eq!(
            resolve_client_ip(SOCKET_IP, &headers, 2),
            "198.51.100.1"
        );
    }

    // ── Edge cases ──

    #[test]
    fn hops_exceed_xff_entries_falls_back_to_socket() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.50".parse().unwrap());
        // 3 hops but only 1 XFF entry → can't trust, fall back to socket
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 3), "192.168.1.1");
    }

    #[test]
    fn hops_nonzero_but_no_xff_falls_back_to_socket() {
        let headers = HeaderMap::new();
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 1), "192.168.1.1");
    }

    #[test]
    fn xff_entries_are_trimmed() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "  203.0.113.50 ,  10.0.0.2 ".parse().unwrap(),
        );
        assert_eq!(
            resolve_client_ip(SOCKET_IP, &headers, 1),
            "10.0.0.2"
        );
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd server && cargo test rate_limit::tests`

Expected: compile error — `resolve_client_ip` doesn't exist.

**Step 3: Replace `extract_client_ip` with `resolve_client_ip`**

Replace lines 40-57 of `rate_limit.rs` with:

```rust
use std::net::IpAddr;

/// Resolve client IP for rate limiting.
///
/// - `trusted_proxy_hops == 0` (default): use the TCP socket address directly.
///   Forwarding headers are ignored because they are client-controlled.
/// - `trusted_proxy_hops == N`: parse `X-Forwarded-For` and take the entry at
///   position `len - N` (counting from the right). Each trusted proxy layer
///   appends one entry, so the Nth-from-right is the first untrusted hop.
///   Falls back to socket IP if XFF is missing or has fewer than N entries.
pub fn resolve_client_ip(socket_ip: IpAddr, headers: &HeaderMap, trusted_proxy_hops: u32) -> String {
    if trusted_proxy_hops == 0 {
        return socket_ip.to_string();
    }

    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        let entries: Vec<&str> = xff.split(',').map(|s| s.trim()).collect();
        let hops = trusted_proxy_hops as usize;
        if entries.len() >= hops {
            let ip = entries[entries.len() - hops];
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }

    // XFF missing or insufficient entries — fall back to socket
    socket_ip.to_string()
}
```

**Step 4: Run tests**

Run: `cd server && cargo test rate_limit::tests`

Expected: all 9 tests pass.

**Step 5: Commit**

```bash
git add server/src/rate_limit.rs
git commit -m "fix(server): replace extract_client_ip with socket-first resolve_client_ip

Default to TCP socket address. Only parse X-Forwarded-For when
LUMINA_TRUSTED_PROXY_HOPS > 0, using rightward-counting algorithm
to resist header spoofing."
```

---

### Task 4: Enable `ConnectInfo<SocketAddr>` and update auth handlers

**Files:**
- Modify: `server/src/main.rs:170-172` (serve call)
- Modify: `server/src/routes.rs:31-125` (3 auth handlers)
- Modify: `server/src/routes.rs` test module (all handler calls)

**Step 1: Change server startup to expose socket info**

In `server/src/main.rs`, add import:

```rust
use std::net::SocketAddr;
```

Change line 171 from:

```rust
.serve(app.into_make_service())
```

to:

```rust
.serve(app.into_make_service_with_connect_info::<SocketAddr>())
```

**Step 2: Update auth handler signatures**

In `server/src/routes.rs`, add import at top:

```rust
use axum::extract::ConnectInfo;
use std::net::SocketAddr;
```

**register** — change to:

```rust
pub async fn register(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::resolve_client_ip(
        addr.ip(),
        &headers,
        state.config.trusted_proxy_hops,
    );
    state.auth_limiter.check(&ip).map_err(|secs| {
        state
            .metrics
            .auth_rate_limited
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        AppError::RateLimited(secs)
    })?;
    // ... rest unchanged
```

**login** — same pattern:

```rust
pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::resolve_client_ip(
        addr.ip(),
        &headers,
        state.config.trusted_proxy_hops,
    );
    state.auth_limiter.check(&ip).map_err(|secs| {
        state
            .metrics
            .auth_rate_limited
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        AppError::RateLimited(secs)
    })?;
    // ... rest unchanged
```

**refresh** — same pattern:

```rust
pub async fn refresh(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<TokenResponse>, AppError> {
    let ip = crate::rate_limit::resolve_client_ip(
        addr.ip(),
        &headers,
        state.config.trusted_proxy_hops,
    );
    state.auth_limiter.check(&ip).map_err(|secs| {
        state
            .metrics
            .auth_rate_limited
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        AppError::RateLimited(secs)
    })?;
    let token = extract_bearer(&headers).ok_or(AppError::Unauthorized)?;
    // ... rest unchanged
```

**Step 3: Update ALL existing test calls**

In the test module, every `register(...)` and `login(...)` call needs `ConnectInfo` as the second argument. The pattern:

```rust
register(
    State(state),
    ConnectInfo("127.0.0.1:9999".parse::<SocketAddr>().unwrap()),
    HeaderMap::new(),
    Json(RegisterRequest { ... }),
)
```

Update these tests:
- `register_returns_user_and_default_workspace`
- `register_rejects_passwords_shorter_than_eight_characters`
- `login_and_create_workspace_share_same_contract` (both register and login calls)
- `login_rejects_after_rate_limit_exceeded` — this test uses `ip_headers` with `x-forwarded-for`.
  Since `trusted_proxy_hops` is 0 in test_state, XFF will be ignored and socket IP used instead.
  To keep testing the rate-limit-exhaustion scenario, the test just needs all 3 calls to use the
  **same** `ConnectInfo` address (which they already do if you use the same parse). The rate limiter
  keys on the resolved IP, which will be "127.0.0.1" for all calls. Remove the `ip_headers` variable
  and use `HeaderMap::new()` instead — the rate limiting is now keyed by socket IP, not XFF.

**Step 4: Run all tests**

Run: `cd server && cargo test`

Expected: all tests pass.

**Step 5: Commit**

```bash
git add server/src/main.rs server/src/routes.rs
git commit -m "fix(server): use ConnectInfo<SocketAddr> for rate limit keying

Auth handlers now receive the real TCP socket address via Axum's
ConnectInfo extractor. Forwarding headers are only consulted when
trusted_proxy_hops > 0. Eliminates header spoofing and the shared
'unknown' bucket."
```

---

### Task 5: fmt + clippy + full verification

**Step 1: Run fmt**

Run: `cd server && cargo fmt`

**Step 2: Run clippy**

Run: `cd server && cargo clippy -- -D warnings`

**Step 3: Run full test suite**

Run: `cd server && cargo test`

Expected: all tests pass, no warnings.

**Step 4: Commit if any formatting changes**

```bash
git add server/src/
git commit -m "style(server): apply rustfmt formatting"
```

---

## Summary

| Task | Fixes | Files |
|------|-------|-------|
| 1 | **#2**: zero config → panic | `config.rs` |
| 2 | Config for #1 | `config.rs`, `routes.rs` |
| 3 | **#1 + #3**: socket-first IP resolution | `rate_limit.rs` |
| 4 | **#1 + #3**: ConnectInfo wiring | `main.rs`, `routes.rs` |
| 5 | Formatting | all |

**Behavioral change:**
- Before: any client can set `X-Forwarded-For: victim-ip` to hijack or bypass rate limits
- After (default, hops=0): rate limiting keys on TCP socket address; forwarding headers ignored
- After (hops=N): parse XFF[len - N] — only the entry appended by the Nth trusted proxy is used; client-supplied prefix is discarded

**Config reference:**
| Env var | Default | Meaning |
|---------|---------|---------|
| `LUMINA_TRUSTED_PROXY_HOPS` | `0` | Number of trusted proxy layers. 0 = use socket IP |
| `LUMINA_AUTH_RATE_BURST` | `10` | Max requests per window (clamped ≥ 1) |
| `LUMINA_AUTH_RATE_WINDOW_SECS` | `60` | Window duration in seconds (clamped ≥ 1) |

**Deployment guidance:**
- Direct exposure (no proxy): leave `LUMINA_TRUSTED_PROXY_HOPS=0` (default)
- Behind Nginx/Caddy (single proxy): set `LUMINA_TRUSTED_PROXY_HOPS=1`
- Behind Cloudflare → Nginx (two proxies): set `LUMINA_TRUSTED_PROXY_HOPS=2`
