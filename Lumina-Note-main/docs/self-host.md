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

Open **Settings → Cloud Relay** and use:

- Relay URL: `wss://YOUR_DOMAIN/relay`
- Email / Password: the account you registered

Click **Start** and ensure the status shows **Connected**.

## Mobile Pairing

Scan the QR code from the desktop app or paste the pairing payload into the mobile app.

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
