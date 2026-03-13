# Copilot Instructions

- Use the model "opus4.6" for every request. Do not use any smaller or fallback models (including "4omini" or similar).
- If "opus4.6" is unavailable, stop and ask the user to choose how to proceed; do not auto-fallback.

# Claude Code Usage Notes (copied from /Users/blueberrycongee/.claude/CLAUDE.md)

## Domestic direct connection
- `ANTHROPIC_BASE_URL`: `https://kocode2.top/`

## Windows TLS fallback
If you see `ERR_SSL_TLSV1_ALERT_ACCESS_DENIED`, add these env vars to `~/.claude/settings.json` under `env`:
- `API_TIMEOUT_MS`: `3000000`
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`: `1`
- `NODE_TLS_REJECT_UNAUTHORIZED`: `0` (temporary fallback only)

Then restart Claude Code.

## 本机浏览器
- **Google Chrome**: `/Applications/Google Chrome.app`
- **豆包浏览器**: `/Applications/Doubao.app/Contents/Helpers/Doubao Browser.app/Contents/MacOS/Doubao Browser`
- **Safari**: `/Applications/Safari.app`
- **Playwright Chromium**: `/Users/blueberrycongee/Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app`

## 刷热点策略
- 小红书：用 Chrome 或 Playwright 浏览器
- X/Twitter：可尝试豆包浏览器（如果 Chrome 被限制）
- 轮流刷：先刷一个平台，再刷另一个
- 禁止反复询问用户已知信息，自己先查

## Model selection
- Use the model "opus4.6" for every request. Do not use any smaller or fallback models (including "4omini" or similar).
- If "opus4.6" is unavailable, stop and ask the user to choose how to proceed; do not auto-fallback.
