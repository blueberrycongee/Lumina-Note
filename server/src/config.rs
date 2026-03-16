use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind: String,
    pub db_url: String,
    pub data_dir: String,
    pub jwt_secret: String,
    pub auth_rate_limit_burst: u32,
    pub auth_rate_limit_window_secs: u64,
}

impl Config {
    pub fn from_env() -> Self {
        let bind = env::var("LUMINA_BIND").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
        let db_url =
            env::var("LUMINA_DB_URL").unwrap_or_else(|_| "sqlite://data/lumina.db".to_string());
        let data_dir = env::var("LUMINA_DATA_DIR").unwrap_or_else(|_| "data".to_string());
        let jwt_secret =
            env::var("LUMINA_JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".to_string());
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

        Self {
            bind,
            db_url,
            data_dir,
            jwt_secret,
            auth_rate_limit_burst,
            auth_rate_limit_window_secs,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Tests that modify env vars must run single-threaded
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn zero_burst_clamps_to_one() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("LUMINA_AUTH_RATE_BURST", "0");
        let config = Config::from_env();
        std::env::remove_var("LUMINA_AUTH_RATE_BURST");
        assert!(config.auth_rate_limit_burst >= 1);
    }

    #[test]
    fn zero_window_clamps_to_one() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("LUMINA_AUTH_RATE_WINDOW_SECS", "0");
        let config = Config::from_env();
        std::env::remove_var("LUMINA_AUTH_RATE_WINDOW_SECS");
        assert!(config.auth_rate_limit_window_secs >= 1);
    }
}
