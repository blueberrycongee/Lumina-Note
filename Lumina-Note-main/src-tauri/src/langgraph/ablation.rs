//! Ablation Study API for analyzing node contributions
//!
//! Provides tools for systematically evaluating the impact of individual
//! nodes by masking (disabling) them and comparing results.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::langgraph::metrics::{AggregateStats, MetricsCollector};

/// Configuration for an ablation experiment
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AblationConfig {
    /// Unique name for this configuration
    pub name: String,
    /// Nodes to mask (skip) in this configuration
    pub masked_nodes: HashSet<String>,
    /// Optional node overrides (replace with mock)
    pub overrides: HashMap<String, NodeOverride>,
    /// Whether this is the baseline configuration
    pub is_baseline: bool,
}

impl AblationConfig {
    /// Create a baseline configuration (no masking)
    pub fn baseline(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            masked_nodes: HashSet::new(),
            overrides: HashMap::new(),
            is_baseline: true,
        }
    }

    /// Create a configuration with specific nodes masked
    pub fn mask(name: impl Into<String>, nodes: Vec<&str>) -> Self {
        Self {
            name: name.into(),
            masked_nodes: nodes.into_iter().map(String::from).collect(),
            overrides: HashMap::new(),
            is_baseline: false,
        }
    }

    /// Create a configuration with a single node masked
    pub fn mask_one(name: impl Into<String>, node: &str) -> Self {
        Self::mask(name, vec![node])
    }

    /// Add a node override
    pub fn with_override(mut self, node: &str, override_type: NodeOverride) -> Self {
        self.overrides.insert(node.to_string(), override_type);
        self
    }

    /// Get a unique ID for this configuration (for metrics grouping)
    pub fn config_id(&self) -> String {
        if self.masked_nodes.is_empty() && self.overrides.is_empty() {
            "baseline".to_string()
        } else {
            let mut parts: Vec<String> = self.masked_nodes.iter().cloned().collect();
            parts.sort();
            format!("mask_{}", parts.join("_"))
        }
    }
}

/// How to override a node's behavior
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NodeOverride {
    /// Skip the node entirely, pass state through unchanged
    Skip,
    /// Replace output with a fixed value
    MockOutput(serde_json::Value),
    /// Replace output with a function result (serialized as string for config)
    MockFn(String),
}

/// A single test case for ablation study
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TestCase {
    /// Test case name
    pub name: String,
    /// Input for the test
    pub input: serde_json::Value,
    /// Expected output (optional, for quality scoring)
    pub expected: Option<serde_json::Value>,
    /// Expected tools/nodes to be called
    pub expected_nodes: Vec<String>,
    /// Maximum allowed latency in ms
    pub max_latency_ms: Option<u64>,
    /// Maximum allowed tokens
    pub max_tokens: Option<u32>,
}

impl TestCase {
    pub fn new(name: impl Into<String>, input: serde_json::Value) -> Self {
        Self {
            name: name.into(),
            input,
            expected: None,
            expected_nodes: Vec::new(),
            max_latency_ms: None,
            max_tokens: None,
        }
    }

    pub fn with_expected(mut self, expected: serde_json::Value) -> Self {
        self.expected = Some(expected);
        self
    }

    pub fn with_expected_nodes(mut self, nodes: Vec<&str>) -> Self {
        self.expected_nodes = nodes.into_iter().map(String::from).collect();
        self
    }

    pub fn with_max_latency(mut self, ms: u64) -> Self {
        self.max_latency_ms = Some(ms);
        self
    }

    pub fn with_max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = Some(tokens);
        self
    }
}

/// Results of an ablation study
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AblationReport {
    /// Statistics for each configuration
    pub configs: Vec<ConfigResult>,
    /// Comparison against baseline
    pub comparisons: Vec<ConfigComparison>,
    /// Node contribution analysis
    pub node_contributions: Vec<NodeContribution>,
    /// Recommendations based on the analysis
    pub recommendations: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigResult {
    pub config: AblationConfig,
    pub stats: AggregateStats,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigComparison {
    /// Configuration name
    pub config_name: String,
    /// Change in latency vs baseline (negative = faster)
    pub latency_delta_pct: f64,
    /// Change in token usage vs baseline (negative = fewer)
    pub token_delta_pct: f64,
    /// Change in success rate vs baseline
    pub success_rate_delta: f64,
    /// Change in quality score vs baseline
    pub quality_delta: Option<f64>,
    /// Overall assessment
    pub assessment: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeContribution {
    /// Node name
    pub node: String,
    /// Percentage of total latency attributed to this node
    pub latency_contribution_pct: f64,
    /// Percentage of total tokens attributed to this node
    pub token_contribution_pct: f64,
    /// Impact on success rate when removed
    pub success_rate_impact: f64,
    /// Impact on quality when removed
    pub quality_impact: Option<f64>,
    /// Overall importance score (0.0 - 1.0)
    pub importance_score: f64,
    /// Recommendation for this node
    pub recommendation: NodeRecommendation,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum NodeRecommendation {
    /// Node is critical, keep as-is
    Keep,
    /// Node has low ROI, consider simplifying
    Simplify,
    /// Node can potentially be removed
    ConsiderRemoving,
    /// Node should be optimized (high cost, high value)
    Optimize,
    /// Insufficient data to make recommendation
    Unknown,
}

impl AblationReport {
    /// Create a report from collected metrics
    pub fn from_metrics(collector: &MetricsCollector, configs: &[AblationConfig]) -> Self {
        let mut config_results = Vec::new();
        let mut baseline_stats: Option<AggregateStats> = None;

        // Collect stats for each config
        for config in configs {
            let stats = collector.aggregate_stats(&config.config_id());
            if config.is_baseline {
                baseline_stats = Some(stats.clone());
            }
            config_results.push(ConfigResult {
                config: config.clone(),
                stats,
            });
        }

        // Generate comparisons
        let comparisons = if let Some(ref baseline) = baseline_stats {
            config_results
                .iter()
                .filter(|r| !r.config.is_baseline)
                .map(|r| Self::compare_to_baseline(&r.stats, baseline, &r.config.name))
                .collect()
        } else {
            Vec::new()
        };

        // Analyze node contributions
        let node_contributions = if let Some(ref baseline) = baseline_stats {
            Self::analyze_node_contributions(baseline, &config_results)
        } else {
            Vec::new()
        };

        // Generate recommendations
        let recommendations = Self::generate_recommendations(&comparisons, &node_contributions);

        Self {
            configs: config_results,
            comparisons,
            node_contributions,
            recommendations,
        }
    }

    fn compare_to_baseline(
        stats: &AggregateStats,
        baseline: &AggregateStats,
        name: &str,
    ) -> ConfigComparison {
        let latency_delta_pct = if baseline.avg_latency_ms > 0.0 {
            ((stats.avg_latency_ms - baseline.avg_latency_ms) / baseline.avg_latency_ms) * 100.0
        } else {
            0.0
        };

        let token_delta_pct = if baseline.avg_tokens > 0.0 {
            ((stats.avg_tokens - baseline.avg_tokens) / baseline.avg_tokens) * 100.0
        } else {
            0.0
        };

        let success_rate_delta = stats.success_rate - baseline.success_rate;

        let quality_delta = match (stats.avg_quality_score, baseline.avg_quality_score) {
            (Some(s), Some(b)) => Some(s - b),
            _ => None,
        };

        // Generate assessment
        let assessment = if success_rate_delta < -0.1 {
            "⛔ Significant quality degradation".to_string()
        } else if success_rate_delta < -0.05 {
            "⚠️ Minor quality degradation".to_string()
        } else if latency_delta_pct < -20.0 && token_delta_pct < -20.0 {
            "✅ Strong candidate for simplification".to_string()
        } else if latency_delta_pct < -10.0 || token_delta_pct < -10.0 {
            "💡 Potential optimization opportunity".to_string()
        } else {
            "➡️ Minimal impact".to_string()
        };

        ConfigComparison {
            config_name: name.to_string(),
            latency_delta_pct,
            token_delta_pct,
            success_rate_delta,
            quality_delta,
            assessment,
        }
    }

    fn analyze_node_contributions(
        baseline: &AggregateStats,
        results: &[ConfigResult],
    ) -> Vec<NodeContribution> {
        let mut contributions = Vec::new();

        for (node_name, node_stats) in &baseline.node_stats {
            // Find the config where this node was masked
            let masked_result = results
                .iter()
                .find(|r| r.config.masked_nodes.contains(node_name));

            let (success_impact, quality_impact) = if let Some(masked) = masked_result {
                let success_impact = baseline.success_rate - masked.stats.success_rate;
                let quality_impact =
                    match (baseline.avg_quality_score, masked.stats.avg_quality_score) {
                        (Some(b), Some(m)) => Some(b - m),
                        _ => None,
                    };
                (success_impact, quality_impact)
            } else {
                (0.0, None)
            };

            // Calculate contribution percentages
            let latency_contribution = if baseline.avg_latency_ms > 0.0 {
                (node_stats.avg_latency_ms * node_stats.call_rate) / baseline.avg_latency_ms * 100.0
            } else {
                0.0
            };

            let token_contribution = if baseline.avg_tokens > 0.0 {
                (node_stats.avg_tokens * node_stats.call_rate) / baseline.avg_tokens * 100.0
            } else {
                0.0
            };

            // Calculate importance score
            // High importance = high impact on success/quality when removed
            // Low importance = low impact but high cost
            let importance =
                (success_impact.abs() * 2.0 + quality_impact.unwrap_or(0.0).abs()).min(1.0);

            // Generate recommendation
            let recommendation = Self::recommend_for_node(
                importance,
                latency_contribution,
                token_contribution,
                success_impact,
            );

            contributions.push(NodeContribution {
                node: node_name.clone(),
                latency_contribution_pct: latency_contribution,
                token_contribution_pct: token_contribution,
                success_rate_impact: success_impact,
                quality_impact,
                importance_score: importance,
                recommendation,
            });
        }

        // Sort by importance
        contributions.sort_by(|a, b| b.importance_score.partial_cmp(&a.importance_score).unwrap());

        contributions
    }

    fn recommend_for_node(
        _importance: f64,
        latency_pct: f64,
        token_pct: f64,
        success_impact: f64,
    ) -> NodeRecommendation {
        let cost = (latency_pct + token_pct) / 2.0;

        if success_impact > 0.1 {
            // Removing this node causes significant quality drop
            if cost > 30.0 {
                NodeRecommendation::Optimize // High value, high cost -> optimize
            } else {
                NodeRecommendation::Keep // High value, low cost -> keep
            }
        } else if success_impact > 0.02 {
            // Minor quality impact
            if cost > 25.0 {
                NodeRecommendation::Simplify // Some value, high cost -> simplify
            } else {
                NodeRecommendation::Keep
            }
        } else {
            // Minimal quality impact
            if cost > 15.0 {
                NodeRecommendation::ConsiderRemoving // Low value, high cost -> consider removing
            } else if cost > 5.0 {
                NodeRecommendation::Simplify
            } else {
                NodeRecommendation::Keep // Low cost anyway
            }
        }
    }

    fn generate_recommendations(
        comparisons: &[ConfigComparison],
        contributions: &[NodeContribution],
    ) -> Vec<String> {
        let mut recs = Vec::new();

        // Find best optimization opportunity
        if let Some(best) = comparisons
            .iter()
            .filter(|c| c.success_rate_delta > -0.05)
            .min_by(|a, b| {
                a.latency_delta_pct
                    .partial_cmp(&b.latency_delta_pct)
                    .unwrap()
            })
        {
            if best.latency_delta_pct < -15.0 {
                recs.push(format!(
                    "💡 Configuration '{}' reduces latency by {:.1}% with minimal quality impact",
                    best.config_name, -best.latency_delta_pct
                ));
            }
        }

        // Nodes to optimize
        for contrib in contributions
            .iter()
            .filter(|c| c.recommendation == NodeRecommendation::Optimize)
        {
            recs.push(format!(
                "⚡ Node '{}' uses {:.1}% of resources but is critical - consider optimizing",
                contrib.node,
                contrib.latency_contribution_pct + contrib.token_contribution_pct
            ));
        }

        // Nodes to consider removing
        for contrib in contributions
            .iter()
            .filter(|c| c.recommendation == NodeRecommendation::ConsiderRemoving)
        {
            recs.push(format!(
                "🗑️ Node '{}' uses {:.1}% of resources with low impact ({:.1}% success rate change)",
                contrib.node,
                contrib.latency_contribution_pct + contrib.token_contribution_pct,
                contrib.success_rate_impact * 100.0
            ));
        }

        // Nodes to simplify
        let simplify_count = contributions
            .iter()
            .filter(|c| c.recommendation == NodeRecommendation::Simplify)
            .count();
        if simplify_count > 0 {
            recs.push(format!(
                "📝 {} node(s) could be simplified for better efficiency",
                simplify_count
            ));
        }

        if recs.is_empty() {
            recs.push("✅ Current configuration appears well-optimized".to_string());
        }

        recs
    }

    /// Generate a markdown report
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        md.push_str("# Ablation Study Report\n\n");

        // Summary table
        md.push_str("## Configuration Comparison\n\n");
        md.push_str("| Configuration | Latency Δ | Token Δ | Success Rate Δ | Assessment |\n");
        md.push_str("|---------------|-----------|---------|----------------|------------|\n");

        for comp in &self.comparisons {
            md.push_str(&format!(
                "| {} | {:+.1}% | {:+.1}% | {:+.1}% | {} |\n",
                comp.config_name,
                comp.latency_delta_pct,
                comp.token_delta_pct,
                comp.success_rate_delta * 100.0,
                comp.assessment
            ));
        }

        // Node contributions
        md.push_str("\n## Node Contribution Analysis\n\n");
        md.push_str("| Node | Latency % | Token % | Success Impact | Recommendation |\n");
        md.push_str("|------|-----------|---------|----------------|----------------|\n");

        for contrib in &self.node_contributions {
            let rec_str = match contrib.recommendation {
                NodeRecommendation::Keep => "✅ Keep",
                NodeRecommendation::Simplify => "📝 Simplify",
                NodeRecommendation::ConsiderRemoving => "🗑️ Consider Removing",
                NodeRecommendation::Optimize => "⚡ Optimize",
                NodeRecommendation::Unknown => "❓ Unknown",
            };

            md.push_str(&format!(
                "| {} | {:.1}% | {:.1}% | {:+.1}% | {} |\n",
                contrib.node,
                contrib.latency_contribution_pct,
                contrib.token_contribution_pct,
                contrib.success_rate_impact * 100.0,
                rec_str
            ));
        }

        // Recommendations
        md.push_str("\n## Recommendations\n\n");
        for rec in &self.recommendations {
            md.push_str(&format!("- {}\n", rec));
        }

        md
    }

    /// Generate a JSON report
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

/// Builder for running ablation studies
pub struct AblationStudyBuilder {
    configs: Vec<AblationConfig>,
    test_cases: Vec<TestCase>,
}

impl AblationStudyBuilder {
    pub fn new() -> Self {
        Self {
            configs: Vec::new(),
            test_cases: Vec::new(),
        }
    }

    /// Add the baseline configuration
    pub fn baseline(mut self) -> Self {
        self.configs.push(AblationConfig::baseline("baseline"));
        self
    }

    /// Add a configuration with nodes masked
    pub fn mask(mut self, name: &str, nodes: Vec<&str>) -> Self {
        self.configs.push(AblationConfig::mask(name, nodes));
        self
    }

    /// Add a configuration masking a single node
    pub fn mask_one(mut self, node: &str) -> Self {
        let name = format!("without_{}", node);
        self.configs.push(AblationConfig::mask_one(name, node));
        self
    }

    /// Add configurations to mask each node individually
    pub fn mask_each(mut self, nodes: Vec<&str>) -> Self {
        for node in nodes {
            self.configs
                .push(AblationConfig::mask_one(format!("without_{}", node), node));
        }
        self
    }

    /// Add a test case
    pub fn test_case(mut self, case: TestCase) -> Self {
        self.test_cases.push(case);
        self
    }

    /// Add multiple test cases
    pub fn test_cases(mut self, cases: Vec<TestCase>) -> Self {
        self.test_cases.extend(cases);
        self
    }

    /// Get the configurations
    pub fn get_configs(&self) -> &[AblationConfig] {
        &self.configs
    }

    /// Get the test cases
    pub fn get_test_cases(&self) -> &[TestCase] {
        &self.test_cases
    }

    /// Build the study configuration
    pub fn build(self) -> (Vec<AblationConfig>, Vec<TestCase>) {
        (self.configs, self.test_cases)
    }
}

impl Default for AblationStudyBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ablation_config() {
        let baseline = AblationConfig::baseline("baseline");
        assert!(baseline.is_baseline);
        assert!(baseline.masked_nodes.is_empty());

        let masked = AblationConfig::mask("no_planner", vec!["planner"]);
        assert!(!masked.is_baseline);
        assert!(masked.masked_nodes.contains("planner"));
    }

    #[test]
    fn test_ablation_study_builder() {
        let (configs, _) = AblationStudyBuilder::new()
            .baseline()
            .mask_each(vec!["planner", "researcher", "writer"])
            .build();

        assert_eq!(configs.len(), 4); // baseline + 3 masked
        assert!(configs[0].is_baseline);
    }

    #[test]
    fn test_config_comparison() {
        let baseline = AggregateStats {
            config_id: "baseline".to_string(),
            run_count: 10,
            success_rate: 0.9,
            avg_latency_ms: 1000.0,
            p50_latency_ms: 900,
            p95_latency_ms: 1500,
            avg_tokens: 500.0,
            avg_quality_score: Some(0.85),
            node_stats: HashMap::new(),
        };

        let masked = AggregateStats {
            config_id: "no_planner".to_string(),
            run_count: 10,
            success_rate: 0.85,
            avg_latency_ms: 700.0,
            p50_latency_ms: 650,
            p95_latency_ms: 1000,
            avg_tokens: 350.0,
            avg_quality_score: Some(0.80),
            node_stats: HashMap::new(),
        };

        let comparison = AblationReport::compare_to_baseline(&masked, &baseline, "no_planner");

        assert!(comparison.latency_delta_pct < 0.0); // Faster
        assert!(comparison.token_delta_pct < 0.0); // Fewer tokens
        assert!(comparison.success_rate_delta < 0.0); // Lower success
    }
}
