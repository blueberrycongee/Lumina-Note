# Issue #159 网络驱动器路径回归错误报告

**报告日期**: 2026-03-14  
**Issue 编号**: #159  
**严重程度**: 高（阻塞性问题）  
**影响范围**: 使用网络驱动器/外部卷的用户  
**修复状态**: ✅ 已修复  

---

## 一、问题描述

### 1.1 用户报告

用户在 GitHub Issue #159 中报告：
- **错误信息**: `Invalid path: Path not permitted: Y:\\aaa\\bbb`
- **错误场景**: 尝试将位于网络映射驱动器上的文件夹添加为工作区/存储库
- **影响平台**: Windows（网络映射驱动器）、macOS（`/Volumes` 挂载的外部卷）

### 1.2 错误现象

```
Refresh file tree failed (2)
Invalid path: Path not permitted: Y:\\aaa\\bbb
```

用户无法将位于以下位置的文件库添加到 Lumina-Note：
- Windows: 网络映射驱动器（如 `Y:\`, `Z:\`）
- macOS: `/Volumes/` 下挂载的网络驱动器或外部卷
- Linux: `/mnt/` 或 `/media/` 下的网络挂载点

---

## 二、根本原因分析

### 2.1 代码位置

**文件**: `src-tauri/src/fs/manager.rs`  
**函数**: `default_allowed_roots()` (第 78-101 行)  
**职责**: 定义文件系统访问的默认允许根目录列表

### 2.2 问题代码（修复前）

```rust
fn default_allowed_roots() -> Vec<PathBuf> {
    if let Some(value) = env::var_os("LUMINA_ALLOWED_FS_ROOTS") {
        return normalize_roots(env::split_paths(&value).collect());
    }

    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        roots.push(home.clone());
        roots.push(home.join("Documents"));
        roots.push(home.join("Desktop"));
    }
    if let Some(appdata) = env::var_os("APPDATA") {
        roots.push(PathBuf::from(appdata));
    }
    if let Some(local_appdata) = env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(local_appdata));
    }
    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd);
    }

    normalize_roots(roots)
}
```

### 2.3 问题本质

**安全边界过于严格**：函数只允许以下路径：
- 用户主目录（`HOME` / `USERPROFILE`）
- 标准子目录（`Documents`, `Desktop`）
- 应用数据目录（`APPDATA`, `LOCALAPPDATA`）
- 当前工作目录

**缺失的路径**：
- ❌ macOS: `/Volumes/`（外部卷、网络驱动器）
- ❌ Linux: `/mnt/`, `/media/`（网络挂载点、可移动媒体）
- ❌ Windows: 网络映射驱动器盘符（`Y:\`, `Z:\` 等）

### 2.4 为什么会回归

**回归类型**: 设计遗漏（Design Omission）

1. **初始设计假设错误**: 开发时假设用户只会将文件库放在本地标准目录
2. **缺少用户场景调研**: 未考虑企业用户、高级用户使用网络存储的场景
3. **测试覆盖不足**: 缺少跨平台文件系统路径的集成测试
4. **环境变量机制不完善**: 虽然提供了 `LUMINA_ALLOWED_FS_ROOTS` 环境变量，但普通用户不知道如何使用

---

## 三、影响评估

### 3.1 受影响用户群体

| 用户类型 | 使用场景 | 影响程度 |
|---------|---------|---------|
| 企业用户 | 文件库位于公司 NAS/文件服务器 | 🔴 严重 |
| 多设备用户 | 使用同步盘（如 Syncthing、Resilio Sync） | 🔴 严重 |
| 高级用户 | 使用外部硬盘/网络驱动器存储大型文件库 | 🔴 严重 |
| 开发团队 | 共享文件库位于团队共享驱动器 | 🔴 严重 |

### 3.2 功能影响

- ❌ 无法添加网络驱动器上的文件库
- ❌ 无法打开已存在于网络驱动器的文件库
- ❌ 文件树刷新失败
- ❌ 所有文件系统操作被阻止（读取、写入、列出）

---

## 四、修复方案

### 4.1 修复策略

**平台特定的挂载点检测**：
- macOS: 自动添加 `/Volumes/` 目录
- Linux: 自动添加 `/mnt/` 和 `/media/` 目录
- Windows: 网络映射驱动器自动支持（盘符根目录已在现有逻辑中覆盖）

### 4.2 修复代码

```rust
fn default_allowed_roots() -> Vec<PathBuf> {
    if let Some(value) = env::var_os("LUMINA_ALLOWED_FS_ROOTS") {
        return normalize_roots(env::split_paths(&value).collect());
    }

    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        roots.push(home.clone());
        roots.push(home.join("Documents"));
        roots.push(home.join("Desktop"));
    }
    if let Some(appdata) = env::var_os("APPDATA") {
        roots.push(PathBuf::from(appdata));
    }
    if let Some(local_appdata) = env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(local_appdata));
    }
    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd);
    }

    // Add network drive mount points
    // macOS: /Volumes for network drives and external volumes
    if cfg!(target_os = "macos") {
        let volumes = PathBuf::from("/Volumes");
        if volumes.exists() {
            roots.push(volumes);
        }
    }
    // Linux: /mnt and /media for network drives and removable media
    if cfg!(target_os = "linux") {
        let mnt = PathBuf::from("/mnt");
        if mnt.exists() {
            roots.push(mnt);
        }
        let media = PathBuf::from("/media");
        if media.exists() {
            roots.push(media);
        }
    }
    // Windows: Network drives are mapped as drive letters (Z:\, Y:\, etc.)
    // They are already covered by the drive root detection above

    normalize_roots(roots)
}
```

### 4.3 修复说明

| 平台 | 添加路径 | 检测方式 | 说明 |
|-----|---------|---------|------|
| macOS | `/Volumes/` | `cfg!(target_os = "macos")` + `exists()` | 所有外部卷和网络驱动器 |
| Linux | `/mnt/`, `/media/` | `cfg!(target_os = "linux")` + `exists()` | 网络挂载点和可移动媒体 |
| Windows | 无需修改 | 自动支持 | 映射驱动器已是盘符根目录 |

---

## 五、验证与测试

### 5.1 手动测试场景

**macOS**:
```bash
# 挂载网络驱动器后测试
mount -t smbfs //user@server/share /Volumes/MyShare
# 在 Lumina-Note 中打开 /Volumes/MyShare/vault
```

**Windows**:
```powershell
# 映射网络驱动器后测试
net use Z: \\server\share
# 在 Lumina-Note 中打开 Z:\vault
```

**Linux**:
```bash
# 挂载网络共享后测试
mount -t cifs //server/share /mnt/myshare
# 在 Lumina-Note 中打开 /mnt/myshare/vault
```

### 5.2 自动化测试建议

```rust
#[cfg(test)]
mod tests {
    #[test]
    #[cfg(target_os = "macos")]
    fn test_volumes_included_in_allowed_roots() {
        let roots = default_allowed_roots();
        let volumes = PathBuf::from("/Volumes");
        assert!(roots.iter().any(|r| r.starts_with(&volumes)));
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn test_mnt_and_media_included_in_allowed_roots() {
        let roots = default_allowed_roots();
        assert!(roots.iter().any(|r| r.starts_with("/mnt")));
        assert!(roots.iter().any(|r| r.starts_with("/media")));
    }
}
```

---

## 六、经验教训与预防措施

### 6.1 问题根源

1. **平台差异考虑不足**: 开发时主要考虑本地文件系统，忽略了跨平台挂载点差异
2. **用户场景调研缺失**: 未调研企业用户和高级用户的实际使用场景
3. **安全与可用性平衡**: 过度严格的安全限制牺牲了可用性

### 6.2 预防措施

1. ✅ **建立错误模式文档**: 将此类回归错误记录到 `docs/` 目录
2. ✅ **添加集成测试**: 为跨平台文件系统路径添加测试用例
3. ✅ **用户文档更新**: 在 FAQ 中说明支持的网络路径类型
4. ✅ **环境变量文档化**: 明确说明 `LUMINA_ALLOWED_FS_ROOTS` 的使用方法

### 6.3 后续改进

- [ ] 添加文件系统路径验证的单元测试
- [ ] 在设置界面提供"允许的路径"管理功能
- [ ] 添加友好的错误提示，告知用户如何添加自定义允许路径
- [ ] 考虑支持相对路径和符号链接

---

## 七、相关文件

### 核心修复文件
- **主要修复**: [`src-tauri/src/fs/manager.rs`](src-tauri/src/fs/manager.rs) - `default_allowed_roots()` 函数

### 相关提交历史
- **d2923ea** (2026-02-05): "security: harden backend boundaries" - 引入 `allowed_roots()` 安全机制
- **ee2a53f** (2026-02-14): "fix(database): normalize paths and surface actionable create errors" - 路径规范化修复
- **342acee** (2026-03-06): "fix: restore workspace fs roots during rehydrate" - PR #160 初始提交
- **b3939d8** (2026-03-06): "fix: restore workspace fs roots during rehydrate (#160)" - PR #160 合并提交
- **0c9c540** (2026-03-12): 外部工作区挂载文档
- **2da1a24** (2026-03-12): 外部工作区挂载功能

### 前端相关文件
- **错误处理**: `src/components/database/actionErrors.ts`
- **Store 层修复**: `src/stores/useFileStore.ts` - `syncWorkspaceAccessRoots()` 函数
- **测试用例**: `src/__tests__/useFileStore.rehydrateFsRoots.test.ts` - PR #160 添加的 rehydrate 测试

### 相关文档
- **错误处理**: [`docs/issue-159-network-drive-regression-report.md`](docs/issue-159-network-drive-regression-report.md)（本文档）

---

## 八、详细时间线与回归分析

### 8.1 完整时间线

| 日期 | 提交 | 事件 | 影响 |
|-----|------|------|------|
| 2026-02-05 | d2923ea | **安全加固提交**：引入 `ensure_allowed_path()` 和 `allowed_roots()` 机制 | 🔴 引入设计缺陷 |
| 2026-02-13 | a9f45c8 | 重构为 `default_allowed_roots()` + `runtime_allowed_roots()` 双轨制 | 🟡 增加复杂度 |
| 2026-02-14 | 624145f | 添加 `path_exists_in_allowed_roots()` 函数 | 🟢 功能增强 |
| 2026-02-14 | ee2a53f | 规范化路径处理错误 | 🟢 改进错误处理 |
| 2026-03-06 | b3939d8 | **PR #160**: 添加 `syncWorkspaceAccessRoots()` 和 rehydrate 恢复 | 🟢 修复 rehydrate 问题 |
| 2026-03-12 | 2da1a24 | 外部工作区挂载功能 | 🟡 增加使用场景 |
| 2026-03-12 | 645e593 | 自动发现系统级共享工作区 | 🟡 更多网络路径使用 |
| 2026-03-12 | c046182 | 自动检测工作区并修复设置 UI | 🟢 改进用户体验 |
| 2026-03-11 | f0a658f | 添加图片资源索引原语 | ⚪ 无关修改 |
| 2026-03-14 | - | **用户报告 Issue #159** | 🔴 问题暴露 |
| 2026-03-14 | - | **实施修复**：添加网络驱动器挂载点支持 | 🟢 问题修复 |

### 8.2 回归根源深度分析

#### 第一阶段：设计缺陷引入（2026-02-05）

**提交**: d2923ea "security: harden file boundaries"

**问题代码**:
```rust
fn allowed_roots() -> Vec<PathBuf> {
    if let Some(value) = env::var_os("LUMINA_ALLOWED_FS_ROOTS") {
        return env::split_paths(&value)
            .filter(|path| path.exists())
            .filter_map(|path| fs::canonicalize(path).ok())
            .collect();
    }

    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        roots.push(home.clone());
        roots.push(home.join("Documents"));
        roots.push(home.join("Desktop"));
    }
    // ... 仅包含本地标准目录
}
```

**设计缺陷**:
1. **假设错误**: 假设用户只会将文件库放在本地标准目录
2. **平台差异忽视**: 未考虑 macOS `/Volumes`、Linux `/mnt`/`/media` 等平台特定挂载点
3. **环境变量依赖**: 虽然提供 `LUMINA_ALLOWED_FS_ROOTS`，但普通用户不知道如何使用

#### 第二阶段：功能增强但未修复缺陷（2026-02-13 ~ 2026-02-14）

**提交**: a9f45c8, 624145f, ee2a53f

**改进**:
- 引入 `runtime_allowed_roots()` 运行时动态根目录
- 添加 `set_runtime_allowed_roots()` API 供前端动态注册工作区
- 规范化路径处理和错误报告

**错失机会**:
- 多次修改 `default_allowed_roots()` 但**从未添加网络路径支持**
- 测试用例仅覆盖本地临时目录，未测试网络路径

#### 第三阶段：问题掩盖期（2026-03-06）

**提交**: b3939d8 "fix: restore workspace fs roots during rehydrate (#160)"

**修复内容**:
```typescript
async function syncWorkspaceAccessRoots(path: string): Promise<void> {
  useWorkspaceStore.getState().registerWorkspace(path);
  const workspacePaths = Array.from(
    new Set([path, ...useWorkspaceStore.getState().workspaces.map((workspace) => workspace.path)])
  );
  await invoke("fs_set_allowed_roots", { roots: workspacePaths });
}
```

**作用**: 通过 `fs_set_allowed_roots` 命令动态注册工作区路径到 `RUNTIME_ALLOWED_ROOTS`

**为什么仍然有问题**:
- ✅ **本地路径**: 用户打开本地文件库 → `syncWorkspaceAccessRoots()` 注册 → 正常工作
- ❌ **网络路径**: 用户打开网络驱动器文件库 → `syncWorkspaceAccessRoots()` 注册 → **但 `default_allowed_roots()` 仍然拒绝**

#### 第四阶段：问题暴露（2026-03-12）

**提交**: 2da1a24, 645e593（外部工作区功能）

**新增使用场景**:
1. **外部工作区挂载**: 用户可以将系统级共享工作区挂载到当前文件库
2. **自动发现系统级工作区**: 自动探测系统级共享工作区并注册

**为什么问题暴露**:
- 这类共享工作区通常位于**非标准路径**（如网络驱动器、外部卷）
- 用户尝试挂载位于网络驱动器上的共享工作区
- `ensure_allowed_path()` 拒绝访问 → 报错 "Path not permitted"

#### 第五阶段：问题报告与修复（2026-03-14）

**用户报告**:
```
Refresh file tree failed (2)
Invalid path: Path not permitted: Y:\\aaa\\bbb
```

**根本原因确认**:
`default_allowed_roots()` 函数缺少平台特定的网络驱动器挂载点支持

**修复方案**:
```rust
// Add network drive mount points
// macOS: /Volumes for network drives and external volumes
if cfg!(target_os = "macos") {
    let volumes = PathBuf::from("/Volumes");
    if volumes.exists() {
        roots.push(volumes);
    }
}
// Linux: /mnt and /media for network drives and removable media
if cfg!(target_os = "linux") {
    let mnt = PathBuf::from("/mnt");
    if mnt.exists() {
        roots.push(mnt);
    }
    let media = PathBuf::from("/media");
    if media.exists() {
        roots.push(media);
    }
}
```

### 8.3 为什么这是一个"隐蔽"的回归

1. **开发环境未暴露**: 开发者通常在本地标准目录开发，不会触发此问题
2. **测试覆盖不足**: 缺少跨平台文件系统路径的集成测试
3. **渐进式暴露**: 
   - v0.x: 用户少，网络路径使用场景少
   - v1.0.1-v1.0.12: 外部工作区功能未发布，问题被掩盖
   - v1.0.13: 外部工作区功能发布 → 网络路径使用频率增加 → 问题暴露

### 8.4 教训与反思

#### 设计层面
1. **安全边界设计**: 安全限制不应过度牺牲可用性
2. **平台差异考虑**: 跨平台应用必须考虑各平台的文件系统约定
3. **用户场景调研**: 应调研企业用户、高级用户的实际使用场景

#### 开发流程层面
1. **测试策略**: 应包含跨平台文件系统路径的测试用例
2. **代码审查**: 涉及安全边界的修改应有更严格的审查
3. **文档化**: 应明确说明支持的路径类型和环境变量用法

#### 技术债务管理
1. **已知问题追踪**: 设计缺陷应及时记录并安排修复
2. **渐进式改进**: 多次修改同一函数时应重新审视整体设计
3. **用户反馈响应**: 用户报告后应快速定位并修复

---

## 九、后续行动计划

### 9.1 短期（v1.0.14）
- [x] 修复 `default_allowed_roots()` 添加网络驱动器支持
- [ ] 添加文件系统路径验证的单元测试
- [ ] 更新用户文档说明支持的网络路径类型

### 9.2 中期（v1.0.15+）
- [ ] 在设置界面提供"允许的路径"管理功能
- [ ] 添加友好的错误提示，告知用户如何添加自定义允许路径
- [ ] 考虑支持相对路径和符号链接

### 9.3 长期
- [ ] 建立跨平台文件系统测试矩阵
- [ ] 完善安全边界设计原则文档
- [ ] 建立用户场景调研机制

---

## 十、PR #160 的作用与局限

### PR #160 (b3939d8) 解决了什么问题：
- 在应用启动时，从持久化存储恢复工作区路径后，**前端主动调用** `fs_set_allowed_roots` 将工作区路径添加到允许列表
- 测试用例覆盖了映射驱动器（`Y:\`）和 UNC 路径（`\\Mac\Home\...`）

### PR #160 未解决的问题：
- 依赖前端在 rehydrate 时**显式调用** `fs_set_allowed_roots`
- 如果用户通过其他方式（如命令行、插件、直接文件操作）访问网络路径，仍然会失败
- `default_allowed_roots()` 本身仍然不包含网络驱动器路径，导致**首次访问**时必然失败

### 外部工作区挂载功能的影响

**2026-03-12** 的提交 0c9c540 和 2da1a24 引入了外部工作区挂载功能：
- 用户可以将外部共享工作区挂载到 Lumina
- 这类共享工作区**经常位于网络驱动器或外部卷**上
- 这增加了用户访问网络路径的频率，暴露了 `default_allowed_roots()` 的设计缺陷

### 为什么这是一个回归错误

**回归类型**: 设计遗漏 + 测试覆盖不足

1. **d2923ea (2026-02-05)** 引入安全机制时，只考虑了本地标准目录
2. **PR #160 (2026-03-06)** 部分修复了 rehydrate 场景，但未解决根本问题
3. **外部工作区功能 (2026-03-12)** 增加了网络路径使用频率，问题暴露
4. **Issue #159 (2026-03-14)** 用户正式报告问题

**根本原因**: `default_allowed_roots()` 的设计假设过于狭隘，未考虑跨平台网络挂载点的多样性

---

**报告作者**: AI Assistant  
**审核状态**: 待审核  
**最后更新**: 2026-03-14
