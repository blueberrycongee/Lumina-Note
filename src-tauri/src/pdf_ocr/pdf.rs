// PDF 渲染模块
// 将 PDF 页面渲染为图片

use image::DynamicImage;
use pdfium_render::prelude::*;
use std::path::Path;

pub struct PdfRenderer {
    pdfium: Pdfium,
}

pub struct PageImage {
    pub page_index: usize,
    pub image: DynamicImage,
    pub width: f32,
    pub height: f32,
}

impl PdfRenderer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // 尝试加载系统 PDFium 库
        // Windows: pdfium.dll
        // macOS: libpdfium.dylib
        // Linux: libpdfium.so
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
                .or_else(|_| Pdfium::bind_to_system_library())?,
        );
        
        Ok(Self { pdfium })
    }

    /// 渲染 PDF 所有页面为图片
    /// 返回: Vec<(page_index, image, width_pt, height_pt, scale_x, scale_y)>
    pub fn render_pages(
        &self,
        pdf_path: &str,
    ) -> Result<Vec<(usize, DynamicImage, f32, f32, f32, f32)>, Box<dyn std::error::Error>> {
        let document = self.pdfium.load_pdf_from_file(Path::new(pdf_path), None)?;
        let mut results = Vec::new();
        
        let render_config = PdfRenderConfig::new()
            .set_target_width(2000)  // 高分辨率渲染
            .set_maximum_height(4000);

        for (page_idx, page) in document.pages().iter().enumerate() {
            let page_index = page_idx + 1;
            
            // 获取页面尺寸 (points)
            let width_pt = page.width().value;
            let height_pt = page.height().value;
            
            // 渲染为图片
            let bitmap = page.render_with_config(&render_config)?;
            let image = bitmap.as_image();
            
            // 计算缩放比例 (像素 -> points)
            let (img_w, img_h) = (image.width() as f32, image.height() as f32);
            let scale_x = width_pt / img_w;
            let scale_y = height_pt / img_h;
            
            results.push((page_index, image, width_pt, height_pt, scale_x, scale_y));
        }
        
        Ok(results)
    }

    /// 渲染单页
    pub fn render_page(
        &self,
        pdf_path: &str,
        page_index: usize,
    ) -> Result<(DynamicImage, f32, f32), Box<dyn std::error::Error>> {
        let document = self.pdfium.load_pdf_from_file(Path::new(pdf_path), None)?;
        let page = document.pages().get((page_index - 1) as u16)?;
        
        let width = page.width().value;
        let height = page.height().value;
        
        let render_config = PdfRenderConfig::new()
            .set_target_width(2000)
            .set_maximum_height(4000);
        
        let bitmap = page.render_with_config(&render_config)?;
        let image = bitmap.as_image();
        
        Ok((image, width, height))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pdf_render() {
        // 需要 pdfium 库才能运行
        let renderer = PdfRenderer::new();
        assert!(renderer.is_ok());
    }
}
