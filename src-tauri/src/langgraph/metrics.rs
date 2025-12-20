//! Metrics collection for graph execution
//!
//! Provides detailed metrics for each node and overall execution,
//! enabling performance analysis and ablation studies.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};

/// Metrics for a single node execution
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeMetrics {
    /// Node name
    pub name: String,
    /// Number of times this node was called
    pub call_count: u32,
    /// Total execution time in milliseconds
    pub total_latency_ms: u64,
    /// Average execution time in milliseconds
    pub avg_latency_ms: f64,
    /// Total tokens used (if applicable)
    pub total_tokens: u32,
    /// Number of errors
    pub error_count: u32,
    /// Whether this node was skipped (masked)
    pub skipped: bool,
}

impl NodeMetrics {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            call_count: 0,
            total_latency_ms: 0,
            avg_latency_ms: 0.0,
            total_tokens: 0,
            error_count: 0,
            skipped: false,
        }
    }

    pub fn record_execution(&mut self, latency_ms: u64, tokens: u32) {
        self.call_count += 1;
        self.total_latency_ms += latency_ms;
        self.avg_latency_ms = self.total_latency_ms as f64 / self.call_count as f64;
        self.total_tokens += tokens;
    }

    pub fn record_error(&mut self) {
        self.error_count += 1;
    }

    pub fn mark_skipped(&mut self) {
        self.skipped = true;
    }
}

/// Metrics for a single graph execution run
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunMetrics {
    /// Unique run identifier
    pub run_id: String,
    /// Configuration hash for comparing different configs
    pub config_id: String,
    /// Total execution time in milliseconds
    pub total_latency_ms: u64,
    /// Total tokens used across all nodes
    pub total_tokens: u32,
    /// Whether the run completed successfully
    pub success: bool,
    /// Optional quality score (from evaluator)
    pub quality_score: Option<f64>,
    /// Per-node metrics
    pub node_metrics: HashMap<String, NodeMetrics>,
    /// Nodes that were masked (skipped) in this run
    pub masked_nodes: Vec<String>,
    /// Execution path (sequence of nodes executed)
    pub execution_path: Vec<String>,
    /// Error message if failed
    pub error: Option<String>,
    /// Timestamp when run started
    pub started_at: String,
}

impl RunMetrics {
    pub fn new(run_id: impl Into<String>, config_id: impl Into<String>) -> Self {
        Self {
            run_id: run_id.into(),
            config_id: config_id.into(),
            total_latency_ms: 0,
            total_tokens: 0,
            success: false,
            quality_score: None,
            node_metrics: HashMap::new(),
            masked_nodes: Vec::new(),
            execution_path: Vec::new(),
            error: None,
            started_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Record a node execution
    pub fn record_node(&mut self, node: &str, latency_ms: u64, tokens: u32) {
        self.execution_path.push(node.to_string());
        self.total_latency_ms += latency_ms;
        self.total_tokens += tokens;

        self.node_metrics
            .entry(node.to_string())
            .or_insert_with(|| NodeMetrics::new(node))
            .record_execution(latency_ms, tokens);
    }

    /// Record a node being skipped
    pub fn record_skip(&mut self, node: &str) {
        self.masked_nodes.push(node.to_string());
        self.node_metrics
            .entry(node.to_string())
            .or_insert_with(|| NodeMetrics::new(node))
            .mark_skipped();
    }

    /// Record a node error
    pub fn record_error(&mut self, node: &str, error: &str) {
        self.error = Some(format!("{}: {}", node, error));
        self.node_metrics
            .entry(node.to_string())
            .or_insert_with(|| NodeMetrics::new(node))
            .record_error();
    }

    /// Mark the run as successful
    pub fn mark_success(&mut self) {
        self.success = true;
    }

    /// Set quality score
    pub fn set_quality_score(&mut self, score: f64) {
        self.quality_score = Some(score);
    }
}

/// Thread-safe metrics collector for accumulating run metrics
#[derive(Clone, Default)]
pub struct MetricsCollector {
    runs: Arc<Mutex<Vec<RunMetrics>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            runs: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Add a run's metrics
    pub fn add_run(&self, metrics: RunMetrics) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.push(metrics);
        }
    }

    /// Get all collected run metrics
    pub fn get_runs(&self) -> Vec<RunMetrics> {
        self.runs.lock().map(|r| r.clone()).unwrap_or_default()
    }

    /// Get runs filtered by config_id
    pub fn get_runs_by_config(&self, config_id: &str) -> Vec<RunMetrics> {
        self.get_runs()
            .into_iter()
            .filter(|r| r.config_id == config_id)
            .collect()
    }

    /// Calculate aggregate statistics for a config
    pub fn aggregate_stats(&self, config_id: &str) -> AggregateStats {
        let runs = self.get_runs_by_config(config_id);
        AggregateStats::from_runs(&runs)
    }

    /// Clear all collected metrics
    pub fn clear(&self) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.clear();
        }
    }

    /// Get total number of runs
    pub fn run_count(&self) -> usize {
        self.runs.lock().map(|r| r.len()).unwrap_or(0)
    }
}

/// Aggregate statistics across multiple runs
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AggregateStats {
    /// Configuration identifier
    pub config_id: String,
    /// Number of runs
    pub run_count: usize,
    /// Success rate (0.0 - 1.0)
    pub success_rate: f64,
    /// Average latency in milliseconds
    pub avg_latency_ms: f64,
    /// P50 latency
    pub p50_latency_ms: u64,
    /// P95 latency
    pub p95_latency_ms: u64,
    /// Average tokens used
    pub avg_tokens: f64,
    /// Average quality score (if available)
    pub avg_quality_score: Option<f64>,
    /// Per-node aggregate stats
    pub node_stats: HashMap<String, NodeAggregateStats>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeAggregateStats {
    pub name: String,
    pub call_rate: f64,      // % of runs that called this node
    pub avg_latency_ms: f64,
    pub avg_tokens: f64,
    pub error_rate: f64,
    pub skip_rate: f64,      // % of runs that skipped this node
}

impl AggregateStats {
    pub fn from_runs(runs: &[RunMetrics]) -> Self {
        if runs.is_empty() {
            return Self::empty("");
        }

        let config_id = runs[0].config_id.clone();
        let run_count = runs.len();
        let success_count = runs.iter().filter(|r| r.success).count();
        let success_rate = success_count as f64 / run_count as f64;

        // Latency stats
        let mut latencies: Vec<u64> = runs.iter().map(|r| r.total_latency_ms).collect();
        latencies.sort();
        let avg_latency_ms = latencies.iter().sum::<u64>() as f64 / run_count as f64;
        let p50_latency_ms = latencies.get(run_count / 2).copied().unwrap_or(0);
        let p95_latency_ms = latencies.get(run_count * 95 / 100).copied().unwrap_or(0);

        // Token stats
        let avg_tokens = runs.iter().map(|r| r.total_tokens as f64).sum::<f64>() / run_count as f64;

        // Quality score
        let quality_scores: Vec<f64> = runs.iter()
            .filter_map(|r| r.quality_score)
            .collect();
        let avg_quality_score = if quality_scores.is_empty() {
            None
        } else {
            Some(quality_scores.iter().sum::<f64>() / quality_scores.len() as f64)
        };

        // Per-node stats
        let mut node_stats = HashMap::new();
        let mut all_nodes: std::collections::HashSet<String> = std::collections::HashSet::new();
        for run in runs {
            for node_name in run.node_metrics.keys() {
                all_nodes.insert(node_name.clone());
            }
        }

        for node_name in all_nodes {
            let mut call_count = 0;
            let mut total_latency = 0u64;
            let mut total_tokens = 0u32;
            let mut error_count = 0;
            let mut skip_count = 0;

            for run in runs {
                if let Some(nm) = run.node_metrics.get(&node_name) {
                    if nm.skipped {
                        skip_count += 1;
                    } else if nm.call_count > 0 {
                        call_count += 1;
                        total_latency += nm.total_latency_ms;
                        total_tokens += nm.total_tokens;
                        error_count += nm.error_count as usize;
                    }
                }
            }

            node_stats.insert(node_name.clone(), NodeAggregateStats {
                name: node_name,
                call_rate: call_count as f64 / run_count as f64,
                avg_latency_ms: if call_count > 0 { total_latency as f64 / call_count as f64 } else { 0.0 },
                avg_tokens: if call_count > 0 { total_tokens as f64 / call_count as f64 } else { 0.0 },
                error_rate: if call_count > 0 { error_count as f64 / call_count as f64 } else { 0.0 },
                skip_rate: skip_count as f64 / run_count as f64,
            });
        }

        Self {
            config_id,
            run_count,
            success_rate,
            avg_latency_ms,
            p50_latency_ms,
            p95_latency_ms,
            avg_tokens,
            avg_quality_score,
            node_stats,
        }
    }

    fn empty(config_id: &str) -> Self {
        Self {
            config_id: config_id.to_string(),
            run_count: 0,
            success_rate: 0.0,
            avg_latency_ms: 0.0,
            p50_latency_ms: 0,
            p95_latency_ms: 0,
            avg_tokens: 0.0,
            avg_quality_score: None,
            node_stats: HashMap::new(),
        }
    }
}

/// Builder for tracking a single run's metrics
pub struct RunMetricsBuilder {
    metrics: RunMetrics,
    start_time: Instant,
    current_node_start: Option<Instant>,
    current_node: Option<String>,
}

impl RunMetricsBuilder {
    pub fn new(run_id: impl Into<String>, config_id: impl Into<String>) -> Self {
        Self {
            metrics: RunMetrics::new(run_id, config_id),
            start_time: Instant::now(),
            current_node_start: None,
            current_node: None,
        }
    }

    /// Start timing a node
    pub fn start_node(&mut self, node: &str) {
        self.current_node = Some(node.to_string());
        self.current_node_start = Some(Instant::now());
    }

    /// End timing and record node metrics
    pub fn end_node(&mut self, tokens: u32) {
        if let (Some(node), Some(start)) = (self.current_node.take(), self.current_node_start.take()) {
            let latency_ms = start.elapsed().as_millis() as u64;
            self.metrics.record_node(&node, latency_ms, tokens);
        }
    }

    /// Record that a node was skipped
    pub fn skip_node(&mut self, node: &str) {
        self.metrics.record_skip(node);
    }

    /// Record an error
    pub fn error(&mut self, node: &str, error: &str) {
        self.metrics.record_error(node, error);
    }

    /// Build the final metrics
    pub fn build(mut self, success: bool) -> RunMetrics {
        self.metrics.total_latency_ms = self.start_time.elapsed().as_millis() as u64;
        if success {
            self.metrics.mark_success();
        }
        self.metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_metrics() {
        let mut nm = NodeMetrics::new("test_node");
        nm.record_execution(100, 50);
        nm.record_execution(200, 100);
        
        assert_eq!(nm.call_count, 2);
        assert_eq!(nm.total_latency_ms, 300);
        assert_eq!(nm.avg_latency_ms, 150.0);
        assert_eq!(nm.total_tokens, 150);
    }

    #[test]
    fn test_run_metrics() {
        let mut rm = RunMetrics::new("run_1", "baseline");
        rm.record_node("node_a", 100, 50);
        rm.record_node("node_b", 200, 100);
        rm.mark_success();

        assert_eq!(rm.total_latency_ms, 300);
        assert_eq!(rm.total_tokens, 150);
        assert!(rm.success);
        assert_eq!(rm.execution_path, vec!["node_a", "node_b"]);
    }

    #[test]
    fn test_metrics_collector() {
        let collector = MetricsCollector::new();
        
        let mut run1 = RunMetrics::new("run_1", "config_a");
        run1.record_node("node_a", 100, 50);
        run1.mark_success();
        collector.add_run(run1);

        let mut run2 = RunMetrics::new("run_2", "config_a");
        run2.record_node("node_a", 200, 100);
        run2.mark_success();
        collector.add_run(run2);

        assert_eq!(collector.run_count(), 2);

        let stats = collector.aggregate_stats("config_a");
        assert_eq!(stats.run_count, 2);
        assert_eq!(stats.success_rate, 1.0);
        assert_eq!(stats.avg_latency_ms, 150.0);
    }
}
