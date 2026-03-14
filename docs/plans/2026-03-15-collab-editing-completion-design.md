# Collaborative Editing Completion - Design Document

> Date: 2026-03-15
> Status: Approved

## Goal

Make real-time collaborative editing functional end-to-end: wire up the call chain, add remote cursors via Awareness protocol, and persist CRDT state to disk.

## Current State

- **Yjs + yrs infrastructure exists**: `collabProvider.ts` (frontend), `collab.rs` (backend)
- **CodeMirror integration exists**: `collabCompartment` with `yCollab()` binding in `CodeMirrorEditor.tsx`
- **What's missing**:
  1. No call site — `createCollabConnection()` is defined but never called
  2. No Awareness protocol — no remote cursors, no user presence
  3. No CRDT persistence — server restart loses all document state
  4. No message type distinction — only raw binary updates, no sync/awareness split

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
  - Awareness messages: pure relay (no server-side processing)
  - Periodically saves Doc state to data/collab/{doc_id}.bin
  - On room creation: loads state from disk if file exists
```

---

## Sub-task B1: Wire Up the Call Chain

### Problem

`createCollabConnection()` exists in `collabProvider.ts` but is never called. The `CodeMirrorEditor` accepts `collabConnection` as a prop but nothing passes it.

### Solution

In `Editor.tsx` (the component that renders `CodeMirrorEditor`):

1. Check conditions: `authStatus === 'authenticated'` AND current document is a team document (belongs to an org)
2. If conditions met, call `createCollabConnection(serverUrl, token, docId)`
3. Pass the returned `CollabConnection` to `CodeMirrorEditor` via the `collabConnection` prop
4. On document switch or unmount, call `connection.destroy()`

**How to determine "team document":**
- A document is a team document if it's opened from a team project context
- Use `useOrgStore.currentOrgId` — if set, the current workspace is team-scoped
- `docId` = the document's path or a stable identifier

### Files to modify
- `src/editor/Editor.tsx` — add collab connection lifecycle
- `src/stores/useOrgStore.ts` — may need to expose a helper to check if current doc is team-scoped

---

## Sub-task B2: Awareness Protocol (Remote Cursors)

### Problem

No Awareness support — users can't see each other's cursors or know who else is editing.

### Frontend Changes

**collabProvider.ts:**
- Create `Awareness` instance from `y-protocols/awareness`
- On connect, send local awareness state: `{ user: { name, color } }`
- Handle incoming awareness messages (type byte = 0x01)
- Export `awareness` in the `CollabConnection` return object

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

**collab.rs — Message type distinction:**

Currently all WebSocket messages are treated as Yjs updates. Add a type byte prefix:

```rust
match data[0] {
    0 => {
        // Sync update: apply to Doc and broadcast
        let update = &data[1..];
        // existing logic: decode_v1, apply, broadcast
    }
    1 => {
        // Awareness: pure relay, broadcast to all other peers
        broadcast_to_others(peer_id, &data);
    }
    _ => {
        tracing::warn!("unknown message type: {}", data[0]);
    }
}
```

**collabProvider.ts — Send with type prefix:**

```typescript
// Sync update
ws.send(new Uint8Array([0, ...updateData]));

// Awareness update
ws.send(new Uint8Array([1, ...awarenessData]));
```

### Dependencies

- `y-protocols` — may need to add to `package.json` if not already present (provides `awareness` encoding/decoding)

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
  tokio::fs::write(format!("data/collab/{}.bin", doc_id), state).await?;
  ```
- Also save on last peer disconnect (room becomes empty)

**Load:**
- When `get_or_create_room()` creates a new room, check if `data/collab/{doc_id}.bin` exists
- If yes, read the file and apply as initial state:
  ```rust
  let data = tokio::fs::read(path).await?;
  let update = Update::decode_v1(&data)?;
  doc.apply_update(update);
  ```

**File structure:**
```
data/
  collab/
    {doc_id_1}.bin
    {doc_id_2}.bin
```

### Cleanup

- No automatic cleanup (documents persist until explicitly deleted)
- Future: add TTL-based cleanup for inactive documents

---

## Not In Scope (YAGNI)

- Follow mode (click avatar to follow scroll position)
- Version history / manual snapshots
- Conflict logging
- Online user list UI panel (remote cursors in editor are sufficient for now)
- Selective sync (always full document sync)
- Document-level permission checks on WebSocket (JWT auth only for now)

---

## File Summary

### Server (new/modified)

```
server/src/
  collab.rs      (modify: message type split, awareness relay, persistence)
  main.rs        (modify: ensure collab data dir created)
```

### Frontend (new/modified)

```
src/
  services/team/collabProvider.ts  (modify: awareness support, message type prefix)
  editor/Editor.tsx                (modify: wire up collabConnection lifecycle)
  editor/CodeMirrorEditor.tsx      (modify: pass awareness to yCollab)
```
