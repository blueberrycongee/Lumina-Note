# Agent 评估系统

## 目录结构

```
tests/agent-eval/
├── README.md                 # 本文件
├── runner.ts                 # 评估运行器（主入口）
├── metrics/                  # 评估指标实现
│   ├── index.ts
│   ├── task-completion.ts    # 任务完成度
│   ├── tool-correctness.ts   # 工具调用正确性
│   └── plan-quality.ts       # 计划质量
├── cases/                    # 测试用例（YAML）
│   ├── basic.yaml            # 基础操作测试
│   ├── complex.yaml          # 复杂任务测试
│   ├── edge-cases.yaml       # 边界情况测试
│   └── regression.yaml       # 回归测试
├── fixtures/                 # 测试固件（模拟笔记库）
│   └── test-vault/
│       ├── note1.md
│       ├── note2.md
│       └── folder/
├── reports/                  # 评估报告输出
│   └── .gitkeep
└── types.ts                  # 类型定义
```

## 运行方式

```bash
# 运行全部测试
npm run test:agent-eval

# 运行特定类别
npm run test:agent-eval -- --category=basic

# 生成报告
npm run test:agent-eval -- --report
```

## 设计原则

1. **测试用例与代码分离** - YAML 定义用例，便于非开发人员添加
2. **可复现** - 使用固定的测试笔记库
3. **可扩展** - 易于添加新指标和测试类别
4. **CI 友好** - 可在 GitHub Actions 中运行
