# Release workflow

This document describes the recommended release workflow for Lumina Note.

## 1) Update CHANGELOG.md (Required)

**CI will fail if this step is skipped.**

Add a new version section to `CHANGELOG.md`:

```markdown
## [2.0.0] - 2026-04-18

### 新功能
- 功能描述

### 修复
- Bug 修复描述

### 改进
- 改进描述
```

Tip: Run `git log --oneline` to review recent changes.

## 2) Prepare the version

Use the release helper to bump `package.json`:

```sh
npm run release:prepare -- patch
# or
npm run release:prepare -- minor
# or
npm run release:prepare -- major
# or set an explicit version
npm run release:prepare -- --version 2.0.1
```

What it does:
- Updates `package.json` version (no git tag created).
- Echoes the version via `scripts/sync_version.mjs` (kept as a hook; the Rust sidecar is gone in v2, so it's now a no-op).

## 3) Sanity checks (recommended)

```sh
npm run test:run
npm run build
npm run pack         # unpacked app under release/
```

Notes:
- Code signing + notarization are driven by electron-builder through GitHub
  Actions secrets (`APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`,
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`).
  See `docs/electron-signing-and-updates.md` for details.

## 4) Commit the bump

```sh
git add CHANGELOG.md package.json package-lock.json

git commit -m "chore(release): bump version to 2.0.0"
```

## 5) Tag and push

```sh
git tag -a v2.0.0 -m "v2.0.0"

git push origin main
git push origin v2.0.0
```

Pushing the tag triggers `.github/workflows/release.yml`. The workflow runs
`npm run dist:<mac|win|linux>` with `--publish always`, which uploads
installers plus `latest.yml` / `latest-mac.yml` to the GitHub release so
`electron-updater` can pick them up.

## 6) Artifacts naming (local builds)

`npm run dist:<os>` writes installers to `release/`. Rename them if you need
versioned local copies; CI uploads them directly to the release page.

## Troubleshooting

- If CI fails on type errors, run `npx tsc --noEmit` locally.
- If signing fails, double-check the GitHub Actions secrets listed above.
- If `electron-updater` can't find a feed, verify that the release contains
  both the installer and the matching `latest*.yml`.
