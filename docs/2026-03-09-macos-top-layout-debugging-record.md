# macOS 顶部布局对齐排障记录（2026-03-09）

## 背景

本次排障聚焦于 **macOS 主窗口顶部布局**，目标不是继续修饰一条“假顶栏”，而是让窗口从最顶部就完成左右分区，并满足以下要求：

- 左侧顶栏和右侧顶栏在真实渲染结果上保持一致高度
- macOS 原生红黄绿按钮与左侧自定义按钮在左侧顶栏内上下居中
- 右侧顶部只有 `tabbar` 与按钮本体不可拖动，其余顶部空白区域可拖动整个窗口
- 仅调整 macOS 效果，不影响其他平台布局

## 结论摘要

这次问题的关键不在缓存，也不在 Tailwind 类名表面看起来是否一致，而在于：

1. **右侧 `TabBar` 在真实运行时被 flex 收缩了**，导致右侧顶部真实高度一度只有 `38.375px`
2. **左侧顶栏虽然声明了 `h-11`，但左侧控制区和原生 traffic lights 的视觉中心线没有对齐**
3. **右侧可拖动区域的正确归属应该是 `TabBar` 的空白区，而不是在 `MainAIChatShell` 里额外挂一个假的拖拽层**

最终采用的方案是：

- 给 `TabBar` 根节点补上 `shrink-0`
- 保持右侧拖拽语义落在 `TabBar` 顶部真实空白区域
- 调整左侧顶栏结构，让安全区、控件区都以 `44px` 顶栏为基准
- 给左侧自定义控件行施加光学校正位移，使其和原生 traffic lights 视觉中心线对齐
- 去掉左侧 ribbon 在 macOS 顶栏模式下的额外顶部偏移

## 症状记录

### 1. 左右顶栏看起来高度不一致

虽然左右两边都使用了 `h-11`，但用户在真实窗口中持续观察到：

- 左侧顶栏明显更高
- 右侧顶栏更扁
- 仅从代码肉眼看类名，无法解释真实视觉结果

### 2. 右侧顶部拖动只在界面未完全渲染时生效

用户观察到：

- 初始界面还没渲染完成时，右侧上方区域可以拖动整个窗口
- 界面出来之后，相同位置就不能拖了

这说明真正吃掉拖拽命中的，不是 Tauri overlay 本身，而是 **后续渲染出来的前端节点**。

### 3. 左侧 traffic lights 和自定义按钮没有在同一条视觉中心线上

用户要求左侧顶栏里：

- 原生红黄绿按钮要有自己独立区域
- 我们自己的按钮也要在左侧顶栏里上下居中
- 两组控件看起来像属于同一块结构，而不是互相挤压或错位

## 调查过程

### 阶段一：先按结构而不是样式来理解问题

先明确了这不是简单的配色、阴影、圆角问题，而是顶层骨架问题：

- 左区要从窗口最顶部开始
- 右区要从窗口最顶部开始
- 中间分界要从顶到底连续成立
- 顶部功能区必须归属于左右各自区域，而不是额外挂层

这部分背景和改动方向，单独记录在：

- `/Users/zzzz/Lumina-Note/docs/plans/2026-03-09-macos-top-layout-alignment.md`

### 阶段二：否定错误方向

中途确认过一个错误思路：

- 把右侧拖动问题理解成“需要在 `MainAIChatShell` 再加一个拖拽区域”

这个方向后来被撤回，因为它本质上是在补一层假的交互层，不符合“右侧顶部除 `tabbar` 和按钮外都可拖动”的要求。

最终保留的理解是：

- 右侧顶部可拖动区域应当来自 `TabBar` 自身的真实空白区
- `tab` 本体与按钮本体必须显式排除拖动

### 阶段三：使用真实运行时插桩，而不是凭感觉改类名

为确认“为什么明明都写了 `h-11`，看起来却不一样”，对真实窗口进行了运行时插桩测量。

本地插桩产物位于（未提交仓库，仅作为排障证据）：

- `/Users/zzzz/Lumina-Note/output/playwright/mac-topbar-left.json`
- `/Users/zzzz/Lumina-Note/output/playwright/mac-topbar-right.json`
- `/Users/zzzz/Lumina-Note/output/playwright/mac-topbar-metrics.json`
- `/Users/zzzz/Lumina-Note/output/playwright/mac-topbar-final-app.png`
- `/Users/zzzz/Lumina-Note/output/playwright/mac-topbar-final.png`

关键测量结果：

#### 初始测量（问题存在时）

- 左侧顶栏高度：`44px`
- 右侧顶栏高度：`38.375px`

这说明“左右都写了 `h-11`”并不等于“真实布局高度相等”。

#### 修正后测量

- 左侧顶栏高度：`44px`
- 右侧顶栏高度：`44px`

对应的本地测量文件里，左右顶部边界都已经落在：

- `top = 0`
- `bottom = 44`
- `height = 44`

因此，用户早先看到的不一致并不是缓存导致，而是 **右侧真实布局被压缩** 导致。

## 根因分析

### 根因一：`TabBar` 根节点参与 flex 收缩

右侧顶部真实高度异常的直接原因，是 `TabBar` 根节点在布局中被压缩，导致：

- 样式声明虽然是 `h-11`
- 但最终渲染高度被挤成了 `38.375px`

修复点位于：

- `/Users/zzzz/Lumina-Note/src/components/layout/TabBar.tsx:205`

核心修复是让 `TabBar` 根节点带上：

- `shrink-0`

这样右侧顶部在纵向 flex 布局里不会再被压扁，最终运行时测得高度恢复为 `44px`。

### 根因二：左侧控件区需要按原生 traffic lights 做光学对齐

左侧顶栏不是单纯“高度 44px 就够了”，因为用户关注的是：

- 原生 traffic lights 的视觉中心
- 我们自己的按钮行视觉中心

这两者即便位于同一个 `44px` 容器里，也可能视觉上不在同一条线上。

最终左侧保留了一个光学校正：

- `/Users/zzzz/Lumina-Note/src/components/layout/MacLeftPaneTopBar.tsx:32`

即：

- `-translate-y-[6px]`

它的作用不是改变左侧顶栏总高度，而是把自定义控件行的视觉中心拉回到与原生 traffic lights 更接近的位置。

### 根因三：左侧 ribbon 顶部额外偏移破坏了整体节奏

左侧结构还存在一个次级问题：

- ribbon 在 macOS 左顶栏模式下如果继续保留顶部偏移，会破坏左区从窗口顶部自然展开的节奏

对应修正位置：

- `/Users/zzzz/Lumina-Note/src/components/layout/Ribbon.tsx:248`

保留的结果是：

- 开启 macOS traffic lights 安全区时，左侧不再额外补顶部偏移

## 最终落地改动

本次排障相关的原子化提交包括：

- `0db4f1f` `feat(macos): align split top layout`
- `7985b8f` `fix(macos): use tabbar whitespace for window dragging`
- `3812b9e` `fix(macos): align top bar heights to 44px`
- `6c50e0f` `fix(macos): align left top bar structure`
- `5298724` `fix(macos): remove left ribbon top offset`
- `5fc1cdc` `fix(macos): center left controls against traffic lights`
- `3aea6da` `fix(macos): equalize left and right top bar heights`

其中可以直接对应核心结论的代码位置有：

- `/Users/zzzz/Lumina-Note/src/components/layout/TabBar.tsx:205`
- `/Users/zzzz/Lumina-Note/src/components/layout/MacLeftPaneTopBar.tsx:25`
- `/Users/zzzz/Lumina-Note/src/components/layout/MacLeftPaneTopBar.tsx:32`
- `/Users/zzzz/Lumina-Note/src/components/layout/Ribbon.tsx:248`

## 验证记录

本次排障中至少完成了两类验证：

### 1. 运行时插桩验证

通过真实窗口的 DOM/布局测量确认：

- 左侧顶栏高度最终为 `44px`
- 右侧顶栏高度最终为 `44px`
- 问题不是缓存，而是右侧布局在运行时发生了收缩

### 2. 相关组件测试验证

当时执行过针对本次改动影响面的测试命令：

- `npm run test:run -- src/components/layout/MacLeftPaneTopBar.test.tsx src/components/layout/TabBar.test.tsx src/components/layout/Ribbon.test.tsx src/components/onboarding/WelcomeScreen.test.tsx`

当次结果为：

- `4` 个测试文件通过
- `15` 个测试通过

## 这次排障得到的经验

1. **不要把“类名一致”误判为“真实渲染一致”**  
   `h-11` 只是声明值，不代表最终布局结果一定是 `44px`。

2. **macOS 顶部问题要优先看结构归属，不要先补假顶栏**  
   顶部拖拽、traffic lights 安全区、tabbar 顶边，这些都必须属于真实布局骨架。

3. **拖动能力要落在真实空白区，而不是靠额外透明层补出来**  
   否则很容易出现“初始能拖，渲染后不能拖”这种交互割裂。

4. **视觉对齐需要接受光学校正，而不是只盯数学中心**  
   原生 traffic lights 与自定义按钮混排时，适度的视觉位移是必要的。

## 当前状态

截至本文档提交时：

- 左右顶栏运行时测量结果已对齐到 `44px`
- 右侧顶部拖拽语义已回到 `TabBar` 的真实空白区域
- 左侧 traffic lights 与自定义按钮已做视觉居中对齐
- 本地 `output/` 目录仍保留插桩截图和 JSON，用作排障证据，不纳入正式提交

如果后续用户仍在真实应用窗口里观察到不一致，应继续沿用这次方法：

- 先截图
- 再插桩
- 再测量
- 最后改动

而不是回到“凭感觉调类名”的路径。
