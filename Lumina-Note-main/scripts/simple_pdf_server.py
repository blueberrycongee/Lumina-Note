"""
简化版 PDF 解析测试服务
不依赖 PaddleOCR，仅使用 PyMuPDF 提取文本位置

运行：python simple_pdf_server.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF

app = Flask(__name__)
CORS(app)

def parse_pdf_simple(pdf_path: str):
    """
    简单解析 PDF：提取文本块位置
    """
    try:
        doc = fitz.open(pdf_path)
        pages = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            rect = page.rect
            
            # 获取文本块
            blocks = page.get_text("dict")["blocks"]
            elements = []
            
            for idx, block in enumerate(blocks):
                if block.get("type") == 0:  # 文本块
                    bbox = block["bbox"]
                    text = ""
                    
                    # 提取块内所有行的文本
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text += span.get("text", "")
                        text += "\n"
                    
                    if text.strip():
                        elements.append({
                            "id": f"el_{page_num + 1}_{idx}",
                            "type": "text",
                            "bbox": list(bbox),
                            "pageIndex": page_num + 1,
                            "content": text.strip()
                        })
                
                elif block.get("type") == 1:  # 图片块
                    bbox = block["bbox"]
                    elements.append({
                        "id": f"el_{page_num + 1}_{idx}",
                        "type": "image",
                        "bbox": list(bbox),
                        "pageIndex": page_num + 1,
                    })
            
            pages.append({
                "pageIndex": page_num + 1,
                "width": rect.width,
                "height": rect.height,
                "blocks": elements
            })
        
        doc.close()
        
        return {
            "pageCount": len(pages),
            "pages": pages
        }
    
    except Exception as e:
        raise Exception(f"解析失败: {str(e)}")

@app.route('/parse', methods=['POST'])
def parse_pdf():
    """解析 PDF 文件"""
    try:
        data = request.json
        pdf_path = data.get('pdf_path')
        
        if not pdf_path:
            return jsonify({'error': 'PDF path required'}), 400
        
        structure = parse_pdf_simple(pdf_path)
        return jsonify({'structure': structure})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok', 'backend': 'simple-pymupdf'})

if __name__ == '__main__':
    print("=" * 60)
    print("简化版 PDF 解析服务已启动")
    print("API 地址: http://localhost:8080")
    print("使用 PyMuPDF 提取文本和图片位置")
    print("=" * 60)
    app.run(host='0.0.0.0', port=8080, debug=True)
