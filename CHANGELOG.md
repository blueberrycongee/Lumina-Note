# Changelog

All notable changes to Lumina Note will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.23] - 2026-03-03

### 改进
- 统一侧边栏「今日速记」与「语音笔记」按钮样式

## [0.5.22] - 2026-03-02

### 修复
- 侧边栏快速笔记/语音笔记按钮文字现在正常显示
- 收藏夹标题不再换行
- AI 欢迎语不再换行
- AI 输入框 placeholder 不再换行

## [0.5.21] - 2026-03-02

### 新功能
- 设置中新增编辑器字体大小调节（10-32px 滑块 + 实时预览）

### 修复
- 代码块字体现在跟随编辑器字体设置（-2px 偏移）

## [0.5.20] - 2026-03-02

### 新功能
- 启动时自动检查更新（延迟 5 秒，24 小时冷却）
- 支持跳过指定版本更新
- 更新日志现在从 CHANGELOG.md 读取并展示

### 改进
- 重构 UpdateChecker 组件使用 zustand store 管理状态
- 发布流程新增 changelog 检查，CI 自动拦截缺少日志的发布

## [0.5.19] - 2025-XX-XX

- Initial tracked release
