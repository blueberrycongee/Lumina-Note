//! Evaluator traits and implementations for assessing graph execution quality
//!
//! Provides a flexible framework for evaluating Agent outputs with both
//! rule-based and LLM-based evaluation strategies.

use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use serde_json::Value;

use crate::langgraph::metrics::RunMetrics;

/// Result of an evaluation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalResult {
    /// Overall score (0.0 - 1.0)
    pub score: f64,
    /// Whether the evaluation passed
    pub passed: bool,
    /// Individual metric scores
    pub metrics: HashMap<String, f64>,
    /// Human-readable feedback
    pub feedback: String,
    /// Detailed breakdown by criteria
    pub details: Vec<EvalDetail>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalDetail {
    pub criterion: String,
    pub score: f64,
    pub passed: bool,
    pub message: String,
}

impl EvalResult {
    pub fn passed(score: f64, feedback: impl Into<String>) -> Self {
        Self {
            score,
            passed: true,
            metrics: HashMap::new(),
            feedback: feedback.into(),
            details: Vec::new(),
        }
    }

    pub fn failed(score: f64, feedback: impl Into<String>) -> Self {
        Self {
            score,
            passed: false,
            metrics: HashMap::new(),
            feedback: feedback.into(),
            details: Vec::new(),
        }
    }

    pub fn with_metric(mut self, name: impl Into<String>, value: f64) -> Self {
        self.metrics.insert(name.into(), value);
        self
    }

    pub fn with_detail(mut self, detail: EvalDetail) -> Self {
        self.details.push(detail);
        self
    }
}

/// Context for evaluation - contains the execution trace and expected output
#[derive(Clone, Debug)]
pub struct EvalContext {
    /// The actual output from the graph
    pub output: Value,
    /// Expected output (if available)
    pub expected: Option<Value>,
    /// Run metrics
    pub metrics: RunMetrics,
    /// Test case name
    pub test_name: String,
    /// Test case input
    pub input: Value,
}

/// Trait for evaluators that assess graph execution quality
pub trait Evaluator: Send + Sync {
    /// Evaluate the execution
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult;

    /// Get evaluator name
    fn name(&self) -> &str;
}

// ============ Built-in Evaluators ============

/// Evaluates if the output exactly matches the expected value
pub struct ExactMatchEvaluator;

impl Evaluator for ExactMatchEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        match &ctx.expected {
            Some(expected) if &ctx.output == expected => {
                EvalResult::passed(1.0, "Output exactly matches expected")
            }
            Some(expected) => {
                EvalResult::failed(0.0, format!(
                    "Output does not match. Expected: {:?}, Got: {:?}",
                    expected, ctx.output
                ))
            }
            None => EvalResult::passed(0.5, "No expected output to compare")
        }
    }

    fn name(&self) -> &str {
        "exact_match"
    }
}

/// Evaluates if the output contains expected keywords
pub struct ContainsEvaluator {
    /// Keywords that should be present
    pub required: Vec<String>,
    /// Keywords that should NOT be present
    pub forbidden: Vec<String>,
    /// Case-sensitive matching
    pub case_sensitive: bool,
}

impl ContainsEvaluator {
    pub fn new(required: Vec<String>) -> Self {
        Self {
            required,
            forbidden: Vec::new(),
            case_sensitive: false,
        }
    }

    pub fn with_forbidden(mut self, forbidden: Vec<String>) -> Self {
        self.forbidden = forbidden;
        self
    }

    pub fn case_sensitive(mut self, case_sensitive: bool) -> Self {
        self.case_sensitive = case_sensitive;
        self
    }
}

impl Evaluator for ContainsEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        let output_str = ctx.output.to_string();
        let output_check = if self.case_sensitive {
            output_str.clone()
        } else {
            output_str.to_lowercase()
        };

        let mut details = Vec::new();
        let mut required_found = 0;
        let mut forbidden_found = Vec::new();

        // Check required keywords
        for keyword in &self.required {
            let keyword_check = if self.case_sensitive {
                keyword.clone()
            } else {
                keyword.to_lowercase()
            };

            let found = output_check.contains(&keyword_check);
            if found {
                required_found += 1;
            }
            details.push(EvalDetail {
                criterion: format!("contains '{}'", keyword),
                score: if found { 1.0 } else { 0.0 },
                passed: found,
                message: if found {
                    format!("Found '{}'", keyword)
                } else {
                    format!("Missing '{}'", keyword)
                },
            });
        }

        // Check forbidden keywords
        for keyword in &self.forbidden {
            let keyword_check = if self.case_sensitive {
                keyword.clone()
            } else {
                keyword.to_lowercase()
            };

            if output_check.contains(&keyword_check) {
                forbidden_found.push(keyword.clone());
                details.push(EvalDetail {
                    criterion: format!("not contains '{}'", keyword),
                    score: 0.0,
                    passed: false,
                    message: format!("Found forbidden keyword '{}'", keyword),
                });
            }
        }

        // Calculate score
        let required_score = if self.required.is_empty() {
            1.0
        } else {
            required_found as f64 / self.required.len() as f64
        };

        let forbidden_penalty = if self.forbidden.is_empty() {
            0.0
        } else {
            forbidden_found.len() as f64 / self.forbidden.len() as f64 * 0.5
        };

        let score = (required_score - forbidden_penalty).max(0.0);
        let passed = required_found == self.required.len() && forbidden_found.is_empty();

        let feedback = if passed {
            "All required keywords found, no forbidden keywords".to_string()
        } else {
            let mut msgs = Vec::new();
            if required_found < self.required.len() {
                msgs.push(format!("Missing {} required keywords", self.required.len() - required_found));
            }
            if !forbidden_found.is_empty() {
                msgs.push(format!("Found forbidden keywords: {:?}", forbidden_found));
            }
            msgs.join("; ")
        };

        EvalResult {
            score,
            passed,
            metrics: HashMap::from([
                ("required_found".to_string(), required_found as f64),
                ("required_total".to_string(), self.required.len() as f64),
                ("forbidden_found".to_string(), forbidden_found.len() as f64),
            ]),
            feedback,
            details,
        }
    }

    fn name(&self) -> &str {
        "contains"
    }
}

/// Evaluates if specific tools were called
pub struct ToolCallEvaluator {
    /// Tools that must be called
    pub required_tools: Vec<String>,
    /// Tools that should NOT be called
    pub forbidden_tools: Vec<String>,
    /// Expected call order (if strict_order is true)
    pub expected_order: Vec<String>,
    /// Whether to enforce call order
    pub strict_order: bool,
}

impl ToolCallEvaluator {
    pub fn new(required_tools: Vec<String>) -> Self {
        Self {
            required_tools,
            forbidden_tools: Vec::new(),
            expected_order: Vec::new(),
            strict_order: false,
        }
    }

    pub fn with_forbidden(mut self, tools: Vec<String>) -> Self {
        self.forbidden_tools = tools;
        self
    }

    pub fn with_order(mut self, order: Vec<String>) -> Self {
        self.expected_order = order;
        self.strict_order = true;
        self
    }
}

impl Evaluator for ToolCallEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        // Extract tool calls from execution path
        let executed_nodes: Vec<&str> = ctx.metrics.execution_path.iter()
            .map(|s| s.as_str())
            .collect();

        let mut details = Vec::new();
        let mut required_found = 0;
        let mut forbidden_found = Vec::new();

        // Check required tools
        for tool in &self.required_tools {
            let found = executed_nodes.iter().any(|n| n == tool);
            if found {
                required_found += 1;
            }
            details.push(EvalDetail {
                criterion: format!("called '{}'", tool),
                score: if found { 1.0 } else { 0.0 },
                passed: found,
                message: if found {
                    format!("Tool '{}' was called", tool)
                } else {
                    format!("Tool '{}' was NOT called", tool)
                },
            });
        }

        // Check forbidden tools
        for tool in &self.forbidden_tools {
            if executed_nodes.iter().any(|n| n == tool) {
                forbidden_found.push(tool.clone());
                details.push(EvalDetail {
                    criterion: format!("not called '{}'", tool),
                    score: 0.0,
                    passed: false,
                    message: format!("Forbidden tool '{}' was called", tool),
                });
            }
        }

        // Check order if required
        let order_correct = if self.strict_order && !self.expected_order.is_empty() {
            let mut order_idx = 0;
            for node in &executed_nodes {
                if order_idx < self.expected_order.len() && *node == self.expected_order[order_idx] {
                    order_idx += 1;
                }
            }
            let correct = order_idx == self.expected_order.len();
            details.push(EvalDetail {
                criterion: "call_order".to_string(),
                score: if correct { 1.0 } else { 0.0 },
                passed: correct,
                message: if correct {
                    "Tools called in expected order".to_string()
                } else {
                    format!("Expected order: {:?}, Got: {:?}", self.expected_order, executed_nodes)
                },
            });
            correct
        } else {
            true
        };

        // Calculate score
        let required_score = if self.required_tools.is_empty() {
            1.0
        } else {
            required_found as f64 / self.required_tools.len() as f64
        };

        let forbidden_penalty = if self.forbidden_tools.is_empty() {
            0.0
        } else {
            forbidden_found.len() as f64 / self.forbidden_tools.len() as f64 * 0.5
        };

        let order_factor = if order_correct { 1.0 } else { 0.8 };

        let score = ((required_score - forbidden_penalty) * order_factor).max(0.0);
        let passed = required_found == self.required_tools.len() 
            && forbidden_found.is_empty() 
            && order_correct;

        EvalResult {
            score,
            passed,
            metrics: HashMap::from([
                ("required_found".to_string(), required_found as f64),
                ("tools_called".to_string(), executed_nodes.len() as f64),
            ]),
            feedback: if passed {
                "All tool call requirements met".to_string()
            } else {
                "Tool call requirements not met".to_string()
            },
            details,
        }
    }

    fn name(&self) -> &str {
        "tool_calls"
    }
}

/// Evaluates latency against SLA thresholds
pub struct LatencyEvaluator {
    /// Maximum allowed latency in milliseconds
    pub max_latency_ms: u64,
    /// Target latency for full score
    pub target_latency_ms: u64,
}

impl LatencyEvaluator {
    pub fn new(max_latency_ms: u64) -> Self {
        Self {
            max_latency_ms,
            target_latency_ms: max_latency_ms / 2,
        }
    }

    pub fn with_target(mut self, target_ms: u64) -> Self {
        self.target_latency_ms = target_ms;
        self
    }
}

impl Evaluator for LatencyEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        let latency = ctx.metrics.total_latency_ms;
        
        let (score, passed) = if latency <= self.target_latency_ms {
            (1.0, true)
        } else if latency <= self.max_latency_ms {
            // Linear interpolation between target and max
            let ratio = (self.max_latency_ms - latency) as f64 
                / (self.max_latency_ms - self.target_latency_ms) as f64;
            (0.5 + ratio * 0.5, true)
        } else {
            // Over max latency
            let overage = (latency - self.max_latency_ms) as f64 / self.max_latency_ms as f64;
            ((0.5 - overage * 0.5).max(0.0), false)
        };

        EvalResult {
            score,
            passed,
            metrics: HashMap::from([
                ("latency_ms".to_string(), latency as f64),
                ("target_ms".to_string(), self.target_latency_ms as f64),
                ("max_ms".to_string(), self.max_latency_ms as f64),
            ]),
            feedback: format!(
                "Latency: {}ms (target: {}ms, max: {}ms)",
                latency, self.target_latency_ms, self.max_latency_ms
            ),
            details: vec![EvalDetail {
                criterion: "latency".to_string(),
                score,
                passed,
                message: if passed {
                    format!("Latency {}ms within limit", latency)
                } else {
                    format!("Latency {}ms exceeds max {}ms", latency, self.max_latency_ms)
                },
            }],
        }
    }

    fn name(&self) -> &str {
        "latency"
    }
}

/// Evaluates token usage against budget
pub struct TokenBudgetEvaluator {
    /// Maximum allowed tokens
    pub max_tokens: u32,
    /// Target tokens for full score
    pub target_tokens: u32,
}

impl TokenBudgetEvaluator {
    pub fn new(max_tokens: u32) -> Self {
        Self {
            max_tokens,
            target_tokens: max_tokens / 2,
        }
    }
}

impl Evaluator for TokenBudgetEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        let tokens = ctx.metrics.total_tokens;
        
        let (score, passed) = if tokens <= self.target_tokens {
            (1.0, true)
        } else if tokens <= self.max_tokens {
            let ratio = (self.max_tokens - tokens) as f64 
                / (self.max_tokens - self.target_tokens) as f64;
            (0.5 + ratio * 0.5, true)
        } else {
            let overage = (tokens - self.max_tokens) as f64 / self.max_tokens as f64;
            ((0.5 - overage * 0.5).max(0.0), false)
        };

        EvalResult {
            score,
            passed,
            metrics: HashMap::from([
                ("tokens_used".to_string(), tokens as f64),
                ("max_tokens".to_string(), self.max_tokens as f64),
            ]),
            feedback: format!(
                "Tokens: {} (target: {}, max: {})",
                tokens, self.target_tokens, self.max_tokens
            ),
            details: vec![],
        }
    }

    fn name(&self) -> &str {
        "token_budget"
    }
}

/// Combines multiple evaluators with weights
pub struct CompositeEvaluator {
    evaluators: Vec<(Box<dyn Evaluator>, f64)>, // (evaluator, weight)
}

impl CompositeEvaluator {
    pub fn new() -> Self {
        Self {
            evaluators: Vec::new(),
        }
    }

    pub fn add<E: Evaluator + 'static>(mut self, evaluator: E, weight: f64) -> Self {
        self.evaluators.push((Box::new(evaluator), weight));
        self
    }
}

impl Default for CompositeEvaluator {
    fn default() -> Self {
        Self::new()
    }
}

impl Evaluator for CompositeEvaluator {
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        if self.evaluators.is_empty() {
            return EvalResult::passed(1.0, "No evaluators configured");
        }

        let mut total_weight = 0.0;
        let mut weighted_score = 0.0;
        let mut all_passed = true;
        let mut all_details = Vec::new();
        let mut all_metrics = HashMap::new();
        let mut feedbacks = Vec::new();

        for (evaluator, weight) in &self.evaluators {
            let result = evaluator.evaluate(ctx);
            
            total_weight += weight;
            weighted_score += result.score * weight;
            all_passed = all_passed && result.passed;
            
            // Prefix metrics with evaluator name
            for (key, value) in result.metrics {
                all_metrics.insert(format!("{}_{}", evaluator.name(), key), value);
            }
            
            all_details.extend(result.details);
            feedbacks.push(format!("{}: {}", evaluator.name(), result.feedback));
        }

        let score = weighted_score / total_weight;

        EvalResult {
            score,
            passed: all_passed,
            metrics: all_metrics,
            feedback: feedbacks.join("\n"),
            details: all_details,
        }
    }

    fn name(&self) -> &str {
        "composite"
    }
}

/// Custom evaluator using a closure
pub struct CustomEvaluator<F>
where
    F: Fn(&EvalContext) -> EvalResult + Send + Sync,
{
    name: String,
    func: F,
}

impl<F> CustomEvaluator<F>
where
    F: Fn(&EvalContext) -> EvalResult + Send + Sync,
{
    pub fn new(name: impl Into<String>, func: F) -> Self {
        Self {
            name: name.into(),
            func,
        }
    }
}

impl<F> Evaluator for CustomEvaluator<F>
where
    F: Fn(&EvalContext) -> EvalResult + Send + Sync,
{
    fn evaluate(&self, ctx: &EvalContext) -> EvalResult {
        (self.func)(ctx)
    }

    fn name(&self) -> &str {
        &self.name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_context(output: Value, metrics: RunMetrics) -> EvalContext {
        EvalContext {
            output,
            expected: None,
            metrics,
            test_name: "test".to_string(),
            input: Value::Null,
        }
    }

    #[test]
    fn test_contains_evaluator() {
        let evaluator = ContainsEvaluator::new(vec!["hello".to_string(), "world".to_string()]);
        
        let mut metrics = RunMetrics::new("r1", "c1");
        metrics.mark_success();
        
        let ctx = EvalContext {
            output: Value::String("hello beautiful world".to_string()),
            expected: None,
            metrics,
            test_name: "test".to_string(),
            input: Value::Null,
        };

        let result = evaluator.evaluate(&ctx);
        assert!(result.passed);
        assert_eq!(result.score, 1.0);
    }

    #[test]
    fn test_latency_evaluator() {
        let evaluator = LatencyEvaluator::new(1000);
        
        let mut metrics = RunMetrics::new("r1", "c1");
        metrics.total_latency_ms = 500;
        metrics.mark_success();

        let ctx = make_test_context(Value::Null, metrics);
        let result = evaluator.evaluate(&ctx);
        
        assert!(result.passed);
        assert_eq!(result.score, 1.0);
    }

    #[test]
    fn test_composite_evaluator() {
        let evaluator = CompositeEvaluator::new()
            .add(ContainsEvaluator::new(vec!["test".to_string()]), 1.0)
            .add(LatencyEvaluator::new(1000), 1.0);

        let mut metrics = RunMetrics::new("r1", "c1");
        metrics.total_latency_ms = 500;
        metrics.mark_success();

        let ctx = EvalContext {
            output: Value::String("test output".to_string()),
            expected: None,
            metrics,
            test_name: "test".to_string(),
            input: Value::Null,
        };

        let result = evaluator.evaluate(&ctx);
        assert!(result.passed);
    }
}
