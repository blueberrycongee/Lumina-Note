use governor::clock::{Clock, DefaultClock};
use governor::state::keyed::DashMapStateStore;
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
        self.inner.check_key(&key.to_string()).map_err(|e| {
            e.wait_time_from(DefaultClock::default().now())
                .as_secs()
                .max(1)
        })
    }
}
