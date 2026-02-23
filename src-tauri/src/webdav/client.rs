//! WebDAV HTTP 客户端
//!
//! 封装 WebDAV 协议的 HTTP 请求，提供高层 API

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method, StatusCode};
use std::time::Duration;

use super::types::{RemoteEntry, WebDAVConfig};
use crate::error::AppError;

/// WebDAV 客户端
pub struct WebDAVClient {
    client: Client,
    config: WebDAVConfig,
}

impl WebDAVClient {
    /// 创建新的 WebDAV 客户端
    pub fn new(config: WebDAVConfig) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| AppError::WebDAV(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client, config })
    }

    /// 构建认证头
    fn auth_header(&self) -> HeaderValue {
        let credentials = format!("{}:{}", self.config.username, self.config.password);
        let encoded = STANDARD.encode(credentials.as_bytes());
        HeaderValue::from_str(&format!("Basic {}", encoded)).unwrap()
    }

    /// 构建完整 URL
    fn build_url(&self, path: &str) -> String {
        let base = self.config.server_url.trim_end_matches('/');
        let remote_base = self.config.remote_base_path.trim_matches('/');
        let path = path.trim_start_matches('/');

        if remote_base.is_empty() {
            format!("{}/{}", base, path)
        } else {
            format!("{}/{}/{}", base, remote_base, path)
        }
    }

    /// 测试连接
    pub async fn test_connection(&self) -> Result<bool, AppError> {
        let url = self.build_url("");

        let response = self
            .client
            .request(Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header(AUTHORIZATION, self.auth_header())
            .header("Depth", "0")
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("Connection failed: {}", e)))?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => Ok(true),
            StatusCode::UNAUTHORIZED => Err(AppError::WebDAV("Authentication failed".to_string())),
            status => Err(AppError::WebDAV(format!("Unexpected status: {}", status))),
        }
    }

    /// 列出目录内容 (PROPFIND)
    pub async fn list_dir(&self, path: &str) -> Result<Vec<RemoteEntry>, AppError> {
        let url = self.build_url(path);

        // PROPFIND 请求体
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getetag/>
    <D:getcontenttype/>
  </D:prop>
</D:propfind>"#;

        let response = self
            .client
            .request(Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header(AUTHORIZATION, self.auth_header())
            .header(CONTENT_TYPE, "application/xml")
            .header("Depth", "1")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("PROPFIND failed: {}", e)))?;

        if response.status() != StatusCode::MULTI_STATUS {
            return Err(AppError::WebDAV(format!(
                "PROPFIND failed with status: {}",
                response.status()
            )));
        }

        let body = response
            .text()
            .await
            .map_err(|e| AppError::WebDAV(format!("Failed to read response: {}", e)))?;

        self.parse_propfind_response(&body, path)
    }

    /// 递归列出所有文件
    pub async fn list_all_recursive(&self, path: &str) -> Result<Vec<RemoteEntry>, AppError> {
        let mut all_entries = Vec::new();
        let mut dirs_to_scan = vec![path.to_string()];

        while let Some(dir) = dirs_to_scan.pop() {
            let entries = self.list_dir(&dir).await?;

            for entry in entries {
                if entry.is_dir {
                    dirs_to_scan.push(entry.path.clone());
                }
                all_entries.push(entry);
            }
        }

        Ok(all_entries)
    }

    /// 解析 PROPFIND 响应
    fn parse_propfind_response(
        &self,
        xml: &str,
        base_path: &str,
    ) -> Result<Vec<RemoteEntry>, AppError> {
        let mut entries = Vec::new();

        // 简单的 XML 解析 (生产环境建议使用 quick-xml)
        // 这里使用字符串解析来避免额外依赖

        let base_path_normalized = base_path.trim_matches('/');

        // 按 <D:response> 分割
        for response_block in xml.split("<D:response>").skip(1) {
            let href = self
                .extract_xml_value(response_block, "D:href")
                .or_else(|| self.extract_xml_value(response_block, "d:href"));

            if let Some(href) = href {
                // URL 解码
                let decoded_href = urlencoding_decode(&href);
                let path = self.extract_relative_path(&decoded_href);

                // 跳过根目录本身
                if path.trim_matches('/') == base_path_normalized {
                    continue;
                }

                let is_dir = response_block.contains("<D:collection")
                    || response_block.contains("<d:collection")
                    || response_block.contains("resourcetype><D:collection")
                    || response_block.contains("resourcetype><d:collection");

                let size = self
                    .extract_xml_value(response_block, "D:getcontentlength")
                    .or_else(|| self.extract_xml_value(response_block, "d:getcontentlength"))
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let modified = self
                    .extract_xml_value(response_block, "D:getlastmodified")
                    .or_else(|| self.extract_xml_value(response_block, "d:getlastmodified"))
                    .and_then(|s| parse_http_date(&s))
                    .unwrap_or(0);

                let etag = self
                    .extract_xml_value(response_block, "D:getetag")
                    .or_else(|| self.extract_xml_value(response_block, "d:getetag"));

                let content_type = self
                    .extract_xml_value(response_block, "D:getcontenttype")
                    .or_else(|| self.extract_xml_value(response_block, "d:getcontenttype"));

                let name = path.split('/').last().unwrap_or("").to_string();

                if !name.is_empty() {
                    entries.push(RemoteEntry {
                        path,
                        name,
                        is_dir,
                        size,
                        modified,
                        etag,
                        content_type,
                    });
                }
            }
        }

        Ok(entries)
    }

    /// 从 XML 中提取标签值
    fn extract_xml_value(&self, xml: &str, tag: &str) -> Option<String> {
        let open_tag = format!("<{}>", tag);
        let close_tag = format!("</{}>", tag);

        if let Some(start) = xml.find(&open_tag) {
            let value_start = start + open_tag.len();
            if let Some(end) = xml[value_start..].find(&close_tag) {
                return Some(xml[value_start..value_start + end].trim().to_string());
            }
        }
        None
    }

    /// 从完整 URL 提取相对路径
    fn extract_relative_path(&self, href: &str) -> String {
        // 移除服务器 URL 部分
        let path = if href.starts_with("http://") || href.starts_with("https://") {
            // 完整 URL，提取路径部分
            if let Some(pos) = href.find("://") {
                if let Some(path_start) = href[pos + 3..].find('/') {
                    &href[pos + 3 + path_start..]
                } else {
                    "/"
                }
            } else {
                href
            }
        } else {
            href
        };

        // 移除 remote_base_path 前缀
        let base = self.config.remote_base_path.trim_matches('/');
        let path = path.trim_start_matches('/');

        if !base.is_empty() && path.starts_with(base) {
            path[base.len()..].trim_start_matches('/').to_string()
        } else {
            path.to_string()
        }
    }

    /// 下载文件 (GET)
    pub async fn download(&self, path: &str) -> Result<Vec<u8>, AppError> {
        let url = self.build_url(path);

        let response = self
            .client
            .get(&url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("Download failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::WebDAV(format!(
                "Download failed with status: {}",
                response.status()
            )));
        }

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| AppError::WebDAV(format!("Failed to read download: {}", e)))
    }

    /// 下载文件为文本
    pub async fn download_text(&self, path: &str) -> Result<String, AppError> {
        let bytes = self.download(path).await?;
        String::from_utf8(bytes).map_err(|e| AppError::WebDAV(format!("Invalid UTF-8: {}", e)))
    }

    /// 上传文件 (PUT)
    pub async fn upload(&self, path: &str, content: &[u8]) -> Result<(), AppError> {
        let url = self.build_url(path);

        let response = self
            .client
            .put(&url)
            .header(AUTHORIZATION, self.auth_header())
            .body(content.to_vec())
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("Upload failed: {}", e)))?;

        match response.status() {
            StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT => Ok(()),
            status => Err(AppError::WebDAV(format!(
                "Upload failed with status: {}",
                status
            ))),
        }
    }

    /// 上传文本文件
    pub async fn upload_text(&self, path: &str, content: &str) -> Result<(), AppError> {
        self.upload(path, content.as_bytes()).await
    }

    /// 创建目录 (MKCOL)
    pub async fn create_dir(&self, path: &str) -> Result<(), AppError> {
        let url = self.build_url(path);

        let response = self
            .client
            .request(Method::from_bytes(b"MKCOL").unwrap(), &url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("MKCOL failed: {}", e)))?;

        match response.status() {
            StatusCode::CREATED | StatusCode::OK | StatusCode::METHOD_NOT_ALLOWED => {
                // METHOD_NOT_ALLOWED 通常表示目录已存在
                Ok(())
            }
            status => Err(AppError::WebDAV(format!(
                "MKCOL failed with status: {}",
                status
            ))),
        }
    }

    /// 删除文件或目录 (DELETE)
    pub async fn delete(&self, path: &str) -> Result<(), AppError> {
        let url = self.build_url(path);

        let response = self
            .client
            .delete(&url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::WebDAV(format!("DELETE failed: {}", e)))?;

        match response.status() {
            StatusCode::OK | StatusCode::NO_CONTENT | StatusCode::NOT_FOUND => Ok(()),
            status => Err(AppError::WebDAV(format!(
                "DELETE failed with status: {}",
                status
            ))),
        }
    }

    /// 确保目录存在 (递归创建)
    pub async fn ensure_dir(&self, path: &str) -> Result<(), AppError> {
        let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
        let mut current = String::new();

        for part in parts {
            if part.is_empty() {
                continue;
            }
            current = format!("{}/{}", current, part);
            self.create_dir(&current).await?;
        }

        Ok(())
    }
}

/// 简单的 URL 解码
fn urlencoding_decode(s: &str) -> String {
    let mut bytes: Vec<u8> = Vec::with_capacity(s.len());
    let mut chars = s.as_bytes().iter();

    while let Some(&b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().copied();
            let lo = chars.next().copied();
            if let (Some(h), Some(l)) = (hi, lo) {
                let hex_str = [h, l];
                if let Ok(decoded) =
                    u8::from_str_radix(std::str::from_utf8(&hex_str).unwrap_or(""), 16)
                {
                    bytes.push(decoded);
                } else {
                    bytes.push(b'%');
                    bytes.push(h);
                    bytes.push(l);
                }
            } else {
                bytes.push(b'%');
                if let Some(h) = hi {
                    bytes.push(h);
                }
            }
        } else if b == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(b);
        }
    }

    String::from_utf8(bytes).unwrap_or_else(|_| s.to_string())
}

/// 解析 HTTP 日期格式
fn parse_http_date(s: &str) -> Option<u64> {
    // 支持格式: "Tue, 03 Dec 2024 10:30:00 GMT"
    use chrono::DateTime;

    // 尝试多种常见格式
    let formats = [
        "%a, %d %b %Y %H:%M:%S GMT",
        "%A, %d-%b-%y %H:%M:%S GMT",
        "%a %b %d %H:%M:%S %Y",
    ];

    for fmt in &formats {
        if let Ok(dt) = DateTime::parse_from_str(s.trim(), fmt) {
            return Some(dt.timestamp() as u64);
        }
        // 尝试 NaiveDateTime 然后假设 UTC
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s.trim(), fmt) {
            return Some(dt.and_utc().timestamp() as u64);
        }
    }

    // 最后尝试 RFC 2822
    if let Ok(dt) = DateTime::parse_from_rfc2822(s.trim()) {
        return Some(dt.timestamp() as u64);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_decode_ascii() {
        assert_eq!(urlencoding_decode("hello%20world"), "hello world");
        assert_eq!(urlencoding_decode("test+file"), "test file");
        assert_eq!(urlencoding_decode("no%20encoding%20needed"), "no encoding needed");
        assert_eq!(urlencoding_decode("100%25done"), "100%done");
    }

    #[test]
    fn test_url_decode_chinese() {
        // "中文" = E4 B8 AD E6 96 87
        assert_eq!(urlencoding_decode("%E4%B8%AD%E6%96%87"), "中文");
    }

    #[test]
    fn test_url_decode_mixed_chinese_ascii() {
        // "笔记/日记/2024年.md"
        assert_eq!(
            urlencoding_decode("%E7%AC%94%E8%AE%B0/%E6%97%A5%E8%AE%B0/2024%E5%B9%B4.md"),
            "笔记/日记/2024年.md"
        );
    }

    #[test]
    fn test_url_decode_emoji() {
        // "📝" = F0 9F 93 9D (4-byte UTF-8)
        assert_eq!(urlencoding_decode("%F0%9F%93%9D"), "📝");
    }

    #[test]
    fn test_url_decode_japanese() {
        // "テスト" = E3 83 86 E3 82 B9 E3 83 88
        assert_eq!(
            urlencoding_decode("%E3%83%86%E3%82%B9%E3%83%88"),
            "テスト"
        );
    }

    #[test]
    fn test_url_decode_passthrough() {
        // 无编码的普通字符串应原样返回
        assert_eq!(urlencoding_decode("plain.md"), "plain.md");
        assert_eq!(urlencoding_decode(""), "");
    }
}
