"""
PP-Structure PDF 解析服务
使用 PaddleOCR 的 PP-Structure 实现 PDF 文档结构分析

安装依赖：
pip install flask paddleocr paddlepaddle pymupdf

运行：
python pp_structure_server.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import fitz  # PyMuPDF
try:
    from paddleocr import PPStructure
except ImportError:
    # 新版本使用 PaddleOCR
    from paddleocr import PaddleOCR
    PPStructure = None
import json
from typing import List, Dict, Any

app = Flask(__name__)
CORS(app)  # 允许跨域

# 初始化 PP-Structure 或 PaddleOCR
if PPStructure:
    # 旧版本
    pp_structure = PPStructure(
        layout=True,
        table=True,
        ocr=True,
        show_log=False
    )
else:
    # 新版本使用 PaddleOCR
    pp_structure = PaddleOCR(
        use_angle_cls=True,
        lang='ch',
        show_log=False
    )

def pdf_to_images(pdf_path: str) -> List[tuple]:
    """
    将 PDF 转换为图片
    返回: [(page_index, image_path, width, height), ...]
    """
    doc = fitz.open(pdf_path)
    images = []
    temp_dir = "temp_pdf_images"
    os.makedirs(temp_dir, exist_ok=True)
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        # 渲染为图片 (200 DPI)
        pix = page.get_pixmap(matrix=fitz.Matrix(200/72, 200/72))
        img_path = os.path.join(temp_dir, f"page_{page_num}.png")
        pix.save(img_path)
        
        # 获取页面尺寸 (points)
        rect = page.rect
        images.append((page_num + 1, img_path, rect.width, rect.height))
    
    doc.close()
    return images

def parse_pp_structure_result(result: List[Dict], page_index: int, page_width: float, page_height: float) -> List[Dict]:
    """
    转换 PP-Structure 结果为标准格式
    """
    elements = []
    
    for idx, item in enumerate(result):
        bbox_orig = item.get('bbox', [0, 0, 0, 0])
        item_type = item.get('type', 'text')
        
        # 坐标归一化到 PDF 点 (假设图片是 200 DPI 渲染的)
        scale = 72 / 200
        bbox = [
            bbox_orig[0] * scale,
            bbox_orig[1] * scale,
            bbox_orig[2] * scale,
            bbox_orig[3] * scale
        ]
        
        element = {
            'id': f'el_{page_index}_{idx}',
            'type': map_type(item_type),
            'bbox': bbox,
            'pageIndex': page_index,
        }
        
        # 提取内容
        if item_type == 'text':
            element['content'] = item.get('res', {}).get('text', '')
        elif item_type == 'title':
            element['content'] = item.get('res', {}).get('text', '')
            element['type'] = 'text'
        elif item_type == 'figure':
            element['type'] = 'image'
            element['caption'] = item.get('res', {}).get('text', '')
        elif item_type == 'table':
            element['type'] = 'table'
            # 表格内容可以是 HTML 或结构化数据
            element['content'] = str(item.get('res', ''))
        
        elements.append(element)
    
    return elements

def map_type(pp_type: str) -> str:
    """映射 PP-Structure 类型到应用类型"""
    type_map = {
        'text': 'text',
        'title': 'text',
        'figure': 'image',
        'table': 'table',
        'equation': 'equation',
    }
    return type_map.get(pp_type, 'text')

@app.route('/parse', methods=['POST'])
def parse_pdf():
    """
    解析 PDF 文件
    
    请求参数：
    {
        "pdf_path": "/path/to/file.pdf",
        "layout_analysis": true,
        "table_recognition": true,
        "ocr_engine": "paddleocr"
    }
    
    返回：
    {
        "structure": {
            "pageCount": 1,
            "pages": [...]
        }
    }
    """
    try:
        data = request.json
        pdf_path = data.get('pdf_path')
        
        if not pdf_path or not os.path.exists(pdf_path):
            return jsonify({'error': 'PDF file not found'}), 404
        
        # 转换 PDF 为图片
        images = pdf_to_images(pdf_path)
        
        # 解析每一页
        pages = []
        for page_index, img_path, width, height in images:
            # 使用 PP-Structure 分析
            result = pp_structure(img_path)
            
            # 转换结果
            blocks = parse_pp_structure_result(result, page_index, width, height)
            
            pages.append({
                'pageIndex': page_index,
                'width': width,
                'height': height,
                'blocks': blocks
            })
            
            # 清理临时图片
            if os.path.exists(img_path):
                os.remove(img_path)
        
        structure = {
            'pageCount': len(pages),
            'pages': pages
        }
        
        return jsonify({'structure': structure})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok', 'backend': 'pp-structure'})

if __name__ == '__main__':
    print("PP-Structure PDF 解析服务启动")
    print("API 地址: http://localhost:8080")
    app.run(host='0.0.0.0', port=8080, debug=True)
