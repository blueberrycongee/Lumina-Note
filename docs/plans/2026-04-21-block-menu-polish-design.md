# BlockMenu UI/UX 打磨设计文档

## 背景

块编辑器左侧统一菜单系统已实现（4 个提交）。功能完整但视觉和交互质感需要全面打磨，目标是从"能用"到"好看且顺手"。

## 设计决策

### 图标策略

- 全部使用自定义 SVG 图标集，替代当前 emoji 和纯文字标签
- 每个菜单按钮有统一的 16×16 SVG 图标
- 图标语义：H1-H5 用层级横线、列表用对应符号、插入用直观图形

### 与 SlashMenu 的关系

- SlashMenu 保持现有风格不变
- BlockMenu 作为"浮层面板"刻意区分：更宽圆角 (rounded-xl)、更强阴影、backdrop-blur

## 手柄与入口视觉

- **六点手柄**：2×3 矩阵圆点，直径 2.5px，间距 3.5px；hover 时 opacity 0.35→0.8（120ms ease）
- **+ 按钮**：rounded-full 圆形，20×20；hover 时 scale(1.1) + 背景色过渡
- **出现时机**：100ms 延迟 + opacity 淡入，避免鼠标快速划过时闪屏
- **定位**：left: -24px，确保不同编辑器宽度下不被截断

## 菜单面板重设计

- **面板尺寸**：min-w-[200px]，p-1.5，rounded-xl，shadow-lg
- **背景**：backdrop-blur-sm bg-background/95
- **分组标题**：text-[11px] uppercase tracking-wider font-semibold
- **分组分隔**：h-px bg-border/50
- **格式按钮**：w-9 h-9 正方形网格排列（5 个/行），rounded-lg
  - hover：bg-accent/60
  - active：scale-0.95
  - 激活状态：ring-2 ring-primary/40 + bg-primary/10
- **管理按钮**：图标+文字横排，Delete 红色高亮
- **关闭动效**：点击菜单项后 80ms 淡出再关闭

## 动效与过渡

- **菜单弹出**：opacity 0→1 + translateY(6px→0) + scale(0.96→1)，150ms cubic-bezier(0.16, 1, 0.3, 1)
- **菜单关闭**：opacity 1→0，80ms
- **连续切换**：旧菜单先淡出 60ms，新菜单淡入 150ms
- **块类型转换反馈**：块背景闪烁 200ms（bg-primary/10 → transparent）

## 交互手感

- **菜单定位**：y 基于块顶部坐标，底部超出视口时智能向上翻转
- **关闭方式**：Escape、点击外部、点击菜单项、编辑器获得焦点/输入时自动关闭
- **空文档**：确保至少有一个 Paragraph 节点，+ 按钮始终可显

## 技术方案

- BlockMenu 拆分为 MenuSection、MenuButton 子组件
- 自定义 SVG 图标用独立 BlockIcon 组件封装
- 菜单面板样式用 Tailwind，手柄/动效用 CSS（globals.css）
- 优先用 Tailwind 工具类，全局样式仅在必要时添加

## 验收标准

- TypeScript `npx tsc --noEmit --pretty` 0 错误
- `npx vitest run src/editor/` 全部通过
- 菜单弹出有明显动效（不是瞬间出现）
- 按钮 hover/active 有明显视觉反馈
- 暗色模式下菜单样式正确
- 手柄出现不闪屏（有延迟+淡入）
- 整体视觉风格与编辑器其他组件协调

## 提交计划

1. **手柄与入口视觉**：修改 blockEditor.ts、globals.css
2. **菜单面板重设计**：重构 BlockMenu.tsx，引入 BlockIcon 组件
3. **动效与过渡**：CSS 动画、菜单弹出/关闭动效
4. **交互手感优化**：菜单定位、关闭逻辑、编辑器事件联动
