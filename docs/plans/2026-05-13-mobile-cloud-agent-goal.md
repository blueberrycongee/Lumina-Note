# 移动端与云端 Agent 文档 Goal 提示

状态：执行提示
日期：2026-05-13
目标文档：`docs/plans/2026-05-13-mobile-cloud-agent-direction.md`

## 用途

这份文档只用于开启 Codex `/goal` 时提供目标和边界，不是产品方向文档本身。

`/goal` 适合长程执行，但它不是待办列表。这里的提示要让模型持续完善目标文档，同时避免把产品范围扩成通用网盘、完整移动编辑器或小程序主客户端。

## 建议 Goal

```text
端到端完善 docs/plans/2026-05-13-mobile-cloud-agent-direction.md，使其成为一份可执行的中文产品方向文档。围绕 AI-first 移动端、云端 Markdown 知识 Agent、最低成本 Web/PWA 路线、废弃记录基准提交 21ba54052b698494538f74fa1bcd3660a8ecec45 下的 mobile/ 原生代码、小程序非主线、credit 商业模型、MVP 边界、技术复用、风险和开放问题展开。

执行过程中主动研究可参考产品和现有代码。凡是不涉及重大产品、商业、隐私或架构取舍的小决策，由模型自行判断并写入文档；需要用户决策的内容明确列为待确认问题。不要把第一阶段扩展到 PDF、Word、PPT、表格、图片 OCR 或任意文件理解。不要把移动端写成完整编辑器。不要把小程序写成主客户端。不要实际删除 mobile/ 代码。
```

## 输入材料

- `docs/plans/2026-05-13-mobile-cloud-agent-direction.md`
- `PRODUCT.md`
- `cloud/PRD.md`
- 记录基准提交 `21ba54052b698494538f74fa1bcd3660a8ecec45` 下的 `mobile/`
- 当前代码结构：`src/`、`electron/`、`server/`、`cloud/`
- 公开可验证的竞品和技术资料。

## 允许自主探索

- Obsidian、Notion、Logseq、Reflect、Tana、ChatGPT Projects/Knowledge 等产品的移动端、知识召回和云端知识空间设计。
- Web/PWA、Capacitor、小程序、原生客户端之间的成本和能力边界。
- Lumina 现有 React、TypeScript、Zustand、CodeMirror、cloud、server 能力中哪些可以复用。
- Markdown-only MVP 的最小功能集。
- 移动端信息架构、核心用户流和非目标。
- Agent credit、存储额度、索引额度的初步抽象。
- 文档结构、命名、章节顺序和表述方式。

## 禁止自主扩展

- 不把第一阶段扩展为 PDF、Word、PPT、表格、图片 OCR 或任意文件理解。
- 不把移动端定义成完整编辑器。
- 不把小程序定义成主客户端。
- 不推翻 local-first 桌面端定位。
- 不决定最终定价。
- 不决定隐私策略、数据留存策略或默认上传策略。
- 不删除 `mobile/` 代码。目标文档可以记录“可废弃”，实际删除必须单独执行。

## 完成标准

- 目标文档保持中文，能直接用于后续 PRD 或技术方案拆分。
- 明确说明移动端不是强编辑器，而是 AI-first 的 Markdown 知识召回与采集入口。
- 明确说明云端产品不是通用网盘，而是云端 Markdown 知识 Agent。
- 明确记录 `21ba54052b698494538f74fa1bcd3660a8ecec45` 下的 `mobile/` 原生代码可废弃。
- 明确列出 MVP、非目标、技术路线、商业模型、风险和待确认问题。
- 对竞品和技术路线的判断要有来源，或者清楚标注为推断。
- 重大未决问题必须留在“待确认问题”，不能替用户拍板。

## 完成审计

完成前检查：

- 是否还有不必要的英文段落。
- 是否误扩展到非 Markdown 场景。
- 是否把小程序或原生客户端写成主线。
- 是否缺少当前产品方向的核心判断。
- 是否把需要用户决策的问题直接写成结论。
- 是否保持产品文档和 goal 提示文档的职责分离。
