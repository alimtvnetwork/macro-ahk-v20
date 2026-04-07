# Chrome Extension — OPFS Persistence Strategy

**Version**: v1.0.0  
**Date**: 2026-02-28  
**Fixes**: Risk R-01 (SQLite/WASM in MV3 Service Worker)  
**Replaces**: Persistence Layer section in `06-logging-architecture.md`

---

## Purpose

Define a production-grade persistence strategy for SQLite databases in a Manifest V3 service worker. The previous approach (serialize entire DB to `chrome.storage.local` every 30s) has critical flaws:

1. **Service worker terminates after ~30s of inactivity** — the 30s flush interval may never fire
2. **Serializing 1-10 MB databases** on every flush is a performance bottleneck
3. **WASM cold-start** takes 200-500ms — messages arriving during this window are lost
4. **No message buffering** for the initialization gap

This spec defines the correct architecture: **OPFS-first with chrome.storage.local fallback**.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Service Worker (Background)                              │
│                                                           │
│  ┌─────────────┐     ┌──────────────────────────┐        │
│  │ sql.js WASM │ ──→ │ SQLite DB (in-memory)     │        │
│  └─────────────┘     └──────────┬───────────────┘        │
│                                 │                         │
│                    ┌────────────┼────────────┐            │
│                    │            │            │            │
│                    ▼            ▼            ▼            │
│              ┌──────────┐ ┌─────────┐ ┌──────────────┐   │
│              │ OPFS     │ │ Flush   │ │ Fallback     │   │
│              │ (primary)│ │ on idle │ │ storage.local│   │
│              └──────────┘ └─────────┘ └──────────────┘   │
│                                                           │
│  Message Buffer (pre-init queue)                          │
│  ┌─────────────────────────────┐                          │
│  │ [msg1, msg2, msg3, ...]     │ ← drained after init    │
│  └─────────────────────────────┘                          │
└──────────────────────────────────────────────────────────┘
```

---

## Tier 1: OPFS (Origin Private File System) — Primary

### Why OPFS

- **Persistent**: Survives service worker termination, browser restart
- **No serialization overhead**: SQLite reads/writes directly to files
- **Supported in MV3**: Available in service workers via `navigator.storage.getDirectory()`
- **Performance**: No need to export/import entire DB on every flush

### Implementation

```typescript
// src/background/db-manager.ts

import initSqlJs, { Database } from 'sql.js';

const DB_NAMES = {
  logs: 'marco-logs.db',
  errors: 'marco-errors.db',
} as const;

let logsDb: Database | null = null;
let errorsDb: Database | null = null;
let SQL: any = null;
let persistenceMode: 'opfs' | 'storage' | 'memory' = 'memory';

async function initDatabases(): Promise<void> {
  // Step 1: Load WASM
  SQL = await initSqlJs({
    locateFile: (file: string) => chrome.runtime.getURL(`wasm/${file}`),
  });

  // Step 2: Try OPFS first
  try {
    const opfsRoot = await navigator.storage.getDirectory();

    logsDb = await loadOrCreateDb(opfsRoot, DB_NAMES.logs, LOGS_SCHEMA_SQL);
    errorsDb = await loadOrCreateDb(opfsRoot, DB_NAMES.errors, ERRORS_SCHEMA_SQL);
    persistenceMode = 'opfs';

    console.log('[db-manager] OPFS persistence active');
    return;
  } catch (opfsErr) {
    console.warn('[db-manager] OPFS unavailable, falling back to storage.local:', opfsErr);
  }

  // Step 3: Fallback to chrome.storage.local
  try {
    logsDb = await loadFromStorage(DB_NAMES.logs, LOGS_SCHEMA_SQL);
    errorsDb = await loadFromStorage(DB_NAMES.errors, ERRORS_SCHEMA_SQL);
    persistenceMode = 'storage';

    console.log('[db-manager] storage.local persistence active');
    return;
  } catch (storageErr) {
    console.warn('[db-manager] storage.local failed, using in-memory only:', storageErr);
  }

  // Step 4: In-memory only (last resort)
  logsDb = new SQL.Database();
  logsDb.run(LOGS_SCHEMA_SQL);
  errorsDb = new SQL.Database();
  errorsDb.run(ERRORS_SCHEMA_SQL);
  persistenceMode = 'memory';
}
```

### OPFS Read/Write

```typescript
async function loadOrCreateDb(
  root: FileSystemDirectoryHandle,
  name: string,
  schema: string
): Promise<Database> {
  try {
    const fileHandle = await root.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();

    if (buffer.byteLength > 0) {
      return new SQL.Database(new Uint8Array(buffer));
    }
  } catch {
    // File doesn't exist yet — create fresh
  }

  const db = new SQL.Database();
  db.run(schema);
  await saveToOpfs(root, name, db);
  return db;
}

async function saveToOpfs(
  root: FileSystemDirectoryHandle,
  name: string,
  db: Database
): Promise<void> {
  const fileHandle = await root.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  const data = db.export();
  await writable.write(data);
  await writable.close();
}
```

### Flush Strategy (OPFS Mode)

Instead of a blind 30s interval, flush on meaningful events:

```typescript
const FLUSH_DEBOUNCE_MS = 5000;  // 5 seconds after last write
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function markDirty(): void {
  dirty = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushIfDirty, FLUSH_DEBOUNCE_MS);
}

async function flushIfDirty(): Promise<void> {
  if (!dirty) return;
  dirty = false;

  if (persistenceMode === 'opfs') {
    const root = await navigator.storage.getDirectory();
    await saveToOpfs(root, DB_NAMES.logs, logsDb!);
    await saveToOpfs(root, DB_NAMES.errors, errorsDb!);
  } else if (persistenceMode === 'storage') {
    await flushToStorage();
  }
  // 'memory' mode: nothing to flush
}

// Also flush on these events:
// 1. After any ERROR-level log entry
// 2. Before service worker becomes idle
// 3. On chrome.runtime.onSuspend (if available)
```

---

## Tier 2: chrome.storage.local — Fallback

Used only when OPFS is unavailable (older Chrome versions, restricted environments).

```typescript
const STORAGE_KEYS = {
  logs: 'sqlite_logs_db',
  errors: 'sqlite_errors_db',
} as const;

async function loadFromStorage(name: string, schema: string): Promise<Database> {
  const key = name === DB_NAMES.logs ? STORAGE_KEYS.logs : STORAGE_KEYS.errors;
  const stored = await chrome.storage.local.get(key);

  if (stored[key]) {
    return new SQL.Database(new Uint8Array(stored[key]));
  }

  const db = new SQL.Database();
  db.run(schema);
  return db;
}

async function flushToStorage(): Promise<void> {
  const logsData = Array.from(logsDb!.export());
  const errorsData = Array.from(errorsDb!.export());

  await chrome.storage.local.set({
    [STORAGE_KEYS.logs]: logsData,
    [STORAGE_KEYS.errors]: errorsData,
  });
}
```

---

## Tier 3: In-Memory Only — Last Resort

If both OPFS and chrome.storage.local fail, databases exist only in memory. Logs are lost on service worker termination. The extension still functions for all other features.

Additionally, the JSON-based fallback logger from `09-error-recovery.md` Flow 1 activates:

```typescript
// When persistenceMode === 'memory', also write to JSON fallback
if (persistenceMode === 'memory') {
  fallbackLog(level, source, action, detail);
}
```

---

## Service Worker Lifecycle Integration

### Cold Start (Wake-Up)

```
Service Worker wakes (alarm, message, navigation event)
    │
    ▼
1. Message buffer starts collecting incoming messages
    │
    ▼
2. initDatabases() — WASM load + OPFS/storage/memory init
    │  (200-500ms typical)
    │
    ▼
3. rehydrateState() — restore transient state from chrome.storage.session
    │  (see State Rehydration section below)
    │
    ▼
4. initialized = true
    │
    ▼
5. Drain message buffer — process all queued messages in order
    │
    ▼
6. Start keepalive alarm (29-second interval)
```

### Idle Shutdown

```
Chrome decides to terminate service worker
    │
    ▼
1. flushIfDirty() — save any pending DB changes
    │
    ▼
2. saveTransientState() — persist tabInjections, activeProjectId, healthState
    │  to chrome.storage.session
    │
    ▼
3. Service worker terminates
```

### Keepalive Alarm

```typescript
// Prevent termination during active user sessions
const KEEPALIVE_ALARM = 'marco-keepalive';

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.48 }); // ~29 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Touching the alarm handler keeps the worker alive
    // Also a good time to flush if dirty
    flushIfDirty();
  }
});
```

---

## State Rehydration Protocol

### What Gets Saved (Transient State)

These values live in `chrome.storage.session` (survives SW termination, lost on browser restart):

```typescript
interface TransientState {
  activeProjectId: string | null;          // Currently selected project
  tabInjections: Record<number, {          // Per-tab injection tracking
    scriptIds: string[];                   // Scripts injected in this tab
    timestamp: string;                     // When injection happened
    projectId: string;                     // Which project triggered it
    matchedRuleId: string;                 // Which URL rule matched
  }>;
  healthState: 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'FATAL';
  currentSessionId: string;               // SQLite session ID
  persistenceMode: 'opfs' | 'storage' | 'memory';
  lastFlushTimestamp: string;             // ISO 8601
}
```

**Note**: `tabInjections` is a plain `Record<number, ...>` (not a `Map`), so it serializes directly with `JSON.stringify`.

### Save Triggers

| Event | What Gets Saved |
|-------|----------------|
| Project switched | `activeProjectId` |
| Script injected | `tabInjections` |
| Tab closed | `tabInjections` (entry removed) |
| Health state changes | `healthState` |
| DB flush completes | `lastFlushTimestamp` |
| Every 29s (alarm) | Everything (full snapshot) |

### Restore on Wake

```typescript
async function rehydrateState(): Promise<void> {
  const stored = await chrome.storage.session.get('marco_transient_state');
  const state: TransientState = stored.marco_transient_state || getDefaultState();

  activeProjectId = state.activeProjectId;
  tabInjections = state.tabInjections;
  healthState = state.healthState;
  currentSessionId = state.currentSessionId;

  // Validate tab IDs still exist (tabs may have closed while SW was down)
  const tabs = await chrome.tabs.query({});
  const validTabIds = new Set(tabs.map(t => t.id));

  for (const tabId of Object.keys(tabInjections)) {
    if (!validTabIds.has(Number(tabId))) {
      delete tabInjections[Number(tabId)];
    }
  }
}

async function saveTransientState(): Promise<void> {
  const state: TransientState = {
    activeProjectId,
    tabInjections,
    healthState,
    currentSessionId,
    persistenceMode,
    lastFlushTimestamp: new Date().toISOString(),
  };
  await chrome.storage.session.set({ marco_transient_state: state });
}
```

---

## Update to 06-logging-architecture.md

The following sections in `06-logging-architecture.md` are **superseded** by this document:

| Section | Status |
|---------|--------|
| §Persistence Layer (lines 218-268) | **Replaced** by this spec's Tier 1/2/3 system |
| `setInterval(flushToStorage, 30000)` | **Replaced** by debounced flush + alarm-based flush |
| `flushToStorage()` | **Replaced** by `flushIfDirty()` with OPFS-first |

All other sections in `06-logging-architecture.md` (schema, log format, level mapping, session lifecycle, auto-save events, pruning) remain valid and unchanged.

---

## Compatibility Matrix

| Chrome Version | OPFS in SW | Fallback |
|---------------|-----------|----------|
| 102+ | ✅ | — |
| 99-101 | ❌ | chrome.storage.local |
| <99 | ❌ | chrome.storage.local or memory |

The extension's minimum Chrome version is **102** (Manifest V3 stable). OPFS should work for all target users.

---

*OPFS persistence strategy v1.0.0 — 2026-02-28*
