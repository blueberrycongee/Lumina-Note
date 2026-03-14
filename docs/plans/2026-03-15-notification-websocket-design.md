# Notification WebSocket Push - Design Document

> Date: 2026-03-15
> Status: Approved

## Goal

Replace the 60-second polling mechanism for notifications with WebSocket push, so users receive notifications in real-time.

## Current State

- `NotificationBell.tsx` polls `GET /notifications/unread-count` every 60 seconds
- `NotificationPanel.tsx` fetches full list on open via `GET /notifications?limit=50`
- Server has REST endpoints for notifications but no push mechanism
- Server already has WebSocket infrastructure (`collab.rs` for Yjs, `relay.rs` for mobile sync)

## Architecture

```
Client connects: GET /ws/notifications?token=xxx
  -> Server validates JWT, registers user's WebSocket sender in NotifyHub
  -> Server holds connection open (ping/pong keepalive)

When a notification is created (e.g. task assigned, annotation reply):
  -> Server calls notify_hub.send(user_id, notification_json)
  -> NotifyHub finds all WebSocket senders for that user
  -> Pushes JSON message to each connected client
  -> Client updates unreadCount and prepends to notification list
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Protocol | JSON over WebSocket | Notifications are small, structured data. No need for binary. |
| Fallback | Keep polling as degraded mode | WebSocket may fail behind proxies. 60s polling as backup. |
| Multi-device | One user can have multiple connections | User may have desktop + mobile. NotifyHub stores `Vec<Sender>` per user. |
| Push granularity | Push full notification object | Client can display immediately without extra API call. |

---

## Server Changes (Rust)

### 1. New module: `notify_ws.rs`

**NotifyHub** — global connection pool:

```rust
pub struct NotifyHub {
    connections: Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<Message>>>>>,
}
```

Methods:
- `new()` — create empty hub
- `register(user_id, sender)` — add a connection
- `unregister(user_id, sender)` — remove a connection (by pointer equality or ID)
- `send(user_id, payload: &str)` — broadcast to all connections for a user, remove dead senders

**WebSocket handler** (`notify_handler`):
1. Extract `token` from query params
2. Validate JWT, extract `user_id`
3. Upgrade to WebSocket
4. Register sender in NotifyHub
5. Send initial unread count as first message: `{"type":"unread","count":N}`
6. Loop: forward hub messages to client, respond to Ping with Pong
7. On disconnect: unregister from NotifyHub

### 2. Integrate NotifyHub into AppState

Add `notify: NotifyHub` field to `AppState` in `state.rs`.

### 3. Push notifications on creation

In `routes.rs`, wherever notifications are created (currently no explicit creation — this is a hook point for when task assignment, annotation reply, etc. trigger notifications), call:

```rust
state.notify.send(&recipient_user_id, &serde_json::to_string(&notification)?);
```

For now, add a utility function `push_notification()` in routes that creates the DB record AND pushes via WebSocket.

### 4. Route registration

```rust
.route("/ws/notifications", get(notify_ws::notify_handler))
```

---

## Frontend Changes (TypeScript)

### 1. Extend `useNotificationStore`

New state:
```typescript
wsConnected: boolean
```

New methods:
```typescript
connectWebSocket(baseUrl: string, token: string): void
disconnectWebSocket(): void
```

Internal: store the WebSocket instance, handle reconnection with exponential backoff (reuse pattern from `collabProvider.ts`).

### 2. Modify `NotificationBell.tsx`

Replace the polling `useEffect` with:

```typescript
useEffect(() => {
  if (authStatus === 'authenticated' && session?.token && serverBaseUrl) {
    connectWebSocket(serverBaseUrl, session.token);
  }
  return () => disconnectWebSocket();
}, [authStatus, session?.token, serverBaseUrl]);

// Fallback polling when WebSocket is not connected
useEffect(() => {
  if (wsConnected) return; // WebSocket active, no polling needed
  fetchUnreadCount();
  const interval = setInterval(fetchUnreadCount, 60_000);
  return () => clearInterval(interval);
}, [wsConnected, fetchUnreadCount]);
```

### 3. WebSocket message handling

On receiving a message from `/ws/notifications`:

```typescript
// Message format: { type: "notification", data: NotificationSummary }
//            or: { type: "unread", count: number }
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'unread') {
    setUnreadCount(msg.count);
  } else if (msg.type === 'notification') {
    prependNotification(msg.data);
    setUnreadCount((c) => c + 1);
  }
};
```

---

## Message Protocol

Client -> Server: only Ping/Pong (keepalive)

Server -> Client:
```json
{ "type": "unread", "count": 5 }
```
```json
{
  "type": "notification",
  "data": {
    "id": "uuid",
    "org_id": "uuid",
    "type": "task_assigned",
    "title": "New task assigned",
    "body": "You have been assigned to...",
    "ref_id": "task-uuid",
    "read": false,
    "created_at": 1710000000
  }
}
```

---

## Not In Scope (YAGNI)

- Desktop OS notifications (system tray)
- Sound alerts
- Notification preferences (mute/filter)
- Read receipts via WebSocket (keep using REST)
- Batch push (one message per notification is fine at this scale)
