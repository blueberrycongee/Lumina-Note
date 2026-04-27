# Self-Hosted Cloud Relay (Docker)

This guide covers a secure, production-style setup for the Lumina cloud relay server.

## Requirements

- A domain name pointing to your server (A/AAAA records).
- Ports `80` and `443` open to the internet.
- Docker + Docker Compose installed.

## Quick Start (Self-Hosted)

1. Create your env file:

```bash
cp .env.example .env
```

2. Edit `.env`:

- `LUMINA_DOMAIN`: your domain (e.g. `relay.example.com`)
- `LUMINA_JWT_SECRET`: a long random string (at least 32 chars)

3. Start the stack:

```bash
docker compose -f docker-compose.selfhost.yml up -d --build
```

4. Verify health:

```bash
curl -fsS https://YOUR_DOMAIN/health
```

5. Register a user:

```bash
curl -X POST https://YOUR_DOMAIN/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

## Desktop App Setup

Open **Settings → Sync**. In the WebDAV section:

- Cloud server: `https://YOUR_DOMAIN`
- Email / Password: the account you registered

Click **Register** or **Login**, pick a Cloud workspace, then run **Test Connection** before **Preview Sync / Sync Now**. The desktop derives the WebDAV URL (`https://YOUR_DOMAIN/dav`) and remote path (`/<workspace_id>`) for you.

## Mobile Pairing

Two options, both reachable from **Settings → Sync**:

- **Same Wi-Fi**: open the Mobile Gateway panel, scan the QR code with the mobile app — no relay needed.
- **Different network**: the mobile app signs into the same self-hosted account; data flows through your relay.

## Hosted Deployment (Official / Existing TLS)

If you already have your own ingress (Nginx, Cloudflare, ALB, etc.), use:

```bash
docker compose -f docker-compose.hosted.yml up -d --build
```

Then configure your proxy to route:

- `https://YOUR_DOMAIN/relay` → `http://localhost:8787/relay`
- `https://YOUR_DOMAIN/auth/*` → `http://localhost:8787/auth/*`
- `https://YOUR_DOMAIN/dav/*` → `http://localhost:8787/dav/*`

## Notes

- Production requires `https/wss`. Do not use raw IP + self-signed TLS for mobile users.
- Data is stored in the `lumina-data` Docker volume.
