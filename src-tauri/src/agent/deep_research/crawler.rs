//! 网页爬取模块
//! 
//! 使用 Jina Reader API 将网页转换为可读的 Markdown 格式

use reqwest::Client;

/// 爬取的网页内容
#[derive(Debug, Clone)]
pub struct CrawledPage {
    /// 原始 URL
    pub url: String,
    /// 页面标题
    pub title: String,
    /// 提取的内容（Markdown 格式）
    pub content: String,
}

/// Jina Reader 客户端
pub struct JinaClient {
    client: Client,
    api_key: Option<String>,
}

impl JinaClient {
    /// 创建新的 Jina 客户端
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }

    /// 爬取网页内容
    /// 
    /// 使用 Jina Reader API 将网页转换为 Markdown
    pub async fn crawl(&self, url: &str) -> Result<CrawledPage, String> {
        // Jina Reader API: https://r.jina.ai/{url}
        let jina_url = format!("https://r.jina.ai/{}", url);
        
        let mut request = self.client
            .get(&jina_url)
            .header("Accept", "text/markdown");
        
        // 如果有 API Key，添加到请求头
        if let Some(ref key) = self.api_key {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| format!("请求 Jina API 失败: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!(
                "Jina API 返回错误状态: {} - {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }
        
        let content = response
            .text()
            .await
            .map_err(|e| format!("读取响应内容失败: {}", e))?;
        
        if content.is_empty() {
            return Err("Jina API 返回空内容".to_string());
        }
        
        // 从内容中提取标题（通常是第一行 # 开头）
        let title = extract_title(&content, url);
        
        // 截断内容，避免过长
        let truncated_content = truncate_content(&content, 3000);
        
        Ok(CrawledPage {
            url: url.to_string(),
            title,
            content: truncated_content,
        })
    }
}

/// 从 Markdown 内容中提取标题
fn extract_title(content: &str, fallback_url: &str) -> String {
    // 尝试从第一个 # 标题提取
    for line in content.lines().take(10) {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return trimmed[2..].trim().to_string();
        }
    }
    
    // 尝试从 URL 提取域名作为标题
    // 简单实现：查找 :// 后的第一个 / 之前的部分
    if let Some(start) = fallback_url.find("://") {
        let after_protocol = &fallback_url[start + 3..];
        if let Some(end) = after_protocol.find('/') {
            return after_protocol[..end].to_string();
        }
        return after_protocol.to_string();
    }
    
    fallback_url.to_string()
}

/// 截断内容到指定字符数
fn truncate_content(content: &str, max_chars: usize) -> String {
    if content.chars().count() <= max_chars {
        return content.to_string();
    }
    
    let truncated: String = content.chars().take(max_chars).collect();
    format!("{}...\n\n(内容已截断)", truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_title() {
        let content = "# Hello World\n\nSome content";
        assert_eq!(extract_title(content, "https://example.com"), "Hello World");
        
        let content_no_title = "Some content without title";
        assert_eq!(extract_title(content_no_title, "https://example.com"), "example.com");
    }

    #[test]
    fn test_truncate_content() {
        let short = "Hello";
        assert_eq!(truncate_content(short, 100), "Hello");
        
        let long = "A".repeat(200);
        let truncated = truncate_content(&long, 50);
        assert!(truncated.contains("..."));
        assert!(truncated.contains("内容已截断"));
    }
}
