# Chrome Extension — Unified Message Protocol

**Version**: v1.1.0  
**Date**: 2026-02-28  
**Fixes**: Risk R-09 (Message Protocol Fragmentation)  
**v1.1.0 changes**: Added 10 missing message types: `GET_STATUS`, `GET_ACTIVE_ERRORS`, `GET_STORAGE_STATS`, `QUERY_LOGS`, `GET_LOG_DETAIL`, `TOGGLE_XPATH_RECORDER`, `GET_RECORDED_XPATHS`, `CLEAR_RECORDED_XPATHS`, `TEST_XPATH`, `CONFIG_UPDATED`

---

## Purpose

Define **every** message type used for communication between the service worker (background), popup, options page, and content scripts. This is the single source of truth for the message protocol — no other spec file should define new message types without referencing this document.

---

## Architecture

```
┌─────────┐     chrome.runtime.sendMessage()     ┌──────────────┐
│  Popup   │ ──────────────────────────────────→  │              │
├─────────┤                                       │   Service    │
│ Options  │ ──────────────────────────────────→  │   Worker     │
├─────────┤                                       │  (Background)│
│ Content  │ ──────────────────────────────────→  │              │
│ Script   │ ←────────────────────────────────── │              │
└─────────┘   chrome.tabs.sendMessage()           └──────────────┘
                                                       │
                                                       │ chrome.runtime.sendMessage()
                                                       │ to self (for alarms, events)
                                                       ▼
```

All messages follow this shape:

```typescript
interface Message {
  type: MessageType;       // Enum value from MessageType
  [key: string]: unknown;  // Payload fields vary by type
}
```

All responses are passed via the `sendResponse` callback (not `Promise`-based, for MV3 compatibility).

---

## Message Type Enum

```typescript
// src/shared/messages.ts

export enum MessageType {
  // ─── Config & Auth (from Spec 05) ───
  GET_CONFIG           = 'GET_CONFIG',
  GET_TOKEN            = 'GET_TOKEN',
  REFRESH_TOKEN        = 'REFRESH_TOKEN',

  // ─── Logging (from Spec 06) ───
  LOG_ENTRY            = 'LOG_ENTRY',
  LOG_ERROR            = 'LOG_ERROR',
  GET_RECENT_LOGS      = 'GET_RECENT_LOGS',
  GET_LOG_STATS        = 'GET_LOG_STATS',
  PURGE_LOGS           = 'PURGE_LOGS',
  EXPORT_LOGS_JSON     = 'EXPORT_LOGS_JSON',
  EXPORT_LOGS_ZIP      = 'EXPORT_LOGS_ZIP',

  // ─── Projects (from Spec 15) ───
  GET_ACTIVE_PROJECT   = 'GET_ACTIVE_PROJECT',
  SET_ACTIVE_PROJECT   = 'SET_ACTIVE_PROJECT',
  GET_ALL_PROJECTS     = 'GET_ALL_PROJECTS',
  SAVE_PROJECT         = 'SAVE_PROJECT',
  DELETE_PROJECT       = 'DELETE_PROJECT',
  DUPLICATE_PROJECT    = 'DUPLICATE_PROJECT',
  IMPORT_PROJECT       = 'IMPORT_PROJECT',
  EXPORT_PROJECT       = 'EXPORT_PROJECT',

  // ─── Scripts & Configs (from Spec 13) ───
  GET_ALL_SCRIPTS      = 'GET_ALL_SCRIPTS',
  SAVE_SCRIPT          = 'SAVE_SCRIPT',
  DELETE_SCRIPT        = 'DELETE_SCRIPT',
  GET_ALL_CONFIGS      = 'GET_ALL_CONFIGS',
  SAVE_CONFIG          = 'SAVE_CONFIG',
  DELETE_CONFIG        = 'DELETE_CONFIG',
  GET_SCRIPT_CONFIG    = 'GET_SCRIPT_CONFIG',

  // ─── Injection (from Spec 12) ───
  INJECT_SCRIPTS       = 'INJECT_SCRIPTS',
  INJECTION_RESULT     = 'INJECTION_RESULT',
  GET_TAB_INJECTIONS   = 'GET_TAB_INJECTIONS',

  // ─── Health & Recovery (from Spec 09) ───
  GET_STATUS           = 'GET_STATUS',
  GET_HEALTH_STATUS    = 'GET_HEALTH_STATUS',
  GET_ACTIVE_ERRORS    = 'GET_ACTIVE_ERRORS',
  LOGGING_DEGRADED     = 'LOGGING_DEGRADED',
  STORAGE_FULL         = 'STORAGE_FULL',
  NETWORK_STATUS       = 'NETWORK_STATUS',

  // ─── Storage & Data Browser (from Spec 10 §Data Management) ───
  GET_STORAGE_STATS    = 'GET_STORAGE_STATS',
  QUERY_LOGS           = 'QUERY_LOGS',
  GET_LOG_DETAIL       = 'GET_LOG_DETAIL',

  // ─── XPath Recorder (from Spec 07) ───
  TOGGLE_XPATH_RECORDER = 'TOGGLE_XPATH_RECORDER',
  GET_RECORDED_XPATHS  = 'GET_RECORDED_XPATHS',
  CLEAR_RECORDED_XPATHS = 'CLEAR_RECORDED_XPATHS',
  TEST_XPATH           = 'TEST_XPATH',

  // ─── Config Notifications (from Spec 10) ───
  CONFIG_UPDATED       = 'CONFIG_UPDATED',

  // ─── Auth Broadcasts (from Spec 04) ───
  TOKEN_EXPIRED        = 'TOKEN_EXPIRED',
  TOKEN_UPDATED        = 'TOKEN_UPDATED',

  // ─── User Script Errors (from Spec 20) ───
  USER_SCRIPT_ERROR    = 'USER_SCRIPT_ERROR',
}
```

---

## Message Catalog

### Config & Auth

#### `GET_CONFIG`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type: 'GET_CONFIG' }` | |
| **Response** | `ConfigJson` | Full resolved config object (merged from 3-tier cascade) |
| **Sender** | Content script, popup | |
| **Handler** | Background → `cookie-reader.ts` | |

#### `GET_TOKEN`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type: 'GET_TOKEN' }` | |
| **Response** | `string \| null` | Bearer token string, or null if not authenticated |
| **Sender** | Content script | |
| **Handler** | Background → `cookie-reader.ts` | Reads from cache, then `chrome.cookies` |

#### `REFRESH_TOKEN`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type: 'REFRESH_TOKEN' }` | |
| **Response** | `string \| null` | Fresh token after re-reading cookie, or null |
| **Sender** | Content script (on 401/403) | |
| **Handler** | Background → `cookie-reader.ts` | Forces cookie re-read, updates cache |

---

### Logging

#### `LOG_ENTRY`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, level, source, category, action, detail, metadata?, durationMs?, logType?, indent?, projectId?, urlRuleId?, scriptId?, configId? }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Content script, popup, options | |
| **Handler** | Background → `db-manager.ts` → INSERT into `logs` table |

#### `LOG_ERROR`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, level, source, category, errorCode, message, stackTrace?, context?, projectId?, scriptId?, configId?, scriptFile?, errorLine?, errorColumn? }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Content script, popup | |
| **Handler** | Background → `db-manager.ts` → INSERT into `errors` table |

#### `GET_RECENT_LOGS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, source?: string, limit?: number }` | |
| **Response** | `LogEntry[]` | Array of log entries, newest first |
| **Sender** | Content script, popup | |
| **Handler** | Background → `db-manager.ts` → SELECT from `logs` |

#### `GET_LOG_STATS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ logCount, errorCount, sessionCount, bytesUsed, quota }` | |
| **Sender** | Options, popup | |
| **Handler** | Background → `db-manager.ts` |

#### `PURGE_LOGS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, olderThanDays?: number }` | Default: purge all |
| **Response** | `{ purged: number }` | Count of deleted entries |
| **Sender** | Options | |
| **Handler** | Background → `db-manager.ts` |

#### `EXPORT_LOGS_JSON`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ json: string, filename: string }` | Serialized log data |
| **Sender** | Options | |
| **Handler** | Background → `db-manager.ts` |

#### `EXPORT_LOGS_ZIP`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ blob: Blob, filename: string }` | ZIP bundle (via JSZip) |
| **Sender** | Options | |
| **Handler** | Background → `db-manager.ts` + JSZip |

---

### Projects

#### `GET_ACTIVE_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ activeProject: ProjectSummary, matchedRule: UrlRuleSummary \| null, allProjects: ProjectSummary[], injectedScripts: Record<string, InjectionStatus> }` | |
| **Sender** | Popup | |
| **Handler** | Background → `project-matcher.ts` | Evaluates active tab URL |

#### `SET_ACTIVE_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, projectId: string }` | |
| **Response** | `{ matchedRule: UrlRuleSummary \| null, injectedScripts: Record<string, InjectionStatus> }` | |
| **Sender** | Popup | |
| **Handler** | Background → `project-matcher.ts` | Re-evaluates with new project |

#### `GET_ALL_PROJECTS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `Project[]` | Full project objects |
| **Sender** | Options | |
| **Handler** | Background → `chrome.storage.local` |

#### `SAVE_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, project: Project }` | Full project (create or update based on ID) |
| **Response** | `{ ok: true, project: Project }` | |
| **Sender** | Options | |
| **Handler** | Background → `chrome.storage.local` |

#### `DELETE_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, projectId: string }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Options | |
| **Handler** | Background → `chrome.storage.local` | Cascades: removes orphan bindings |

#### `DUPLICATE_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, projectId: string }` | |
| **Response** | `{ ok: true, project: Project }` | Cloned with new UUIDs and "(Copy)" suffix |
| **Sender** | Options | |
| **Handler** | Background |

#### `IMPORT_PROJECT` / `EXPORT_PROJECT`

| Field | Type | Description |
|-------|------|-------------|
| **Import Request** | `{ type, json: string }` | Validated JSON string |
| **Import Response** | `{ ok: true, project: Project }` | |
| **Export Request** | `{ type, projectId: string }` | |
| **Export Response** | `{ json: string, filename: string }` | |

---

### Scripts & Configs

#### `GET_ALL_SCRIPTS` / `GET_ALL_CONFIGS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `StoredScript[]` / `StoredConfig[]` | |

#### `SAVE_SCRIPT` / `SAVE_CONFIG`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, script: StoredScript }` or `{ type, config: StoredConfig }` | |
| **Response** | `{ ok: true }` | |

#### `DELETE_SCRIPT` / `DELETE_CONFIG`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, id: string }` | |
| **Response** | `{ ok: true }` | Checks for bindings first, warns if in use |

#### `GET_SCRIPT_CONFIG`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, scriptId: string, configId?: string }` | |
| **Response** | `object \| null` | Resolved config JSON for this script |
| **Sender** | Content script (via Method 2 message passing) | |
| **Handler** | Background → resolves config cascade |

---

### Injection

#### `INJECT_SCRIPTS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, tabId: number, scripts: ScriptBinding[] }` | |
| **Response** | `{ results: InjectionResult[] }` | Per-script success/fail |
| **Sender** | Popup ("Inject Now" button), background (auto) | |
| **Handler** | Background → `chrome.scripting.executeScript` |

#### `INJECTION_RESULT`

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → Popup (via `chrome.runtime.sendMessage` broadcast) | |
| **Payload** | `{ type, tabId, scriptId, status: 'success' \| 'error', error?: string }` | |

#### `GET_TAB_INJECTIONS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, tabId: number }` | |
| **Response** | `Record<string, InjectionStatus>` | Map of scriptId → status for this tab |

---

### Health & Recovery

#### `GET_HEALTH_STATUS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ state: 'HEALTHY' \| 'DEGRADED' \| 'ERROR' \| 'FATAL', details: HealthDetail[] }` | |

#### `LOGGING_DEGRADED` (Broadcast)

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → all content scripts | |
| **Payload** | `{ type, fallbackMode: 'memory' \| 'storage.local' }` | |

#### `STORAGE_FULL` (Broadcast)

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → all content scripts + popup | |
| **Payload** | `{ type, bytesUsed: number, quota: number }` | |

#### `NETWORK_STATUS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, online: boolean }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Content script (`online`/`offline` events) | |
| **Handler** | Background → pauses/resumes API polling |

---

### User Script Errors

#### `USER_SCRIPT_ERROR`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, scriptId, configId?, projectId?, urlRuleId?, message, stack, line?, column?, url? }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Content script (from try/catch wrapper) | |
| **Handler** | Background → `db-manager.ts` → INSERT into `errors` table with `error_code = 'USER_SCRIPT_ERROR'` |

---

### Status & Active Errors

#### `GET_STATUS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ connection: 'online' \| 'offline' \| 'degraded', token: { status: 'valid' \| 'expiring' \| 'expired' \| 'missing', expiresIn: string \| null }, config: { status: 'loaded' \| 'defaults' \| 'failed', source: 'local' \| 'remote' \| 'hardcoded' }, workspace: { name, id, credits, freeCredits } \| null, injectedScripts: Record<string, { status: string, tabId?: number }>, loggingMode: 'sqlite' \| 'fallback', version: string }` | Full aggregated status for popup rendering |
| **Sender** | Popup (on open) | |
| **Handler** | Background → aggregates from health, cookie-reader, config state, workspace cache |

#### `GET_ACTIVE_ERRORS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `Array<{ id: string, level: 'warning' \| 'error', message: string, timestamp: string, action?: string }>` | Active (unresolved) errors for error bar |
| **Sender** | Popup (on open) | |
| **Handler** | Background → `state-manager.ts` → reads `activeErrors` map |

---

### Storage & Data Browser

#### `GET_STORAGE_STATS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ totalBytes: number, quotaBytes: number, databases: Array<{ name: string, rows: number, sizeBytes: number, lastWrite: string }> }` | Storage overview for Options §Data Management |
| **Sender** | Options page, Popup (footer) | |
| **Handler** | Background → `db-manager.ts` → `navigator.storage.estimate()` + `SELECT COUNT(*)` |

#### `QUERY_LOGS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, database: 'logs' \| 'errors', sessionId?: string, filter?: string, offset: number, limit: number, sortBy?: string, sortDir?: 'asc' \| 'desc' }` | |
| **Response** | `{ rows: LogEntry[], total: number }` | Paginated log query |
| **Sender** | Options page (Data Browser) | |
| **Handler** | Background → `db-manager.ts` → parameterized SELECT |

#### `GET_LOG_DETAIL`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, database: 'logs' \| 'errors', rowId: number }` | |
| **Response** | `{ row: LogEntry }` | Full row with metadata JSON |
| **Sender** | Options page (row expand) | |
| **Handler** | Background → `db-manager.ts` → SELECT by id |

---

### XPath Recorder

#### `TOGGLE_XPATH_RECORDER`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ recording: boolean }` or `{ recorded: XPathEntry[] }` (when stopping) | |
| **Sender** | Popup (Record button) or `chrome.commands` shortcut | |
| **Handler** | Background → injects `xpath-recorder.js` into active tab, or sends stop signal |

#### `GET_RECORDED_XPATHS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ recorded: XPathEntry[] }` | All captured XPaths from current session |
| **Sender** | Popup (after stop) | |
| **Handler** | Background → relays to content script via `chrome.tabs.sendMessage` |

#### `CLEAR_RECORDED_XPATHS`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type }` | |
| **Response** | `{ ok: true }` | |
| **Sender** | Popup | |
| **Handler** | Background → relays to content script |

#### `TEST_XPATH`

| Field | Type | Description |
|-------|------|-------------|
| **Request** | `{ type, xpath: string }` | |
| **Response** | `{ found: number, error?: string }` | Element count or XPath syntax error |
| **Sender** | Options page (XPaths section → [Test] button) | |
| **Handler** | Background → `chrome.scripting.executeScript` on active tab |

---

### Config Broadcast

#### `CONFIG_UPDATED` (Broadcast)

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → all content scripts | |
| **Payload** | `{ type, config: ConfigJson }` | Full updated config |
| **Trigger** | After SAVE_CONFIG succeeds | |
| **Consumer** | Content scripts re-initialize with new config (no page reload) |

---

### Auth Broadcasts

#### `TOKEN_EXPIRED` (Broadcast)

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → content scripts on `lovable.dev` tabs | |
| **Payload** | `{ type }` | Cookie was deleted (logout or expiry) |
| **Trigger** | `chrome.cookies.onChanged` fires with `removed: true` for `lovable-session-id.id` |

#### `TOKEN_UPDATED` (Broadcast)

| Field | Type | Description |
|-------|------|-------------|
| **Direction** | Background → content scripts on `lovable.dev` tabs | |
| **Payload** | `{ type, token: string }` | Fresh token value |
| **Trigger** | `chrome.cookies.onChanged` fires with new cookie value |

---

## Handler Registration Pattern

All messages are handled in a single listener in the service worker:

```typescript
// src/background/message-router.ts

import { MessageType } from '@/shared/messages';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Must return true to indicate async response
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    // Config & Auth
    case MessageType.GET_CONFIG:      return handleGetConfig();
    case MessageType.GET_TOKEN:       return handleGetToken();
    case MessageType.REFRESH_TOKEN:   return handleRefreshToken();

    // Logging
    case MessageType.LOG_ENTRY:       return handleLogEntry(msg);
    case MessageType.LOG_ERROR:       return handleLogError(msg);
    case MessageType.GET_RECENT_LOGS: return handleGetRecentLogs(msg);
    case MessageType.GET_LOG_STATS:   return handleGetLogStats();
    case MessageType.PURGE_LOGS:      return handlePurgeLogs(msg);
    case MessageType.EXPORT_LOGS_JSON:return handleExportJson();
    case MessageType.EXPORT_LOGS_ZIP: return handleExportZip();

    // Projects
    case MessageType.GET_ACTIVE_PROJECT:  return handleGetActiveProject(sender);
    case MessageType.SET_ACTIVE_PROJECT:  return handleSetActiveProject(msg, sender);
    case MessageType.GET_ALL_PROJECTS:    return handleGetAllProjects();
    case MessageType.SAVE_PROJECT:        return handleSaveProject(msg);
    case MessageType.DELETE_PROJECT:      return handleDeleteProject(msg);
    case MessageType.DUPLICATE_PROJECT:   return handleDuplicateProject(msg);
    case MessageType.IMPORT_PROJECT:      return handleImportProject(msg);
    case MessageType.EXPORT_PROJECT:      return handleExportProject(msg);

    // Scripts & Configs
    case MessageType.GET_ALL_SCRIPTS:     return handleGetAllScripts();
    case MessageType.SAVE_SCRIPT:         return handleSaveScript(msg);
    case MessageType.DELETE_SCRIPT:       return handleDeleteScript(msg);
    case MessageType.GET_ALL_CONFIGS:     return handleGetAllConfigs();
    case MessageType.SAVE_CONFIG:         return handleSaveConfig(msg);
    case MessageType.DELETE_CONFIG:       return handleDeleteConfig(msg);
    case MessageType.GET_SCRIPT_CONFIG:   return handleGetScriptConfig(msg);

    // Injection
    case MessageType.INJECT_SCRIPTS:      return handleInjectScripts(msg);
    case MessageType.GET_TAB_INJECTIONS:  return handleGetTabInjections(msg);

    // Health & Status
    case MessageType.GET_STATUS:          return handleGetStatus(sender);
    case MessageType.GET_HEALTH_STATUS:   return handleGetHealthStatus();
    case MessageType.GET_ACTIVE_ERRORS:   return handleGetActiveErrors();
    case MessageType.NETWORK_STATUS:      return handleNetworkStatus(msg);

    // Storage & Data Browser
    case MessageType.GET_STORAGE_STATS:   return handleGetStorageStats();
    case MessageType.QUERY_LOGS:          return handleQueryLogs(msg);
    case MessageType.GET_LOG_DETAIL:      return handleGetLogDetail(msg);

    // XPath Recorder
    case MessageType.TOGGLE_XPATH_RECORDER: return handleToggleXPathRecorder(msg, sender);
    case MessageType.GET_RECORDED_XPATHS:   return handleGetRecordedXPaths(msg, sender);
    case MessageType.CLEAR_RECORDED_XPATHS: return handleClearRecordedXPaths(msg, sender);
    case MessageType.TEST_XPATH:            return handleTestXPath(msg);

    // Config Broadcast
    case MessageType.CONFIG_UPDATED:      return; // Broadcast only, no handler

    // User Script Errors
    case MessageType.USER_SCRIPT_ERROR:   return handleUserScriptError(msg);

    default:
      console.warn('[message-router] Unknown message type:', msg.type);
      return { error: 'Unknown message type' };
  }
}
```

---

## Broadcasting Pattern

For messages that go FROM background TO content scripts/popup:

```typescript
// Broadcast to all tabs
async function broadcastToTabs(message: Message): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab may not have content script, ignore
      });
    }
  }
}

// Usage
broadcastToTabs({ type: MessageType.STORAGE_FULL, bytesUsed, quota });
```

---

## Cold-Start Message Buffer

When the service worker wakes up, WASM may not be ready yet. Messages arriving before initialization must be queued:

```typescript
// src/background/index.ts

let initialized = false;
const messageQueue: Array<{
  msg: Message;
  sender: chrome.runtime.MessageSender;
  sendResponse: (r: unknown) => void;
}> = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!initialized) {
    messageQueue.push({ msg, sender, sendResponse });
    return true; // Keep channel open
  }
  handleMessage(msg, sender).then(sendResponse);
  return true;
});

async function init() {
  await initDatabases();
  await rehydrateState();
  initialized = true;

  // Drain queued messages
  for (const { msg, sender, sendResponse } of messageQueue) {
    handleMessage(msg, sender).then(sendResponse);
  }
  messageQueue.length = 0;
}

init();
```

---

*Unified message protocol v1.1.0 — 2026-02-28*
