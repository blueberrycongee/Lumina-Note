# Code Signing + Auto-update

This doc lists the GitHub Actions secrets that the release workflow needs
after we flip from `tauri-action` to `electron-builder`. Phase 8.3 will
consume these secrets; Phase 8.1/8.2 only prepares the config.

## Auto-update feed

`electron-builder.yml` publishes to GitHub Releases:

```yaml
publish:
  provider: github
  owner: blueberrycongee
  repo: Lumina-Note
  releaseType: release
```

Each release uploads `latest.yml` (Windows/Linux) and `latest-mac.yml`
(macOS). `electron-updater` reads those at runtime — the `autoUpdater`
handler wired in Phase 7.3 (`electron/main/handlers/updater.ts`) drives
the existing `update:resumable-event` UI flow.

## Required GitHub Actions secrets

### macOS notarization + signing
- `APPLE_ID` — Apple ID email used for notarization
- `APPLE_ID_PASSWORD` — app-specific password for that Apple ID
- `APPLE_TEAM_ID` — Apple Developer Team ID (10 chars)
- `CSC_LINK` — base64-encoded `.p12` certificate (Developer ID
  Application)
- `CSC_KEY_PASSWORD` — password for that `.p12`

### Windows signing (optional for 2.0.0)
- `WIN_CSC_LINK` — base64-encoded `.pfx` certificate
- `WIN_CSC_KEY_PASSWORD` — password for that `.pfx`

### Publishing
- `GH_TOKEN` — defaults to `GITHUB_TOKEN` in the workflow. No dedicated
  PAT required as long as the workflow has `contents: write`.

## Local dev

`electron-builder` auto-generates a `dev-app-update.yml` inside the packaged
app. Nothing to commit. To verify the update flow without a full release:

```bash
npm run pack     # builds unpacked app under release/
```

Then point `autoUpdater.setFeedURL` at a staging release or use the
`DEBUG=electron-updater` env var to see the handshake.
