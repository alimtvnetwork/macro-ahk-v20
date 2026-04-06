# End-to-End Test Plan

**Tracker**: P-001 / S-011
**Version**: v1.0
**Date**: 2026-03-14
**Scope**: AHK layer + JS controllers (combo.js, macro-looping.js) + Chrome Extension

---

## How to Use This Document

Each section is a **test suite** with numbered test cases. For each test:

- **Pre**: Preconditions that must be true before starting
- **Steps**: Exact actions to perform
- **Expected**: What should happen
- **Pass?**: Checkbox for manual tracking

Run the **full plan** before any release. Run **individual suites** after changes to the corresponding module.

---

## Suite 1: AHK Startup & Config Loading

**Files**: `Config.ahk`, `Config/*.ahk`, `config.ini`
**When to run**: After any config.ini change, AHK module change, or version bump

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 1.1 | Valid config loads | Launch script with valid `config.ini` | TrayTip "Config loaded", all globals populated | ☐ |
| 1.2 | Missing config.ini | Rename/delete `config.ini`, launch | TrayTip error, script exits gracefully | ☐ |
| 1.3 | Invalid int value | Set `LoopIntervalMs=abc` | Schema validation catches it, TrayTip with `SCHEMA` prefix, fallback to default | ☐ |
| 1.4 | Invalid URL value | Set `LovableApiBaseUrl=not-a-url` | Schema validation error logged | ☐ |
| 1.5 | Missing required key | Remove `TransferButtonXPath` from ini | Validation error for missing key | ☐ |
| 1.6 | All 8 schema types | Verify int, posint, url, xpath, hotkey, bool01, enum, version pass for valid values | No schema errors | ☐ |
| 1.7 | Config hot-reload | Edit `LoopIntervalMs` while script runs | TrayTip "Config reloaded", new value applied without restart | ☐ |
| 1.8 | Hotkey change warning | Edit `[Hotkeys]` section while running | TrayTip warns "Hotkey changes require restart" | ☐ |

---

## Suite 2: DevTools & Injection Pipeline

**Files**: `JsInject.ahk`, `Combo.ahk`, `MacroLoop/Embed.ahk`
**When to run**: After changes to injection, DevTools management, or console focus logic

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 2.1 | First injection opens DevTools | Trigger combo on fresh browser window | DevTools Console opens via Ctrl+Shift+J | ☐ |
| 2.2 | Subsequent injection reuses DevTools | Trigger combo again | F12 close → ClickPageContent → Ctrl+Shift+J reopen (no double-open) | ☐ |
| 2.3 | InjectJSQuick after InjectJS | Multi-call batch (e.g., embed MacroLoop) | Second call uses paste-only, no DevTools toggle | ☐ |
| 2.4 | ClickPageContent targets upper 1/3 | Observe click position during injection | Click lands above bottom-docked DevTools panel | ☐ |
| 2.5 | Execution context is page | After injection, run `console.log(location.hostname)` | Prints page domain, NOT `devtools://` | ☐ |
| 2.6 | DevTools closed manually | Close DevTools, then trigger combo | Script detects missing DevTools, re-opens via full InjectJS path | ☐ |
| 2.7 | Clipboard restoration | Copy text to clipboard, trigger injection | After injection completes, clipboard contains original text | ☐ |
| 2.8 | Domain guard | Navigate to non-lovable.dev domain, trigger combo | Script aborts with domain mismatch log, no UI injected | ☐ |

---

## Suite 3: ComboSwitch — Fast Path & Recovery

**Files**: `combo.js`, `Combo.ahk`
**When to run**: After changes to combo logic, session recovery, or fast path

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 3.1 | First injection — full path | Clear session, trigger Ctrl+Alt+Down | Full 40K combo.js injected, UI panel appears | ☐ |
| 3.2 | Fast path — function exists | Trigger Ctrl+Alt+Down again (no page refresh) | `window.__comboSwitch('down')` called directly (~35 chars) | ☐ |
| 3.3 | Page refresh — sessionStorage recovery | Refresh page, trigger Ctrl+Alt+Down | Script recovered from sessionStorage cache, title shows `__AHK_RECOVERED__` | ☐ |
| 3.4 | sessionStorage cleared — full re-inject | Clear sessionStorage, refresh, trigger combo | Full 40K re-injection from disk | ☐ |
| 3.5 | Title marker signal | Trigger fast path when function is missing | `document.title` contains `__AHK_REINJECT__`, AHK detects and re-injects | ☐ |
| 3.6 | Idempotent init | Inject combo.js twice | Second injection returns immediately (script marker exists), no UI duplication | ☐ |

---

## Suite 4: ComboSwitch — 8-Step Execution

**Files**: `combo.js`
**Pre**: Controller UI is visible, on a lovable.dev project settings page
**When to run**: After changes to combo step logic, XPath selectors, or element finding

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 4.1 | Combo Down | Press Ctrl+Alt+Down | Steps 1–8 execute, project switches to next, green flash on button | ☐ |
| 4.2 | Combo Up | Press Ctrl+Alt+Up | Steps 1–8 execute, project switches to previous, green flash | ☐ |
| 4.3 | Step badge updates | Watch active button during combo | Yellow badge shows `1/8` → `2/8` → ... → `8/8` | ☐ |
| 4.4 | Button pulse animation | Watch active button | Pulsing glow (blue for Up, yellow for Down) during execution | ☐ |
| 4.5 | Retry on step failure | Break an XPath temporarily (e.g., change Transfer button) | Retries up to `ComboRetryCount` times with delay, logs each attempt | ☐ |
| 4.6 | All retries exhausted | Permanently break XPath | Red flash on button, `__AHK_COMBO_FAILED__<step>__` in title, TrayTip error | ☐ |
| 4.7 | History entry added | Complete a combo | New entry in Recent Actions with timestamp and direction arrow | ☐ |
| 4.8 | Status display updates | Complete a combo | NOW section shows new workspace name and credits | ☐ |

---

## Suite 5: ComboSwitch — Element Finding (5-Method Fallback)

**Files**: `combo.js` — `findElement()`
**When to run**: After DOM changes on lovable.dev or XPath updates

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 5.1 | Method 1: XPath | Use valid XPath | Element found via XPath | ☐ |
| 5.2 | Method 2: Text scan | Break XPath, keep textMatch | Falls back to text-based scan, finds element | ☐ |
| 5.3 | Method 3: CSS selector | Break XPath + text, keep selector | Falls back to CSS selector | ☐ |
| 5.4 | Method 4: ARIA/role | Break methods 1–3, keep AriaLabel | Falls back to ARIA attributes | ☐ |
| 5.5 | Method 5: Heading search | Break methods 1–4, keep HeadingSearch | Falls back to heading proximity | ☐ |
| 5.6 | All methods fail | Break all descriptors | Error logged with E00X code, step fails | ☐ |

---

## Suite 6: ComboSwitch — UI & Interaction

**Files**: `combo.js`
**Pre**: Controller UI is visible
**When to run**: After UI changes, shortcut changes, or workspace management updates

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 6.1 | Panel drag | Drag header bar | Panel moves with pointer, position updates from right/bottom to left/top | ☐ |
| 6.2 | Panel minimize | Click `[-]` button | Body hides, button changes to `[+]` | ☐ |
| 6.3 | Panel expand | Click `[+]` button | Body reappears | ☐ |
| 6.4 | Panel close | Click `[x]` button | Panel removed from DOM | ☐ |
| 6.5 | Toggle hide shortcut | Press Ctrl+Alt+H | Panel hides; press again → reappears | ☐ |
| 6.6 | SPA persistence | Navigate to different page on lovable.dev | MutationObserver re-creates panel (500ms debounce) | ☐ |
| 6.7 | JS Executor — focus | Press Ctrl+/ | Textbox focused | ☐ |
| 6.8 | JS Executor — run | Type `1+1`, press Ctrl+Enter | Result shown, history entry added | ☐ |
| 6.9 | JS History — recall | Press ArrowUp in textbox | Previous command recalled | ☐ |
| 6.10 | Workspace search | Type in search input | Workspace list filters in real-time | ☐ |
| 6.11 | Workspace keyboard nav | ArrowUp/Down in search | Selection moves through list | ☐ |
| 6.12 | Workspace move via Enter | Select workspace, press Enter | Move API called, status updates | ☐ |
| 6.13 | Focus Current button | Click `📍 Focus Current` | Scrolls to current workspace (cyan highlight) | ☐ |
| 6.14 | CSV export | Click CSV export button | Downloads sorted credit data as CSV | ☐ |
| 6.15 | Export bundle | Click 📥 Export button | Full bundle (xpath-utils + macro-looping + combo) copied to clipboard + downloaded | ☐ |

---

## Suite 7: Credit Status & Workspace Detection

**Files**: `combo.js`, `macro-looping.js`
**Pre**: Valid bearer token available
**When to run**: After changes to credit parsing, API calls, or workspace detection

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 7.1 | API credit fetch | Press Ctrl+Alt+S or click Status button | Credits fetched via API, progress bars updated | ☐ |
| 7.2 | Progress bar colors | Observe progress bars | 🎁 Bonus=purple → 💰 Monthly=green → 🔄 Rollover=gray → 📅 Free=yellow | ☐ |
| 7.3 | Per-workspace data | Open workspace list | Each item shows emoji, progress bar, credits, daily, free count | ☐ |
| 7.4 | Current workspace highlight | Find current workspace in list | Cyan left border, 📍 emoji, bold, CURRENT badge | ☐ |
| 7.5 | Exponential backoff | Block API (e.g., invalid token) | Retry indicator shows "Retrying (X/Y)..." with countdown | ☐ |
| 7.6 | API 401 — token expiry | Use expired token | `markBearerTokenExpired('loop')` called, red banner with "Paste Save" and "🍪 Cookie" buttons | ☐ |
| 7.7 | Check button — normal | Click Check while loop stopped | `runCheck()` executes, "⏳ Checking…" → resets to "Check" | ☐ |
| 7.8 | Check button — double click | Click Check twice rapidly | Second click ignored (cooldown guard) | ☐ |
| 7.9 | Check button — during delegation | Click Check while `isDelegating === true` | Button flashes, logs "Check blocked" | ☐ |
| 7.10 | Check button — API failure | Click Check with broken API | Falls through to XPath detection, button resets | ☐ |
| 7.11 | Nested API response | API returns `{ workspace: {...} }` shape | Parsed correctly via `rawWs.workspace || rawWs` normalization | ☐ |
| 7.12 | Free credits calculation | Workspace with `credits_granted > 0` | `freeRemaining = max(0, granted - used)`, `🎁 N free` displayed | ☐ |

---

## Suite 8: Bearer Token & Authentication

**Files**: `combo.js`, `macro-looping.js`
**When to run**: After changes to token resolution, cookie reading, or auth flow

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 8.1 | Token from config | Set bearer token in config | API calls use config token | ☐ |
| 8.2 | Token from localStorage | Remove config token, set in localStorage | Falls back to localStorage token | ☐ |
| 8.3 | No token available | Remove all tokens | "No token" warning, API calls use credentials:include | ☐ |
| 8.4 | Token displayed (redacted) | Open Bearer Token section | Shows "saved, N chars", first 12 chars visible | ☐ |
| 8.5 | Token paste + save | Paste new token into input | Token saved to localStorage, header updates | ☐ |
| 8.6 | Cookie fallback on 401 | Bearer returns 401 | Retries with credentials:include (cookie mode) | ☐ |

---

## Suite 9: MacroLoop — Lifecycle & Automation

**Files**: `macro-looping.js`, `MacroLoop/*.ahk`
**Pre**: MacroLoop controller injected on lovable.dev
**When to run**: After changes to loop logic, delegation, or workspace switching

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 9.1 | Start loop | Click Start or press hotkey | Loop begins, countdown timer visible, activity log entries appear | ☐ |
| 9.2 | Stop loop | Click Stop or press hotkey | Loop stops, button text resets | ☐ |
| 9.3 | Loop cycle executes | Wait one full interval | Cycle runs: credit check → workspace decision → action → log | ☐ |
| 9.4 | Smart workspace switching | All credits depleted on current workspace | Skips depleted workspaces, moves to one with available credits | ☐ |
| 9.5 | Force Move Up | Click ⏫ | `moveToAdjacentWorkspace('up')` fires, button shows "⏳ Moving Up…" | ☐ |
| 9.6 | Force Move Down | Click ⏬ | `moveToAdjacentWorkspace('down')` fires | ☐ |
| 9.7 | Force Move cooldown | Click ⏫ then immediately ⏬ | Second click ignored, both buttons disabled for 8s | ☐ |
| 9.8 | Activity log | Perform several actions | Color-coded log entries: green=success, red=error, yellow=warn, blue=delegate | ☐ |

---

## Suite 10: MacroLoop — Workspace Rename

**Files**: `macro-looping.js`
**Pre**: MacroLoop controller injected, workspace list loaded
**When to run**: After changes to rename logic, undo system, or workspace list UI

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 10.1 | Single rename | Right-click workspace → type new name → confirm | `PUT /user/workspaces/{id}` called, list updates | ☐ |
| 10.2 | Checkbox selection | Click checkboxes on 3 workspaces | Selection count badge shows "3" | ☐ |
| 10.3 | Shift+Click range | Click checkbox 1, Shift+click checkbox 5 | Items 1–5 selected | ☐ |
| 10.4 | Select All toggle | Click "Select All" | All workspaces checked; click again → all unchecked | ☐ |
| 10.5 | Bulk rename — template | Select 3 workspaces, click ✏️ Rename, template `P$$` start=1 | Preview shows P01, P02, P03 | ☐ |
| 10.6 | Bulk rename — prefix/suffix | Enable prefix "Team-" and suffix "-Dev" | Preview shows "Team-P01-Dev", "Team-P02-Dev", etc. | ☐ |
| 10.7 | Bulk rename — apply | Click Apply | Sequential PUT calls, progress indicator, list refreshes | ☐ |
| 10.8 | Undo last rename | Click ↩️ Undo | Previous names restored via sequential PUT calls | ☐ |
| 10.9 | Undo history persistence | Reload page, check ↩️ button | History loaded from localStorage, undo available | ☐ |
| 10.10 | Undo button visibility | No rename history | ↩️ button hidden; after rename → visible with tooltip | ☐ |

---

## Suite 11: MacroLoop — Auth Panel

**Files**: `macro-looping.js`, `macro-controller.js`
**When to run**: After changes to auth panel controls or interactivity
**Reference**: `spec/02-app-issues/33-regression-checklist-check-button-auth-panel.md`

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 11.1 | Panel drag | Drag auth panel header | Panel moves with pointer | ☐ |
| 11.2 | Minimize/expand | Click `[-]` / `[+]` | Content toggles, button label toggles | ☐ |
| 11.3 | Close panel | Click `[x]` | Panel removed, log says "use showAuthPanel() to reopen" | ☐ |
| 11.4 | Reopen via 🔓 Auth button | Click 🔓 Auth in MacroLoop UI | `window.__MARCO__.showAuthPanel()` called, panel reappears | ☐ |
| 11.5 | Reopen via console | Run `window.__MARCO__.showAuthPanel()` | Panel reappears | ☐ |
| 11.6 | Auth status indicator | Valid/invalid token state | 🟢 (valid) or 🔴 (invalid) indicator updates via DOM polling | ☐ |
| 11.7 | SPA persistence | Navigate to different page | MutationObserver re-creates panel | ☐ |

---

## Suite 12: Chrome Extension — Service Worker Boot

**Files**: `chrome-extension/src/background/`
**When to run**: After changes to boot sequence, db-manager, or persistence layer

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 12.1 | Cold start | Install extension fresh | Service worker boots, SQLite WASM loads, databases created | ☐ |
| 12.2 | OPFS persistence | Check console after boot | `[db-manager] OPFS persistence active` logged | ☐ |
| 12.3 | OPFS fallback → storage | Block OPFS (e.g., incognito) | Falls back to `chrome.storage.local`, logged | ☐ |
| 12.4 | Memory fallback | Block both OPFS and storage | Falls back to in-memory, logged | ☐ |
| 12.5 | Session created | Check logs.db after boot | New session row with UUID, timestamp, version | ☐ |
| 12.6 | Schema migration | Upgrade extension version with new schema | Migration runs, version persisted, no data loss | ☐ |
| 12.7 | Message buffer during boot | Send messages before boot completes | Messages buffered and processed after initialization | ☐ |
| 12.8 | No dynamic imports | Run `npm run build:extension` | Post-build scan passes (no `import()` in background) | ☐ |

---

## Suite 13: Chrome Extension — Message Protocol

**Files**: `chrome-extension/src/background/message-registry.ts`, `message-router.ts`
**When to run**: After adding/modifying message types or handlers

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 13.1 | All handlers registered | Count entries in `HANDLER_REGISTRY` | Matches total non-broadcast `MessageType` enum values | ☐ |
| 13.2 | GET_STATUS response | Send `GET_STATUS` from popup | Returns connection, token, config, version, boot timings | ☐ |
| 13.3 | GET_HEALTH_STATUS | Send `GET_HEALTH_STATUS` | Returns HEALTHY/DEGRADED/ERROR/FATAL + details array | ☐ |
| 13.4 | LOG_ENTRY insert | Send `LOG_ENTRY` | Row inserted into logs.db, dirty flag set | ☐ |
| 13.5 | LOG_ERROR insert | Send `LOG_ERROR` | Row inserted into errors.db | ☐ |
| 13.6 | Unknown message type | Send message with invalid type | Error response, no crash | ☐ |
| 13.7 | Broadcast types | Send `TOKEN_EXPIRED` | No handler invoked, message forwarded to listeners | ☐ |

---

## Suite 14: Chrome Extension — Project & Script CRUD

**Files**: `chrome-extension/src/background/handlers/project-handler.ts`, `script-config-handler.ts`
**When to run**: After changes to project/script storage or CRUD operations

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 14.1 | Create project | Save new project with name + URL rules | Project stored with UUID, timestamps | ☐ |
| 14.2 | List projects | Call GET_ALL_PROJECTS | Returns all projects with correct schema | ☐ |
| 14.3 | Update project | Modify project name, save | `updatedAt` timestamp changes | ☐ |
| 14.4 | Delete project | Delete a project | Removed from storage, scripts/configs remain | ☐ |
| 14.5 | Duplicate project | Duplicate a project | New UUID, same data, name prefixed with "Copy of" | ☐ |
| 14.6 | Save script | Upload a .js file | Stored with UUID, fileName, content | ☐ |
| 14.7 | Toggle script | Disable/enable a script | `enabled` field toggles | ☐ |
| 14.8 | Save config | Upload a .json config | Stored with UUID, fileName, parsed content | ☐ |
| 14.9 | Delete script/config | Delete script or config | Removed from storage | ☐ |

---

## Suite 15: Chrome Extension — Script Injection

**Files**: `chrome-extension/src/background/handlers/injection-handler.ts`, `injection-wrapper.ts`
**When to run**: After changes to injection pipeline, URL matching, or script execution

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 15.1 | URL exact match | Navigate to exact URL in rule | Scripts injected | ☐ |
| 15.2 | URL prefix match | Navigate to URL with matching prefix | Scripts injected | ☐ |
| 15.3 | URL regex match | Navigate to URL matching regex pattern | Scripts injected | ☐ |
| 15.4 | No match | Navigate to unmatched URL | No injection occurs | ☐ |
| 15.5 | Priority ordering | Multiple rules match | Higher priority rule's scripts run first | ☐ |
| 15.6 | ISOLATED world | Script with ISOLATED world | Executes in isolated context | ☐ |
| 15.7 | MAIN world | Script with MAIN world | Executes in page context, can access `window` | ☐ |
| 15.8 | User script error capture | Inject script with intentional error | Error captured in errors.db with line/column | ☐ |
| 15.9 | Config injection | Script with config binding | Config variables available before script runs | ☐ |
| 15.10 | CSP fallback | Page with strict CSP blocks MAIN | Falls back to ISOLATED world, DEGRADED health | ☐ |

---

## Suite 16: Chrome Extension — Logging & Export

**Files**: `chrome-extension/src/background/handlers/logging-handler.ts`, `logging-export-handler.ts`
**When to run**: After changes to logging, export, or data browser

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 16.1 | Log entry persists | Perform actions, restart extension | Logs survive restart (OPFS/storage persistence) | ☐ |
| 16.2 | Session logs | Call GET_SESSION_LOGS | Returns all logs/errors for current session | ☐ |
| 16.3 | Fallback on empty session | New session with no logs | Returns last 200 entries from persistent DB | ☐ |
| 16.4 | Export JSON | Click Export JSON | Downloads JSON file with all log entries | ☐ |
| 16.5 | Export ZIP | Click Export ZIP | Downloads ZIP with logs.db, errors.db, metadata.json | ☐ |
| 16.6 | Purge old logs | Purge logs older than 7 days | Old entries deleted, recent entries preserved | ☐ |
| 16.7 | Data Browser pagination | Browse logs in Options page | Paginated table with prev/next, correct total count | ☐ |
| 16.8 | Data Browser — log detail | Click a log row | Detail view shows all fields including metadata | ☐ |
| 16.9 | Storage stats | View storage stats card | Shows persistence mode, log count, error count, DB sizes | ☐ |

---

## Suite 17: Chrome Extension — User Script Logging (Spec 42)

**Files**: `user-script-log-handler.ts`, `marco-sdk-template.ts`
**When to run**: After changes to SDK template, user-script logging, or message types

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 17.1 | SDK injected | Inject user script into page | `window.marco` exists and is frozen | ☐ |
| 17.2 | marco.log.info | Call `marco.log.info("test")` | Row in logs.db with level=INFO, source=user-script | ☐ |
| 17.3 | marco.log.error | Call `marco.log.error("fail")` | Row in logs.db AND errors.db with code=USER_SCRIPT_LOG_ERROR | ☐ |
| 17.4 | marco.log.warn | Call `marco.log.warn("caution")` | Row in logs.db with level=WARN | ☐ |
| 17.5 | marco.log.debug | Call `marco.log.debug("trace")` | Row in logs.db with level=DEBUG | ☐ |
| 17.6 | marco.log.write | Call with custom category/action | Row has user-specified category and action | ☐ |
| 17.7 | Context auto-injection | Log from user script | Row has correct projectId, scriptId, configId, urlRuleId | ☐ |
| 17.8 | Metadata redaction | Pass `{token: "secret123abc"}` as metadata | Stored as `"secret12...REDACTED"` | ☐ |
| 17.9 | Rate limiting | Send >100 messages in 1 second | Excess silently dropped, no crash | ☐ |
| 17.10 | SDK not duplicated | Multiple scripts on same page | `window.marco` created once (first script), subsequent scripts reuse it | ☐ |

---

## Suite 18: Chrome Extension — Data Bridge (Spec 42)

**Files**: `data-bridge-handler.ts`, `marco-sdk-template.ts`
**When to run**: After changes to data bridge handler or SDK store methods

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 18.1 | store.set + store.get | `await marco.store.set("k", "v")` then `await marco.store.get("k")` | Returns `"v"` | ☐ |
| 18.2 | store.delete | Set then delete a key | `get` returns `undefined` after delete | ☐ |
| 18.3 | store.keys | Set 3 keys | `keys()` returns array of 3 stripped key names | ☐ |
| 18.4 | store.getAll | Set 3 keys | `getAll()` returns object with 3 entries | ☐ |
| 18.5 | store.clear | Set keys then clear | `keys()` returns empty array | ☐ |
| 18.6 | Project isolation | Set key in Project A, read from Project B | Project B gets `undefined` (different namespace prefix) | ☐ |
| 18.7 | Global store — cross-project | `setGlobal("x", 1)` in Project A, `getGlobal("x")` in Project B | Project B gets `1` | ☐ |
| 18.8 | Key too long | Set key with 257 characters | Returns `{ isOk: false, errorMessage: "..." }` | ☐ |
| 18.9 | Value too large | Set value >1 MB | Returns `{ isOk: false, errorMessage: "..." }` | ☐ |
| 18.10 | Max keys per project | Set 1001 keys for same project | 1001st returns error | ☐ |
| 18.11 | JSON serialization | Set value with `Date`, `undefined`, functions | Only JSON-serializable parts stored | ☐ |
| 18.12 | Persistence | Set data, restart extension | Data survives restart (chrome.storage.local) | ☐ |

---

## Suite 19: Chrome Extension — Popup & Options UI

**Files**: `chrome-extension/src/popup/`, `chrome-extension/src/options/`
**When to run**: After changes to popup, options page, or UI components

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 19.1 | Popup opens | Click extension icon | Popup renders with header, status, action buttons | ☐ |
| 19.2 | Status bar | Open popup | Shows connection status, latency, sync indicator | ☐ |
| 19.3 | Run button | Click Run in popup | Triggers script injection on active tab | ☐ |
| 19.4 | Re-inject button | Click Re-inject | Forces re-injection even if scripts already present | ☐ |
| 19.5 | Logs button | Click Logs | Shows session log report (copyable) | ☐ |
| 19.6 | Export button | Click Export | Triggers ZIP or JSON download | ☐ |
| 19.7 | Debug panel | Open debug section | Shows raw background responses and errors | ☐ |
| 19.8 | Action status panel | Perform actions | Color-coded activity log (last 8 entries) | ☐ |
| 19.9 | Options page loads | Open options page | All tabs render: Projects, Scripts, Data Browser, Config | ☐ |
| 19.10 | XPath recorder | Toggle recorder on | Ctrl+Shift+R activates hover-highlighting overlay | ☐ |

---

## Suite 20: Chrome Extension — Backup & Restore

**Files**: `chrome-extension/src/background/handlers/project-export-handler.ts`
**When to run**: After changes to backup, export, or import logic

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 20.1 | Bulk export | Click "Export All" | Downloads `marco-backup.zip` with all projects, scripts, configs | ☐ |
| 20.2 | Single project export | Click export on project card | Downloads `{name}-backup.zip` with project + associated scripts/configs | ☐ |
| 20.3 | Import — merge | Import a backup with "Merge" | New items added, existing items preserved | ☐ |
| 20.4 | Import — replace | Import a backup with "Replace All" | All existing data replaced with backup contents | ☐ |
| 20.5 | Bundle preview | Select import file | Preview dialog shows item counts before applying | ☐ |
| 20.6 | Import invalid file | Import a non-ZIP or corrupt file | Error shown, no data modified | ☐ |

---

## Suite 21: Cross-File Sync Verification

**Purpose**: Ensure parallel implementations stay in sync
**When to run**: After any change to files listed below

| # | Check | Files | Pass? |
|---|-------|-------|-------|
| 21.1 | Check button onclick identical | `macro-looping.js` vs `01-script-direct-copy-paste.js` | ☐ |
| 21.2 | Force Move cooldown identical | `macro-looping.js` vs `01-script-direct-copy-paste.js` | ☐ |
| 21.3 | Auth panel controls identical | `macro-controller.js` vs `default-scripts-seeder.ts` | ☐ |
| 21.4 | 🔓 Auth reopen button present | Both `macro-looping.js` and `01-script-direct-copy-paste.js` | ☐ |
| 21.5 | Standalone ↔ AHK macro-looping.js | `standalone-scripts/` vs `marco-script-ahk-v7.latest/` | ☐ |

---

## Suite 22: Fetch Logging Standard

**Purpose**: Verify all API calls follow the comprehensive logging standard (Plan 08)
**When to run**: After adding new fetch calls or modifying existing ones

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 22.1 | Before-request log | Every fetch logs: URL, auth method, sanitized token, headers, body | ☐ |
| 22.2 | After-response log | Every fetch logs: status, statusText, Content-Type, Content-Length, body preview | ☐ |
| 22.3 | No bare `resp.json()` | All responses use `resp.text()` + `JSON.parse()` | ☐ |
| 22.4 | Bearer token redacted | Token logged as first 12 chars + `...REDACTED` | ☐ |
| 22.5 | Error body logged | Non-2xx responses log first 500 chars of body | ☐ |

---

## Appendix A: Priority Classification

| Priority | Suites | Rationale |
|----------|--------|-----------|
| **P0 — Must pass** | 1, 2, 3, 4, 7, 8, 9, 12, 13, 15 | Core functionality, data integrity, auth |
| **P1 — Should pass** | 5, 6, 10, 11, 14, 16, 17, 18, 21, 22 | UI features, advanced operations |
| **P2 — Nice to pass** | 19, 20 | UI polish, backup/restore |

---

## Appendix B: Automated vs Manual

| Approach | Suites | Tool |
|----------|--------|------|
| **Vitest unit tests** | 13, 14, 17, 18 | `vitest` in `chrome-extension/` |
| **Playwright E2E** | 12, 15, 19, 20 | `playwright` with `--load-extension` |
| **Manual verification** | 1–11, 16, 21, 22 | Human tester with checklist |

---

## Appendix C: Related Documents

| Document | Purpose |
|----------|---------|
| `spec/02-app-issues/33-regression-checklist-check-button-auth-panel.md` | Detailed regression checklist for Check/Force Move/Auth Panel |
| `spec/07-chrome-extension/11-testing-strategy.md` | Chrome extension testing strategy |
| `spec/07-chrome-extension/42-user-script-logging-and-data-bridge.md` | Spec 42 — User Script Logging & Data Bridge |
| `.lovable/memory/testing/chrome-extension-e2e-specification` | E2E test specification (20 flows) |
| `.lovable/memory/testing/chrome-extension-smoke-test` | Smoke test for build validation |
