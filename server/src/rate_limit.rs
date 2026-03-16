use axum::http::HeaderMap;
use governor::clock::{Clock, DefaultClock};
use governor::state::keyed::DashMapStateStore;
use governor::{Quota, RateLimiter as GovRateLimiter};
use std::net::IpAddr;
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
        self.inner.check_key(&key.to_string()).map_err(|e| {
            e.wait_time_from(DefaultClock::default().now())
                .as_secs()
                .max(1)
        })
    }
}

/// Deprecated: use `resolve_client_ip` instead. Kept temporarily until
/// routes.rs call sites are migrated (Task 4).
#[deprecated(note = "use resolve_client_ip with socket IP and trusted_proxy_hops")]
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

    socket_ip.to_string()
}

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
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "spoofed.by.client, 203.0.113.50".parse().unwrap(),
        );
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 1), "203.0.113.50");
    }

    #[test]
    fn one_hop_single_entry_xff() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.50".parse().unwrap());
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 1), "203.0.113.50");
    }

    // ── trusted_proxy_hops = 2: two reverse proxies ──

    #[test]
    fn two_hops_takes_second_from_right() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "spoofed, 198.51.100.1, 10.0.0.2".parse().unwrap(),
        );
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 2), "198.51.100.1");
    }

    // ── Edge cases ──

    #[test]
    fn hops_exceed_xff_entries_falls_back_to_socket() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.50".parse().unwrap());
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
        assert_eq!(resolve_client_ip(SOCKET_IP, &headers, 1), "10.0.0.2");
    }
}
