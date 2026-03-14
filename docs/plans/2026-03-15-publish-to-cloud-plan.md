# Publish to Cloud Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow authenticated users to publish their note vault as a publicly accessible static website hosted on the Lumina-Note server.

**Architecture:** Frontend reuses the existing static site generator (`publishSite()`), uploads files to the server via a new WebDAV-like endpoint scoped to `data/sites/{user_id}/`, and a new public route serves the static files. The server already has WebDAV infrastructure (auth, streaming write, path sanitization) — we extract shared helpers and reuse them.

**Tech Stack:** Rust (axum, tokio, sqlx, mime_guess) for server; TypeScript (React, Zustand, Tauri FS/HTTP) for frontend.

**Commit Strategy:** Atomic commits. Each task is one self-contained commit. Every commit compiles and does not break existing functionality.

**Design Doc:** `docs/plans/2026-03-15-publish-to-cloud-design.md`

---

## Task 1: Add `published_sites` table to database

**Files:**
- Modify: `server/src/db.rs`

**Step 1: Add table creation in `init_db()`**

Find the `init_db` function in `db.rs`. Add after the last `CREATE TABLE IF NOT EXISTS` statement:

```rust
sqlx::query(
    "CREATE TABLE IF NOT EXISTS published_sites (
        user_id     TEXT PRIMARY KEY,
        site_url    TEXT NOT NULL,
        published_at INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
    )"
)
.execute(pool)
.await?;
```

**Step 2: Add CRUD functions**

Add at the end of `db.rs`:

```rust
pub async fn upsert_published_site(
    pool: &SqlitePool,
    user_id: &str,
    site_url: &str,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO published_sites (user_id, site_url, published_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET site_url = ?, updated_at = ?",
    )
    .bind(user_id)
    .bind(site_url)
    .bind(now)
    .bind(now)
    .bind(site_url)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("upsert published site: {}", e)))?;
    Ok(())
}

pub async fn get_published_site(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Option<(String, i64, i64)>, AppError> {
    let row: Option<(String, i64, i64)> = sqlx::query_as(
        "SELECT site_url, published_at, updated_at FROM published_sites WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get published site: {}", e)))?;
    Ok(row)
}

pub async fn delete_published_site(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM published_sites WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("delete published site: {}", e)))?;
    Ok(())
}
```

**Step 3: Verify it compiles**

Run: `cd /Users/blueberrycongee/Lumina-Note/server && cargo check`

**Step 4: Commit**

```bash
git add server/src/db.rs
git commit -m "feat(server): add published_sites table and CRUD functions"
```

---

## Task 2: Extract shared helpers from `dav.rs`

**Files:**
- Modify: `server/src/dav.rs`

**Context:** The functions `sanitize_path()`, `authorize_request()`, `respond_get()`, `respond_put()`, `respond_mkcol()`, and `respond_delete()` are currently private (`fn` / `async fn`). We need to make the ones we'll reuse in the sites module `pub(crate)`.

**Step 1: Change visibility of shared functions**

In `dav.rs`, change these function signatures from private to `pub(crate)`:

```rust
// Line ~349: authorize_request
pub(crate) async fn authorize_request(state: &AppState, headers: &HeaderMap) -> Result<String, AppError> {

// Line ~388: sanitize_path
pub(crate) fn sanitize_path(path: &str) -> Result<PathBuf, AppError> {

// Line ~203: respond_get
pub(crate) async fn respond_get(absolute: &Path, metrics: &ServerMetrics) -> Result<Response<Body>, AppError> {

// Line ~272: respond_put
pub(crate) async fn respond_put(absolute: &Path, req: Request<Body>, metrics: &ServerMetrics) -> Result<Response<Body>, AppError> {

// Line ~320: respond_mkcol
pub(crate) async fn respond_mkcol(absolute: &Path) -> Result<Response<Body>, AppError> {

// Line ~330: respond_delete
pub(crate) async fn respond_delete(absolute: &Path) -> Result<Response<Body>, AppError> {
```

Also add a public helper for computing site root path:

```rust
pub(crate) fn site_root(state: &AppState, user_id: &str) -> PathBuf {
    PathBuf::from(&state.config.data_dir)
        .join("sites")
        .join(user_id)
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/blueberrycongee/Lumina-Note/server && cargo check`

**Step 3: Commit**

```bash
git add server/src/dav.rs
git commit -m "refactor(server): expose shared DAV helpers as pub(crate)"
```

---

## Task 3: Create `sites.rs` — static file serving handler

**Files:**
- Create: `server/src/sites.rs`
- Modify: `server/src/main.rs`

**Step 1: Create `sites.rs`**

```rust
use std::path::PathBuf;

use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{Response, StatusCode};
use mime_guess::MimeGuess;
use tokio_util::io::ReaderStream;

use crate::dav;
use crate::error::AppError;
use crate::state::AppState;

/// Serve published site files: GET /sites/{user_id}/*path
/// No authentication required — public access.
pub async fn serve_site_file(
    State(state): State<AppState>,
    AxumPath((user_id, path)): AxumPath<(String, String)>,
) -> Result<Response<Body>, AppError> {
    let site_dir = dav::site_root(&state, &user_id);
    if !site_dir.exists() {
        return Err(AppError::NotFound);
    }

    let relative = dav::sanitize_path(&path)?;

    let mut absolute = site_dir.join(&relative);

    // If path points to a directory or is empty, serve index.html
    if absolute.is_dir() || path.is_empty() {
        absolute = absolute.join("index.html");
    }

    if !absolute.exists() || !absolute.is_file() {
        return Err(AppError::NotFound);
    }

    // Security: ensure resolved path is still under site_dir
    let canonical = absolute
        .canonicalize()
        .map_err(|_| AppError::NotFound)?;
    let site_canonical = site_dir
        .canonicalize()
        .map_err(|_| AppError::NotFound)?;
    if !canonical.starts_with(&site_canonical) {
        return Err(AppError::Forbidden);
    }

    let metadata = tokio::fs::metadata(&absolute)
        .await
        .map_err(|_| AppError::NotFound)?;
    let file = tokio::fs::File::open(&absolute)
        .await
        .map_err(|e| AppError::Internal(format!("open site file: {}", e)))?;

    let content_type = MimeGuess::from_path(&absolute)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    let stream = ReaderStream::new(file);
    let body = Body::wrap_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Content-Length", metadata.len())
        .header("Cache-Control", "public, max-age=300")
        .body(body)
        .map_err(|e| AppError::Internal(format!("build response: {}", e)))
}

/// Serve published site root: GET /sites/{user_id}
pub async fn serve_site_root(
    State(state): State<AppState>,
    AxumPath(user_id): AxumPath<String>,
) -> Result<Response<Body>, AppError> {
    serve_site_file(
        State(state),
        AxumPath((user_id, String::new())),
    )
    .await
}
```

**Step 2: Register module and routes in `main.rs`**

Add `mod sites;` after the existing module declarations (line 10):

```rust
mod sites;
```

Add routes in the router chain (after the `/dav` routes, before `.with_state(state)`):

```rust
// Published sites (public, no auth)
.route("/sites/:user_id", get(sites::serve_site_root))
.route("/sites/:user_id/*path", get(sites::serve_site_file))
```

**Step 3: Verify it compiles**

Run: `cd /Users/blueberrycongee/Lumina-Note/server && cargo check`

**Step 4: Commit**

```bash
git add server/src/sites.rs server/src/main.rs
git commit -m "feat(server): add public static file serving for published sites"
```

---

## Task 4: Create WebDAV sites upload endpoint

**Files:**
- Modify: `server/src/dav.rs`
- Modify: `server/src/main.rs`

**Context:** We need a WebDAV endpoint scoped to `data/sites/{user_id}/` where the user_id comes from the JWT token (not the URL). This prevents users from writing to other users' sites.

**Step 1: Add site upload handlers in `dav.rs`**

Add at the end of `dav.rs` (before the `PropEntry` struct):

```rust
pub async fn handle_site_dav_root(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    handle_site_dav(state, "".to_string(), req).await
}

pub async fn handle_site_dav_path(
    State(state): State<AppState>,
    AxumPath(path): AxumPath<String>,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    handle_site_dav(state, path, req).await
}

async fn handle_site_dav(
    state: AppState,
    path: String,
    req: Request<Body>,
) -> Result<Response<Body>, AppError> {
    let user_id = authorize_request(&state, req.headers()).await?;

    let root = site_root(&state, &user_id);
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|e| AppError::Internal(format!("create site dir: {}", e)))?;

    let relative = sanitize_path(&path)?;
    let absolute = root.join(&relative);

    match req.method().as_str() {
        "OPTIONS" => respond_options(),
        "PUT" => respond_put(&absolute, req, &state.metrics).await,
        "MKCOL" => respond_mkcol(&absolute).await,
        "DELETE" => respond_delete(&absolute).await,
        _ => Ok(Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .body(Body::empty())
            .map_err(|e| AppError::Internal(format!("build response: {}", e)))?),
    }
}
```

**Step 2: Register routes in `main.rs`**

Add after the sites GET routes:

```rust
// Site publishing (WebDAV upload, auth required)
.route("/dav-sites", any(dav::handle_site_dav_root))
.route("/dav-sites/*path", any(dav::handle_site_dav_path))
```

**Step 3: Verify it compiles**

Run: `cd /Users/blueberrycongee/Lumina-Note/server && cargo check`

**Step 4: Commit**

```bash
git add server/src/dav.rs server/src/main.rs
git commit -m "feat(server): add WebDAV upload endpoint for site publishing"
```

---

## Task 5: Add publish status API endpoints

**Files:**
- Modify: `server/src/routes.rs`
- Modify: `server/src/models.rs`
- Modify: `server/src/main.rs`

**Step 1: Add model in `models.rs`**

Add at the end:

```rust
// ── Publish ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PublishStatusResponse {
    pub published: bool,
    pub url: Option<String>,
    pub published_at: Option<i64>,
    pub updated_at: Option<i64>,
}
```

**Step 2: Add route handlers in `routes.rs`**

Add before the `// ── Tests` section:

```rust
// ── Publish ─────────────────────────────────────────────────────────

pub async fn publish_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<models::PublishStatusResponse>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    match db::get_published_site(&state.pool, &user_id).await? {
        Some((url, published_at, updated_at)) => Ok(Json(models::PublishStatusResponse {
            published: true,
            url: Some(url),
            published_at: Some(published_at),
            updated_at: Some(updated_at),
        })),
        None => Ok(Json(models::PublishStatusResponse {
            published: false,
            url: None,
            published_at: None,
            updated_at: None,
        })),
    }
}

pub async fn publish_confirm(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let site_url = format!("/sites/{}/", user_id);
    db::upsert_published_site(&state.pool, &user_id, &site_url).await?;
    Ok(Json(json!({ "ok": true, "url": site_url })))
}

pub async fn unpublish(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    db::delete_published_site(&state.pool, &user_id).await?;

    // Remove site files from disk
    let site_dir = crate::dav::site_root(&state, &user_id);
    if site_dir.exists() {
        tokio::fs::remove_dir_all(&site_dir)
            .await
            .map_err(|e| AppError::Internal(format!("remove site dir: {}", e)))?;
    }

    Ok(Json(json!({ "ok": true })))
}
```

**Step 3: Register routes in `main.rs`**

Add after the dav-sites routes:

```rust
// Publish status API
.route("/publish/status", get(routes::publish_status).post(routes::publish_confirm))
.route("/publish", delete(routes::unpublish))
```

**Step 4: Verify it compiles**

Run: `cd /Users/blueberrycongee/Lumina-Note/server && cargo check`

**Step 5: Run `cargo fmt` and `cargo test`**

```bash
cd /Users/blueberrycongee/Lumina-Note/server && cargo fmt && cargo test
```

**Step 6: Commit**

```bash
git add server/src/routes.rs server/src/models.rs server/src/main.rs
git commit -m "feat(server): add publish status/confirm/unpublish API endpoints"
```

---

## Task 6: Add i18n translation keys for cloud publish

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/zh-TW.ts`
- Modify: `src/i18n/locales/ja.ts`

**Step 1: Add keys to settingsModal section in all 4 locales**

In `en.ts` (after the existing `publishOpenVaultFirst` key):

```typescript
publishToCloud: 'Publish to Cloud',
publishToCloudDesc: 'Upload your site to the server for public access',
cloudPublishing: 'Uploading...',
cloudUploadProgress: '{current}/{total} files',
cloudPublishSuccess: 'Published successfully',
cloudPublishFailed: 'Cloud publish failed',
cloudPublicUrl: 'Public URL',
cloudCopyUrl: 'Copy',
cloudUrlCopied: 'Copied!',
cloudUpdatePublish: 'Update',
cloudUnpublish: 'Unpublish',
cloudUnpublishConfirm: 'This will remove your published site. Continue?',
cloudUnpublishSuccess: 'Site unpublished',
cloudLastPublished: 'Last published',
cloudSignInToPublish: 'Sign in to publish to cloud',
```

In `zh-CN.ts`:

```typescript
publishToCloud: '发布到云端',
publishToCloudDesc: '将站点上传到服务器，公开访问',
cloudPublishing: '正在上传...',
cloudUploadProgress: '{current}/{total} 个文件',
cloudPublishSuccess: '发布成功',
cloudPublishFailed: '云端发布失败',
cloudPublicUrl: '公开链接',
cloudCopyUrl: '复制',
cloudUrlCopied: '已复制！',
cloudUpdatePublish: '更新发布',
cloudUnpublish: '取消发布',
cloudUnpublishConfirm: '这将移除已发布的站点，是否继续？',
cloudUnpublishSuccess: '已取消发布',
cloudLastPublished: '上次发布',
cloudSignInToPublish: '请登录以发布到云端',
```

In `zh-TW.ts`:

```typescript
publishToCloud: '發布到雲端',
publishToCloudDesc: '將站點上傳到伺服器，公開存取',
cloudPublishing: '正在上傳...',
cloudUploadProgress: '{current}/{total} 個檔案',
cloudPublishSuccess: '發布成功',
cloudPublishFailed: '雲端發布失敗',
cloudPublicUrl: '公開連結',
cloudCopyUrl: '複製',
cloudUrlCopied: '已複製！',
cloudUpdatePublish: '更新發布',
cloudUnpublish: '取消發布',
cloudUnpublishConfirm: '這將移除已發布的站點，是否繼續？',
cloudUnpublishSuccess: '已取消發布',
cloudLastPublished: '上次發布',
cloudSignInToPublish: '請登入以發布到雲端',
```

In `ja.ts`:

```typescript
publishToCloud: 'クラウドに公開',
publishToCloudDesc: 'サイトをサーバーにアップロードして公開',
cloudPublishing: 'アップロード中...',
cloudUploadProgress: '{current}/{total} ファイル',
cloudPublishSuccess: '公開しました',
cloudPublishFailed: 'クラウド公開に失敗しました',
cloudPublicUrl: '公開URL',
cloudCopyUrl: 'コピー',
cloudUrlCopied: 'コピーしました！',
cloudUpdatePublish: '更新',
cloudUnpublish: '公開を取り消す',
cloudUnpublishConfirm: '公開サイトを削除します。続行しますか？',
cloudUnpublishSuccess: '公開を取り消しました',
cloudLastPublished: '最終公開日時',
cloudSignInToPublish: 'クラウドに公開するにはログインしてください',
```

**Step 2: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts src/i18n/locales/zh-TW.ts src/i18n/locales/ja.ts
git commit -m "i18n: add cloud publish translation keys for 4 locales"
```

---

## Task 7: Create cloud upload service

**Files:**
- Create: `src/services/publish/cloudUpload.ts`

**Context:** This service handles uploading a local site directory to the server via WebDAV, checking publish status, and unpublishing.

**Step 1: Create the service**

```typescript
import { readDir, readFile } from "@/lib/tauri";

interface UploadSiteParams {
  localDir: string;
  baseUrl: string;
  token: string;
  onProgress?: (current: number, total: number) => void;
}

interface PublishStatus {
  published: boolean;
  url: string | null;
  publishedAt: number | null;
  updatedAt: number | null;
}

async function davRequest(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: Uint8Array,
): Promise<Response> {
  const url = `${baseUrl}/dav-sites/${path}`.replace(/\/+/g, "/").replace(":/", "://");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers["Content-Type"] = "application/octet-stream";
  }
  const resp = await fetch(url, { method, headers, body });
  if (!resp.ok && resp.status !== 201 && resp.status !== 204) {
    throw new Error(`DAV ${method} ${path} failed: ${resp.status}`);
  }
  return resp;
}

async function collectFiles(dir: string, prefix: string = ""): Promise<string[]> {
  const entries = await readDir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.children !== undefined) {
      const subFiles = await collectFiles(`${dir}/${entry.name}`, relativePath);
      files.push(...subFiles);
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

export async function uploadSiteToCloud(params: UploadSiteParams): Promise<void> {
  const { localDir, baseUrl, token, onProgress } = params;

  // 1. Clear old site content
  try {
    await davRequest(baseUrl, token, "DELETE", "");
  } catch {
    // Ignore — directory may not exist yet
  }

  // 2. Collect all local files
  const files = await collectFiles(localDir);
  const total = files.length;

  // 3. Track created directories to avoid duplicate MKCOLs
  const createdDirs = new Set<string>();

  // 4. Upload each file
  for (let i = 0; i < files.length; i++) {
    const relativePath = files[i];

    // Create parent directories
    const parts = relativePath.split("/");
    for (let j = 1; j < parts.length; j++) {
      const dirPath = parts.slice(0, j).join("/");
      if (!createdDirs.has(dirPath)) {
        try {
          await davRequest(baseUrl, token, "MKCOL", dirPath);
        } catch {
          // Directory may already exist
        }
        createdDirs.add(dirPath);
      }
    }

    // Upload file
    const content = await readFile(`${localDir}/${relativePath}`);
    await davRequest(baseUrl, token, "PUT", relativePath, content);

    onProgress?.(i + 1, total);
  }
}

export async function getCloudPublishStatus(
  baseUrl: string,
  token: string,
): Promise<PublishStatus> {
  const resp = await fetch(`${baseUrl}/publish/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Failed to get publish status: ${resp.status}`);
  return resp.json();
}

export async function confirmCloudPublish(
  baseUrl: string,
  token: string,
): Promise<{ ok: boolean; url: string }> {
  const resp = await fetch(`${baseUrl}/publish/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) throw new Error(`Failed to confirm publish: ${resp.status}`);
  return resp.json();
}

export async function unpublishFromCloud(
  baseUrl: string,
  token: string,
): Promise<void> {
  const resp = await fetch(`${baseUrl}/publish`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Failed to unpublish: ${resp.status}`);
}
```

**Note:** The `readDir` and `readFile` imports must match the actual Tauri FS API used in this project. Read `src/lib/tauri.ts` to verify the correct import paths and function signatures. The `fetch` calls should use `tauriFetch` if the project wraps fetch for Tauri — check `src/services/team/client.ts` for the pattern used.

**Step 2: Commit**

```bash
git add src/services/publish/cloudUpload.ts
git commit -m "feat: add cloud upload service for site publishing"
```

---

## Task 8: Extend usePublishStore with cloud state

**Files:**
- Modify: `src/stores/usePublishStore.ts`

**Step 1: Add cloud publish state and methods**

Replace the entire file with:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PublishConfigState {
  outputDir: string;
  basePath: string;
  postsBasePath: string;
  assetsBasePath: string;
}

export type CloudPublishStatus = "idle" | "uploading" | "published" | "error";

interface PublishState {
  config: PublishConfigState;
  setPublishConfig: (updates: Partial<PublishConfigState>) => void;
  resetOutputDir: () => void;

  // Cloud publish state
  cloudStatus: CloudPublishStatus;
  uploadProgress: { current: number; total: number } | null;
  publishedUrl: string | null;
  lastPublishedAt: number | null;
  cloudError: string | null;

  setCloudStatus: (status: CloudPublishStatus) => void;
  setUploadProgress: (progress: { current: number; total: number } | null) => void;
  setPublishedUrl: (url: string | null) => void;
  setLastPublishedAt: (ts: number | null) => void;
  setCloudError: (error: string | null) => void;
  resetCloudState: () => void;
}

const defaultConfig: PublishConfigState = {
  outputDir: "",
  basePath: "",
  postsBasePath: "",
  assetsBasePath: "",
};

export const usePublishStore = create<PublishState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setPublishConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),
      resetOutputDir: () =>
        set((state) => ({
          config: { ...state.config, outputDir: "" },
        })),

      // Cloud publish state
      cloudStatus: "idle" as CloudPublishStatus,
      uploadProgress: null,
      publishedUrl: null,
      lastPublishedAt: null,
      cloudError: null,

      setCloudStatus: (status) => set({ cloudStatus: status }),
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      setPublishedUrl: (url) => set({ publishedUrl: url }),
      setLastPublishedAt: (ts) => set({ lastPublishedAt: ts }),
      setCloudError: (error) => set({ cloudError: error }),
      resetCloudState: () =>
        set({
          cloudStatus: "idle",
          uploadProgress: null,
          publishedUrl: null,
          lastPublishedAt: null,
          cloudError: null,
        }),
    }),
    {
      name: "lumina-publish",
      partialize: (state) => ({
        config: state.config,
        publishedUrl: state.publishedUrl,
        lastPublishedAt: state.lastPublishedAt,
      }),
    }
  )
);
```

**Step 2: Commit**

```bash
git add src/stores/usePublishStore.ts
git commit -m "feat: extend usePublishStore with cloud publish state"
```

---

## Task 9: Add cloud publish UI to PublishSettingsSection

**Files:**
- Modify: `src/components/settings/PublishSettingsSection.tsx`

**Context:** Add a "Cloud Publish" section below the existing local publish UI. Uses `useCloudSyncStore` for auth status and `usePublishStore` for cloud state.

**Step 1: Add cloud publish section**

After the existing `</section>` closing tag (line 149), add a new section. The component needs to:

1. Import `useCloudSyncStore` and cloud upload functions
2. Read `authStatus`, `session`, `serverBaseUrl` from CloudSync store
3. Read `cloudStatus`, `uploadProgress`, `publishedUrl`, `lastPublishedAt`, `cloudError` from publish store
4. Implement `handleCloudPublish()`:
   - Set status to 'uploading'
   - Call `publishSite()` to generate to temp dir
   - Call `uploadSiteToCloud()` with progress callback
   - Call `confirmCloudPublish()` to record on server
   - Set publishedUrl and lastPublishedAt
5. Implement `handleUnpublish()`:
   - Confirm dialog
   - Call `unpublishFromCloud()`
   - Reset cloud state
6. Show appropriate UI based on auth and publish state

**The exact implementation should:**
- Follow the existing component's styling patterns (same button classes, text sizes, spacing)
- Show a divider between local and cloud sections
- When not authenticated: show `t.settingsModal.cloudSignInToPublish` message
- When authenticated + not published: show "Publish to Cloud" button
- When uploading: show progress `{current}/{total} files`
- When published: show URL with copy button, update button, unpublish button, timestamp
- Error state: show error with retry

**Step 2: Commit**

```bash
git add src/components/settings/PublishSettingsSection.tsx
git commit -m "feat: add cloud publish UI to settings panel"
```

---

## Task 10: Verify full flow and push

**Step 1: Run frontend tests**

```bash
cd /Users/blueberrycongee/Lumina-Note && npx vitest run
```

**Step 2: Run TypeScript type check**

```bash
cd /Users/blueberrycongee/Lumina-Note && npx tsc --noEmit
```

**Step 3: Run server tests and checks**

```bash
cd /Users/blueberrycongee/Lumina-Note/server && cargo fmt && cargo clippy && cargo test
```

**Step 4: Push branch**

```bash
git push origin main
```

---

## Summary

| Task | Description | Scope | Files |
|------|-------------|-------|-------|
| 1 | DB: published_sites table + CRUD | Server | db.rs |
| 2 | Refactor: expose shared DAV helpers | Server | dav.rs |
| 3 | Static file serving for /sites/ | Server | sites.rs, main.rs |
| 4 | WebDAV upload endpoint /dav-sites/ | Server | dav.rs, main.rs |
| 5 | Publish status/confirm/unpublish API | Server | routes.rs, models.rs, main.rs |
| 6 | i18n: cloud publish keys (4 locales) | Frontend | 4 locale files |
| 7 | Cloud upload service | Frontend | cloudUpload.ts |
| 8 | Extend usePublishStore | Frontend | usePublishStore.ts |
| 9 | Cloud publish UI | Frontend | PublishSettingsSection.tsx |
| 10 | Verify + push | Both | - |

**Total commits: 9** (atomic)
**New files: 2** (sites.rs, cloudUpload.ts)
**Modified files: ~12**
**Server tasks: 1-5** (can be done independently of frontend)
**Frontend tasks: 6-9** (depend on server API contract but not implementation)
