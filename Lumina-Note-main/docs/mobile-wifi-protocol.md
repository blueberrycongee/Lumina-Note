# Mobile Wi-Fi Protocol (MVP)

This doc defines the LAN-only mobile pairing and command protocol used by Lumina Note.

## Goals
- Pair a phone on the same Wi-Fi network.
- Stream agent output to the phone.
- Send tasks from the phone to the desktop agent.

## Scope
- LAN only (no public relay).
- WebSocket transport.
- Streaming output required.

## Server lifecycle
- Start: `invoke("mobile_start_server")`
- Stop: `invoke("mobile_stop_server")`
- Status: `invoke("mobile_get_status")`

默认绑定 `0.0.0.0:0` 以便同一局域网内设备配对。如需仅本机访问，请设置：

```
LUMINA_MOBILE_BIND=127.0.0.1:0
```

`mobile_start_server` returns:
```json
{
  "running": true,
  "token": "ABC123XYABC123XYABC123XYABC123XY",
  "port": 18999,
  "addresses": ["192.168.1.10"],
  "ws_urls": ["ws://192.168.1.10:18999/ws"],
  "pairing_payload": "{\"v\":1,\"token\":\"ABC123XYABC123XYABC123XYABC123XY\",\"port\":18999,\"addresses\":[\"192.168.1.10\"],\"ws_path\":\"/ws\"}"
}
```

## Pairing payload (QR content)
The QR code should encode the `pairing_payload` JSON string. Example:
```json
{
  "v": 1,
  "token": "ABC123XYABC123XYABC123XYABC123XY",
  "port": 18999,
  "addresses": ["192.168.1.10"],
  "ws_path": "/ws"
}
```

## WebSocket endpoint
Connect to: `ws://{address}:{port}/ws`

Note: the current server accepts any path, but `/ws` is the documented endpoint.

## Message format
All messages are JSON with `type` + `data`:
```json
{ "type": "pair", "data": { ... } }
```

### Client -> Server
Pair:
```json
{ "type": "pair", "data": { "token": "ABC123XYABC123XYABC123XYABC123XY", "device_name": "iPhone" } }
```

Session create:
```json
{ "type": "session_create", "data": { "title": "新对话" } }
```

Command:
```json
{
  "type": "command",
  "data": {
    "session_id": "rust-session-123",
    "task": "Summarize this folder",
    "context": {
      "active_note_path": "/path/to/note.md",
      "active_note_content": "..."
    }
  }
}
```

Ping:
```json
{ "type": "ping", "data": { "timestamp": 1730000000000 } }
```

### Server -> Client
Paired:
```json
{ "type": "paired", "data": { "session_id": "uuid" } }
```

Command ACK:
```json
{ "type": "command_ack", "data": { "command_id": "uuid", "status": "accepted" } }
```

Agent event (streaming):
```json
{
  "type": "agent_event",
  "data": {
    "session_id": "rust-session-123",
    "event": {
      "type": "message_chunk",
      "data": { "content": "Hello", "agent": "executor" }
    }
  }
}
```

Session list:
```json
{
  "type": "session_list",
  "data": {
    "sessions": [
      {
        "id": "rust-session-123",
        "title": "新对话",
        "session_type": "agent",
        "created_at": 1738400000000,
        "updated_at": 1738401234000,
        "last_message_preview": "你好，我可以帮你…",
        "last_message_role": "assistant",
        "message_count": 8
      }
    ]
  }
}
```

Pong:
```json
{ "type": "pong", "data": { "timestamp": 1730000000000 } }
```

Error:
```json
{ "type": "error", "data": { "message": "Agent config not set" } }
```

## Notes
- The desktop must have a workspace path and agent config set before accepting commands.
- The mobile client should treat `agent_event` payload as the same schema used by the desktop UI.
