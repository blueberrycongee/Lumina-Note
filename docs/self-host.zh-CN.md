# 自部署云端中继（Docker）

本指南提供安全优先的自部署方案（含自动 TLS）。

## 先决条件

- 已有域名并指向服务器（A/AAAA 解析）。
- 服务器对外开放 `80/443` 端口。
- 已安装 Docker 与 Docker Compose。

## 一键启动（自部署）

1. 生成环境变量文件：

```bash
cp .env.example .env
```

2. 编辑 `.env`：

- `LUMINA_DOMAIN`：你的域名（例如 `relay.example.com`）
- `LUMINA_JWT_SECRET`：足够长的随机字符串（建议 >= 32 位）

3. 启动：

```bash
docker compose -f docker-compose.selfhost.yml up -d --build
```

4. 健康检查：

```bash
curl -fsS https://你的域名/health
```

5. 注册账号：

```bash
curl -X POST https://你的域名/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

## 桌面端配置

打开 **设置 → Sync**，在 WebDAV 区块填写：

- Cloud server：`https://你的域名`
- 邮箱 / 密码：你刚注册的账号

点击 **Register** 或 **Login**，选择一个 Cloud workspace。界面会自动派生：

- Derived WebDAV URL：`https://你的域名/dav`
- Derived remote path：`/<workspace_id>`

点击 **Test Connection** 成功后，再执行 **Preview Sync / Sync Now**。

## 手机配对

同一个 **设置 → Sync** 页面下有两条路径：

- **同一 Wi-Fi**：打开 Mobile Gateway 面板，移动端扫码即可，不走中继。
- **跨网络**：移动端登录同一个 self-host 账号，数据经你的 relay 中转。

## 官方托管 / 自有 TLS（已有反向代理）

如果你已有 Nginx / Cloudflare / ALB 等统一入口，用：

```bash
docker compose -f docker-compose.hosted.yml up -d --build
```

然后让反代转发：

- `https://你的域名/relay` → `http://localhost:8787/relay`
- `https://你的域名/auth/*` → `http://localhost:8787/auth/*`
- `https://你的域名/dav/*` → `http://localhost:8787/dav/*`

## 备注

- 生产环境必须 `https/wss`，不建议用 IP + 自签证书。
- 数据存放在 `lumina-data` Docker 卷中。
