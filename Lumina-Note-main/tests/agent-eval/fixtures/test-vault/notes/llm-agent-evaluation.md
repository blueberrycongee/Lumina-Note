# LLM Agent 评估方法论

## 背景

随着 LLM Agent 的兴起，如何评估 Agent 能力成为重要课题。

## 主流评估框架

### AgentBench

清华大学开源的评估框架，包含 8 个环境：
- 操作系统
- 数据库
- 知识图谱
- 数字卡牌游戏
- ...

### DeepEval

开源的 LLM 评估库，支持：
- ToolCorrectnessMetric
- TaskCompletionMetric
- 自定义指标

### T-Eval

专注于工具调用评估。

## 核心指标

### 任务完成度

```
Success Rate = 成功任务数 / 总任务数
```

### 工具调用指标

1. **Selection Accuracy** - 选择正确工具的比例
2. **Parameter Accuracy** - 参数正确的比例
3. **Execution Success** - 执行成功的比例

### 计划质量

- 逻辑性
- 完整性
- 效率性
- 可执行性

## 评估方法

### 规则评估

对比预期工具序列，计算准确率。

### LLM-as-Judge

使用 LLM 评判主观质量。

```python
JUDGE_PROMPT = """
请评估 Agent 的执行结果...
输出 JSON: { "score": 0-10, "reason": "..." }
"""
```

## 最佳实践

1. 定义清晰的成功标准
2. 分层评估（组件级 + 端到端）
3. 持续跟踪指标变化
4. 自动化测试流程

## TODO

- [ ] TODO: 实现 LLM-as-Judge
- [ ] TODO: 添加可视化报告
