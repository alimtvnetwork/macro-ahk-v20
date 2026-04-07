# Chrome Extension — Error Recovery Flows

**Version**: v0.2 (Phase 5 Expansion)
**Date**: 2026-02-28
**Changes in v0.2**: Added service worker lifecycle (Flow 8), CSP detection (Flow 9)

---

## Purpose

Document every failure mode the extension can encounter, its detection mechanism, automatic recovery strategy, and user-facing notification. Each flow maps to an `error_code` defined in `06-logging-architecture.md`.

---

## Recovery Philosophy

1. **Auto-recover silently** when possible — user should never notice transient failures
2. **Degrade gracefully** when full recovery isn't possible — keep partial functionality running
3. **Notify only when user action is required** — no false alarms
4. **Log everything** — even silent recoveries get logged to `errors.db` for traceability

### Severity Model

| Severity | Behavior | User Notification |
|----------|----------|-------------------|
| `RECOVERABLE` | Auto-retry with backoff, then degrade | None if recovered; subtle indicator if degraded |
| `WARNING` | Log and continue, may affect accuracy | Yellow indicator in panel (non-blocking) |
| `FATAL` | Cannot continue specific subsystem | Red indicator + actionable message in panel/popup |

---

## Flow 1: WASM Load Failure (`WASM_LOAD_FAIL`)

### When It Happens
- Extension installs with corrupted files
- Browser blocks WASM execution (rare CSP issue)
- Disk I/O error reading `sql-wasm.wasm`

### Detection
```javascript
async function initDatabases() {
  try {
    SQL = await initSqlJs({
      locateFile: file => chrome.runtime.getURL(`wasm/${file}`)
    });
  } catch (err) {
    handleWasmLoadFailure(err);
    return;
  }
}
```

### Recovery Flow

```
WASM load fails
    │
    ▼
Retry once after 2s delay
    │
    ├── Success → continue normally, log recovery
    │
    └── Fail again
         │
         ▼
    Fall back to in-memory-only logging
    (console.log + chrome.storage.local JSON array)
         │
         ▼
    Set global flag: loggingMode = 'fallback'
         │
         ▼
    Notify content scripts: { type: 'LOGGING_DEGRADED' }
         │
         ▼
    Show in popup: "⚠ Logging degraded — SQLite unavailable"
```

### Fallback Logger

```javascript
// When SQLite is unavailable, fall back to simple JSON array in storage
const FALLBACK_LOG_KEY = 'marco_fallback_logs';
const MAX_FALLBACK_ENTRIES = 500;

async function fallbackLog(level, source, action, detail) {
  const stored = await chrome.storage.local.get(FALLBACK_LOG_KEY);
  const logs = stored[FALLBACK_LOG_KEY] || [];

  logs.push({
    timestamp: new Date().toISOString(),
    level, source, action, detail
  });

  // Keep only last N entries to prevent storage bloat
  if (logs.length > MAX_FALLBACK_ENTRIES) {
    logs.splice(0, logs.length - MAX_FALLBACK_ENTRIES);
  }

  await chrome.storage.local.set({ [FALLBACK_LOG_KEY]: logs });
}
```

### What Still Works
- ✅ All content script functionality (combo.js, macro-looping.js)
- ✅ Cookie reading and token management
- ✅ Config loading
- ✅ Basic logging to console + storage
- ❌ SQL queries on logs
- ❌ `.db` file export
- ❌ Session-based log grouping

### Recovery on Next Restart
On every service worker wake, retry WASM initialization. If it succeeds, migrate fallback logs into SQLite:

```javascript
async function migrateFallbackLogs() {
  const stored = await chrome.storage.local.get(FALLBACK_LOG_KEY);
  const logs = stored[FALLBACK_LOG_KEY];
  if (!logs || logs.length === 0) return;

  for (const entry of logs) {
    logsDb.run(
      `INSERT INTO logs (session_id, timestamp, level, source, category, action, detail)
       VALUES (?, ?, ?, ?, 'LIFECYCLE', ?, ?)`,
      [currentSessionId, entry.timestamp, entry.level, entry.source, entry.action, entry.detail]
    );
  }

  await chrome.storage.local.remove(FALLBACK_LOG_KEY);
  log('INFO', 'background', 'LIFECYCLE', 'fallback_migrated',
      'Migrated ' + logs.length + ' fallback log entries to SQLite');
}
```

---

## Flow 2: Storage Quota Exceeded (`STORAGE_FULL`)

### When It Happens
- `logs.db` grows beyond `chrome.storage.local` quota (10 MB default, unlimited with permission)
- Multiple large sessions accumulate without pruning
- `unlimitedStorage` permission missing or revoked

### Detection
```javascript
async function flushToStorage() {
  try {
    const logsData = logsDb.export();
    const errorsData = errorsDb.export();
    await chrome.storage.local.set({
      [DB_KEYS.logs]: Array.from(logsData),
      [DB_KEYS.errors]: Array.from(errorsData)
    });
  } catch (err) {
    if (err.message?.includes('QUOTA_BYTES') || err.message?.includes('quota')) {
      handleStorageFull(err);
    } else {
      throw err;
    }
  }
}
```

### Recovery Flow

```
Storage write fails (quota exceeded)
    │
    ▼
Step 1: Auto-prune old sessions (keep last 3)
    │
    ├── Frees enough space → retry flush → success
    │
    └── Still full
         │
         ▼
Step 2: Truncate large response bodies in api_calls
    (SET response_body = NULL WHERE length(response_body) > 1000)
         │
         ├── Frees enough space → retry flush → success
         │
         └── Still full
              │
              ▼
Step 3: Drop errors.db data (logs.db is higher priority)
              │
              ├── Frees enough space → retry flush → success
              │
              └── Still full
                   │
                   ▼
Step 4: Switch to in-memory only mode
    (stop persisting, warn user)
    Show in popup: "⚠ Storage full — logs not being saved"
    Show in panel: "💾 Storage full — click to prune"
```

### Implementation

```javascript
async function handleStorageFull(originalError) {
  log('WARN', 'background', 'LIFECYCLE', 'storage_full', 'Storage quota exceeded, starting auto-prune');

  // Step 1: Prune old sessions
  const pruned = await pruneOldSessions(3);
  if (await tryFlush()) return;

  // Step 2: Truncate large blobs
  logsDb.run(`UPDATE api_calls SET response_body = NULL WHERE length(response_body) > 1000`);
  logsDb.run(`UPDATE logs SET metadata = NULL WHERE length(metadata) > 500`);
  if (await tryFlush()) return;

  // Step 3: Clear errors.db
  errorsDb.run('DELETE FROM errors');
  if (await tryFlush()) return;

  // Step 4: Give up persisting
  persistenceEnabled = false;
  notifyAllTabs({ type: 'STORAGE_FULL' });
  logError('background', 'STORAGE_FULL', 'All pruning attempts failed — logging to memory only',
           { originalError: originalError.message });
}

async function tryFlush() {
  try {
    await flushToStorage();
    log('INFO', 'background', 'LIFECYCLE', 'storage_recovered', 'Storage flush succeeded after pruning');
    return true;
  } catch (e) {
    return false;
  }
}
```

### Storage Budget Monitor

Proactive monitoring to warn before hitting quota:

```javascript
async function checkStorageBudget() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10 MB default
  const usagePercent = (bytesInUse / quota) * 100;

  if (usagePercent > 90) {
    log('WARN', 'background', 'LIFECYCLE', 'storage_warning',
        'Storage usage at ' + usagePercent.toFixed(1) + '% (' +
        (bytesInUse / 1024 / 1024).toFixed(2) + ' MB / ' +
        (quota / 1024 / 1024).toFixed(2) + ' MB)');
    // Auto-prune if above 90%
    await pruneOldSessions(5);
  }

  return { bytesInUse, quota, usagePercent };
}

// Check every 5 minutes
setInterval(checkStorageBudget, 300000);
```

---

## Flow 3: Network / API Errors

### 3a. API Timeout (`API_TIMEOUT`)

**Detection**: `AbortController` with configurable timeout (default 10s)

```javascript
async function apiFetch(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return resp;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new ApiError('API_TIMEOUT', 'Request to ' + url + ' timed out after ' + timeoutMs + 'ms');
    }
    throw new ApiError('API_NETWORK', 'Network error: ' + err.message);
  }
}
```

**Recovery**:
```
Timeout
  │
  ▼
Retry with exponential backoff (1s → 2s → 4s)
  │
  ├── Max 3 retries
  ├── Success on retry → log recovery, continue
  │
  └── All retries exhausted
       │
       ▼
  Log ERROR, show "API unreachable" in panel
  Continue operating with stale/cached data
```

### 3b. Server Error (`API_SERVER_ERROR`) — 5xx

**Recovery**: Same retry strategy as timeout. After retries exhausted, use cached workspace data if available.

### 3c. Rate Limited (`API_RATE_LIMITED`) — 429

**Detection**: Check `Retry-After` header

```javascript
if (resp.status === 429) {
  const retryAfter = parseInt(resp.headers.get('Retry-After') || '60', 10);
  log('WARN', source, 'API', 'rate_limited',
      'Rate limited on ' + url + ', retry after ' + retryAfter + 's');
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  // Single retry after waiting
  return await fetch(url, options);
}
```

### 3d. Auth Failure — 401/403

Covered in `04-cookie-and-auth.md`. Summary:

```
401/403 received
  │
  ▼
Request fresh token from background (chrome.cookies.get)
  │
  ├── New token found → retry request with new Bearer header
  │    └── Still 401 → token is invalid, not just expired
  │         └── Show "Please log in" + clear cached token
  │
  └── No cookie found → user logged out
       └── Show "Session expired — please log in to lovable.dev"
            Mark all API-dependent features as disabled
```

### 3e. Network Offline

**Detection**: `navigator.onLine` + `fetch` failure without abort

```javascript
window.addEventListener('offline', () => {
  chrome.runtime.sendMessage({ type: 'NETWORK_STATUS', online: false });
});
window.addEventListener('online', () => {
  chrome.runtime.sendMessage({ type: 'NETWORK_STATUS', online: true });
});
```

**Recovery**:
```
Network offline detected
  │
  ▼
Pause all API polling (credit checks, workspace detection)
Show "📡 Offline" badge on extension icon
Continue UI operations with cached data
  │
  ▼
Network online detected
  │
  ▼
Resume API polling
Immediately trigger one credit check + workspace refresh
Remove offline badge
Log duration of offline period
```

### Unified Retry Engine

All API errors flow through a shared retry wrapper:

```javascript
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, context = '' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt > maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      const jitter = Math.random() * 500; // 0-500ms jitter
      log('WARN', 'background', 'API', 'retry',
          context + ' attempt ' + attempt + '/' + maxRetries +
          ' failed (' + err.message + '), retrying in ' + delay + 'ms');
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }

  logError('background', lastError.code || 'API_ERROR',
           context + ' failed after ' + maxRetries + ' retries: ' + lastError.message);
  throw lastError;
}

// Usage
const workspaces = await withRetry(
  () => apiFetch('https://api.lovable.dev/user/workspaces', { headers }),
  { context: 'fetch_workspaces' }
);
```

---

## Flow 4: Content Script Injection Failure (`INJECTION_FAILED`)

### When It Happens
- Page URL doesn't match `host_permissions`
- `chrome.scripting.executeScript` throws (permission denied, tab closed, frame navigated)
- Script syntax error prevents execution
- Page CSP blocks inline script execution

### Detection

```javascript
async function injectScript(tabId, scriptFile, ruleId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile]
    });
    return true;
  } catch (err) {
    handleInjectionFailure(tabId, scriptFile, ruleId, err);
    return false;
  }
}
```

### Recovery Flow

```
Injection fails
    │
    ▼
Classify error
    │
    ├── "Cannot access a chrome:// URL"
    │    → Expected, ignore silently (user browsing chrome:// pages)
    │
    ├── "No tab with id: NNN"
    │    → Tab was closed during injection, ignore
    │
    ├── "Cannot access contents of the page"
    │    → Permission issue
    │    │
    │    ▼
    │    Check if URL matches host_permissions
    │    ├── No match → log INFO, expected behavior
    │    └── Should match → log ERROR, possible manifest issue
    │         → Show in popup: "⚠ Cannot inject into [url]"
    │
    ├── Script syntax error (rare — code bug)
    │    → log FATAL with full error
    │    → Show in popup: "❌ Script error in [file] — check console"
    │
    └── Unknown error
         → Retry once after 1s
         ├── Success → log recovery
         └── Fail → log ERROR, skip this tab
```

### Implementation

```javascript
function handleInjectionFailure(tabId, scriptFile, ruleId, err) {
  const msg = err.message || '';

  // Expected/ignorable failures
  if (msg.includes('chrome://') || msg.includes('chrome-extension://') ||
      msg.includes('No tab with id') || msg.includes('The tab was closed')) {
    return; // Silent — not worth logging
  }

  if (msg.includes('Cannot access contents')) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return; // Tab gone
      logError('background', 'INJECTION_FAILED',
               'Cannot inject ' + scriptFile + ' into ' + (tab?.url || 'unknown'),
               { ruleId, tabId, error: msg });
    });
    return;
  }

  // Unexpected — retry once
  setTimeout(async () => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [scriptFile] });
      log('INFO', 'background', 'INJECTION', 'inject_retry_success',
          'Retry succeeded for ' + scriptFile + ' (rule: ' + ruleId + ')');
    } catch (retryErr) {
      logError('background', 'INJECTION_FAILED',
               'Injection failed after retry: ' + scriptFile,
               { ruleId, tabId, error: retryErr.message, originalError: msg });
    }
  }, 1000);
}
```

### Content Script Self-Check

Each content script verifies its own initialization succeeded:

```javascript
// At the end of combo.js / macro-looping.js init
try {
  // Verify critical dependencies
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Chrome extension APIs not available');
  }

  // Verify DOM is ready
  if (!document.body) {
    throw new Error('document.body not available');
  }

  // Verify config was received
  if (!CONFIG || Object.keys(CONFIG).length === 0) {
    throw new Error('Config not loaded');
  }

  chrome.runtime.sendMessage({
    type: 'INJECTION_CONFIRMED',
    script: 'combo', // or 'macro-loop'
    url: window.location.href,
    timestamp: new Date().toISOString()
  });
} catch (err) {
  chrome.runtime.sendMessage({
    type: 'ERROR',
    payload: {
      source: 'combo',
      errorCode: 'INJECTION_FAILED',
      message: 'Self-check failed: ' + err.message,
      context: { url: window.location.href }
    }
  });
}
```

---

## Flow 5: Database Corruption (`DB_CORRUPT`)

### When It Happens
- Storage byte array was partially written (service worker killed mid-flush)
- Chrome storage corruption (rare)
- Manual tampering with stored data

### Detection

```javascript
function checkDatabaseIntegrity(db) {
  try {
    const result = db.exec('PRAGMA integrity_check');
    const status = result[0]?.values[0]?.[0];
    if (status !== 'ok') {
      throw new Error('Integrity check failed: ' + status);
    }
    return true;
  } catch (err) {
    return false;
  }
}
```

### Recovery Flow

```
Database fails integrity check OR fails to deserialize
    │
    ▼
Attempt to recover readable data
    │
    ├── Can read some tables → export recoverable rows to JSON
    │
    └── Completely unreadable → skip export
         │
         ▼
Delete corrupted database from storage
    │
    ▼
Create fresh database with schema
    │
    ▼
If recovered data exists → import into fresh DB under "recovery-TIMESTAMP" session
    │
    ▼
Log FATAL error with corruption details
    │
    ▼
Show in popup: "⚠ Database was rebuilt — some old logs may be lost"
```

### Implementation

```javascript
async function loadOrRecreateDatabase(dbKey, schemaSQL, dbName) {
  const stored = await chrome.storage.local.get(dbKey);

  if (stored[dbKey]) {
    try {
      const db = new SQL.Database(new Uint8Array(stored[dbKey]));
      if (checkDatabaseIntegrity(db)) {
        return db; // All good
      }
      // Integrity failed — try to salvage
      log('WARN', 'background', 'LIFECYCLE', 'db_integrity_fail',
          dbName + ' failed integrity check — attempting recovery');
      return await recoverAndRecreate(db, dbKey, schemaSQL, dbName);
    } catch (err) {
      // Complete deserialization failure
      log('WARN', 'background', 'LIFECYCLE', 'db_load_fail',
          dbName + ' failed to load: ' + err.message + ' — recreating');
      return await recreateDatabase(dbKey, schemaSQL, dbName);
    }
  }

  // No stored data — create fresh
  const db = new SQL.Database();
  db.run(schemaSQL);
  return db;
}

async function recreateDatabase(dbKey, schemaSQL, dbName) {
  await chrome.storage.local.remove(dbKey);
  const db = new SQL.Database();
  db.run(schemaSQL);
  logError('background', 'DB_CORRUPT',
           dbName + ' was corrupted and has been recreated (data lost)',
           { dbKey });
  return db;
}
```

---

## Flow 6: Config Load Failure (`CONFIG_LOAD_FAIL`)

### When It Happens
- Bundled `config.json` is missing or malformed
- `chrome.storage.local` returns corrupted config
- Remote config endpoint returns invalid JSON

### Recovery Flow

```
Config load fails
    │
    ▼
Try each source in order:
    │
    ├── 1. chrome.storage.local
    │    └── Fail → try next
    │
    ├── 2. Bundled config.json (chrome.runtime.getURL)
    │    └── Fail → try next
    │
    └── 3. Hardcoded minimal defaults (embedded in background.js)
         │
         ▼
    Use whatever loaded successfully
    If only hardcoded defaults → show "⚠ Using default config"
    If nothing at all → FATAL, extension cannot operate
```

### Hardcoded Minimal Defaults

```javascript
const EMERGENCY_DEFAULTS = {
  version: '1.0.0',
  general: { debug: true },
  creditStatus: {
    api: {
      baseUrl: 'https://api.lovable.dev',
      authMode: 'cookieSession'
    },
    timing: { autoCheckIntervalSeconds: 60 }
  },
  comboSwitch: { timing: { pollIntervalMs: 300 } },
  macroLoop: { timing: { loopIntervalMs: 50000 } }
};
```

---

## Flow 7: Remote Config Fetch Failure

### Recovery Flow

```
Remote config endpoint fails
    │
    ▼
Is fallbackToLocal = true? (default yes)
    │
    ├── Yes → use local config silently
    │    Log WARN with endpoint URL and error
    │    Set lastFetchStatus = "error:XXX"
    │    Retry on next refresh interval
    │
    └── No → treat as CONFIG_LOAD_FAIL
         Follow Flow 6
```

---

## Error Notification UI

### Panel Indicators (Content Script)

Errors appear as colored bars at the top of the controller panel:

```
┌─────────────────────────────────────────┐
│ ⚠ Offline — using cached data          │  ← yellow bar, dismissible
│─────────────────────────────────────────│
│ [ComboSwitch v1.0.0]        [−] [×]    │
│ ...                                     │
```

```
┌─────────────────────────────────────────┐
│ ❌ Session expired — log in to continue │  ← red bar, not dismissible
│─────────────────────────────────────────│
│ [MacroLoop v1.0.0]          [−] [×]    │
│ ...                                     │
```

### Popup Status Section

```
┌─────────────────────────────────────┐
│  🔧 Marco Extension  v1.0.0        │
│─────────────────────────────────────│
│  Status: ⚠ Degraded               │
│                                     │
│  Issues:                            │
│  • SQLite unavailable (using JSON)  │
│  • Storage at 87% capacity          │
│                                     │
│  [View Error Log]  [Reset All Data] │
└─────────────────────────────────────┘
```

### Extension Badge

The extension icon badge reflects the worst active error:

| State | Badge | Color |
|-------|-------|-------|
| All OK | (none) | — |
| Warning (degraded logging, high storage) | `!` | Yellow `#fbbf24` |
| Error (auth expired, injection failed) | `!!` | Orange `#f97316` |
| Fatal (offline, no config) | `X` | Red `#ef4444` |

```javascript
function updateBadge(worstSeverity) {
  const badges = {
    ok:     { text: '', color: '#000000' },
    warn:   { text: '!', color: '#fbbf24' },
    error:  { text: '!!', color: '#f97316' },
    fatal:  { text: 'X', color: '#ef4444' }
  };
  const b = badges[worstSeverity] || badges.ok;
  chrome.action.setBadgeText({ text: b.text });
  chrome.action.setBadgeBackgroundColor({ color: b.color });
}
```

---

## Error State Machine

```
                    ┌──────────┐
                    │  HEALTHY │
                    └────┬─────┘
                         │
              Error detected
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │DEGRADED │    │  ERROR   │    │  FATAL   │
    │(warning)│    │(blocking)│    │(shutdown)│
    └────┬────┘    └────┬─────┘    └────┬─────┘
         │              │               │
    Auto-recover    User action     User action
    or next restart  or auto-retry   required
         │              │               │
         ▼              ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ HEALTHY  │   │ HEALTHY  │   │ HEALTHY  │
    └──────────┘   └──────────┘   └──────────┘
```

### Active Errors Tracker

```javascript
// background.js — tracks all active errors for badge/popup display
const activeErrors = new Map(); // code → { severity, message, since, context }

function registerError(code, severity, message, context) {
  activeErrors.set(code, {
    severity,
    message,
    since: new Date().toISOString(),
    context
  });
  updateBadge(getWorstSeverity());
  notifyPopup();
}

function clearError(code) {
  activeErrors.delete(code);
  updateBadge(getWorstSeverity());
  notifyPopup();
}

function getWorstSeverity() {
  const severities = ['fatal', 'error', 'warn', 'ok'];
  for (const s of severities) {
    if ([...activeErrors.values()].some(e => e.severity === s)) return s;
  }
  return 'ok';
}
```

---

## Complete Error Code Reference

| Code | Severity | Auto-Recovery | User Action Required | Spec Reference |
|------|----------|--------------|---------------------|----------------|
| `WASM_LOAD_FAIL` | FATAL | Retry once → fallback to JSON logging | None unless persists across restarts | This spec, Flow 1 |
| `STORAGE_FULL` | WARNING | Auto-prune old sessions → truncate blobs | "Prune data" button in popup | This spec, Flow 2 |
| `API_TIMEOUT` | RECOVERABLE | 3 retries with exponential backoff | None | This spec, Flow 3a |
| `API_SERVER_ERROR` | RECOVERABLE | 3 retries with exponential backoff | None | This spec, Flow 3b |
| `API_RATE_LIMITED` | RECOVERABLE | Wait `Retry-After` header duration | None | This spec, Flow 3c |
| `AUTH_EXPIRED` | RECOVERABLE | Auto-read cookie via `chrome.cookies` | Log in if cookie gone | `04-cookie-and-auth.md` |
| `AUTH_MISSING` | FATAL | Check cookie once | Log in to lovable.dev | `04-cookie-and-auth.md` |
| `NETWORK_OFFLINE` | FATAL | Auto-resume on `online` event | Check internet connection | This spec, Flow 3e |
| `INJECTION_FAILED` | FATAL | Retry once after 1s | Check URL permissions | This spec, Flow 4 |
| `CONFIG_LOAD_FAIL` | FATAL | 3-tier fallback (storage → bundle → hardcoded) | Reinstall if persists | This spec, Flow 6 |
| `CONFIG_INVALID` | FATAL | Use defaults for invalid keys | Fix config in options page | `02-config-json-schema.md` |
| `DB_CORRUPT` | FATAL | Recreate database (data loss) | None (automatic) | This spec, Flow 5 |
| `XPATH_NOT_FOUND` | RECOVERABLE | Retry with fallback selectors | Update XPath in config | `07-advanced-features.md` |
| `XPATH_STALE` | WARNING | Re-query after 500ms delay | None | `06-logging-architecture.md` |
| `REMOTE_CONFIG_FAIL` | WARNING | Fallback to local config | Check endpoint URL | This spec, Flow 7 |
| `SW_TERMINATED` | WARNING | Rehydrate DBs from storage on wake | None (automatic) | This spec, Flow 8 |
| `CSP_BLOCKED` | RECOVERABLE | Fall back to ISOLATED world | Check page CSP | This spec, Flow 9 |

---

## Flow 8: Service Worker Termination (`SW_TERMINATED`) (v0.2)

### The Problem

Manifest V3 service workers are **not persistent**. Chrome can terminate them after ~30 seconds of inactivity. This means:

- In-memory SQLite databases (`logsDb`, `errorsDb`) are lost
- All in-memory state (`activeErrors`, `currentSessionId`) is lost
- Interval timers (`setInterval`) are cancelled

### When It Happens

- No messages received for 30 seconds
- No active connections (ports) open
- Chrome decides to reclaim memory
- After a system sleep/wake cycle

### Detection

The service worker has no `beforeunload` event. Detection is **on wake**:

```javascript
// background.js — top-level code runs on every wake
let isRehydrated = false;

async function ensureInitialized() {
  if (isRehydrated) return;
  isRehydrated = true;

  const startTime = performance.now();
  await initDatabases();       // Reload SQLite from chrome.storage.local
  await migrateSchema();       // Apply any pending migrations
  await loadActiveErrors();    // Restore from storage
  await resumeSession();       // Continue existing session or start new

  const elapsed = Math.round(performance.now() - startTime);
  log('INFO', 'background', 'LIFECYCLE', 'sw_rehydrated',
      'Service worker rehydrated in ' + elapsed + 'ms');
}

// Every message handler must call this first
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ensureInitialized().then(() => {
    handleMessage(msg, sender, sendResponse);
  });
  return true; // async response
});
```

### Keepalive Strategy

For operations that need the worker to stay alive (e.g., active XPath recording, macro loop cycle):

```javascript
// Use chrome.alarms to prevent termination during active operations
function startKeepalive(reason) {
  chrome.alarms.create('marco-keepalive', { periodInMinutes: 0.4 }); // Every 24s (under 30s limit)
  log('DEBUG', 'background', 'LIFECYCLE', 'keepalive_start', 'Keepalive started: ' + reason);
}

function stopKeepalive() {
  chrome.alarms.clear('marco-keepalive');
  log('DEBUG', 'background', 'LIFECYCLE', 'keepalive_stop', 'Keepalive stopped');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'marco-keepalive') {
    // Alarm handler itself keeps the worker alive
    // Optionally flush DBs on each keepalive tick
    flushToStorage();
  }
});
```

### Session Continuity

When the worker wakes, it must decide whether to continue the previous session or start a new one:

```javascript
async function resumeSession() {
  const stored = await chrome.storage.session.get('marco_current_session');
  if (stored.marco_current_session) {
    currentSessionId = stored.marco_current_session;
    // Verify session exists in DB
    const result = logsDb.exec(
      'SELECT id FROM sessions WHERE id = ? AND ended_at IS NULL',
      [currentSessionId]
    );
    if (result[0]?.values?.length > 0) {
      return; // Session still valid, continue
    }
  }
  // Start new session
  createNewSession();
}
```

### State Persistence Checklist

| State | Storage Location | Survives Termination |
|-------|-----------------|---------------------|
| SQLite databases | `chrome.storage.local` (byte arrays) | ✅ Yes (reloaded on wake) |
| Current session ID | `chrome.storage.session` | ✅ Yes (cleared on browser close only) |
| Active errors map | `chrome.storage.session` | ✅ Yes (serialized on each change) |
| Interval timers | In-memory | ❌ No — must be replaced with `chrome.alarms` |
| Pending API retries | In-memory | ❌ No — lost, will retry on next trigger |
| XPath recorder state | `chrome.storage.session` | ✅ Yes |
| Cached token | `chrome.storage.session` | ✅ Yes |

### Critical Change from v0.1

All `setInterval()` calls in the background service worker **must be replaced** with `chrome.alarms`:

```javascript
// ❌ WRONG — will be cancelled on termination
setInterval(flushToStorage, 30000);
setInterval(checkStorageBudget, 300000);

// ✅ CORRECT — survives termination
chrome.alarms.create('marco-db-flush', { periodInMinutes: 0.5 });     // Every 30s
chrome.alarms.create('marco-storage-check', { periodInMinutes: 5 });  // Every 5 min

chrome.alarms.onAlarm.addListener((alarm) => {
  ensureInitialized().then(() => {
    if (alarm.name === 'marco-db-flush') flushToStorage();
    if (alarm.name === 'marco-storage-check') checkStorageBudget();
  });
});
```

---

## Flow 9: Content Security Policy Blocks MAIN World Injection (`CSP_BLOCKED`) (v0.2)

### The Problem

When a user script is configured to run in `world: 'MAIN'`, Chrome injects it into the page's execution context. If the page has a strict Content Security Policy (e.g., `script-src 'self'`), the injection may fail silently or throw an error.

### Detection

```javascript
async function injectUserScript(tabId, scriptBinding, storedScript) {
  const world = scriptBinding.world || storedScript.world || 'ISOLATED';

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: world,
      func: executeUserCode,
      args: [storedScript.content]
    });
    return { success: true, world };
  } catch (err) {
    if (world === 'MAIN' && isCSPError(err)) {
      return await fallbackToIsolated(tabId, scriptBinding, storedScript, err);
    }
    throw err;
  }
}

function isCSPError(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('content security policy') ||
         msg.includes('csp') ||
         msg.includes('refused to execute');
}
```

### Recovery Flow

```
MAIN world injection fails with CSP error
    │
    ▼
Log WARNING with page URL and CSP details
    │
    ▼
Retry in ISOLATED world
    │
    ├── Success in ISOLATED
    │    └── Log: "Script '{name}' fell back to ISOLATED world due to CSP on {url}"
    │    └── Show subtle indicator in popup: script badge shows "ISO⚠" instead of "MAIN"
    │
    └── Also fails in ISOLATED (very rare)
         └── Log ERROR: INJECTION_FAILED
         └── Follow Flow 4 recovery
```

### User-Facing Behavior

- Script cards in popup show `MAIN` or `ISO` badge — if CSP fallback occurred, show `ISO⚠` with tooltip: "Fell back from MAIN due to page CSP"
- The script still runs but may not have access to page globals (which is why it was set to MAIN in the first place)
- Options page URL rule editor shows a warning if a script is set to MAIN world: "⚠ MAIN world may not work on pages with strict CSP"

### CSP Pre-Check (Optional Optimization)

Before injecting in MAIN world, optionally check the page's CSP header:

```javascript
async function checkPageCSP(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        return meta ? meta.content : null;
      }
    });
    const csp = results[0]?.result;
    if (csp && !csp.includes("'unsafe-eval'") && !csp.includes("'unsafe-inline'")) {
      return { strict: true, csp };
    }
    return { strict: false };
  } catch (e) {
    return { strict: false }; // Can't check, try anyway
  }
}
```
