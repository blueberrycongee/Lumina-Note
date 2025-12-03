// OCR 引擎模块
// 使用 ONNX Runtime 加载 PaddleOCR 模型

use image::{DynamicImage, GenericImageView};
use ndarray::{Array4, ArrayD, IxDyn};
use ort::execution_providers::{DirectMLExecutionProvider, ExecutionProvider};
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use std::path::Path;

/// OCR 识别结果
pub struct OcrResult {
    pub text: String,
    pub bbox: [f32; 4],  // [x1, y1, x2, y2]
    pub confidence: f32,
}

/// OCR 引擎
pub struct OcrEngine {
    /// 文本检测模型 (DBNet)
    det_session: Session,
    /// 检测模型输入名
    det_input_name: String,
    /// 文本识别模型 (CRNN)
    rec_session: Session,
    /// 识别模型输入名
    rec_input_name: String,
    /// 字符表
    char_dict: Vec<String>,
}

impl OcrEngine {
    /// 检测 DirectML 是否可用
    fn try_init_directml() -> bool {
        // 检查 DirectML 是否可用
        let provider = DirectMLExecutionProvider::default();
        match provider.is_available() {
            Ok(available) => {
                println!("[OCR] DirectML 可用性检查: {}", available);
                available
            }
            Err(e) => {
                println!("[OCR] DirectML 检查失败: {:?}", e);
                false
            }
        }
    }
    
    /// 初始化 OCR 引擎
    /// 需要以下模型文件：
    /// - models/ch_PP-OCRv4_det_infer.onnx (检测)
    /// - models/ch_PP-OCRv4_rec_infer.onnx (识别)
    /// - models/ppocr_keys_v1.txt (字典)
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let models_dir = Path::new("models");
        
        // 尝试使用 DirectML (GPU)，失败则回退到 CPU
        let use_gpu = Self::try_init_directml();
        if use_gpu {
            println!("[OCR] 使用 DirectML GPU 加速");
        } else {
            println!("[OCR] 使用 CPU 推理");
        }
        
        // 加载检测模型
        let mut det_builder = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?;
        if use_gpu {
            det_builder = det_builder.with_execution_providers([DirectMLExecutionProvider::default().build()])?;
        }
        let det_session = det_builder.commit_from_file(models_dir.join("ch_PP-OCRv4_det_infer.onnx"))?;
        
        // 获取检测模型输入名
        let det_input_name = det_session.inputs[0].name.clone();
        println!("[OCR] Detection model input: {}", det_input_name);
        println!("[OCR] Detection model outputs: {:?}", 
            det_session.outputs.iter().map(|o| &o.name).collect::<Vec<_>>());
        
        // 加载识别模型
        let mut rec_builder = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?;
        if use_gpu {
            rec_builder = rec_builder.with_execution_providers([DirectMLExecutionProvider::default().build()])?;
        }
        let rec_session = rec_builder.commit_from_file(models_dir.join("ch_PP-OCRv4_rec_infer.onnx"))?;
        
        // 获取识别模型输入名
        let rec_input_name = rec_session.inputs[0].name.clone();
        println!("[OCR] Recognition model input: {}", rec_input_name);
        println!("[OCR] Recognition model outputs: {:?}",
            rec_session.outputs.iter().map(|o| &o.name).collect::<Vec<_>>());
        
        // 加载字符字典
        // PaddleOCR 格式：字典文件每行一个字符，blank token 在模型输出的最后
        let dict_path = models_dir.join("ppocr_keys_v1.txt");
        let dict_content = std::fs::read_to_string(dict_path)?;
        let char_dict: Vec<String> = dict_content.lines().map(|s| s.to_string()).collect();
        println!("[OCR] Loaded {} characters", char_dict.len());
        
        Ok(Self {
            det_session,
            det_input_name,
            rec_session,
            rec_input_name,
            char_dict,
        })
    }

    /// 对图片进行 OCR 识别
    pub fn recognize(&mut self, image: &DynamicImage) -> Result<Vec<OcrResult>, Box<dyn std::error::Error>> {
        // 1. 文本检测
        let boxes = self.detect_text(image)?;
        
        if boxes.is_empty() {
            return Ok(Vec::new());
        }
        
        // 2. 对每个文本框进行识别
        let mut results = Vec::new();
        for bbox in boxes {
            // 裁剪文本区域
            let cropped = self.crop_text_region(image, &bbox);
            
            // 识别文本
            let (text, confidence) = self.recognize_text(&cropped)?;
            
            if !text.is_empty() && confidence > 0.5 {
                results.push(OcrResult {
                    text,
                    bbox,
                    confidence,
                });
            }
        }
        
        Ok(results)
    }

    /// 文本检测 (DBNet)
    fn detect_text(&mut self, image: &DynamicImage) -> Result<Vec<[f32; 4]>, Box<dyn std::error::Error>> {
        let (width, height) = image.dimensions();
        
        // 预处理：调整大小、归一化
        let resized = image.resize_exact(960, 960, image::imageops::FilterType::Lanczos3);
        let rgb = resized.to_rgb8();
        
        // 转换为 NCHW 格式
        // PaddleOCR: cv2 读取 BGR，但归一化参数是 RGB 顺序
        // 所以 channel 0 (B) 用 mean[2]=0.406, std[2]=0.225
        //      channel 1 (G) 用 mean[1]=0.456, std[1]=0.224
        //      channel 2 (R) 用 mean[0]=0.485, std[0]=0.229
        let mut input = Array4::<f32>::zeros((1, 3, 960, 960));
        for y in 0..960 {
            for x in 0..960 {
                let pixel = rgb.get_pixel(x, y);
                // pixel 是 RGB，转换为 BGR 并应用对应的归一化
                input[[0, 0, y as usize, x as usize]] = (pixel[2] as f32 / 255.0 - 0.406) / 0.225; // B with mean[2]
                input[[0, 1, y as usize, x as usize]] = (pixel[1] as f32 / 255.0 - 0.456) / 0.224; // G with mean[1]
                input[[0, 2, y as usize, x as usize]] = (pixel[0] as f32 / 255.0 - 0.485) / 0.229; // R with mean[0]
            }
        }
        
        // 推理 - ort 2.0 RC API: 先转换为 Tensor
        let input_tensor = Tensor::from_array(input)?;
        let inputs = ort::inputs![self.det_input_name.as_str() => input_tensor];
        
        // 先获取输出名（避免借用冲突）
        let output_name = self.det_session.outputs[0].name.clone();
        
        let outputs = self.det_session.run(inputs)?;
        let output_tensor = outputs[output_name.as_str()].try_extract_tensor::<f32>()?;
        let (shape, data) = output_tensor;
        
        // 转换为 ndarray 进行后处理
        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        let output = ArrayD::from_shape_vec(IxDyn(&dims), data.to_vec())?;
        
        // 释放 outputs 后再调用 self 方法
        drop(outputs);
        
        // 后处理：提取文本框
        let boxes = Self::post_process_detection_static(&output.view(), width, height)?;
        
        Ok(boxes)
    }

    /// 检测后处理 (静态方法)
    fn post_process_detection_static(
        output: &ndarray::ArrayView<f32, ndarray::IxDyn>,
        orig_width: u32,
        orig_height: u32,
    ) -> Result<Vec<[f32; 4]>, Box<dyn std::error::Error>> {
        // 简化实现：使用阈值二值化 + 连通域分析
        let mut boxes = Vec::new();
        
        // 获取概率图
        let prob_map = output.slice(ndarray::s![0, 0, .., ..]);
        let (h, w) = (prob_map.shape()[0], prob_map.shape()[1]);
        
        // 缩放比例
        let scale_x = orig_width as f32 / w as f32;
        let scale_y = orig_height as f32 / h as f32;
        
        // 阈值化
        let threshold = 0.3;
        let mut binary = vec![vec![false; w]; h];
        
        for y in 0..h {
            for x in 0..w {
                binary[y][x] = prob_map[[y, x]] > threshold;
            }
        }
        
        // 简化的连通域：找到所有矩形区域
        // 实际应该用更复杂的算法（如 cv2.findContours）
        let regions = Self::find_connected_regions_static(&binary, w, h);
        
        for (min_x, min_y, max_x, max_y) in regions {
            if max_x - min_x > 5 && max_y - min_y > 5 {
                boxes.push([
                    min_x as f32 * scale_x,
                    min_y as f32 * scale_y,
                    max_x as f32 * scale_x,
                    max_y as f32 * scale_y,
                ]);
            }
        }
        
        Ok(boxes)
    }

    /// 简化的连通域查找 (静态方法)
    fn find_connected_regions_static(binary: &[Vec<bool>], w: usize, h: usize) -> Vec<(usize, usize, usize, usize)> {
        let mut visited = vec![vec![false; w]; h];
        let mut regions = Vec::new();
        
        for y in 0..h {
            for x in 0..w {
                if binary[y][x] && !visited[y][x] {
                    // BFS 找连通区域
                    let (min_x, min_y, max_x, max_y) = Self::bfs_region_static(binary, &mut visited, x, y, w, h);
                    regions.push((min_x, min_y, max_x, max_y));
                }
            }
        }
        
        regions
    }

    fn bfs_region_static(
        binary: &[Vec<bool>],
        visited: &mut [Vec<bool>],
        start_x: usize,
        start_y: usize,
        w: usize,
        h: usize,
    ) -> (usize, usize, usize, usize) {
        let mut queue = vec![(start_x, start_y)];
        let mut min_x = start_x;
        let mut min_y = start_y;
        let mut max_x = start_x;
        let mut max_y = start_y;
        
        while let Some((x, y)) = queue.pop() {
            if x >= w || y >= h || visited[y][x] || !binary[y][x] {
                continue;
            }
            
            visited[y][x] = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
            
            // 8 邻域
            if x > 0 { queue.push((x - 1, y)); }
            if x + 1 < w { queue.push((x + 1, y)); }
            if y > 0 { queue.push((x, y - 1)); }
            if y + 1 < h { queue.push((x, y + 1)); }
        }
        
        (min_x, min_y, max_x, max_y)
    }

    /// 裁剪文本区域
    fn crop_text_region(&self, image: &DynamicImage, bbox: &[f32; 4]) -> DynamicImage {
        let x1 = bbox[0].max(0.0) as u32;
        let y1 = bbox[1].max(0.0) as u32;
        let x2 = bbox[2] as u32;
        let y2 = bbox[3] as u32;
        
        let width = x2.saturating_sub(x1).max(1);
        let height = y2.saturating_sub(y1).max(1);
        
        image.crop_imm(x1, y1, width, height)
    }

    /// 文本识别 (CRNN)
    fn recognize_text(&mut self, image: &DynamicImage) -> Result<(String, f32), Box<dyn std::error::Error>> {
        // 预处理：调整为固定高度 48，宽度按比例，然后 padding 到 320
        let (w, h) = image.dimensions();
        
        // Debug: 打印输入图像尺寸
        static DEBUG_SIZE: std::sync::Once = std::sync::Once::new();
        DEBUG_SIZE.call_once(|| {
            println!("[OCR Debug] 识别输入图像尺寸: {}x{}", w, h);
        });
        
        let new_h = 48u32;
        let max_w = 320u32;
        
        // 计算等比例缩放后的宽度
        let ratio = w as f32 / h as f32;
        let resized_w = ((new_h as f32 * ratio).ceil() as u32).min(max_w).max(1);
        
        let resized = image.resize_exact(resized_w, new_h, image::imageops::FilterType::Lanczos3);
        let rgb = resized.to_rgb8();
        
        // 转换为 NCHW，固定宽度 320
        // PaddleOCR: BGR 输入，(x/255 - 0.5) / 0.5 归一化
        // 填充值 0.0（归一化后的值）
        let mut input = Array4::<f32>::zeros((1, 3, 48, max_w as usize));
        for y in 0..48 {
            for x in 0..resized_w as usize {
                let pixel = rgb.get_pixel(x as u32, y as u32);
                // RGB -> BGR
                input[[0, 0, y as usize, x]] = (pixel[2] as f32 / 255.0 - 0.5) / 0.5; // B
                input[[0, 1, y as usize, x]] = (pixel[1] as f32 / 255.0 - 0.5) / 0.5; // G
                input[[0, 2, y as usize, x]] = (pixel[0] as f32 / 255.0 - 0.5) / 0.5; // R
            }
        }
        
        // 推理 - ort 2.0 RC API: 先转换为 Tensor
        let input_tensor = Tensor::from_array(input)?;
        let inputs = ort::inputs![self.rec_input_name.as_str() => input_tensor];
        
        // 先获取输出名（避免借用冲突）
        let output_name = self.rec_session.outputs[0].name.clone();
        
        let outputs = self.rec_session.run(inputs)?;
        let output_tensor = outputs[output_name.as_str()].try_extract_tensor::<f32>()?;
        let (shape, data) = output_tensor;
        
        // 转换为 ndarray 进行后处理
        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        let output = ArrayD::from_shape_vec(IxDyn(&dims), data.to_vec())?;
        
        // 释放 outputs 后再调用 self 方法
        drop(outputs);
        
        // CTC 解码
        let (text, confidence) = Self::ctc_decode_static(&self.char_dict, output.view())?;
        
        // Debug: 打印前几个识别结果
        static DEBUG_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let count = DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if count < 3 {
            println!("[OCR Debug] 识别结果 #{}: '{}' (conf: {:.2})", count, text, confidence);
        }
        
        Ok((text, confidence))
    }

    /// CTC 解码 (静态方法)
    fn ctc_decode_static(char_dict: &[String], output: ndarray::ArrayView<f32, ndarray::IxDyn>) -> Result<(String, f32), Box<dyn std::error::Error>> {
        let shape = output.shape();
        let time_steps = shape[1];
        let num_classes = shape[2];
        
        // Debug: 打印形状信息
        static DEBUG_ONCE: std::sync::Once = std::sync::Once::new();
        DEBUG_ONCE.call_once(|| {
            println!("[OCR Debug] output shape: {:?}, num_classes: {}, char_dict len: {}", shape, num_classes, char_dict.len());
            if !char_dict.is_empty() {
                println!("[OCR Debug] char_dict[0..5]: {:?}", &char_dict[0..5.min(char_dict.len())]);
            }
        });
        
        let mut text = String::new();
        let mut confidences = Vec::new();
        let mut prev_class = 0usize; // 用于去重，初始化为 blank (class 0)
        
        for t in 0..time_steps {
            let mut max_prob = f32::NEG_INFINITY;
            let mut max_class = 0;
            
            for c in 0..num_classes {
                let prob = output[[0, t, c]];
                if prob > max_prob {
                    max_prob = prob;
                    max_class = c;
                }
            }
            
            // PaddleOCR CTC 解码规则:
            // - Class 0: blank token (CTC blank)
            // - Class 1 到 char_dict.len(): 字典字符 (class n -> char_dict[n-1])
            // 去除重复和 blank
            if max_class != 0 && max_class != prev_class {
                let char_idx = max_class - 1; // class 1 -> char_dict[0]
                if char_idx < char_dict.len() {
                    text.push_str(&char_dict[char_idx]);
                    confidences.push(max_prob);
                }
            }
            
            prev_class = max_class;
        }
        
        let avg_confidence = if confidences.is_empty() {
            0.0
        } else {
            confidences.iter().sum::<f32>() / confidences.len() as f32
        };
        
        Ok((text, avg_confidence))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ocr_engine_init() {
        // 需要模型文件才能运行
        // let engine = OcrEngine::new();
        // assert!(engine.is_ok());
    }
}
