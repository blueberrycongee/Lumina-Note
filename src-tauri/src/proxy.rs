use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Global proxy configuration and shared HTTP client.
pub struct ProxyState {
    client: Arc<RwLock<Client>>,
    config: Arc<RwLock<ProxyConfig>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ProxyConfig {
    pub proxy_url: String,
    pub enabled: bool,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            proxy_url: String::new(),
            enabled: false,
        }
    }
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(build_client(None).expect("default client"))),
            config: Arc::new(RwLock::new(ProxyConfig::default())),
        }
    }

    /// Get a clone of the current shared client.
    pub async fn client(&self) -> Client {
        self.client.read().await.clone()
    }

    /// Get a client with a custom timeout (still respects proxy).
    pub async fn client_with_timeout(&self, timeout: Duration) -> Result<Client, String> {
        let config = self.config.read().await;
        build_client_with_timeout(
            if config.enabled { Some(&config.proxy_url) } else { None },
            timeout,
        )
    }

    /// Update proxy config and rebuild the shared client.
    pub async fn set_config(&self, proxy_url: String, enabled: bool) -> Result<(), String> {
        let proxy = if enabled { Some(proxy_url.as_str()) } else { None };
        let new_client = build_client(proxy)?;
        {
            let mut cfg = self.config.write().await;
            cfg.proxy_url = proxy_url;
            cfg.enabled = enabled;
        }
        {
            let mut c = self.client.write().await;
            *c = new_client;
        }
        Ok(())
    }

    pub async fn get_config(&self) -> ProxyConfig {
        self.config.read().await.clone()
    }
}

fn build_client(proxy_url: Option<&str>) -> Result<Client, String> {
    build_client_with_timeout(proxy_url, Duration::from_secs(120))
}

fn build_client_with_timeout(proxy_url: Option<&str>, timeout: Duration) -> Result<Client, String> {
    let mut builder = Client::builder().timeout(timeout);
    if let Some(url) = proxy_url {
        if !url.is_empty() {
            let proxy = reqwest::Proxy::all(url)
                .map_err(|e| format!("Invalid proxy URL: {}", e))?;
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(|e| format!("Failed to build HTTP client: {}", e))
}

// ── Tauri commands ──

#[tauri::command]
pub async fn set_proxy_config(
    state: tauri::State<'_, ProxyState>,
    proxy_url: String,
    enabled: bool,
) -> Result<(), String> {
    state.set_config(proxy_url, enabled).await
}

#[tauri::command]
pub async fn get_proxy_config(
    state: tauri::State<'_, ProxyState>,
) -> Result<ProxyConfig, String> {
    Ok(state.get_config().await)
}

#[tauri::command]
pub async fn test_proxy_connection(
    proxy_url: String,
) -> Result<(), String> {
    let proxy = reqwest::Proxy::all(&proxy_url)
        .map_err(|e| format!("Invalid proxy URL: {}", e))?;
    let client = Client::builder()
        .proxy(proxy)
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
    client
        .get("https://httpbin.org/ip")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_client_no_proxy() {
        let client = build_client(None);
        assert!(client.is_ok());
    }

    #[test]
    fn build_client_with_http_proxy() {
        let client = build_client(Some("http://127.0.0.1:7890"));
        assert!(client.is_ok());
    }

    #[test]
    fn build_client_with_socks5_proxy() {
        let client = build_client(Some("socks5://127.0.0.1:1080"));
        assert!(client.is_ok());
    }

    #[test]
    fn build_client_with_empty_proxy() {
        let client = build_client(Some(""));
        assert!(client.is_ok());
    }

    #[test]
    fn build_client_with_invalid_proxy() {
        // reqwest::Proxy::all rejects URLs without a valid scheme
        let client = build_client(Some("://missing-scheme"));
        assert!(client.is_err());
    }

    #[tokio::test]
    async fn proxy_state_default_config() {
        let state = ProxyState::new();
        let config = state.get_config().await;
        assert!(!config.enabled);
        assert!(config.proxy_url.is_empty());
    }

    #[tokio::test]
    async fn proxy_state_set_config() {
        let state = ProxyState::new();
        state
            .set_config("http://127.0.0.1:7890".into(), true)
            .await
            .unwrap();
        let config = state.get_config().await;
        assert!(config.enabled);
        assert_eq!(config.proxy_url, "http://127.0.0.1:7890");
    }
}
