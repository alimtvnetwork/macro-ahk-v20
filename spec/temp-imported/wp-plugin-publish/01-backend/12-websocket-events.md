# 12 – WebSocket Events

> **Location:** `spec/wp-plugin-publish/01-backend/12-websocket-events.md`  
> **Updated:** 2026-02-01

---

## Overview

The WebSocket system provides real-time communication between the admin dashboard and backend services. It uses a publish/subscribe model with namespaced events.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      WebSocket Hub                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────────────┐         ┌───────────────┐                   │
│   │   Clients     │◀───────▶│   Event Bus   │                   │
│   │   (Browser)   │         │               │                   │
│   └───────────────┘         └───────┬───────┘                   │
│                                     │                            │
│           ┌─────────────────────────┼─────────────────────────┐ │
│           ▼                         ▼                         ▼ │
│   ┌───────────────┐         ┌───────────────┐         ┌───────┐│
│   │ File Watcher  │         │ Sync Service  │         │Publish││
│   └───────────────┘         └───────────────┘         └───────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connection Protocol

### Handshake

```javascript
// Client connection
const ws = new WebSocket('wss://example.com/plugins-onboard/ws');

ws.onopen = () => {
    // Authenticate
    ws.send(JSON.stringify({
        type: 'auth',
        token: 'jwt_token_here',
        client_id: 'client_abc123'
    }));
};

// Server response
{
    "type": "auth:success",
    "client_id": "client_abc123",
    "session_id": "sess_xyz789",
    "capabilities": ["subscribe", "publish"]
}
```

### Heartbeat

```javascript
// Client sends ping every 30 seconds
{ "type": "ping", "ts": 1706745600000 }

// Server responds
{ "type": "pong", "ts": 1706745600050 }
```

---

## Event Categories

### File Events

| Event | Payload | Description |
|-------|---------|-------------|
| `file:created` | `{plugin, path, hash}` | New file detected |
| `file:modified` | `{plugin, path, old_hash, new_hash}` | File content changed |
| `file:deleted` | `{plugin, path}` | File removed |
| `file:renamed` | `{plugin, old_path, new_path}` | File moved/renamed |
| `files:batch` | `{plugin, changes[]}` | Batch of changes |

### Sync Events

| Event | Payload | Description |
|-------|---------|-------------|
| `sync:started` | `{sync_id, plugin, site_id}` | Sync operation began |
| `sync:progress` | `{sync_id, progress, file}` | Transfer progress |
| `sync:file_done` | `{sync_id, file, status}` | Single file complete |
| `sync:conflict` | `{sync_id, conflict}` | Conflict detected |
| `sync:complete` | `{sync_id, result}` | Sync finished |
| `sync:failed` | `{sync_id, error}` | Sync error |

### Publish Events

| Event | Payload | Description |
|-------|---------|-------------|
| `publish:started` | `{publish_id, plugin, site_id, version}` | Publish began |
| `publish:stage` | `{publish_id, stage, status}` | Stage progress |
| `publish:complete` | `{publish_id, result}` | Publish finished |
| `publish:failed` | `{publish_id, error}` | Publish error |
| `publish:rollback` | `{publish_id, backup_id}` | Rollback triggered |

### Backup Events

| Event | Payload | Description |
|-------|---------|-------------|
| `backup:started` | `{backup_id, plugin, type}` | Backup began |
| `backup:progress` | `{backup_id, progress}` | Backup progress |
| `backup:complete` | `{backup_id, result}` | Backup finished |
| `backup:failed` | `{backup_id, error}` | Backup error |
| `restore:started` | `{backup_id, target}` | Restore began |
| `restore:complete` | `{backup_id, result}` | Restore finished |

### Site Events

| Event | Payload | Description |
|-------|---------|-------------|
| `site:connected` | `{site_id, url}` | New site connected |
| `site:disconnected` | `{site_id, reason}` | Site disconnected |
| `site:status_change` | `{site_id, status}` | Site status update |
| `site:error` | `{site_id, error}` | Site error occurred |

### System Events

| Event | Payload | Description |
|-------|---------|-------------|
| `system:ready` | `{}` | System initialized |
| `system:error` | `{error, severity}` | System error |
| `system:maintenance` | `{message, eta}` | Maintenance mode |
| `config:updated` | `{key, value}` | Config changed |

---

## Message Format

### Standard Message Structure

```typescript
interface WSMessage {
    type: string;              // Event type (namespaced)
    id?: string;               // Message ID for correlation
    ts: number;                // Timestamp (ms)
    payload: Record<string, any>;
}
```

### Examples

```json
// File change event
{
    "type": "file:modified",
    "id": "msg_123",
    "ts": 1706745600000,
    "payload": {
        "plugin": "my-plugin",
        "path": "includes/class-core.php",
        "old_hash": "abc123",
        "new_hash": "def456"
    }
}

// Sync progress event
{
    "type": "sync:progress",
    "id": "msg_124",
    "ts": 1706745601000,
    "payload": {
        "sync_id": "sync_xyz",
        "progress": 0.45,
        "current_file": "assets/js/main.js",
        "bytes_transferred": 45000,
        "bytes_total": 100000
    }
}
```

---

## Subscription Model

### Subscribe to Events

```javascript
// Subscribe to specific events
ws.send(JSON.stringify({
    type: 'subscribe',
    channels: [
        'file:*',           // All file events
        'sync:my-plugin',   // Sync events for specific plugin
        'publish:*'         // All publish events
    ]
}));

// Server confirmation
{
    "type": "subscribe:success",
    "channels": ["file:*", "sync:my-plugin", "publish:*"]
}
```

### Unsubscribe

```javascript
ws.send(JSON.stringify({
    type: 'unsubscribe',
    channels: ['file:*']
}));
```

### Channel Patterns

| Pattern | Matches |
|---------|---------|
| `file:*` | All file events |
| `sync:my-plugin` | Sync events for my-plugin |
| `sync:*:site_123` | Sync events for site 123 |
| `*:error` | All error events |
| `*` | All events (admin only) |

---

## Client Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `auth` | `{token}` | Authenticate connection |
| `subscribe` | `{channels[]}` | Subscribe to channels |
| `unsubscribe` | `{channels[]}` | Unsubscribe from channels |
| `ping` | `{ts}` | Heartbeat ping |
| `request` | `{action, params}` | Request-response pattern |

### Request-Response Pattern

```javascript
// Client request
{
    "type": "request",
    "id": "req_123",
    "action": "get_sync_status",
    "params": { "plugin": "my-plugin" }
}

// Server response
{
    "type": "response",
    "id": "req_123",
    "success": true,
    "data": { "status": "idle", "last_sync": "..." }
}
```

---

## Error Handling

### Error Message Format

```json
{
    "type": "error",
    "code": "AUTH_FAILED",
    "message": "Authentication token expired",
    "details": {
        "expires_at": "2024-01-31T11:00:00Z"
    }
}
```

### Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `AUTH_FAILED` | Invalid/expired token | Re-authenticate |
| `AUTH_REQUIRED` | No authentication | Send auth message |
| `RATE_LIMITED` | Too many messages | Wait and retry |
| `INVALID_MESSAGE` | Malformed message | Check format |
| `CHANNEL_DENIED` | No permission | Check subscription |
| `CONNECTION_TIMEOUT` | No heartbeat | Reconnect |

---

## PHP Server Implementation

```php
<?php
namespace PluginsOnboard\WebSocket;

class EventHub {
    
    /** @var array<string, callable[]> */
    private array $listeners = [];
    
    /** @var array<string, Connection[]> */
    private array $subscriptions = [];
    
    /**
     * Emit an event to subscribers
     */
    public function emit(string $event, array $payload): void {
        $message = [
            'type' => $event,
            'ts' => round(microtime(true) * 1000),
            'payload' => $payload
        ];
        
        foreach ($this->getSubscribers($event) as $connection) {
            $connection->send(json_encode($message));
        }
    }
    
    /**
     * Register event listener
     */
    public function on(string $event, callable $handler): void {
        $this->listeners[$event][] = $handler;
    }
    
    /**
     * Subscribe connection to channel
     */
    public function subscribe(
        Connection $connection,
        array $channels
    ): void;
    
    /**
     * Get subscribers matching event
     */
    private function getSubscribers(string $event): array;
}
```

---

## JavaScript Client

```typescript
type WsEventCallback<T = unknown> = (payload: T) => void;

interface WsOutgoingMessage<T = unknown> {
    type: string;
    payload: T;
}

class PluginsOnboardWS {
    private ws: WebSocket;
    private listeners: Map<string, Set<WsEventCallback>>;
    private reconnectAttempts: number = 0;
    
    constructor(url: string, token: string) {
        this.connect(url, token);
    }
    
    on<T = unknown>(event: string, callback: WsEventCallback<T>): () => void {
        // Add listener, return unsubscribe function
    }
    
    emit<T>(event: string, payload: T): void {
        // Send message to server
    }
    
    subscribe(channels: string[]): void {
        this.ws.send(JSON.stringify({
            type: 'subscribe',
            channels,
        }));
    }
    
    private handleMessage(event: MessageEvent): void {
        const msg: WsOutgoingMessage = JSON.parse(event.data);
        this.listeners.get(msg.type)?.forEach(cb => cb(msg.payload));
        this.listeners.get('*')?.forEach(cb => cb(msg));
    }
    
    private reconnect(): void {
        // Exponential backoff reconnection
    }
}
```

---

## Rate Limiting

| Limit | Value | Scope |
|-------|-------|-------|
| Messages/second | 50 | Per connection |
| Subscriptions | 100 | Per connection |
| Message size | 64KB | Per message |
| Connections | 10 | Per user |

---

## Security

- **Authentication**: JWT token required within 5 seconds of connection
- **Authorization**: Channel subscriptions validated against user permissions
- **Encryption**: WSS (TLS) required in production
- **Origin**: CORS validation on connection

---

*See also: [06-file-watcher.md](06-file-watcher.md), [07-sync-service.md](07-sync-service.md)*
