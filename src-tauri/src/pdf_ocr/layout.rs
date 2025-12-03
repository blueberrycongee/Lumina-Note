// 布局分析模块
// 分析文本块的层级结构（标题、段落、表格等）

use super::server::Block;

/// 布局类型
#[derive(Debug, Clone, PartialEq)]
pub enum LayoutType {
    Title,
    Text,
    Table,
    Figure,
    Equation,
    List,
    Header,
    Footer,
}

/// 布局分析器
pub struct LayoutAnalyzer {
    /// 标题字体大小阈值
    title_font_threshold: f32,
}

impl LayoutAnalyzer {
    pub fn new() -> Self {
        Self {
            title_font_threshold: 18.0,
        }
    }

    /// 分析文本块布局类型
    /// 基于规则的简单分析
    pub fn analyze(&self, blocks: &mut [Block], page_width: f32, page_height: f32) {
        for block in blocks.iter_mut() {
            let layout_type = self.classify_block(block, page_width, page_height);
            block.block_type = match layout_type {
                LayoutType::Title => "title".to_string(),
                LayoutType::Text => "text".to_string(),
                LayoutType::Table => "table".to_string(),
                LayoutType::Figure => "figure".to_string(),
                LayoutType::Equation => "equation".to_string(),
                LayoutType::List => "list".to_string(),
                LayoutType::Header => "header".to_string(),
                LayoutType::Footer => "footer".to_string(),
            };
        }
    }

    /// 基于启发式规则分类
    fn classify_block(&self, block: &Block, page_width: f32, page_height: f32) -> LayoutType {
        let bbox = &block.bbox;
        let content = block.content.as_deref().unwrap_or("");
        
        let _block_width = bbox[2] - bbox[0];
        let block_height = bbox[3] - bbox[1];
        let center_x = (bbox[0] + bbox[2]) / 2.0;
        
        // 1. 检查是否在页眉/页脚区域
        if bbox[1] < page_height * 0.08 {
            return LayoutType::Header;
        }
        if bbox[3] > page_height * 0.92 {
            return LayoutType::Footer;
        }
        
        // 2. 检查是否居中且较短（可能是标题）
        let is_centered = (center_x - page_width / 2.0).abs() < page_width * 0.1;
        let is_short = content.len() < 100;
        
        if is_centered && is_short && block_height > 15.0 {
            return LayoutType::Title;
        }
        
        // 3. 检查是否是列表
        if content.starts_with("•") 
            || content.starts_with("-") 
            || content.starts_with("*")
            || content.chars().next().map(|c| c.is_numeric()).unwrap_or(false) && content.contains(".")
        {
            return LayoutType::List;
        }
        
        // 4. 检查是否包含数学符号（简单判断）
        let math_chars = ['∫', '∑', '∏', '√', '∞', '≈', '≠', '≤', '≥', 'α', 'β', 'γ', 'δ'];
        if math_chars.iter().any(|c| content.contains(*c)) {
            return LayoutType::Equation;
        }
        
        // 5. 默认为文本
        LayoutType::Text
    }

    /// 合并相邻的同类型块
    pub fn merge_blocks(&self, blocks: Vec<Block>) -> Vec<Block> {
        if blocks.is_empty() {
            return blocks;
        }

        let mut merged = Vec::new();
        let mut current = blocks[0].clone();

        for block in blocks.into_iter().skip(1) {
            // 检查是否可以合并
            if self.should_merge(&current, &block) {
                // 合并内容
                if let (Some(curr_content), Some(block_content)) = 
                    (&mut current.content, &block.content) 
                {
                    curr_content.push('\n');
                    curr_content.push_str(block_content);
                }
                
                // 扩展边界框
                current.bbox[0] = current.bbox[0].min(block.bbox[0]);
                current.bbox[1] = current.bbox[1].min(block.bbox[1]);
                current.bbox[2] = current.bbox[2].max(block.bbox[2]);
                current.bbox[3] = current.bbox[3].max(block.bbox[3]);
            } else {
                merged.push(current);
                current = block;
            }
        }
        
        merged.push(current);
        merged
    }

    /// 判断两个块是否应该合并
    fn should_merge(&self, a: &Block, b: &Block) -> bool {
        // 同一页
        if a.page_index != b.page_index {
            return false;
        }
        
        // 同类型
        if a.block_type != b.block_type {
            return false;
        }
        
        // 垂直距离较近
        let vertical_gap = b.bbox[1] - a.bbox[3];
        if vertical_gap < 0.0 || vertical_gap > 20.0 {
            return false;
        }
        
        // 水平位置接近
        let h_overlap = (a.bbox[0] - b.bbox[0]).abs() < 50.0;
        
        h_overlap
    }
}

impl Default for LayoutAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layout_analyzer() {
        let analyzer = LayoutAnalyzer::new();
        
        let mut blocks = vec![
            Block {
                id: "1".to_string(),
                block_type: "text".to_string(),
                bbox: [100.0, 50.0, 500.0, 80.0],
                page_index: 1,
                content: Some("Chapter 1: Introduction".to_string()),
            },
        ];
        
        analyzer.analyze(&mut blocks, 600.0, 800.0);
        
        // 居中短文本应该被识别为标题
        assert_eq!(blocks[0].block_type, "title");
    }
}
