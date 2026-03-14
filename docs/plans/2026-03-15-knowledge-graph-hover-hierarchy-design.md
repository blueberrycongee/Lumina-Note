# 知识图谱 Hover 视觉层次优化设计

> **日期**: 2026-03-15
> **状态**: 待实施
> **涉及文件**: `src/components/effects/KnowledgeGraph.tsx`

---

## 1. 问题描述

当前知识图谱在 hover 节点时，视觉层次不足，用户无法快速区分以下三个层级：

1. **当前 hover 的节点** — 我在看什么？
2. **一级邻居（直接相连）** — 和它直接关联的笔记是哪些？
3. **二级邻居（邻居的邻居）** — 顺着关联还能延伸到哪里？

### 1.1 现状分析

当前代码 (`KnowledgeGraph.tsx:607-742`) 的 emphasis 系统只有两个有效层级：

```typescript
// 第 612 行
const target = isHovered || isSelected ? 1
             : isNeighbor ? 0.62
             : isCurrent && !hasSelection ? 0.2
             : 0;
```

| 状态 | emphasis | 视觉表现 |
|------|----------|---------|
| hover/选中节点 | 1.0 | 放大 14%，全透明度，有边框 |
| 直接邻居 | 0.62 | 略微放大，中等透明度 |
| **所有其他节点** | **0** | **统一淡化至近乎不可见** |

**核心缺陷**：

- **hover 节点的 label 不够醒目**：字号、颜色与邻居 label 几乎无差别，只靠透明度微调区分
- **没有二级邻居层**：直接邻居之外的所有节点被一视同仁地淡化，丢失了"次亲密"这一关键探索层
- **label 透明度梯度不够**：邻居 label alpha ~0.55，其余 ~0.12，缺乏中间过渡

---

## 2. 设计目标

hover 一个节点后，用户应能一眼识别出三个清晰的视觉圈层，由内而外递减：

```
[hover 节点] → [一级邻居] → [二级邻居] → [背景节点]
```

**不做的事情**：
- 不引入新的 UI 控件或面板
- 不改变现有的节点形状（文件夹刺球、文件圆形）
- 不改变点击/拖拽/选中等交互逻辑
- 不改变物理引擎或布局算法
- 不添加动画以外的新视觉元素（如光晕、粒子等）

---

## 3. 视觉层次设计

### 3.1 Emphasis 值与圈层定义

```typescript
const target = isHovered || isSelected ? 1.0    // 圈层 0: 焦点节点
             : isFirstDegree            ? 0.7    // 圈层 1: 一级邻居
             : isSecondDegree           ? 0.35   // 圈层 2: 二级邻居
             : 0;                                // 圈层 3: 背景节点
```

**二级邻居的计算方式**：遍历一级邻居的所有边，收集它们连接的节点（排除焦点节点自身和已在一级邻居集合中的节点）。

```typescript
const secondDegree = new Set<string>();
if (focusNodeId) {
  connectedToFocus.forEach((neighborId) => {
    edgesRef.current.forEach((edge) => {
      if (edge.source === neighborId && edge.target !== focusNodeId && !connectedToFocus.has(edge.target)) {
        secondDegree.add(edge.target);
      }
      if (edge.target === neighborId && edge.source !== focusNodeId && !connectedToFocus.has(edge.source)) {
        secondDegree.add(edge.source);
      }
    });
  });
}
```

### 3.2 各圈层视觉参数

#### 圈层 0: Hover 节点

| 属性 | 值 | 说明 |
|------|-----|------|
| emphasis | 1.0 | 最高优先级 |
| 节点半径 | `baseRadius * 1.18` | 比当前 1.14 再大一点 |
| 节点透明度 | 1.0 | 完全不透明 |
| 边框 | `2.5 / zoom`，颜色 `--foreground` | 加粗边框，明确圈定 |
| **label 字号** | **`Math.max(13, 15 / zoom)`（文件）/ `Math.max(14, 16 / zoom)`（文件夹）** | **比当前增大 2-3px** |
| **label 加粗** | **`font-weight: bold`** | **所有 hover 节点 label 加粗** |
| **label 透明度** | **1.0** | **完全不透明，始终可见** |
| **label 背景** | **半透明 `--background` 圆角矩形** | **防止与底层节点/边重叠时难以辨认** |

> label 背景的实现：在绘制文字前，先用 `ctx.measureText()` 测量文字宽度，绘制一个带圆角的半透明矩形作为衬底。

#### 圈层 1: 一级邻居

| 属性 | 值 | 说明 |
|------|-----|------|
| emphasis | 0.7 | 次高优先级 |
| 节点半径 | `baseRadius * 1.10` | 轻微放大 |
| 节点透明度 | 0.92 | 接近不透明 |
| 边框 | `1.8 / zoom`，颜色 `--foreground` | 清晰可见的边框 |
| label 字号 | 维持当前大小 | 不变 |
| label 加粗 | 否 | 不加粗，与 hover 节点区分 |
| label 透明度 | 0.85 | 清晰可读 |
| 连接边 | alpha 0.88，宽度 `2 / zoom` | 高亮显示与焦点节点的连线 |

#### 圈层 2: 二级邻居

| 属性 | 值 | 说明 |
|------|-----|------|
| emphasis | 0.35 | 中等优先级 |
| 节点半径 | `baseRadius * 1.0`（不放大） | 保持原始大小 |
| 节点透明度 | 0.55 | 半透明，可识别但不抢眼 |
| 边框 | 无 | 不绘制边框 |
| label 字号 | 维持当前大小 | 不变 |
| label 透明度 | 0.45 | 能看到但不突出 |
| 连接边 | alpha 0.35，宽度 `1.2 / zoom` | 淡化显示，暗示关联存在 |

#### 圈层 3: 背景节点

| 属性 | 值 | 说明 |
|------|-----|------|
| emphasis | 0 | 最低 |
| 节点半径 | `baseRadius` | 不变 |
| 节点透明度 | `1 - 0.82 * focusBlend`（≈0.18） | 大幅淡化 |
| 边框 | 无 | 不绘制 |
| label | 隐藏（alpha < 0.1 时不绘制） | 减少视觉噪音 |
| 连接边 | alpha ~0.08 | 几乎不可见，仅保留结构轮廓 |

### 3.3 连接边的圈层着色

边的视觉表现由其两端节点的最高 emphasis 决定：

| 边的类型 | 视觉表现 |
|---------|---------|
| 焦点 ↔ 一级邻居 | **高亮主色**，alpha 0.88，加粗 |
| 一级邻居 ↔ 二级邻居 | **中等亮度**，alpha 0.45，正常粗细 |
| 其他 | 大幅淡化，alpha ~0.08 |

### 3.4 Label 背景实现细节

仅对 **hover 节点** 绘制 label 背景衬底，避免视觉杂乱：

```typescript
// 伪代码
if (isHoveredOrSelected) {
  const text = node.label;
  const metrics = ctx.measureText(text);
  const padding = { x: 4 / zoom, y: 2 / zoom };
  const bgX = node.x - metrics.width / 2 - padding.x;
  const bgY = node.y + radius + 14 / zoom - fontSize + padding.y;  // label 位置偏移
  const bgW = metrics.width + padding.x * 2;
  const bgH = fontSize + padding.y * 2;

  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "hsl(var(--background))";
  // 绘制圆角矩形
  roundRect(ctx, bgX, bgY, bgW, bgH, 3 / zoom);
  ctx.fill();
}
```

---

## 4. 性能考量

### 4.1 二级邻居计算开销

- 二级邻居的计算需要在每帧遍历一级邻居的所有边
- 对于典型的知识库（几百个节点、几百条边），这个开销可以忽略
- 若未来节点数量超过 2000+，可考虑预构建邻接表缓存（当前阶段不需要）

### 4.2 渲染开销

- label 背景仅对 1 个 hover 节点绘制，不影响性能
- emphasis 插值逻辑增加一个层级，计算量可忽略

---

## 5. 原子化提交策略

每个提交必须是独立可验证、可回滚的最小变更单元。以下是推荐的提交顺序：

### Commit 1: 计算二级邻居集合

**范围**: 仅修改 `render` 函数中 `connectedToFocus` 相关逻辑

- 在现有的 `connectedToFocus` Set 之后，新增 `secondDegreeNeighbors` Set
- 遍历一级邻居的边，收集二级邻居
- 此提交不改变任何视觉效果，纯数据准备

**验证**: 可通过 `console.log` 临时验证集合内容正确

```
git commit -m "feat(knowledge-graph): compute second-degree neighbors on hover"
```

### Commit 2: 引入四级 emphasis 梯度

**范围**: 修改 emphasis target 计算（第 612 行附近）

- 将原有的三级 target（1 / 0.62 / 0）改为四级（1.0 / 0.7 / 0.35 / 0）
- 增加 `isSecondDegree` 判断条件

**验证**: hover 节点后，二级邻居应呈现比背景节点更亮、比一级邻居更暗的中间态

```
git commit -m "feat(knowledge-graph): add four-tier emphasis gradient for hover hierarchy"
```

### Commit 3: 优化 hover 节点 label 样式

**范围**: 修改节点 label 绘制逻辑（第 733-742 行附近）

- hover 节点的 label 加粗、加大字号
- 其他层级的 label 透明度按设计参数调整

**验证**: hover 节点的名字应明显比邻居节点更大更粗

```
git commit -m "feat(knowledge-graph): enhance hovered node label with bold and larger font"
```

### Commit 4: 为 hover 节点 label 添加背景衬底

**范围**: 在 label 绘制逻辑中增加背景矩形

- 使用 `ctx.measureText()` + 圆角矩形绘制半透明背景
- 仅对 hover/选中节点生效

**验证**: hover 节点的文字下方应出现半透明背景，文字在密集区域依然清晰可读

```
git commit -m "feat(knowledge-graph): add translucent background to hovered node label"
```

### Commit 5: 调整连接边的圈层着色

**范围**: 修改边的绘制逻辑（第 617-665 行附近）

- 根据边两端节点的最大 emphasis 值决定边的透明度和粗细
- 焦点↔一级高亮，一级↔二级中亮，其余淡化

**验证**: hover 后，连接线应呈现从亮到暗的层次过渡

```
git commit -m "feat(knowledge-graph): apply tiered edge styling based on neighbor degree"
```

### Commit 6: 微调参数与整体验收

**范围**: 根据实际视觉效果微调各层级的透明度、大小、颜色参数

- 在实际运行中验证整体视觉和谐
- 调整可能不合适的具体数值

**验证**: 完整的 hover 交互流程符合设计预期

```
git commit -m "refine(knowledge-graph): fine-tune hover hierarchy visual parameters"
```

---

## 6. 测试策略

### 6.1 单元测试

当前 `KnowledgeGraph.tsx` 的渲染逻辑基于 Canvas 2D，不适合传统 DOM 测试。可测试的部分：

- **二级邻居计算逻辑**: 如果将其抽取为纯函数，可以用 Vitest 测试给定的节点/边集合是否返回正确的二级邻居集合
- **emphasis 梯度计算**: 验证各状态组合下 target 值是否正确

### 6.2 手动验收

- [ ] hover 节点的 label 明显大于邻居节点
- [ ] hover 节点的 label 有半透明背景衬底
- [ ] 一级邻居清晰可见且有边框
- [ ] 二级邻居以中等透明度可见
- [ ] 背景节点大幅淡化
- [ ] 连接边呈现 3 级亮度梯度
- [ ] 移开 hover 后平滑过渡回默认状态
- [ ] 在节点密集区域 label 依然可读
- [ ] 无明显性能下降

---

## 7. 示意图

```
hover 前（所有节点平等）:

    O --- O --- O
    |           |
    O --- O --- O
          |
          O

hover 中心节点后（四级层次）:

    .     2     .          . = 背景（几乎不可见）
    :           :          2 = 二级邻居（半透明）
    1 --- [*] --- 1        1 = 一级邻居（清晰）
          :               [*] = hover 节点（加粗 label + 背景）
          2
```

---

## 8. 相关引用

- **现有代码**: `src/components/effects/KnowledgeGraph.tsx` 第 580-747 行（render 函数）
- **emphasis 系统**: 第 607-615 行（target 计算 + 插值）
- **边绘制**: 第 617-665 行
- **节点绘制**: 第 667-731 行
- **label 绘制**: 第 733-742 行
