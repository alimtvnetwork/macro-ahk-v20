# Automator v7.9.1 - Technical Specification

## Architecture

```
User Hotkey --> AHK v2 --> Fast Path Check --> __comboSwitch exists?
                               |                    |
                               |YES                 |NO (page refreshed)
                               v                    v
                          Direct call         sessionStorage cache?
                    window.__comboSwitch()         |         |
                          (~35 chars)            YES        NO
                               |                  |          |
                               v                  v          v
                             DONE           eval() cache   Full 40K inject
                                           (~200 chars)   (disk read + paste)
                                                |              |
                                                v              v
                                              DONE          Embed + Run
```

## Design Principles

1. **Single Embedded Script**: One `combo.js` embeds itself, no repeated injections
2. **Fast Path**: If already embedded, skip full injection -- just call `window.__comboSwitch()`
3. **Configurable Everything**: All IDs, XPaths, timings in `config.ini`
4. **No Prompts/Alerts**: console.error only, with error codes
5. **DevTools Once**: Open DevTools once for initial embed, then use fast path
6. **Error Codes**: Every error has unique E00X code for debugging
7. **JS Executor Textbox**: Visible textarea for running arbitrary JS (Ctrl+/, Ctrl+Enter)
8. **Status Display**: Live display of current project, direction, and targets
9. **History Panel**: Last 5 combo actions with timestamps
10. **ASCII-safe JS**: No Unicode chars in code strings (clipboard encoding safety)

## Modules

| Module | Purpose |
|--------|---------|
| Config.ahk | Orchestrator — includes all Config/ submodules, provides `LoadConfig()` |
| Config/ConfigUtils.ahk | `IniReadInt()`, `LoadElementDescriptor()` helpers |
| Config/Hotkeys.ahk | `LoadHotkeys()` — [Hotkeys] section |
| Config/ComboSwitch.ahk | `LoadComboSwitch()` — [ComboSwitch.*] sections |
| Config/MacroLoop.ahk | `LoadMacroLoop()` — [MacroLoop.*] sections |
| Config/CreditStatus.ahk | `LoadCreditStatus()` — [CreditStatus.*] sections |
| Config/AhkTiming.ahk | `LoadAhkTiming()` — [AHK.Timing] section |
| Config/Gmail.ahk | `LoadGmail()` — [Gmail] section |
| Config/General.ahk | `LoadGeneral()` — [General] section |
| Config/Validate.ahk | `ValidateConfig()` — startup key validation |
| Config/Watcher.ahk | `StartConfigWatcher()`, `StopConfigWatcher()` — hot-reload |
| JsInject.ahk | DevTools management + paste injection |
| Combo.ahk | `RunCombo(direction)` - fast path check + embed/click |
| MacroLoop.ahk | `ToggleMacroLoop(direction)` - loop automation + clipboard delegation |
| AutoLoop.ahk | `ToggleAutoLoop(direction)` - cycle automation |
| Gmail.ahk | `RunGmail()` - Gmail search |
| HotkeyFormat.ahk | `FormatHotkeyLabel()` - readable labels |

## Fast Path (Combo.ahk) — Three-Tier Recovery

```
RunCombo(direction)
    |
    |-- scriptEmbedded == true?
    |     YES -> Inject check: typeof window.__comboSwitch === 'function'?
    |              |
    |              |-- EXISTS -> Call it directly (~35 chars). DONE.
    |              |
    |              |-- MISSING (page refreshed) ->
    |                    |
    |                    |-- Tier 2: sessionStorage recovery
    |                    |     Inject: eval(sessionStorage.getItem('__combo_src__'))
    |                    |     with window.__comboRecoverDirection = direction
    |                    |     (~200 chars, restores full UI + functions from cache)
    |                    |
    |                    |-- Cache hit? -> DONE (title marker: __AHK_RECOVERED__)
    |                    |
    |                    |-- Cache miss? -> Tier 3: Full 40K injection from disk
    |                    |     Reset scriptEmbedded + devToolsOpened to false
    |                    |     Fall through to full injection path
    |
    |     NO  -> Full 40K combo.js injection from disk
    |           -> Set scriptEmbedded := true
```

### Self-Healing After Page Refresh

**Problem**: After a page refresh, the injected JS is lost but the AHK `scriptEmbedded`
flag is still `true`. The fast path would call `window.__comboSwitch()` on a function
that no longer exists, causing errors and broken shortcuts.

**Solution**: Three-tier detection and recovery:

1. **Title-marker signal**: The fast path injects a check that calls `__comboSwitch` if
   it exists, or writes `__AHK_REINJECT__` into `document.title` if not. AHK reads the
   browser title via `WinGetTitle` to detect which case occurred.

2. **sessionStorage cache**: On first injection, combo.js stores its full compiled source
   via `arguments.callee.toString()` into `sessionStorage['__combo_src__']`. On recovery,
   AHK injects ~200 chars that `eval()` the cached source with
   `window.__comboRecoverDirection` set to the correct direction. This avoids the 40KB
   clipboard paste entirely.

3. **Full re-injection**: If sessionStorage is empty (e.g., first session, or storage
   cleared), AHK resets both flags and falls through to the full disk-read injection path.

**`'use strict'` removal**: The outer IIFE does not use strict mode because
`arguments.callee.toString()` is needed for the sessionStorage caching. Inner functions
remain safe since they don't rely on strict-mode-specific behavior.

**Why AHK flag + title signal**: Simple and reliable. AHK tracks embed state internally,
and `document.title` is the only synchronous signaling channel from JS back to AHK
(no browser IPC or WebSocket needed).

## DevTools & Injection (JsInject.ahk)

### InjectViaDevTools(js) — Full Injection

```autohotkey
InjectViaDevTools(js) {
    ; First call:  Ctrl+Shift+J (open DevTools Console), wait consoleOpenDelayMs
    ; Subsequent:  F12 (close) → ClickPageContent() → Ctrl+Shift+J (reopen on Console)
    ;              v7.9.1: ClickPageContent anchors execution context to the PAGE
    ;              by clicking in the upper 1/3 of the browser window (avoiding
    ;              bottom-docked DevTools) + WinActivate to re-anchor focus.
    ; Then:        Ctrl+V (paste), Enter (execute)
    ; Uses global devToolsOpened flag to track state
    ; Browser window MUST be active
    ; Clipboard temporarily overwritten with JS code
}
```

**Key**: DevTools opens ONCE via `Ctrl+Shift+J`. Subsequent calls use F12 close →
ClickPageContent (upper 1/3 click + WinActivate) → Ctrl+Shift+J reopen to guarantee
Console targets the page document, not the DevTools frame.

### ClickPageContent() — Execution Context Anchoring (v7.9.1)

```autohotkey
ClickPageContent() {
    ; Clicks at upper 1/3 of browser window (below tabs, above bottom-docked DevTools)
    ; Then WinActivate to re-anchor focus to page document
    ; centerY = winY + Max(100, winH // 3)  ← safe zone
    ; Configurable delay via PageClickDelayMs in [AHK.Timing] (default 100ms)
    ;
    ; WHY upper 1/3: Previous implementation (v7.9.0) clicked at lower 2/3 (winH * 2 // 3),
    ; which landed ON bottom-docked DevTools, making DevTools the active execution context.
    ; This caused scripts to execute in hostname=devtools instead of the page.
}
```

### InjectJSQuick(js) — Lightweight Injection (v7.8)

```autohotkey
InjectJSQuick(js) {
    ; NO F12, NO Ctrl+Shift+J — Console is already focused
    ; Only: save clipboard → set clipboard → Ctrl+V → Enter → restore clipboard
    ; MUST be called after at least one InjectJS() in the same batch
}
```

**Purpose**: Eliminates the F12/Ctrl+Shift+J toggle cycle for consecutive injections
within the same batch. Used when Console is already focused from a preceding `InjectJS()`.
Saves ~1 second per call vs full `InjectJS()`.

**Constraint**: Caller must ensure Console is focused. Only safe immediately after
`InjectJS()` or another `InjectJSQuick()` in the same execution flow.

### Console Focus Management

**v6.2-v7.4**: Close-reopen strategy (`F12` close → `Ctrl+Shift+J` reopen) — reliable
but slow (~1 second per subsequent injection).

**v7.5-v7.7**: Direct re-focus strategy (`Ctrl+Shift+J` alone) — faster but fragile;
rapid consecutive calls caused Chrome to lose page context.

**v7.8**: Hybrid strategy:
- `InjectJS()` uses F12 close/reopen for reliable focus (subsequent calls)
- `InjectJSQuick()` skips DevTools toggling entirely for batch calls
- Net result: faster than v7.5 for multi-injection flows (3 calls instead of 6)

**v7.9.1**: Execution context anchoring:
- After F12 close, `ClickPageContent()` clicks in the upper 1/3 of the browser window
  (below tab bar, above any bottom-docked DevTools panel) + `WinActivate` to re-anchor focus
- Prevents scripts from executing in `hostname=devtools` context
- Configurable via `PageClickDelayMs` in `[AHK.Timing]` (default 100ms)

**User Requirements:**
1. **Keep DevTools open**: After the first injection opens it, leave it open
2. **Never close it manually**: Script assumes DevTools stays open for subsequent calls
3. **If closed accidentally**: Restart AHK or call `ResetDevToolsState()` to re-trigger open

## Error Codes (combo.js)

| Code | Description | When |
|------|-------------|------|
| E001 | Script already embedded | Duplicate injection attempt |
| E002 | Transfer button not found | Step 1 fails |
| E003 | Combo 1 text not found | Step 2 timeout |
| E004 | Combo 2 button not found | Step 3 timeout |
| E005 | Dropdown did not open | Step 4 timeout |
| E006 | Options container not found | Step 5 timeout |
| E007 | Current project not in options | Step 6 match fails |
| E008 | Confirm button not found | Step 8 timeout |
| E009 | Parent element not found | UI creation fails |
| E010 | Invalid XPath | XPath syntax error |
| E011 | JS Executor textbox not found | executeJsFromTextbox() fails |

## Config.ini Structure

Config uses dot-notation subsections for logical grouping (`[Module.Group]`).
Each module loader reads from its own subsections.

### [ComboSwitch.XPaths]
```ini
TransferButtonXPath=/html/body/...
Combo1XPath=/html/body/...
Combo2ButtonXPath=/html/body/...
OptionsContainerXPath=/html/body/...
ConfirmButtonXPath=/html/body/...
```

### [ComboSwitch.Transfer] / [ComboSwitch.Combo1] / etc.
```ini
; Per-element fallback descriptors (pipe-separated)
TextMatch=Transfer|Transfer project
Tag=button
Selector=
AriaLabel=Transfer
HeadingSearch=transfer
Role=
```

### [ComboSwitch.Timing]
```ini
PollIntervalMs=300
OpenMaxAttempts=20
WaitMaxAttempts=20
RetryCount=2
RetryDelayMs=1000
ConfirmDelayMs=500
```

### [ComboSwitch.ElementIDs]
```ini
ScriptMarkerId=ahk-combo-script
ButtonContainerId=ahk-combo-btn-container
ButtonUpId=ahk-combo-up-btn
ButtonDownId=ahk-combo-down-btn
JsExecutorId=ahk-js-executor
JsExecuteBtnId=ahk-js-execute-btn
```

### [ComboSwitch.Shortcuts]
```ini
FocusTextboxKey=/
ComboUpKey=ArrowUp
ComboDownKey=ArrowDown
ShortcutModifier=none
```

### [MacroLoop.Timing] / [MacroLoop.URLs] / [MacroLoop.XPaths] / [MacroLoop.ElementIDs] / [MacroLoop.Shortcuts]
```ini
; Timing, URLs, XPaths, element IDs, and shortcuts each in their own subsection
LoopIntervalMs=50000
RequiredDomain=https://lovable.dev/
SettingsTabPath=/settings?tab=project
```

### [CreditStatus.API] / [CreditStatus.Timing] / [CreditStatus.Retry] / [CreditStatus.XPaths] / [CreditStatus.ElementIDs]
```ini
LovableApiBaseUrl=https://api.lovable.dev
LovableAuthMode=cookieSession
AutoCheckEnabled=1
MaxRetries=2
```

### [AHK.Timing]
```ini
ConsoleOpenDelayMs=800
PasteDelayMs=200
ExecuteDelayMs=300
```

### Config Module Architecture
```
Config.ahk (orchestrator)
  |-- #Include Config/ConfigUtils.ahk   (IniReadInt, LoadElementDescriptor)
  |-- #Include Config/Hotkeys.ahk       (LoadHotkeys)
  |-- #Include Config/ComboSwitch.ahk   (LoadComboSwitch)
  |-- #Include Config/MacroLoop.ahk     (LoadMacroLoop)
  |-- #Include Config/CreditStatus.ahk  (LoadCreditStatus)
  |-- #Include Config/AhkTiming.ahk     (LoadAhkTiming)
  |-- #Include Config/Gmail.ahk         (LoadGmail)
  |-- #Include Config/General.ahk       (LoadGeneral)
  |-- #Include Config/Validate.ahk      (ValidateConfig)
  |-- #Include Config/Watcher.ahk       (StartConfigWatcher, StopConfigWatcher)
  |
  +-- LoadConfig()  →  calls all Load*() functions + ValidateConfig()
```

## ComboSwitch Flow

```
RunCombo(direction)
    |
    +-- FAST PATH: scriptEmbedded == true?
    |     YES -> Inject check: typeof window.__comboSwitch === 'function'?
    |              |-- EXISTS -> Call it directly. DONE.
    |              |-- MISSING -> sessionStorage recovery or full re-inject
    |     NO  -> continue to full injection
    |
    +-- FULL PATH (3-call flow, v7.8):
          |
          |-- 1. InjectJS(domCheckSnippet)          ← full DevTools open
          |       Self-cleaning: setTimeout resets title after 2000ms
          |
          |-- 2. InjectJSQuick(xpathCheckSnippet)   ← paste-only (Console focused)
          |       Self-cleaning: setTimeout resets title after 2000ms
          |
          |-- 3. InjectJSQuick(combo.js)             ← paste-only (Console focused)
          |       combo.js has domain guard + idempotent init
          |
          +-- Set scriptEmbedded := true
```

**v7.8 optimization**: Reduced from 6 `InjectJS()` calls to 3 (1 full + 2 quick).
Self-cleaning title markers eliminated separate cleanup injection calls.

## combo.js Embedded Script

### Placeholders (replaced by AHK)

| Placeholder | Config Key |
|-------------|------------|
| `__DIRECTION__` | *(runtime)* direction passed to `RunCombo()` |
| `__SCRIPT_VERSION__` | ScriptVersion |
| `__SCRIPT_MARKER_ID__` | ScriptMarkerId |
| `__BUTTON_CONTAINER_ID__` | ButtonContainerId |
| `__BUTTON_UP_ID__` | ButtonUpId |
| `__BUTTON_DOWN_ID__` | ButtonDownId |
| `__JS_EXECUTOR_ID__` | JsExecutorId |
| `__JS_EXECUTE_BTN_ID__` | JsExecuteBtnId |
| `__TRANSFER_XPATH__` | TransferButtonXPath |
| `__COMBO1_XPATH__` | Combo1XPath |
| `__COMBO2_XPATH__` | Combo2ButtonXPath |
| `__OPTIONS_XPATH__` | OptionsContainerXPath |
| `__CONFIRM_XPATH__` | ConfirmButtonXPath |
| `__COMBO_POLL_INTERVAL_MS__` | ComboPollIntervalMs |
| `__COMBO_OPEN_MAX_ATTEMPTS__` | ComboOpenMaxAttempts |
| `__COMBO_WAIT_MAX_ATTEMPTS__` | ComboWaitMaxAttempts |
| `__COMBO_RETRY_COUNT__` | ComboRetryCount |
| `__COMBO_RETRY_DELAY_MS__` | ComboRetryDelayMs |
| `__COMBO_CONFIRM_DELAY_MS__` | ComboConfirmDelayMs |

### Lifecycle

1. **Domain guard** (v7.8): Validate `window.location.hostname` against allowed domains (`lovable.dev`, `localhost`, etc.). If mismatch, log cause and abort immediately. Prevents execution in DevTools context.
2. **Idempotent init** (v7.8): Check `document.getElementById(SCRIPT_ID)` → if exists, **return immediately** without teardown. Preserves in-memory state (loop status, credit history, UI position).
3. Define helper functions: findElement (5-method fallback), pollForElement, logging
4. Define `runComboSwitch(direction)` with 8 steps
5. Define `executeJsFromTextbox()` for JS executor
6. Define `updateStatusDisplay()` for live status
7. Define `addHistoryEntry()` + `renderHistory()` for action log
8. Define `flashStatus()` for success animation
9. Define `createControllerUI()` for full panel
10. Expose `window.__comboSwitch = runComboSwitch`
11. Expose `window.__executeJs = executeJsFromTextbox`
12. Create hidden marker div with SCRIPT_ID
13. Call `createControllerUI()` to add UI elements
14. Install MutationObserver for SPA persistence

### UI Elements Created

```
+---------------------------------------------+
| ComboSwitch v7.5              [ - ] [ x ]   |  <- Header (draggable)
+---------------------------------------------+
| 🔗 Project: abc12345                        |  <- Project name from URL
|                                              |
| 📍 WorkspaceName                            |  <- NOW section
| 💰 2063/13500  📅 82/840  🎁 15 free       |  <- Current ws credits
|                                              |
| NOW: WorkspaceName | ↑ PrevWs · ↓ NextWs   |  <- Status display
|                                              |
| 💰 2063/13500 | Daily: 82/840              |  <- Credit display
| ✅ Free: Available  🎁 45 free remaining    |
| ⏱ Last: 16:37:05 (api)                     |
|                                              |
| [Up]  [Down]  [Status]                       |  <- Buttons
| Ctrl+Alt+Up / Down / Ctrl+Alt+S / M (Move)  |
|                                              |
| 🏢 Workspaces          [📍 Focus Current]   |  <- Workspace section
| 🔍 Search workspaces...                     |  <- Search input (↑↓ nav, Enter=move)
| +------------------------------------------+|
| |📍 P84 D1v24  ███░░ 84/100  📅 5/10      ||  <- Current (cyan highlight)
| |   🎁 15 free                    CURRENT  ||
| |🟢 P96 D1v36  ██░░░ 24/100  📅 2/10      ||  <- Normal items
| |   🎁 0 free                              ||
| |🟡 P97 D1v37  █░░░░ 16/100  📅 1/10      ||
| |🔴 P98 D1v38  █████ 97/100  📅 9/10      ||
| +------------------------------------------+|
| ✅ P84 D1v24                                |  <- Selected indicator
| [🚀 Move Project (Ctrl+Alt+M)]              |  <- Move button (no confirm)
| Moving to P96 D1v36...                       |  <- Move status
|                                              |
| ▶ Bearer Token 🔑 (saved, 142 chars)        |  <- Collapsed if saved
|                                              |
| JS Executor (Ctrl+/ to focus, Ctrl+Enter)    |
| +----------------------------------+ [Run]   |
| | Enter JavaScript code here...    |         |
| +----------------------------------+         |
|                                              |
| Recent Actions / JS History / Logs / XPath   |  <- Utilities
+---------------------------------------------+
```

### Controller Features

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Combo Up | Ctrl+Alt+Up | Switch to previous project (settings page only) |
| Combo Down | Ctrl+Alt+Down | Switch to next project (settings page only) |
| **Credit Status** | **Ctrl+Alt+S** | **Check credits (API fetch)** |
| **Move Project** | **Ctrl+Alt+M** | **Move to selected workspace (no confirm)** |
| JS Focus | Ctrl+/ | Focus the JS executor textbox |
| JS Execute | Ctrl+Enter | Run code in the textbox |
| **WS Navigate** | **ArrowUp/Down** | **Select workspace in dropdown (in search input)** |
| **WS Move** | **Enter** | **Move to selected workspace (in search input)** |
| **JS History Up** | **ArrowUp** | **Recall previous command (single-line mode)** |
| **JS History Down** | **ArrowDown** | **Recall next command (single-line mode)** |
| Toggle Hide | Ctrl+Alt+H | Show/hide the panel |
| Drag | Mouse drag header | Float panel, reposition anywhere |
| Minimize | Click header | Toggle minimize/expand |

### ComboSwitch 8 Steps

| Step | Action | Error Code |
|------|--------|------------|
| 1 | Click Transfer button | E002 |
| 2 | Wait for Combo 1 text (current project) | E003 |
| 3 | Click Combo 2 button (dropdown) | E004 |
| 4 | Wait for dropdown open | E005 |
| 5 | Get options from container | E006 |
| 6 | Find current project index | E007 |
| 7 | Calculate & click target + update status | - |
| 7b | Wait ComboConfirmDelayMs (configurable) | - |
| 8 | Click Confirm button + flash + add history | E008 |

### Element Finding (5-Method Fallback)

```
findElement(descriptor)
    |-- Method 1: Configured XPath
    |-- Method 2: Text-based scan (tag + textMatch)
    |-- Method 3: CSS selector(s)
    |-- Method 4: ARIA/role attributes
    |-- Method 5: Heading proximity search
```

### Auto-Retry (S-005) — ComboSwitch

On any step failure, retries up to `ComboRetryCount` times with `ComboRetryDelayMs` delay.
Retry state resets on successful combo completion.

### Unified Layout (v7.5.1 — Mode Toggle Removed)

The Sequential/Direct mode toggle was removed in v7.5.1. Both navigation buttons (Up/Down/Status) and the workspace management section (searchable dropdown + Move button) are **always visible** in a single unified layout. This eliminates the extra click previously required to switch between modes.

### Searchable Workspace Dropdown (v7.5.1)

Replaced the native `<select>` with a custom searchable dropdown:

| Feature | Implementation |
|---------|---------------|
| **Search** | Real-time filtering via `oninput` on search input |
| **Emojis** | 📍 current, 🟢/🟡/🔴 usage, 🎁 free credits, 📅 daily |
| **Progress bar** | Color-coded (green/yellow/red), 5px height, min-width 60px |
| **Current highlight** | Cyan left border, larger bold font, CURRENT badge |
| **Focus Current** | `📍 Focus Current` button scrolls to current workspace |
| **Auto-scroll** | On load and data refresh, scrolls to current workspace |
| **Keyboard nav** | Arrow Up/Down selects, Enter moves (no confirm dialog) |
| **Free credits** | Per-workspace `🎁 N free` or `🎁 0 free` |

### Per-Workspace Data (v7.5.1)

`parseApiResponse()` now stores enriched data per workspace:

```javascript
perWs.push({
  id: wsId,
  name: shortName,          // truncated to 12 chars
  fullName: ws.name,         // full name
  used: Math.round(bUsed),   // billing period used (integer)
  limit: Math.round(bLimit), // billing period limit (integer)
  dailyUsed: Math.round(dUsed),
  dailyLimit: Math.round(dLimit),
  freeGranted: Math.round(freeGranted),
  freeRemaining: freeRemaining,  // max(0, granted - used)
  hasFree: wsHasFree             // boolean
});
```

### Direct Workspace Move API (v7.5)

```
moveToWorkspace(targetWorkspaceId, targetWorkspaceName)
    |-- Extract projectId from URL path (/projects/{uuid})
    |-- Resolve bearer token: config > localStorage > none
    |-- Guard: abort if no projectId or no token
    |
    |-- PUT https://api.lovable.dev/projects/{projectId}/move-to-workspace
    |     Headers:
    |       Authorization: Bearer {resolvedToken}
    |       Content-Type: application/json
    |     Body: { workspace_id: targetWorkspaceId }
    |     Credentials: include
    |
    |-- On success (2xx):
    |     Update #ahk-move-status → green "Moved to {name}"
    |     Add history entry (direction='move', arrow='⇒')
    |     Refresh credit status after 2s delay
    |
    |-- On failure:
    |     Update #ahk-move-status → red "HTTP {status}: {body preview}"
    |     Log full response body (up to 500 chars)
```

**Exposed as:** `window.__moveToWorkspace(workspaceId, workspaceName)`

### Workspace Dropdown Population (v7.5.1)

`populateWorkspaceDropdown()` builds a custom searchable dropdown from `creditState.perWorkspace`:

| Item State | Visual | Behavior |
|-----------|--------|----------|
| Current workspace | 📍 emoji, cyan text, CURRENT badge, cyan left border | Not moveable, auto-scrolled to |
| Low usage (<60%) | 🟢 emoji, green progress bar | Click to select, Enter to move |
| Medium usage (60-90%) | 🟡 emoji, yellow progress bar | Click to select, Enter to move |
| High usage (>90%) | 🔴 emoji, red progress bar | Click to select, Enter to move |

Current workspace detected by matching `fullName` against `window.__wsCurrentName` (set by `updateStatusDisplay()` and `updateCreditDisplay()`).
| Other workspaces | `WorkspaceName (used/limit)` | Yes |

Current workspace is detected by matching `fullName` against the "NOW:" label in `#ahk-combo-status`.

### API Response JSON Schema — `/user/workspaces` (v7.5.2)

The Lovable API returns workspace data in this shape. This schema is the source of truth for all credit/workspace display logic in the controller.

```json
{
  "workspaces": [
    {
      "id": "string (workspace UUID)",
      "name": "string (workspace display name, e.g. 'P01 D2v2 Orinmax\\'s Lovable v2')",
      "owner_id": "string (user UUID)",
      "created_at": "ISO 8601 timestamp",
      "updated_at": "ISO 8601 timestamp",
      "plan": "string (e.g. 'pro_1')",
      "plan_type": "string (e.g. 'monthly')",
      "rollover_credits_used": "number",
      "rollover_credits_limit": "number",
      "last_rollover_period": "string|null",
      "last_trial_credit_period": "string|null (e.g. '2026-02')",
      "credits_used": "number (free credits consumed)",
      "credits_granted": "number (free credits allocated)",
      "daily_credits_used": "number",
      "daily_credits_limit": "number",
      "billing_period_credits_used": "number",
      "billing_period_credits_limit": "number",
      "total_credits_used": "number (lifetime total)",
      "total_credits_used_in_billing_period": "number",
      "daily_credits_used_in_billing_period": "number",
      "default_monthly_member_credit_limit": "number|null",
      "topup_credits_used": "number",
      "topup_credits_limit": "number",
      "backend_total_used_in_billing_period": "number",
      "billing_period_start_date": "ISO 8601 timestamp",
      "billing_period_end_date": "ISO 8601 timestamp",
      "num_projects": "number",
      "short_referral_code": "string (optional)",
      "referral_count": "number",
      "external_publish_permission_level": "string",
      "subscription_currency": "string (e.g. 'usd')",
      "subscription_status": "string (e.g. 'trialing', 'active')",
      "subscription_status_changed_at": "ISO 8601 timestamp",
      "experimental_features": "object",
      "followers_count": "number",
      "membership": {
        "workspace_id": "string",
        "user_id": "string",
        "role": "string (e.g. 'owner', 'admin', 'member')",
        "email": "string",
        "monthly_credit_limit": "number|null",
        "invited_at": "ISO 8601 timestamp",
        "joined_at": "ISO 8601 timestamp"
      }
    }
  ]
}
```

#### Key Fields Used by Controller

| Field | Used For | Display |
|-------|----------|---------|
| `name` | **Project/workspace label** in header and NOW section | Full name, e.g. "P01 D2v2 Orinmax's Lovable v2" |
| `billing_period_credits_used` | Progress bar fill, `💰 used/limit` | `Math.round()` integer |
| `billing_period_credits_limit` | Progress bar max, usage percentage | `Math.round()` integer |
| `daily_credits_used` | `📅 daily used/limit` | `Math.round()` integer |
| `daily_credits_limit` | Daily quota indicator | `Math.round()` integer |
| `credits_granted` | `🎁 N free` (free tier allocation) | `Math.round()` integer |
| `credits_used` | Free credits consumed | `Math.round()` integer |
| `last_trial_credit_period` | Free tier availability detection | Compared to current month |
| `subscription_status` | Plan badge (`🔵 active`, `🟡 trialing`) | Status text |
| `membership.role` | Role display in workspace list | Badge text |
| `id` | Workspace UUID for move API | Hidden |

### Nested Workspace Object Parsing (v7.5)

`parseApiResponse()` handles two response shapes from `/user/workspaces`:

```javascript
// Shape 1 (flat): [{ id, name, billing_period_credits_used, ... }]
// Shape 2 (nested): [{ workspace: { id, name, ... }, current_member: { ... } }]
const ws = rawWs.workspace || rawWs;  // Normalize to flat shape
```

Each `perWorkspace` entry now includes:
- `id` — workspace UUID (for API calls)
- `name` — truncated to 12 chars (for credit display)
- `fullName` — full workspace name (for dropdown labels and project name display)
- `used`, `limit` — billing period credits

### Exponential Backoff Retry — Credit Status API (v5.2)

The API-first credit fetch uses exponential backoff:

```
Attempt 0: immediate fetch
Attempt 1: wait RetryBackoffMs * 2^0 = 1000ms
Attempt 2: wait RetryBackoffMs * 2^1 = 2000ms
...up to MaxRetries attempts
```

- Config: `[CreditStatus] MaxRetries=2`, `RetryBackoffMs=1000`
- On final failure after all retries exhausted, falls through to DOM XPath fallback
- Each retry logs attempt number, error message, and next delay

### SPA Persistence via MutationObserver (S-002)

A `MutationObserver` on `document.body` (`childList` + `subtree`) detects when the
controller container is removed by SPA navigation or React re-renders:

```
MutationObserver(mutations)
    |-- 500ms debounce (prevents rapid re-injection during DOM churn)
    |-- Check: document.getElementById(ID.CONTAINER) still exists?
    |     NO  -> logWarn + createControllerUI() (full rebuild)
    |     YES -> no-op
```

- Registered once at script init, persists for page lifetime
- Rebuilds entire panel: buttons, drag handle, event listeners, status display
- Does NOT re-embed the script marker (only UI elements)
- Debounce prevents multiple re-injections during rapid DOM mutations (e.g., React reconciliation)

### Visual Retry Indicator — Credit Status

During exponential backoff retries in `checkCreditsViaApi()`, the `#ahk-credit-display`
element shows real-time retry progress instead of going silent:

```
+---------------------------------------------+
| Retrying (2/3)...  ERR_NETWORK · next in 2s |
+---------------------------------------------+
  ^yellow text         ^gray 10px detail text
```

- Yellow "Retrying (X/Y)..." with attempt/total count
- Gray sub-text: error message + countdown in seconds (`delayMs / 1000`)
- Replaces credit display content during retry; restored on success or final failure

### Button Highlight During Combo Execution

The active direction button (Up/Down) provides step-by-step visual feedback during
the 8-step combo process:

```
  +---------+
  | Up  [3/8] |  <- yellow pill badge, top-right
  +---------+
   ^^^ pulsing glow (blue for Up, yellow for Down)
```

**Lifecycle:**
1. `highlightButton(direction)` — called at `runComboSwitch()` start
   - Adds pulsing box-shadow (alternates strong/subtle every 500ms)
   - Attaches step badge (`1/8`) as absolute-positioned child element
2. `setButtonStep(n)` — called at each step (1→8), updates badge text
3. `resetButtonHighlight(success)` — called on completion or exhausted retries
   - Clears pulse interval, removes badge
   - Green flash (success) or red flash (failure), 600ms duration
   - Restores original button styling
### TrayTip Error Notifications on Combo Failure

When all combo retries are exhausted, JS signals AHK via `document.title` marker:

```
JS: handleStepFailure() exhausted
    |-- Write __AHK_COMBO_FAILED__<stepName>__ into document.title
    |-- Update #ahk-combo-status with red "FAILED" + step name
    |-- resetButtonHighlight(false) — red flash

AHK: CheckComboFailureMarker() (SetTimer, 3s intervals, max 4 checks)
    |-- WinGetTitle() — read browser title
    |-- Extract step name from marker
    |-- TrayTip("...failed at step: <stepName>", type=3 error icon)
    |-- Clean title marker via InjectJS
```

- No `alert()` used (design rule compliance)
- Covers all 3 injection paths: fast path, sessionStorage, full injection
- 12 seconds total monitoring window (4 × 3s)

### JS Command History

Tracks last 20 executed JS commands with results:

```
executeJsFromTextbox()
    |-- eval(code)
    |-- addJsHistoryEntry(code, success, resultText)
         |-- Store { time, code, success, result }
         |-- Skip consecutive duplicates
         |-- renderJsHistory() — update #ahk-js-history UI
```

**Navigation:**
- Up/Down arrows in textbox recall previous commands (single-line mode only)
- Click any history entry to recall into textbox
- `jsHistoryIndex` tracks position, resets on new execution

**Display:** Each entry shows timestamp, green ✓ or red ✗, and truncated code (50 chars).

### Config Hot-Reload

AHK watches `config.ini` for changes without requiring script restart:

```
StartConfigWatcher()
    |-- Record initial FileGetTime(configFile, "M")
    |-- SetTimer(CheckConfigModified, configWatchIntervalMs)

CheckConfigModified()
    |-- Compare current vs last modification timestamp
    |-- If changed: LoadConfig() to refresh all globals
    |-- TrayTip notification on success or failure
    |-- Note: Hotkey changes still require manual Reload
```

- Config key: `[General] ConfigWatchIntervalMs=2000` (0 = disabled)
- Non-destructive: only re-reads values, does not re-register hotkeys
- TrayTip warns that hotkey changes need script reload

## MacroLoop Module Architecture (v7.2 Refactor)

### File Structure
```
MacroLoop.ahk (orchestrator — #Includes all submodules)
  |-- MacroLoop/Globals.ahk      — Global state variables (macroLoopRunning, etc.)
  |-- MacroLoop/Helpers.ahk      — ExtractProjectId, CallLoopFunction, OpenDevToolsIfNeeded
  |-- MacroLoop/TabSearch.ahk    — GetTabInfoFromTitle
  |-- MacroLoop/Routing.ahk      — HandleSmartShortcut, GetCurrentUrl
  |-- MacroLoop/Embed.ahk        — EmbedMacroLoopScript (placeholder replacement + injection)
  |-- MacroLoop/SignalPoll.ahk   — CheckClipboardForDelegate (500ms timer callback)
  |-- MacroLoop/Delegate.ahk     — HandleDelegate + FindSettingsTab, OpenNewSettingsTab,
  |                                 TriggerCombo, ReturnToProjectTab, SmartProjectReturn,
  |                                 ReInjectAndRestoreLoop
  |-- MacroLoop/Lifecycle.ahk    — ToggleMacroLoop, StopMacroLoop, AdjustLoopInterval
```

## MacroLoop Module (MacroLoop.ahk)

### Injection Architecture (v5.2 Change)

**Before v5.2**: MacroLoop used its own custom injection — `Ctrl+A` to select console,
`Ctrl+V` to paste, `Enter` to execute. This caused issues where `Ctrl+A` would select
the entire page content instead of the console input, especially if DevTools focus was lost.

**After v5.2**: Both `EmbedMacroLoopScript()` and `CallLoopFunction()` now use the
shared `InjectJS()` function from `JsInject.ahk`. This ensures:
- DevTools is opened once via `Ctrl+Shift+J` (managed by `devToolsOpened` flag)
- Subsequent injections use close-reopen (`F12` → `Ctrl+Shift+J`) for reliable focus
- Consistent paste-and-execute behavior across all modules

**v7.8 optimization**: `EmbedMacroLoopScript()` now uses `InjectJSQuick()` for the
second injection (macro-looping.js), since Console is already focused from the
xpath-utils.js injection. Reduced from 2 full toggles to 1.

```
EmbedMacroLoopScript()
    |-- InjectJS(xpath-utils.js)            <-- full DevTools open
    |-- Sleep(500)
    |-- Read macro-looping.js from disk
    |-- Replace __PLACEHOLDER__ values from config.ini
    |-- InjectJSQuick(templatedScript)      <-- paste-only (Console already focused)
    
CallLoopFunction(funcName, param)
    |-- Build JS string with typeof guard:
    |     if(typeof funcName==='function'){funcName(param);}
    |     else{console.warn('funcName not defined');}
    |-- InjectJS(js)                   <-- shared function
```

### macro-looping.js Lifecycle (v7.8)

1. **Domain guard**: Validate hostname against allowed domains. Abort if mismatch.
2. **Idempotent init**: Check for `#ahk-macro-loop-script` marker. If exists, return immediately — preserves loop status, history, and UI state.
3. Create UI panel, register keyboard shortcuts, expose global functions.
4. Install MutationObserver for SPA persistence.

**typeof safety wrapper (v6.49)**: All `CallLoopFunction` calls wrap the JS invocation
in a `typeof` guard. This prevents `ReferenceError` when the page has refreshed during
delegation and `window.__delegateComplete` (or other globals) no longer exist.

### Re-Entrance Guard for Delegation (v6.49)

AHK timers are pseudo-threads that can interrupt long-running functions. The 500ms
`CheckClipboardForDelegate` timer could re-enter during `HandleDelegate()` (which takes
10-30+ seconds), causing `GetCurrentUrl()` to read stale clipboard content (the JS
cleanup code from `InjectJS`).

**Fix**: `isHandlingDelegate` global flag prevents timer re-entry:

```autohotkey
global isHandlingDelegate := false

CheckClipboardForDelegate() {
    if isHandlingDelegate
        return           ; Skip — HandleDelegate is already running
    ...detect signal...
    HandleDelegate(direction)
}

HandleDelegate(direction) {
    isHandlingDelegate := true
    try {
        ...tab switch, combo, return...
    } finally {
        isHandlingDelegate := false  ; Reset in both success and catch paths
    }
}
```

### OpenDevToolsIfNeeded — DEPRECATED

This function is now a no-op. DevTools management is handled entirely by `InjectJS()`
in `JsInject.ahk` via the `devToolsOpened` global flag. Kept for backward compatibility.

### MacroLoop Placeholders

| Placeholder | Config Key |
|-------------|------------|
| `__SCRIPT_VERSION__` | ScriptVersion |
| `__LOOP_SCRIPT_MARKER_ID__` | LoopScriptMarkerId |
| `__LOOP_CONTAINER_ID__` | LoopContainerId |
| `__LOOP_STATUS_ID__` | LoopStatusId |
| `__LOOP_START_BTN_ID__` | LoopStartBtnId |
| `__LOOP_STOP_BTN_ID__` | LoopStopBtnId |
| `__LOOP_UP_BTN_ID__` | LoopUpBtnId |
| `__LOOP_DOWN_BTN_ID__` | LoopDownBtnId |
| `__LOOP_RECORD_INDICATOR_ID__` | LoopRecordIndicatorId |
| `__LOOP_JS_EXECUTOR_ID__` | LoopJsExecutorId |
| `__LOOP_JS_EXECUTE_BTN_ID__` | LoopJsExecuteBtnId |
| `__LOOP_INTERVAL_MS__` | LoopIntervalMs |
| `__COUNTDOWN_INTERVAL_MS__` | CountdownIntervalMs |
| `__FIRST_CYCLE_DELAY_MS__` | FirstCycleDelayMs |
| `__POST_COMBO_DELAY_MS__` | PostComboDelayMs |
| `__PAGE_LOAD_DELAY_MS__` | PageLoadDelayMs |
| `__DIALOG_WAIT_MS__` | DialogWaitMs |
| `__WS_CHECK_INTERVAL_MS__` | WorkspaceCheckIntervalMs |
| `__LOOP_PROJECT_BUTTON_XPATH__` | ProjectButtonXPath |
| **`__LOOP_MAIN_PROGRESS_XPATH__`** | **MainProgressXPath** |
| `__LOOP_PROGRESS_XPATH__` | ProgressXPath |
| `__LOOP_WORKSPACE_XPATH__` | WorkspaceNameXPath |
| `__LOOP_CONTROLS_XPATH__` | LoopControlsXPath |
| `__LOOP_PROMPT_ACTIVE_XPATH__` | PromptActiveXPath |
| `__LOOP_REQUIRED_DOMAIN__` | RequiredDomain |
| `__LOOP_SETTINGS_TAB_PATH__` | SettingsTabPath |
| `__LOOP_DEFAULT_VIEW__` | DefaultView |
| `__LOOP_FOCUS_TEXTBOX_KEY__` | LoopFocusTextboxKey |
| `__LOOP_START_KEY__` | LoopStartKey |
| `__LOOP_STOP_KEY__` | LoopStopKey |
| `__LOOP_SHORTCUT_MODIFIER__` | LoopShortcutModifier |

### Two-XPath Strategy for Dialog Detection (v6.48)

The MacroLoop cycle uses two separate progress bar XPaths to distinguish "dialog loaded"
from "free credit available":

| XPath | Config Key | Purpose | Always Present? |
|-------|------------|---------|-----------------|
| `MainProgressXPath` (div/div[1]) | `MainProgressXPath` | **Dialog ready signal** — appears as soon as the project dialog is fully loaded | YES |
| `ProgressXPath` (div/div[2]) | `ProgressXPath` | **Free credit indicator** — only appears when free credits remain | NO |

**Why two XPaths?**
- Before v6.48, the system waited a fixed `DialogWaitMs` (2-3s) after clicking the project button,
  then checked `ProgressXPath`. If the dialog hadn't rendered yet, the XPath failed → false "no credit" → unnecessary delegation.
- With `MainProgressXPath`, we can **poll** for dialog readiness and proceed immediately when loaded,
  rather than blindly waiting. If the main bar is present but the free credit bar is absent,
  it's a **definitive** "no credit" signal (not a rendering delay).

### pollForDialogReady() — Poll-Based Detection (v6.48, updated v6.51)

Replaces fixed `DialogWaitMs` sleep with polling for `MainProgressXPath` every 200ms.
**v6.51**: Added 500ms settle delay after main bar is found to allow sibling elements
(e.g., free credit progress bar) to finish rendering before credit checks run.

```javascript
function pollForDialogReady(callback) {
    var pollInterval = 200; // ms between polls
    var maxWait = TIMING.DIALOG_WAIT || 3000; // fallback timeout
    var elapsed = 0;
    var pollTimer = setInterval(function() {
        elapsed += pollInterval;
        var mainEl = getByXPath(CONFIG.MAIN_PROGRESS_XPATH);
        if (mainEl && mainEl.getBoundingClientRect().width > 0) {
            clearInterval(pollTimer);
            log('Main progress bar FOUND after ' + elapsed + 'ms — waiting 500ms settle...');
            setTimeout(function() {
                log('Dialog settle delay complete — proceeding');
                callback(); // Now safe to check for free credit bar
            }, 500);
            return;
        }
        if (elapsed >= maxWait) {
            clearInterval(pollTimer);
            log('pollForDialogReady timed out after ' + maxWait + 'ms');
            callback(); // Timeout fallback
        }
    }, pollInterval);
}
```

**Typical timing**: Dialog renders in 200-800ms. Polling detects readiness within one
poll cycle of actual render, saving 1-2s per check compared to fixed wait.

### closeProjectDialog() — Auto-Close Helper (v6.48)

Ensures the project dialog is always dismissed after every status check:

```javascript
function closeProjectDialog() {
    var btn = getByXPath(CONFIG.PROJECT_BUTTON_XPATH);
    if (btn) {
        var expanded = btn.getAttribute('aria-expanded');
        if (expanded === 'true') {
            reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
            logSub('Dialog closed');
        }
    }
}
```

Called after EVERY dialog check in both `runCycle()` and `refreshStatus()`.

### Clipboard Delegation

MacroLoop uses dual signaling for cross-tab communication:
1. **Primary: Title marker** — JS writes `__AHK_DELEGATE_DOWN__URL:https://lovable.dev/projects/.../__ENDURL__` into `document.title` (v6.53: includes full URL)
2. **Secondary: Clipboard** — JS writes `DELEGATE_UP` or `DELEGATE_DOWN` to clipboard (works for user-gesture Force buttons)
3. AHK polls both title and clipboard every 500ms via `CheckClipboardForDelegate()`
4. AHK extracts project URL directly from title signal (v6.53: eliminates fragile Ctrl+L/Ctrl+C address bar reads)
5. On signal, AHK switches to settings tab, triggers combo, returns to project tab

### MacroLoop Cycle Flow (v6.51)

```
runCycle()
    |-- Check: loop running? (skip if not)
    |-- Check: isDelegating? (skip if yes, auto-recover after 60s timeout)
    |
    |-- Step 0: isUserTypingInPrompt() → SKIP entire cycle if user is typing
    |
    |-- Step 1: ensureProjectDialogOpen()  *** TOGGLE-CLOSE FIX (v6.45) ***
    |     |-- Read aria-expanded / data-state on Project Button
    |     |-- If ALREADY OPEN (aria-expanded=true) → skip click, log "skipping"
    |     |-- If CLOSED → click to open via reactClick()
    |
    |-- Step 2: pollForDialogReady()  *** POLL-BASED (v6.48), SETTLE DELAY (v6.51) ***
    |     |-- Poll for MainProgressXPath every 200ms (max DialogWaitMs)
    |     |-- Main bar found? → wait 500ms settle delay → proceed
    |     |-- Timeout? → Proceed anyway (backward-compatible fallback)
    |
    |-- Step 3: Fetch Workspace Name (CONFIG.WORKSPACE_XPATH)
    |     |-- Read text from XPath element
    |     |-- Update state.workspaceName (shown inline in status bar, yellow bold)
    |     |-- If name changed from previous: log change + record in workspace history (localStorage)
    |
    |-- Step 3b: First Free Credit Check (CONFIG.PROGRESS_XPATH)
    |     |-- findElement() with progressbar role fallback
    |     |-- Validates visibility: rect size > 0, not display:none/hidden/opacity:0
    |     |-- Progress bar FOUND + VISIBLE = free credit exists → closeProjectDialog() → STOP
    |     |-- Progress bar NOT FOUND or HIDDEN → proceed to double-confirm
    |
    |-- Step 4: DOUBLE-CONFIRM before delegation  *** (v6.45) ***
    |     |-- closeProjectDialog() → re-open → pollForDialogReady() → re-check
    |     |-- Re-fetch workspace name
    |     |-- Re-check free credit bar (confirmation check)
    |     |-- If credit found on re-check → closeProjectDialog() → ABORT delegation
    |     |-- If still no credit → proceed to Step 5
    |
    |-- Step 5 (CONFIRMED no credit):
    |     |-- closeProjectDialog()  *** AUTO-CLOSE (v6.48) ***
    |     |-- Delegate to AHK (set isDelegating, write signal to title + clipboard)
```

### Workspace Auto-Check — DISABLED (v6.51)

**Removed in v6.51**: The background timer that opened the project dialog every 5 seconds
was inherently disruptive — constantly clicking the project button even when idle.
Workspace name and credit status are now ONLY checked:
1. During active loop cycles (inside `runCycle()`)
2. Via manual "Check" button clicks

The `startStatusRefresh()` and `stopStatusRefresh()` functions remain in the codebase
but are not auto-started on injection.

### HandleDelegate Probe Optimization (v6.52)

Before doing full script injection during delegation, HandleDelegate now injects a
lightweight `typeof` probe (~100-120 chars) to check if the target function already
exists on the current tab. This avoids unnecessary 40-50KB re-injections.

```
Step 4 (settings tab): Probe for __comboSwitch
    |-- Inject: typeof __comboSwitch === 'function' ? call + PROBED : MISSING
    |-- Read title marker
    |-- PROBED → skip RunComboSafe entirely (~40KB saved)
    |-- MISSING → fall through to RunComboSafe (full injection)

Step 6b (project tab): Probe for __delegateComplete
    |-- Inject: typeof __delegateComplete === 'function' ? PROBED : MISSING
    |-- Read title marker
    |-- PROBED → skip EmbedMacroLoopScript (~50KB saved)
    |-- MISSING → fall through to EmbedMacroLoopScript (full injection)
```

### Embedded URL in Title Signal (v6.53)

**Problem**: `HandleDelegate` Step 1 called `GetCurrentUrl()` which sends Ctrl+L → Ctrl+C → Escape to read the address bar. After F12 closed DevTools, the address bar often failed to respond, resulting in an empty URL → "No project ID found" → delegation failure. This created an infinite loop where JS kept delegating and AHK kept failing.

**Root Cause**: Activity logs showed `Got URL:` (empty) after the Ctrl+L/Ctrl+C sequence. The browser didn't reliably respond to Ctrl+L immediately after F12 closed DevTools.

**Fix**: JS now embeds the full page URL directly in the title signal:
```
OLD: __AHK_DELEGATE_DOWN__
NEW: __AHK_DELEGATE_DOWN__URL:https://lovable.dev/projects/ef865081-.../__ENDURL__
```

AHK extracts the URL from the title using regex, eliminating the fragile address bar read entirely. Falls back to `GetCurrentUrl()` only if the embedded URL is missing.

### Consecutive Delegation Failure Guard (v6.53)

**Problem**: When `HandleDelegate` fails (e.g., empty URL), it calls `__delegateComplete` to resume the JS loop. JS then runs another cycle, finds no credit, and delegates again — creating an infinite failure loop.

**Fix**: A `consecutiveDelegateFailures` counter increments on each failure and resets on success. After `MAX_DELEGATE_FAILURES` (3) consecutive failures, the loop is automatically stopped with a TrayTip notification. This prevents infinite delegation spam.

### Pre-Delegate InjectJS Removal (v6.54)

**Problem**: When `CheckClipboardForDelegate` detected a title signal, it called `InjectJS()` to clean the title marker BEFORE calling `HandleDelegate()`. This `InjectJS()` call took 2-3 seconds of keyboard automation (F12 close, Ctrl+Shift+J reopen, paste cleanup regex, Enter). This:
- Changed the clipboard (overwritten with cleanup JS code)
- Changed DevTools open/close state unpredictably
- Left the browser in a disrupted state before HandleDelegate even started
- Made Force Up/Down buttons appear stuck on "SWITCHING" permanently

**Root Cause**: The pre-cleanup `InjectJS` was a heavy operation happening at exactly the wrong time — between signal detection and the actual delegation handler. The `isHandlingDelegate` guard already prevented duplicate signal processing, making the pre-cleanup redundant.

**Fix**: Removed the `InjectJS()` title-cleaning calls from `CheckClipboardForDelegate()` (both title and clipboard paths). Title markers are now only cleaned:
1. By `HandleDelegate()` at completion (success path, line ~637)
2. By `HandleDelegate()` catch block (error path, line ~656)
3. By JS `delegateComplete()` function

### Workspace Change History (v6.46) — localStorage Tracking

Tracks every workspace name transition in `localStorage` under key `ml_workspace_history`:

```
addWorkspaceChangeEntry(fromName, toName)
    |-- Read existing history from localStorage (JSON array)
    |-- Push { from, to, time (ISO), display (locale string) }
    |-- Cap at 50 entries (oldest dropped)
    |-- Write back to localStorage
```

**UI**: "Workspace History" button in controller panel toggles a scrollable history view.
Each entry shows: `[timestamp] oldName → newName` (red → green).
Clear button removes all history.

### Shared Workspace Names (v6.46) — Cross-Script localStorage

`combo.js` saves all extracted workspace/project names to `localStorage` under key
`ml_known_workspaces` after every combo operation. This data is readable by `macro-looping.js`
since both scripts run on the same `lovable.dev` origin.

```
combo.js: saveKnownWorkspaces(labels)
    |-- Write string array to localStorage['ml_known_workspaces']
    |-- Called after extractOptionLabels() in runComboSwitch()

macro-looping.js: can read via localStorage.getItem('ml_known_workspaces')
```

### Toggle-Close Bug Fix (v6.45)

**Problem**: The Project Button is a toggle (open/close). If the dialog was already open
(from a previous cycle, status refresh, or manual click), clicking it again CLOSED the
dialog. The progress bar check then ran against a closed/missing dialog → "not found" →
false delegation even when free credit existed.

**Root Cause**: Logs showed `aria-expanded=true, data-state=open` BEFORE click, then
`aria-expanded=false, data-state=closed` AFTER click — confirming the toggle behavior.

**Fix**: `ensureProjectDialogOpen()` replaces `clickProjectButton()`. It reads
`aria-expanded` and `data-state` attributes before deciding to click:
- If `aria-expanded=true` → dialog already open, skip click
- If `aria-expanded=false` → dialog closed, click to open

### Double-Confirm Delegation (v6.45)

Before dispatching any delegate signal to AHK, the system performs TWO credit checks
separated by a full dialog wait cycle. This prevents:
- **Timing issues**: Dialog not fully rendered on first check
- **DOM shift**: Dialog elements at different XPath positions during load
- **False negatives**: Transient DOM states where progress bar isn't mounted yet

### Credit Detection Validation (v6.45)

**Before v6.45**: `checkSystemBusy()` returned `true` if `findElement()` returned any
element — even if that element was hidden, had zero dimensions, or was invisible.

**After v6.45**: Validates the found element is actually visible:
1. `getBoundingClientRect()` — width > 0 AND height > 0
2. `getComputedStyle()` — not `display:none`, `visibility:hidden`, or `opacity:0`
3. Logs full diagnostic: `"visible=true, hidden=false, hasContent=true, rect=200x10"`

### Always-Visible Workspace Name (v6.46)

The status bar shows workspace name and credit status in ALL states, inline with status info:

**Running state:**
```
WorkspaceName | [*] DOWN | #5 | [Y] Free Credit | 12s
[==========================----]             ← countdown bar
```

**Stopped state:**
```
WorkspaceName | [=] Stopped | Cycles: 5 | [Y] Free Credit
```

**Initializing:**
```
⟳ Initializing... checking workspace & credit status
```

- Workspace name is **yellow (#fbbf24) and bold** for high visibility
- Displayed inline on the same line as direction/credit info

### MacroLoop Controller UI (v6.49)

```
+---------------------------------------------+
| MacroLoop Controller  v6.49   [ - ] [ x ]   |  <- Header (draggable)
+---------------------------------------------+
| WorkspaceName | [*] DOWN | #5 | [Y] Free    |  <- Status (workspace yellow+bold)
| [==========================----]             |  <- Countdown progress bar
+---------------------------------------------+
| [Start] [Stop] [Check] | [Up] [Down] | [F-Up] [F-Dn] |
+---------------------------------------------+
| 1. Open Dialog → 2. Check Credit → 3. Double-Confirm → 4. Delegate |
+---------------------------------------------+
| Workspace History                            |  <- Toggle button (yellow)
|   [Feb 19, 14:32] P01 → P02                 |  <- From/To entries
|   [Feb 19, 14:28] P02 → P01                 |  <- Red(from) → Green(to)
|                              [Clear History] |
+---------------------------------------------+
| [+] XPath Configuration (editable)           |
|   Project Button XPath: [________________]   |
|   Progress Bar XPath:   [________________]   |
|   Workspace Name XPath: [________________]   |
+---------------------------------------------+
| XPath Tester                                 |
| [________________] [Find] [Click] [Fire All] |
+---------------------------------------------+
| ▶ Show Activity Log                          |
| JS Logs (500 entries)        [Copy] [DL] [Clr] |
| [+] JS Executor (Ctrl+Enter to run)         |
+---------------------------------------------+
```

### UI Fallback (v6.2)

If `LoopControlsXPath` cannot find the target container after 5 retries (2s each),
the controller falls back to `document.body` append with fixed floating positioning.
This ensures the UI always appears even if the Lovable DOM structure changes.

## Global Functions

| Function | Purpose |
|----------|---------|
| `window.__comboSwitch(direction)` | Run combo switch ("up" or "down") |
| `window.__executeJs()` | Execute code in JS executor textbox |
| `window.__loopStart(direction)` | Start macro loop |
| `window.__loopStop()` | Stop macro loop |
| `window.__loopSetInterval(ms)` | Update loop interval at runtime |
| `window.__delegateComplete()` | Signal delegate operation finished |

## Key Differences from V1/V2/V3/V4

| Aspect | V1 | V3 | V4 | V4.10 | V5.2 | **V6.49** |
|--------|----|----|-----|-------|------|-----------|
| AHK Version | v2 | v1 | v2 | v2 | v2 | **v2** |
| DevTools | Every time | Every time | Once | Once (auto-open + flag) | Once (auto-open + flag) | **Close-reopen strategy** |
| Script Injection | Every time | Every time | Once (embedded) | Fast path | 3-tier fast path | **3-tier fast path** |
| UI Buttons | No | No | Yes | Yes + status | Yes + status | **Yes + status** |
| JS Executor | No | No | No | Yes (Ctrl+/, Ctrl+Enter) | Yes | **Yes** |
| Status Display | No | No | No | Yes (live) | Yes (live) | **Yes (always-on, inline)** |
| History Panel | No | No | No | Yes (last 5) | Yes (last 5) | **Yes + workspace history** |
| Confirm Delay | N/A | N/A | N/A | Configurable | Configurable | **Configurable** |
| Flash Animation | No | No | No | Yes (yellow glow) | Yes | **Yes** |
| Fast Path | No | No | No | Yes (AHK flag) | 3-tier (direct/cache/full) | **3-tier** |
| IDs Configurable | No | No | Yes | Yes | Yes | **Yes** |
| Error Codes | No | No | Yes (E001-E010) | Yes (E001-E011) | Yes (E001-E015) | **Yes** |
| Auto-Retry | No | No | No | Yes | Yes (exponential backoff) | **Yes** |
| SPA Persistence | No | No | No | Yes (MutationObserver) | Yes (MutationObserver + debounce) | **Yes** |
| Credit Status | No | No | No | No | Yes (API + DOM fallback) | **Yes** |
| Toggle-Close Fix | No | No | No | No | No | **Yes (aria-expanded check)** |
| Double-Confirm | No | No | No | No | No | **Yes (2x check before delegate)** |
| Workspace Inline | No | No | No | No | No | **Yes (yellow bold, inline)** |
| Workspace Auto-Check | No | No | No | No | No | **Yes (5s interval, dialog open/close)** |
| Workspace History | No | No | No | No | No | **Yes (localStorage tracking)** |
| Cross-Script Data | No | No | No | No | No | **Yes (ml_known_workspaces)** |
| Poll-Based Dialog | No | No | No | No | No | **Yes (pollForDialogReady, 200ms)** |
| Two-XPath Strategy | No | No | No | No | No | **Yes (MainProgress + FreeCredit)** |
| Auto-Close Dialog | No | No | No | No | No | **Yes (closeProjectDialog after every check)** |
| typeof Safety | No | No | No | No | No | **Yes (CallLoopFunction wraps all calls)** |
| Re-Entrance Guard | No | No | No | No | No | **Yes (isHandlingDelegate flag)** |
| Default Loop Interval | N/A | 15s | 15s | 15s | 15s | **50s** |
| sessionStorage Cache | No | No | No | No | Yes (self-healing) | **Yes** |

## Troubleshooting

### Unicode / Clipboard Encoding

**Symptom**: `SyntaxError: Unexpected token '}'` after injection

**Root Cause**: Unicode characters (arrows, em-dash, box-drawing) in JS strings get
corrupted during AHK clipboard paste (40K+ chars through clipboard).

**Fix**: All JS code strings use HTML entities (`&uarr;`, `&darr;`, `&middot;`) and
ASCII characters (`|`, `-`) instead of Unicode. Comments can use Unicode safely.

### Script Embeds Every Time (FIXED in v5.2)

**Symptom**: Full 40K combo.js pasted on every Ctrl+Down/Up press

**Fix**: Fast path in Combo.ahk uses an AHK global flag (`scriptEmbedded`).
If already embedded, injects only ~35 chars (`window.__comboSwitch()`) instead of 40K.

---

## Credit Status Checker

### Overview

Retrieves workspace credit usage and free tier availability via API-first approach
with DOM XPath fallback. Displays results inside the ComboSwitch controller UI.

- **Trigger**: Click "Status" button or press `Ctrl+Alt+S` (HTML-level shortcut)
- **Auto-refresh**: Configurable timer (default 60s)
- **Display**: Inside ComboSwitch controller panel

### API Response Schema (GET /user/workspaces)

**Endpoint**: `https://api.lovable.dev/user/workspaces`

**Response**: `{ "workspaces": [ ...WorkspaceObject ] }`

**Key fields per workspace object:**

| Field | Type | Use |
|-------|------|-----|
| `id` | string | Workspace identifier |
| `name` | string | Workspace display name (e.g. "P01 D2v2 ...") |
| `plan` | string | Plan identifier (e.g. `pro_1`) |
| `plan_type` | string | `monthly` etc. |
| `subscription_status` | string | `trialing`, `active`, etc. |
| `daily_credits_used` | number | Daily credits consumed |
| `daily_credits_limit` | number | Daily cap (e.g. 5) |
| `billing_period_credits_used` | number | Period credits consumed |
| `billing_period_credits_limit` | number | Period cap (e.g. 100) |
| `credits_granted` | number | Free/trial credits granted |
| `credits_used` | number | Free credits consumed |
| `last_trial_credit_period` | string/null | Month string if free tier active (e.g. "2026-02") |
| `rollover_credits_used` / `_limit` | number | Rollover tracking |
| `topup_credits_used` / `_limit` | number | Top-up tracking |
| `total_credits_used` | number | Lifetime total |
| `total_credits_used_in_billing_period` | number | All credits used in current period |
| `daily_credits_used_in_billing_period` | number | All daily credits in current period |
| `membership.role` | string | `owner`, `admin`, `member` |

**Free tier detection rule**: `freeTierAvailable = true` if:
- `credits_granted > 0` AND `credits_used < credits_granted`, OR
- `last_trial_credit_period` matches current month (e.g. "2026-02")

**Credits summary text**: Derived per workspace as
`"{billing_period_credits_used}/{billing_period_credits_limit} | Daily: {daily_credits_used}/{daily_credits_limit}"`

### Authentication Rules

1. **Cookie-based fetch (preferred)**: Use `fetch(url, { credentials: 'include' })` from within
   the logged-in browser page context. Since combo.js runs on `lovable.dev`, the browser
   automatically sends session cookies. No token extraction needed.
2. **User-provided token (fallback)**: If cookies don't work, use token from CW config key
   `LovableBearerToken`. Sent as `Authorization: Bearer <token>`.
3. **No token exfiltration**: The script must NEVER read `Authorization` headers from
   intercepted requests, localStorage, sessionStorage, or IndexedDB.

### Status Retrieval Flow

```
checkCreditsStatus(trigger)
  |-- Check cache: if lastCheckedAt < cacheTtlSeconds ago, return cached
  |-- Generate correlationId
  |
  |-- API-FIRST PATH (with exponential backoff retry):
  |     attemptFetch(attempt=0)
  |       fetch(apiBaseUrl + '/user/workspaces', { credentials: 'include' })
  |       If authMode == 'token' && bearerToken set:
  |         Add header: Authorization: Bearer <token>
  |       On success (200):
  |         Parse JSON -> extract all workspace credit fields
  |         Set freeTierAvailable, totalCreditsText, perWorkspaceData[]
  |         Update controller UI
  |         Log: correlationId, timestamp, source=api, attempt number
  |         DONE
  |       On failure (non-200 or network error):
  |         If attempt < MaxRetries:
  |           delayMs = RetryBackoffMs * 2^attempt  (exponential backoff)
  |           Log: attempt number, error, next retry delay
  |           setTimeout(attemptFetch(attempt+1), delayMs)
  |         Else:
  |           Log: all attempts exhausted
  |           Fall through to DOM fallback
  |
  |-- DOM FALLBACK PATH:
  |     Click Plans and Credits button (PlansButtonXPath)
  |     Wait for Total Credits Count element visible (TotalCreditsXPath)
  |       Max wait: 20 attempts x 300ms = 6s
  |     Read innerText -> totalCreditsText
  |     Check Free Progress Bar exists (FreeProgressBarXPath)
  |       If present -> freeTierAvailable = true
  |     Update controller UI
  |     Leave sidebar open (do NOT close it)
  |     Log: correlationId, source=dom, xpaths used, extracted text
```

### DOM Fallback XPaths

| Element | XPath |
|---------|-------|
| Plans and Credits button | `/html/body/div[3]/div/div/aside/nav/div[2]/div[2]/button[3]` |
| Free Progress Bar | `/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[2]/div/div[2]/div/div[4]` |
| Total Credits Count | `/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[1]/p[2]` |

### ComboSwitch Controller UI (Updated)

The controller must be:
- Appended near end of `document.body`
- `position: fixed; top: 80px; right: 20px; z-index: 99998`
- Visible across SPA navigation states

**Updated layout with credit status row:**

```
+---------------------------------------------+
| ComboSwitch v5.2              [ - ] [ x ]   |  <- Header (draggable)
+---------------------------------------------+
| [Up]  [Down]  [Status]                       |  <- Buttons row (Status = new)
| Ctrl+Alt+Up / Down / Ctrl+Alt+S              |  <- Hints
|                                              |
| NOW: ProjectA | ^ ProjectC . v ProjectB      |  <- Status display
|                                              |
| Credits: 36.6/100 | Daily: 5/5 | Free: Yes  |  <- Aggregate credits row
| P01: 36.6/100  P02: 0/100  P03: 0/100 ...   |  <- Per-workspace breakdown
| Last checked: 14:32:05 (api)                 |  <- Timestamp + source
|                                              |
| JS Executor (Ctrl+/ to focus, Ctrl+Enter)    |
| +----------------------------------+ [Run]   |
| | Enter JavaScript code here...    |         |
| +----------------------------------+         |
|                                              |
| Recent Actions                               |
| | 05:15:30 PM  v  ProjectB        |          |
+---------------------------------------------+
```

**Display fields:**
- `freeTierAvailable` -- green "Free: Yes" or red "Free: No" indicator
- `totalCreditsText` -- raw summary string preserving formatting
- Per-workspace credit breakdown (all workspaces shown, scrollable if many)
- `lastCheckedAt` -- HH:MM:SS timestamp
- `source` -- "(api)" or "(dom)" label

**Keyboard shortcut**: `Ctrl+Alt+S` registered via HTML-level `document.addEventListener('keydown', ...)`.
Does NOT use AHK. Triggers same flow as clicking "Status" button.

### Controller Features (Updated)

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Combo Up | Ctrl+Alt+Up | Switch to previous project |
| Combo Down | Ctrl+Alt+Down | Switch to next project |
| **Credit Status** | **Ctrl+Alt+S** | **Check credits (HTML shortcut)** |
| JS Focus | Ctrl+/ | Focus the JS executor textbox |
| JS Execute | Ctrl+Enter | Run code in the textbox |
| Toggle Hide | Ctrl+Alt+H | Show/hide the panel |
| Drag | Mouse drag header | Float panel anywhere |
| Minimize | Click header | Toggle minimize/expand |

### Check Frequency

- **Auto-refresh**: Enabled by `CreditsAutoCheckEnabled=1`, interval from `CreditsAutoCheckIntervalSeconds` (default 60s)
- **On-demand**: Click "Status" button or press `Ctrl+Alt+S`
- **Cache TTL**: Skip re-fetch if `lastCheckedAt` is within `CreditsStatusCacheTtlSeconds` (default 30s)
- **Auto-check pauses when browser tab is not visible** (optional, via `document.visibilityState`)

### Credit Status Placeholders (combo.js)

| Placeholder | Config Key |
|-------------|------------|
| `__LOVABLE_API_BASE_URL__` | LovableApiBaseUrl |
| `__LOVABLE_AUTH_MODE__` | LovableAuthMode |
| `__LOVABLE_BEARER_TOKEN__` | LovableBearerToken |
| `__CREDITS_AUTO_CHECK_ENABLED__` | CreditsAutoCheckEnabled |
| `__CREDITS_AUTO_CHECK_INTERVAL_S__` | CreditsAutoCheckIntervalSeconds |
| `__CREDITS_CACHE_TTL_S__` | CreditsStatusCacheTtlSeconds |
| `__CREDITS_MAX_RETRIES__` | MaxRetries |
| `__CREDITS_RETRY_BACKOFF_MS__` | RetryBackoffMs |
| `__PLANS_BUTTON_XPATH__` | PlansButtonXPath |
| `__FREE_PROGRESS_XPATH__` | FreeProgressBarXPath |
| `__TOTAL_CREDITS_XPATH__` | TotalCreditsXPath |

### CW Seedable Config Keys ([CreditStatus] section)

| Key | Default | Description |
|-----|---------|-------------|
| `LovableApiBaseUrl` | `https://api.lovable.dev` | API endpoint base URL |
| `LovableAuthMode` | `cookieSession` | Auth mode: `cookieSession`, `token`, or `officialFlow` |
| `LovableBearerToken` | *(empty)* | Bearer token, only if AuthMode=token |
| `CreditsAutoCheckEnabled` | `1` | Enable auto-refresh (1=yes, 0=no) |
| `CreditsAutoCheckIntervalSeconds` | `60` | Seconds between auto-checks |
| `CreditsStatusCacheTtlSeconds` | `30` | Skip re-fetch if within TTL |
| `MaxRetries` | `2` | API retry count on failure |
| `RetryBackoffMs` | `1000` | Backoff between retries (ms) |
| `PlansButtonXPath` | *(see DOM Fallback XPaths)* | Plans & Credits button |
| `FreeProgressBarXPath` | *(see DOM Fallback XPaths)* | Free tier progress bar |
| `TotalCreditsXPath` | *(see DOM Fallback XPaths)* | Total credits text element |

**Seeding rules:**
1. Seed from `config.ini` on first run
2. Persist to DB after seeding
3. DB becomes source of truth after initial seed
4. UI can edit DB values at runtime
5. `LovableBearerToken` is redacted as `***REDACTED***` in all logs and exports

### Credit Status Error Codes

| Code | Description |
|------|-------------|
| E012 | Credit status API request failed (network or non-200) |
| E013 | Plans and Credits button not found (DOM fallback) |
| E014 | Total Credits element not visible after timeout (DOM fallback) |
| E015 | Credit status parse error (JSON or innerText) |

### Credit Status Logging

Every status check logs:
- `correlationId` (unique per run, e.g. `cs-{timestamp}-{random}`)
- `timestamp` and `triggerSource` (`auto` or `onDemand`)
- API result: endpoint, status code, workspace count (NO raw response body)
- DOM fallback: xpaths used, visibility wait outcome, extracted innerText
- Errors: error message + stack trace per project logging policy
- **Token values are NEVER logged in plaintext** -- always `***REDACTED***`

### Global Functions (Updated)

| Function | Purpose |
|----------|---------|
| `window.__comboSwitch(direction)` | Run combo switch ("up" or "down") |
| `window.__executeJs()` | Execute code in JS executor textbox |
| `window.__loopStart(direction)` | Start macro loop |
| `window.__loopStop()` | Stop macro loop |
| `window.__loopSetInterval(ms)` | Update loop interval at runtime |
| `window.__delegateComplete()` | Signal delegate operation finished |
| `window.__checkCredits()` | **Trigger credit status check (on-demand)** |

### Resolved Questions

1. **Cookie auth viability**: `fetch(url, { credentials: 'include' })` works from the `lovable.dev` page context because `api.lovable.dev` is same-site. However, the Lovable API may require a Firebase ID token rather than a session cookie. **Resolution**: Cookie-session is the default `LovableAuthMode`. If API returns 401/403 with cookies, the user should switch to `token` mode and provide their bearer token via `LovableBearerToken` in config.ini. Both paths are implemented.
2. **Tab visibility pause**: Yes. The auto-check timer already skips when `document.visibilityState === 'hidden'` to avoid unnecessary network requests in background tabs. **Implemented.**
3. **Collapsible workspace list**: No collapse toggle needed. The per-workspace breakdown uses `max-height: 60px; overflow-y: auto` so it scrolls naturally when many workspaces exist. A collapsible UI can be added later if users request it.

---

## v7.4 Changes — Enhanced Fetch Logging, Bearer Token UI, Clear All

### Enhanced API Request/Response Logging (v7.4)

The `singleApiFetch()` function now logs comprehensive request and response details:
- **Request**: Method, URL, sanitized headers (bearer tokens redacted), credentials mode
- **Response**: Status, URL, type, redirected flag, all response headers, JSON keys preview, body preview (500 chars on error)
- **Error**: Full error message with stack trace (truncated to 200 chars)

### Bearer Token Input UI (v7.4)

A new "Bearer Token" section in the ComboSwitch controller UI allows users to:
- Paste a bearer token into a password field
- Save it to `localStorage` per project (keyed by `ahk_bearer_{projectId}`)
- Clear the saved token
- The token is automatically used in API requests if no config token is set

### Clear All Data Button (v7.4)

A "Clear All Data" button removes all `ahk_*` and `ml_*` keys from `localStorage`, including:
- Logs, bearer tokens, workspace cache, and any other automation data
- Provides feedback showing how many items were cleared

### Token Resolution Order (v7.4)

`checkCreditsViaApi()` resolves the bearer token in this order:
1. Config-injected `CREDIT_CFG.BEARER_TOKEN` (from `config.ini`)
2. User-provided token from `localStorage` (via the UI input)
3. No token (falls back to cookie session auth)

---

## v6.55–v7.0 Changes — Modular Config & Element Descriptors

### Modular Configuration System (v6.55+)

The monolithic `Config.ahk` was split into a hierarchical module structure:

```
Config.ahk (orchestrator)
  |-- #Include Config/Constants.ahk        (loads all constant files)
  |   |-- Config/Constants/Sections.ahk    (section name strings)
  |   |-- Config/Constants/HotkeyKeys.ahk + HotkeyDefaults.ahk
  |   |-- Config/Constants/ComboKeys.ahk + ComboDefaults.ahk
  |   |-- Config/Constants/LoopKeys.ahk + LoopDefaults.ahk
  |   |-- Config/Constants/CreditKeys.ahk + CreditDefaults.ahk
  |   |-- Config/Constants/TimingKeys.ahk + TimingDefaults.ahk
  |   |-- Config/Constants/GmailKeys.ahk + GmailDefaults.ahk
  |   |-- Config/Constants/GeneralKeys.ahk + GeneralDefaults.ahk
  |   |-- Config/Constants/ElementKeys.ahk
  |   +-- Config/Constants/CommonDefaults.ahk
  |
  |-- Config/ConfigUtils.ahk   (IniReadInt, LoadElementDescriptor)
  |-- Config/Hotkeys.ahk       (LoadHotkeys)
  |-- Config/ComboSwitch.ahk   (LoadComboSwitch)
  |-- Config/MacroLoop.ahk     (LoadMacroLoop)
  |-- Config/CreditStatus.ahk  (LoadCreditStatus)
  |-- Config/AhkTiming.ahk     (LoadAhkTiming)
  |-- Config/Gmail.ahk         (LoadGmail)
  |-- Config/General.ahk       (LoadGeneral)
  |-- Config/Validate.ahk      (ValidateConfig)
  +-- Config/Watcher.ahk       (StartConfigWatcher, StopConfigWatcher)
```

### Config.ini Dot-Notation Structure (v6.55+)

Config sections use hierarchical dot-notation for logical grouping:

| Old (v6.54) | New (v6.55+) |
|-------------|--------------|
| `[ComboSwitch]` (flat) | `[ComboSwitch.XPaths]`, `[ComboSwitch.Transfer]`, `[ComboSwitch.Combo1]`, `[ComboSwitch.Combo2]`, `[ComboSwitch.Options]`, `[ComboSwitch.Confirm]`, `[ComboSwitch.Timing]`, `[ComboSwitch.ElementIDs]`, `[ComboSwitch.Shortcuts]` |
| `[MacroLoop]` (flat) | `[MacroLoop.Timing]`, `[MacroLoop.URLs]`, `[MacroLoop.XPaths]`, `[MacroLoop.ElementIDs]`, `[MacroLoop.Shortcuts]` |
| `[CreditStatus]` (flat) | `[CreditStatus.API]`, `[CreditStatus.Timing]`, `[CreditStatus.Retry]`, `[CreditStatus.XPaths]`, `[CreditStatus.ElementIDs]` |
| `[AHK]` (flat) | `[AHK.Timing]` |

### Config-Driven Element Descriptors (v6.55+)

Each ComboSwitch element (Transfer, Combo1, Combo2, Options, Confirm) now has a dedicated config section with 6 fallback fields:

```ini
[ComboSwitch.Transfer]
TextMatch=Transfer|Transfer project    ; Pipe-separated text matches
Tag=button                              ; HTML tag to scan
Selector=                               ; CSS selector(s), pipe-separated
AriaLabel=Transfer                      ; ARIA label match
HeadingSearch=transfer                  ; Heading proximity search
Role=                                   ; ARIA role attribute
```

These are loaded by `LoadElementDescriptor(prefix)` in `ConfigUtils.ahk` using dynamic variable interpolation (`%prefix%TextMatch`), and injected into `combo.js` via 30 placeholder replacements (`__TRANSFER_TEXT_MATCH__`, `__COMBO1_TAG__`, etc.).

### Centralized Constants (v6.56+)

All INI key names and default values are defined in dedicated constant files under `Config/Constants/`:
- **Keys files** (e.g., `ComboKeys.ahk`): Define string constants for INI key names
- **Defaults files** (e.g., `ComboDefaults.ahk`): Define default values used when INI keys are missing
- **Sections.ahk**: Section name strings (`SEC_HOTKEYS`, `SEC_COMBO_XPATHS`, etc.)

This eliminates magic strings and ensures consistency between config loading and validation.

### Combo.ahk Element Descriptor Globals (v7.0)

`Combo.ahk` declares 30 element descriptor globals at file scope (with empty-string init to suppress `#Warn` for dynamic `%prefix%` assignments) and redeclares them inside `RunCombo()` for function-scope access:

```autohotkey
; File scope — suppresses #Warn
global TransferTextMatch := "", TransferTag := "", ...

RunCombo(direction) {
    ; Function scope — required for AHK v2 to see the globals
    global TransferTextMatch, TransferTag, ...
    ; ... placeholder replacements use these values
}
```

### Documentation Reorganization (v7.0)

All markdown documentation moved from project root to `specs/` subfolder:
- `specs/SPEC.md` — Technical specification
- `specs/MEMORY.md` — Learning document
- `specs/README.md` — Quick start guide
- `specs/spec-issues-v6.55.md` — v6.55 issue tracker
- `specs/spec-issues-v6.56.md` — v6.56 issue tracker

`Automator.ahk` tray menu paths updated to reference `specs\` subfolder.