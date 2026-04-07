# Chrome Extension — AI Implementation Guide

**Version**: v1.0.0  
**Date**: 2026-02-28  
**Purpose**: Step-by-step build order for an AI (or developer) to implement the Chrome Extension from scratch. Follow the phases in order — each phase produces a testable milestone.

---

## Pre-Read: Spec Index

Before starting, scan these specs for context (read in full only when referenced by a step):

| Priority | Spec | What It Covers |
|----------|------|----------------|
| 🔴 Read first | `17-build-system.md` | Project structure, Vite config, manifest.json, package.json |
| 🔴 Read first | `18-message-protocol.md` | All message types, payloads, response shapes |
| 🔴 Read first | `19-opfs-persistence-strategy.md` | SQLite persistence tiers, cold-start buffer |
| 🟡 Read when referenced | `01-overview.md` | Architecture, permissions, what stays/changes from AHK |
| 🟡 Read when referenced | `04-cookie-and-auth.md` | Cookie reading, bearer token flow |
| 🟡 Read when referenced | `05-content-script-adaptation.md` | Programmatic injection model |
| 🟡 Read when referenced | `06-logging-architecture.md` | SQLite schema, tables, ZIP export |
| 🟡 Read when referenced | `12-project-model-and-url-rules.md` | Project/UrlRule/ScriptBinding interfaces, URL matching |
| 🟡 Read when referenced | `13-script-and-config-management.md` | Script upload, storage, folder watch |
| 🟡 Read when referenced | `20-user-script-error-isolation.md` | Try/catch wrapper for user scripts |
| 🟢 Read for UI | `10-popup-options-ui.md` | Popup wireframes, options wireframes, data browser |
| 🟢 Read for UI | `15-expanded-popup-options-ui.md` | Projects CRUD, URL rule editor, drag-drop |
| 🟢 Read for polish | `07-advanced-features.md` | Remote config, XPath recorder |
| 🟢 Read for polish | `08-version-management.md` | Versioning, changelog, git hooks |
| 🟢 Read for polish | `09-error-recovery.md` | Health state machine, recovery flows |
| 🔴 Read first | `23-coding-guidelines.md` | Naming, boolean logic, function size, formatting, file org |

> **⚠️ Note on code examples**: The inline code snippets in this guide were written before `23-coding-guidelines.md` was finalized. They may contain patterns that violate the guidelines (e.g., negation in `if` conditions, missing `is`/`has` boolean prefixes, inline compound logic). When implementing, **always conform to Spec 23** — treat the examples here as structural guidance, not copy-paste templates.

---

## Phase 1: Scaffold & Build (Milestone: extension loads in Chrome)

**Goal**: Create the project structure from `17-build-system.md` and get a blank extension loading.

### Step 1.1: Create project files

Create these files exactly as specified in `17-build-system.md`:

```
chrome-extension/
├── manifest.json          ← Copy from spec §manifest.json (Canonical)
├── vite.config.ts         ← Copy from spec §vite.config.ts
├── tsconfig.json          ← Copy from spec §tsconfig.json
├── package.json           ← Copy from spec §package.json (Extension)
├── src/
│   ├── background/
│   │   └── index.ts       ← Empty: console.log('Marco service worker started');
│   ├── popup/
│   │   ├── popup.html     ← Minimal HTML: <div id="app">Marco Extension</div>
│   │   ├── popup.ts       ← console.log('Popup loaded');
│   │   └── popup.css      ← Empty
│   ├── options/
│   │   ├── options.html   ← Minimal HTML: <div id="app">Options</div>
│   │   ├── options.ts     ← console.log('Options loaded');
│   │   └── options.css    ← Empty
│   ├── content-scripts/   ← Empty directory
│   ├── shared/
│   │   ├── types.ts       ← Empty (populated in Phase 2)
│   │   ├── messages.ts    ← Empty (populated in Phase 2)
│   │   ├── constants.ts   ← Empty
│   │   └── utils.ts       ← Empty
│   └── assets/
│       └── icons/
│           ├── icon-16.png   ← Placeholder 16x16 PNG
│           ├── icon-48.png   ← Placeholder 48x48 PNG
│           └── icon-128.png  ← Placeholder 128x128 PNG
```

### Step 1.2: Build and verify

```bash
cd chrome-extension
npm install
npm run build
```

**Verify**: `dist/` folder exists with compiled files. Load unpacked in `chrome://extensions` → extension icon appears, popup shows "Marco Extension", options page loads.

### Step 1.3: Test matrix

| Check | Expected |
|-------|----------|
| Extension loads without errors | ✅ |
| Popup opens on icon click | ✅ Shows "Marco Extension" |
| Options page opens (right-click → Options) | ✅ Shows "Options" |
| Service worker registered | ✅ Visible in chrome://extensions details |
| Console shows startup log | ✅ "Marco service worker started" |

---

## Phase 2: Shared Types & Message Protocol (Milestone: type-safe message passing works)

**Goal**: Implement the type system and message router so all future phases have infrastructure.

### Step 2.1: Implement `src/shared/types.ts`

Copy all TypeScript interfaces from `12-project-model-and-url-rules.md` §Data Model:
- `Project`
- `UrlRule`
- `ScriptBinding`
- `ConfigBinding` (only `'global' | 'message'` — no `'parameter'`)
- `InjectionConditions`

Also from `13-script-and-config-management.md`:
- `StoredScript`
- `StoredConfig`

Also from `09-error-recovery.md`:
- `HealthState` enum: `'healthy' | 'degraded' | 'error' | 'fatal'`

### Step 2.2: Implement `src/shared/messages.ts`

Copy the full `MessageType` enum and all request/response interfaces from `18-message-protocol.md`.

**Critical**: Include the `Message` base interface and all payload types. This is 30+ message types — copy them all.

### Step 2.3: Implement `src/shared/constants.ts`

```typescript
// Storage keys (from 12-project-model-and-url-rules.md §Storage)
export const STORAGE_KEYS = {
  PROJECTS: 'marco_projects',
  SCRIPTS: 'marco_scripts',
  CONFIGS: 'marco_configs',
  CONFIG: 'marco_config',
} as const;

// Limits
export const LIMITS = {
  MAX_SCRIPT_SIZE: 5 * 1024 * 1024,    // 5 MB
  MAX_CONFIG_SIZE: 1 * 1024 * 1024,     // 1 MB
  MAX_REGEX_LENGTH: 500,
  LOG_PAGE_SIZE: 50,
  KEEPALIVE_INTERVAL_MS: 29_000,        // 29s alarm (from 19-opfs-persistence-strategy.md)
} as const;
```

### Step 2.4: Implement `src/shared/utils.ts`

```typescript
export function generateId(): string {
  return crypto.randomUUID();
}

export async function sha256(content: string): Promise<string> {
  const buffer = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function nowISO(): string {
  return new Date().toISOString();
}
```

### Step 2.5: Implement background message router skeleton

In `src/background/message-router.ts`:

```typescript
import { MessageType } from '@/shared/messages';

const handlers: Record<string, (msg: any, sender: chrome.runtime.MessageSender) => any> = {};

export function registerHandler(type: MessageType, handler: (msg: any, sender: chrome.runtime.MessageSender) => any) {
  handlers[type] = handler;
}

export function initMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (!handler) {
      sendResponse({ error: `Unknown message type: ${message.type}` });
      return false;
    }
    const result = handler(message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true; // async
    }
    sendResponse(result);
    return false;
  });
}
```

Wire it in `src/background/index.ts`:

```typescript
import { initMessageRouter } from './message-router';
initMessageRouter();
console.log('Marco service worker started');
```

### Step 2.6: Verify

```bash
npm run typecheck    # Zero errors
npm run build        # Builds successfully
```

Load unpacked → no console errors. Send a test message from popup DevTools:
```javascript
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, console.log);
// → { error: "Unknown message type: GET_STATUS" } (expected — handler not registered yet)
```

---

## Phase 3: Persistence Layer (Milestone: SQLite DBs persist across SW restarts)

**Goal**: Implement OPFS-first SQLite persistence from `19-opfs-persistence-strategy.md`.

### Step 3.1: Install sql.js (already in package.json)

Verify `sql.js` is installed. Copy `sql-wasm.wasm` via the `vite-plugin-static-copy` config (already in `vite.config.ts`).

### Step 3.2: Implement `src/background/db-manager.ts`

Follow `19-opfs-persistence-strategy.md` exactly:

1. **Init function**: `initDatabases()` — loads WASM, tries OPFS first, falls back to `chrome.storage.local`, last resort in-memory
2. **Cold-start buffer**: Queue messages that arrive before `initDatabases()` resolves. Drain the buffer after init.
3. **Keepalive alarm**: `chrome.alarms.create('marco-keepalive', { periodInMinutes: 0.483 })` (29 seconds)
4. **Flush on idle**: Export DB bytes to OPFS on every write, or batched every 5s

**Schema**: Copy table definitions from `06-logging-architecture.md`:
- `sessions` table
- `logs` table  
- `errors` table

### Step 3.3: Wire into background

```typescript
// src/background/index.ts
import { initMessageRouter } from './message-router';
import { initDatabases, getLogsDb, getErrorsDb } from './db-manager';
import { registerHandler } from './message-router';
import { MessageType } from '@/shared/messages';

let ready = false;
const messageBuffer: Array<{ message: any; sender: any; sendResponse: any }> = [];

async function init() {
  initMessageRouter();
  await initDatabases();
  ready = true;
  
  // Drain buffered messages
  for (const { message, sender, sendResponse } of messageBuffer) {
    chrome.runtime.onMessage.dispatch(message, sender, sendResponse);
  }
  messageBuffer.length = 0;
  
  // Register keepalive alarm
  chrome.alarms.create('marco-keepalive', { periodInMinutes: 0.483 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'marco-keepalive') {
      // Touch DB to prevent idle termination
    }
  });
  
  console.log('Marco service worker ready');
}

init();
```

### Step 3.4: Register LOG_ENTRY and LOG_ERROR handlers

```typescript
registerHandler(MessageType.LOG_ENTRY, (msg) => {
  const db = getLogsDb();
  db.run('INSERT INTO logs (...) VALUES (...)', [...]);
  return { success: true };
});
```

### Step 3.5: Verify

1. Build and load extension
2. From popup DevTools: `chrome.runtime.sendMessage({ type: 'LOG_ENTRY', payload: { level: 'INFO', source: 'test', category: 'TEST', action: 'test_log', detail: 'Hello' } })`
3. Kill service worker (chrome://extensions → click "Terminate")
4. Send another message → service worker restarts, logs persist

---

## Phase 4: Cookie & Auth (Milestone: token auto-resolved from cookie)

**Goal**: Implement cookie reading from `04-cookie-and-auth.md`.

### Step 4.1: Implement `src/background/cookie-reader.ts`

```typescript
export async function readSessionCookie(): Promise<string | null> {
  const cookie = await chrome.cookies.get({
    url: 'https://lovable.dev',
    name: 'lovable-session-id.id'
  });
  return cookie?.value ?? null;
}
```

### Step 4.2: Register GET_TOKEN, REFRESH_TOKEN handlers

Wire into message router. See `05-content-script-adaptation.md` §2 and §6.

### Step 4.3: Verify

Navigate to `lovable.dev`, log in. From extension popup DevTools:
```javascript
chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, console.log);
// → should return the session token
```

---

## Phase 5: Project Model & URL Matching (Milestone: scripts inject on matching pages)

**Goal**: Implement project/URL rule matching from `12-project-model-and-url-rules.md`.

### Step 5.1: Implement `src/background/project-matcher.ts`

Follow `12-project-model-and-url-rules.md` §URL Matching Logic:

1. Load all enabled projects from `chrome.storage.local`
2. For each project, evaluate URL rules against the current tab URL
3. Match modes: `exact`, `prefix`, `regex`
4. Apply exclude patterns
5. Sort by priority
6. Dedup scripts via `Set<scriptId>`
7. **Regex validation**: Use `validateRegexPattern()` from `12-project-model-and-url-rules.md` §Regex Safety

### Step 5.2: Wire to `webNavigation.onCompleted`

```typescript
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // top frame only
  const matches = await evaluateUrl(details.url);
  for (const match of matches) {
    await injectScripts(details.tabId, match);
  }
});
```

### Step 5.3: Implement `src/content-scripts/error-wrapper.ts`

Copy `wrapUserScript()` function from `20-user-script-error-isolation.md` §Wrapper Template. This wraps every user script in a try/catch with context metadata.

### Step 5.4: Implement script injection

```typescript
async function injectScripts(tabId: number, match: MatchResult) {
  for (const binding of match.scripts) {
    const script = await getScript(binding.scriptId);
    const wrapped = wrapUserScript(script.content, {
      scriptId: binding.scriptId,
      scriptName: script.name,
      projectId: match.projectId,
      configId: binding.configId,
      urlRuleId: match.ruleId,
    });
    
    // If config injection method is 'global', inject config first
    if (match.config?.injectionMethod === 'global') {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (configData, varName) => { (window as any)[varName] = configData; },
        args: [configData, match.config.globalVariableName || '__marcoConfig'],
      });
    }
    
    await chrome.scripting.executeScript({
      target: { tabId },
      world: binding.world as 'ISOLATED' | 'MAIN',
      func: new Function(wrapped) as () => void,
    });
  }
}
```

### Step 5.5: Seed the default project

On first install, seed the "Lovable Automation" project from `12-project-model-and-url-rules.md` §Default Project (Bundled).

```typescript
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await seedDefaultProject();
  }
});
```

### Step 5.6: Verify

1. Build and load extension
2. Navigate to `https://lovable.dev/projects/any-project`
3. Check that default scripts are injected (check console for Marco logs)
4. Navigate to `https://google.com` → no injection

---

## Phase 6: Popup UI (Milestone: popup shows live status)

**Goal**: Build the popup from `10-popup-options-ui.md` and `15-expanded-popup-options-ui.md`.

### Step 6.1: Implement popup layout

Follow the wireframe in `15-expanded-popup-options-ui.md` §Updated Layout — Master Wireframe:

1. **Header**: Extension name + version
2. **Project selector**: Dropdown of all projects (GET_ALL_PROJECTS)
3. **Error bar**: Conditional, shows active errors
4. **Status cards**: Connection, Token, Config status
5. **Workspace section**: Current workspace + credits
6. **Scripts section**: Per-project injected scripts with status
7. **Footer**: Storage usage bar + settings link

### Step 6.2: Wire to background

```typescript
// popup.ts — on open
const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

const projectState = await chrome.runtime.sendMessage({
  type: 'GET_ACTIVE_PROJECT',
  tabId: activeTab.id,
  url: activeTab.url
});

const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
```

### Step 6.3: Styling

Apply the dark theme color tokens from `10-popup-options-ui.md` §Color Tokens. Fixed width 380px.

### Step 6.4: Verify

Click extension icon → popup displays project name, match status, script injection status.

---

## Phase 7: Options Page (Milestone: full settings editor)

**Goal**: Build the options page from `10-popup-options-ui.md` and `15-expanded-popup-options-ui.md`.

### Step 7.1: Implement sidebar navigation

Sections from `10-popup-options-ui.md`:
- General, Timing, XPaths, Auth, Logging, Remote Config, Data Management, About

Additional from `15-expanded-popup-options-ui.md`:
- Projects (with full CRUD), Scripts, Configs

### Step 7.2: Projects section (highest priority)

Follow `15-expanded-popup-options-ui.md`:
1. Project list view with cards
2. Project detail view (URL rules, default config, default scripts)
3. URL Rule inline editor (match mode, preview, conditions, script bindings)
4. Regex validation UX from `12-project-model-and-url-rules.md` §Regex Safety

### Step 7.3: Scripts section

Follow `13-script-and-config-management.md`:
1. Upload via drag-and-drop or file picker (primary method)
2. Optional: `showDirectoryPicker()` with feature detection (see R-10 resolution)
3. Script metadata badges (IIFE, chrome API, DOM usage)
4. Script list with edit/delete actions

### Step 7.4: Data Management section

Follow `10-popup-options-ui.md` §Data Management (includes G-16 DB visibility):
1. Storage overview with progress bar
2. Database table (rows, size, last write)
3. Paginated data browser
4. Export/Import buttons
5. Factory reset with "RESET" confirmation

### Step 7.5: Save/Reset bar

Sticky bottom bar, appears when any setting is modified. On save → validate → store via SAVE_CONFIG message.

### Step 7.6: Verify

Open options page. Create a project → add a URL rule → add a script binding → save. Navigate to matching URL → script injects.

---

## Phase 8: Logging & Export (Milestone: logs visible, ZIP export works)

**Goal**: Complete the logging UI and export system from `06-logging-architecture.md`.

### Step 8.1: Register all logging message handlers

- `GET_RECENT_LOGS` → paginated query with filter/sort
- `GET_LOG_STATS` → counts, sizes, last write
- `PURGE_LOGS` → delete by session or age
- `EXPORT_LOGS_JSON` → serialize and download
- `EXPORT_LOGS_ZIP` → JSZip bundle (see `06-logging-architecture.md` §ZIP Export)

### Step 8.2: JSZip integration

```typescript
import JSZip from 'jszip';
// Generate as base64 — service workers can't use URL.createObjectURL
const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
const dataUrl = 'data:application/zip;base64,' + base64;
chrome.downloads.download({ url: dataUrl, filename: '...', saveAs: true });
```

### Step 8.3: Verify

1. Trigger some actions (navigate, inject scripts)
2. Options → Data Management → Data Browser shows log entries
3. Click [Export All as ZIP] → downloads `.zip` with `logs.db`, `errors.db`, `config.json`, `metadata.json`

---

## Phase 9: Error Recovery & Health (Milestone: extension self-heals)

**Goal**: Implement the health state machine from `09-error-recovery.md`.

### Step 9.1: Implement state manager

In `src/background/state-manager.ts`, follow `09-error-recovery.md`:
- Health states: `healthy → degraded → error → fatal`
- State transitions based on error types
- Badge updates (green/yellow/orange/red)
- Rehydration from `chrome.storage.session`

### Step 9.2: Implement recovery flows

Key flows from `09-error-recovery.md`:
- Flow 1: Token expiry → auto-refresh from cookie
- Flow 5: Storage full → auto-prune old sessions
- Flow 8: Service worker termination → rehydrate state
- Flow 9: CSP blocks MAIN world → fallback to ISOLATED

### Step 9.3: Verify

Kill service worker → reloads → state rehydrated. Fill storage → auto-prune triggers.

---

## Phase 10: Advanced Features (Milestone: XPath recorder, remote config)

**Goal**: Implement Phase 2 features from `07-advanced-features.md`.

### Step 10.1: XPath Recorder

Follow `07-advanced-features.md` §Feature 3:
1. Toggle from popup or Ctrl+Shift+R
2. Hover highlight, click capture, XPath computation
3. Overlay UI at top of page
4. **Scope limitations** (R-12): NO iframes, shadow DOM, SVG — show tooltips for unsupported elements
5. Export as JSON

### Step 10.2: Remote Config

Follow `07-advanced-features.md` §Feature 1:
1. 3-tier cascade: Remote > Local overrides > Bundled defaults
2. Configurable endpoint, refresh interval, timeout
3. Secret token resolution in headers

### Step 10.3: Verify

Test XPath recorder on `lovable.dev/projects/...`. Test remote config with a mock endpoint.

---

## Phase 11: Onboarding & Polish (Milestone: first-run experience)

**Goal**: Implement onboarding flow from `15-expanded-popup-options-ui.md`.

### Step 11.1: First-run detection

```typescript
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await seedDefaultProject();
    await chrome.storage.local.set({ marco_first_run: true });
  }
});
```

### Step 11.2: Onboarding page

When `marco_first_run` is true, popup shows welcome page:
1. "Welcome to Marco Extension"
2. Default project explanation
3. [Get Started] button → sets `marco_first_run = false`

### Step 11.3: Optional permissions UX

When saving URL rules for non-Lovable domains:
1. Live preview shows "⚠ Permission needed"
2. On [Save Changes] click → `chrome.permissions.request()` (user gesture)
3. Denied → save with ⚠ icon + [Grant] button

See `01-overview.md` §Optional Permission Flow (R-14 Resolution).

---

## Phase 12: Testing (Milestone: test suite passes)

**Goal**: Implement tests from `11-testing-strategy.md`.

### Step 12.1: Unit tests (~100 tests)

Priority targets:
- `project-matcher.ts` — URL matching logic (exact, prefix, regex)
- `error-wrapper.ts` — script wrapping
- `validateRegexPattern()` — regex safety
- `sha256()` — hash computation
- Message type serialization

### Step 12.2: Integration tests (~42 tests)

- Background ↔ popup message round-trips
- Cookie reading + token management
- Project CRUD via messages
- Script injection on matching URLs

### Step 12.3: E2E flows (Playwright)

Use `tests/e2e/fixtures.ts` (already scaffolded) with `--load-extension` flag.
Follow the 20 E2E flows from `11-testing-strategy.md`.

---

## Dependency Graph

```
Phase 1: Scaffold ─────────────────────────┐
    │                                       │
    ▼                                       │
Phase 2: Types & Messages ─────────────────┤
    │                                       │
    ├──────────────┐                        │
    ▼              ▼                        │
Phase 3:       Phase 4:                     │
Persistence    Cookie/Auth                  │
    │              │                        │
    └──────┬───────┘                        │
           ▼                                │
    Phase 5: Project Matching ──────────────┤
           │                                │
    ┌──────┼──────┐                         │
    ▼      ▼      ▼                         │
Phase 6: Phase 7: Phase 8:                  │
Popup    Options  Logging                   │
    │      │      │                         │
    └──────┼──────┘                         │
           ▼                                │
    Phase 9: Error Recovery ────────────────┤
           │                                │
           ▼                                │
    Phase 10: Advanced Features ────────────┤
           │                                │
           ▼                                │
    Phase 11: Onboarding ───────────────────┤
           │                                │
           ▼                                │
    Phase 12: Testing ──────────────────────┘
```

Phases 3 & 4 can run in parallel. Phases 6, 7, & 8 can run in parallel.

---

## Critical Pitfalls to Avoid

| # | Pitfall | Prevention |
|---|---------|-----------|
| 1 | Using `content_scripts` in manifest.json | **NO static content scripts.** All injection is programmatic via `chrome.scripting.executeScript`. See `05-content-script-adaptation.md` v0.2. |
| 2 | Using `URL.createObjectURL()` in service worker | **Not available in SW.** Use base64 data URLs for downloads. See `06-logging-architecture.md` §ZIP Export. |
| 3 | Config injection Method 3 (parameter wrapping) | **REMOVED.** Only Method 1 (global) and Method 2 (message) exist. See `20-user-script-error-isolation.md`. |
| 4 | `showDirectoryPicker()` as primary file input | **File upload is primary.** Directory picker is optional enhancement with feature detection. See `13-script-and-config-management.md`. |
| 5 | Calling `chrome.permissions.request()` without user gesture | **Must be in click handler.** See `01-overview.md` §Optional Permission Flow. |
| 6 | SQLite flush every 30s via setInterval | **Use OPFS-first.** Flush on write or batched 5s. See `19-opfs-persistence-strategy.md`. |
| 7 | Ignoring service worker cold-start | **Buffer messages** until `initDatabases()` resolves. See `19-opfs-persistence-strategy.md` §Cold-Start Buffer. |
| 8 | XPath recorder supporting iframes/shadow DOM | **Out of scope.** Skip with tooltips. See `07-advanced-features.md` §Scope Limitations. |
| 9 | Unbounded regex execution | **Validate with `validateRegexPattern()`.** 500-char limit + 100ms timeout. See `12-project-model-and-url-rules.md`. |
| 10 | Using `Map` for tab injection tracking | **Use plain `Record<number, ...>`.** Maps don't serialize to JSON. See `19-opfs-persistence-strategy.md`. |

---

## Definition of Done

The extension is complete when:

- [ ] Loads in Chrome without errors
- [ ] Default "Lovable Automation" project auto-injects scripts on `lovable.dev/projects/*`
- [ ] Popup shows project, match status, script status, workspace, credits
- [ ] Options page has full Projects CRUD with URL rule editor
- [ ] Scripts can be uploaded via drag-and-drop
- [ ] Logs persist across service worker restarts
- [ ] ZIP export downloads complete diagnostic bundle
- [ ] XPath recorder captures click targets with hover highlight
- [ ] Error recovery: token auto-refresh, storage auto-prune, SW rehydration
- [ ] First-run onboarding flow works
- [ ] `npm run typecheck` produces zero errors
- [ ] Unit tests pass

---

*AI Implementation Guide v1.0.0 — 2026-02-28*
