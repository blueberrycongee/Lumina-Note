# Lumina Plugin Manifest v1

本文档定义 Lumina 插件 `plugin.json` 的推荐字段与约束，用于手动安装阶段和后续生态演进。

配套 schema：`docs/plugin-manifest.schema.json`

## Example

```json
{
  "id": "hello-lumina",
  "name": "Hello Lumina",
  "version": "0.1.0",
  "description": "Example plugin",
  "author": "Lumina",
  "homepage": "https://example.com",
  "entry": "index.js",
  "min_app_version": "0.1.0",
  "api_version": "1",
  "permissions": [
    "commands:*",
    "vault:read",
    "vault:write",
    "workspace:*",
    "editor:*",
    "ui:*",
    "storage:*",
    "network:*",
    "runtime:*"
  ],
  "enabled_by_default": true,
  "is_desktop_only": false
}
```

## Fields

- `id` (`string`, required)
  - 插件唯一标识，建议与目录名一致。
- `name` (`string`, required)
  - 显示名称。
- `version` (`string`, required)
  - 语义化版本，格式推荐 `x.y.z`。
- `entry` (`string`, required)
  - 插件入口文件，相对插件根目录。
- `description` (`string`, optional)
- `author` (`string`, optional)
- `homepage` (`string`, optional)
- `min_app_version` (`string`, optional)
  - 插件可运行的最低 Lumina 版本。
- `api_version` (`string`, optional)
  - 插件 API 版本，默认 `1`。
- `permissions` (`string[]`, optional)
  - 权限列表。支持精细权限（如 `vault:read`）和命名空间通配符（如 `vault:*`）以及全量通配符（`*`）。
- `enabled_by_default` (`boolean`, optional, default `true`)
- `is_desktop_only` (`boolean`, optional, default `false`)

## Permission model

推荐分组如下：

- `commands:*`
- `vault:*`
- `workspace:*`
- `editor:*`
- `ui:*`
- `storage:*`
- `network:*`
- `runtime:*`
- `interop:*`

精细权限可按需拆分，例如：

- `vault:read` / `vault:write` / `vault:move` / `vault:delete`
- `editor:read` / `editor:write` / `editor:decorate`
- `ui:notify` / `ui:theme` / `ui:decorate`

## Compatibility notes

- 手动安装阶段，推荐插件在启动时自行检测关键 API 是否存在。
- Lumina 宿主应使用 `min_app_version` 与 `api_version` 做兼容判断并在 UI 显示状态。
- Lumina 会对 manifest 执行严格校验：缺失必填字段、非法 `id`、非法 `entry`、非法语义化版本将阻止加载，并返回结构化错误信息。
  - 错误结构：`code` / `field` / `message`
