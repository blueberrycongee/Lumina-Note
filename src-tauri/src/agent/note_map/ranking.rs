//! 笔记排序
//!
//! 基于引用关系对笔记进行重要性排序

use super::types::{NoteMeta, RankedNote};
use std::collections::HashMap;

/// 排序配置
pub struct RankingConfig {
    /// 当前讨论的笔记权重倍率
    pub current_note_multiplier: f64,
    /// 用户提到的笔记权重倍率
    pub mentioned_multiplier: f64,
    /// 入链权重（被引用越多越重要）
    pub inlink_weight: f64,
    /// 出链权重（引用别人的笔记）
    pub outlink_weight: f64,
}

impl Default for RankingConfig {
    fn default() -> Self {
        Self {
            current_note_multiplier: 50.0,
            mentioned_multiplier: 10.0,
            inlink_weight: 1.0,
            outlink_weight: 0.3,
        }
    }
}

/// 对笔记进行排序
///
/// # 参数
/// - `notes`: 所有笔记的元数据
/// - `current_notes`: 当前正在讨论/编辑的笔记路径
/// - `mentioned_notes`: 用户消息中提到的笔记名
/// - `config`: 排序配置
pub fn rank_notes(
    notes: &mut [NoteMeta],
    current_notes: &[String],
    mentioned_notes: &[String],
    config: &RankingConfig,
) -> Vec<RankedNote> {
    // 1. 构建笔记名到路径的映射
    let name_to_path: HashMap<String, &str> = notes
        .iter()
        .map(|n| {
            let name = std::path::Path::new(&n.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            (name.to_lowercase(), n.path.as_str())
        })
        .collect();

    // 2. 计算每个笔记的入链数量
    let mut inlink_counts: HashMap<String, usize> = HashMap::new();
    
    for note in notes.iter() {
        for link in &note.outlinks {
            // 尝试解析链接目标
            let target_name = link.to_note.to_lowercase();
            if let Some(target_path) = name_to_path.get(&target_name) {
                *inlink_counts.entry(target_path.to_string()).or_insert(0) += 1;
            }
        }
    }

    // 3. 更新入链计数
    for note in notes.iter_mut() {
        note.inlink_count = *inlink_counts.get(&note.path).unwrap_or(&0);
    }

    // 4. 计算每个笔记的分数
    let mut ranked: Vec<RankedNote> = notes
        .iter()
        .map(|note| {
            let mut score = 1.0;

            // 入链分数
            score += note.inlink_count as f64 * config.inlink_weight;

            // 出链分数
            score += note.outlinks.len() as f64 * config.outlink_weight;

            // 当前讨论的笔记加权
            if current_notes.iter().any(|p| p == &note.path) {
                score *= config.current_note_multiplier;
            }

            // 用户提到的笔记加权
            let note_name = std::path::Path::new(&note.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            if mentioned_notes.iter().any(|m| m.to_lowercase() == note_name) {
                score *= config.mentioned_multiplier;
            }

            RankedNote {
                meta: note.clone(),
                score,
            }
        })
        .collect();

    // 5. 按分数降序排序
    ranked.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    ranked
}

/// 从用户消息中提取可能的笔记名
pub fn extract_mentioned_notes(message: &str) -> Vec<String> {
    let mut mentions = Vec::new();
    
    // 1. 提取 [[wikilink]] 中的笔记名
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    for cap in re.captures_iter(message) {
        if let Some(m) = cap.get(1) {
            mentions.push(m.as_str().trim().to_string());
        }
    }
    
    // 2. 提取带 .md 后缀的文件名
    let md_re = regex::Regex::new(r"([a-zA-Z0-9_\-\u4e00-\u9fff]+)\.md").unwrap();
    for cap in md_re.captures_iter(message) {
        if let Some(m) = cap.get(1) {
            mentions.push(m.as_str().to_string());
        }
    }
    
    mentions
}

/// 简化版 PageRank（用于更精确的排序）
pub fn pagerank(
    notes: &[NoteMeta],
    damping: f64,
    iterations: usize,
) -> HashMap<String, f64> {
    let n = notes.len();
    if n == 0 {
        return HashMap::new();
    }

    // 初始化分数
    let initial_score = 1.0 / n as f64;
    let mut scores: HashMap<String, f64> = notes
        .iter()
        .map(|note| (note.path.clone(), initial_score))
        .collect();

    // 构建出链映射
    let name_to_path: HashMap<String, String> = notes
        .iter()
        .map(|n| {
            let name = std::path::Path::new(&n.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            (name, n.path.clone())
        })
        .collect();

    // 迭代计算
    for _ in 0..iterations {
        let mut new_scores: HashMap<String, f64> = notes
            .iter()
            .map(|note| (note.path.clone(), (1.0 - damping) / n as f64))
            .collect();

        for note in notes {
            let outlink_count = note.outlinks.len();
            if outlink_count == 0 {
                continue;
            }

            let contribution = damping * scores[&note.path] / outlink_count as f64;

            for link in &note.outlinks {
                let target_name = link.to_note.to_lowercase();
                if let Some(target_path) = name_to_path.get(&target_name) {
                    if let Some(score) = new_scores.get_mut(target_path) {
                        *score += contribution;
                    }
                }
            }
        }

        scores = new_scores;
    }

    scores
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_mentioned_notes() {
        let msg = "请看看 [[日记]] 和 notes.md 的内容";
        let mentions = extract_mentioned_notes(msg);
        assert!(mentions.contains(&"日记".to_string()));
        assert!(mentions.contains(&"notes".to_string()));
    }
}
