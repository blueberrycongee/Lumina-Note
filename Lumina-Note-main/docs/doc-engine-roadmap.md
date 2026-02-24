# Doc 引擎替换/演进方案（尽可能一致）

## 目标与原则

- 目标：尽可能接近 OpenOffice 的渲染/排版结果，同时保持 AI 友好的可编辑性与前端实时预览。
- 单一真相：文档的结构/标记作为唯一数据源（Agent 直接操作结构）。
- 可用性优先：先把“可预览/可导出”做稳定，再逐步提升编辑体验。
- 渲染一致性：不追求与 Word 完全一致，但尽量贴近 OpenOffice 的版式。

## 当前引擎现状（代码/资源）

### 现有实现

- 前端：TypeScript（`src/typesetting/`）
  - docx 解析/构建：`docxImport.ts`, `docxExport.ts`, `docxPackage.ts`
  - 结构/文本处理：`docxText.ts`, `docxHtml.ts`, `docOps.ts`
  - 预览默认配置：`previewDefaults.ts`
  - 相关测试：`src/typesetting/*.test.ts`
- 前端 UI：`src/components/typesetting/TypesettingDocumentPane.tsx`
  - docx 打开、预览、简单编辑与导出
- 状态管理：`src/stores/useTypesettingDocStore.ts`
  - 负责 docx 读写、结构缓存与脏状态管理
- 后端（Tauri/Rust）：`src-tauri/src/typesetting/`
  - 字体/排版/分页/导出模块
  - 目前 typesetting 命令仍是占位实现：
    - `typesetting_export_pdf_base64` 使用 `write_empty_pdf`
    - `typesetting_layout_text` 标记为 placeholder

### 与 doc 工具相关资源

- doc 工具下载/检测：`src-tauri/src/doc_tools.rs`
  - 识别 `python`, `pandoc`, `soffice`, `pdftoppm` 等
  - 版本文件：`doc-tools-version.txt`

### third_party 参考资源

- `third_party/openoffice/`：Apache OpenOffice 源码（C++/Java）
- `third_party/collabora-online/`：Collabora Online（LibreOffice Online 体系）
- `third_party/collabora-code/`：Nextcloud 的内置 CODE 服务（更像部署包）

## 可参考仓库（渲染一致性角度）

- OpenOffice（本地源码）：`third_party/openoffice/`
  - 适合作为“渲染目标/行为参考”，但直接重写引擎成本极高
- Collabora Online（本地源码）：`third_party/collabora-online/`
  - 真实可用的“在线引擎”，可作为黑盒渲染/编辑引擎

## 技术栈概览

- 前端：React + TypeScript + Zustand
- 后端：Rust（Tauri）
- 文档格式：docx（OOXML）
- 可能外部依赖：OpenOffice/LibreOffice（用于渲染/转换）

## 大致行动路线（建议）

### Phase 1：目标清晰化与基线评估

- 明确“渲染一致性标准”：以 OpenOffice 为参照，定一组对比样例（段落、表格、图片、页眉页脚、分页）。
- 输出评估用例：挑选 10~20 个 docx 样例作为基线集。
- 基线样例目录：`tests/typesetting/samples/`（见 `manifest.json` 与生成脚本）。
- OpenOffice baseline 工具：`scripts/typesetting_baseline_batch.mjs`。
- Lumina baseline 工具：`scripts/typesetting_lumina_batch_export.mjs`。

### Phase 2：最短闭环（可用性优先）

- 利用 OpenOffice/soffice 做 docx → PDF/PNG 渲染，前端展示渲染结果。
- 目标：保证用户能看到“接近 OpenOffice 的效果”。
- 方案价值：不需要重写引擎，快速获得高一致性渲染。

### Phase 3：统一文档结构（AI 友好）

- 抽象内部 IR（结构树）：
  - block：标题/段落/列表/表格/图片/公式/分页/分节
  - inline：强调/链接/脚注
  - style：段落/字符样式
- 标记语言：先以 Markdown 超集为载体，后续扩展语法表达分页/样式。

### Phase 4：渐进替换与增强

- 在当前 `src/typesetting` 基础上，逐步用 IR 驱动编辑器。
- 将 docx 导出与渲染逐步对齐 OpenOffice 行为。
- 避免一次性替换所有链路，保持可运行与可回退。

## 关键风险与注意点

- 仅“参考源码重写”很难做到 100% 一致，渲染误差不可避免。
- 要做到“尽可能一致”，更现实的方法是复用 OpenOffice/Collabora 引擎做渲染输出。
- AI 编辑应直接操作 IR，而非直接改 DOM/渲染层。

## 下一步可执行事项

1) 选定对比样例集（10~20 个 docx）
2) 验证 OpenOffice 渲染链路（soffice headless → PDF/PNG）
3) 设计 IR schema（初版）
4) 确定标记语言超集语法（Markdown + 结构块扩展）
5) 制作“AI 操作指令集”（insert/replace/move/style）
