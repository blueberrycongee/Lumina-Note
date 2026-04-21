# Block Editor 统一左侧交互菜单设计

## 背景

编辑器目前已有三套割裂的块交互系统：

1. **块级交互** (`blockEditor.ts`) — hover 六点手柄，拖拽排序，简陋右键菜单（仅 Duplicate/Delete）
2. **Slash 插入菜单** (`slashCommand.ts` + `SlashMenu.tsx`) — `/` 触发，支持标题/列表/代码块/callout/数学块/表格/图片/链接
3. **文本选区菜单** (`SelectionContextMenu.tsx`) — 选中文本右键，文本格式操作

三者没有统一命令模型和 UI 层。用户需要飞书/Notion 式的块左侧统一交互体验。

## 目标

- 块左侧有稳定出现的入口，不靠用户记 `/`
- 非空块 hover 时：六点手柄点击展开综合菜单（格式转换 + 块管理 + 插入）
- 空行/空段落 hover 时：手柄变为 `+` 按钮，点击展开插入菜单
- 菜单锚定在当前块左侧，不是浏览器默认右键菜单
- 保持 Markdown 作为底层存储
- 块拖拽排序保留
- Slash 菜单保留但底层走统一命令层
- 文本选区菜单完全保留（正交）

## 架构

### 统一命令层 (`blockOperations.ts`)

所有块操作走统一的 `executeBlockAction` 接口：

```ts
type BlockActionId =
  // 前缀型（替换行首前缀）
  | "heading1" | "heading2" | "heading3" | "heading4" | "heading5"
  | "bulletList" | "orderedList" | "blockquote" | "paragraph"
  // 插入型（替换整块内容或插入模板）
  | "codeBlock" | "callout" | "mathBlock" | "table" | "divider" | "image" | "link"
  // 块管理
  | "delete" | "duplicate" | "insertBefore" | "insertAfter";

function executeBlockAction(
  view: EditorView,
  block: BlockInfo,
  actionId: BlockActionId
): boolean;
```

前缀型操作沿用现有的 `TARGET_PREFIX` 映射逻辑。插入型操作清空当前块或空行，插入 Markdown 模板，光标定位到合适位置。

### 共享 UI 组件 (`BlockMenu.tsx`)

一个 React 组件通过 Portal 挂载到 `document.body`，支持两种模式：

- **综合模式**（非空块）：包含格式转换 + 块管理 + 插入操作
- **插入模式**（空行/ `+` 按钮）：只包含插入操作

菜单按类别分组渲染图标按钮，支持键盘导航（Tab/Enter/Escape）和搜索过滤。

### CodeMirror 扩展 (`blockEditor.ts`)

移除：
- `BlockFormatToolbar` — 被综合菜单替代
- `BlockMenuManager` — 被综合菜单替代
- `EmptyBlockPlaceholderWidget` — 空行直接显示 `+` 按钮，不再需要文字提示

保留：
- 六点手柄（`BlockHandleWidget`）的拖拽和单击选中行为
- 块装饰和 hover 状态管理

新增：
- 空行 hover 时，六点手柄变为 `+` 按钮（`PlusButtonWidget`）
- 点击六点手柄或 `+` 按钮 → dispatch CustomEvent，由 React 层响应

### 数据流

```
用户 hover 块
  → blockDecorationsPlugin 检测 hover
  → 更新 blockEditorStateField.hovered
  → buildDecorations:
      非空块 → BlockHandleWidget
      空行   → PlusButtonWidget

用户点击手柄/+
  → dispatch CustomEvent("lumina-block-menu", { from, to, mode })
  → React 层监听事件
  → BlockMenu 组件渲染（Portal → document.body）
  → 菜单定位到块左侧

用户点击菜单项
  → 调用 executeBlockAction(view, block, actionId)
  → blockOperations.ts 执行前缀替换或模板插入
  → dispatch changes → CodeMirror 更新 → 关闭菜单
```

## 菜单结构

### 综合菜单（非空块点击六点手柄）

```
┌──────────────────────────────────────────┐
│ [H1] [H2] [H3] [H4] [H5]                  │
│ [•]  [1.] [☑]  [❝]  [</>] [—]             │
│ ──────────────────────────────────────────│
│ ⬆ Insert above                           │
│ ──────────────────────────────────────────│
│ 🗑 Delete        │  📄 Duplicate           │
│ ⬇ Insert below                            │
└──────────────────────────────────────────┘
```

### 插入菜单（空行/ `+` 按钮）

```
┌──────────────────────────────────────────┐
│ Heading     │ [H1] [H2] [H3] [H4] [H5]   │
│ List        │ [•]  [1.] [☑]              │
│ Block       │ [❝]  [</>] [—]             │
│ Insert      │ [🔗] [🖼] [▦] [∑] [💡]     │
└──────────────────────────────────────────┘
```

## 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/editor/extensions/blockOperations.ts` | 扩展 | 新增 `executeBlockAction` 统一接口，新增插入型操作 |
| `src/editor/extensions/blockEditor.ts` | 重写 | 移除 BlockFormatToolbar、BlockMenuManager、EmptyBlockPlaceholderWidget；六点手柄添加 click 展开；空行变 `+` 按钮 |
| `src/editor/components/BlockMenu.tsx` | 新建 | 共享菜单组件，支持综合/插入两种模式 |
| `src/editor/CodeMirrorEditor.blockToolbar.test.tsx` | 更新 | 测试新交互：点击手柄弹出菜单、空行 `+` 按钮 |
| `src/styles/globals.css` | 添加 | 菜单和 `+` 按钮样式 |

## 边界情况

- **多行块**（表格、代码块）：菜单定位到第一行左侧，操作作用于整块
- **reading 模式**：不挂载 `blockEditorExtensions`，菜单不出现
- **键盘导航**：菜单弹出后 Tab 切换按钮，Enter 执行，Escape 关闭
- **菜单遮挡**：高度超出视口时向上偏移
- **Slash 菜单共存**：`/` 仍触发 SlashMenu，但底层命令可复用统一命令层
