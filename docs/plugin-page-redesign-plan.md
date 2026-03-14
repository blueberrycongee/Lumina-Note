# 插件页面设计改进计划

## 📋 问题诊断

### 当前存在的问题

#### 1. 外观安全模式优先级问题 ❌
**现象**: 用户反馈"外观安全插件生效后，别的都不生效"

**根本原因**: 
- 外观安全模式 (`appearanceSafeMode`) 只影响外观/主题类插件的样式注入
- 但当前 UI 没有清晰说明这一点，用户误以为会影响所有插件
- 缺少视觉反馈说明哪些插件被安全模式影响

**验证结果**: 
查看代码逻辑，安全模式应该只影响 `category === 'appearance'` 的插件，不影响功能插件

#### 2. 管理混乱，按钮用途不清晰 ❌

**问题按钮**:
- 🔴 "刷新列表" vs "重载运行时" - 用户不清楚区别
- 🔴 "打开默认插件目录" - 名称冗长，用途不明确
- 🔴 "脚手架：示例插件/主题插件" - 开发功能混入用户界面
- 🔴 "卸载全部插件样式" - 技术术语，普通用户不理解

**分类混乱**:
- 当前有"全部"、"功能"、"外观"、"系统"四个分类
- 但"全部"视图按来源分组（全局/工作区/用户/内置）
- 分类视图又按类型分组，逻辑不一致

#### 3. i18n 覆盖不完整 ⚠️

**缺失的翻译**:
- 分类按钮的 emoji 硬编码（🔌🎨⚙️）- 某些语言可能需要不同的图标
- "全部 (X)" 中的计数没有语义化标签
- 技术细节部分（API 版本、入口文件等）的标签可以更清晰

#### 4. 信息架构问题 ⚠️

**层级过深**:
- 插件卡片信息过多：名称、ID、版本、API 版本、最低版本、描述、权限、Ribbon 项、状态
- 技术细节使用 `<details>` 折叠，但权限和 Ribbon 项却展开显示
- 用户难以快速找到关键信息

**缺少搜索/过滤**:
- 无法按名称搜索插件
- 无法按状态过滤（已启用/已禁用/错误）
- 无法按来源过滤（全局/工作区/用户/内置）

---

## 🎯 设计原则

### 1. 用户直觉优先
- **所见即所得**: 按钮名称直接说明作用，避免技术术语
- **即时反馈**: 操作后立即显示结果和影响范围
- **渐进式披露**: 基础功能前置，高级功能隐藏

### 2. 清晰的视觉层次
- **主要操作**（启用/禁用）最突出
- **次要操作**（配置、详情）次之
- **开发功能**（脚手架、调试）隐藏或移至设置

### 3. 一致的分类逻辑
- 按**用户价值**分类（功能/外观），而非技术实现
- 提供**多维度过滤**（来源 + 类型 + 状态）
- 默认视图符合 80% 用户的使用场景

---

## 📐 改进方案

### 方案 A：渐进式改进（推荐）⭐

**优点**: 改动小，风险低，可快速上线
**缺点**: 部分历史包袱保留

#### 1. 按钮重新设计

**当前按钮** → **改进后**:
```
[外观安全模式：开启/关闭] → [🎨 外观安全模式] (带开关图标)
  提示：禁用所有外观/主题插件，用于排查界面问题

[卸载全部插件样式] → [🔄 刷新插件]
  提示：重新加载所有插件（开发用途）

[刷新列表] → [合并到"刷新插件"]

[重载运行时] → [移至开发者模式]

[打开默认插件目录] → [📁 打开插件目录]
  提示：在文件管理器中打开

[脚手架：示例插件] → [移至开发者模式]
[脚手架：主题插件] → [移至开发者模式]
```

#### 2. 外观安全模式说明优化

在安全模式开启时，显示受影响的具体插件列表：
```tsx
{appearanceSafeMode && (
  <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
    <p className="text-sm text-warning font-medium">
      外观安全模式已开启
    </p>
    <p className="text-xs text-warning/80 mt-1">
      已禁用 {affectedAppearancePlugins.length} 个外观插件
    </p>
    {affectedAppearancePlugins.length > 0 && (
      <ul className="mt-2 space-y-1">
        {affectedAppearancePlugins.map(p => (
          <li key={p.id} className="text-xs text-warning/70">
            • {p.name}
          </li>
        ))}
      </ul>
    )}
  </div>
)}
```

#### 3. 分类筛选优化

**当前**: 全部 | 🔌 功能 | 🎨 外观 | ⚙️ 系统

**改进**: 添加状态过滤
```
分类：[全部 ▼]  状态：[全部 ▼]  来源：[全部 ▼]  🔍 搜索...

下拉选项:
- 分类：全部 / 功能插件 / 外观插件 / 系统插件
- 状态：全部 / 已启用 / 已禁用 / 有错误
- 来源：全部 / 全局 / 工作区 / 用户 / 内置
```

#### 4. 插件卡片信息分层

**第一层（展开）**:
```
┌─────────────────────────────────────┐
│  插件名称                      [启用]│
│  v1.0.0 · 功能插件                  │
│  简短描述（最多一行）                │
│                                     │
│  [⚙️ 配置] [📦 Ribbon 项] [ℹ️ 详情] │
└─────────────────────────────────────┘
```

**第二层（点击"详情"展开）**:
```
▼ 技术信息
  API 版本：1
  最低应用版本：1.0.0
  入口文件：index.js
  权限：[fs] [settings]
  
  Ribbon 项:
  - 顶部按钮（已启用）[切换]
  - 底部按钮（已禁用）[切换]
  
  状态：✅ 已加载 / ❌ 错误：xxx
```

#### 5. i18n 完善

**新增翻译键**:
```typescript
plugins: {
  // ... 现有翻译
  
  // 按钮重新命名
  refreshPlugins: '刷新插件',
  refreshPluginsHint: '重新加载所有插件',
  openPluginDir: '打开插件目录',
  developerMode: '开发者模式',
  
  // 状态过滤
  filterByStatus: '按状态过滤',
  statusAll: '全部',
  statusEnabledOnly: '已启用',
  statusDisabledOnly: '已禁用',
  statusWithError: '有错误',
  
  // 分类描述
  categoryFunctionalDesc: '扩展功能的插件',
  categoryAppearanceDesc: '改变外观的插件',
  categorySystemDesc: '系统级插件',
  
  // 安全模式
  safeModeAffectedPlugins: '受影响的插件 ({count})',
  safeModeNoAffected: '当前没有外观插件被禁用',
  
  // 搜索
  searchPlugins: '搜索插件...',
  noPluginsMatch: '没有找到匹配的插件',
}
```

---

### 方案 B：彻底重构（长期）

**优点**: 完全解决架构问题
**缺点**: 工作量大，需要充分测试

#### 1. 分离"用户视图"和"开发者视图"

**用户视图** (默认):
- 只显示已安装的插件
- 简化的卡片（名称 + 启用开关 + 配置按钮）
- 基础分类过滤

**开发者视图** (需要长按 Option 点击或设置开启):
- 显示所有插件（包括内置）
- 技术详情默认展开
- 脚手架工具
- 调试功能（重载运行时、样式注入等）

#### 2. 插件管理独立页面

将插件管理从设置中独立出来，成为侧边栏一级入口：
```
侧边栏:
- 📁 文件
- 🔍 搜索
- 🕸️ 图谱
- 🧩 插件  ← 新增
- ⚙️ 设置
```

#### 3. 插件市场（未来）

```
[已安装] [浏览市场]

市场功能:
- 搜索插件
- 按分类浏览
- 一键安装/更新
- 用户评价
```

---

## 📅 实施计划

### 第一阶段：快速修复（1-2 天）✅

**目标**: 解决最影响用户体验的问题

1. **按钮重命名** - 30 分钟
   - 更新按钮文本和提示
   - 移动开发功能到隐藏区域

2. **安全模式说明优化** - 1 小时
   - 显示受影响的插件列表
   - 明确说明只影响外观插件

3. **i18n 补充** - 2 小时
   - 补充缺失的翻译键
   - 四种语言同步更新

4. **UI 微调** - 2 小时
   - 优化卡片布局
   - 改进状态图标

### 第二阶段：功能增强（3-5 天）

**目标**: 提升可用性和可发现性

1. **搜索和过滤** - 1 天
   - 实现文本搜索
   - 实现多维度过滤

2. **卡片信息分层** - 1 天
   - 重构插件卡片组件
   - 实现渐进式披露

3. **用户测试** - 1 天
   - 邀请真实用户测试
   - 收集反馈并迭代

### 第三阶段：架构优化（2-3 周）

**目标**: 长期可持续发展

1. **开发者模式** - 3 天
2. **插件页面独立** - 5 天
3. **插件市场设计** - 1 周

---

## 🎨 视觉设计建议

### 颜色语义

```
启用状态:
- 已启用：绿色 (bg-emerald-500)
- 已禁用：灰色 (bg-gray-500)
- 错误：红色 (bg-red-500)
- 加载中：蓝色 (bg-blue-500)

分类标识:
- 功能插件：🔌 蓝色
- 外观插件：🎨 紫色
- 系统插件：⚙️ 灰色
```

### 响应式布局

```
桌面端 (>1024px):
- 双列布局显示插件卡片
- 侧边过滤栏常驻

平板端 (768-1024px):
- 单列布局
- 过滤栏可折叠

移动端 (<768px):
- 全屏卡片
- 底部导航切换分类
```

---

## ✅ 验收标准

### 功能验收

- [ ] 外观安全模式只影响外观插件，功能插件不受影响
- [ ] 安全模式开启时，清晰显示受影响的插件列表
- [ ] 所有按钮都有清晰的中文说明和提示
- [ ] 搜索功能可以按名称过滤插件
- [ ] 过滤功能可以按状态/来源/分类筛选

### i18n 验收

- [ ] 所有 UI 文本都有四种语言翻译
- [ ] 没有硬编码的文本（包括 emoji）
- [ ] 复数形式正确处理

### 用户体验验收

- [ ] 新用户能在 30 秒内找到启用/禁用插件的方法
- [ ] 开发功能不对普通用户造成干扰
- [ ] 错误状态清晰可见且有明确的解决建议

---

## 📝 技术实现注意事项

### 1. 性能优化

```typescript
// 使用 useMemo 缓存过滤结果
const filteredPlugins = useMemo(() => {
  return plugins.filter(p => {
    // 搜索过滤
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // 状态过滤
    if (statusFilter !== 'all') {
      const enabled = isEnabled(p.id, p.enabled_by_default);
      if (statusFilter === 'enabled' && !enabled) return false;
      if (statusFilter === 'disabled' && enabled) return false;
      if (statusFilter === 'error' && !runtimeStatus[p.id]?.error) return false;
    }
    // 分类过滤
    if (categoryFilter !== 'all' && categorizePlugin(p) !== categoryFilter) {
      return false;
    }
    return true;
  });
}, [plugins, searchQuery, statusFilter, categoryFilter]);
```

### 2. 可访问性

```tsx
<button
  type="button"
  aria-pressed={enabled}
  aria-label={enabled ? t.plugins.disablePlugin : t.plugins.enablePlugin}
  className={...}
>
  {enabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}
</button>
```

### 3. 错误边界

```tsx
<ErrorBoundary fallback={
  <div className="text-destructive">
    插件卡片渲染失败，请刷新重试
  </div>
}>
  <PluginCard {...plugin} />
</ErrorBoundary>
```

---

## 🔗 相关文件

- 当前实现：[`src/components/settings/PluginSection.tsx`](src/components/settings/PluginSection.tsx)
- 翻译文件：
  - [`src/i18n/locales/zh-CN.ts`](src/i18n/locales/zh-CN.ts)
  - [`src/i18n/locales/en.ts`](src/i18n/locales/en.ts)
  - [`src/i18n/locales/ja.ts`](src/i18n/locales/ja.ts)
  - [`src/i18n/locales/zh-TW.ts`](src/i18n/locales/zh-TW.ts)
- 插件 Store: `src/stores/usePluginStore.ts`
- 插件 UI Store: `src/stores/usePluginUiStore.ts`

---

## 💡 总结

### 核心问题

1. **外观安全模式的范围不明确** - 用户误以为会影响所有插件
2. **按钮命名技术化** - 普通用户不理解"重载运行时"等术语
3. **信息架构混乱** - 开发功能和用户功能混在一起
4. **缺少搜索过滤** - 插件多了以后难以管理

### 最佳实践建议

1. **立即实施**: 按钮重命名 + 安全模式说明优化（1 天内完成）
2. **短期实施**: 搜索过滤功能 + i18n 完善（1 周内完成）
3. **长期规划**: 开发者模式 + 插件市场（1 个月内完成）

### 设计哲学

> **好的插件管理应该像手机应用商店一样简单直观**
> - 一眼能看到有什么插件
> - 一键就能启用/禁用
> - 清晰的分类和搜索
> - 开发功能不干扰普通用户

---

*创建时间：2026-03-14*
*版本：1.0*
