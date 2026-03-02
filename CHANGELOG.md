# Changelog

All notable changes to Lumina Note will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
