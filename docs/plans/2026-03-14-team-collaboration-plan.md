# 团队协作功能实现计划

> 日期：2026-03-14
> 分支：feat/team-collaboration
> 总任务数：21 | 阶段数：9

## 架构概述

- **后端**：扩展 `server/src/` (Rust/Axum 0.6, SQLite/SQLx, JWT auth, WebSocket relay)
- **实时协作**：Yjs (前端) + yrs (后端 Rust CRDT)，通过 WebSocket 同步
- **前端视图**：TanStack Table（表格）、@hello-pangea/dnd（看板）、@schedule-x/react（日历）、gantt-task-react（甘特）
- **状态管理**：Zustand stores
- **权限**：三级角色 admin/member/guest

---

## Phase 1: 数据层基础

### Task 1: 后端数据库 Schema 扩展
**文件**: `server/src/db.rs`
**内容**: 在 `init_db()` 中添加以下表：
- `organizations` (id, name, owner_id, created_at)
- `org_members` (org_id, user_id, role TEXT ['admin','member','guest'], joined_at)
- `projects` (id, org_id, name, description, created_at)
- `tasks` (id, project_id, title, description, status, priority, assignee_id, due_date, start_date, position, created_by, created_at, updated_at)
- `task_labels` (task_id, label TEXT)
- `annotations` (id, doc_path, org_id, user_id, range_start, range_end, content, resolved, created_at)
- `annotation_replies` (id, annotation_id, user_id, content, created_at)
- `notifications` (id, user_id, org_id, type, title, body, ref_id, read, created_at)

同时添加对应的 CRUD 函数。

### Task 2: 后端 Models 扩展
**文件**: `server/src/models.rs`
**内容**: 添加所有新实体的请求/响应结构体：
- `CreateOrgRequest`, `OrgSummary`, `OrgDetail`, `OrgMemberInfo`
- `CreateProjectRequest`, `ProjectSummary`
- `CreateTaskRequest`, `UpdateTaskRequest`, `TaskDetail`, `TaskSummary`
- `CreateAnnotationRequest`, `AnnotationDetail`, `AnnotationReplyRequest`
- `NotificationSummary`, `MarkNotificationReadRequest`

### Task 3: 后端 REST API 路由
**文件**: `server/src/routes.rs`, `server/src/main.rs`
**内容**: 添加路由：
- `POST/GET /orgs` — 创建/列出组织
- `GET/PUT/DELETE /orgs/:id` — 组织详情/更新/删除
- `POST/GET/DELETE /orgs/:id/members` — 成员管理
- `POST/GET /orgs/:id/projects` — 项目 CRUD
- `POST/GET/PUT/DELETE /orgs/:org_id/projects/:proj_id/tasks` — 任务 CRUD
- `POST/GET /annotations` — 批注 CRUD
- `POST /annotations/:id/replies` — 批注回复
- `GET/PUT /notifications` — 通知列表/标记已读

权限中间件：检查 org_members 角色。

---

## Phase 2: 前端类型与 API 客户端

### Task 4: TypeScript 类型定义
**文件**: `src/services/team/types.ts` (新建)
**内容**: 定义所有 TS 接口，与后端 models 一一对应。

### Task 5: Team API 客户端
**文件**: `src/services/team/client.ts` (新建)
**内容**: 基于现有 `tauriFetchJson` 模式，封装所有 team API 调用函数。参考 `src/services/cloudSync/client.ts` 的模式。

---

## Phase 3: 前端状态管理

### Task 6: useOrgStore
**文件**: `src/stores/useOrgStore.ts` (新建)
**内容**: Zustand store 管理组织/项目状态：
- `orgs`, `currentOrg`, `currentProject`
- `members`, `projects`
- actions: `fetchOrgs`, `createOrg`, `switchOrg`, `inviteMember`, `fetchProjects`, `createProject`

### Task 7: useTaskStore
**文件**: `src/stores/useTaskStore.ts` (新建)
**内容**: 管理任务状态，支持多视图数据派生：
- `tasks`, `filters`, `sortBy`, `groupBy`, `currentView`
- 派生: `filteredTasks`, `kanbanColumns`, `calendarEvents`, `ganttItems`
- actions: `fetchTasks`, `createTask`, `updateTask`, `deleteTask`, `moveTask`, `reorderTask`

### Task 8: useAnnotationStore
**文件**: `src/stores/useAnnotationStore.ts` (新建)
**内容**: 管理文档批注：
- `annotations`, `activeAnnotation`
- actions: `fetchAnnotations`, `createAnnotation`, `reply`, `resolve`

### Task 9: useNotificationStore
**文件**: `src/stores/useNotificationStore.ts` (新建)
**内容**: 管理通知：
- `notifications`, `unreadCount`
- actions: `fetchNotifications`, `markRead`, `markAllRead`
- WebSocket 实时推送监听

---

## Phase 4: 组织管理 UI

### Task 10: 组织切换器组件
**文件**: `src/components/team/OrgSwitcher.tsx` (新建)
**内容**: 下拉组件，显示用户所属组织列表，支持切换和创建新组织。嵌入 Sidebar 顶部。

### Task 11: 组织设置面板
**文件**: `src/components/team/OrgSettingsPanel.tsx` (新建)
**内容**: 组织名称编辑、成员列表、邀请成员、角色管理。

### Task 12: Sidebar 集成
**文件**: `src/components/layout/Sidebar.tsx` (修改)
**内容**: 在 sidebar 顶部添加 OrgSwitcher，当选中组织后显示项目列表区域。

---

## Phase 5: 多视图任务系统 UI

### Task 13: 任务表格视图
**文件**: `src/components/team/TaskTableView.tsx` (新建)
**内容**: 基于 TanStack Table，可排序/筛选/分组的任务表格。复用现有 database 组件模式。

### Task 14: 任务看板视图
**文件**: `src/components/team/TaskKanbanView.tsx` (新建)
**内容**: 基于 @hello-pangea/dnd，按状态分列的拖拽看板。

### Task 15: 任务日历视图
**文件**: `src/components/team/TaskCalendarView.tsx` (新建)
**内容**: 基于 @schedule-x/react，按 due_date 展示任务日历。

### Task 16: 任务甘特图视图
**文件**: `src/components/team/TaskGanttView.tsx` (新建)
**内容**: 基于 gantt-task-react，展示任务时间线。

### Task 17: 视图切换容器与任务详情面板
**文件**: `src/components/team/TaskViewContainer.tsx`, `src/components/team/TaskDetailPanel.tsx` (新建)
**内容**: 统一的视图切换 tabs + 工具栏（筛选/排序/分组），点击任务弹出侧面板编辑详情。

---

## Phase 6: 实时协作编辑

### Task 18: 后端 Yrs 协作引擎
**文件**: `server/src/collab.rs` (新建), `server/src/state.rs` (修改), `server/Cargo.toml` (修改)
**内容**:
- 添加 `yrs` 依赖
- `CollabHub`: 管理文档级 Y.Doc 实例 (HashMap<doc_id, Arc<Mutex<Doc>>>)
- WebSocket handler `/collab/:doc_id`: 接收 Yjs sync/awareness 协议消息，广播给同文档其他连接
- AppState 添加 `collab: CollabHub`

### Task 19: 前端 Yjs 协作 Provider
**文件**: `src/services/team/collabProvider.ts` (新建), `src/editor/CodeMirrorEditor.tsx` (修改)
**内容**:
- 封装 `y-websocket` WebSocketProvider，连接 `/collab/:doc_id`
- 在 CodeMirrorEditor 中添加 `collabCompartment`
- 当协作模式启用时，加载 `y-codemirror.next` 绑定（yCollab, yUndoManagerKeymap）
- 显示远程用户光标和选区

---

## Phase 7: 文档批注评论

### Task 20: 批注 UI 组件
**文件**: `src/components/team/AnnotationPanel.tsx`, `src/components/team/AnnotationGutter.tsx` (新建)
**内容**:
- `AnnotationGutter`: CodeMirror gutter 插件，在行号旁显示批注标记
- `AnnotationPanel`: 右侧面板，显示当前文档所有批注，支持回复/解决
- 选中文本后可添加批注（浮动按钮）

---

## Phase 8: 通知系统

### Task 21: 通知 UI
**文件**: `src/components/team/NotificationBell.tsx`, `src/components/team/NotificationPanel.tsx` (新建), `src/components/layout/TitleBar.tsx` (修改)
**内容**:
- `NotificationBell`: 标题栏铃铛图标 + 未读计数 badge
- `NotificationPanel`: 下拉通知列表，支持标记已读、点击跳转
- TitleBar 中嵌入 NotificationBell

---

## Phase 9: i18n 与集成测试

> 此阶段在所有功能完成后统一执行，不单独分 task。
> - 为 4 个 locale 文件添加 `team.*` 翻译 key
> - 后端 `cargo test` 确保所有新路由可编译通过
> - 前端 build 确保无类型错误

---

## 依赖关系

```
Phase 1 (T1-T3) → Phase 2 (T4-T5) → Phase 3 (T6-T9) → Phase 4-8 可并行
Phase 6 (T18) 后端 → Phase 6 (T19) 前端
```

## 并行化策略

- T1, T2 可并行（都是后端新增，无交叉）
- T3 依赖 T1+T2
- T4, T5 可并行
- T6-T9 可并行（独立 stores）
- T10-T12 可并行（T12 轻微依赖 T10 但可同时开始）
- T13-T17 可并行（独立视图组件）
- T18, T19 串行（后端先于前端）
- T20, T21 可并行
