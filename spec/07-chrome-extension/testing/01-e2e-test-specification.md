# Chrome Extension — End-to-End Test Specification

> **Version**: 1.0.0
> **Last updated**: 2026-02-28
> **Total test flows**: 20
> **Estimated manual run time**: ~90 minutes

---

## Table of Contents

1. [Test Summary Matrix](#1-test-summary-matrix)
2. [Core User Flows (E2E-01 – E2E-08)](#2-core-user-flows)
3. [Error Recovery & Edge Cases (E2E-09 – E2E-15)](#3-error-recovery--edge-cases)
4. [Deployment & CI (E2E-16 – E2E-18)](#4-deployment--ci)
5. [UI Verification (E2E-19 – E2E-20)](#5-ui-verification)
6. [Test Runner Setup](#6-test-runner-setup)
7. [UI Wireframes](#7-ui-wireframes)

---

## 1. Test Summary Matrix

| ID | Area | Test Name | Priority | Auto? | Est. Time |
|----|------|-----------|----------|-------|-----------|
| E2E-01 | Onboarding | First-run welcome + default project | P0 | ✅ | 2 min |
| E2E-02 | Projects | Project CRUD lifecycle | P0 | ✅ | 3 min |
| E2E-03 | URL Rules | URL matching (exact, prefix, regex) | P0 | ✅ | 3 min |
| E2E-04 | Injection | Script injection — Isolated world | P0 | ✅ | 3 min |
| E2E-05 | Injection | Script injection — Main world | P0 | ✅ | 3 min |
| E2E-06 | Config | Config cascade (Remote > Local > Bundled) | P1 | ✅ | 5 min |
| E2E-07 | Auth | Session cookie + bearer token flow | P0 | ⚠️ | 5 min |
| E2E-08 | Popup | Popup project selection + match status | P0 | ✅ | 3 min |
| E2E-09 | Recovery | Service worker termination + rehydration | P0 | ⚠️ | 5 min |
| E2E-10 | Recovery | WASM/SQLite integrity fallback | P1 | ⚠️ | 5 min |
| E2E-11 | Recovery | 3-tier config recovery | P1 | ✅ | 4 min |
| E2E-12 | Recovery | CSP detection + fallback injection | P1 | ⚠️ | 5 min |
| E2E-13 | Recovery | Network failure — exponential backoff | P2 | ✅ | 4 min |
| E2E-14 | Recovery | Error state transitions (HEALTHY→FATAL) | P0 | ✅ | 5 min |
| E2E-15 | Edge | Multi-tab tracking + independent injection | P1 | ✅ | 4 min |
| E2E-16 | Deploy | Extension install via PowerShell toolchain | P1 | ⚠️ | 5 min |
| E2E-17 | Deploy | Watch Mode — file change triggers reload | P1 | ⚠️ | 4 min |
| E2E-18 | Deploy | ZIP export — diagnostic bundle | P2 | ✅ | 3 min |
| E2E-19 | UI | Options page — full CRUD + library management | P0 | ✅ | 5 min |
| E2E-20 | UI | XPath recorder toggle + capture flow | P2 | ⚠️ | 5 min |

**Legend:** ✅ = Fully automatable | ⚠️ = Requires manual setup or browser API mocking

---

## 2. Core User Flows

### E2E-01 — First-Run Onboarding

**Goal:** Verify the welcome page appears on first install and a default project is created.

**Preconditions:**
- Fresh extension install (no prior `chrome.storage` data)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Install extension from unpacked source | Extension icon appears in toolbar |
| 2 | Observe automatic popup/tab | Welcome page displays with logo, version, and "Get Started" CTA |
| 3 | Click "Get Started" | Default project is created with name "My First Project" |
| 4 | Open Options page | Project list shows 1 project with default name |
| 5 | Verify `chrome.storage.local` | `onboarding_complete: true`, project entry exists |

**Pass criteria:** Welcome page renders without errors; default project persists after popup close.

---

### E2E-02 — Project CRUD Lifecycle

**Goal:** Create, read, update, and delete a project through the Options page.

**Preconditions:**
- Extension installed, onboarding complete

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Options → Projects | Project list renders (may show default project) |
| 2 | Click "New Project" | Empty project form appears with name field focused |
| 3 | Enter name "Test Automation" → Save | Project appears in list with name, 0 URL rules, 0 scripts |
| 4 | Click project row to edit | Edit form opens with populated fields |
| 5 | Change name to "Test Automation v2" → Save | List updates with new name, toast confirms save |
| 6 | Click Delete → Confirm dialog | Project removed from list, storage cleared |
| 7 | Verify storage | No orphan URL rules, scripts, or configs remain |

**Pass criteria:** Full CRUD cycle completes; storage is clean after delete.

**UI — Project List (wireframe):**

```
┌─────────────────────────────────────────────────────────┐
│  Projects                                    [+ New]    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📁 Test Automation v2                           │    │
│  │    3 URL rules · 2 scripts · 1 config           │    │
│  │    Status: ● Active                    [Edit] [🗑]│    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📁 My First Project                             │    │
│  │    0 URL rules · 0 scripts · 0 configs          │    │
│  │    Status: ○ No rules                  [Edit] [🗑]│    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

### E2E-03 — URL Matching Rules

**Goal:** Verify exact, prefix, and regex URL matching triggers correct project binding.

**Preconditions:**
- Project "URL Test" exists with 3 URL rules configured

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add exact rule: `https://example.com/dashboard` | Rule saved with type badge "Exact" |
| 2 | Add prefix rule: `https://api.example.com/` | Rule saved with type badge "Prefix" |
| 3 | Add regex rule: `^https://.*\.example\.com/app` | Rule saved with type badge "Regex" |
| 4 | Navigate to `https://example.com/dashboard` | Popup shows ✅ match → "URL Test" project |
| 5 | Navigate to `https://api.example.com/v2/users` | Popup shows ✅ match → "URL Test" (prefix) |
| 6 | Navigate to `https://sub.example.com/app/home` | Popup shows ✅ match → "URL Test" (regex) |
| 7 | Navigate to `https://other.com` | Popup shows ❌ no match |
| 8 | Delete the prefix rule | Navigation to `https://api.example.com/v2` shows ❌ no match |

**Pass criteria:** All 3 match types resolve correctly; deletions take immediate effect.

**UI — URL Match Status in Popup:**

```
┌───────────────────────────────────┐
│  🧩 Extension Popup              │
├───────────────────────────────────┤
│                                   │
│  Current Tab:                     │
│  https://example.com/dashboard    │
│                                   │
│  ┌───────────────────────────┐    │
│  │ ✅ Matched: URL Test      │    │
│  │    Rule: Exact match      │    │
│  │    Scripts: 2 injected    │    │
│  └───────────────────────────┘    │
│                                   │
│  [View Project]  [Inject Now]     │
│                                   │
└───────────────────────────────────┘
```

---

### E2E-04 — Script Injection (Isolated World)

**Goal:** Verify a content script executes in the isolated world without page variable access.

**Preconditions:**
- Project with URL rule matching test page
- Script assigned with execution world = "Isolated"

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create script: `console.log("ISOLATED:", typeof window.__pageVar)` | Script saved in library |
| 2 | Bind script to project, set world = Isolated | Script shows "Isolated" badge |
| 3 | Navigate to test page with `window.__pageVar = 42` | Script executes |
| 4 | Check DevTools console | Output: `ISOLATED: undefined` (no page access) |
| 5 | Check `logs.db` via Options | Entry with `script_id`, `project_id`, status = success |

**Pass criteria:** Script runs in isolation; `window.__pageVar` is undefined; log entry created.

---

### E2E-05 — Script Injection (Main World)

**Goal:** Verify a script executes in the main page world with full page access.

**Preconditions:**
- Same as E2E-04 but world = "Main"

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create script: `console.log("MAIN:", window.__pageVar)` | Script saved |
| 2 | Bind script, set world = Main | Script shows "Main" badge |
| 3 | Navigate to test page with `window.__pageVar = 42` | Script executes |
| 4 | Check DevTools console | Output: `MAIN: 42` (page access confirmed) |
| 5 | Trigger a script error: `throw new Error("test")` | Error captured via injected `window.onerror` |
| 6 | Check `errors.db` via Options | Entry with stack trace, script_id, correlation_id |

**Pass criteria:** Main world scripts access page globals; errors route to `errors.db`.

---

### E2E-06 — Config Cascade Loading

**Goal:** Verify 3-tier config cascade: Remote > Local > Bundled.

**Preconditions:**
- Bundled default config with `{ "theme": "light", "timeout": 30 }`
- Local override with `{ "theme": "dark" }`
- Remote endpoint returning `{ "timeout": 60, "feature_flag": true }`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load extension with all 3 tiers available | Config resolves to merged result |
| 2 | Inspect resolved config | `theme: "dark"` (local), `timeout: 60` (remote), `feature_flag: true` (remote) |
| 3 | Disable remote endpoint (network off) | Falls back to Local + Bundled |
| 4 | Inspect resolved config | `theme: "dark"` (local), `timeout: 30` (bundled), no `feature_flag` |
| 5 | Clear local overrides | Falls back to Bundled only |
| 6 | Inspect resolved config | `theme: "light"`, `timeout: 30` |
| 7 | Re-enable network | Remote config loads on next refresh interval |

**Pass criteria:** Each tier falls through correctly; merge strategy produces expected keys at each level.

---

### E2E-07 — Authentication Flow

**Goal:** Verify bearer token + cookie fallback authentication.

**Preconditions:**
- Backend session endpoint available
- Test account credentials

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in via the target web app | Session cookie set (HttpOnly) |
| 2 | Open extension popup | Extension reads cookie via `chrome.cookies` API |
| 3 | Verify `localStorage` | Bearer token stored for persistence |
| 4 | Clear `localStorage` bearer token | Token removed |
| 5 | Reload extension | Falls back to cookie read, re-extracts token |
| 6 | Verify authenticated API call | Request includes `Authorization: Bearer <token>` header |
| 7 | Clear both cookie and localStorage | Extension shows "Not authenticated" state |

**Pass criteria:** Primary bearer token works; cookie fallback recovers session; cleared state shows unauthenticated.

---

### E2E-08 — Popup Project Selection & Match Status

**Goal:** Verify the popup correctly displays match status per tab and allows project switching.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open popup on matched URL | Shows ✅ with project name, rule type, injection count |
| 2 | Open popup on unmatched URL | Shows ❌ "No matching project" |
| 3 | Switch project via dropdown | Match re-evaluates; injection updates |
| 4 | Open two tabs with different matches | Switching tabs updates popup state |
| 5 | Inject script via "Inject Now" button | Console shows script output; popup count increments |

**Pass criteria:** Popup reflects real-time tab state; project switching triggers re-evaluation.

---

## 3. Error Recovery & Edge Cases

### E2E-09 — Service Worker Termination + Rehydration

**Goal:** Verify state survives MV3 service worker termination.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure a project with active injection | Scripts running on matched tabs |
| 2 | Force service worker termination via `chrome://serviceworker-internals` | Worker stops |
| 3 | Wait for `chrome.alarms` keepalive to fire | Worker restarts |
| 4 | Verify state | Project config rehydrated from `chrome.storage.session` |
| 5 | Navigate to matched URL | Injection resumes without user action |
| 6 | Check logs | Rehydration event logged with timestamp |

**Pass criteria:** Zero data loss after termination; injection resumes automatically.

---

### E2E-10 — WASM/SQLite Integrity Fallback

**Goal:** Verify graceful degradation when SQLite WASM fails.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Corrupt or block WASM file load | SQLite initialization fails |
| 2 | Observe extension state | Transitions to DEGRADED state |
| 3 | Check extension badge | Shows ⚠️ yellow badge |
| 4 | Verify fallback | Memory-only SQLite or `storage.local` fallback active |
| 5 | Create a log entry | Entry stored in fallback storage |
| 6 | Restore WASM file | Next restart recovers to HEALTHY |
| 7 | Verify log migration | Fallback entries migrated to SQLite |

**Pass criteria:** Extension remains functional in degraded mode; recovery restores full capability.

**UI — Health Status Badge:**

```
┌──────────────────────┐
│  Extension Icon      │
│  ┌──┐                │
│  │🧩│ ← Normal       │
│  └──┘                │
│  ┌──┐                │
│  │⚠️│ ← DEGRADED     │
│  └──┘                │
│  ┌──┐                │
│  │🔴│ ← ERROR/FATAL  │
│  └──┘                │
└──────────────────────┘
```

---

### E2E-11 — 3-Tier Config Recovery

**Goal:** Verify config recovery chain when tiers fail.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Block remote endpoint (simulate 500) | Remote tier fails |
| 2 | Observe config load | Falls to Local tier, logs warning |
| 3 | Corrupt local override JSON | Local tier fails |
| 4 | Observe config load | Falls to Bundled defaults, logs error |
| 5 | Restore remote endpoint | Next refresh picks up remote config |
| 6 | Verify merged result | Remote values override bundled |

**Pass criteria:** Each fallback tier activates in order; recovery is automatic.

---

### E2E-12 — CSP Detection + Fallback Injection

**Goal:** Verify injection adapts when Content Security Policy blocks standard methods.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to page with strict CSP (`script-src 'self'`) | CSP detected |
| 2 | Attempt Main world injection | Blocked by CSP |
| 3 | Observe fallback | Extension switches to Isolated world automatically |
| 4 | Check logs | CSP detection event logged with policy details |
| 5 | Check popup status | Shows "CSP: Fallback active" indicator |

**Pass criteria:** CSP doesn't crash injection; fallback activates transparently.

---

### E2E-13 — Network Failure & Exponential Backoff

**Goal:** Verify retry logic with exponential backoff on network failures.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Block network to remote config endpoint | First attempt fails |
| 2 | Observe retry timing | Retry after ~1s |
| 3 | Keep network blocked | Retries at ~2s, ~4s, ~8s intervals |
| 4 | Verify max backoff cap | Retries cap at configured max (e.g., 60s) |
| 5 | Restore network | Next retry succeeds; backoff resets |
| 6 | Check logs | All retry attempts logged with intervals |

**Pass criteria:** Backoff doubles each attempt; cap respected; recovery resets timer.

---

### E2E-14 — Error State Transitions

**Goal:** Verify the HEALTHY → DEGRADED → ERROR → FATAL state machine.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Normal operation | State: HEALTHY, badge: normal |
| 2 | Trigger non-critical failure (e.g., 1 config tier down) | State: DEGRADED, badge: ⚠️ |
| 3 | Trigger critical failure (e.g., SQLite + network both down) | State: ERROR, badge: 🔴 |
| 4 | Trigger unrecoverable failure (e.g., corrupted manifest) | State: FATAL, badge: 🔴, popup shows error |
| 5 | Resolve all issues | State: HEALTHY (if recoverable) |
| 6 | Check state history in logs | Full transition chain logged with timestamps |

**Pass criteria:** Transitions follow defined state machine; badges update in real-time.

**UI — Status Bar in Popup (per state):**

```
HEALTHY:
┌───────────────────────────────┐
│ ● System Healthy              │
│ All services operational      │
└───────────────────────────────┘

DEGRADED:
┌───────────────────────────────┐
│ ⚠ Degraded Mode              │
│ SQLite: fallback active       │
│ Config: local only            │
│ [View Details]                │
└───────────────────────────────┘

ERROR:
┌───────────────────────────────┐
│ ✖ Error State                 │
│ 2 services unavailable        │
│ Retrying in 8s...             │
│ [Export Diagnostics]          │
└───────────────────────────────┘

FATAL:
┌───────────────────────────────┐
│ 🔴 Fatal Error                │
│ Extension cannot operate      │
│ [Export Diagnostics] [Reload] │
└───────────────────────────────┘
```

---

### E2E-15 — Multi-Tab Tracking

**Goal:** Verify independent injection state per tab.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Tab A on `https://site-a.com` (matched) | Scripts injected for project A |
| 2 | Open Tab B on `https://site-b.com` (matched, different project) | Scripts injected for project B |
| 3 | Open Tab C on `https://unmatched.com` | No injection |
| 4 | Switch to Tab A, open popup | Shows project A match + injection count |
| 5 | Switch to Tab B, open popup | Shows project B match + injection count |
| 6 | Close Tab A | Tab A tracking cleared; Tab B unaffected |
| 7 | Navigate Tab B to unmatched URL | Injection state cleared for Tab B |

**Pass criteria:** Each tab maintains independent state; cleanup on close/navigate.

---

## 4. Deployment & CI

### E2E-16 — Extension Install via PowerShell

**Goal:** Verify automated installation into a Chrome profile.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `Install-Extension.ps1 -Profile "TestProfile"` | Extension copied to profile directory |
| 2 | Launch Chrome with test profile | Extension auto-loads |
| 3 | Verify extension ID matches | ID in `chrome.runtime.id` matches manifest |
| 4 | Run install again (update) | Files replaced without duplicate |

**Pass criteria:** Automated install works for fresh and update scenarios.

---

### E2E-17 — Watch Mode + Hot Reload

**Goal:** Verify file changes trigger automatic extension reload.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start watch mode: `Watch-Extension.ps1` | FileSystemWatcher active |
| 2 | Edit a content script file | `.reload-signal` file written |
| 3 | Observe extension | `chrome.runtime.reload()` fires |
| 4 | Verify new script content | Updated script executes on next navigation |
| 5 | Edit a non-watched file (e.g., README) | No reload triggered |

**Pass criteria:** Only relevant file changes trigger reload; update applies immediately.

---

### E2E-18 — Diagnostic ZIP Export

**Goal:** Verify the export system produces a valid diagnostic bundle.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate some logs and errors | Entries in `logs.db` and `errors.db` |
| 2 | Navigate to Options → Export | Export section visible |
| 3 | Click "Export as JSON" | JSON file downloads with log entries |
| 4 | Click "Export as ZIP" | ZIP downloads containing `logs.db`, `errors.db`, `config.json`, `metadata.json` |
| 5 | Verify ZIP contents | All files present; `metadata.json` includes extension version + export timestamp |
| 6 | Verify `logs.db` integrity | SQLite file opens; tables contain expected rows |

**Pass criteria:** Both export formats produce valid, complete diagnostic data.

**UI — Export Section in Options:**

```
┌─────────────────────────────────────────────────────┐
│  Diagnostics & Export                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Storage Usage:                                     │
│  ┌─────────────────────────────────────────┐        │
│  │ logs.db    ████████░░░░  2.4 MB / 5 MB  │        │
│  │ errors.db  ██░░░░░░░░░░  0.6 MB / 5 MB  │        │
│  └─────────────────────────────────────────┘        │
│                                                     │
│  Log entries: 1,247  │  Error entries: 38           │
│  Last pruned: 2026-02-27 14:30                      │
│                                                     │
│  ┌────────────────┐  ┌────────────────────┐         │
│  │ 📄 Export JSON  │  │ 📦 Export ZIP       │         │
│  └────────────────┘  └────────────────────┘         │
│                                                     │
│  ┌────────────────────────────────────────┐         │
│  │ 🗑  Purge All Logs  │  ⚠ Irreversible  │         │
│  └────────────────────────────────────────┘         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 5. UI Verification

### E2E-19 — Options Page Full CRUD + Library

**Goal:** Verify all Options page sections render and function.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Options page | Dashboard loads with sidebar navigation |
| 2 | Navigate: Projects → URL Rules → Scripts → Configs → System | All sections render without errors |
| 3 | Projects: Create, edit, delete | CRUD operations persist (covered in E2E-02) |
| 4 | URL Rules: Add exact/prefix/regex with validation | Invalid regex shows error; valid rules save |
| 5 | Scripts: Upload via drag-and-drop zone | File appears in library with name, size, type |
| 6 | Scripts: Drag to reorder priority | Priority order persists after reload |
| 7 | Configs: Add JSON config with syntax validation | Invalid JSON blocked with error message |
| 8 | System: View storage usage, extension version | Stats render with accurate data |

**Pass criteria:** All CRUD operations work; validation prevents bad data; navigation is smooth.

**UI — Options Page Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  🧩 Extension Options                                    v1.0.0 │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                   │
│  📁 Projects │  Projects                          [+ New Project]│
│              │  ─────────────────────────────────────────────     │
│  🔗 URL Rules│  ┌──────────────────────────────────────────┐     │
│              │  │ 📁 My Automation Project                 │     │
│  📜 Scripts  │  │    5 rules · 3 scripts · 2 configs       │     │
│              │  │    Last run: 2 min ago   ● Active         │     │
│  ⚙ Configs   │  │                           [Edit] [🗑]     │     │
│              │  └──────────────────────────────────────────┘     │
│  📊 System   │  ┌──────────────────────────────────────────┐     │
│              │  │ 📁 Debug Helpers                         │     │
│  📤 Export   │  │    2 rules · 1 script · 0 configs        │     │
│              │  │    Last run: never       ○ Inactive       │     │
│  ❓ Help     │  │                           [Edit] [🗑]     │     │
│              │  └──────────────────────────────────────────┘     │
│              │                                                   │
├──────────────┴───────────────────────────────────────────────────┤
│  System: HEALTHY │ Storage: 3.0 MB / 10 MB │ v1.0.0             │
└──────────────────────────────────────────────────────────────────┘
```

---

### E2E-20 — XPath Recorder

**Goal:** Verify the XPath recording mode captures and exports paths.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press `Ctrl+Shift+R` on a matched page | Recorder overlay activates with "Recording" badge |
| 2 | Hover over a page element | Element highlighted with colored border |
| 3 | Click the element | XPath captured using priority: ID > testid > Role+Text > Positional |
| 4 | Capture 3 elements | Overlay dashboard shows 3 entries with XPath strings |
| 5 | Click "Copy All" | All XPaths copied to clipboard as formatted list |
| 6 | Click "Export" | JSON file with XPaths + metadata downloads |
| 7 | Press `Ctrl+Shift+R` again | Recorder deactivates; overlay removed |

**Pass criteria:** Hover highlighting works; XPath priority strategy produces optimal paths; export is valid.

**UI — XPath Recorder Overlay:**

```
┌──────────────────────────────────────────────────────────────┐
│  Page Content (dimmed)                                       │
│                                                              │
│  ┌─────────────────────────┐                                 │
│  │ ┌─────────────────────┐ │ ← highlighted element           │
│  │ │ Submit Button       │ │    (dashed border, semi-         │
│  │ └─────────────────────┘ │     transparent overlay)         │
│  └─────────────────────────┘                                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  🔴 Recording ─ 3 captured                           │    │
│  │  ──────────────────────────────────────────────────   │    │
│  │  1. //button[@id="submit-btn"]              [×]      │    │
│  │  2. //div[@data-testid="user-card"]         [×]      │    │
│  │  3. //table/tbody/tr[1]/td[2]               [×]      │    │
│  │  ──────────────────────────────────────────────────   │    │
│  │  [Copy All]  [Export JSON]  [Clear]  [■ Stop]        │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Test Runner Setup

### Manual Execution

Follow the matrix in Section 1 sequentially. Use a fresh Chrome profile for isolation.

```bash
# Create a test profile
google-chrome --user-data-dir=/tmp/ext-test-profile --no-first-run

# Load unpacked extension
# Navigate to chrome://extensions → Enable Developer Mode → Load Unpacked
```

### Automated Execution (Puppeteer/Playwright)

```javascript
// playwright.config.ts — Chrome Extension E2E
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [{
    name: 'chrome-extension',
    use: {
      browserName: 'chromium',
      // Load extension in test browser
      launchOptions: {
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-first-run',
        ],
      },
    },
  }],
  testDir: './e2e-tests',
  timeout: 30_000,
  retries: 1,
});
```

```javascript
// e2e-tests/helpers.ts — Common utilities
export async function getExtensionId(context) {
  const [background] = context.serviceWorkers();
  const extensionId = background.url().split('/')[2];
  return extensionId;
}

export async function openPopup(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return popup;
}

export async function openOptions(context, extensionId) {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  return options;
}
```

### CI Pipeline (GitHub Actions)

```yaml
name: Chrome Extension E2E
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build:extension

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Run E2E tests
        run: npx playwright test --project=chrome-extension

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: |
            test-results/
            playwright-report/
```

---

## 7. UI Wireframes — Complete Reference

### 7.1 — Popup States

```
NO MATCH:                          MATCHED:
┌───────────────────────┐          ┌───────────────────────┐
│ 🧩 Ext Name     v1.0 │          │ 🧩 Ext Name     v1.0 │
├───────────────────────┤          ├───────────────────────┤
│                       │          │                       │
│ Current Tab:          │          │ Current Tab:          │
│ https://random.com    │          │ https://example.com   │
│                       │          │                       │
│ ┌───────────────────┐ │          │ ┌───────────────────┐ │
│ │ ❌ No match       │ │          │ │ ✅ URL Test       │ │
│ │                   │ │          │ │  Rule: Prefix     │ │
│ │ No projects match │ │          │ │  Scripts: 2       │ │
│ │ this URL.         │ │          │ │  Injected: ✓      │ │
│ └───────────────────┘ │          │ └───────────────────┘ │
│                       │          │                       │
│ [Open Options]        │          │ [Details] [Inject]    │
│                       │          │                       │
│ ── System ─────────── │          │ ── System ─────────── │
│ ● Healthy             │          │ ● Healthy             │
└───────────────────────┘          └───────────────────────┘
```

### 7.2 — Script Library (Options Page)

```
┌─────────────────────────────────────────────────────────────┐
│  Scripts Library                              [+ Upload]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐    │
│  │                                                     │    │
│  │      📂 Drop .js files here to upload               │    │
│  │         or click [Browse]                           │    │
│  │                                                     │    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ☰  auto-login.js           1.2 KB   Isolated  [🗑]  │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ☰  dom-observer.js         3.8 KB   Main      [🗑]  │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ☰  data-extractor.js       2.1 KB   Isolated  [🗑]  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ↕ Drag to reorder priority                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 — URL Rule Editor (Options Page)

```
┌─────────────────────────────────────────────────────────────┐
│  URL Rules — "My Automation Project"           [+ Add Rule] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Type: [Exact ▾]                                     │    │
│  │ URL:  [https://example.com/dashboard          ]     │    │
│  │                                     [Test] [Save]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Existing Rules:                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟢 Exact   https://example.com/dashboard     [Edit] [×]│    │
│  │ 🔵 Prefix  https://api.example.com/          [Edit] [×]│    │
│  │ 🟣 Regex   ^https://.*\.test\.com/app        [Edit] [×]│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Test URL: [https://api.example.com/v2/users     ]          │
│  Result:   ✅ Matches rule #2 (Prefix)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Cross-References

- [Chrome Extension Overview](00-overview.md) — Specification directory
- [Readable Conditions (RC1–RC4)](../../08-coding-guidelines/golang-standards/03-readable-conditions.md) — Code style for Go test helpers
- [Error Management](../../11-imported/error-management/06-apperror-package/readme.md) — Error handling patterns

---

*Chrome Extension E2E test specification v1.0.0 — 2026-02-28*
