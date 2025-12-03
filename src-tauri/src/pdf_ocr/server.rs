// HTTP 服务器
use axum::{
    extract::Json,
    http::StatusCode,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use std::sync::Arc;

use super::ocr::OcrEngine;
use super::pdf::PdfRenderer;
use std::sync::Mutex;

#[derive(Deserialize)]
pub struct ParseRequest {
    pub pdf_path: String,
    #[serde(default)]
    pub layout_analysis: bool,
    #[serde(default)]
    pub ocr_engine: Option<String>,
}

#[derive(Serialize)]
pub struct ParseResponse {
    pub structure: PdfStructure,
}

#[derive(Serialize)]
pub struct PdfStructure {
    #[serde(rename = "pageCount")]
    pub page_count: usize,
    pub pages: Vec<PageData>,
}

#[derive(Serialize)]
pub struct PageData {
    #[serde(rename = "pageIndex")]
    pub page_index: usize,
    pub width: f32,
    pub height: f32,
    pub blocks: Vec<Block>,
}

#[derive(Serialize, Clone)]
pub struct Block {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub bbox: [f32; 4],
    #[serde(rename = "pageIndex")]
    pub page_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub backend: String,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub struct AppState {
    pub ocr_engine: Mutex<OcrEngine>,
}

pub async fn start_server(port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 初始化 OCR 引擎
    let ocr_engine = OcrEngine::new().map_err(|e| format!("OCR init error: {}", e))?;
    
    let state = Arc::new(AppState {
        ocr_engine: Mutex::new(ocr_engine),
    });

    let app = Router::new()
        .route("/parse", post(parse_pdf))
        .route("/health", get(health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    println!("PDF OCR 服务启动: http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}

async fn parse_pdf(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(req): Json<ParseRequest>,
) -> Result<Json<ParseResponse>, (StatusCode, Json<ErrorResponse>)> {
    println!("[OCR Server] 收到解析请求: {}", req.pdf_path);
    
    // 检查文件是否存在
    if !std::path::Path::new(&req.pdf_path).exists() {
        println!("[OCR Server] 错误: PDF 文件不存在");
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "PDF file not found".to_string(),
            }),
        ));
    }

    // 每次请求创建 PdfRenderer（避免线程安全问题）
    println!("[OCR Server] 初始化 PDF 渲染器...");
    let pdf_renderer = PdfRenderer::new().map_err(|e| {
        println!("[OCR Server] PDF 渲染器初始化失败: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("PDF renderer init error: {}", e),
            }),
        )
    })?;

    // PDF 转图片
    println!("[OCR Server] 渲染 PDF 页面...");
    let images = pdf_renderer
        .render_pages(&req.pdf_path)
        .map_err(|e| {
            println!("[OCR Server] PDF 渲染失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("PDF render error: {}", e),
                }),
            )
        })?;
    println!("[OCR Server] 渲染完成, {} 页", images.len());

    // 获取 OCR 引擎锁 (需要 mut)
    let mut ocr_engine = state.ocr_engine.lock().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("OCR lock error: {}", e),
            }),
        )
    })?;

    // OCR 每一页
    println!("[OCR Server] 开始 OCR 识别...");
    let mut pages = Vec::new();
    for (page_idx, img, width, height, scale_x, scale_y) in images {
        println!("[OCR Server] 处理第 {} 页 ({}x{}, scale: {:.4}x{:.4})...", page_idx, width, height, scale_x, scale_y);
        let ocr_results = ocr_engine.recognize(&img).map_err(|e| {
            println!("[OCR Server] OCR 识别失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("OCR error: {}", e),
                }),
            )
        })?;
        println!("[OCR Server] 第 {} 页识别到 {} 个文本块", page_idx, ocr_results.len());

        // 将像素坐标转换为 PDF points
        let blocks: Vec<Block> = ocr_results
            .into_iter()
            .enumerate()
            .map(|(idx, r)| Block {
                id: format!("el_{}_{}", page_idx, idx),
                block_type: "text".to_string(),
                bbox: [
                    r.bbox[0] * scale_x,
                    r.bbox[1] * scale_y,
                    r.bbox[2] * scale_x,
                    r.bbox[3] * scale_y,
                ],
                page_index: page_idx,
                content: Some(r.text),
            })
            .collect();

        pages.push(PageData {
            page_index: page_idx,
            width,
            height,
            blocks,
        });
    }

    Ok(Json(ParseResponse {
        structure: PdfStructure {
            page_count: pages.len(),
            pages,
        },
    }))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        backend: "rust-onnx-ocr".to_string(),
    })
}
