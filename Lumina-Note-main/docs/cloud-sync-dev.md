# Cloud Sync (Dev) - Local Server

This doc describes how to run the local Lumina Sync Server and connect the desktop app via WebDAV.

## Run the server

From repo root:
```bash
cd server
export LUMINA_BIND=127.0.0.1:8787
export LUMINA_DB_URL=sqlite://data/lumina.db
export LUMINA_DATA_DIR=data
export LUMINA_JWT_SECRET=dev-secret-change-me
cargo run
```

Health check:
```bash
curl http://127.0.0.1:8787/health
```

## Register / login

Register:
```bash
curl -X POST http://127.0.0.1:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

Login:
```bash
curl -X POST http://127.0.0.1:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

The response includes:
- `token`
- `user_id`
- `workspaces` (pick `id`)

## Desktop WebDAV config

Use WebDAV settings:
- `server_url`: `http://127.0.0.1:8787/dav`
- `username`: your email
- `password`: your password
- `remote_base_path`: `/<workspace_id>`

Then run "Test Connection" and "Sync".

## Cloud relay (dev)

Relay endpoint:
- `ws://127.0.0.1:8787/relay?client=desktop`
- `ws://127.0.0.1:8787/relay?client=mobile`

Pairing payload format (cloud):
```json
{
  "v": 1,
  "token": "<jwt>",
  "relay_url": "ws://127.0.0.1:8787/relay?client=mobile"
}
```

You can obtain the `token` from `/auth/login` response and paste this payload into the mobile app.

## Notes

- This is a dev-only local setup (HTTP). Production must use TLS.
- Data is stored under `server/data/` and is ignored by git.
