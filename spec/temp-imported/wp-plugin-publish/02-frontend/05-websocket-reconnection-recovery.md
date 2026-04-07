# WebSocket Reconnection & State Recovery

> **Location:** `spec/wp-plugin-publish/02-frontend/05-websocket-reconnection-recovery.md`  
> **Status:** Implemented  
> **Updated:** 2026-02-09

---

## Problem

When the WebSocket connection drops (network interruption, backend restart, laptop sleep), events broadcast during the disconnection window are permanently lost. Without recovery, the frontend displays stale data — missed publish completions, unnoticed file changes, outdated plugin states — until the user manually refreshes.

---

## Architecture

```
  Timeline:
  ──────────────────────────────────────────────────────────────────
  ▶ Connected       ▶ Disconnect        ▶ Reconnect
    (events flow)     (events LOST)       (state reconciliation)
  ──────────────────────────────────────────────────────────────────
                      │                   │
                      │ downtimeMs        │ 1. Fire __reconnected event
                      │ tracked           │ 2. Invalidate all query keys
                      │                   │ 3. React Query re-fetches
                      ▼                   ▼
```

### Components

| Component | Role |
|-----------|------|
| `src/lib/ws.ts` | Core WebSocket client with reconnect tracking |
| `src/hooks/useWebSocket.ts` | React hook that reconciles state on reconnect |
| React Query cache | Automatically re-fetches invalidated queries |

---

## How It Works

### 1. Disconnect Detection (`ws.ts`)

When `onclose` fires, the client records the disconnect timestamp:

```typescript
this.disconnectedAt = Date.now();
```

### 2. Reconnection with Exponential Backoff

The existing reconnection mechanism uses exponential backoff:

| Parameter | Value |
|-----------|-------|
| Initial delay | 3,000ms |
| Backoff multiplier | 1.5× |
| Max delay | 60,000ms |
| Max attempts | 10 |

### 3. Reconnect Event (`ws.ts`)

On successful reconnect (not first connect), the client emits an internal `__reconnected` event:

```typescript
// Fired only on reconnection, not initial connect
wsClient.onReconnect(({ downtimeMs, reconnectAttempts }) => {
  // Reconcile state here
});
```

The event carries:
- `downtimeMs` — how long the connection was down
- `reconnectAttempts` — how many retries were needed

### 4. State Reconciliation (`useWebSocket.ts`)

On reconnect, the hook invalidates **all critical query keys** to force React Query to re-fetch fresh state:

```typescript
// Core data that may have changed during downtime
queryClient.invalidateQueries({ queryKey: ["plugins"] });
queryClient.invalidateQueries({ queryKey: ["sites"] });
queryClient.invalidateQueries({ queryKey: ["fileChanges"] });
queryClient.invalidateQueries({ queryKey: ["backups"] });
queryClient.invalidateQueries({ queryKey: ["e2e", "runs"] });
queryClient.invalidateQueries({ queryKey: ["errors"] });
queryClient.invalidateQueries({ queryKey: ["error-history"] });
queryClient.invalidateQueries({ queryKey: ["site-health-summaries"] });
queryClient.invalidateQueries({ queryKey: ["site-health-stats"] });
```

This is a **broad invalidation** strategy — it re-fetches more than strictly necessary, but guarantees no stale data remains. Since React Query only re-fetches queries that have active observers (mounted components), the actual network cost is limited to visible data.

---

## Design Decisions

### Why Broad Invalidation Instead of Event Replay?

| Approach | Pros | Cons |
|----------|------|------|
| **Event replay** (server buffers missed events) | Minimal re-fetch | Requires server-side event log, complex ordering, deduplication |
| **Broad invalidation** (re-fetch all active queries) | Simple, stateless, guaranteed correct | Slightly more network traffic on reconnect |

We chose **broad invalidation** because:
1. The backend already has REST endpoints for all state — no new infrastructure needed
2. React Query's observer-based invalidation limits actual fetches to mounted components
3. Reconnections are infrequent (seconds of downtime, not minutes of continuous polling)
4. Event replay would require maintaining a per-client event buffer on the backend, adding significant complexity

### Why `__reconnected` Uses Double Underscore?

The `__reconnected` event uses a double-underscore prefix to signal it's an **internal lifecycle event**, not a domain event. It's never serialized over the wire — it only fires locally within the browser.

---

## What This Does NOT Cover

| Scenario | Current Behavior | Future Improvement |
|----------|----------------|--------------------|
| Active publish operation interrupted | User sees stale progress; must check publish history | Could track in-flight operations and resume progress polling |
| WS permanently unreachable (max attempts) | Silent — header indicator shows disconnected | Could show a persistent banner with manual reconnect |
| Tab backgrounded for hours | Reconnects on foreground, but staleTime may mask old data | Could reduce staleTime for critical queries after long downtime |

---

## Testing

To verify reconnection recovery:

1. Open the app with DevTools Network tab
2. Navigate to a data-heavy page (Dashboard, Plugins, Sites)
3. Disconnect the backend (stop the Go server)
4. Make changes (e.g., manually modify a plugin file)
5. Restart the backend
6. Observe: WS reconnects → console logs `[WS] Reconciling state after reconnect` → queries re-fetch → UI updates

---

## Related

- `src/lib/ws.ts` — WebSocket client
- `src/hooks/useWebSocket.ts` — React hook with reconciliation
- `src/hooks/useWebSocketStatus.ts` — Connection status UI
- `spec/wp-plugin-publish/02-frontend/` — Frontend architecture
