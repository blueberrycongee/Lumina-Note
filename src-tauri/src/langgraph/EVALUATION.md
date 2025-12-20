# LangGraph Rust - 评估与消融实验

> 框架层提供的 Agent 评估和消融实验能力，用于分析节点贡献度和优化 Agent 性能。

## 功能概述

### 1. 指标收集 (Metrics)

自动收集每次执行的详细指标：

```rust
use langgraph::prelude::*;

// 启用指标收集
let config = ExecutionConfig::new()
    .with_config_id("baseline")
    .with_metrics();

let graph = build_agent_graph()?
    .with_config(config);

// 执行并获取指标
let result = graph.invoke_with_metrics(initial_state).await?;

if let Some(metrics) = result.metrics {
    println!("总延迟: {}ms", metrics.total_latency_ms);
    println!("总 Token: {}", metrics.total_tokens);
    println!("执行路径: {:?}", metrics.execution_path);
    
    for (node, nm) in &metrics.node_metrics {
        println!("{}: {}ms, {} 次调用", node, nm.total_latency_ms, nm.call_count);
    }
}
```

### 2. 节点掩码 (Node Masking)

跳过指定节点执行，用于消融实验：

```rust
// 跳过 planner 节点
let config = ExecutionConfig::new()
    .mask_node("planner")
    .with_config_id("no_planner")
    .with_metrics();

let graph = build_agent_graph()?
    .with_config(config);

// planner 节点会被跳过，直接执行下一个节点
let result = graph.invoke(state).await?;
```

### 3. 消融实验 (Ablation Study)

系统性分析每个节点的贡献度：

```rust
use langgraph::prelude::*;

// 1. 定义实验配置
let (configs, test_cases) = AblationStudyBuilder::new()
    .baseline()                                    // 完整图
    .mask_one("planner")                          // 无 planner
    .mask_one("researcher")                       // 无 researcher
    .mask_one("writer")                           // 无 writer
    .mask("minimal", vec!["planner", "researcher"]) // 最小化
    .test_case(TestCase::new("简单任务", json!({"query": "..."})))
    .test_case(TestCase::new("复杂任务", json!({"query": "..."})))
    .build();

// 2. 运行实验
let collector = Arc::new(MetricsCollector::new());

for config in &configs {
    let graph = build_agent_graph()?
        .with_config(ExecutionConfig::for_ablation(&config.config_id(), config.masked_nodes.clone()))
        .with_metrics_collector(collector.clone());
    
    for case in &test_cases {
        let state = create_state_from_input(&case.input);
        let _ = graph.invoke_with_metrics(state).await;
    }
}

// 3. 生成报告
let report = AblationReport::from_metrics(&collector, &configs);
println!("{}", report.to_markdown());
```

### 4. 评估器 (Evaluators)

内置多种评估器判断输出质量：

```rust
use langgraph::prelude::*;

// 组合评估器
let evaluator = CompositeEvaluator::new()
    .add(ContainsEvaluator::new(vec!["关键词1".into(), "关键词2".into()]), 1.0)
    .add(ToolCallEvaluator::new(vec!["search_notes".into()]), 1.0)
    .add(LatencyEvaluator::new(5000), 0.5)  // 最大 5 秒
    .add(TokenBudgetEvaluator::new(2000), 0.5);  // 最大 2000 tokens

// 评估
let ctx = EvalContext {
    output: result_value,
    expected: Some(expected_value),
    metrics: run_metrics,
    test_name: "test_1".into(),
    input: input_value,
};

let eval_result = evaluator.evaluate(&ctx);
println!("得分: {}", eval_result.score);
println!("通过: {}", eval_result.passed);
println!("反馈: {}", eval_result.feedback);
```

## 输出报告示例

```markdown
# Ablation Study Report

## Configuration Comparison
| Configuration | Latency Δ | Token Δ | Success Rate Δ | Assessment |
|---------------|-----------|---------|----------------|------------|
| without_planner | -33.0% | -33.0% | -4.0% | 💡 Potential optimization opportunity |
| without_researcher | -26.0% | -24.0% | -18.0% | ⛔ Significant quality degradation |
| minimal | -55.0% | -57.0% | -29.0% | ⛔ Significant quality degradation |

## Node Contribution Analysis
| Node | Latency % | Token % | Success Impact | Recommendation |
|------|-----------|---------|----------------|----------------|
| researcher | 35.0% | 38.0% | +18.0% | ✅ Keep |
| planner | 22.0% | 25.0% | +4.0% | 📝 Simplify |
| coordinator | 15.0% | 12.0% | +5.0% | ✅ Keep |

## Recommendations
- 💡 Configuration 'without_planner' reduces latency by 33.0% with minimal quality impact
- ⚡ Node 'researcher' uses 73.0% of resources but is critical - consider optimizing
- 📝 1 node(s) could be simplified for better efficiency
```

## 内置评估器

| 评估器 | 功能 |
|--------|------|
| `ExactMatchEvaluator` | 精确匹配预期输出 |
| `ContainsEvaluator` | 检查是否包含关键词 |
| `ToolCallEvaluator` | 验证工具调用正确性 |
| `LatencyEvaluator` | 延迟 SLA 检查 |
| `TokenBudgetEvaluator` | Token 预算检查 |
| `CompositeEvaluator` | 组合多个评估器 |
| `CustomEvaluator` | 自定义评估逻辑 |

## 节点推荐类型

| 推荐 | 说明 |
|------|------|
| `Keep` | 节点重要，保持现状 |
| `Simplify` | 节点有一定价值但成本较高，考虑简化 |
| `ConsiderRemoving` | 节点价值低但成本高，考虑移除 |
| `Optimize` | 节点价值高且成本高，需要优化 |
| `Unknown` | 数据不足，无法判断 |

## 文件结构

```
src-tauri/src/langgraph/
├── metrics.rs      # 指标收集（NodeMetrics, RunMetrics, MetricsCollector）
├── evaluator.rs    # 评估器（Evaluator trait, 内置评估器）
├── ablation.rs     # 消融实验（AblationConfig, AblationReport）
├── executor.rs     # 执行器（支持 masked_nodes, metrics）
└── mod.rs          # 模块导出
```

## 与 Python LangGraph 对比

| 功能 | Python LangGraph | langgraph-rust |
|------|------------------|----------------|
| 执行追踪 | ✅ LangSmith (SaaS) | ✅ 内置 |
| 节点掩码 | ❌ | ✅ 框架原生 |
| 消融实验 | ❌ | ✅ 一行代码 |
| 节点贡献度分析 | ❌ | ✅ 自动计算 |
| 离线分析 | ❌ | ✅ 本地 CLI |
| 评估框架 | ⚠️ 需 LangSmith | ✅ 内置 |
