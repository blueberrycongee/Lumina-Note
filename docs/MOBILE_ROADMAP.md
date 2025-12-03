# Lumina Note Mobile Roadmap

## 📱 项目目标

基于 Tauri 2.0 开发 Android/iOS 移动端，实现笔记编辑、OneDrive 同步、AI Agent 功能。

**预计工期**：4-5 周（一人全职）

---

## 🗓️ 开发阶段

### Phase 1: 项目搭建（第 1 周）

| 任务 | 时间 | 状态 |
|------|-----|------|
| Tauri Mobile 环境配置 | 1 天 | ✅ |
| 移动端 UI 框架重构 | 1 天 | ✅ |
| Android 项目初始化 | 1 天 | ✅ |
| iOS 项目初始化（需 Mac） | 1 天 | ⬜ |
| 移动端权限配置 | 0.5 天 | ✅ |
| 基础 UI 框架适配 | 1.5 天 | 🔄 |

**交付物**：可编译运行的空白 App

#### 已完成的配置
- Cargo.toml 条件编译（桌面端专属依赖）
- lib.rs 移动端入口函数 `run()`
- AndroidManifest.xml 权限配置
- 移动端 capability 文件
- **✅ Android 构建成功** (APK + AAB)

---

### Phase 2: 笔记编辑（第 2 周）

| 任务 | 时间 | 状态 |
|------|-----|------|
| CodeMirror 触屏适配 | 2 天 | ⬜ |
| 移动端编辑工具栏 | 1 天 | ⬜ |
| 文件浏览器 UI | 1.5 天 | ⬜ |
| 笔记 CRUD 操作 | 1 天 | ⬜ |
| 移动端存储路径适配 | 0.5 天 | ⬜ |

**交付物**：可创建、编辑、保存笔记

---

### Phase 3: OneDrive 同步（第 3 周）

| 任务 | 时间 | 状态 |
|------|-----|------|
| Azure 应用注册 | 0.5 天 | ⬜ |
| OAuth 认证流程 | 1.5 天 | ⬜ |
| 文件上传/下载 | 1.5 天 | ⬜ |
| 增量同步（Delta API） | 1 天 | ⬜ |
| 冲突检测与处理 | 1 天 | ⬜ |
| 同步状态 UI | 0.5 天 | ⬜ |

**交付物**：笔记可在多设备间同步

---

### Phase 4: AI 对话 + Agent（第 4 周）

| 任务 | 时间 | 状态 |
|------|-----|------|
| Chat UI 移动端适配 | 1.5 天 | ⬜ |
| LLM 服务复用验证 | 0.5 天 | ⬜ |
| Agent 模式切换 UI | 1 天 | ⬜ |
| 工具调用适配 | 1.5 天 | ⬜ |
| 流式输出优化 | 0.5 天 | ⬜ |

**交付物**：AI 对话和 Agent 功能可用

---

### Phase 5: 测试与发布（第 5 周）

| 任务 | 时间 | 状态 |
|------|-----|------|
| 多机型兼容测试 | 2 天 | ⬜ |
| 性能优化 | 1 天 | ⬜ |
| Bug 修复 | 1.5 天 | ⬜ |
| 应用商店准备 | 0.5 天 | ⬜ |

**交付物**：可发布的 APK/IPA

---

## 📁 代码结构规划

```
src/
├── components/
│   ├── mobile/              # 移动端专用组件
│   │   ├── MobileToolbar.tsx
│   │   ├── MobileFileBrowser.tsx
│   │   └── MobileChat.tsx
│   └── ...                  # 共享组件
├── hooks/
│   └── usePlatform.ts       # 平台检测
└── ...

src-tauri/
├── src/
│   ├── lib.rs               # 共享逻辑
│   ├── sync/
│   │   ├── mod.rs
│   │   └── onedrive.rs      # OneDrive 同步
│   └── ...
├── gen/
│   ├── android/             # Android 项目
│   └── apple/               # iOS 项目
└── tauri.conf.json          # 移动端配置
```

---

## 技术栈

| 层级 | 技术 |
|------|-----|
| 框架 | Tauri 2.0 |
| 前端 | React + TailwindCSS |
| 编辑器 | CodeMirror 6 |
| 后端 | Rust |
| 同步 | Microsoft Graph API (OneDrive) |
| AI | 云端 LLM API |

---

## ⚠️ 移动端限制

| 功能 | 桌面端 | 移动端 | 说明 |
|------|-------|-------|------|
| Ollama 本地模型 | ✅ | ❌ | 移动端算力不足 |
| PDF OCR | ✅ | ❌ 暂不支持 | 后续可做云端方案 |
| RAG 向量搜索 | ✅ | ❌ 暂不支持 | 依赖本地向量库 |
| 数据库视图 | ✅ | ⬜ 待定 | 可简化版支持 |

---

## 🚀 后续迭代（v2.0）

- [ ] 云端 OCR 服务
- [ ] 移动端 RAG（云端向量库）
- [ ] 离线 AI（小模型量化）
- [ ] Widget 小组件
- [ ] 快捷指令/Shortcuts 集成

---

## 📝 备注

- iOS 开发需要 Mac + Xcode
- 建议先完成 Android 版本
- OneDrive 需注册 Azure 开发者账号（免费）
