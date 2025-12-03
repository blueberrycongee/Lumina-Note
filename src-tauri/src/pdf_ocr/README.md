# PDF OCR 模块

纯 Rust 实现的 PDF 解析 + OCR 服务。

## 依赖

### 1. PDFium 库

下载 PDFium 预编译库：
- https://github.com/nicholasblexrud/pdfium-render-static/releases

Windows:
```
将 pdfium.dll 放到项目根目录或 PATH 中
```

### 2. ONNX Runtime

下载 ONNX Runtime：
- https://github.com/microsoft/onnxruntime/releases

Windows:
```
将 onnxruntime.dll 放到项目根目录或 PATH 中
```

### 3. PaddleOCR ONNX 模型

下载 PaddleOCR v4 ONNX 模型：

```bash
# 创建模型目录
mkdir -p models

# 下载检测模型
# https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_infer.tar
# 转换为 ONNX: paddle2onnx

# 下载识别模型
# https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar
# 转换为 ONNX: paddle2onnx

# 下载字典
# https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt
```

模型目录结构：
```
models/
├── ch_PP-OCRv4_det_infer.onnx   # 检测模型
├── ch_PP-OCRv4_rec_infer.onnx   # 识别模型
└── ppocr_keys_v1.txt            # 字符字典
```

### 模型转换

使用 `paddle2onnx` 转换 PaddlePaddle 模型：

```bash
pip install paddle2onnx

# 检测模型
paddle2onnx --model_dir ch_PP-OCRv4_det_infer \
    --model_filename inference.pdmodel \
    --params_filename inference.pdiparams \
    --save_file ch_PP-OCRv4_det_infer.onnx \
    --opset_version 11

# 识别模型
paddle2onnx --model_dir ch_PP-OCRv4_rec_infer \
    --model_filename inference.pdmodel \
    --params_filename inference.pdiparams \
    --save_file ch_PP-OCRv4_rec_infer.onnx \
    --opset_version 11
```

## 使用

```rust
use pdf_ocr::start_server;

#[tokio::main]
async fn main() {
    start_server(8080).await.unwrap();
}
```

## API

### POST /parse

解析 PDF 文件。

请求：
```json
{
    "pdf_path": "/path/to/file.pdf",
    "layout_analysis": true
}
```

响应：
```json
{
    "structure": {
        "pageCount": 2,
        "pages": [
            {
                "pageIndex": 1,
                "width": 612.0,
                "height": 792.0,
                "blocks": [
                    {
                        "id": "el_1_0",
                        "type": "text",
                        "bbox": [72.0, 72.0, 540.0, 100.0],
                        "pageIndex": 1,
                        "content": "Hello World"
                    }
                ]
            }
        ]
    }
}
```

### GET /health

健康检查。

响应：
```json
{
    "status": "ok",
    "backend": "rust-onnx-ocr"
}
```

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    HTTP Server                       │
│                     (axum)                          │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ PDF Render  │  │ OCR Engine  │  │   Layout    │
│ (pdfium)    │  │ (ort/onnx)  │  │  Analyzer   │
└─────────────┘  └─────────────┘  └─────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  DBNet      │  │   CRNN      │  │  CTC Decode │
│ (检测)       │  │  (识别)      │  │   (解码)    │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 性能优化

1. **批量处理**：一次处理多个文本框，减少推理次数
2. **GPU 加速**：ONNX Runtime 支持 CUDA/DirectML
3. **缓存**：缓存字典和模型，避免重复加载
4. **多线程**：并行处理多个页面
