# Release workflow

This document describes the recommended release workflow for Lumina Note.

## 1) Update CHANGELOG.md (Required)

**CI will fail if this step is skipped.**

Add a new version section to `CHANGELOG.md`:

```markdown
## [0.4.15] - 2025-03-02

### 新功能
- 功能描述

### 修复
- Bug 修复描述

### 改进
- 改进描述
```

Tip: Run `git log --oneline` to review recent changes.

## 2) Prepare the version

Use the release helper to keep versions and Cargo.lock in sync:

```sh
npm run release:prepare -- patch
# or
npm run release:prepare -- minor
# or
npm run release:prepare -- major
# or set an explicit version
npm run release:prepare -- --version 0.4.14
```

What it does:
- Updates `package.json` version (no git tag created).
- Syncs Tauri config/version via `scripts/sync_version.mjs`.
- Regenerates `src-tauri/Cargo.lock`.

## 3) Sanity checks (recommended)

```sh
npm run build
npm run tauri build
```

Notes:
- The updater bundle requires signing. Set `TAURI_SIGNING_PRIVATE_KEY` (and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if needed) when building for release.

## 4) Commit the bump

```sh
git add CHANGELOG.md package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock

git commit -m "chore(release): bump version to 0.4.14"
```

## 5) Tag and push

```sh
git tag -a v0.4.14 -m "v0.4.14"

git push origin main
git push origin v0.4.14
```

Pushing the tag triggers the release workflow in CI.

## 6) Artifacts naming (local builds)

If you need locally named artifacts with version + timestamp, rename the
outputs after `npm run tauri build`. Typical output locations:
- `src-tauri/target/release/bundle/macos/*.app`
- `src-tauri/target/release/bundle/dmg/*.dmg`

## Troubleshooting

- If CI fails on type errors, run `npm run build` locally and fix the reported
  files before tagging.
- If the updater bundle fails, check signing env vars.
