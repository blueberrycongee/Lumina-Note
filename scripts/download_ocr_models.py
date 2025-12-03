"""
下载 PaddleOCR 模型并转换为 ONNX 格式

运行：python scripts/download_ocr_models.py
"""

import os
import urllib.request
import tarfile
import shutil
import subprocess
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "models")

# PaddleOCR v4 模型下载地址
MODELS = {
    "det": {
        "url": "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_infer.tar",
        "name": "ch_PP-OCRv4_det_infer",
    },
    "rec": {
        "url": "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
        "name": "ch_PP-OCRv4_rec_infer",
    },
}

DICT_URL = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt"


def download_file(url: str, dest: str):
    """下载文件"""
    print(f"下载: {url}")
    print(f"  -> {dest}")
    urllib.request.urlretrieve(url, dest)
    print("  完成!")


def extract_tar(tar_path: str, dest_dir: str):
    """解压 tar 文件"""
    print(f"解压: {tar_path}")
    with tarfile.open(tar_path, "r") as tar:
        tar.extractall(dest_dir)
    print("  完成!")


def convert_to_onnx(model_dir: str, output_path: str):
    """转换 PaddlePaddle 模型为 ONNX"""
    print(f"转换为 ONNX: {model_dir}")
    print(f"  -> {output_path}")
    
    try:
        import paddle2onnx
        
        model_file = os.path.join(model_dir, "inference.pdmodel")
        params_file = os.path.join(model_dir, "inference.pdiparams")
        
        # 使用 Python API 转换
        paddle2onnx.export(
            model_file,
            params_file,
            output_path,
            opset_version=11,
            enable_onnx_checker=True
        )
        
        print("  完成!")
        return True
    except Exception as e:
        print(f"  错误: {e}")
        return False


def main():
    # 创建目录
    os.makedirs(MODELS_DIR, exist_ok=True)
    temp_dir = os.path.join(MODELS_DIR, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    
    print("=" * 60)
    print("PaddleOCR 模型下载与转换工具")
    print("=" * 60)
    
    # 检查依赖
    print("\n检查依赖...")
    try:
        import paddle2onnx
        print("  paddle2onnx: OK")
    except ImportError:
        print("  paddle2onnx: 未安装")
        print("\n请先安装依赖:")
        print("  pip install paddle2onnx paddlepaddle")
        return
    
    # 下载并转换模型
    for model_type, info in MODELS.items():
        print(f"\n{'=' * 60}")
        print(f"处理 {model_type} 模型")
        print("=" * 60)
        
        tar_path = os.path.join(temp_dir, f"{info['name']}.tar")
        model_dir = os.path.join(temp_dir, info['name'])
        onnx_path = os.path.join(MODELS_DIR, f"{info['name']}.onnx")
        
        # 跳过已存在的模型
        if os.path.exists(onnx_path):
            print(f"  已存在: {onnx_path}")
            continue
        
        # 下载
        if not os.path.exists(tar_path):
            download_file(info['url'], tar_path)
        
        # 解压
        if not os.path.exists(model_dir):
            extract_tar(tar_path, temp_dir)
        
        # 转换
        convert_to_onnx(model_dir, onnx_path)
    
    # 下载字典
    print(f"\n{'=' * 60}")
    print("下载字符字典")
    print("=" * 60)
    
    dict_path = os.path.join(MODELS_DIR, "ppocr_keys_v1.txt")
    if not os.path.exists(dict_path):
        download_file(DICT_URL, dict_path)
    else:
        print(f"  已存在: {dict_path}")
    
    # 不清理临时文件（保留原始模型以便调试）
    # print(f"\n{'=' * 60}")
    # print("清理临时文件")
    # print("=" * 60)
    # shutil.rmtree(temp_dir, ignore_errors=True)
    # print("  完成!")
    
    # 总结
    print(f"\n{'=' * 60}")
    print("完成! 模型文件:")
    print("=" * 60)
    for f in os.listdir(MODELS_DIR):
        fpath = os.path.join(MODELS_DIR, f)
        size = os.path.getsize(fpath) / 1024 / 1024
        print(f"  {f}: {size:.1f} MB")
    
    print(f"\n模型目录: {MODELS_DIR}")


if __name__ == "__main__":
    main()
