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

在 **设置 → 云端中继** 中填写：

- 中继地址：`wss://你的域名/relay`
- 邮箱 / 密码：你刚注册的账号

点击 **启动**，状态应显示 **已连接**。

## 手机配对

扫码桌面二维码或粘贴配对 payload 即可。

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
