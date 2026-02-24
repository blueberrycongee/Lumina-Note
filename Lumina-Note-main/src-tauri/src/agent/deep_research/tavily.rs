//! Tavily 网络搜索客户端
//!
//! 封装 Tavily API 调用，用于 Deep Research 的网络搜索功能

use serde::{Deserialize, Serialize};

use super::types::WebSearchResult;

/// Tavily 搜索请求
#[derive(Debug, Serialize)]
struct TavilySearchRequest {
    api_key: String,
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    search_depth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_results: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_answer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_raw_content: Option<bool>,
}

/// Tavily 搜索响应
#[derive(Debug, Deserialize)]
struct TavilySearchResponse {
    #[serde(default)]
    results: Vec<TavilyResult>,
    #[serde(default)]
    answer: Option<String>,
}

/// Tavily 单个搜索结果
#[derive(Debug, Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    content: String,
    #[serde(default)]
    score: f32,
}

/// Tavily 客户端
pub struct TavilyClient {
    api_key: String,
    client: reqwest::Client,
}

impl TavilyClient {
    const API_URL: &'static str = "https://api.tavily.com/search";

    /// 创建新的 Tavily 客户端
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self { api_key, client }
    }

    /// 执行搜索
    pub async fn search(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<Vec<WebSearchResult>, String> {
        let request = TavilySearchRequest {
            api_key: self.api_key.clone(),
            query: query.to_string(),
            search_depth: Some("basic".to_string()),
            max_results: Some(max_results),
            include_answer: Some(false),
            include_raw_content: Some(false),
        };

        let response = self
            .client
            .post(Self::API_URL)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Tavily request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Tavily API error {}: {}", status, body));
        }

        let tavily_response: TavilySearchResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Tavily response: {}", e))?;

        // 转换为 WebSearchResult
        let results = tavily_response
            .results
            .into_iter()
            .map(|r| WebSearchResult {
                title: r.title,
                url: r.url,
                content: r.content,
                score: r.score,
            })
            .collect();

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // 需要 API key
    async fn test_tavily_search() {
        let api_key = std::env::var("TAVILY_API_KEY").expect("TAVILY_API_KEY not set");
        let client = TavilyClient::new(api_key);
        let results = client.search("Rust programming language", 3).await.unwrap();
        assert!(!results.is_empty());
    }
}
