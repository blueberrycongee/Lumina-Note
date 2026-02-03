use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind: String,
    pub db_url: String,
    pub data_dir: String,
    pub jwt_secret: String,
}

impl Config {
    pub fn from_env() -> Self {
        let bind = env::var("LUMINA_BIND").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
        let db_url =
            env::var("LUMINA_DB_URL").unwrap_or_else(|_| "sqlite://data/lumina.db".to_string());
        let data_dir = env::var("LUMINA_DATA_DIR").unwrap_or_else(|_| "data".to_string());
        let jwt_secret = env::var("LUMINA_JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-change-me".to_string());

        Self {
            bind,
            db_url,
            data_dir,
            jwt_secret,
        }
    }
}
