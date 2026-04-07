# Chrome Extension — Logging Architecture (SQLite / sql.js WASM)

**Version**: v0.2 (Phase 3 Expansion)
**Date**: 2026-02-28
**Decision**: SQLite via sql.js (WASM) — chosen over IndexedDB for SQL query power and exportable `.db` files
**Changes in v0.2**: Added project/script/config context columns, ZIP export, USER_SCRIPT_ERROR handling, schema migration

---

## Purpose

Provide structured, session-based, exportable logging for all Chrome extension activity. Two separate SQLite databases isolate operational logs from errors, enabling independent cleanup and export.

---

## Database Files

| Database | Purpose | Typical Size |
|----------|---------|-------------|
| `logs.db` | All operational activity (API calls, state changes, script injection, UI events) | 1–10 MB |
| `errors.db` | All errors, warnings, and exceptions (stack traces, failed requests, validation failures) | 0.5–5 MB |

Both are stored as byte arrays in `chrome.storage.local` (or OPFS when available). The background service worker owns both databases and handles all reads/writes. Content scripts send log entries via `chrome.runtime.sendMessage`.

---

## Schema — `logs.db`

### `sessions` table

Tracks each extension activation session. A new session starts when the extension service worker wakes or the user clicks "New Session."

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,    -- UUID v4
  started_at  TEXT NOT NULL,       -- ISO 8601
  ended_at    TEXT,                -- ISO 8601, NULL if active
  version     TEXT NOT NULL,       -- Extension version from manifest
  user_agent  TEXT,                -- navigator.userAgent
  notes       TEXT                 -- Optional user-provided label
);
```

### `logs` table

Every discrete action or event produces one row.

```sql
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  timestamp   TEXT NOT NULL,       -- ISO 8601 with ms precision
  level       TEXT NOT NULL,       -- 'DEBUG' | 'INFO' | 'SUB' | 'STEP' | 'BANNER' | 'HIGHLIGHT' | 'WARN'
  source      TEXT NOT NULL,       -- 'combo' | 'macro-loop' | 'background' | 'popup' | 'options' | 'user-script'
  category    TEXT NOT NULL,       -- 'API' | 'DOM' | 'CONFIG' | 'AUTH' | 'INJECTION' | 'UI' | 'LIFECYCLE' | 'CREDIT' | 'WORKSPACE' | 'MOVE' | 'PROJECT' | 'MATCHING'
  action      TEXT NOT NULL,       -- Short verb: 'fetch_workspaces', 'inject_script', 'click_start'
  log_type    TEXT,                -- Color-coded type from macro-loop: 'success' | 'error' | 'warn' | 'delegate' | 'check' | 'skip' | 'info' (NULL for combo.js)
  indent      INTEGER DEFAULT 0,  -- Nesting depth: 0=main, 1-4=sub-levels (maps to logSub indent param)
  detail      TEXT,                -- Human-readable description
  metadata    TEXT,                -- JSON blob for structured data (request/response bodies, XPaths, timings)
  duration_ms INTEGER,             -- Optional: how long the action took
  -- v0.2 context columns (Phase 3)
  project_id    TEXT,              -- UUID of the Project that triggered this log entry (NULL for system events)
  url_rule_id   TEXT,              -- UUID of the matched UrlRule (NULL if not rule-triggered)
  script_id     TEXT,              -- UUID of the StoredScript being executed (NULL if not script-related)
  config_id     TEXT,              -- UUID of the StoredConfig being used (NULL if not config-related)
  ext_version   TEXT               -- Extension version string at time of log (from manifest)
);

CREATE INDEX idx_logs_session ON logs(session_id);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_source ON logs(source);
CREATE INDEX idx_logs_category ON logs(category);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_project ON logs(project_id);
CREATE INDEX idx_logs_script ON logs(script_id);
```

### `api_calls` table

Dedicated table for API request/response tracking (joined to logs via `log_id`).

```sql
CREATE TABLE api_calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id      INTEGER NOT NULL REFERENCES logs(id),
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  method      TEXT NOT NULL,       -- 'GET' | 'POST' | 'PUT' | 'DELETE'
  url         TEXT NOT NULL,
  status_code INTEGER,             -- HTTP status (0 if network error)
  request_headers  TEXT,           -- JSON (Authorization value REDACTED)
  response_body    TEXT,           -- JSON (truncated to 4KB max)
  duration_ms      INTEGER,
  error_message    TEXT            -- Non-null if fetch threw
);

CREATE INDEX idx_api_session ON api_calls(session_id);
CREATE INDEX idx_api_status ON api_calls(status_code);
```

---

## Schema — `errors.db`

### `errors` table

```sql
CREATE TABLE errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,       -- References logs.db sessions (cross-DB join by app logic)
  log_id      INTEGER,             -- Corresponding logs.id that triggered this error (NULL if standalone)
  timestamp   TEXT NOT NULL,       -- ISO 8601 with ms precision
  level       TEXT NOT NULL,       -- 'ERROR' | 'FATAL'
  source      TEXT NOT NULL,       -- Same as logs.source + 'user-script'
  category    TEXT NOT NULL,       -- Same as logs.category
  error_code  TEXT,                -- App-defined: 'AUTH_EXPIRED', 'XPATH_NOT_FOUND', 'USER_SCRIPT_ERROR', etc.
  step        INTEGER,             -- Step number from logError(fn, step, msg) — NULL if not step-based
  xpath       TEXT,                -- XPath that caused the error (from logError's xpath param)
  message     TEXT NOT NULL,       -- Error message
  stack_trace TEXT,                -- Full stack trace if available
  context     TEXT,                -- JSON: what was happening when the error occurred
  resolved    INTEGER DEFAULT 0,   -- 0 = unresolved, 1 = resolved/acknowledged
  resolution  TEXT,                -- How it was resolved (auto-retry, user action, etc.)
  -- v0.2 context columns (Phase 3)
  project_id    TEXT,              -- UUID of the Project context
  url_rule_id   TEXT,              -- UUID of the matched UrlRule
  script_id     TEXT,              -- UUID of the StoredScript that caused the error
  config_id     TEXT,              -- UUID of the StoredConfig in use
  script_file   TEXT,              -- Original fileName of the failing script (for user-uploaded scripts)
  error_line    INTEGER,           -- Line number in the failing script (parsed from stack trace)
  error_column  INTEGER,           -- Column number in the failing script (parsed from stack trace)
  ext_version   TEXT               -- Extension version string at time of error
);

CREATE INDEX idx_errors_session ON errors(session_id);
CREATE INDEX idx_errors_code ON errors(error_code);
CREATE INDEX idx_errors_level ON errors(level);
CREATE INDEX idx_errors_resolved ON errors(resolved);
CREATE INDEX idx_errors_project ON errors(project_id);
CREATE INDEX idx_errors_script ON errors(script_id);
```

### `error_codes` reference table

```sql
CREATE TABLE error_codes (
  code        TEXT PRIMARY KEY,
  severity    TEXT NOT NULL,       -- 'RECOVERABLE' | 'FATAL' | 'WARNING'
  description TEXT NOT NULL,
  recovery    TEXT                 -- Suggested recovery action
);

-- Seed data
INSERT INTO error_codes VALUES
  ('AUTH_EXPIRED',       'RECOVERABLE', 'Bearer token expired or invalid',            'Auto-refresh via chrome.cookies'),
  ('AUTH_MISSING',       'FATAL',       'No session cookie found',                     'User must log in to lovable.dev'),
  ('XPATH_NOT_FOUND',   'RECOVERABLE', 'XPath selector returned no element',          'Retry with fallback selectors'),
  ('XPATH_STALE',       'WARNING',     'XPath found element but it became stale',     'Re-query after short delay'),
  ('CONFIG_INVALID',    'FATAL',       'Config value failed schema validation',        'Reset to defaults or fix config'),
  ('CONFIG_LOAD_FAIL',  'FATAL',       'Could not load config.json or storage',       'Check extension files'),
  ('API_TIMEOUT',       'RECOVERABLE', 'API request timed out',                       'Retry with backoff'),
  ('API_SERVER_ERROR',  'RECOVERABLE', 'API returned 5xx',                            'Retry with backoff'),
  ('API_RATE_LIMITED',  'RECOVERABLE', 'API returned 429',                            'Wait and retry'),
  ('INJECTION_FAILED',  'FATAL',       'Content script could not inject into page',   'Check manifest matches'),
  ('STORAGE_FULL',      'WARNING',     'chrome.storage.local quota exceeded',          'Prune old sessions'),
  ('DB_CORRUPT',        'FATAL',       'SQLite database failed integrity check',      'Delete and recreate'),
  ('WASM_LOAD_FAIL',    'FATAL',       'sql.js WASM binary failed to load',           'Check extension integrity'),
  -- v0.2 additions (Phase 3)
  ('USER_SCRIPT_ERROR', 'RECOVERABLE', 'User-uploaded script threw an error',         'Check script source and stack trace'),
  ('USER_SCRIPT_TIMEOUT','WARNING',    'User-uploaded script exceeded execution time', 'Optimize script or increase timeout'),
  ('CONFIG_INJECT_FAIL','RECOVERABLE', 'Failed to inject config into script',         'Check injection method and config validity'),
  ('PROJECT_MATCH_FAIL','WARNING',     'URL matched rule but injection failed',        'Check conditions and script bindings'),
  ('SCHEMA_MIGRATION',  'WARNING',     'Database schema migration applied',            'Normal on version upgrade');
```

---

## Session Lifecycle

```
Extension starts / service worker wakes
    │
    ▼
┌─────────────────────────┐
│  Load logs.db + errors.db│
│  from chrome.storage     │
│  (deserialize byte arrays)│
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  INSERT INTO sessions    │
│  (new UUID, timestamp,   │
│   manifest version)      │
└──────────┬──────────────┘
           │
           ▼
     Normal operation
     (logs accumulate)
           │
           ▼
┌─────────────────────────┐
│  On idle / unload:       │
│  UPDATE sessions         │
│    SET ended_at = NOW    │
│  Serialize DBs → storage │
└─────────────────────────┘
```

### Auto-Save Strategy

- **Periodic flush**: Every 30 seconds, serialize both DBs to `chrome.storage.local`
- **Event flush**: After any ERROR-level entry, immediately flush `errors.db`
- **Unload flush**: On service worker `beforeunload` / `suspend`, flush both

---

## Persistence Layer

> **⚠️ SUPERSEDED**: The code below is retained for reference. See `19-opfs-persistence-strategy.md` for the canonical OPFS-first persistence implementation with debounced flushing and cold-start message buffering.
// db-manager.js — Background service worker

import initSqlJs from 'sql.js';

const DB_KEYS = {
  logs: 'sqlite_logs_db',
  errors: 'sqlite_errors_db'
};

let logsDb = null;
let errorsDb = null;
let SQL = null;

async function initDatabases() {
  SQL = await initSqlJs({
    locateFile: file => chrome.runtime.getURL(`wasm/${file}`)
  });

  // Load from storage or create fresh
  const stored = await chrome.storage.local.get([DB_KEYS.logs, DB_KEYS.errors]);

  if (stored[DB_KEYS.logs]) {
    logsDb = new SQL.Database(new Uint8Array(stored[DB_KEYS.logs]));
  } else {
    logsDb = new SQL.Database();
    logsDb.run(LOGS_SCHEMA_SQL);  // CREATE TABLE statements
  }

  if (stored[DB_KEYS.errors]) {
    errorsDb = new SQL.Database(new Uint8Array(stored[DB_KEYS.errors]));
  } else {
    errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA_SQL);
  }
}

async function flushToStorage() {
  const logsData = logsDb.export();
  const errorsData = errorsDb.export();
  await chrome.storage.local.set({
    [DB_KEYS.logs]: Array.from(logsData),
    [DB_KEYS.errors]: Array.from(errorsData)
  });
}

// Auto-flush every 30 seconds
setInterval(flushToStorage, 30000);
```

---

## Log Entry Format

Every log entry follows this structure for traceability:

```javascript
function log(level, source, category, action, detail, {metadata, durationMs, logType, indent, projectId, urlRuleId, scriptId, configId} = {}) {
  const extVersion = chrome.runtime.getManifest().version;
  const entry = {
    session_id: currentSessionId,
    timestamp: new Date().toISOString(),
    level,      // 'DEBUG' | 'INFO' | 'SUB' | 'STEP' | 'BANNER' | 'HIGHLIGHT' | 'WARN'
    source,     // 'combo' | 'macro-loop' | 'background' | 'popup' | 'user-script'
    category,   // 'API' | 'DOM' | 'CONFIG' | 'AUTH' | 'INJECTION' | 'UI' | 'LIFECYCLE' | 'CREDIT' | 'WORKSPACE' | 'MOVE' | 'PROJECT' | 'MATCHING'
    action,     // 'fetch_workspaces' | 'inject_combo' | 'token_refresh'
    log_type: logType || null,
    indent: indent || 0,
    detail,
    metadata: metadata ? JSON.stringify(metadata) : null,
    duration_ms: durationMs || null,
    // v0.2 context
    project_id: projectId || null,
    url_rule_id: urlRuleId || null,
    script_id: scriptId || null,
    config_id: configId || null,
    ext_version: extVersion
  };

  logsDb.run(
    `INSERT INTO logs (session_id, timestamp, level, source, category, action, log_type, indent, detail, metadata, duration_ms, project_id, url_rule_id, script_id, config_id, ext_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.session_id, entry.timestamp, entry.level, entry.source, entry.category,
     entry.action, entry.log_type, entry.indent, entry.detail, entry.metadata, entry.duration_ms,
     entry.project_id, entry.url_rule_id, entry.script_id, entry.config_id, entry.ext_version]
  );
}

// Convenience wrappers matching current controller signatures:
function logEntry(source, action, detail, opts)     { log('INFO', source, opts?.category || 'LIFECYCLE', action, detail, opts); }
function logSub(source, action, detail, indent, opts) { log('SUB', source, 'LIFECYCLE', action, detail, { indent: indent || 1, ...opts }); }
function logStep(source, action, step, detail, opts) { log('STEP', source, 'LIFECYCLE', action, 'Step ' + step + ': ' + detail, opts); }
function logBanner(source, action, detail, opts)     { log('BANNER', source, 'LIFECYCLE', action, detail, opts); }
function logHighlight(source, action, detail, opts)  { log('HIGHLIGHT', source, 'LIFECYCLE', action, detail, opts); }
function logWarn(source, action, detail, opts)        { log('WARN', source, opts?.category || 'LIFECYCLE', action, detail, opts); }
function logInfo(source, action, detail, opts)        { log('INFO', source, opts?.category || 'LIFECYCLE', action, detail, opts); }
```

### Example Log Entries

```
[2026-02-25T14:30:01.123Z] INFO  background  AUTH       token_read       Read session cookie, token starts with 'eyJ...' (REDACTED)
[2026-02-25T14:30:01.200Z] INFO  background  CONFIG     config_load      Loaded config v1.0.0 from chrome.storage.local
[2026-02-25T14:30:01.250Z] INFO  combo       LIFECYCLE  init_start       ComboSwitch controller initializing
[2026-02-25T14:30:01.300Z] INFO  combo       API        fetch_workspaces Fetched 5 workspaces in 148ms  {\\\"count\\\":5,\\\"active\\\":\\\"ws_abc\\\"}
[2026-02-25T14:30:01.310Z] INFO  combo       DOM        render_ui        Panel rendered with 5 workspace buttons
[2026-02-25T14:30:05.000Z] INFO  combo       UI         click_workspace  User clicked workspace 'Production' (ws_def456)
[2026-02-25T14:30:05.050Z] INFO  combo       API        move_project     Moving project prj_123 to workspace ws_def456
[2026-02-25T14:30:05.200Z] INFO  combo       API        move_complete    Project moved successfully in 150ms
```

---

## Level Mapping (Current Controllers → SQLite)

| Current Function | SQLite `level` | SQLite `indent` | SQLite `log_type` | Notes |
|-----------------|---------------|----------------|-------------------|-------|
| `logEntry(fn, msg)` | `INFO` | 0 | NULL | Primary action log |
| `logSub(fn, msg, indent)` | `SUB` | 1-4 | NULL | Hierarchical sub-detail |
| `logStep(fn, step, msg)` | `STEP` | 0 | NULL | Numbered step in sequence |
| `logBanner(fn, msg)` | `BANNER` | 0 | NULL | Section dividers (`=== ... ===`) |
| `logHighlight(fn, msg)` | `HIGHLIGHT` | 0 | NULL | Important state changes |
| `logInfo(fn, msg)` | `INFO` | 0 | NULL | Same as logEntry |
| `logWarn(fn, msg)` | `WARN` | 0 | NULL | Non-fatal warnings |
| `logError(fn, step, msg, xpath)` | `ERROR` | 0 | NULL | → Also inserts into `errors.db` |
| `log(msg, 'success')` | `INFO` | 0 | `success` | macro-loop green entries |
| `log(msg, 'check')` | `INFO` | 0 | `check` | macro-loop credit check entries |
| `log(msg, 'delegate')` | `INFO` | 0 | `delegate` | macro-loop delegated actions |
| `log(msg, 'skip')` | `INFO` | 0 | `skip` | macro-loop skipped cycles |
| `log(msg, 'error')` | `WARN` | 0 | `error` | macro-loop inline errors (also → `errors.db`) |

---

## Activity Log UI Feed

Both controllers render an in-panel activity log (`addActivityLog()` in macro-loop, colored entries in combo). In the Chrome extension, the content script UI queries logs from the background via messaging:

```javascript
// Content script — request recent logs for activity panel
function refreshActivityLog() {
  chrome.runtime.sendMessage({
    type: 'GET_RECENT_LOGS',
    source: 'macro-loop',  // or 'combo'
    limit: 100
  }, function(entries) {
    // entries = [{timestamp, level, log_type, indent, action, detail}, ...]
    renderActivityLogPanel(entries);
  });
}

// Background — handler
if (msg.type === 'GET_RECENT_LOGS') {
  const rows = logsDb.exec(
    `SELECT timestamp, level, log_type, indent, action, detail
     FROM logs WHERE session_id = ? AND source = ?
     ORDER BY id DESC LIMIT ?`,
    [currentSessionId, msg.source, msg.limit || 100]
  );
  sendResponse(rows[0]?.values.map(r => ({
    timestamp: r[0], level: r[1], logType: r[2],
    indent: r[3], action: r[4], detail: r[5]
  })) || []);
}
```

The `log_type` value drives CSS colors in the panel (matching current behavior: `success`→green, `error`→red, `warn`→yellow, `delegate`→blue, `check`→purple, `skip`→gray).

---

## Migration from localStorage Logs

Current controllers persist logs to `localStorage` with keys like `ahk_combo_logs_YYYY-MM-DD` and `ahk_loop_logs_YYYY-MM-DD`. On first extension run:

1. Check for existing `localStorage` log keys matching `ahk_*_logs_*` pattern
2. Import entries into `logs.db` under a special session `{ id: 'migration-TIMESTAMP', notes: 'Imported from localStorage' }`
3. Delete the `localStorage` keys after successful import
4. This is a one-time operation; subsequent runs skip if no keys found

---

## Export Capability

### Export as `.db` File

One-click export of raw SQLite databases for sharing/debugging:

```javascript
function exportDatabase(dbName) {
  const db = dbName === 'logs' ? logsDb : errorsDb;
  const data = db.export();
  const blob = new Blob([data], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: `${dbName}_${currentSessionId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.db`,
    saveAs: true
  });
}
```

### Export as JSON (for pasting into chat)

```javascript
function exportSessionAsJson(sessionId) {
  const logs = logsDb.exec(
    `SELECT timestamp, level, source, category, action, detail
     FROM logs WHERE session_id = ? ORDER BY timestamp`,
    [sessionId]
  );
  const errors = errorsDb.exec(
    `SELECT timestamp, level, error_code, message, context
     FROM errors WHERE session_id = ? ORDER BY timestamp`,
    [sessionId]
  );
  return JSON.stringify({ session: sessionId, logs, errors }, null, 2);
}
```

### Export as CSV

```javascript
function exportSessionAsCsv(sessionId) {
  const results = logsDb.exec(
    `SELECT timestamp, level, source, category, action, detail
     FROM logs WHERE session_id = ? ORDER BY timestamp`,
    [sessionId]
  );
  // Convert to CSV string
  const headers = 'timestamp,level,source,category,action,detail\n';
  const rows = results[0]?.values.map(r => r.map(v => `\"${v}\"`).join(',')).join('\n') || '';
  return headers + rows;
}
```

---

## Cleanup / Fresh Start

```javascript
// Wipe everything — fresh start
async function resetAllData() {
  logsDb.run('DELETE FROM api_calls');
  logsDb.run('DELETE FROM logs');
  logsDb.run('DELETE FROM sessions');
  errorsDb.run('DELETE FROM errors');
  await flushToStorage();
  // Start new session
  createNewSession();
}

// Wipe only old sessions (keep current)
async function pruneOldSessions(keepLast = 5) {
  const sessions = logsDb.exec(
    `SELECT id FROM sessions ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
    [keepLast]
  );
  if (sessions[0]) {
    const ids = sessions[0].values.map(r => `'${r[0]}'`).join(',');
    logsDb.run(`DELETE FROM api_calls WHERE session_id IN (${ids})`);
    logsDb.run(`DELETE FROM logs WHERE session_id IN (${ids})`);
    logsDb.run(`DELETE FROM sessions WHERE id IN (${ids})`);
    errorsDb.run(`DELETE FROM errors WHERE session_id IN (${ids})`);
  }
  await flushToStorage();
}
```

---

## Message Protocol (Content Script → Background)

Content scripts cannot access SQLite directly. All logging goes through messaging:

```javascript
// Content script side (v0.2 — with context)
function csLog(level, category, action, detail, {metadata, projectId, urlRuleId, scriptId, configId} = {}) {
  chrome.runtime.sendMessage({
    type: 'LOG',
    payload: { level, source: 'combo', category, action, detail, metadata,
               projectId, urlRuleId, scriptId, configId }
  });
}

function csError(errorCode, message, context, stackTrace, {projectId, urlRuleId, scriptId, configId, scriptFile, errorLine, errorColumn} = {}) {
  chrome.runtime.sendMessage({
    type: 'ERROR',
    payload: { source: 'combo', errorCode, message, context, stackTrace,
               projectId, urlRuleId, scriptId, configId, scriptFile, errorLine, errorColumn }
  });
}
```

```javascript
// Background side — message handler (v0.2)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOG') {
    const p = msg.payload;
    log(p.level, p.source, p.category, p.action, p.detail, {
      metadata: p.metadata, projectId: p.projectId, urlRuleId: p.urlRuleId,
      scriptId: p.scriptId, configId: p.configId
    });
  }
  if (msg.type === 'ERROR') {
    const p = msg.payload;
    logError(p.source, p.errorCode, p.message, p.context, p.stackTrace, {
      projectId: p.projectId, urlRuleId: p.urlRuleId,
      scriptId: p.scriptId, configId: p.configId,
      scriptFile: p.scriptFile, errorLine: p.errorLine, errorColumn: p.errorColumn
    });
  }
  if (msg.type === 'EXPORT_LOGS') {
    sendResponse(exportSessionAsJson(msg.sessionId || currentSessionId));
  }
  if (msg.type === 'EXPORT_ZIP') {
    exportSessionAsZip(msg.sessionId || currentSessionId).then(sendResponse);
    return true; // async
  }
  if (msg.type === 'RESET_DATA') {
    resetAllData().then(() => sendResponse({ ok: true }));
    return true;
  }
});
```

---

## Storage Budget

| Item | Size |
|------|------|
| sql.js WASM binary | ~1.2 MB |
| Empty logs.db | ~8 KB |
| Empty errors.db | ~4 KB |
| 1,000 log rows | ~200 KB |
| 10,000 log rows | ~2 MB |
| `chrome.storage.local` default limit | 10 MB |
| With `unlimitedStorage` permission | Unlimited |

**Recommendation**: Request `unlimitedStorage` in manifest and implement auto-prune when total exceeds 50 MB.

---

## Security

1. **Bearer tokens** — Always REDACTED in log `detail` and `metadata`. Only first 8 chars stored: `eyJhbGci...`
2. **Request bodies** — Truncated to 4 KB max in `api_calls.response_body`
3. **No PII in logs** — Workspace names and project IDs are OK; email addresses are never logged
4. **Export warning** — UI shows "This file contains API activity data" before download

---

## Updated Data Persistence Strategy

> **Decision (2026-02-25)**: SQLite via sql.js WASM replaces the previously planned IndexedDB + Dexie.js approach.

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Logging & Errors | SQLite (sql.js WASM) — `logs.db` + `errors.db` | Full SQL queries, exportable `.db` files |
| Settings & Config | `chrome.storage.local` | User config overrides, synced across sessions |
| Token Cache | `chrome.storage.session` | Transient bearer token (cleared on browser close) |
| DB Persistence | `chrome.storage.local` | Serialized SQLite byte arrays (auto-flush every 30s) |

Previous IndexedDB/Dexie.js plan is **superseded** by this spec.

---

## ZIP Export (v0.2)

### Format

File name: `marco-export-{sessionId8}-{YYYY-MM-DD}.zip`

Contents:

```
marco-export-a1b2c3d4-2026-02-28.zip
├── logs.db                  # SQLite database (full or session-filtered)
├── errors.db                # SQLite database (full or session-filtered)
├── config.json              # Current extension config snapshot
├── projects.json            # All projects with URL rules, script/config bindings
├── manifest.json            # Extension manifest (for version info)
└── metadata.json            # Export metadata (see schema below)
```

### `metadata.json` Schema

```json
{
  "exportVersion": "1.0",
  "extensionVersion": "1.1.0",
  "extensionBuild": 42,
  "exportedAt": "2026-02-28T14:30:00.000Z",
  "sessionId": "a1b2c3d4-...",
  "sessionStarted": "2026-02-28T12:00:00.000Z",
  "exportScope": "session",
  "stats": {
    "logEntries": 1247,
    "errorEntries": 3,
    "apiCalls": 89,
    "projectCount": 2,
    "scriptCount": 5,
    "configCount": 2
  },
  "storage": {
    "logsDbSize": 2100000,
    "errorsDbSize": 300000,
    "totalStorageUsed": 3200000
  },
  "environment": {
    "userAgent": "Mozilla/5.0 ...",
    "chromeVersion": "122.0.6261.112",
    "platform": "Win32"
  }
}
```

### Export Scopes

| Scope | Description | UI Trigger |
|-------|-------------|------------|
| `session` | Only logs/errors from a specific session | Options → Logging → session row → `[📤 Export]` |
| `all` | Full databases + all sessions | Options → Data → `[💾 Export All as ZIP]` or Popup → `[💾 Export ZIP]` |

### Implementation

> **⚠️ MANDATORY DEPENDENCY**: Use **JSZip v3.10+** (`npm install jszip`). It is already listed in `17-build-system.md` §package.json. JSZip works in service workers (no DOM dependency). Do NOT attempt native ZIP APIs — they don't exist in service workers.
>
> **Import**: `import JSZip from 'jszip';` — Vite bundles it into the background chunk.
>
> **Service Worker Compatibility Notes**:
> - `URL.createObjectURL()` is NOT available in service workers. Use `chrome.downloads.download({ url: dataUrl })` with a base64 data URL instead.
> - Alternative: Send the Blob to a popup/offscreen document that has access to `URL.createObjectURL()`.
> - The recommended pattern is to use an **offscreen document** (`chrome.offscreen.createDocument`) for the download trigger.

```javascript
import JSZip from 'jszip';  // v3.10+, ~100 KB bundled

async function exportSessionAsZip(sessionId, scope = 'session') {
  const zip = new JSZip();

  if (scope === 'session') {
    const filteredLogsDb = createFilteredDb(logsDb, sessionId);
    const filteredErrorsDb = createFilteredDb(errorsDb, sessionId);
    zip.file('logs.db', filteredLogsDb.export());
    zip.file('errors.db', filteredErrorsDb.export());
  } else {
    zip.file('logs.db', logsDb.export());
    zip.file('errors.db', errorsDb.export());
  }

  const stored = await chrome.storage.local.get(['marco_config', 'marco_projects']);
  zip.file('config.json', JSON.stringify(stored.marco_config || {}, null, 2));
  zip.file('projects.json', JSON.stringify(stored.marco_projects || [], null, 2));
  zip.file('manifest.json', JSON.stringify(chrome.runtime.getManifest(), null, 2));
  zip.file('metadata.json', JSON.stringify(buildExportMetadata(sessionId, scope), null, 2));

  // Generate as base64 — service workers can't use URL.createObjectURL
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const dataUrl = 'data:application/zip;base64,' + base64;
  const dateStr = new Date().toISOString().slice(0, 10);
  const sessionPrefix = sessionId ? sessionId.slice(0, 8) : 'all';

  chrome.downloads.download({
    url: dataUrl,
    filename: `marco-export-${sessionPrefix}-${dateStr}.zip`,
    saveAs: true
  });
}
```

---

## USER_SCRIPT_ERROR Handling (v0.2)

### Capture Flow

When a user-uploaded script is injected into a page, the extension wraps it with error-catching logic:

```
Extension prepares to inject user script
    │
    ▼
Inject error handler BEFORE user script:
  window.addEventListener('error', handler)
  window.addEventListener('unhandledrejection', handler)
    │
    ▼
Inject user script
    │
    ▼
If script throws:
    │
    ▼
Error handler captures:
  - error.message
  - error.filename → match against known script fileNames
  - error.lineno → error_line
  - error.colno → error_column
  - error.error.stack → full stack trace
    │
    ▼
Send to background via chrome.runtime.sendMessage:
  {
    type: 'ERROR',
    payload: {
      source: 'user-script',
      errorCode: 'USER_SCRIPT_ERROR',
      message: error.message,
      context: JSON.stringify({
        url: window.location.href,
        scriptId: '<known>',
        configId: '<known>',
        projectId: '<known>',
        urlRuleId: '<known>'
      }),
      stackTrace: error.error?.stack || '',
      scriptFile: '<original fileName>',
      errorLine: error.lineno,
      errorColumn: error.colno,
      projectId: '<known>',
      urlRuleId: '<known>',
      scriptId: '<known>',
      configId: '<known>'
    }
  }
    │
    ▼
Background logs to errors.db with full context
    │
    ▼
Error bar in popup shows: "⚠ Script 'custom.js' failed on line 42"
```

### Error Handler Injection Code

```javascript
// Injected before each user script in MAIN world
(function() {
  const __marcoScriptContext = {
    scriptId: '${scriptBinding.scriptId}',
    scriptFile: '${storedScript.fileName}',
    configId: '${scriptBinding.configId || ""}',
    projectId: '${project.id}',
    urlRuleId: '${urlRule.id}'
  };

  window.addEventListener('error', function(event) {
    // Only capture if the error comes from our injected script
    if (event.filename && event.filename.includes('chrome-extension://')) {
      try {
        chrome.runtime.sendMessage({
          type: 'ERROR',
          payload: {
            source: 'user-script',
            errorCode: 'USER_SCRIPT_ERROR',
            message: event.message,
            stackTrace: event.error ? event.error.stack : '',
            scriptFile: __marcoScriptContext.scriptFile,
            errorLine: event.lineno,
            errorColumn: event.colno,
            projectId: __marcoScriptContext.projectId,
            urlRuleId: __marcoScriptContext.urlRuleId,
            scriptId: __marcoScriptContext.scriptId,
            configId: __marcoScriptContext.configId,
            context: JSON.stringify({
              url: window.location.href,
              timestamp: new Date().toISOString()
            })
          }
        });
      } catch (e) {
        // Silently fail — don't crash the page over logging
      }
    }
  });

  window.addEventListener('unhandledrejection', function(event) {
    try {
      chrome.runtime.sendMessage({
        type: 'ERROR',
        payload: {
          source: 'user-script',
          errorCode: 'USER_SCRIPT_ERROR',
          message: 'Unhandled Promise rejection: ' + (event.reason?.message || String(event.reason)),
          stackTrace: event.reason?.stack || '',
          scriptFile: __marcoScriptContext.scriptFile,
          errorLine: null,
          errorColumn: null,
          projectId: __marcoScriptContext.projectId,
          urlRuleId: __marcoScriptContext.urlRuleId,
          scriptId: __marcoScriptContext.scriptId,
          configId: __marcoScriptContext.configId,
          context: JSON.stringify({
            url: window.location.href,
            timestamp: new Date().toISOString()
          })
        }
      });
    } catch (e) { /* silent */ }
  });
})();
```

### Isolation

- Each user script gets its **own** error handler injected before it
- The handler only captures errors from extension-injected scripts (checks `event.filename`)
- A failing user script does **NOT** prevent other scripts from running — each is injected independently
- Built-in scripts (combo.js, macro-looping.js) use their own existing error handling; the USER_SCRIPT_ERROR flow is only for user-uploaded scripts

---

## Schema Migration (v0.2)

When the extension upgrades from v0.1 schema to v0.2, the following migration runs:

```javascript
const SCHEMA_VERSION_KEY = 'marco_schema_version';

// ── Current schema version (increment when adding migrations) ──
const CURRENT_SCHEMA_VERSION = 2;

// ── Migration registry ──
// Each entry: { version: target version number, up: fn(logsDb, errorsDb), down: fn(logsDb, errorsDb) }
// Migrations are applied sequentially in order. `up` is required; `down` is best-effort for rollback.
const MIGRATIONS = [
  {
    version: 2,
    description: 'Add project/script/config context columns and new error codes',
    up(logsDb, errorsDb) {
      const logCols = [
        'ALTER TABLE logs ADD COLUMN project_id TEXT',
        'ALTER TABLE logs ADD COLUMN url_rule_id TEXT',
        'ALTER TABLE logs ADD COLUMN script_id TEXT',
        'ALTER TABLE logs ADD COLUMN config_id TEXT',
        'ALTER TABLE logs ADD COLUMN ext_version TEXT',
        'CREATE INDEX IF NOT EXISTS idx_logs_project ON logs(project_id)',
        'CREATE INDEX IF NOT EXISTS idx_logs_script ON logs(script_id)',
      ];
      const errCols = [
        'ALTER TABLE errors ADD COLUMN project_id TEXT',
        'ALTER TABLE errors ADD COLUMN url_rule_id TEXT',
        'ALTER TABLE errors ADD COLUMN script_id TEXT',
        'ALTER TABLE errors ADD COLUMN config_id TEXT',
        'ALTER TABLE errors ADD COLUMN script_file TEXT',
        'ALTER TABLE errors ADD COLUMN error_line INTEGER',
        'ALTER TABLE errors ADD COLUMN error_column INTEGER',
        'ALTER TABLE errors ADD COLUMN ext_version TEXT',
        'CREATE INDEX IF NOT EXISTS idx_errors_project ON errors(project_id)',
        'CREATE INDEX IF NOT EXISTS idx_errors_script ON errors(script_id)',
      ];
      const newCodes = [
        "INSERT OR IGNORE INTO error_codes VALUES ('USER_SCRIPT_ERROR','RECOVERABLE','User-uploaded script threw an error','Check script source and stack trace')",
        "INSERT OR IGNORE INTO error_codes VALUES ('USER_SCRIPT_TIMEOUT','WARNING','User-uploaded script exceeded execution time','Optimize script or increase timeout')",
        "INSERT OR IGNORE INTO error_codes VALUES ('CONFIG_INJECT_FAIL','RECOVERABLE','Failed to inject config into script','Check injection method and config validity')",
        "INSERT OR IGNORE INTO error_codes VALUES ('PROJECT_MATCH_FAIL','WARNING','URL matched rule but injection failed','Check conditions and script bindings')",
        "INSERT OR IGNORE INTO error_codes VALUES ('SCHEMA_MIGRATION','WARNING','Database schema migration applied','Normal on version upgrade')",
      ];
      for (const sql of logCols)  { try { logsDb.run(sql); }   catch (_) { /* already exists */ } }
      for (const sql of errCols)  { try { errorsDb.run(sql); } catch (_) { /* already exists */ } }
      for (const sql of newCodes) { try { errorsDb.run(sql); } catch (_) { /* already exists */ } }
    },
    down(logsDb, errorsDb) {
      // sql.js/SQLite doesn't support DROP COLUMN; rollback = recreate table.
      // For safety, down() is a no-op — data is preserved, new columns are simply ignored by older code.
      // A full rollback requires export → recreate → reimport (see rollback strategy below).
    },
  },
  // ── Future migration template ──
  // {
  //   version: 3,
  //   description: 'Example: add tags column',
  //   up(logsDb, errorsDb) { logsDb.run('ALTER TABLE logs ADD COLUMN tags TEXT'); },
  //   down(logsDb, errorsDb) { /* no-op or table rebuild */ },
  // },
];

// ── Migration runner ──
async function migrateSchema(logsDb, errorsDb) {
  const stored = await chrome.storage.local.get(SCHEMA_VERSION_KEY);
  const currentVersion = stored[SCHEMA_VERSION_KEY] || 1;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) return; // Already up to date

  // Filter to only pending migrations, sorted ascending
  const pending = MIGRATIONS
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const startTime = Date.now();
    try {
      migration.up(logsDb, errorsDb);

      // Persist version after each successful migration (crash-safe)
      await chrome.storage.local.set({ [SCHEMA_VERSION_KEY]: migration.version });

      log('INFO', 'background', 'LIFECYCLE', 'schema_migration',
        `Migration v${migration.version}: ${migration.description}`, {
          metadata: { fromVersion: migration.version - 1, toVersion: migration.version, durationMs: Date.now() - startTime }
        });
    } catch (error) {
      // Log the failure and STOP — do not skip migrations
      logError('background', 0, `Migration v${migration.version} failed: ${error.message}`);

      // Attempt rollback of this single migration
      try {
        migration.down(logsDb, errorsDb);
        logWarn('background', 'schema_rollback', `Rolled back migration v${migration.version}`);
      } catch (rollbackErr) {
        logError('background', 0, `Rollback of v${migration.version} also failed: ${rollbackErr.message}`);
      }

      // Break the chain — extension runs on last successful version
      break;
    }
  }
}
```

### Migration Runner Rules

1. **Sequential execution** — Migrations run in `version` order. Never skip a version.
2. **Crash-safe** — Schema version is persisted to `chrome.storage.local` after *each* successful migration, not after all. If the service worker terminates mid-batch, the next wake-up resumes from the last completed version.
3. **Fail-stop** — If any migration throws, the runner stops immediately and attempts `down()` for that migration only. Subsequent migrations are not attempted.
4. **Idempotent guards** — Use `IF NOT EXISTS` for indexes, `INSERT OR IGNORE` for seed data, and `try/catch` around `ALTER TABLE ADD COLUMN` (SQLite throws if column exists).
5. **No destructive rollback** — SQLite doesn't support `DROP COLUMN`. The `down()` function is best-effort. For a full rollback, use the export→recreate→reimport strategy below.

### Rollback Strategy

If a migration leaves the database in an unusable state:

```javascript
// Nuclear rollback: export data, recreate schema, reimport
function rollbackToVersion(db, targetVersion, schemaSQL) {
  // 1. Export all data as JSON
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const backup = {};
  for (const table of tables[0].values) {
    const name = table[0];
    if (name === 'sqlite_sequence') continue;
    backup[name] = db.exec(`SELECT * FROM ${name}`);
  }

  // 2. Close and recreate
  db.close();
  const freshDb = new SQL.Database();
  freshDb.run(schemaSQL); // Schema matching targetVersion

  // 3. Reimport rows (columns that don't exist in target schema are silently dropped)
  for (const [table, data] of Object.entries(backup)) {
    if (!data[0]) continue;
    const cols = data[0].columns;
    // Get columns that exist in the new schema
    const tableInfo = freshDb.exec(`PRAGMA table_info(${table})`);
    const validCols = new Set(tableInfo[0].values.map(r => r[1]));
    const keepIndices = cols.map((c, i) => validCols.has(c) ? i : -1).filter(i => i >= 0);
    const keepCols = keepIndices.map(i => cols[i]);

    for (const row of data[0].values) {
      const vals = keepIndices.map(i => row[i]);
      const placeholders = vals.map(() => '?').join(',');
      freshDb.run(`INSERT INTO ${table} (${keepCols.join(',')}) VALUES (${placeholders})`, vals);
    }
  }

  return freshDb;
}
```

### Adding Future Migrations

To add a new migration:
1. Increment `CURRENT_SCHEMA_VERSION`
2. Append a new entry to `MIGRATIONS` array with the next version number
3. Implement `up()` with idempotent SQL statements
4. Implement `down()` if feasible (no-op is acceptable for additive changes)
5. Test with both fresh install (runs full schema) and upgrade (runs only new migration)

Migration runs **once** during `initDatabases()`, after databases are loaded but before normal operation begins.

---

## New Categories (v0.2)

| Category | Description | Example Actions |
|----------|-------------|-----------------|
| `PROJECT` | Project lifecycle events | `project_create`, `project_delete`, `project_toggle`, `project_import`, `project_export` |
| `MATCHING` | URL rule matching decisions | `url_match_eval`, `rule_matched`, `rule_excluded`, `no_match`, `multi_match` |

These are added to the existing categories list: `API`, `DOM`, `CONFIG`, `AUTH`, `INJECTION`, `UI`, `LIFECYCLE`, `CREDIT`, `WORKSPACE`, `MOVE`.

---

## Acceptance Criteria (Phase 3)

- [x] `logs` table has `project_id`, `url_rule_id`, `script_id`, `config_id`, `ext_version` columns
- [x] `errors` table has context columns + `script_file`, `error_line`, `error_column`
- [x] `log()` function accepts and stores context fields
- [x] Content script messaging includes context fields
- [x] 5 new error codes defined (`USER_SCRIPT_ERROR`, `USER_SCRIPT_TIMEOUT`, `CONFIG_INJECT_FAIL`, `PROJECT_MATCH_FAIL`, `SCHEMA_MIGRATION`)
- [x] ZIP export format fully specified with `metadata.json` schema
- [x] USER_SCRIPT_ERROR capture flow documented with error handler injection code
- [x] Schema migration strategy documented with backward-compatible ALTER TABLE approach
- [x] 2 new log categories added (`PROJECT`, `MATCHING`)

---

## Background Error Pipeline & Exclusion Policy (v2.21.0)

All caught errors in `src/background/` **MUST** flow through `src/background/bg-logger.ts`:

1. **SQLite errors table** — via `handleLogError()` (fire-and-forget)
2. **OPFS session files** — `events.log` + `errors.log` (via the same handler)
3. **`console.error`** — LAST step, preserves full stack trace in DevTools

### Exclusion Policy

The following files retain bare `console.error` — **do NOT convert these**.

#### Category 1: Recursion-Sensitive (logging pipeline itself)

| File | Reason |
|------|--------|
| `bg-logger.ts` | The logger itself — `console.error` is step 3 |
| `session-log-writer.ts` | Writes to OPFS session files — called BY the logger |
| `handlers/logging-handler.ts` | `handleLogError()` — called BY the logger |
| `db-manager.ts` | SQLite init/flush — called during logging |
| `db-persistence.ts` | OPFS/storage persistence — called during logging |
| `schema-migration.ts` | Runs during DB init before logger is bound |

#### Category 2: Page-Context Serialized Code

`console.error` inside string templates or `executeScript({ func })` callbacks running in the page's MAIN world.

| File | Context |
|------|---------|
| `builtin-script-guard.ts` | Stub code string template |
| `manifest-seeder.ts` | Stub code string template |
| `handlers/injection-wrapper.ts` | Script wrapper string template |
| `project-namespace-builder.ts` | Namespace builder string template |
| `context-menu-handler.ts` | `executeScript({ func })` in tab |
| `injection-diagnostics.ts` | `executeScript({ func })` — mirrors logs to tab console |
| `handlers/injection-handler.ts` | `executeScript({ func })` — CSP warning in tab |

#### Category 3: Own Persistence Pipeline

Already persist via `persistInjectionError` / `persistInjectionWarn` before `console.error`.

| File | Pipeline |
|------|----------|
| `auto-injector.ts` | `persistInjectionError` / `persistInjectionWarn` |
| `spa-reinject.ts` | `persistInjectionWarn` / `persistInjectionError` |

### Audit Command

```bash
grep -rn "console\.error" src/background/ --include="*.ts" \
  | grep -v "bg-logger.ts" | grep -v "session-log-writer.ts" \
  | grep -v "logging-handler.ts" | grep -v "db-manager.ts" \
  | grep -v "db-persistence.ts" | grep -v "schema-migration.ts"
```

**Expected:** Only Category 2 and Category 3 files. Any other file is a violation.
