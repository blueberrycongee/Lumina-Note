# Publish to Cloud - Design Document

> Date: 2026-03-15
> Status: Approved

## Goal

Allow authenticated users to publish their note vault as a static website hosted on the Lumina-Note server, accessible via a public URL.

## Architecture Overview

```
User clicks "Publish to Cloud"
  -> Frontend reuses existing publishSite() to generate static files to a temp directory
  -> Frontend uploads files via WebDAV to server path: sites/{user_id}/
  -> Server serves static files at: GET /sites/{user_id}/*path
  -> Public URL: {serverBaseUrl}/sites/{user_id}/
```

Key principle: maximize reuse of existing infrastructure (static site generator + WebDAV).

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Access URL | Sub-path (`/sites/{user_id}/`) | Simple, no DNS config. Reserve sub-domain for future. |
| Upload mechanism | Reuse WebDAV | Already has streaming write, auth, path sanitization, 200MB limit. |
| Visibility | Public (no auth to read) | Publishing means "make visible". Keep private by not publishing. |
| Update strategy | Manual full republish | User controls when content goes live. Avoids publishing drafts. |

---

## Server Changes (Rust)

### 1. Static File Serving Route

New handler in `main.rs`:

```
GET /sites/{user_id}/*path  ->  serve static file from data/sites/{user_id}/
```

Behavior:
- Read file from `{data_dir}/sites/{user_id}/{path}`
- Return with correct Content-Type via `mime_guess` (already a dependency)
- `/sites/{user_id}/` and `/sites/{user_id}` -> serve `index.html`
- File not found -> 404 response
- No authentication required (public access)
- Directory listing disabled (security)

### 2. WebDAV Sites Endpoint

New route group for publishing uploads:

```
ANY /dav-sites/*path  ->  WebDAV handler scoped to data/sites/{user_id}/
```

Details:
- Reuse existing WebDAV handler logic from `dav.rs`
- Root directory: `{data_dir}/sites/{user_id}/` (user_id extracted from JWT)
- Authentication: Bearer JWT required (only owner can write)
- Supported methods: PUT, MKCOL, DELETE, PROPFIND
- Before first upload in a publish cycle, client sends DELETE on root to clear old content

### 3. Publish Metadata API

Two new endpoints:

```
GET    /publish/status   ->  { published: bool, url: string?, publishedAt: number? }
DELETE /publish           ->  Remove site directory + metadata, return { ok: true }
```

### 4. Database Schema

New table `published_sites`:

```sql
CREATE TABLE IF NOT EXISTS published_sites (
    user_id    TEXT PRIMARY KEY,
    site_url   TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

One row per user (a user has at most one published site).

---

## Frontend Changes (TypeScript)

### 1. Extend usePublishStore

New state fields:

```typescript
cloudPublishStatus: 'idle' | 'uploading' | 'published' | 'error'
uploadProgress: { current: number; total: number } | null
publishedUrl: string | null
lastPublishedAt: number | null
cloudError: string | null
```

New methods:

```typescript
publishToCloud(): Promise<void>
unpublishFromCloud(): Promise<void>
fetchCloudPublishStatus(): Promise<void>
```

### 2. publishToCloud() Flow

```
1. Set cloudPublishStatus = 'uploading'
2. Call existing publishSite() -> output to temp directory
3. List all files in temp directory recursively
4. DELETE /dav-sites/ to clear old content
5. For each file:
   a. MKCOL parent directories as needed
   b. PUT /dav-sites/{relative_path} with file content
   c. Update uploadProgress
6. POST /publish/status to record publish time
7. Set cloudPublishStatus = 'published', publishedUrl = URL
8. Clean up temp directory
```

### 3. Extend PublishSettingsSection UI

Add a "Cloud Publish" section below the existing "Local Publish" section:

**When not authenticated:**
- Show: "Sign in to publish to cloud" (reuse auth gate pattern from Sidebar)

**When authenticated, not published:**
- Show: "Publish to Cloud" button
- On click: run publishToCloud(), show progress bar (files uploaded / total)

**When authenticated, already published:**
- Show: public URL with copy button
- Show: "Update" button (re-publish)
- Show: "Unpublish" button (with confirmation)
- Show: last published timestamp

**Upload progress:**
- Progress bar showing `{current}/{total} files`
- File name currently being uploaded

**Error state:**
- Error banner (reuse existing destructive/10 pattern)
- Retry button

### 4. New Service: publishCloudService.ts

```typescript
// Upload all files from a local directory to the server via WebDAV
async function uploadSiteViaWebDav(params: {
  localDir: string;
  baseUrl: string;
  token: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<void>

// Check publish status
async function getPublishStatus(baseUrl: string, token: string): Promise<PublishStatus>

// Remove published site
async function unpublishSite(baseUrl: string, token: string): Promise<void>
```

### 5. i18n Keys

New `publish` namespace additions (4 locales):

```
publishToCloud, publishToCloudDesc, publishing, uploadProgress,
publishedAt, publicUrl, copyUrl, urlCopied, updatePublish,
unpublish, unpublishConfirm, unpublishSuccess,
cloudPublishSuccess, cloudPublishFailed, signInToPublish
```

---

## File Structure

### Server (new/modified files)

```
server/src/
  main.rs              (modify: add /sites and /dav-sites routes)
  sites.rs             (new: static file serving handler)
  dav.rs               (modify: extract shared logic, add sites scope)
  db.rs                (modify: add published_sites table + CRUD)
  routes.rs            (modify: add GET /publish/status, DELETE /publish)
  models.rs            (modify: add PublishStatus struct)
```

### Frontend (new/modified files)

```
src/
  stores/usePublishStore.ts           (modify: add cloud publish state/methods)
  services/publish/cloudUpload.ts     (new: WebDAV upload + status API)
  components/settings/PublishSettingsSection.tsx  (modify: add cloud section)
  i18n/locales/{en,zh-CN,zh-TW,ja}.ts           (modify: add publish keys)
```

---

## Security Considerations

- **Static file serving**: Only serves files, no directory listing, no server-side execution
- **Path traversal**: Reuse existing WebDAV `sanitize_path()` for both upload and serving
- **Upload auth**: JWT required for all write operations
- **Read access**: No auth for GET /sites/* (public by design)
- **Storage limits**: Inherit WebDAV's 200MB per-file limit; consider adding per-user total size limit in the future
- **Content types**: Only serve with `mime_guess`, never execute uploaded files

---

## Not In Scope (YAGNI)

- Sub-domain routing (`username.lumina.app`)
- Incremental uploads (full overwrite is sufficient)
- Automatic sync on note change
- Custom domain support
- CDN / caching layer
- Visitor analytics
- sitemap.xml / robots.txt / SEO
- Rate limiting on publish (future consideration)
- Per-user storage quotas (future consideration)
