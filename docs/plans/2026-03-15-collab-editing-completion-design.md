# Collaborative Editing Completion - Design Document

> Date: 2026-03-15
> Status: Approved

## Goal

Make real-time collaborative editing functional end-to-end: wire up the call chain, add remote cursors via Awareness protocol, and persist CRDT state to disk.

## Current State

- **Yjs + yrs infrastructure exists**: `collabProvider.ts` (frontend), `collab.rs` (backend)
- **CodeMirror integration exists**: `collabCompartment` with `yCollab()` binding in `CodeMirrorEditor.tsx`
- **What's missing**:
  1. No document registry — no stable docId mapping, only local file paths
  2. No call site — `createCollabConnection()` is defined but never called
  3. No Awareness protocol — no remote cursors, no user presence
  4. No CRDT persistence — server restart loses all document state
  5. No message type distinction — only raw binary updates, no sync/awareness split

## Architecture Overview

```
User opens team document
  -> Editor.tsx checks: authenticated + doc belongs to org
  -> Creates CollabConnection via createCollabConnection()
  -> Passes to CodeMirrorEditor as collabConnection prop
  -> yCollab(ytext, awareness) binds to CodeMirror

WebSocket protocol (byte 0 = message type):
  0x00 + binary  = Yjs sync update
  0x01 + binary  = Awareness update

Server:
  - Receives updates, applies to in-memory Doc, broadcasts to peers
  - Awareness messages: stateful relay (server tracks awareness per room)
  - Periodically saves Doc state to data/collab/{doc_id}.bin
  - On room creation: loads state from disk if file exists
  - On last peer disconnect: saves state then evicts room from memory
```

## Content Model: CRDT as Source of Truth

When collaborative editing is active, the **CRDT document is the single source of truth**. This requires careful handling of the local file ↔ CRDT boundary:

**First open (CRDT is empty, local file has content):**
- Editor checks if server-side CRDT Doc for this docId has any content (the initial sync message will be non-empty or empty)
- If CRDT is empty (first time collaborating on this file): insert the local file content into `ytext` as the initial value, which propagates to all peers
- If CRDT is non-empty: discard local content and adopt the CRDT state

**During collaboration:**
- All edits flow through Yjs — CodeMirror ↔ yCollab ↔ Y.Doc ↔ WebSocket
- `onChange` callback in Editor.tsx should still write to local disk (as a local cache / backup), but local file is **not** authoritative
- Remote updates applied via yCollab trigger CodeMirror changes, which trigger `onChange` → disk write. This is the expected behavior (local file stays in sync as a side-effect)

**When collaboration ends (user goes offline / leaves team context):**
- `destroy()` the CollabConnection
- Editor falls back to normal local-file mode with the content already in CodeMirror (no flash or reload)

---

## Sub-task B0: Document Registry (prerequisite for B1)

### Problem

Collaborative editing needs a **stable, server-assigned document ID** to identify a shared document room. Currently the only identifier is the local file path (`currentFile` in `useFileStore`), which differs across machines and is unsuitable as a room key.

### Database

Add a `document_registry` table to the existing SQLite database (`server/src/db.rs`):

```sql
CREATE TABLE IF NOT EXISTS document_registry (
    id          TEXT PRIMARY KEY,          -- UUID v4, the stable docId
    project_id  TEXT NOT NULL,             -- owning project
    rel_path    TEXT NOT NULL,             -- path relative to project root (e.g. "notes/meeting.md")
    created_by  TEXT NOT NULL,             -- user_id who first registered the doc
    created_at  INTEGER NOT NULL,          -- unix epoch seconds
    UNIQUE(project_id, rel_path),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

Key decisions:
- `rel_path` is relative to the project root, not an absolute local path — portable across machines
- `UNIQUE(project_id, rel_path)` prevents duplicate registrations
- No `is_deleted` / soft-delete for now (YAGNI)

### Server API

Add a single **upsert** endpoint — returns an existing docId if the (project_id, rel_path) pair is already registered, otherwise creates a new one:

```
POST /projects/:project_id/docs/resolve
Body: { "rel_path": "notes/meeting.md" }
Response: { "doc_id": "550e8400-e29b-..." }
```

Implementation in a new `server/src/docs.rs` module:
```rust
pub async fn resolve_doc(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    claims: Claims,              // JWT auth extractor
    Json(body): Json<ResolveDocRequest>,
) -> Result<Json<ResolveDocResponse>, AppError> {
    // 1. Verify user is a member of the org that owns this project
    // 2. SELECT id FROM document_registry WHERE project_id = ? AND rel_path = ?
    // 3. If found, return it
    // 4. If not, INSERT with new UUID v4 and return it
}
```

### Frontend

**New helper in `src/services/team/client.ts`:**
```typescript
export async function resolveDocId(
  baseUrl: string, token: string,
  projectId: string, relPath: string
): Promise<string>
```

**Usage in Editor.tsx (B1 will consume this):**
```typescript
const docId = await resolveDocId(serverUrl, token, projectId, relPath);
const conn = createCollabConnection({ serverUrl, docId, token, ... });
```

**How to derive `relPath`:**
- Team projects have a known root directory (the project's workspace folder)
- `relPath = path.relative(projectRoot, currentFile)`
- `projectRoot` needs to be stored in `useOrgStore` when a project is opened (may need a small addition to the project data model if not already tracked)

### Files to modify

```
server/src/
  db.rs          (add document_registry table in init_db)
  docs.rs        (new: resolve_doc handler)
  models.rs      (add ResolveDocRequest, ResolveDocResponse)
  main.rs        (add route)
src/
  services/team/client.ts   (add resolveDocId function)
  services/team/types.ts    (add ResolveDocResponse type)
```

---

## Sub-task B1: Wire Up the Call Chain

### Problem

`createCollabConnection()` exists in `collabProvider.ts` but is never called. The `CodeMirrorEditor` accepts `collabConnection` as a prop but nothing passes it.

### Solution

In `Editor.tsx` (the component that renders `CodeMirrorEditor`):

1. Check conditions: `authStatus === 'authenticated'` AND current document is a team document (belongs to an org)
2. If conditions met, call `createCollabConnection({ serverUrl, token, docId, userName, userColor })`
3. Pass the returned `CollabConnection` to `CodeMirrorEditor` via the `collabConnection` prop
4. On document switch or unmount, call `connection.destroy()`

**Note:** `createCollabConnection` takes an **options object**, not positional arguments:
```typescript
createCollabConnection({
  serverUrl: string,   // from useCloudSyncStore or env config
  docId: string,       // server-assigned stable ID (NOT local file path)
  token: string,       // from useCloudSyncStore.session.token
  userName?: string,   // from useCloudSyncStore.email
  userColor?: string,  // hash of user_id
})
```

**serverUrl:** derive from the existing API base URL by replacing `http(s)` with `ws(s)`. Expose a helper in `useCloudSyncStore` or a shared config module.

**docId:** must be a **server-assigned stable identifier** — local file paths differ across machines and are unsuitable. The team project's file registry should provide a stable ID per document. If this doesn't exist yet, it needs to be added as a prerequisite.

**Lifecycle management via `useEffect`:**
```typescript
useEffect(() => {
  if (!authenticated || !currentOrgId || !currentFile) return;
  const conn = createCollabConnection({ ... });
  return () => conn.destroy();
}, [currentFile, currentOrgId, authenticated]);
```

### Files to modify
- `src/editor/Editor.tsx` — add collab connection lifecycle
- `src/stores/useOrgStore.ts` — may need to expose a helper to check if current doc is team-scoped

---

## Sub-task B2: Awareness Protocol (Remote Cursors)

### Problem

No Awareness support — users can't see each other's cursors or know who else is editing.

### Frontend Changes

**collabProvider.ts:**
- Add `y-protocols` as an explicit dependency (`npm install y-protocols`)
- Create `Awareness` instance from `y-protocols/awareness`
- On connect, send local awareness state: `{ user: { name, color } }`
- Handle incoming awareness messages (type byte = 0x01)
- Export `awareness` in the `CollabConnection` return type:
  ```typescript
  export interface CollabConnection {
    ydoc: Y.Doc;
    provider: CustomCollabProvider;
    ytext: Y.Text;
    awareness: Awareness;  // <-- new
    destroy: () => void;
  }
  ```

**Message encoding — avoid unnecessary copies:**
```typescript
// Sync update
const syncMsg = new Uint8Array(1 + updateData.byteLength);
syncMsg[0] = 0;
syncMsg.set(updateData, 1);
ws.send(syncMsg);

// Awareness update
const awaMsg = new Uint8Array(1 + awarenessData.byteLength);
awaMsg[0] = 1;
awaMsg.set(awarenessData, 1);
ws.send(awaMsg);
```

**CodeMirrorEditor.tsx:**
- Pass `awareness` to `yCollab()`:
  ```typescript
  yCollab(collabConnection.ytext, collabConnection.awareness)
  ```
- `y-codemirror.next` handles remote cursor rendering automatically when awareness is provided

**User info:**
- Get display name from `useCloudSyncStore.email` (or future profile name)
- Assign a random color per session (hash of user_id)

### Backend Changes

**Note:** `yrs = "0.21"` does **not** include an awareness module. Awareness on the server is implemented manually as opaque byte storage + relay — the server does not need to decode awareness contents.

**collab.rs — Add awareness state to `CollabRoom`:**

```rust
pub struct CollabRoom {
    doc: std::sync::Mutex<Doc>,
    pub peers: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>,
    /// Raw awareness bytes per peer. Server stores but never decodes these.
    awareness: RwLock<HashMap<String, Vec<u8>>>,
}
```

**collab.rs — Message type distinction:**

Currently all WebSocket messages are treated as Yjs updates. Add a type byte prefix:

```rust
if data.is_empty() { return; }
match data[0] {
    0 => {
        // Sync update: apply to Doc and broadcast
        let update = &data[1..];
        // existing logic: decode_v1, apply, broadcast (with type prefix)
    }
    1 => {
        // Awareness: store raw bytes for this peer, broadcast to others
        room.awareness.write().await.insert(peer_id.clone(), data[1..].to_vec());
        broadcast_to_others(peer_id, &data); // forward as-is (with type prefix)
    }
    _ => {
        tracing::warn!("unknown collab message type: {}", data[0]);
    }
}
```

**New peer awareness bootstrap:**

When a new peer joins, the server sends the stored awareness bytes of all existing peers. Otherwise the new peer won't see any existing cursors until those peers happen to move their cursor.

```rust
// After sending initial doc state to new peer:
let awareness_states = room.awareness.read().await;
for (_pid, raw) in awareness_states.iter() {
    let mut msg = vec![1u8]; // awareness type prefix
    msg.extend_from_slice(raw);
    let _ = tx.send(Message::Binary(msg));
}
```

**Peer disconnect cleanup:**

When a peer leaves (clean or crash), remove its awareness entry and broadcast a removal to remaining peers so their cursors disappear:

```rust
// After removing peer from room.peers:
room.awareness.write().await.remove(&peer_id);
// Broadcast awareness removal — encode via y-protocols format on the frontend,
// or have the server send a custom "peer left" message that the frontend
// translates into an awareness removal. Simplest approach: the frontend
// handles awareness timeout (y-protocols default 30s) as fallback, and the
// server just stops relaying for the dead peer.
```

### Dependencies

- `y-protocols` — must be explicitly added to `package.json` (currently missing, though may exist transitively via `y-codemirror.next`)

---

## Sub-task B3: CRDT Persistence

### Problem

All CRDT state is in-memory. Server restart = all collaborative document state lost.

### Solution

File-based persistence in `data/collab/` directory:

**Save:**
- After applying an update to the room's Doc, mark room as dirty
- A background task (tokio::spawn) runs every 30 seconds, checks dirty rooms, saves state:
  ```rust
  let state = doc.encode_state_as_update_v1(&StateVector::default());
  tokio::fs::write(format!("data/collab/{}.bin", safe_id), state).await?;
  ```
- Also save on last peer disconnect (room becomes empty)
- **Atomic write**: write to `{doc_id}.bin.tmp` first, then `rename` to `{doc_id}.bin`. Prevents corruption from partial writes on crash.
- **Serialized saves**: route all save operations through a dedicated `mpsc` channel to prevent concurrent writes to the same file.

**Load:**
- When `get_or_create_room()` creates a new room, check if `data/collab/{doc_id}.bin` exists
- If yes, read the file and apply as initial state:
  ```rust
  let data = tokio::fs::read(path).await?;
  match Update::decode_v1(&data) {
      Ok(update) => { doc.apply_update(update); }
      Err(e) => {
          tracing::warn!(doc_id = %doc_id, error = %e, "corrupt collab state, starting fresh");
          // Start with empty doc — don't crash
      }
  }
  ```

**doc_id filename safety:**
- Sanitize `doc_id` before using as filename: replace non-alphanumeric characters, or use URL-safe base64 / hex encoding
- Reject `doc_id` containing path separators to prevent directory traversal

**File structure:**
```
data/
  collab/
    {doc_id_1}.bin
    {doc_id_2}.bin
```

### Room Lifecycle & Memory Management

Rooms must not live in memory forever. When the last peer disconnects:

1. Save CRDT state to disk (as above)
2. **Remove the room from `CollabHub.rooms`** — next connection will reload from disk
3. Log the eviction for observability

```rust
// After removing last peer:
let peers = room.peers.read().await;
if peers.is_empty() {
    drop(peers); // release read lock
    save_room_state(&room, &doc_id).await;
    hub.rooms.write().await.remove(&doc_id);
    tracing::info!(doc_id = %doc_id, "room evicted after last peer left");
}
```

### Cleanup

- No automatic cleanup (documents persist until explicitly deleted)
- Future: add TTL-based cleanup for inactive documents

---

## Edge Cases & Mitigations

### P0 — Data Correctness

**Offline edits lost on reconnect:**
`collabProvider.ts` reconnects with the same `Y.Doc`, but `onopen` does not send local state to the server. Edits made while disconnected stay in the local `Y.Doc` but never reach the server.

*Fix:* On reconnect (`onopen`), send a full state update to the server:
```typescript
ws.onopen = () => {
  // ... existing logic ...
  // Sync local state that may have accumulated while offline
  const localState = Y.encodeStateAsUpdate(this.ydoc);
  this.sendSyncMessage(localState); // prepend type byte 0x00
};
```

**Initial sync race condition:**
Current `collab.rs` registers the peer (line 118) before encoding the initial state (line 122). An update from another peer can arrive and be broadcast to the new peer before the initial state is sent, causing the new peer to receive an incremental update on an empty Doc.

*Fix:* Reorder — encode state and send it **before** registering the peer for broadcasts:
```rust
// 1. Encode current state
let state_update = room.encode_state();
// 2. Send initial state through the WebSocket directly (not via channel)
let _ = ws_tx.send(Message::Binary(state_update)).await;
// 3. THEN register peer for future broadcasts
room.peers.write().await.insert(peer_id.clone(), tx.clone());
```

### P1 — Security & Resources

**Token expiry on live connections:**
JWT is only validated at WebSocket upgrade. A revoked/expired token keeps the connection alive indefinitely.

*Fix:* Frontend-side — when auth state changes to unauthenticated (token refresh fails, user logs out), call `connection.destroy()`. This is simpler and more reliable than server-side periodic checks.
```typescript
// In Editor.tsx useEffect:
// Include `authenticated` in dependency array — when it flips to false,
// cleanup runs and destroys the connection.
```

**Stale awareness on client crash:**
A crashed client doesn't send a close frame. Its awareness state (cursor, name) persists for other clients indefinitely.

*Fix:* Server must track awareness state per peer. On peer disconnect (receive loop exits, regardless of clean/unclean close), broadcast an awareness removal message for that peer to all remaining peers:
```rust
// After removing peer from room.peers:
let removal = encode_awareness_removal(peer_id);
broadcast_to_all(&room, &removal).await;
```
Additionally, `y-protocols` Awareness has a built-in 30s timeout on the client side — if no awareness update is received from a peer within 30s, the client considers it offline. The server should periodically relay awareness pings to keep alive states fresh, or rely on the client-side timeout as a fallback.

**Room memory leak:**
Covered in B3 "Room Lifecycle & Memory Management" above.

### P2 — Robustness

**JWT in WebSocket URL:**
Browser limitation — WebSocket API doesn't support custom headers. Token appears in server logs and proxy logs.

*Mitigation:* Use short-lived tokens (≤5 min) specifically for WebSocket connections. Alternatively, authenticate via the first binary message after connection (sub-protocol approach), but this adds complexity. Accept the URL approach for now with short-lived tokens.

**No rate limiting:**
A buggy or malicious client can flood updates. Each update is broadcast to N-1 peers.

*Mitigation (future):* Add per-peer rate limiting (e.g., max 60 updates/sec). Drop excess updates with a warning log. Not required for initial release with trusted users.

**WebSocket message size limit:**
Large documents may produce `encode_state_as_update_v1` payloads that exceed Axum's default max message size.

*Mitigation:* Configure Axum's WebSocket max message size explicitly (e.g., 16 MB). Document the limit. For initial sync of very large documents, consider chunked transfer in a future iteration.

**Multiple tabs same document:**
Same user appears as two peers with duplicate cursors. CRDT correctness is unaffected.

*Accept:* This is a known UX quirk. Not worth solving now. Note in YAGNI.

---

## Not In Scope (YAGNI)

- Follow mode (click avatar to follow scroll position)
- Version history / manual snapshots
- Conflict logging
- Online user list UI panel (remote cursors in editor are sufficient for now)
- Selective sync (always full document sync)
- Document-level permission checks on WebSocket (JWT auth only for now)
- Multi-tab deduplication (same user, same doc, multiple tabs = multiple peers)

---

## File Summary

### Execution Order

**B0 → B1 → B2 → B3** (sequential — each depends on the previous)

### Server (new/modified)

```
server/src/
  db.rs          (modify: add document_registry table)           [B0]
  docs.rs        (new: resolve_doc handler)                      [B0]
  models.rs      (modify: add ResolveDocRequest/Response)        [B0]
  collab.rs      (modify: message type split, awareness state,   [B2, B3]
                  persistence, room eviction, initial sync
                  reorder, peer cleanup)
  main.rs        (modify: add docs route, ensure data/collab/)   [B0, B3]
```

### Frontend (new/modified)

```
src/
  services/team/client.ts          (modify: add resolveDocId)    [B0]
  services/team/types.ts           (modify: add response type)   [B0]
  services/team/collabProvider.ts   (modify: awareness support,  [B2]
                                    message type prefix,
                                    reconnect state sync,
                                    CollabConnection type ext)
  editor/Editor.tsx                 (modify: wire up collab      [B1]
                                    lifecycle, CRDT ↔ file
                                    reconciliation)
  editor/CodeMirrorEditor.tsx       (modify: pass awareness      [B2]
                                    to yCollab)
```

### New dependency

```
y-protocols    (npm install y-protocols)                         [B2]
```
