# Electron 可供逆向版本：安装包提取与高价值逻辑恢复报告

日期：2026-03-13  
样本路径：`/Applications/electron 可供逆向版本.app`  
恢复目录：`/Users/blueberrycongee/Lumina-Note/tmp/electron-reverse-demo/recovered`

## 1. 结论摘要

这个演示样本足以证明一件事：即使安装包已经签名、公证、并以 `asar` 形式发布，只要核心业务逻辑仍然随客户端分发，攻击者仍然可以在很短时间内恢复出高价值代码和关键业务接口。

本次恢复没有依赖专用逆向工具链，也没有做二进制层面的复杂分析，只做了三件事：

1. 读取 `asar` 头部并展开文件。
2. 对单行打包 JavaScript 做格式化还原。
3. 在恢复后的代码里搜索账号、授权、订阅、同步和主进程桥接逻辑。

最终直接拿到了以下高价值信息：

- 包结构与前端入口文件。
- 账号 API 基址与接口路径。
- 登录、令牌续期、订阅、商业授权、vault 操作相关接口。
- 账户对象在本地的持久化字段。
- 商业许可与 Catalyst 相关设置面板入口。
- Electron/Node 桥接的可见入口。

## 2. 样本确认

从应用包可确认它是标准 Electron 分发结构，关键资源位于：

- `Contents/Resources/app.asar`
- `Contents/Resources/obsidian.asar`

其中：

- `app.asar` 暴露主进程相关代码与 `package.json`
- `obsidian.asar` 暴露前端核心代码、HTML、CSS、业务 JS、多语言和库文件

`obsidian.asar` 内可直接枚举出如下文件名：

- `app.js`
- `main.js`
- `starter.js`
- `sim.js`
- `worker.js`
- `index.html`
- `help.js`
- `package.json`

这说明“攻击者连里面有什么模块都不知道”的前提并不成立。

## 3. 可复现演示步骤

### 步骤 1：复制或直接读取安装包

本次演示直接读取安装包：

```bash
ls -lah "/Applications/electron 可供逆向版本.app/Contents/Resources"
```

结果可以直接看到 `app.asar` 和 `obsidian.asar`。

### 步骤 2：展开 `asar`

使用工作区里的自动化脚本：

```bash
node scripts/recover-electron-demo.cjs "/Applications/electron 可供逆向版本.app"
```

脚本会把内容解到：

- `tmp/electron-reverse-demo/recovered/raw`
- `tmp/electron-reverse-demo/recovered/pretty`

### 步骤 3：把单行打包 JS 恢复成可读代码

脚本内部会对几个关键文件执行格式化：

- `starter.js`
- `app.js`
- `main.js`
- `help.js`
- `sim.js`
- `worker.js`

恢复后的可读文件位于：

- `tmp/electron-reverse-demo/recovered/pretty/starter.pretty.js`
- `tmp/electron-reverse-demo/recovered/pretty/app.pretty.js`
- `tmp/electron-reverse-demo/recovered/pretty/main.pretty.js`

### 步骤 4：搜索高价值入口

可直接运行：

```bash
rg -n "signin|authtoken|subscription|business|vault/list|vault/create|license|token" \
  tmp/electron-reverse-demo/recovered/pretty
```

这一步已经能直接打到账号、授权、订阅和同步逻辑。

## 4. 恢复出的高价值代码

### 4.1 账号体系与 API 基址

在 `starter.pretty.js` 中可以直接恢复出：

- API 基址拼接逻辑
- 开发态回退地址
- 登录接口
- vault 列表接口
- 账户对象持久化结构

关键位置：

- `starter.pretty.js:1828-1833`
- `starter.pretty.js:1846-1867`
- `starter.pretty.js:1869-1888`
- `starter.pretty.js:1893-1912`
- `starter.pretty.js:1913-1941`

可读结论：

- 客户端直接包含线上 API 基址 `https://api.obsidian.md`
- 开发态回退到 `http://127.0.0.1:3000`
- 登录使用 `/user/signin`
- 远程 vault 列表使用 `/vault/list`
- 账户对象直接保存 `email`、`name`、`token`、`license`、`key`
- 这些字段被写入 `localStorage`

这意味着攻击者不仅知道“有账号体系”，还知道客户端到底保存了哪些核心状态。

### 4.2 订阅与商业授权接口

在 `app.pretty.js` 中可以直接恢复出完整的订阅和商业许可接口族。

关键位置：

- `app.pretty.js:63849-63868`
- `app.pretty.js:63870-63875`
- `app.pretty.js:63877-63899`
- `app.pretty.js:63967-63999`
- `app.pretty.js:64017-64106`
- `app.pretty.js:64108-64136`

可读结论：

- 存在 `/user/authtoken`
- 存在 `/subscription/sync/signup-mobile`
- 存在 `/subscription/business`
- 存在 `/subscription/list`
- 存在 `/vault/list`
- 存在 `/vault/create`
- 存在 `/vault/migrate`
- 存在 `/vault/rename`
- 存在 `/vault/access`
- 存在 `/publish/delete`
- 存在 `/publish/share/invite`
- 存在 `/publish/share/remove`

攻击者由此可以准确判断产品的商业能力边界、同步能力边界、远程资源模型和授权体系划分。

### 4.3 本地持久化的账户与许可证字段

`app.pretty.js:64108-64136` 和 `starter.pretty.js:1913-1941` 都显示账户对象会在本地保存：

- `email`
- `name`
- `token`
- `license`
- `key`

这不是“猜测可能有 token”，而是恢复出了具体字段名和持久化结构。

### 4.4 商业许可 UI 与产品分层

在设置面板逻辑里，可以直接恢复出商业许可和 Catalyst 的展示与入口。

关键位置：

- `app.pretty.js:195164-195172`
- `app.pretty.js:195349-195388`
- `app.pretty.js:195415-195493`

可读结论：

- 客户端有独立的 `commercialLicenseSetting`
- 客户端根据 `license` 字段区分 Catalyst 展示状态
- 客户端根据 `key`、`keyValidation`、`company`、`seats`、`expiry` 渲染商业许可信息
- 客户端暴露了激活、移除、购买等交互入口

这使攻击者可以非常快地定位商业化逻辑入口，而不需要盲猜。

### 4.5 Electron 桥接与本地能力暴露

`starter.pretty.js:1805-1819` 显示：

- 代码使用 `window.require`
- 可以取到 `electron`
- 可以调用 `ipcRenderer.sendSync("is-dev")`
- 可以调用 `ipcRenderer.sendSync("file-url")`

这说明客户端运行时能力并不是纯 Web 沙盒，分析者很容易顺着 Electron 桥继续摸主进程边界。

## 5. “打包前 vs 破解后”对照

严格意义上的“打包前源码目录”本次没有在本机定位到，因此这里给出的不是源码仓库级别 diff，而是更适合向老板展示的对照：原始安装包形态 vs 恢复后的等价可读逻辑。

| 维度 | 安装包里的原始形态 | 恢复后的形态 |
| --- | --- | --- |
| 前端入口 | `index.html` 只显示加载 `enhance.js`、`i18n.js`、`app.js` | 可以直接定位入口文件和加载顺序 |
| 业务 JS | `app.js` / `starter.js` 是单行打包产物 | 被格式化成可读代码，可按函数和变量继续分析 |
| 账号逻辑 | 隐藏在 bundle 内部 | 可直接读到 `/user/signin`、`/user/authtoken`、本地 token 保存结构 |
| 订阅逻辑 | 隐藏在 bundle 内部 | 可直接读到 `/subscription/list`、`/subscription/business` |
| 商业许可 | UI 表面上只是设置项 | 可恢复 `commercialLicenseSetting`、`keyValidation`、`company`、`seats`、`expiry` |
| 同步/远程 vault | 功能表现为远程服务 | 可恢复 `/vault/list`、`/vault/create`、`/vault/migrate`、`/vault/access` |
| 运行时能力 | 对用户是桌面 App | 可恢复 `window.require("electron")` 与 `ipcRenderer` 入口 |

给老板的关键点不是“是否 100% 还原源码目录结构”，而是：

> 打包后的安装包已经足够让攻击者恢复最值钱的产品逻辑、商业接口和运行时边界。

## 6. 为什么这个演示足以证明预算必要

这次恢复没有用到：

- 源码仓库权限
- 调试符号
- sourcemap
- 高级反编译器
- 内核级调试

只要产品把高价值逻辑继续留在客户端，攻击者就可以通过展开归档、格式化代码、关键字检索，迅速得到：

- 产品商业模型
- 同步/发布能力结构
- 账号和许可证字段
- 关键接口路径
- 客户端权限边界

所以预算的合理方向应该是：

1. 不把“打包后的前端代码”当作秘密。
2. 把高价值判定尽量后移到服务端。
3. 统一覆盖关键归档的完整性与反篡改，而不是只保护外层壳。
4. 收缩客户端直接暴露的商业状态与字符串痕迹。

## 7. 演示时建议展示的文件

建议现场只开这几个文件，避免信息过多：

- `tmp/electron-reverse-demo/recovered/raw/obsidian/index.html`
- `tmp/electron-reverse-demo/recovered/pretty/starter.pretty.js`
- `tmp/electron-reverse-demo/recovered/pretty/app.pretty.js`
- `tmp/electron-reverse-demo/recovered/pretty/main.pretty.js`

其中重点展示：

1. `starter.pretty.js` 的 API 基址、登录接口、本地 token 保存。
2. `app.pretty.js` 的订阅接口、商业许可接口、商业设置面板。
3. `main.pretty.js` 里主进程边界和打包后仍可读的逻辑体量。

## 8. 一句话结论

这个样本已经证明：对 Electron 这类架构来说，“打包发布”不是“代码保密”。只要最有价值的业务逻辑仍在客户端分发，攻击者就能在安装包层面恢复出足够高价值的代码与产品情报。
