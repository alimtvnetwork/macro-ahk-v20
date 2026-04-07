# Chrome Extension — Macro Controller ↔ Extension Bridge API

**Spec**: 43  
**Version**: v1.0  
**Date**: 2026-03-19  
**Status**: DRAFT  
**Depends on**: Spec 18 (Message Protocol), Spec 42 (User Script Logging & Data Bridge), Spec 40 (Macro Looping Script Reference)

---

## 1. Purpose

Define how the **injected macro controller** (`macro-looping.js`) communicates bidirectionally with the **Chrome extension** (background service worker) to access extension-hosted services: persistent storage, configuration, structured logging, and action triggers.

This spec is the single source of truth for the macro controller ↔ extension communication architecture.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Page (lovable.dev)                                             │
│                                                                 │
│  ┌──────────────────────────────┐                               │
│  │  macro-looping.js (injected) │                               │
│  │                              │                               │
│  │  window.postMessage({        │                               │
│  │    source: 'marco-controller'│                               │
│  │    type: 'USER_SCRIPT_...'   │                               │
│  │    payload: { ... }          │                               │
│  │  })                          │                               │
│  └──────────┬───────────────────┘                               │
│             │ window.postMessage                                │
│             ▼                                                   │
│  ┌──────────────────────────────┐                               │
│  │  Content Script              │                               │
│  │  (message relay)             │                               │
│  │                              │                               │
│  │  window.addEventListener(    │                               │
│  │    'message', validate →     │                               │
│  │    chrome.runtime.sendMessage│                               │
│  │  )                           │                               │
│  │                              │                               │
│  │  chrome.runtime.onMessage →  │                               │
│  │    window.postMessage (back) │                               │
│  └──────────┬───────────────────┘                               │
└─────────────┼───────────────────────────────────────────────────┘
              │ chrome.runtime.sendMessage
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Background Service Worker                                      │
│                                                                 │
│  message-router.ts → HANDLER_REGISTRY                           │
│    ├── USER_SCRIPT_LOG       → logs.db / errors.db              │
│    ├── USER_SCRIPT_ERROR     → errors.db                        │
│    ├── USER_SCRIPT_DATA_SET  → chrome.storage.local             │
│    ├── USER_SCRIPT_DATA_GET  → chrome.storage.local             │
│    ├── USER_SCRIPT_DATA_DELETE → chrome.storage.local           │
│    ├── USER_SCRIPT_DATA_KEYS → chrome.storage.local             │
│    ├── USER_SCRIPT_DATA_GET_ALL → chrome.storage.local          │
│    └── USER_SCRIPT_DATA_CLEAR → chrome.storage.local            │
│                                                                 │
│  Responses flow back via sendResponse → content script →        │
│  window.postMessage → macro controller                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Communication Flow

### 3.1 Outbound (Macro Controller → Extension)

1. Macro controller calls a helper (e.g., `marco.store.set(key, value)`)
2. Helper constructs a message: `{ source: 'marco-controller', type: 'USER_SCRIPT_DATA_SET', payload: { key, value }, requestId: crypto.randomUUID() }`
3. Calls `window.postMessage(message, '*')`
4. Content script's `window.addEventListener('message')` catches it
5. Content script validates `event.data.source === 'marco-controller'`
6. Content script forwards via `chrome.runtime.sendMessage(event.data)`
7. Background `message-router.ts` routes to the appropriate handler
8. Handler returns response via `sendResponse()`

### 3.2 Inbound (Extension → Macro Controller)

1. Background sends response via `sendResponse()` (for request/response pattern)
2. Content script receives the response from `chrome.runtime.sendMessage` callback
3. Content script posts back: `window.postMessage({ source: 'marco-extension', type: 'RESPONSE', requestId, payload }, '*')`
4. Macro controller resolves the pending Promise associated with `requestId`

### 3.3 Broadcast (Extension → Macro Controller, unsolicited)

1. Background detects a config change or event
2. Sends via `chrome.tabs.sendMessage(tabId, { type: 'CONFIG_UPDATED', payload })`
3. Content script receives and forwards: `window.postMessage({ source: 'marco-extension', type: 'CONFIG_UPDATED', payload }, '*')`
4. Macro controller's `window.addEventListener('message')` handles the broadcast

---

## 4. Available Services

### 4.1 Persistent Storage (via `marco.store`)

| Operation | Message Type | Payload | Response |
|-----------|-------------|---------|----------|
| Set value | `USER_SCRIPT_DATA_SET` | `{ key, value, projectId, scriptId }` | `{ isOk: true }` |
| Get value | `USER_SCRIPT_DATA_GET` | `{ key, projectId }` | `{ value }` |
| Delete key | `USER_SCRIPT_DATA_DELETE` | `{ key, projectId }` | `{ isOk: true }` |
| List keys | `USER_SCRIPT_DATA_KEYS` | `{ projectId }` | `{ keys: string[] }` |
| Get all | `USER_SCRIPT_DATA_GET_ALL` | `{ projectId }` | `{ entries }` |
| Clear | `USER_SCRIPT_DATA_CLEAR` | `{ projectId }` | `{ isOk, cleared }` |

**Constraints** (from Spec 42):
- Key max length: 256 chars
- Value max size: 1 MB (JSON serialized)
- Total store limit: 50 MB
- Max keys per project: 1,000

### 4.2 Structured Logging (via `marco.log`)

| Method | Level | Destination |
|--------|-------|-------------|
| `marco.log.info(msg, meta?)` | INFO | logs.db |
| `marco.log.warn(msg, meta?)` | WARN | logs.db |
| `marco.log.error(msg, meta?)` | ERROR | logs.db + errors.db |
| `marco.log.debug(msg, meta?)` | DEBUG | logs.db |

> **Note**: ERROR level inserts into **both** databases — `logs.db` for the unified log stream and `errors.db` with `error_code = 'USER_SCRIPT_LOG_ERROR'` (per Spec 42 §3.1).

Auto-injected context: `projectId`, `scriptId`, `configId`, `urlRuleId`, `pageUrl`.

### 4.3 Bulk Rename — Undo / History System

The macro controller maintains a client-side undo stack for bulk rename operations:

| Property | Value |
|----------|-------|
| Storage key | `ml_rename_history` (localStorage) |
| Max stack depth | 20 operations (`RENAME_HISTORY_MAX`) |
| Entry schema | `{ timestamp: number, entries: Array<{ wsId: string, oldName: string, newName: string }> }` |
| Restored on load | Yes — `JSON.parse(localStorage.getItem('ml_rename_history'))` |

**Undo behavior:**
- Reverses the most recent batch by swapping `oldName ↔ newName` and calling `renameWorkspace()` for each entry
- Undo operations are **not** pushed to history (prevents infinite undo chains)
- On success, the entry is popped from the stack and localStorage is updated
- `↩️ Undo` button visibility is auto-managed based on stack length

**Global APIs:**
- `window.__loopUndoRename()` — Trigger undo of the last rename batch
- `window.__loopRenameHistory()` — Returns the current history stack

### 4.4 Future Services (Planned)

| Service | Description | Status |
|---------|-------------|--------|
| Config read | Read extension config from macro controller | Planned |
| Action triggers | Open options page, refresh token from macro | Planned |
| UI sync | Broadcast config changes to active macro UIs | Planned |

---

## 5. Message Format

### 5.1 Request (Controller → Extension)

```typescript
interface BridgeRequest {
  source: 'marco-controller';
  type: string;          // MessageType enum value
  requestId: string;     // crypto.randomUUID()
  payload: Record<string, unknown>;
}
```

### 5.2 Response (Extension → Controller)

```typescript
interface BridgeResponse {
  source: 'marco-extension';
  type: 'RESPONSE';
  requestId: string;     // matches request
  payload: {
    isOk: boolean;
    errorMessage?: string;
    [key: string]: unknown;
  };
}
```

### 5.3 Broadcast (Extension → Controller, unsolicited)

```typescript
interface BridgeBroadcast {
  source: 'marco-extension';
  type: string;          // e.g. 'CONFIG_UPDATED'
  payload: Record<string, unknown>;
}
```

---

## 6. Security

- **Origin validation**: Content script checks `event.data.source` before forwarding
- **Rate limiting**: 100 messages/second (enforced by background handler, per Spec 42)
- **Token redaction**: Sensitive fields are stripped before logging
- **Project isolation**: Storage keys are namespaced by `{projectId}::`

---

## 7. Relationship to Other Specs

| Spec | Relationship |
|------|-------------|
| Spec 18 (Message Protocol) | Defines the `MessageType` enum and handler registry |
| Spec 42 (Data Bridge) | Defines `window.marco` SDK, storage constraints, and handler implementations |
| Spec 40 (Macro Looping Reference) | Documents the macro controller script that uses this bridge |
| Spec 20 (Error Isolation) | Error boundary patterns for user script failures |

---

## 8. Implementation Notes

- The `window.marco` SDK (defined in Spec 42) is injected by the content script **before** macro controller runs
- The macro controller does NOT need to implement its own `postMessage` bridge — it uses the `marco.*` API directly
- All existing `USER_SCRIPT_DATA_*` handlers in `src/background/handlers/data-bridge-handler.ts` already support this flow
- No changes needed to the AHK layer — this is Chrome extension only
