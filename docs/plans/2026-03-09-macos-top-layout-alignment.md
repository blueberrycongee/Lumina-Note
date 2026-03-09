# macOS 顶层布局对齐改动文档

> **文档目的：** 用精确语言描述当前项目背景、当前实现问题、目标效果、相关代码范围，以及后续实现时建议扩大的搜索范围。

**Goal:** 让 macOS 下的窗口布局从最顶部就完成左右分区，而不是通过额外的假顶栏、空白 inset、浮动按钮去模拟顶层结构。

**Architecture:** 当前项目已经使用 Tauri 的 macOS overlay title bar 能力，但前端布局仍然存在“在内容内部补顶栏”的倾向。目标不是继续美化这条补出来的顶栏，而是把左侧区域和主内容区域的顶层骨架重新排正：左区从顶部开始、右区从顶部开始、分割线从顶部开始、标签页贴顶、顶部工具区属于各自区域的真实布局而不是附加层。

**Tech Stack:** Tauri、React、TypeScript、Zustand、Tailwind 风格工具类

---

## 一、当前项目背景

当前项目是一个桌面笔记与 AI 工作台应用，运行形态是 **Tauri 壳 + React 前端**。

在布局上，当前主窗口大体由以下几部分组成：
- 左侧窄图标栏
- 左侧文件/功能侧栏
- 中间主内容区
- 右侧面板
- 若干顶部相关组件（标题栏、标签栏、mac 专用顶部处理）

从产品目标来看，项目希望在 macOS 下获得更接近原生桌面应用的窗口观感，而不是明显的网页套壳观感。

当前已经具备的前提是：
- macOS 窗口使用了 overlay title bar
- 原生窗口标题已隐藏
- React 层已经区分了普通标题栏与 macOS 特殊处理

因此，问题已经不再是“能不能去掉网页标题栏”，而是：

**去掉网页标题栏之后，整个窗口的左右两大区域，是否真的从最顶部就开始成立。**

---

## 二、对当前实现问题的精确描述

你期待的是：

- 左边区域从窗口最顶部就开始
- 右边区域从窗口最顶部就开始
- 左右之间的主分割线从窗口最顶部直接向下贯通
- 主内容的标签页本身贴着顶部开始
- 顶部工具区属于左区或右区自己的真实布局结构

而不是：

- 在内容区域内部再补一条“mac 顶栏”
- 用一个空白高度去模拟原生顶部空间
- 把按钮绝对定位到内容上方
- 让侧栏和主内容真正开始的位置晚于窗口顶部

换句话说，当前问题的本质不是“顶栏长得不好看”，而是：

**顶层布局骨架没有对齐。**

更精确地说，是以下这个结构问题：

1. **左区没有从最顶部自然开始。**  
   左侧图标栏、左侧功能按钮、左侧文件区虽然在视觉上已经靠近顶部，但它们仍然可能依赖空白行、补位行、或与主区不同步的顶部结构，因此整体不像一块从顶部自然展开的区域。

2. **主内容区没有从最顶部自然开始。**  
   当前主内容区顶部容易出现“先空一层，再开始 tab / toolbar / 内容”的倾向。这会导致你感觉“上面像又贴了一块东西”。

3. **主分割线没有作为顶层骨架的一部分成立。**  
   你画的红色竖线表达得非常清楚：左区和右区的边界应该从最顶部开始，而不是从某个补出来的 header 下方才开始。

4. **当前实现容易把顶部当成样式问题，而不是结构问题。**  
   如果继续通过 spacer、overlay 按钮、额外 header 来修视觉，最后只会让界面越来越像“拼出来的”。

---

## 三、你期待的效果

你期待的效果，可以用一句话准确描述为：

**整个 macOS 窗口从最顶部就完成左右分区，顶部不是额外叠加出来的一层，而是布局骨架天然的一部分。**

进一步拆开来说，你要的是：

### 1. 左侧区域从顶部开始

左边这整块区域要从窗口最顶上就成立，包括：
- 交通灯右侧的左区顶部空间
- 左侧窄图标栏
- 左侧功能按钮行
- 左侧文件列表区域

它们应该像一个完整的侧边壳，而不是“在侧边栏上面再补了一块东西”。

### 2. 主内容区域从顶部开始

右边主区域也必须从窗口最顶上就成立，包括：
- 主标签页区域
- 标签页下方的工具条（如果需要）
- 主内容区本身

也就是说，标签页应该是主区真正的顶边，而不是主区内部某个较低位置的一行。

### 3. 中间分界线从顶部开始

你红线强调的核心之一，就是主分界线必须从顶部直达底部。

这意味着：
- 左区和右区从窗口顶边就已经分开
- 不允许在最顶部先出现一个横向统一背景，再在下面才开始左右分区
- 不允许中间分界线在顶部“断掉”一截

### 4. 顶部工具属于各自区域

顶部按钮如果存在，应该分别属于：
- 左区顶部工具行
- 右区顶部 tab / toolbar 结构

而不是：
- 独立的全局假顶栏
- 漂浮在主内容上的按钮层
- 不属于任何区域结构的补丁式按钮组

### 5. 整体观感应接近“原生分区”

最终效果应该让人感觉：

- 这个窗口从一出生就是这样分区的
- 左边和右边都是完整区域
- 顶部就是布局本身的一部分
- 整个窗口是一个完整外壳

而不是：

- 一个网页页面
- 外面再加一点 mac 装饰
- 里面再人为垫一些顶部空间

---

## 四、相关代码范围（只列文件地址）

### 1. 窗口与 macOS 标题栏配置
- `/Users/zzzz/Lumina-Note/src-tauri/tauri.macos.conf.json`
- `/Users/zzzz/Lumina-Note/src-tauri/src/main.rs`
- `/Users/zzzz/Lumina-Note/src-tauri/tests/macos_overlay_config.rs`
- `/Users/zzzz/Lumina-Note/src-tauri/tests/tauri_config_titlebar.rs`

### 2. 顶层窗口布局入口
- `/Users/zzzz/Lumina-Note/src/App.tsx`

### 3. 标题栏 / mac 顶部处理
- `/Users/zzzz/Lumina-Note/src/components/layout/TitleBar.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/MacTopChrome.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/TitleBar.test.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/MacTopChrome.test.tsx`

### 4. 左侧区域骨架
- `/Users/zzzz/Lumina-Note/src/components/layout/Ribbon.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/Ribbon.test.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/Sidebar.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/sidebarSurface.ts`
- `/Users/zzzz/Lumina-Note/src/components/toolbar/ResizeHandle.tsx`

### 5. 主内容顶部结构
- `/Users/zzzz/Lumina-Note/src/components/layout/TabBar.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/SplitEditor.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/MainAIChatShell.tsx`

### 6. 右侧区域与附加壳层
- `/Users/zzzz/Lumina-Note/src/components/layout/RightPanel.tsx`
- `/Users/zzzz/Lumina-Note/src/components/plugins/PluginShellSlotHost.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/ErrorNotifications.tsx`

### 7. 欢迎页与特殊空状态
- `/Users/zzzz/Lumina-Note/src/components/onboarding/WelcomeScreen.tsx`

### 8. 状态与尺寸控制
- `/Users/zzzz/Lumina-Note/src/stores/useUIStore.ts`
- `/Users/zzzz/Lumina-Note/src/stores/useFileStore.ts`
- `/Users/zzzz/Lumina-Note/src/stores/usePluginStore.ts`
- `/Users/zzzz/Lumina-Note/src/stores/usePluginUiStore.ts`

### 9. 全局样式与表面样式
- `/Users/zzzz/Lumina-Note/src/styles/globals.css`

---

## 五、建议采用的改动方向

在实现上，建议明确采用下面这个方向：

### 方向 A：按真实布局骨架重排（推荐）

核心原则是：

- **不再新增独立的假顶栏组件来修视觉**
- **不再依赖空白 inset 来骗出 mac 顶部空间**
- **不再把顶部按钮绝对定位在内容上方**
- **而是让左区和右区从最顶上就各自成立**

这意味着：

1. `App.tsx` 里的顶层 flex 结构需要重新审视，确保左区和右区的根节点本身就是从顶部开始，而不是先统一留一条顶部空层。
2. `TabBar.tsx` 需要被视为“主区的真正顶边”，而不是“主区内部的一行”。
3. `Ribbon.tsx` 与 `Sidebar.tsx` 需要共同构成左区的完整顶部结构。
4. 如果左侧需要顶部按钮行，这一行必须属于左区本身，而不是全局假顶栏。
5. 如果主区需要工具条，它必须是 tab 下面的真实第二层，而不是漂浮层。

---

## 六、不推荐的方向

### 方向 B：继续通过 spacer / overlay / absolute button 修视觉

这个方向不推荐，原因如下：
- 它只能修表面观感，不能修正布局骨架
- 会继续制造“贴了一层”的感觉
- 会让左区和右区的顶边逻辑越来越不一致
- 以后每个页面都要单独兼容顶部补丁，维护成本高

### 方向 C：完全依赖更深的原生 toolbar 定制

这个方向也不优先，原因如下：
- 复杂度更高
- 容易进入 Tauri / 原生 API 限制
- 当前问题首先是 React 结构没有排正，不是原生能力不足

---

## 七、精确的改动要求

### 1. 关于最顶部
- macOS 下最顶部不能再出现一条“先空出来再开始布局”的假层
- 左区与右区必须直接参与顶边布局

### 2. 关于左区
- 左侧窄图标栏与左侧文件侧栏必须在结构上从顶边开始
- 左区顶部如果存在按钮行，应当是左区自己的第一行
- 左区的边框和背景要从顶部连续到底部

### 3. 关于右区
- 主区 tab strip 必须贴顶
- 如果主区需要工具条，则工具条必须位于 tab strip 下方，作为主区真实第二行
- 主区上方不应再出现单独悬浮按钮组

### 4. 关于分割线
- 左区与右区之间的主分割线必须从顶边开始
- 不允许在顶部断开再从下方接续
- 左区内部自己的边界也应保持连续，不要在顶部被额外层打断

### 5. 关于 mac 专用逻辑
- `TitleBar.tsx` 在 macOS 下保持“不渲染网页标题栏”的原则
- `MacTopChrome.tsx` 不能再承担“可见假顶栏”的职责
- 如果保留该文件，建议只承担平台检测或过渡兼容作用

### 6. 关于交互功能
- 搜索、打开目录、命令面板等入口在位置调整后仍需保留
- 不允许因为结构重排丢失原有入口能力
- 顶部按钮迁移时，应先梳理事件入口，再移动 UI 承载位置

### 7. 关于欢迎页
- 欢迎页不应重新引入独立假顶栏
- 欢迎页也应服从同一套 mac 顶部骨架语言

---

## 八、实现时建议扩大搜索范围，避免误判

如果只盯着 `App.tsx`、`MacTopChrome.tsx`、`TabBar.tsx`，很容易把问题看成“局部组件样式问题”。

为了增强理解，建议在实现前主动扩大搜索范围。

### 建议扩大阅读的目录范围
- `/Users/zzzz/Lumina-Note/src/components/layout`
- `/Users/zzzz/Lumina-Note/src/components/toolbar`
- `/Users/zzzz/Lumina-Note/src/components/onboarding`
- `/Users/zzzz/Lumina-Note/src/components/plugins`
- `/Users/zzzz/Lumina-Note/src/stores`
- `/Users/zzzz/Lumina-Note/src/styles`
- `/Users/zzzz/Lumina-Note/src-tauri`
- `/Users/zzzz/Lumina-Note/docs/plans`

### 建议重点搜索的关键词
- `data-tauri-drag-region`
- `TitleBar`
- `MacTopChrome`
- `TabBar`
- `Ribbon`
- `Sidebar`
- `sidebarSurface`
- `open-global-search`
- `open-vault`
- `open-command-palette`
- `titleBarStyle`
- `hiddenTitle`
- `leftSidebarOpen`
- `leftSidebarWidth`
- `rightSidebarOpen`
- `border-r`
- `border-b`

### 建议对比阅读的现有组件
这些组件虽然不是“顶层骨架”，但能帮助理解项目里已经存在的 header / pane 结构习惯：
- `/Users/zzzz/Lumina-Note/src/components/layout/SplitEditor.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/MainAIChatShell.tsx`
- `/Users/zzzz/Lumina-Note/src/components/plugins/PluginViewPane.tsx`
- `/Users/zzzz/Lumina-Note/src/components/layout/RightPanel.tsx`

### 建议扩大理解的原因
这样做的目的不是“看更多文件”，而是避免以下误判：
- 误以为问题只是 `MacTopChrome.tsx` 样式不对
- 误以为只要改 `TabBar.tsx` 就够了
- 误以为只要加高度 / 减高度就能解决
- 误以为顶部按钮的位置问题等于顶层骨架问题

---

## 九、建议的验收标准

当这次改动完成后，应该能用下面这些标准判断是否真的做对了：

1. macOS 下左区从最顶部就开始，没有额外假顶层。
2. macOS 下右区从最顶部就开始，tab strip 贴顶。
3. 左区与右区之间的主分割线从最顶部贯穿到底部。
4. 顶部按钮属于左区或右区自己的结构，而不是浮在内容上的补丁层。
5. 欢迎页与主界面在 macOS 下使用同一种顶层语言。
6. Windows/Linux 行为不受影响。
7. 原有关键入口能力不丢失：搜索、打开目录、命令面板等仍然可达。
8. macOS overlay title bar 配置仍然有效，没有回退成普通网页标题栏。

---

## 十、最后的判断原则

后续任何实现方案，都应先问自己一个问题：

**这次改动，是在修“结构”，还是只是在修“样子”？**

只有当答案是下面这种，才算方向正确：

- 左区真的从顶边开始了
- 右区真的从顶边开始了
- 分割线真的从顶边开始了
- tab 真的贴顶了
- 顶部不是额外加的一层，而是布局天生的一部分

如果实现方式仍然依赖：
- spacer
- 绝对定位按钮
- 额外假 header
- 视觉补丁式顶栏

那就说明方向还是偏了。
