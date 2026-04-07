# Chrome Extension — macro-looping.js Complete Reference

**Version**: v1.4.0 (v7.25 token fallback + session probe)  
**Date**: 2026-03-18
**Purpose**: Definitive implementation guide for `macro-looping.js` so any AI or developer can recreate the script with zero ambiguity.

---

## 1. Overview

`macro-looping.js` is a ~5000-line self-contained JavaScript file injected into `lovable.dev` tabs by the Marco Chrome Extension. It provides:

- **Credit monitoring** — fetches workspace credit data from the Lovable API
- **Workspace switching** — auto-rotates between workspaces when daily credits deplete
- **Visual UI panel** — floating draggable panel with progress bars, workspace list, controls
- **CSV export** — exports all workspace credit data
- **Diagnostic tools** — auth diagnostics, log viewer, clipboard export

---

## 2. Authentication — Session Bridge

### Problem
`document.cookie` cannot read HttpOnly cookies (`lovable-session-id`), causing `401 Authorization header required` errors.

### Solution: Session Bridge
The Chrome Extension background script reads the cookie via `chrome.cookies.get()` and seeds it into the page's `localStorage`.

### Token Resolution Chain (`resolveToken()`)

```
Priority 1: localStorage['marco_bearer_token']     ← seeded by extension background
Priority 2: localStorage['lovable-session-id']      ← seeded by extension background  
Priority 3: document.cookie['lovable-session-id.id'] ← fallback (may fail if HttpOnly)
```

### Auth Diagnostic Row (`#loop-auth-diag`)

Displays in the UI panel:
- 🟢 **Token source**: Shows which resolution step succeeded (`localStorage`, `cookie`, `none`)
- Token preview: First 20 chars of the resolved token
- Refresh status: Whether a refresh token is also available

### API Call Pattern

```javascript
// All API calls use this header
headers: {
  'Authorization': 'Bearer ' + resolvedToken,
  'Content-Type': 'application/json'
}
```

**Endpoint**: `https://api.lovable.dev/api/workspace-credits`

### Token Fallback Retry (v7.25)

When `fetchLoopCredits()` or `fetchLoopCreditsAsync()` receives a **401 or 403** response, the following automatic retry logic executes:

1. **Mark expired**: Calls `markBearerTokenExpired('loop')` for logging.
2. **Invalidate current token**: `invalidateSessionBridgeKey(token)` finds the `localStorage` key that held the failing token and **removes it**, so `resolveToken()` will skip it on the next call.
3. **Retry once**: Calls itself with `isRetry=true`, which causes `resolveToken()` to fall through to the next token source in the priority chain.
4. **Second failure**: If the retry also gets 401/403, logs the error and stops — no infinite loop.

```
Attempt 1: Bearer token from localStorage['marco_bearer_token'] → 401
  → remove localStorage['marco_bearer_token']
Attempt 2: Bearer token from localStorage['lovable-session-id'] → success ✅
```

#### `invalidateSessionBridgeKey(token)`

```javascript
function invalidateSessionBridgeKey(token) {
  // Iterates SESSION_BRIDGE_KEYS, finds the key storing the exact failing token,
  // removes it from localStorage, returns the key name (or '' if not found).
}
```

**Rules**:
- Only retries on **401/403** — other HTTP errors fail immediately.
- Only retries if a **bearer token was used** — cookies-only requests don't retry.
- The `isRetry` flag prevents recursive retries beyond one level.
- Both `fetchLoopCredits()` (fire-and-forget) and `fetchLoopCreditsAsync()` (promise-returning) implement identical logic.
- A **warning toast** is shown to the user on each fallback: `"Auth {status} — token "{key}" expired, retrying..."`

### v7.25: Token Fallback Coverage — All API Functions

The v7.25 token fallback retry pattern is applied to **all** API-calling functions:

| Function | Endpoint | Method | Fallback Behavior |
|----------|----------|--------|-------------------|
| `fetchLoopCredits()` | `/api/workspace-credits` | GET | `invalidateSessionBridgeKey` → `resolveToken()` → retry |
| `fetchLoopCreditsAsync()` | `/api/workspace-credits` | GET | Same as above (promise-returning) |
| `doMove()` (inside `moveToWorkspace`) | `/api/projects/{id}/move-to-workspace` | PUT | `invalidateSessionBridgeKey` → `resolveToken()` → retry |
| `doRename()` (inside `renameWorkspace`) | `/api/user/workspaces/{id}` | PUT | `invalidateSessionBridgeKey` → `resolveToken()` → retry |
| `doFetchWorkspaces()` (inside `moveToAdjacentWorkspace`) | `/api/user/workspaces` | GET | `invalidateSessionBridgeKey` → `resolveToken()` → retry |

**Key difference from pre-v7.25**: Previously, `doMove` and `doRename` called `markBearerTokenExpired()` and retried with `null` (cookies-only). Now they use `invalidateSessionBridgeKey(token)` to remove the specific failing key, then call `resolveToken()` to get the **next available token source** before retrying — only falling to cookies-only if all token sources are exhausted.

`moveToAdjacentWorkspace` previously had **zero** 401/403 handling — it would throw a generic error and fall back to cached data without any retry.

### v7.25: Post-Failure Session Probe — `verifyWorkspaceSessionAfterFailure(context)`

When `doMove()` or `doRename()` fails (HTTP error or network error), after logging the failure, it automatically calls `verifyWorkspaceSessionAfterFailure('move')` or `verifyWorkspaceSessionAfterFailure('rename')` to diagnose whether the failure was operation-specific or a broader session problem.

```javascript
function verifyWorkspaceSessionAfterFailure(context) {
  // 1. Resolves current token via resolveToken()
  // 2. Probes GET /api/user/workspaces with that token
  // 3. On success: logs "✅ Session valid — N workspaces loaded"
  //    → showToast("{context} failed but session is valid (N workspaces)")
  // 4. On failure: logs "❌ Session probe failed: HTTP {status}"
  //    → showToast("{context} failed — session also broken. Re-auth needed.")
  // 5. On network error: logs and toasts network error
}
```

**Behavior matrix**:

| Move Result | Session Probe Result | Toast Message | Diagnosis |
|-------------|---------------------|---------------|-----------|
| HTTP 500 | ✅ 200 OK (12 ws) | "move failed but session is valid (12 workspaces)" | Server-side move error, auth is fine |
| Network error | ✅ 200 OK (12 ws) | "move failed but session is valid (12 workspaces)" | Transient network issue |
| HTTP 403 (after retry) | ❌ HTTP 401 | "move failed — session also broken. Re-auth needed." | Full auth expiry |
| HTTP 404 | ✅ 200 OK (12 ws) | "move failed but session is valid (12 workspaces)" | Invalid project/workspace ID |

---

## 3. Credit Calculation Formulas

### Shared Helper Functions (Engineering Standard #14 — No Inline Arithmetic)

```javascript
function calcTotalCredits(freeGranted, dailyLimit, billingLimit, topupLimit, rolloverLimit) {
  return Math.round((freeGranted || 0) + (dailyLimit || 0) + (billingLimit || 0) 
         + (topupLimit || 0) + (rolloverLimit || 0));
}

function calcAvailableCredits(totalCredits, rolloverUsed, dailyUsed, billingUsed, freeUsed) {
  return Math.max(0, Math.round(totalCredits - (rolloverUsed || 0) - (dailyUsed || 0) 
         - (billingUsed || 0) - (freeUsed || 0)));
}

function calcFreeCreditAvailable(dailyLimit, dailyUsed) {
  return Math.max(0, Math.round((dailyLimit || 0) - (dailyUsed || 0)));
}
```

### Per-Workspace Derived Values

| Field | Formula |
|-------|---------|
| `dailyFree` | `max(0, round(daily_credits_limit - daily_credits_used))` |
| `rollover` | `max(0, round(rollover_credits_limit - rollover_credits_used))` |
| `billingAvailable` | `max(0, round(billing_period_credits_limit - billing_period_credits_used))` |
| `freeRemaining` | `max(0, round(credits_granted - credits_used))` |
| `totalCredits` | `calcTotalCredits(freeGranted, dailyLimit, billingLimit, topupLimit, rolloverLimit)` |
| `available` | `calcAvailableCredits(totalCredits, rolloverUsed, dailyUsed, billingUsed, freeUsed)` |

---

## 4. Progress Bar — Visual Specification

### Shared Renderer: `renderCreditBar(opts)`

Single source of truth for all 3 rendering sites. Eliminates duplication.

### Parameters

```javascript
renderCreditBar({
  totalCredits,    // Total credit capacity
  available,       // Available credits remaining
  totalUsed,       // Total credits consumed
  freeRemaining,   // 🎁 Bonus credits remaining
  billingAvail,    // 💰 Monthly credits remaining
  rollover,        // 🔄 Rollover credits remaining
  dailyFree,       // 📅 Daily free credits remaining
  compact,         // boolean — compact (14px) vs full (18px) mode
  marginTop,       // optional CSS margin-top value
  maxTotalCredits  // optional — highest totalCredits across all visible workspaces (v7.23)
})
```

### Segment Order (left → right, MUST be this order)

| Position | Pool | Emoji | Color Gradient | Label Color | Tooltip |
|----------|------|-------|---------------|-------------|---------|
| 1st | Bonus (Granted) | 🎁 | `#7c3aed` → `#a78bfa` (purple) | `#a78bfa` | Promotional one-time credits |
| 2nd | Monthly (Billing) | 💰 | `#22c55e` → `#4ade80` (green) | `#4ade80` | Credits from subscription plan |
| 3rd | Rollover | 🔄 | `#6b7280` → `#9ca3af` (gray) | `#9ca3af` | Unused credits carried from previous period |
| 4th | Free (Daily) | 📅 | `#d97706` → `#facc15` (yellow) | `#facc15` | Daily free credits (refreshed daily) |

### Segment Width Calculation (`calcSegmentPercents`)

```javascript
function calcSegmentPercents(totalCredits, freeRemaining, billingAvailable, rollover, dailyFree) {
  var total = Math.max(0, Math.round(totalCredits || 0));
  var free = Math.max(0, Math.round(freeRemaining || 0));
  var billing = Math.max(0, Math.round(billingAvailable || 0));
  var roll = Math.max(0, Math.round(rollover || 0));
  var daily = Math.max(0, Math.round(dailyFree || 0));

  if (total <= 0) return { free: 0, billing: 0, rollover: 0, daily: 0 };

  var freePct = (free / total) * 100;
  var billingPct = (billing / total) * 100;
  var rollPct = (roll / total) * 100;
  var dailyPct = (daily / total) * 100;
  var sum = freePct + billingPct + rollPct + dailyPct;

  // Normalize if sum exceeds 100% (can happen when pools overlap)
  if (sum > 100) {
    var scale = 100 / sum;
    freePct *= scale;
    billingPct *= scale;
    rollPct *= scale;
    dailyPct *= scale;
  }

  return {
    free: Number(freePct.toFixed(2)),
    billing: Number(billingPct.toFixed(2)),
    rollover: Number(rollPct.toFixed(2)),
    daily: Number(dailyPct.toFixed(2))
  };
}
```

**Note**: Unlike spec/10-macro-controller/credit-system.md's "minimum 2%" rule, the actual implementation does NOT enforce a 2% minimum — it uses proportional scaling with overflow normalization instead.

### Segment Rendering Rules

- Each segment only renders if its value > 0
- 🎁 Bonus segment only appears if `freeRemaining > 0`
- All segments use `transition: width 0.3s ease` for smooth updates
- Background uses reddish tint `rgba(239,68,68,0.25)` to indicate used/depleted area

### Dimensions

| Mode | Bar Height | Border Radius | Min Width | Max Width |
|------|-----------|---------------|-----------|-----------|
| **Full** | 18px | 7px | 120px | 300px |
| **Compact** | 14px | 5px | 80px | 200px |

### Text Labels

**CRITICAL RULE**: Both compact and full mode MUST show all emoji credit labels. The only visual difference between modes is bar height and width — label content is identical.

**Both modes** (next to bar):
```
🎁{bonus} 💰{monthly} 🔄{rollover} 📅{free} ⚡{available}/{total}
```

- In compact mode, labels with value 0 are hidden (e.g., no `🎁0`)
- In full mode, Monthly/Rollover/Free always show; Bonus only if > 0
- Each label has a detailed tooltip explaining the credit type
- Font: `11px monospace`
- ⚡ label: `color:#22d3ee; font-weight:700` (cyan bold)

### Relative Scaling Across Workspaces (v7.23)

When rendering multiple workspace bars in a list, bars MUST be scaled relative to the highest `totalCredits` among all visible (filtered) workspaces. This is implemented via the `maxTotalCredits` parameter.

#### Algorithm

1. **Pre-pass** in `renderLoopWorkspaceList()`: iterate all visible workspaces and compute `maxTotalCredits = max(ws.totalCredits)`.
2. **Pass to renderer**: each `renderCreditBar()` call receives `maxTotalCredits`.
3. **Inner container width**: segments are wrapped in a container with `width: (totalCredits / maxTotalCredits * 100)%`, so a workspace with half the max capacity renders at 50% bar width.
4. **Fallback**: when `maxTotalCredits` is omitted (e.g., status bar), defaults to `totalCredits` — bar renders at full width.

```javascript
// Inside renderCreditBar():
var maxTc = opts.maxTotalCredits || tc;
var fillPct = maxTc > 0 ? Math.min(100, (tc / maxTc) * 100) : 100;
// Inner segment container uses width: fillPct + '%'
```

#### Rules

- **Workspace list**: MUST pass `maxTotalCredits` — provides accurate visual comparison.
- **Status bar** (single workspace): does NOT pass `maxTotalCredits` — renders at full width.
- See `spec/17-app-issues/38-progress-bar-relative-scaling.md` for root cause and prevention rules.

### Rendering Sites (all 3 MUST use `renderCreditBar()`)

1. **Status bar** — `updateStatus()` top-level credit display (no `maxTotalCredits`)
2. **Workspace list (full mode)** — `renderLoopWorkspaceList()` per-workspace rows (with `maxTotalCredits`)
3. **Workspace list (compact mode)** — same function, `compact: true` (with `maxTotalCredits`)

---

## 5. UI Panel Structure

### Panel Container

- **ID**: `ahk-loop-container` (configurable via `IDS.CONTAINER`)
- **Script Marker ID**: `ahk-loop-script` (configurable via `IDS.SCRIPT_MARKER`)
- **Position**: Fixed, draggable via header
- **Background**: `rgba(15,23,42,0.97)` (dark slate)
- **Border**: `1px solid rgba(255,255,255,0.1)`
- **Border radius**: `12px`
- **Box shadow**: `0 8px 32px rgba(0,0,0,0.6)`
- **Min width**: `320px`, Max width: `420px`

### Panel Sections (top to bottom)

1. **Header**: Title `[MacroLoop v{version}]` + minimize/close buttons
2. **Auth diagnostic row** (`#loop-auth-diag`): Token source indicator
3. **Status bar**: Current workspace credit bar + direction indicator
4. **Filter bar**: Search input + compact mode toggle (⚡ button)
5. **Workspace list**: Scrollable list of all workspaces with individual credit bars
6. **Control buttons**: Start/Stop/Check/Export buttons

### Collapsible Sections — `createCollapsibleSection(title, storageKey, opts)`

A shared helper generates consistent collapsible UI sections with localStorage persistence. All 5 collapsible sections use this helper.

```javascript
function createCollapsibleSection(title, storageKey, opts) {
  // Returns: { section, header, toggle, titleEl, body }
  // - Default state: collapsed ([+])
  // - Click header → toggles body display + saves to localStorage
  // - On init: reads localStorage to restore previous state
}
```

#### Collapsible Sections & localStorage Keys

| Section | localStorage Key | Default | Contents |
|---------|-----------------|---------|----------|
| XPath Configuration (editable) | `ml_collapse_xpath` | collapsed | Project Button, Progress Bar, Workspace Name XPath inputs |
| JS Executor (Ctrl+Enter to run) | `ml_collapse_jsexec` | collapsed | Textarea + Run button, JS command history |
| Activity Log | `ml_collapse_activity` | collapsed | Timestamped activity entries |
| JS Logs (N entries) | `ml_collapse_jslogs` | collapsed | Log count label + Copy/DL/Clr buttons |
| Workspace History | `ml_collapse_wshistory` | collapsed | Per-project move history with Clear button |

**Persistence behavior**: `'expanded'` or `'collapsed'` string stored per key. On fresh injection (no saved state), all sections default to collapsed. State survives page reloads but is cleared if localStorage is cleared.

---

## 6. Control Buttons

### ▶ Start (Up/Down)

- **Function**: `window.__loopStart('up')` / `window.__loopStart('down')`
- **Behavior**: Begins auto-rotation cycle. Checks current workspace credits, moves to next workspace with available daily free credits when current depletes.
- **Direction**: `up` = move to previous workspace, `down` = move to next
- **Visual**: Green gradient button, changes to red stop button when active

### ⏹ Stop

- **Function**: `window.__loopStop()`
- **Behavior**: Halts auto-rotation immediately
- **Visual**: Red button, appears only when loop is active

### ⭐ Check

- **Function**: `window.__loopCheck()`
- **Behavior**: One-shot API call to refresh all workspace credit data
- **Visual**: Yellow/amber star button
- **Hover effect**: `transform: translateY(-1px); filter: brightness(1.15)`

### 📋 CSV Export

- **Function**: `window.__loopExportCsv()`
- **Behavior**: Exports all workspace data to CSV file
- **Filename**: `workspaces-credits-YYYY-MM-DD.csv`
- **Columns (17)**: Name, Daily Used, Daily Limit, Daily Free, Rollover Used, Rollover Limit, Rollover Available, Billing Used, Billing Limit, Billing Available, Granted, Granted Used, Granted Remaining, Topup Limit, Total Credits, Available Credits, Subscription Status
- **Sort**: Ascending by workspace name (case-insensitive)

### 🔍 Diagnostic

- **Function**: `window.__loopDiag()`
- **Behavior**: Dumps full diagnostic state to console (token info, workspace data, loop state)

### 📋 Copy Logs / 💾 Download Logs

- **Functions**: `window.__loopLogs.copy()` / `window.__loopLogs.download()`
- **Behavior**: Copies or downloads the internal log buffer

---

## 7. Loop Trigger Logic

### When Does the Loop Move?

The auto-move triggers when `dailyFree == 0` (NOT total available). This means:
- Loop moves to next workspace when **daily free credits** are depleted
- Even if billing/rollover credits remain, the loop moves on

### Smart Switching (`moveToAdjacentWorkspace()`)

1. Fetches fresh credit data
2. Walks in the requested direction (up/down)
3. Finds the first workspace with `dailyFree > 0`
4. Skips depleted workspaces
5. Wraps around if needed

---

## 8. Compact Mode

- **Toggle**: ⚡ button in filter header
- **Persisted**: `localStorage['ml_compact_mode']`
- **Compact view**: 14px bar, `⚡available/total` label only (plus 🎁 if bonus exists)
- **Full view**: 18px bar, all emoji labels (`🎁 💰 🔄 📅 ⚡`)

---

## 9. Hover Effects

Buttons use `onmouseover`/`onmouseout` inline handlers with background color shifts (not CSS classes, since the UI is injected HTML):

```javascript
// Example: Activity Log toggle button
btn.onmouseover = function() { this.style.background = '#4c1d95'; };  // darker on hover
btn.onmouseout  = function() { this.style.background = '#312e81'; };  // restore

// Workspace list items
'onmouseover="if(this.getAttribute(\'data-ws-current\')!==\'true\')this.style.background=\'rgba(59,130,246,0.15)\'"'
'onmouseout="if(this.getAttribute(\'data-ws-current\')!==\'true\')this.style.background=\'transparent\'"'
```

Current workspaces (`data-ws-current="true"`) are excluded from hover effects to maintain their highlighted state.

---

## 10. Configuration Source

The script reads `window.__MARCO_CONFIG__` (JSON object set before injection):

```javascript
var CONFIG = window.__MARCO_CONFIG__ || {};
var IDS = CONFIG.macroLoop?.elementIds || {};
var TIMING = CONFIG.macroLoop?.timing || {};
var XPATHS = CONFIG.macroLoop?.xpaths || {};
var URLS = CONFIG.macroLoop?.urls || {};
```

The default config is defined in `standalone-scripts/macro-controller/02-macro-controller-config.json`.

> **Legacy note**: The AHK version used `__PLACEHOLDER__` tokens replaced at build time from `config.ini`. AHK is now archived — the extension/standalone version above is the only active path.

### Extension Bridge API

When running inside the Chrome Extension, the macro controller can also use `window.marco.*` (injected by the content script before user scripts run):

- `marco.store.set/get/delete/keys/getAll/clear` — persistent storage via `chrome.storage.local`
- `marco.log.info/warn/error/debug` — structured logging to extension databases

See [Spec 42](42-user-script-logging-and-data-bridge.md) for SDK details and [Spec 43](43-macro-controller-extension-bridge.md) for the full bridge architecture.

---

## 11. Global API (Post-Injection)

| Function | Purpose |
|----------|---------|
| `window.__loopStart(direction)` | Start auto-rotation (`'up'` or `'down'`) |
| `window.__loopStop()` | Stop auto-rotation |
| `window.__loopCheck()` | One-shot credit refresh |
| `window.__loopDestroy()` | v7.25: Full teardown — stops loop, removes DOM, deletes globals |
| `window.__loopDiag()` | Diagnostic dump to console |
| `window.__loopMoveToWorkspace(id, name)` | Move project to a specific workspace by ID |
| `window.__loopRenameWorkspace(id, name)` | Rename a workspace by ID (returns Promise) |
| `window.__loopLogs.copy()` | Copy logs to clipboard |
| `window.__loopLogs.download()` | Download logs as file |
| `window.__loopExportCsv()` | Export workspace credits CSV |

---

## 12. File Locations

| Path | Purpose |
|------|---------|
| `standalone-scripts/macro-controller/01-macro-looping.js` | **Source of truth** — macro controller script |
| `standalone-scripts/macro-controller/02-macro-controller-config.json` | Default JSON config (XPaths, timing, element IDs) |
| `standalone-scripts/macro-controller/03-macro-prompts.json` | Prompt chains for automation |
| `spec/10-macro-controller/credit-system.md` | Credit pool definitions and formulas |
| `spec/11-chrome-extension/36-cookie-only-bearer.md` | Session bridge auth spec |
| `spec/11-chrome-extension/42-user-script-logging-and-data-bridge.md` | `window.marco` SDK spec |
| `spec/11-chrome-extension/43-macro-controller-extension-bridge.md` | Controller ↔ extension bridge architecture |
| `spec/17-app-issues/37-compact-mode-bar-missing-segments.md` | Compact mode fix history |

> **Archived**: `marco-script-ahk-v7.latest/` (AHK version) and `scripts/sync-check-macro-looping.mjs` (sync validator) have been moved to `skipped/`.

---

## 13. Engineering Standards Referenced

| # | Standard | Application |
|---|----------|-------------|
| 9 | Bar Segment Completeness | Every credit type in Total Credits formula MUST have a bar segment |
| 14 | No Inline Arithmetic | All credit math via shared `calc*` functions, never inline |

---

*macro-looping.js complete reference v1.4.0 — 2026-03-18*
