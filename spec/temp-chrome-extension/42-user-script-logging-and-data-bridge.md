# Chrome Extension — User Script Logging API & Cross-Site Data Bridge

**Spec**: 42
**Version**: v1.0
**Date**: 2026-03-14
**Status**: APPROVED
**Depends on**: Spec 06 (Logging Architecture), Spec 20 (User Script Error Isolation), Spec 18 (Message Protocol)

---

## 1. Purpose

Enable user-injected scripts to:

1. **Log** structured entries (info, warn, error, debug) into the extension's SQLite databases (`logs.db` / `errors.db`) with full project/script context.
2. **Share data** across sites via a global key-value store inside the extension, acting as a cross-origin data bridge.

Both capabilities are exposed as a lightweight JavaScript API (`window.marco`) that the extension injects **before** any user script runs.

---

## 2. Architecture Overview

```
┌───────────────────────────────────┐
│  Page A (e.g. lovable.dev)        │
│                                   │
│  User Script calls:               │
│    marco.log.info("fetched 5")    │
│    marco.store.set("wsId", "abc") │
│         │                         │
│         ▼                         │
│  window.marco (injected SDK)      │
│         │                         │
│         ▼ window.postMessage      │
│  Content Script (message relay)   │
│         │                         │
│         ▼ chrome.runtime          │
│           .sendMessage()          │
└─────────┬─────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  Background Service Worker       │
│                                  │
│  Message Router:                 │
│   USER_SCRIPT_LOG  → logs.db    │
│   USER_SCRIPT_DATA_SET → store  │
│   USER_SCRIPT_DATA_GET → store  │
│   USER_SCRIPT_DATA_DELETE → del │
│   USER_SCRIPT_DATA_KEYS → list  │
│   USER_SCRIPT_DATA_GET_ALL → all│
│   USER_SCRIPT_DATA_CLEAR → clr  │
└─────────┬───────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│  Page B (e.g. other-app.com)      │
│                                   │
│  User Script calls:               │
│    const wsId =                   │
│      await marco.store.get("wsId")│
│    // → "abc"                     │
└───────────────────────────────────┘
```

> **Transport note**: The SDK is injected in the **MAIN** world, where `chrome.runtime` is not directly accessible. All messages are sent via `window.postMessage` to the content script, which relays them to the background via `chrome.runtime.sendMessage`. Responses flow back the same way. See [Spec 43](43-macro-controller-extension-bridge.md) for the full bridge architecture.

---

## 3. Injected SDK — `window.marco`

The extension injects a small SDK object (`window.marco`) into the page **before** any user script runs. This SDK is injected in the **MAIN** world so user scripts can access it directly.

### 3.1 Logging API — `marco.log`

```javascript
// Convenience methods — each maps to a log level
marco.log.info(message, metadata?)     // level: 'INFO'
marco.log.warn(message, metadata?)     // level: 'WARN'
marco.log.error(message, metadata?)    // level: 'ERROR'
marco.log.debug(message, metadata?)    // level: 'DEBUG'

// Full control method
marco.log.write({
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  category: string,    // optional, default: 'USER'
  action: string,      // optional, default: 'log'
  message: string,     // required
  metadata: object,    // optional, serialized to JSON
})
```

#### Context Auto-Injection

The SDK **automatically** includes the following context in every log call (injected by the extension when creating the SDK):

| Field | Source | Description |
|-------|--------|-------------|
| `projectId` | Known at injection time | UUID of the matched project |
| `scriptId` | Known at injection time | UUID of the user script |
| `configId` | Known at injection time | UUID of the config binding (nullable) |
| `urlRuleId` | Known at injection time | UUID of the matched URL rule |
| `source` | Hardcoded | Always `'user-script'` |
| `pageUrl` | `window.location.href` | Current page URL at time of log call |

The user **never** needs to pass project/script IDs — the SDK handles it.

#### Message Format (SDK → Content Script → Background)

```javascript
// Sent via window.postMessage (SDK runs in MAIN world — see Spec 43 §3.1)
{
  source: 'marco-controller',
  type: 'USER_SCRIPT_LOG',
  requestId: 'uuid-...',     // for response correlation
  payload: {
    level: 'INFO',
    source: 'user-script',
    category: 'USER',        // or user-specified
    action: 'log',           // or user-specified
    detail: 'Fetched 5 workspaces',
    metadata: '{"count": 5}', // JSON string
    projectId: 'uuid-...',
    scriptId: 'uuid-...',
    configId: 'uuid-...',
    urlRuleId: 'uuid-...',
    pageUrl: 'https://lovable.dev/projects/...',
    timestamp: '2026-03-14T10:30:00.123Z'
  }
}
```

#### Background Handler

The `USER_SCRIPT_LOG` handler inserts into `logs.db` using the existing `log()` function from Spec 06, mapping:

| SDK Field | logs.db Column |
|-----------|---------------|
| `level` | `level` |
| `source` | `source` (always `'user-script'`) |
| `category` | `category` |
| `action` | `action` |
| `detail` | `detail` (the `message` text) |
| `metadata` | `metadata` |
| `projectId` | `project_id` |
| `scriptId` | `script_id` |
| `configId` | `config_id` |
| `urlRuleId` | `url_rule_id` |

If `level` is `'ERROR'`, also insert into `errors.db` with `error_code = 'USER_SCRIPT_LOG_ERROR'`.

---

### 3.2 Data Bridge API — `marco.store`

A simple async key-value store persisted in `chrome.storage.local` under the key `marco_user_data`.

```javascript
// Set a value (any JSON-serializable value)
await marco.store.set(key, value)

// Get a value (returns undefined if not found)
const val = await marco.store.get(key)

// Delete a key
await marco.store.delete(key)

// List all keys
const keys = await marco.store.keys()

// Get all entries as an object
const all = await marco.store.getAll()

// Clear all data
await marco.store.clear()
```

#### Namespacing

Data is stored **per-project** by default. The SDK auto-prefixes keys with the `projectId`:

- Internal key: `{projectId}::{userKey}`
- This prevents collisions between projects using the same key names.

To share data **across projects**, use the global namespace:

```javascript
// Write to global namespace (accessible from any project)
await marco.store.setGlobal(key, value)
await marco.store.getGlobal(key)
await marco.store.deleteGlobal(key)
await marco.store.keysGlobal()
```

Global keys are prefixed with `__global__::`.

#### Message Format (SDK → Background)

```javascript
// SET
{
  type: 'USER_SCRIPT_DATA_SET',
  key: 'proj-uuid::myVar',   // namespaced
  value: { count: 5, name: 'test' },
  projectId: 'proj-uuid',
  scriptId: 'script-uuid'
}

// GET (returns { value: ... } or { value: undefined })
{
  type: 'USER_SCRIPT_DATA_GET',
  key: 'proj-uuid::myVar'
}

// DELETE
{
  type: 'USER_SCRIPT_DATA_DELETE',
  key: 'proj-uuid::myVar'
}

// KEYS
{
  type: 'USER_SCRIPT_DATA_KEYS',
  prefix: 'proj-uuid::'   // or '__global__::'
}

// GET_ALL
{
  type: 'USER_SCRIPT_DATA_GET_ALL',
  prefix: 'proj-uuid::'
}

// CLEAR
{
  type: 'USER_SCRIPT_DATA_CLEAR',
  prefix: 'proj-uuid::'
}
```

#### Background Handler — Storage

```javascript
const STORE_KEY = 'marco_user_data';

async function handleDataSet(msg) {
  const stored = await chrome.storage.local.get(STORE_KEY);
  const data = stored[STORE_KEY] || {};
  data[msg.key] = {
    value: msg.value,
    updatedAt: new Date().toISOString(),
    projectId: msg.projectId,
    scriptId: msg.scriptId
  };
  await chrome.storage.local.set({ [STORE_KEY]: data });
  return { isOk: true };
}

async function handleDataGet(msg) {
  const stored = await chrome.storage.local.get(STORE_KEY);
  const data = stored[STORE_KEY] || {};
  const entry = data[msg.key];
  return { value: entry?.value };
}
```

#### Storage Limits

| Constraint | Limit |
|-----------|-------|
| Key length | 256 characters max |
| Value size | 1 MB max per key (JSON serialized) |
| Total store size | 50 MB (auto-warn at 40 MB) |
| Keys per project | 1,000 max |

---

## 4. SDK Injection Code

The SDK is injected **before** each user script, in the **MAIN** execution world. Since `chrome.runtime` is not available in the MAIN world, all messages use `window.postMessage` to reach the content script relay, which forwards them to the background (see [Spec 43 §3](43-macro-controller-extension-bridge.md)).

```javascript
// Injected before user script — sets up window.marco
(function() {
  // Skip if already injected (multiple scripts in same page)
  if (window.marco) return;

  const __ctx = {
    projectId: '${projectId}',
    scriptId: '${scriptId}',
    configId: '${configId}',
    urlRuleId: '${urlRuleId}'
  };

  // Pending response map: requestId → { resolve, reject, timer }
  const __pending = new Map();

  // Listen for responses from the content script relay
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'marco-extension') return;
    if (event.data.type !== 'RESPONSE') return;
    const entry = __pending.get(event.data.requestId);
    if (!entry) return;
    __pending.delete(event.data.requestId);
    clearTimeout(entry.timer);
    entry.resolve(event.data.payload);
  });

  /**
   * Send a message to the extension via window.postMessage.
   * The content script relay intercepts messages with source='marco-controller',
   * forwards to background via chrome.runtime.sendMessage, and posts the response
   * back with source='marco-extension' (see Spec 43 §3.1–3.2).
   */
  function sendMsg(message) {
    return new Promise(function(resolve, reject) {
      var requestId = crypto.randomUUID();
      var timer = setTimeout(function() {
        __pending.delete(requestId);
        reject(new Error('marco bridge timeout'));
      }, 10000);
      __pending.set(requestId, { resolve: resolve, reject: reject, timer: timer });
      window.postMessage({
        source: 'marco-controller',
        requestId: requestId,
        type: message.type,
        payload: message.payload || message
      }, '*');
    });
  }

  function logFn(level) {
    return function(message, metadata) {
      sendMsg({
        type: 'USER_SCRIPT_LOG',
        payload: {
          level,
          source: 'user-script',
          category: 'USER',
          action: 'log',
          detail: String(message),
          metadata: metadata ? JSON.stringify(metadata) : null,
          projectId: __ctx.projectId,
          scriptId: __ctx.scriptId,
          configId: __ctx.configId,
          urlRuleId: __ctx.urlRuleId,
          pageUrl: window.location.href,
          timestamp: new Date().toISOString()
        }
      }).catch(function() {}); // fire-and-forget
    };
  }

  function nsKey(key) { return __ctx.projectId + '::' + key; }
  function globalKey(key) { return '__global__::' + key; }

  window.marco = {
    log: {
      info:  logFn('INFO'),
      warn:  logFn('WARN'),
      error: logFn('ERROR'),
      debug: logFn('DEBUG'),
      write: function(opts) {
        sendMsg({
          type: 'USER_SCRIPT_LOG',
          payload: {
            level: opts.level || 'INFO',
            source: 'user-script',
            category: opts.category || 'USER',
            action: opts.action || 'log',
            detail: String(opts.message),
            metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
            projectId: __ctx.projectId,
            scriptId: __ctx.scriptId,
            configId: __ctx.configId,
            urlRuleId: __ctx.urlRuleId,
            pageUrl: window.location.href,
            timestamp: new Date().toISOString()
          }
        }).catch(function() {});
      }
    },
    store: {
      set:    function(k, v) { return sendMsg({ type: 'USER_SCRIPT_DATA_SET', payload: { key: nsKey(k), value: v, projectId: __ctx.projectId, scriptId: __ctx.scriptId } }).then(function(r) { return r.isOk; }); },
      get:    function(k)    { return sendMsg({ type: 'USER_SCRIPT_DATA_GET', payload: { key: nsKey(k) } }).then(function(r) { return r.value; }); },
      delete: function(k)    { return sendMsg({ type: 'USER_SCRIPT_DATA_DELETE', payload: { key: nsKey(k) } }); },
      keys:   function()     { return sendMsg({ type: 'USER_SCRIPT_DATA_KEYS', payload: { prefix: __ctx.projectId + '::' } }).then(function(r) { return r.keys; }); },
      getAll: function()     { return sendMsg({ type: 'USER_SCRIPT_DATA_GET_ALL', payload: { prefix: __ctx.projectId + '::' } }).then(function(r) { return r.entries; }); },
      clear:  function()     { return sendMsg({ type: 'USER_SCRIPT_DATA_CLEAR', payload: { prefix: __ctx.projectId + '::' } }); },

      // Global (cross-project) variants
      setGlobal:    function(k, v) { return sendMsg({ type: 'USER_SCRIPT_DATA_SET', payload: { key: globalKey(k), value: v, projectId: '__global__', scriptId: __ctx.scriptId } }).then(function(r) { return r.isOk; }); },
      getGlobal:    function(k)    { return sendMsg({ type: 'USER_SCRIPT_DATA_GET', payload: { key: globalKey(k) } }).then(function(r) { return r.value; }); },
      deleteGlobal: function(k)    { return sendMsg({ type: 'USER_SCRIPT_DATA_DELETE', payload: { key: globalKey(k) } }); },
      keysGlobal:   function()     { return sendMsg({ type: 'USER_SCRIPT_DATA_KEYS', payload: { prefix: '__global__::' } }).then(function(r) { return r.keys; }); },
    },
    // Expose context for advanced users
    context: Object.freeze({ ...__ctx })
  };

  Object.freeze(window.marco.log);
  Object.freeze(window.marco.store);
  Object.freeze(window.marco);
})();
```

---

## 5. Extension Internal Logging (Self-Logging)

Beyond user scripts, the extension itself must log **every significant operation** with full detail. The following events are mandatory:

### 5.1 Script Injection Events

| Event | Level | Category | What to Log |
|-------|-------|----------|-------------|
| Script injection started | INFO | INJECTION | `scriptId`, `scriptFile`, `world`, `runAt`, `pageUrl`, `projectId` |
| Script injection succeeded | INFO | INJECTION | Duration (ms), script size (bytes) |
| Script injection failed | ERROR | INJECTION | Error message, stack trace, `scriptId` |
| SDK injected | DEBUG | INJECTION | Confirms `window.marco` was set up |
| Config injected | INFO | INJECTION | `configId`, injection method, variable count |

### 5.2 URL Matching Events

| Event | Level | Category | What to Log |
|-------|-------|----------|-------------|
| URL evaluated | DEBUG | MATCHING | URL, number of rules checked |
| Rule matched | INFO | MATCHING | `ruleId`, `projectId`, match mode, pattern |
| No rules matched | DEBUG | MATCHING | URL, total rules checked |
| Multiple rules matched | INFO | MATCHING | All matching rules with priorities |

### 5.3 Auth Events

| Event | Level | Category | What to Log |
|-------|-------|----------|-------------|
| Token read | INFO | AUTH | Token prefix (first 12 chars + `...REDACTED`), source (cookie/storage) |
| Token expired | WARN | AUTH | Expiry time, how detected |
| Token refreshed | INFO | AUTH | New token prefix, source |
| Cookie read | INFO | AUTH | Cookie name, domain, expiry |
| Auth failed (401/403) | ERROR | AUTH | URL, status code, response body (first 200 chars) |

### 5.4 Data Store Events

| Event | Level | Category | What to Log |
|-------|-------|----------|-------------|
| Data set | DEBUG | DATA_BRIDGE | Key, value size (bytes), projectId |
| Data get | DEBUG | DATA_BRIDGE | Key, found (true/false) |
| Data delete | DEBUG | DATA_BRIDGE | Key |
| Store size warning | WARN | DATA_BRIDGE | Current size, threshold |

### 5.5 Lifecycle Events

| Event | Level | Category | What to Log |
|-------|-------|----------|-------------|
| Service worker started | INFO | LIFECYCLE | Boot time (ms), persistence mode |
| Service worker idle | INFO | LIFECYCLE | Session duration, log count |
| Database flushed | DEBUG | LIFECYCLE | Flush mode, duration (ms), DB sizes |
| Database loaded | INFO | LIFECYCLE | Persistence mode, log count, error count |
| Schema migration | INFO | LIFECYCLE | From version, to version, migration name |

---

## 6. Usage Examples (for README)

### 6.1 Basic Logging

```javascript
// Your user script (e.g., "workspace-monitor.js")
// The marco object is automatically available — no imports needed.

marco.log.info('Script started');
marco.log.info('Found workspaces', { count: 5, names: ['WS-1', 'WS-2'] });
marco.log.warn('Workspace credits low', { wsId: 'abc', remaining: 2 });
marco.log.error('Failed to fetch data', { url: '/api/data', status: 500 });
marco.log.debug('DOM element found', { selector: '#main', tagName: 'DIV' });
```

### 6.2 Structured Logging with Categories

```javascript
// Use marco.log.write() for full control over category and action
marco.log.write({
  level: 'INFO',
  category: 'API',
  action: 'fetch_workspaces',
  message: 'Fetched workspace list',
  metadata: { count: 10, durationMs: 245 }
});

marco.log.write({
  level: 'ERROR',
  category: 'DOM',
  action: 'element_not_found',
  message: 'Could not find start button',
  metadata: { selector: '#start-btn', retries: 3 }
});
```

### 6.3 Cross-Site Data Sharing (Project-Scoped)

```javascript
// Script A on site-a.com — save data
await marco.store.set('lastWorkspace', { id: 'ws-123', name: 'Production' });
await marco.store.set('sessionToken', 'abc-def-ghi');

// Script B on site-b.com (SAME project) — read data
const ws = await marco.store.get('lastWorkspace');
console.log(ws.name); // → 'Production'

const token = await marco.store.get('sessionToken');
// Use the token for cross-site API calls
```

### 6.4 Global Data Sharing (Across Projects)

```javascript
// Project "Monitor" on dashboard.example.com
await marco.store.setGlobal('sharedConfig', {
  apiEndpoint: 'https://api.example.com',
  version: '2.1',
  features: ['logging', 'alerts']
});

// Project "Worker" on worker.example.com
const config = await marco.store.getGlobal('sharedConfig');
fetch(config.apiEndpoint + '/status'); // Use shared config
```

### 6.5 Data Cleanup

```javascript
// List all keys for this project
const keys = await marco.store.keys();
console.log(keys); // → ['lastWorkspace', 'sessionToken', ...]

// Get everything
const all = await marco.store.getAll();
// → { lastWorkspace: {...}, sessionToken: 'abc-def-ghi' }

// Delete specific key
await marco.store.delete('sessionToken');

// Clear all project data
await marco.store.clear();
```

### 6.6 Accessing Script Context

```javascript
// The marco object exposes the injection context
console.log(marco.context.projectId);  // → 'uuid-...'
console.log(marco.context.scriptId);   // → 'uuid-...'
console.log(marco.context.configId);   // → 'uuid-...' or ''
console.log(marco.context.urlRuleId);  // → 'uuid-...'
```

---

## 7. New Message Types

Add to `chrome-extension/src/shared/messages.ts`:

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `USER_SCRIPT_LOG` | Content → Background | Insert user script log entry |
| `USER_SCRIPT_DATA_SET` | Content → Background | Set a key-value pair |
| `USER_SCRIPT_DATA_GET` | Content → Background | Get a value by key |
| `USER_SCRIPT_DATA_DELETE` | Content → Background | Delete a key |
| `USER_SCRIPT_DATA_KEYS` | Content → Background | List keys by prefix |
| `USER_SCRIPT_DATA_GET_ALL` | Content → Background | Get all entries by prefix |
| `USER_SCRIPT_DATA_CLEAR` | Content → Background | Clear all entries by prefix |

---

## 8. New Error Codes

Add to `error_codes` table:

```sql
INSERT OR IGNORE INTO error_codes VALUES
  ('USER_SCRIPT_LOG_ERROR', 'WARNING',     'User script logged an error via marco.log.error()',  'Check script logic'),
  ('DATA_STORE_FULL',       'WARNING',     'User data store exceeded size limit',                'Clear unused keys'),
  ('DATA_KEY_TOO_LONG',     'RECOVERABLE', 'Data key exceeds 256 character limit',               'Use shorter key names'),
  ('DATA_VALUE_TOO_LARGE',  'RECOVERABLE', 'Data value exceeds 1 MB limit',                      'Reduce data size');
```

---

## 9. Implementation Files

| File | Purpose |
|------|---------|
| `src/background/handlers/user-script-log-handler.ts` | Handle `USER_SCRIPT_LOG` messages |
| `src/background/handlers/data-bridge-handler.ts` | Handle `USER_SCRIPT_DATA_*` messages |
| `src/content-scripts/message-relay.ts` | Content script relay (window ↔ chrome.runtime) |
| `src/shared/messages.ts` | Message type registry (7 `USER_SCRIPT_*` types) |
| `standalone-scripts/macro-controller/01-macro-looping.js` | Macro controller (primary consumer of this SDK) |

---

## 10. Security Considerations

1. **No code execution** — The data bridge stores only JSON-serializable values. No functions or executable code.
2. **Key validation** — Keys must be strings, max 256 chars, no control characters.
3. **Value sanitization** — Values are `JSON.parse(JSON.stringify(value))` before storage to strip non-serializable content.
4. **Rate limiting** — Max 100 log messages per second per script. Excess messages are silently dropped.
5. **Token redaction** — If `metadata` contains keys matching `/token|auth|key|secret|password/i`, values are redacted to first 8 chars + `...REDACTED`.
6. **Project isolation** — Project-scoped data cannot be accessed by other projects (enforced by key prefix).

---

## 11. Data Browser Integration

The existing Data Browser (Options page) should display user-script logs with:

- **Source filter**: Add `'user-script'` to the source dropdown
- **Category filter**: Add `'USER'` and `'DATA_BRIDGE'` to category dropdown
- **Context columns**: Show `project_id` and `script_id` with human-readable names (lookup from storage)
- **Data Store tab**: New tab showing all `marco_user_data` entries with key, value preview, size, last updated, and project name

---

## 12. Relationship to Existing Specs

| Spec | Relationship |
|------|-------------|
| 06 (Logging Architecture) | This spec **extends** the logging schema. No schema changes needed — user-script logs use existing columns. |
| 18 (Message Protocol) | Adds 7 new message types to the registry. |
| 20 (User Script Error Isolation) | This spec is **complementary**. Spec 20 handles uncaught errors; this spec handles intentional logging. |
| 35 (Single Script Architecture) | SDK injection happens in the same pipeline as script injection. |
| 40 (Macro Looping Reference) | Documents the macro controller that is the primary consumer of the `marco.*` SDK. |
| 43 (Extension Bridge) | Defines the `window.postMessage` ↔ content script ↔ background transport that this SDK relies on. |
