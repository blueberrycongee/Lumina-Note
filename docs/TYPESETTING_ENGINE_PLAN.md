# Lumina Note 自研排版引擎计划（WYSIWYG 打印目标）

目标：在 Lumina Note 内实现“纸张级排版 + AI 排版指令”，保证**同一台机器**上的预览与打印一致（WYSIWYG）。完成一个里程碑后，必须在此文档中标注已经完成。

## 背景与现有能力
- 本地优先 + Tauri 桌面应用
- AI Agent + RAG 语义检索
- Markdown 编辑器（CodeMirror）+ LaTeX/Mermaid/代码高亮
- 知识图谱、PDF 批注、数据库视图（表格/看板）、WebDAV 同步等

## 现有技术栈（选型约束）
- 框架：Tauri v2（Rust + WebView）
- 前端：React 18 + TypeScript + Vite + Tailwind CSS
- 编辑器：CodeMirror 6（Markdown）
- 状态管理：Zustand
- 数据层：SQLite
- PDF 相关：pdfjs-dist/react-pdf、jsPDF
- 测试：Vitest（单测）、Playwright core（端到端）

## 核心目标（MVP）
- 纸张级排版：A4/Letter、页边距、页眉页脚、分页、段落/字体精确控制。
- AI 排版指令：中文/英文分别指定字体与字号（如小四宋体 + Times New Roman）、行距、段落缩进等。
- 预览与打印一致：统一以 **PDF（嵌入字体）** 作为打印输出源。
- `.docx` 支持为“可编辑模式”，只覆盖常用子集（段落/标题/列表/表格/图片/页眉页脚）。
- 引擎需可抽离为独立项目，便于后续开源发布与复用。

## 非目标（明确不做）
- `.doc` 老格式
- 复杂 Word 特性：宏、修订、域、复杂脚注/尾注、浮动图文环绕、嵌套复杂表格等
- 跨平台 100% 一致（Word 自身也无法保证），只保证**同机预览=打印**

## 关键策略
- **确定性排版**：同一输入、同一字体、同一环境 → 输出版面一致。
- **字体可控**：允许使用系统字体，但优先提供开源替代与字体映射；打印一律使用 PDF 字体嵌入。
- **结构化排版指令**：AI 输出必须落到稳定的 JSON/DSL，再由引擎执行。

## PDF 输出与打印流程（明确）
- 预览：统一走同一套排版与 PDF 渲染管线，预览页面来自 PDF 渲染输出。
- 导出：生成唯一的嵌入字体 PDF，作为打印与交付基准。
- 打印：仅从导出的 PDF 打印，禁止直接从 DOM/Canvas 打印；默认关闭缩放。

---

## 默认技术栈（可修改，默认即执行）
> 为了让循环能无阻推进，先锁定默认技术路线。
- 最终决定（M0）：锁定以下默认技术栈；若需改动，必须在此节记录原因。
- 语言：Rust（核心排版引擎）+ TS/React（UI 预览）
- 字体与排版：HarfBuzz（shaping）rustybuzz/harfbuzz-rs 选一条成熟 binding
- 字体发现：font-kit 或系统 API（Windows DirectWrite / macOS CoreText / Linux fontconfig）
- PDF 输出：pdf-writer / lopdf（二选一，优先 pdf-writer）字体嵌入
- 渲染：Skia（skia-safe）或自研矢量渲染；默认先走 PDF 作为渲染基准

若需改动技术栈，先更新本节并记录原因。

---

## 目录结构草案（引擎可抽离）
```
engine/
  Cargo.toml
  src/
    model/            # 文档模型与样式
    text/             # 字体加载、shaping、断行
    layout/           # 段落布局、分页
    render/           # 渲染器与 PDF 输出
    io_docx/          # docx 子集导入导出
    ai/               # AI 指令解析与映射
  tests/
  fixtures/
  golden/
```

---

## 架构拆分（模块）
1) 文档模型（Document Model）
   - Block/Inline 树、样式继承、段落/字符样式
   - 操作模型（插入/删除/样式变更）+ 历史记录
2) 字体与文本引擎（Font + Text Shaping）
   - 字体加载/回退、字形度量
   - CJK + Latin 混排、行内断行规则
3) 排版引擎（Layout Engine）
   - 行内布局、段落布局、分页
   - 孤行/寡行控制、页眉页脚布局
4) 渲染与输出（Renderer + Export）
   - 分页预览渲染
   - PDF 导出（嵌入字体）
   - 打印路径使用 PDF 输出
5) AI 排版指令管线（AI → Layout Ops）
   - 自然语言 → 结构化 schema
   - 验证、归一化、应用到文档
6) 导入导出（Docx Subset IO）
   - `.docx` 子集导入、样式映射
   - `.docx` 子集导出（可编辑模式）

---

## AI 排版指令 Schema（草案）
> AI 不直接生成 CSS/HTML，只生成结构化指令，避免不确定性。

```json
{
  "page": { "size": "A4", "margin": "25mm", "headerHeight": "12mm" },
  "typography": {
    "zh": { "font": "SimSun", "size": "12pt" },
    "en": { "font": "Times New Roman", "size": "12pt" }
  },
  "paragraph": {
    "lineHeight": 1.6,
    "indent": "2em",
    "align": "justify"
  }
}
```

---

## AI 使用场景（优先级）
> 作为后续实现的优先级依据（从高到低）。

### P0：自然语言排版
- 用户 prompt：请按 A4 排版，中文小四宋体，英文 Times New Roman，行距 1.5，首行缩进 2 字符，标题 1 居中加粗 16pt，标题 2 左对齐 14pt，页眉“研究报告”，页脚居中页码。

### P0：智能分页修正
- 用户 prompt：请避免孤行/寡行，标题不落在页尾，图表与标题同页；如果需要，自动调整段前段后与行距微调。

### P1：批量规范化
- 用户 prompt：将当前文档所有正文统一为小四宋体，英文统一 Times New Roman；标题层级保持不变但字号分别改为一/二/三级 16/14/12pt，并两端对齐。

### P1：模板化报告生成
- 用户 prompt：按公司报告模板排版：页边距上 25mm 下 20mm 左右 25mm，页眉 12mm，页脚 12mm，正文两端对齐，标题分级与目录自动生成。

### P2：双语内容排版
- 用户 prompt：中文段落用宋体小四，英文段落用 Times New Roman 12pt，英文段落左对齐、中文两端对齐，章节标题中英文分行显示。

### P2：打印交付版
- 用户 prompt：生成可打印版本，输出为嵌入字体的 PDF，保持预览与打印一致。

---

## Docx 子集范围（MVP）
| 类别 | 支持 | 备注 |
|---|---|---|
| 段落 | ✅ | 对齐、缩进、行距、段前段后 |
| 标题 | ✅ | H1-H3 映射 |
| 字体 | ✅ | 中/英分别字体、字号、加粗/斜体 |
| 列表 | ✅ | 有序/无序 |
| 表格 | ✅ | 简单表格，不含复杂合并与跨页 |
| 图片 | ✅ | 行内/段落级 |
| 页眉页脚 | ✅ | 文本与页码 |
| 脚注/尾注 | ❌ | MVP 不做 |
| 修订/批注 | ❌ | MVP 不做 |

---

## 里程碑计划表（细化）

> 每个里程碑包含：Scope / Deliverables / How to verify / Expected outcome

| Milestone | Scope | Deliverables | How to verify | Expected outcome |
|---|---|---|---|---|
| M0: 目标与规范 | MVP 范围、非目标、输出策略 | 需求文档 + Schema 草案 + 字体策略草案 | 评审通过，形成冻结清单 | 目标与边界清晰 |
| M1: 文档模型 | Block/Inline 树、样式继承、操作模型 | Model + JSON 序列化格式 | 基本编辑 ops 可回放 | 文档结构稳定 |
| M2: 字体层 | 字体加载/回退/测量 | 字体管理器 + 回退表 | 字体缺失可提示且回退一致 | 字体可控 |
| M3: 行内排版 | 行内布局、断行规则、混排处理 | Line layout 引擎 | 基准文本行宽度一致 | 行内排版可用 |
| M4: 段落布局 | 段落缩进、对齐、行距 | Paragraph layout | 典型段落排版正确 | 段落排版可用 |
| M5: 分页 | 页边距、分页、页眉页脚 | Pagination engine | 同样输入分页稳定 | 分页可用 |
| M6: 预览渲染 | 分页预览视图、滚动 | Page viewer | 预览与布局一致 | 可视化预览完成 |
| M7: PDF 输出 | PDF 渲染与字体嵌入 | PDF exporter | 预览与 PDF 对齐 | 打印基础完成 |
| M8: 打印校准 | 打印边距/缩放策略 | 打印设置与校准指南 | 打印结果与预览一致 | 同机 WYSIWYG |
| M9: AI 排版 | AI 指令解析 + 应用 | Schema 验证 + 操作映射 | 指令可复现、可回滚 | AI 排版可用 |
| M10: Docx 导入 | `.docx` 子集解析 | Importer + 映射表 | 常见 docx 可导入 | 可编辑导入 |
| M11: Docx 导出 | `.docx` 子集导出 | Exporter + 兼容说明 | Word 打开可编辑 | 可编辑导出 |
| M12: 测试与性能 | golden PDFs + layout diff | 回归用例 + 性能指标 | CI 中可重复验证 | 工程稳定可迭代 |

---

## 里程碑任务拆分（可直接执行）
> 每个条目是“单次循环可完成”的最小任务单位。

### M0 目标与规范
- [x] 固化技术栈选择并在“默认技术栈”中标记最终决定
- [x] 明确 PDF 输出与打印流程（预览 -> PDF -> 打印）
- [x] 写出 WYSIWYG 验收阈值（像素/毫米）

### M1 文档模型
- [x] 定义文档树节点类型（Paragraph/Heading/List/Table/Image）
- [x] 定义样式结构（FontStyle/ParagraphStyle/PageStyle）
- [x] 设计最小 ops（insert/delete/applyStyle）
- [x] 确定序列化格式（JSON schema 草案）

### M2 字体层
- [x] 字体发现：列出系统字体 + fallback 规则
- [x] 字体加载：从路径加载并缓存度量
- [x] 字体映射表：中文/英文默认映射

### M3 行内排版
- [x] 集成 shaping，得到 glyph runs
- [x] 实现断行（按宽度折行）
- [x] 实现混排合并（CJK + Latin）

### M4 段落布局
- [x] 段落行距与对齐（左/右/居中/两端）
- [x] 首行缩进与段前段后

### M5 分页
- [x] Page model（纸张尺寸、边距、可用区）
- [x] 页眉页脚布局
- [x] 简单分页（按块流式切页）
- [x] 基础孤行/寡行处理（最小实现）

### M6 预览渲染
- [x] 渲染 pipeline：布局树 -> 预览页面
- [x] 基础缩放与分页浏览

### M7 PDF 输出
- [ ] PDF 文档生成
- [x] 字体嵌入与字体子集
- [ ] PDF 与预览对齐验证

### M8 打印校准
- [ ] 打印设置指南（禁用缩放、纸张匹配）
- [ ] 边距校准流程（记录设备偏差）

### M9 AI 排版
- [ ] 定义 AI schema 校验（zod）
- [ ] 解析自然语言 -> schema（最小规则）
- [ ] schema -> 样式应用到文档

### M10 Docx 导入
- [ ] 解析段落/标题/字体样式
- [ ] 解析列表、简单表格、图片
- [ ] 页眉页脚导入

### M11 Docx 导出
- [ ] 输出段落/标题/字体样式
- [ ] 输出列表、简单表格、图片
- [ ] 输出页眉页脚与页码

### M12 测试与性能
- [ ] golden fixture：短文档 / 长文档 / 双语文档
- [x] 布局 diff 工具（像素或布局指标）
- [x] 性能基准（分页耗时、PDF 生成耗时）

---

## WYSIWYG 打印验收标准（同机）
- 同一台机器、同一字体环境下：预览与 PDF 输出版面一致（尺寸/分页/行距误差 < 1px）。
- 打印使用 PDF 输出，关闭缩放（No scaling），打印结果与预览一致。
- 字体嵌入保证跨设备视觉一致（即使编辑性下降）。
- Acceptance thresholds (same machine, preview vs exported PDF):
- Page size delta <= 0.2mm (<= 1px @ 96dpi).
- Margin box delta <= 0.2mm; header/footer baseline delta <= 0.2mm.
- Line spacing delta <= 0.2mm; glyph baseline delta <= 1px.
- Page break positions identical; max drift <= 1px.

---

## 风险与注意事项
- 字体授权：商业字体不能随软件分发，只能使用系统安装或开源替代。
- Word 兼容：`.docx` 为可重排格式，编辑模式无法保证绝对一致。
- CJK 排版细节复杂：断行、标点挤压、字号映射需逐步迭代。

## M1 Document Model Draft (nodes + inline types)
- Document: { blocks: Block[] }
- Block: Paragraph | Heading | List | Table | Image
- Paragraph: { inlines: Inline[], style: ParagraphStyleRef? }
- Heading: { level: 1..6, inlines: Inline[], style: ParagraphStyleRef? }
- List: { ordered: boolean, items: ListItem[] }
- ListItem: { blocks: Block[] }
- Table: { rows: TableRow[] }
- TableRow: { cells: TableCell[] }
- TableCell: { blocks: Block[], row_span?: number, col_span?: number }
- Image: { src: string, alt?: string, width?: number, height?: number }

- Inline: Text | LineBreak | InlineCode | Emphasis | Strong | Link
- Text: { text: string, marks?: TextMark[] }
- TextMark: Bold | Italic | Underline | Strikethrough | Code
- Link: { href: string, inlines: Inline[] }

Notes:
- All nodes may carry optional `id` for ops and history tracking.
- Style refs are placeholders until `FontStyle`/`ParagraphStyle`/`PageStyle` are defined.

## M1 Style Struct Draft (FontStyle/ParagraphStyle/PageStyle)
- FontStyle: { id?: string, font_family: string, size_pt: number, weight: 100..900, italic: boolean, underline: boolean, color: "#RRGGBB" }
- ParagraphStyle: { id?: string, align: "left|right|center|justify", line_height: number, indent_first_line: string, space_before: string, space_after: string, keep_with_next: boolean, widows: number, orphans: number }
- PageStyle: { id?: string, size: "A4|Letter|Custom", width_mm?: number, height_mm?: number, margin_mm: { top: number, right: number, bottom: number, left: number }, header_height_mm: number, footer_height_mm: number, column_count: number, column_gap_mm: number }
Notes:
- Length fields use explicit units like "pt", "mm", or "em".
- ParagraphStyleRef/PageStyleRef point to these ids.

## M1 Minimal Ops Draft (insert/delete/applyStyle)
- Position: { block: number, inline: number, offset: number }
- Range: { anchor: Position, focus: Position }

- Op: InsertText | DeleteRange | ApplyInlineMarks | ApplyParagraphStyleRef
- InsertText: { pos: Position, text: string }
- DeleteRange: { range: Range }
- ApplyInlineMarks: { range: Range, add: TextMark[], remove: TextMark[] }
- ApplyParagraphStyleRef: { block: number, style_ref: string }

Notes:
- Positions address Document.blocks[block] and Paragraph/Heading inlines[inline]; offset is UTF-16 code unit index.
- Range order is normalized before applying ops; empty range is a no-op for delete.
- applyStyle is split for inline marks vs paragraph style refs; page style changes are out of scope for M1.

## M1 Serialization JSON Schema Draft
> Minimal, JSON-friendly schema to serialize the M1 document model. Discriminators use `type` for blocks/inlines.
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lumina-note/schema/document.v1.json",
  "title": "Lumina Document v1 (M1)",
  "type": "object",
  "required": ["blocks"],
  "properties": {
    "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } },
    "styles": {
      "type": "object",
      "properties": {
        "fonts": { "type": "array", "items": { "$ref": "#/$defs/fontStyle" } },
        "paragraphs": { "type": "array", "items": { "$ref": "#/$defs/paragraphStyle" } },
        "pages": { "type": "array", "items": { "$ref": "#/$defs/pageStyle" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "$defs": {
    "block": {
      "oneOf": [
        { "$ref": "#/$defs/paragraph" },
        { "$ref": "#/$defs/heading" },
        { "$ref": "#/$defs/list" },
        { "$ref": "#/$defs/table" },
        { "$ref": "#/$defs/image" }
      ]
    },
    "inline": {
      "oneOf": [
        { "$ref": "#/$defs/text" },
        { "$ref": "#/$defs/lineBreak" },
        { "$ref": "#/$defs/inlineCode" },
        { "$ref": "#/$defs/emphasis" },
        { "$ref": "#/$defs/strong" },
        { "$ref": "#/$defs/link" }
      ]
    },
    "paragraph": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "paragraph" },
        "id": { "type": "string" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } },
        "style_ref": { "type": "string" }
      },
      "additionalProperties": false
    },
    "heading": {
      "type": "object",
      "required": ["type", "level", "inlines"],
      "properties": {
        "type": { "const": "heading" },
        "id": { "type": "string" },
        "level": { "type": "integer", "minimum": 1, "maximum": 6 },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } },
        "style_ref": { "type": "string" }
      },
      "additionalProperties": false
    },
    "list": {
      "type": "object",
      "required": ["type", "ordered", "items"],
      "properties": {
        "type": { "const": "list" },
        "id": { "type": "string" },
        "ordered": { "type": "boolean" },
        "items": { "type": "array", "items": { "$ref": "#/$defs/listItem" } }
      },
      "additionalProperties": false
    },
    "listItem": {
      "type": "object",
      "required": ["blocks"],
      "properties": {
        "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } }
      },
      "additionalProperties": false
    },
    "table": {
      "type": "object",
      "required": ["type", "rows"],
      "properties": {
        "type": { "const": "table" },
        "id": { "type": "string" },
        "rows": { "type": "array", "items": { "$ref": "#/$defs/tableRow" } }
      },
      "additionalProperties": false
    },
    "tableRow": {
      "type": "object",
      "required": ["cells"],
      "properties": {
        "cells": { "type": "array", "items": { "$ref": "#/$defs/tableCell" } }
      },
      "additionalProperties": false
    },
    "tableCell": {
      "type": "object",
      "required": ["blocks"],
      "properties": {
        "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } },
        "row_span": { "type": "integer", "minimum": 1 },
        "col_span": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    },
    "image": {
      "type": "object",
      "required": ["type", "src"],
      "properties": {
        "type": { "const": "image" },
        "id": { "type": "string" },
        "src": { "type": "string" },
        "alt": { "type": "string" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "additionalProperties": false
    },
    "text": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "const": "text" },
        "text": { "type": "string" },
        "marks": { "type": "array", "items": { "$ref": "#/$defs/textMark" } }
      },
      "additionalProperties": false
    },
    "lineBreak": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "const": "line_break" }
      },
      "additionalProperties": false
    },
    "inlineCode": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "const": "inline_code" },
        "text": { "type": "string" }
      },
      "additionalProperties": false
    },
    "emphasis": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "emphasis" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "strong": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "strong" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "link": {
      "type": "object",
      "required": ["type", "href", "inlines"],
      "properties": {
        "type": { "const": "link" },
        "href": { "type": "string" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "textMark": {
      "type": "string",
      "enum": ["bold", "italic", "underline", "strikethrough", "code"]
    },
    "fontStyle": {
      "type": "object",
      "required": ["font_family", "size_pt", "weight", "italic", "underline", "color"],
      "properties": {
        "id": { "type": "string" },
        "font_family": { "type": "string" },
        "size_pt": { "type": "number" },
        "weight": { "type": "integer", "minimum": 100, "maximum": 900 },
        "italic": { "type": "boolean" },
        "underline": { "type": "boolean" },
        "color": { "type": "string", "pattern": "^#([0-9a-fA-F]{6})$" }
      },
      "additionalProperties": false
    },
    "paragraphStyle": {
      "type": "object",
      "required": ["align", "line_height", "indent_first_line", "space_before", "space_after", "keep_with_next", "widows", "orphans"],
      "properties": {
        "id": { "type": "string" },
        "align": { "type": "string", "enum": ["left", "right", "center", "justify"] },
        "line_height": { "type": "number" },
        "indent_first_line": { "type": "string" },
        "space_before": { "type": "string" },
        "space_after": { "type": "string" },
        "keep_with_next": { "type": "boolean" },
        "widows": { "type": "integer", "minimum": 0 },
        "orphans": { "type": "integer", "minimum": 0 }
      },
      "additionalProperties": false
    },
    "pageStyle": {
      "type": "object",
      "required": ["size", "margin_mm", "header_height_mm", "footer_height_mm", "column_count", "column_gap_mm"],
      "properties": {
        "id": { "type": "string" },
        "size": { "type": "string", "enum": ["A4", "Letter", "Custom"] },
        "width_mm": { "type": "number" },
        "height_mm": { "type": "number" },
        "margin_mm": {
          "type": "object",
          "required": ["top", "right", "bottom", "left"],
          "properties": {
            "top": { "type": "number" },
            "right": { "type": "number" },
            "bottom": { "type": "number" },
            "left": { "type": "number" }
          },
          "additionalProperties": false
        },
        "header_height_mm": { "type": "number" },
        "footer_height_mm": { "type": "number" },
        "column_count": { "type": "integer", "minimum": 1 },
        "column_gap_mm": { "type": "number" }
      },
      "additionalProperties": false
    }
  }
}
```

## M2 Font Discovery Draft (system list + fallback rules)
- Enumerate installed fonts via OS APIs (DirectWrite/CoreText/fontconfig); normalize family and style metadata.
- Build fallback chains per script (Latin, CJK, Symbol/Emoji); resolve per-glyph when shaping reports missing glyphs.
- Prefer user-selected fonts, then document styles, then system defaults, then open-source fallbacks (e.g., Noto Sans CJK, Noto Serif).
- Edge cases: missing CJK fonts, mixed-script runs, symbol-only glyphs, fallback loops; log chosen fallback in debug builds.
