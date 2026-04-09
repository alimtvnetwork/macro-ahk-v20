# MEMORY.md - Automator v7.5 Learning Document

## Project Evolution

### V1 (AHK v2)
- Excellent tray icon with human-readable hotkey labels
- Working ComboSwitch (combo.js)
- Uses `InjectJSGet()` with `prompt()` - **PROBLEM: shows popup**
- Looping via Macro.ahk - had issues

### V2 (AHK v1)
- Tab cycling approach for settings
- More complex tab management
- Settings-combo.js for settings page handling

### V3 (AHK v1)
- Formal modular structure
- AutoLoop with tab management
- **Issues**: Looping unreliable, tab cycling fails

### V4 (AHK v2)
- Based on V1's foundation (excellent tray icon)
- **Single embedded script** approach
- **No prompts/alerts** - console.error only with error codes
- **Configurable IDs** in config.ini
- **UI buttons** (Up/Down) created on page
- **DevTools opened once** - reused for all injections
- Direct navigation instead of tab cycling

### V4.1 (AHK v2)
- All V4 features plus:
- **JS Executor Textbox** - visible textarea near Transfer button
- **Execute button** for running arbitrary JS
- **Ctrl+Enter** shortcut in textbox
- **AHK uses textbox** after initial embed (no DevTools for subsequent calls)
- **window.__executeJs()** global function exposed

## Key Design Decisions

### 1. Single Embedded Script
**Problem**: Multiple JS injections caused:
- Slower execution
- Race conditions
- Script conflicts

**Solution**: One `combo.js` that:
- Embeds itself as marker element
- Creates UI buttons once
- Creates JS executor textbox
- Exposes `window.__comboSwitch()` globally
- Exposes `window.__executeJs()` globally
- Subsequent calls just click buttons or use textbox

### 2. No Prompts/Alerts
**Problem**: 
- `InjectJSGet()` used `prompt()` → annoying dialog
- `alert()` used for errors → interrupts user

**Solution**: 
- Fire-and-forget injection only
- Get URL via address bar (Ctrl+L, Ctrl+C)
- **console.error()** with error codes for debugging
- **NO alert() anywhere in code**

### 3. DevTools Opened Once (Initial Embed Only)
**Problem**: Script sent `Ctrl+Shift+J` every injection → multiple DevTools windows

**Solution** (JsInject.ahk):
```autohotkey
global devToolsOpened := false
global scriptEmbedded := false

InjectJS(js) {
    if scriptEmbedded {
        ; Use textbox method - faster, no DevTools needed
        InjectViaTextbox(js)
        return
    }
    ; First time only: Use DevTools to embed combo.js
    InjectViaDevTools(js)
    scriptEmbedded := true
}
```

### 4. JS Executor Textbox (NEW in V4.1)
**Problem**: DevTools console is cumbersome for AHK automation

**Solution**: Embedded textbox on the page:
- Visible textarea near Transfer button
- Green "Run" button to execute
- Ctrl+Enter keyboard shortcut
- `window.__executeJs()` function for AHK
- AHK sets textbox value and calls execute function

### 5. Configurable IDs
**Problem**: Hardcoded IDs in multiple files

**Solution**: All IDs in `config.ini`:
```ini
ScriptMarkerId=ahk-combo-script
ButtonContainerId=ahk-combo-btn-container
ButtonUpId=ahk-combo-up-btn
ButtonDownId=ahk-combo-down-btn
JsExecutorId=ahk-js-executor
JsExecuteBtnId=ahk-js-execute-btn
```

### 6. Error Codes System
**Problem**: Errors hard to track, no context

**Solution**: Every error has unique code:

| Code | Description | File | Location |
|------|-------------|------|----------|
| E001 | Script already embedded | combo.js | Line ~30 |
| E002 | Transfer button not found | combo.js | Step 1 |
| E003 | Combo 1 text not found | combo.js | Step 2 |
| E004 | Combo 2 button not found | combo.js | Step 3 |
| E005 | Dropdown did not open | combo.js | Step 4 |
| E006 | Options container not found | combo.js | Step 5 |
| E007 | Current project not in options | combo.js | Step 6 |
| E008 | Confirm button not found | combo.js | Step 8 |
| E009 | Parent element not found | combo.js | createUI() |
| E010 | Invalid XPath | combo.js | getNodeByXPath() |
| E011 | JS Executor textbox not found | combo.js | executeJsFromTextbox() |

### 7. Direct Navigation for AutoLoop
**Problem**: V3's tab cycling was unreliable

**Solution**: Navigate directly to settings URL:
```
currentUrl → strip query/hash → append /settings?tab=project
```

## Placeholder System

combo.js uses placeholders replaced by AHK:

| Placeholder | Config Key |
|-------------|------------|
| `__SCRIPT_MARKER_ID__` | ScriptMarkerId |
| `__BUTTON_CONTAINER_ID__` | ButtonContainerId |
| `__BUTTON_UP_ID__` | ButtonUpId |
| `__BUTTON_DOWN_ID__` | ButtonDownId |
| `__JS_EXECUTOR_ID__` | JsExecutorId |
| `__JS_EXECUTE_BTN_ID__` | JsExecuteBtnId |
| `__TRANSFER_XPATH__` | TransferButtonXPath |
| `__PROJECT_NAME_XPATH__` | ProjectNameXPath |
| `__COMBO1_XPATH__` | Combo1XPath |
| `__COMBO2_XPATH__` | Combo2ButtonXPath |
| `__OPTIONS_XPATH__` | OptionsContainerXPath |
| `__CONFIRM_XPATH__` | ConfirmButtonXPath |
| `__COMBO_POLL_INTERVAL_MS__` | ComboPollIntervalMs |
| `__COMBO_OPEN_MAX_ATTEMPTS__` | ComboOpenMaxAttempts |
| `__COMBO_WAIT_MAX_ATTEMPTS__` | ComboWaitMaxAttempts |

## Flow Summary

### ComboSwitch (Ctrl+Down/Up)
```
1. AHK: Try click button by ID (fast path)
2. AHK: Embed combo.js (if needed) via DevTools
3. combo.js: Check if already embedded (E001)
4. combo.js: Create marker + UI (buttons + JS executor)
5. combo.js: Expose window.__comboSwitch() and window.__executeJs()
6. On button click: Run 8-step combo process
```

### JS Executor (NEW in V4.1)
```
1. User types JS in textbox OR AHK pastes code
2. User clicks Run OR presses Ctrl+Enter OR AHK calls window.__executeJs()
3. Code is executed via eval()
4. Results logged to console
```

### AutoLoop (Ctrl+Shift+Alt+Down/Up)
```
1. Check domain via address bar
2. Start timer
3. Each tick:
   - Inject loop JS via textbox (after embed)
   - If busy: click suggestion → execute
   - If idle: navigate to settings → run combo → go back
```

## Console Output Format

### Success:
```
[ComboSwitch] Step 1: Transfer button clicked     (color: lime)
[ComboSwitch] Step 2: Source project = "MyApp"    (color: lime)
```

### Error:
```
[ComboSwitch] E002: Transfer button not found | XPath: /html/...
[ComboSwitch] E007: Current project not found | Source "MyApp" not in options list
```

### Info:
```
[ComboSwitch] Waiting for Combo 1 text... (3/20)
[ComboSwitch] Options: Project A, Project B, Project C
```

### JS Executor:
```
[JS Executor] Executing...                        (color: orange)
[JS Executor] ✓ Execution complete                (color: lime)
[JS Executor] Error: <error message>              (console.error)
```

## Common Issues & Fixes

| Issue | Error Code | Cause | Fix |
|-------|------------|-------|-----|
| **Multiple consoles** | N/A | **F6 opens NEW panels** | **CRITICAL FIX: Use Ctrl+L, not F6** |
| Multiple DevTools | N/A | Ctrl+Shift+J sent repeatedly | Fixed: `devToolsOpened` flag |
| Alert popup | N/A | `alert()` in JS | Fixed: Removed all alerts |
| AHK_RESULT popup | N/A | `InjectJSGet()` uses prompt | Fixed: Removed function |
| Transfer not found | E002 | XPath changed | Update config.ini |
| Combo 1 not found | E003 | Modal didn't open | Check TransferButtonXPath |
| Dropdown won't open | E005 | Button not clickable | Increase attempts |
| Project not in list | E007 | Partial match failed | Check spelling |
| JS Executor not found | E011 | UI not created | Refresh and re-embed |

## CRITICAL FIX: F6 Multiple Console Issue (2026-02-17)

### Problem
**Every hotkey press was opening a NEW console panel in Chrome DevTools** instead of reusing the same one.

### Root Cause
**`Send("{F6}")` was called on every paste operation.** In Chrome DevTools:
- F6 **cycles between different panels**
- F6 can **open ADDITIONAL console areas**
- This creates **multiple console instances**

### Where F6 Was Used
1. `JsInject.ahk` line 55: `Send("{F6}")` - sent before every paste
2. `Combo.ahk` `PasteAndExecuteCombo()` - sent F6 to "focus console"

### Solution Implemented (FINAL)
1. **REMOVED ALL focus keys** (F6 and Ctrl+L) - NOT needed and DANGEROUS!
2. **REMOVED Ctrl+Shift+J** - AHK NEVER opens DevTools!
3. User must **open DevTools manually ONCE** and keep it open
4. Script just pastes directly: **Ctrl+A → Ctrl+V → Enter**
5. This prevents multiple DevTools windows from script restarts

### Why This is the ONLY Solution:
- `devToolsOpened` flag **RESETS every time script restarts**
- User edits AHK → script reloads → devToolsOpened=false → opens ANOTHER DevTools
- **Ctrl+Shift+J is a TOGGLE** - sends it twice = closes then reopens = confusion
- **Solution**: AHK NEVER touches DevTools opening - user does it manually ONCE

### Modified Files
- `marco-script-ahk-v4/Includes/Combo.ahk` - Removed ALL DevTools opening logic
- `marco-script-ahk-v4/SPEC.md` - Documented fix + troubleshooting
- `marco-script-ahk-v4/MEMORY.md` - This section

### Key Takeaway
**AHK MUST NEVER OPEN DEVTOOLS!**

| Action | Who Does It | Why |
|--------|-------------|-----|
| Open DevTools | **USER manually** | Prevents multiple windows |
| Paste JS code | **AHK automatically** | Ctrl+A, Ctrl+V, Enter |
| Close DevTools | **USER manually** | AHK never closes it |

**User opens DevTools ONCE with Ctrl+Shift+J, then leaves it open. AHK just uses it.**

### Logging Updated
Now logs minimal operations:
- ~~`>>> SENDING Ctrl+Shift+J <<<`~~ **REMOVED - AHK never opens DevTools**
- `>>> SENDING Ctrl+A to select all in console <<<`
- `>>> SENDING Ctrl+V to paste <<<`
- `>>> SENDING Enter to execute <<<`

**AHK assumes DevTools is already open and just pastes directly!**

## Testing Checklist

### Core Functionality
- [ ] First combo press → creates UI (buttons + textbox, no multiple DevTools)
- [ ] Second combo press → clicks existing button (fast)
- [ ] No alert dialogs appear
- [ ] No prompt dialogs appear
- [ ] Errors show in console with error codes
- [ ] Error codes match this document
- [ ] Buttons styled correctly (blue up, dark down)
- [ ] JS Executor textbox visible and functional
- [ ] Ctrl+Enter executes code in textbox
- [ ] Run button executes code
- [ ] AutoLoop starts/stops correctly
- [ ] Tray icon updates on loop state
- [ ] Esc stops loop or exits

### DevTools Console Focus (v7.6)
Test injection with DevTools open on each panel — Console must be focused before paste:

| Scenario | Steps | Expected |
|----------|-------|----------|
| **DevTools closed** | Trigger combo shortcut | Ctrl+Shift+J opens DevTools on Console; JS executes |
| **Elements tab active** | Open DevTools → Elements tab → trigger combo | F12 closes → Ctrl+Shift+J reopens on Console; JS executes |
| **Network tab active** | Open DevTools → Network tab → trigger combo | F12 closes → Ctrl+Shift+J reopens on Console; JS executes |
| **Sources tab active** | Open DevTools → Sources tab → trigger combo | F12 closes → Ctrl+Shift+J reopens on Console; JS executes |
| **Console tab active** | Open DevTools → Console tab → trigger combo | F12 closes → Ctrl+Shift+J reopens on Console; JS executes (no toggle-close) |
| **Rapid double-press** | Trigger combo twice quickly | Both injections succeed; no DevTools flicker or double-close |
| **After manual close** | Open DevTools → close manually (F12) → trigger combo | First-time path fires (devToolsOpened=false); Console opens fresh |

## Files Overview

| File | Purpose |
|------|---------||
| Automator.ahk | Main entry, tray menu, hotkeys |
| Config.ahk | Read config.ini (including JS executor IDs) |
| JsInject.ahk | DevTools once + textbox injection |
| ExportCompiledJS.ahk | Export compiled JS to logs/ + clipboard (generic SaveCompiledJS + per-script wrappers) |
| Combo.ahk | Click button or embed script; BuildComboJS() for reusable placeholder resolution |
| AutoLoop.ahk | Loop automation |
| Gmail.ahk | Gmail search |
| HotkeyFormat.ahk | Readable hotkey labels |
| combo.js | Embedded script with error codes + JS executor |
| config.ini | All configuration |

## V4.9 Changes (2026-02-17) - Logging & UI Overhaul

### Comprehensive Logging Standards
- Every action logged BEFORE executing across all AHK and JS files
- `GetCallerInfo()` in Utils.ahk dynamically extracts function name and line number from `Error("trace").Stack`
- `SubLog()` for indented sub-actions showing hierarchy
- `LogKeyPress()` formats keys via `FormatHotkeyLabel()` for human-readable output (e.g., `^+j` -> `Ctrl+Shift+J`)
- All boolean variables use `is`/`has` prefix (e.g., `isRunning`, `hasContainer`, `isTransferFound`)
- No `not` in if conditions - always inverted to meaningful positive variable names
- WARNING comments on every function that calls shortcuts or external things

### Robust Transfer Button Detection
- `findTransferButton()` in combo.js tries 4 methods in order:
  1. Configured XPath from config.ini
  2. Text-based button scan (all `<button>` elements with "Transfer" text)
  3. Heading proximity search (find heading with "transfer", walk parent tree for nearest button)
  4. ARIA label matching (`aria-label`, `title` attributes)
- Fixes the brittle XPath that broke when lovable.dev updated its DOM

### Floating/Draggable Controller UIs
- Both ComboSwitch (combo.js) and MacroLoop (macro-looping.js) panels are draggable
- Header bar is the drag handle (cursor: grab)
- On first drag, panel switches to `position: fixed` and detaches from DOM flow
- Click vs drag distinguished by 5px movement threshold
- Panels can be placed anywhere on the page

### Hide/Minimize for Both Panels
- `[ - ]` minimizes (collapses body, keeps header visible)
- `[ + ]` expands back
- `[ x ]` hides completely
- `Ctrl+Alt+H` restores hidden panels

### MacroLoop Keyboard Shortcuts
- `Ctrl+Alt+Up` - Toggle loop UP (start if stopped, stop if running)
- `Ctrl+Alt+Down` - Toggle loop DOWN
- `Ctrl+Alt+H` - Show/hide MacroLoop panel

### Fresh Logs on Startup
- `Automator.ahk` deletes and recreates `logs/` folder before `LoadConfig()`
- Every session starts with clean logs

### Files Modified in v4.9
| File | Changes |
|------|---------|
| Utils.ahk | Added GetCallerInfo(), SubLog(), LogKeyPress() |
| Config.ahk | Per-section logging with SubLog |
| JsInject.ahk | LogKeyPress before every Send(), WARNING comments |
| Combo.ahk | Full logging, is/has naming, WARNING comments |
| MacroLoop.ahk | Full logging, WARNING comments |
| Automator.ahk | Logs cleanup, hotkey logging |
| combo.js | findTransferButton(), draggable, [functionName] in logs |
| macro-looping.js | Draggable, hide/minimize, keyboard shortcuts |
| Gmail.ahk | Logging standards verified |
| AutoLoop.ahk | Logging standards verified |

## V5.2 Changes (2026-02-18) - Fast Path Recovery & Exponential Backoff

### Three-Tier Fast Path (sessionStorage Self-Healing)
After a page refresh, `combo.js` is lost from memory. V5.2 adds a tiered recovery system in `Combo.ahk`:

1. **Direct Call** (~35 chars): `window.__comboSwitch('down')` — if function exists, instant execution
2. **sessionStorage Recovery** (~200 chars): `eval()` cached source from `sessionStorage.__combo_src__` — avoids full 40KB re-paste
3. **Full Injection** (40KB): Read `combo.js` from disk and paste via DevTools — last resort

#### Title-Marker Signaling
JS communicates state back to AHK via temporary `document.title` markers:
- `__AHK_REINJECT__` — direct call failed, need recovery
- `__AHK_RECOVERED__` — sessionStorage recovery succeeded
- `__AHK_NO_CACHE__` — no cache found, need full injection

#### Self-Caching in combo.js
- Removed `'use strict'` to allow `arguments.callee.toString()`
- On init: `sessionStorage.setItem('__combo_src__', '(' + arguments.callee.toString() + ')()')`
- Recovered script checks `window.__comboRecoverDirection` for direction override

### Exponential Backoff for Credit Status API
`checkCreditsViaApi()` now retries with exponential backoff before falling back to DOM scraping:
- Uses `MaxRetries` and `RetryBackoffMs` from `config.ini`
- Delay formula: `RetryBackoffMs * 2^attempt` (e.g., 1000ms → 2000ms → 4000ms)
- Recursive `attemptFetch()` pattern with attempt counter
- Falls back to `checkCreditsViaDom()` only after all retries exhausted

### Files Modified in v5.2
| File | Changes |
|------|---------|
| combo.js | sessionStorage caching, `__comboRecoverDirection`, exponential backoff retry |
| Combo.ahk | Three-tier fast path with title-marker signaling |
| Automator.ahk | Version bump to 5.2 |
| AutoLoop.ahk | Version bump to 5.2 |
| config.ini | Version bump to 5.2 |
| SPEC.md | Documented fast path, backoff retry, version comparison |
| README.md | Version bump to 5.2 |

### MutationObserver UI Persistence (combo.js)
Injected UI panels (ComboSwitch controller, MacroLoop panel) survive SPA navigation and React re-renders:
- `MutationObserver` watches `document.body` for `childList` + `subtree` changes
- On each mutation batch, checks if the controller container (`#ahk-combo-btn-container`) was removed
- 500ms debounce prevents rapid re-injection during DOM churn
- Re-injection calls `createControllerUI()` which rebuilds the full panel with buttons, drag handle, and event listeners
- Observer is registered once at script init and persists for the page lifetime

### Visual Retry Indicator (combo.js)
During exponential backoff retries in `checkCreditsViaApi()`:
- Updates `#ahk-credit-display` with yellow "Retrying (X/Y)..." text
- Shows error message and countdown to next attempt in smaller gray text
- Provides real-time feedback instead of silent retries

### JS Command History (combo.js)
Tracks executed JS commands with results for recall and review:
- `jsHistory` array stores last 20 commands with timestamp, code, success/fail, and result text
- Consecutive duplicates are suppressed
- `#ahk-js-history` UI panel shows entries with green check/red X status, click to recall into textbox
- Up/Down arrow keys in textbox navigate history (only when content is single-line)
- `jsHistoryIndex` tracks current navigation position, resets on new execution

### Config Hot-Reload (Config.ahk)
AHK watches `config.ini` for file modification timestamp changes:
- `StartConfigWatcher()` called after initial `LoadConfig()` in `Automator.ahk`
- `CheckConfigModified()` polls via `SetTimer` at `ConfigWatchIntervalMs` (default 2000ms, 0=disabled)
- Compares `FileGetTime(configFile, "M")` against stored timestamp
- On change: re-runs `LoadConfig()` to refresh all globals, shows TrayTip
- Limitation: hotkey re-registration requires manual script reload

## Future Improvements

1. ~~**Persist buttons across navigation** - MutationObserver~~ ✅ Done
2. ~~**Visual feedback** - button highlight during execution~~ ✅ Done
3. ~~**Error notifications** - tray tip on failure~~ ✅ Done
4. **Auto-retry** - retry failed steps automatically
5. **XPath auto-detect** - detect XPaths dynamically (partially done for Transfer button)
6. ~~**History** - keep history of executed JS in textbox~~ ✅ Done
7. ~~**Config hot-reload** - watch config.ini for changes without restart~~ ✅ Done
8. ~~**Multi-method XPath** - extend findTransferButton() approach to all XPaths~~ ✅ Done

## V5.3 Changes (2026-02-18) - Multi-Method XPath & Hotkey Fix

### Multi-Method XPath for All Elements (combo.js)
Extended the `findElement()` + `ELEMENTS` descriptor system to all XPath-dependent elements:
- `ELEMENTS.TRANSFER`: xpath, textMatch, ariaLabel, headingSearch
- `ELEMENTS.COMBO1`: xpath, selector (dialog `p` elements)
- `ELEMENTS.COMBO2`: xpath, selector, role (combobox)
- `ELEMENTS.OPTIONS`: xpath, selector, role (listbox)
- `ELEMENTS.CONFIRM`: xpath, textMatch, selector (dialog buttons)
All `pollForElement()` calls now use descriptors instead of raw XPaths, with 5-method fallback.

### Ctrl+Shift+Down Hotkey Fix (MacroLoop.ahk)
**Bug**: Pressing Ctrl+Shift+Down (MacroLoop toggle) would activate the browser and type JS code into the page content instead of the DevTools console.
**Root Cause**: The `devToolsOpened` global flag was shared between ComboSwitch and MacroLoop. After ComboSwitch set it to `true` on the settings tab, switching to a project tab and pressing the MacroLoop hotkey would skip opening DevTools (thinking it was already open), causing `F6` to focus page content instead of the console.
**Fix**:
1. Added domain + page validation at the start of `ToggleMacroLoop()` — aborts if not on `lovable.dev` or not on a `/projects/` page
2. Reset `devToolsOpened = false` before `EmbedMacroLoopScript()` to force DevTools re-open in the current tab

### Files Modified in v5.3
| File | Changes |
|------|---------|
| combo.js | ELEMENTS descriptors with multi-method fallback for all elements |
| MacroLoop.ahk | Page validation + devToolsOpened reset in ToggleMacroLoop |
| Automator.ahk | Version bump to 5.3 |
| config.ini | Version bump to 5.3 |
| README.md | Version bump to 5.3 |
| SPEC.md | Version bump to 5.3, documented multi-method XPath |
| MEMORY.md | This section |
9. ~~**Visual retry indicator** - show "Retrying (2/3)..." in credit status display during backoff~~ ✅ Done

## V5.4 Changes (2026-02-18) - Escape Hotkey & LogKeyPress Fix

### Critical Fix #1: Esc Hotkey Intercepting Programmatic Send
**Bug**: Pressing Ctrl+Shift+Down killed the app immediately. The script never reached JS injection.
**Root Cause**: `GetCurrentUrl()` sends `{Escape}` to close the address bar after copying the URL. The global `Esc::` hotkey in Automator.ahk intercepted this programmatic `{Escape}`, and since MacroLoop wasn't running yet (`macroLoopRunning=0`), it called `ExitApp()`.
**Evidence from logs**:
```
Sending key: {Escape} (Close address bar)
Esc pressed: exiting app     ← App died here, never reached injection
```
**Fix**: Changed `Esc::` to `$Esc::` — the `$` prefix uses the keyboard hook so only **physical** key presses trigger the hotkey. Programmatic `Send("{Escape}")` is now ignored.

### Critical Fix #2: F6 Removed from JsInject.ahk
**Bug**: `F6` focuses the browser **address bar**, not the DevTools console.
**Fix**: Removed `F6` entirely. After `Ctrl+Shift+J`, console input is already focused. Subsequent calls use `Escape` to dismiss autocomplete.

### Enhancement: LogKeyPress Now Shows Actual Caller Location
**Problem**: `LogKeyPress` always logged `[Utils.ahk:259]` (its own location) instead of the file/line that called it.
**Fix**: Added `skipFrames` parameter to `GetCallerInfo(skipFrames)`. LogKeyPress uses `skipFrames=6` to resolve the actual caller through the stack chain: Error → GetCallerInfo → WriteLog → InfoLog → LogKeyPress → **[ACTUAL CALLER]**.
**Before**: `Sending key: Ctrl+Shift+J [Utils.ahk (259) : [LogKeyPress] ...]`
**After**: `Sending key: Ctrl+Shift+J [JsInject.ahk (53) : [InjectViaDevTools] ...]`

### Full Hotkey Audit - All Hotkeys Now Use `$` Prefix
**Problem**: User confirmed v5.3 was still running (log showed "Automator v5.3 startup complete"). The `$Esc::` fix was in the file but the script wasn't restarted.
**Additional conflicts found**:
- `Send("^{Up}")` in HandleDelegate → would trigger `^Up` (ComboUp) recursively
- `Send("^{Down}")` in HandleDelegate → would trigger `^Down` (ComboDown) recursively
**Fix**: ALL `Hotkey()` registrations now use `$` prefix:
- `$^Down`, `$^Up` (ComboSwitch)
- `$^+F9` (Gmail)
- `$^+Up`, `$^+Down` (MacroLoop)
- `$^+[`, `$^+]` (Interval adjust)
- `$Esc` (exit/stop)

### Files Modified in v5.4
| File | Changes |
|------|---------|
| JsInject.ahk | Removed F6, replaced with Escape for subsequent calls, updated header comments |
| Automator.ahk | ALL hotkeys now use `$` prefix, `$Esc::`, version strings updated to 5.4 |
| Utils.ahk | Added `skipFrames` param to `GetCallerInfo()`, LogKeyPress uses `skipFrames=6` with `callerOverride` |
| config.ini | Version bump to 5.4 |
| MEMORY.md | This section |

### Key Learning: `$` Prefix for AHK Hotkeys
When AHK scripts send keys programmatically (e.g., `Send("{Escape}")`), those synthetic keypresses can trigger AHK's own hotkeys. The `$` prefix forces the hotkey to use the keyboard hook, so only **physical** key presses activate it. **ALWAYS use `$` prefix on ALL hotkeys** to prevent self-triggering from any `Send()` call anywhere in the codebase.

### Key Learning: Restart AHK After File Changes
File changes on disk are NOT picked up by a running AHK instance. The user must **reload the script** (right-click tray icon → Reload Script, or restart) for changes to take effect. Config hot-reload only applies to config.ini values, not to .ahk code changes.

## V5.6 Changes (2026-02-18) - SubLog Format, XPath Logging, Scoping Fix

### SubLog Format Overhaul (Utils.ahk)
**Before**: `[2026-02-18 21:08:52] [INFO]   > ComboDown=^Down... [caller info]`
**After**: `  21:08:52 ComboDown=^Down...`
- SubLog now writes directly to log file (bypasses WriteLog/InfoLog)
- No `[INFO]` tag — the indentation makes the hierarchy clear
- No `>` arrow — just space indent + time + message
- No caller info — parent log already has it
- SubDebugLog follows the same format

### XPath Logging at Config Load (Config.ahk)
All 5 ComboSwitch XPaths are now logged individually at config load time:
```
  21:08:52 TransferXPath=/html/body/div[2]/...
  21:08:52 Combo1XPath=/html/body/div[6]/...
  21:08:52 Combo2XPath=/html/body/div[5]/...
  21:08:52 OptionsXPath=/html/body/div[6]/...
  21:08:52 ConfirmXPath=/html/body/div[5]/...
```

### Full XPath in findElement/findByXPath Logs (combo.js, macro-looping.js)
- `findByXPath()` now logs the FULL XPath (no truncation) on both FOUND and NOT FOUND
- `findElement()` Method 1 logs the full XPath with element name context
- Both combo.js and macro-looping.js updated

### Critical Bug Fix: devToolsOpened Scoping (Combo.ahk)
**Bug**: `devToolsOpened := false` at line 127 of RunCombo created a LOCAL variable because `devToolsOpened` was not in the `global` declaration list.
**Impact**: After a page refresh, the reset didn't propagate to the global `devToolsOpened` in JsInject.ahk. This could cause inconsistent DevTools state during recovery → full re-injection.
**Fix**: Added `devToolsOpened` to RunCombo's `global` declaration: `global browserExe, scriptEmbedded, devToolsOpened`

### JS SubLog Format (combo.js)
Changed from `> [funcName] message` to `funcName: message` for consistency with the cleaner sub-log style.

### Files Modified in v5.6
| File | Changes |
|------|---------|
| Utils.ahk | SubLog/SubDebugLog write directly, time-only format |
| Config.ahk | Individual XPath logging for all 5 ComboSwitch XPaths |
| Combo.ahk | Added devToolsOpened to RunCombo global declarations |
| combo.js | Full XPath in findByXPath/findElement, cleaner logSub format |
| macro-looping.js | Full XPath in findElement Method 1 |
| config.ini | Version bump to 5.6 |
| MEMORY.md | This section |

## V6.1 Changes (2026-02-18) - Delegate Fix & DevTools Collision

### Critical Fix #1: Duplicate State Object (macro-looping.js)
**Bug**: Lines 265-271 contained a duplicate partial `state` object definition from a bad merge.
**Impact**: Dead code that could confuse parsers and cause subtle issues.
**Fix**: Removed the duplicate lines.

### Critical Fix #2: GetCurrentUrl Fails When DevTools Is Focused (MacroLoop.ahk)
**Bug**: After embedding macro-looping.js via DevTools console, `HandleDelegate()` called `GetCurrentUrl()` which sends `Ctrl+L` to focus the address bar. But with DevTools console focused, `Ctrl+L` opens DevTools' "Go to Line" dialog instead of the browser address bar, causing `ClipWait` to timeout and return an empty URL.
**Evidence**: Activity log showed `Got URL: ` (empty) followed by `No project ID found in URL:`.
**Fix**: Added a new **Step 0** in `HandleDelegate()` that closes DevTools via `F12` (toggle off) and resets `devToolsOpened=false` before any URL reading. This ensures `Ctrl+L` reaches the browser address bar.

### Critical Fix #3: Stale Clipboard/Title Signals (MacroLoop.ahk)
**Bug**: When starting the clipboard poll, old `DELEGATE_UP`/`DELEGATE_DOWN` signals in the clipboard were immediately picked up, triggering HandleDelegate before the loop had even run its first cycle.
**Fix**: Before starting the poll, AHK now:
1. Clears stale clipboard signals (existing behavior)
2. Injects JS to clear stale `__AHK_DELEGATE_*` title markers (new)

### Key Learning: DevTools vs Address Bar Collision
When Chrome DevTools console is focused, `Ctrl+L` does NOT focus the address bar — it opens DevTools' "Go to Line" dialog. Any function that reads the URL via `Ctrl+L` + `Ctrl+C` MUST first close or defocus DevTools. The safest approach is `F12` (toggle DevTools off) + reset `devToolsOpened=false`.

### Files Modified in v6.1
| File | Changes |
|------|---------|
| macro-looping.js | Removed duplicate state object (lines 265-271) |
| MacroLoop.ahk | Step 0: close DevTools before URL read; clear title markers on poll start |
| config.ini | Version bump to 6.1 |
| MEMORY.md | This section |

## V6.2 Changes (2026-02-19) - Return-to-Project & Progress Bar Detection

### Critical Fix #1: GetCurrentUrl Fails During Step 5 Return (MacroLoop.ahk)
**Bug**: After RunComboSafe (Step 4) triggers combo on the settings tab, it re-opens DevTools via InjectJS (setting devToolsOpened=true). When Step 5 tries to read URLs via Ctrl+L to find the project tab, DevTools is focused, causing Ctrl+L to open "Go to Line" dialog instead of the address bar. All subsequent GetCurrentUrl calls return empty strings.
**Evidence**: Activity log showed `Got URL: ` (empty) for all 10 return tab searches, followed by `__delegateComplete` never being called on the correct tab.
**Fix**: Added **Step 5a** that closes DevTools (F12) and resets `devToolsOpened=false` before the return tab search loop, mirroring the Step 0 pattern.

### Critical Fix #2: Progress Bar Not Detected Despite Being Visible (macro-looping.js)
**Bug**: The 1-second wait after clicking the Project button was insufficient for the dialog UI to fully render the progress bar element. The progress bar XPath failed on every cycle even when free credits were available.
**Fix**: Made the wait configurable via `DialogWaitMs` in config.ini (default: 2000ms). The JS now reads `TIMING.DIALOG_WAIT` instead of using hardcoded 1000ms. Users can adjust this value if their connection is slower.

### Key Learning: DevTools Must Be Closed Before EVERY URL Read
Any sequence that calls InjectJS (which opens DevTools) followed by GetCurrentUrl will fail. The pattern is: always close DevTools via F12 + reset devToolsOpened=false before any Ctrl+L address bar operation.

### Files Modified in v6.2
| File | Changes |
|------|---------|
| MacroLoop.ahk | Step 5a: close DevTools before return tab search |
| macro-looping.js | Configurable dialog wait via TIMING.DIALOG_WAIT |
| Config.ahk | Load DialogWaitMs from config.ini |
| config.ini | Added DialogWaitMs=2000, version bump to 6.2 |
| MEMORY.md | This section |

## V6.45 Changes (2026-02-19) - Toggle-Close Fix, Double-Confirm & Prompt Guard

### Critical Fix #1: Toggle-Close Bug (macro-looping.js)
**Bug**: `clickProjectButton()` blindly clicked the project button every cycle. If the project dialog was already open (e.g., from a previous cycle or manual click), the click would **close** it instead of keeping it open, causing subsequent workspace name and progress bar checks to fail.
**Root Cause**: No inspection of dialog state before clicking.
**Fix**: Replaced `clickProjectButton()` with `ensureProjectDialogOpen()`:
- Checks `aria-expanded="true"` or `data-state="open"` on the button
- If already open → **skip click**, log "Dialog is ALREADY OPEN"
- If closed → click to open
- Eliminates accidental toggle-close during active loops

### Critical Fix #2: Double-Confirm Delegation (macro-looping.js)
**Bug**: Single credit check could produce false negatives due to dialog DOM not being fully rendered when the progress bar check ran (race condition with DialogWaitMs).
**Fix**: Two-pass verification before delegation:
1. **First check**: Open dialog → wait DialogWaitMs → check progress bar
2. If no credit found: **Re-open dialog** → wait DialogWaitMs again → **re-check** progress bar
3. Only delegate to AHK if BOTH checks confirm no free credit
- Logs `"DOUBLE-CONFIRM: Free credit found on re-check!"` if second pass catches a false negative
- Prevents unnecessary workspace switches when credit is actually available

### Enhancement #1: Passive Status Refresh (macro-looping.js)
**Before**: `refreshStatus()` (30s timer) opened the project dialog to check workspace name AND credit — even when the loop was stopped. This was disruptive to the user.
**After**: When loop is NOT running, `refreshStatus()` fetches the workspace name using a **one-time dialog open-and-close** (since the workspace XPath is inside the project dialog popover — see v6.46 fix below). Once cached, subsequent refreshes skip the dialog entirely. Credit checks only happen during active loop cycles.

### Enhancement #2: Prompt-Typing Guard (macro-looping.js)
**Problem**: When the user is typing a prompt to the AI, the loop's `runCycle()` or `refreshStatus()` would click the project button, stealing focus and disrupting typing.
**Fix**: New `isUserTypingInPrompt()` function:
- Reads `PromptActiveXPath` from config.ini (injected as `__LOOP_PROMPT_ACTIVE_XPATH__`)
- Checks if `document.activeElement` is inside the prompt form area
- If yes → skip the entire cycle/refresh, log "User is typing in prompt area — skipping"
- Both `runCycle()` and `refreshStatus()` are guarded

### Enhancement #3: Dynamic Version from config.ini (Automator.ahk)
**Before**: Hardcoded version strings (`v5.3`, `v5.5`) scattered across `Automator.ahk`.
**After**: All version displays read from `scriptVersion` variable (sourced from `[General] ScriptVersion` in config.ini):
- Tray icon tooltip: `Automator v6.45 - Ready`
- Startup TrayTip: `Automator v6.45 loaded`
- Error MsgBox titles: `Automator v6.45`
- Loop running tooltip: `Automator v6.45 - LOOP RUNNING (down)`

### Enhancement #4: Always-Visible Workspace Name (macro-looping.js)
Workspace name now displays in the status bar in BOTH running and stopped states:
- **Running**: Purple label above the cycle counter + credit status
- **Stopped**: Purple label above "Stopped | Cycles: N" line
- Updated via passive DOM read (no dialog required)

### Visibility-Based Credit Detection (macro-looping.js)
`checkSystemBusy()` now validates the progress bar with full visibility checks:
- `getBoundingClientRect()`: width > 0 AND height > 0
- `getComputedStyle()`: display !== 'none', visibility !== 'hidden', opacity !== '0'
- Elements that exist in DOM but are hidden/collapsed are correctly treated as "no credit"

### Updated Config Entries
| Entry | Section | Purpose |
|-------|---------|---------|
| `PromptActiveXPath` | [MacroLoop] | XPath of the prompt form area — skip cycles when user is typing |
| `WorkspaceNameXPath` | [MacroLoop] | Updated to `/html/body/div[6]/...` (was div[7]) |
| `ScriptVersion=6.45` | [General] | Display version (auto-synced from `AHK_BUILD_VERSION` on startup) |

### Cycle Flow (v6.45)
```
runCycle()
  |-- Step 0: isUserTypingInPrompt() → SKIP if typing
  |-- Step 1: ensureProjectDialogOpen() (skip click if aria-expanded=true)
  |-- Step 2: Wait DialogWaitMs
  |-- Step 3: fetchWorkspaceName() + First Credit Check (rect + styles)
  |-- Step 4: DOUBLE-CONFIRM (re-open + re-wait + re-check if Step 3 found no credit)
  |-- Step 5: If confirmed no credit → Delegate to AHK
```

### Files Modified in v6.45
| File | Changes |
|------|---------|
| macro-looping.js | ensureProjectDialogOpen(), double-confirm, isUserTypingInPrompt(), passive refreshStatus(), visibility checks |
| Automator.ahk | All version strings use scriptVersion variable |
| MacroLoop.ahk | Injects PromptActiveXPath placeholder |
| Config.ahk | Reads PromptActiveXPath from config.ini |
| config.ini | Added PromptActiveXPath, updated WorkspaceNameXPath, ScriptVersion=6.45 |
| SPEC.md | Documented v6.45 features, cycle flow, version comparison table |
| MEMORY.md | This section |

### Key Learnings
1. **Always check dialog state before clicking toggle buttons** — inspect `aria-expanded` / `data-state` attributes to avoid accidental close
2. **Double-confirm before destructive actions** — DOM rendering delays can cause false negatives; a second check after re-opening eliminates race conditions
3. **Workspace XPath is inside the dialog popover** — the element at `div[6]/div/div[2]/div[1]/p` only exists in the DOM when the project dialog is open (see v6.46 fix)
4. **Guard against user disruption** — check `document.activeElement` against known input areas before stealing focus

## V6.46 Changes (2026-02-19) - Workspace Name Caching Fix

### Critical Fix: Workspace Name Not Visible in Controller
**Bug**: After v6.45's "passive status refresh" change, the workspace name never appeared in the MacroLoop controller status bar. The `refreshStatus()` function called `fetchWorkspaceName()` without opening the project dialog, but the workspace XPath (`/html/body/div[6]/div/div[2]/div[1]/p`) points to an element **inside the project dialog popover**. That DOM element only exists when the dialog is open — passive reads always returned "element NOT FOUND."
**Root Cause**: Incorrect assumption that the workspace name element is always present in the DOM. It lives inside a Radix popover portal (`div[6]`) that is only mounted when the project button is expanded.
**Fix**: `refreshStatus()` now uses a **one-time fetch with dialog open/close**:
1. If `state.workspaceName` is already cached → use cached value, no dialog interaction
2. If not cached → call `ensureProjectDialogOpen()` to open the dialog
3. Wait `TIMING.DIALOG_WAIT` ms for the popover to render
4. Call `fetchWorkspaceName()` to read the workspace name from the now-present element
5. Close the dialog by clicking the project button again (check `aria-expanded` before clicking)
6. Cache the result in `state.workspaceName` — all future refreshes skip the dialog

### Key Learning: Radix Popover Portals
Elements inside Radix UI popovers (rendered as `div[N]` portals appended to `<body>`) are **not present in the DOM** until the popover is opened. Any XPath targeting these elements will fail unless the popover is first triggered. Always verify whether an XPath target is inside a portal before assuming passive DOM reads will work.

### Files Modified in v6.46
| File | Changes |
|------|---------|
| macro-looping.js | `refreshStatus()` rewritten: one-time dialog open/close with caching |
| MEMORY.md | This section, corrected v6.45 passive refresh documentation |

## V6.47 Changes (2026-02-19) - Workspace Auto-Check, Credit on Change, Default 50s Loop

### Enhancement #1: Workspace Auto-Check Every 5 Seconds (macro-looping.js)
**Before**: `refreshStatus()` ran every 30 seconds and only fetched the workspace name if it wasn't cached. Once cached, it never re-checked — workspace changes were invisible until a loop cycle ran.
**After**: `refreshStatus()` now runs every `WorkspaceCheckIntervalMs` (default 5000ms = 5 seconds) and **always** opens the project dialog to fetch the current workspace name and credit status. This means:
1. Opens project dialog via `ensureProjectDialogOpen()` (skips click if already open)
2. Waits `DialogWaitMs` for dialog to render
3. Calls `fetchWorkspaceName()` — detects name changes, records in workspace history
4. Calls `checkSystemBusy()` — updates credit status (free since dialog is already open)
5. Closes dialog via toggle click (checks `aria-expanded` first)

**Config**: `[MacroLoop] WorkspaceCheckIntervalMs=5000` — configurable via config.ini
**Placeholder**: `__WS_CHECK_INTERVAL_MS__` → injected into `TIMING.WS_CHECK_INTERVAL`

### Enhancement #2: Immediate Credit Check on Workspace Change
When the workspace name changes during auto-check, the credit status is immediately updated because the dialog is already open. The change is logged with both old and new names plus credit status: `Workspace changed during auto-check: "P01" -> "P02" | Credit: YES`

### Enhancement #3: Default Loop Interval Changed to 50 Seconds
**Before**: `[MacroLoop] LoopIntervalMs=15000` (15 seconds between cycles)
**After**: `[MacroLoop] LoopIntervalMs=50000` (50 seconds between cycles)
**Reason**: The 5-second workspace auto-check now handles real-time status monitoring. The main loop cycle (which triggers delegation) doesn't need to run as frequently.

### Updated Config Entries
| Entry | Section | Default | Purpose |
|-------|---------|---------|---------|
| `WorkspaceCheckIntervalMs` | [MacroLoop] | `5000` | How often to open dialog and check workspace name + credit (ms) |
| `LoopIntervalMs` | [MacroLoop] | `50000` | Main loop cycle interval (was 15000) |
| `ScriptVersion` | [General] | `6.47` | Version bump |

### localStorage Keys Used
| Key | Writer | Reader | Purpose |
|-----|--------|--------|---------|
| `ml_workspace_history` | macro-looping.js | macro-looping.js | Workspace change history (max 50 entries) |
| `ml_known_workspaces` | combo.js | macro-looping.js | All known workspace names from combo dialog |
| `ahk_macroloop_logs_*` | macro-looping.js | macro-looping.js | Per-project activity logs (max 500 entries) |

### AHK Placeholder Wiring for WorkspaceCheckIntervalMs
The `__WS_CHECK_INTERVAL_MS__` placeholder in `macro-looping.js` is wired through the AHK backend:

1. **Config.ahk** reads `WorkspaceCheckIntervalMs` from `[MacroLoop]` section:
   ```autohotkey
   global loopWsCheckIntervalMs := IniReadInt(configFile, "MacroLoop", "WorkspaceCheckIntervalMs", "5000")
   ```
   - Default: `5000` (5 seconds)
   - Logged at startup: `SubLog("LoopInterval: " loopIntervalMs "ms, WsCheck: " loopWsCheckIntervalMs "ms, Domain: " loopRequiredDomain)`

2. **MacroLoop.ahk** declares the global in `EmbedMacroLoopScript()`:
   ```autohotkey
   global loopPostComboDelayMs, loopPageLoadDelayMs, loopWsCheckIntervalMs
   ```
   And performs the replacement alongside other timing placeholders:
   ```autohotkey
   js := StrReplace(js, "__WS_CHECK_INTERVAL_MS__", loopWsCheckIntervalMs)
   ```

3. **macro-looping.js** receives the value in the `TIMING` object:
   ```javascript
   var TIMING = {
       WS_CHECK_INTERVAL: __WS_CHECK_INTERVAL_MS__,
       // ... other timing constants
   };
   ```

### Files Modified in v6.47
| File | Changes |
|------|---------|
| macro-looping.js | `TIMING.WS_CHECK_INTERVAL`, `refreshStatus()` always opens dialog + checks credit, uses configurable interval |
| combo.js | `saveKnownWorkspaces()` writes extracted workspace names to `ml_known_workspaces` in localStorage |
| Config.ahk | Added `loopWsCheckIntervalMs` read from `[MacroLoop] WorkspaceCheckIntervalMs`, logged in startup SubLog |
| MacroLoop.ahk | Added `loopWsCheckIntervalMs` to globals, added `__WS_CHECK_INTERVAL_MS__` StrReplace |
| config.ini | Added `WorkspaceCheckIntervalMs=5000`, changed `LoopIntervalMs=50000`, bumped `ScriptVersion=6.47` |
| SPEC.md | Documented workspace auto-check flow, updated placeholders table, updated version comparison table, updated UI layout diagram |
| MEMORY.md | This section |

### Key Learnings
1. **5s workspace auto-check is aggressive but necessary** — workspace changes are common during automation, and the user needs real-time visibility
2. **Credit check is "free" when dialog is already open** — since we're opening the dialog for workspace name anyway, checking the progress bar adds zero overhead
3. **Separate the monitoring interval from the action interval** — workspace monitoring (5s) is frequent but lightweight (just reads status), while the main loop cycle (50s) is heavier (triggers delegation)
4. **All XPaths inside Radix popovers require dialog to be open** — this is a fundamental constraint of the Lovable UI architecture

## V6.48 Changes (2026-02-19) - Poll-Based Dialog Detection & Auto-Close

### Problem: Fixed DialogWaitMs Was Too Slow and Dialog Left Open
**Before**: After clicking the project button, the system waited a fixed `DialogWaitMs` (2-3 seconds) regardless of whether the dialog had already rendered. The dialog was also sometimes left open, blocking user interaction.

### Solution: Two-XPath Strategy with Polling
Instead of a blind wait, v6.48 introduces two separate progress bar XPaths:

| XPath | Purpose | Always Present? |
|-------|---------|-----------------|
| `MainProgressXPath` (div/div[1]) | **Dialog ready signal** — appears as soon as the project dialog is fully loaded | YES (always in dialog) |
| `ProgressXPath` (div/div[2]) | **Free credit indicator** — only appears when free credits remain | NO (only when credits exist) |

#### Poll-Based Detection Flow:
```
ensureProjectDialogOpen()
  → pollForDialogReady()  (polls every 200ms for MainProgressXPath, max DialogWaitMs)
    → Main bar found? → Dialog is ready!
      → Check ProgressXPath (free credit bar)
        → Present? → Free credit exists
        → Absent? → No free credit (main bar confirms dialog IS loaded, so absence is definitive)
      → closeProjectDialog()  ← ALWAYS close after check
```

### `pollForDialogReady()` Implementation
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
      callback(); // Dialog is ready — proceed immediately
      return;
    }
    if (elapsed >= maxWait) {
      clearInterval(pollTimer);
      callback(); // Timeout fallback
    }
  }, pollInterval);
}
```

### `closeProjectDialog()` Helper
Extracted dialog close logic into a reusable function:
- Finds the project button (XPath + fallback)
- Checks `aria-expanded` / `data-state` before clicking
- Only clicks if dialog is actually open (prevents accidental re-open)
- Called after EVERY dialog check (both `runCycle` and `refreshStatus`)

### Updated Cycle Flow (v6.48)
```
runCycle()
  |-- Step 0: isUserTypingInPrompt() → SKIP if typing
  |-- Step 1: ensureProjectDialogOpen()
  |-- Step 2: pollForDialogReady() (polls for MainProgressXPath, ~200-1000ms typical)
  |-- Step 3: fetchWorkspaceName() + Check free credit bar
  |       |-- Credit found → closeProjectDialog() → done
  |-- Step 4: DOUBLE-CONFIRM (closeProjectDialog → re-open → pollForDialogReady → re-check)
  |       |-- Credit found on re-check → closeProjectDialog() → done
  |-- Step 5: closeProjectDialog() → Delegate to AHK
```

### Config Wiring for MainProgressXPath
1. **config.ini**: `[MacroLoop] MainProgressXPath=/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[1]`
2. **Config.ahk**: `global loopMainProgressXPath := IniRead(configFile, "MacroLoop", "MainProgressXPath", "")`
3. **MacroLoop.ahk**: `js := StrReplace(js, "__LOOP_MAIN_PROGRESS_XPATH__", loopMainProgressXPath)`
4. **macro-looping.js**: `CONFIG.MAIN_PROGRESS_XPATH: '__LOOP_MAIN_PROGRESS_XPATH__'`

### Files Modified in v6.48
| File | Changes |
|------|---------|
| macro-looping.js | Added `pollForDialogReady()`, `closeProjectDialog()`, `CONFIG.MAIN_PROGRESS_XPATH`; refactored `runCycle()` and `refreshStatus()` to poll instead of fixed wait; dialog always closed after check |
| Config.ahk | Added `loopMainProgressXPath` read from `[MacroLoop] MainProgressXPath` |
| MacroLoop.ahk | Added `loopMainProgressXPath` to globals, added `__LOOP_MAIN_PROGRESS_XPATH__` StrReplace |
| config.ini | Added `MainProgressXPath`, bumped `ScriptVersion=6.48` |
| MEMORY.md | This section |

### Key Learnings
1. **Two-XPath strategy eliminates false negatives**: The main progress bar (div[1]) ALWAYS appears in the dialog — its presence confirms the dialog is fully loaded. If the free credit bar (div[2]) is absent after the main bar is visible, it's a definitive "no credit" signal, not a rendering delay.
2. **Polling is faster than fixed wait**: Typical dialog render takes 400-800ms. Fixed wait of 2-3s was wasting 1-2s per check. Polling at 200ms intervals detects readiness within one poll cycle of actual render completion.
3. **Always close the dialog after checking**: Leaving the dialog open blocks user interaction and causes confusion. The `closeProjectDialog()` helper ensures cleanup in all code paths (success, failure, timeout).
4. **Fallback to fixed wait**: If `MainProgressXPath` is not configured or the placeholder isn't replaced, `pollForDialogReady()` falls back to `setTimeout(callback, TIMING.DIALOG_WAIT)` — backward compatible.

## V6.49 Changes (2026-02-19) - Delegate Race Condition & typeof Safety

### Critical Fix #1: Timer Re-Entrance in CheckClipboardForDelegate (MacroLoop.ahk)
**Bug**: During delegation, AHK's `HandleDelegate()` takes 10-30+ seconds (tab switching, combo execution, return). The 500ms `CheckClipboardForDelegate` timer is a pseudo-thread that can **interrupt** the running `HandleDelegate()`. When it re-entered, `GetCurrentUrl()` would read stale clipboard content left by `InjectJS()` (the title-clearing JS code), returning the JS code as the "URL".
**Evidence**: Error log showed `No project ID found in URL: document.title=document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__/g,'')` — the cleanup JS code was captured as the URL.
**Fix**: Added `global isHandlingDelegate` guard:
```autohotkey
global isHandlingDelegate := false

CheckClipboardForDelegate() {
    if isHandlingDelegate
        return  ; Skip — HandleDelegate is already running
    ...
}

HandleDelegate(direction) {
    isHandlingDelegate := true
    ...
    isHandlingDelegate := false  ; Reset in both success and catch paths
}
```

### Critical Fix #2: `__delegateComplete is not defined` ReferenceError (MacroLoop.ahk)
**Bug**: When AHK returns to the project tab after delegation, the page may have refreshed (SPA navigation, Lovable preview reload). The old `window.__delegateComplete` function no longer exists. AHK's `CallLoopFunction("__delegateComplete")` injects `__delegateComplete();` into the console, causing an uncaught ReferenceError.
**Evidence**: Chrome DevTools console showed `Uncaught ReferenceError: __delegateComplete is not defined` at VM195:1 and VM206:1.
**Fix**: `CallLoopFunction()` now wraps ALL JS calls with a `typeof` guard:
```autohotkey
; Before:
js := funcName "();"

; After:
js := "if(typeof " funcName "==='function'){" funcName "();}else{console.warn('" funcName " not defined');}"
```
This applies to all functions called via `CallLoopFunction`, not just `__delegateComplete`.

### Files Modified in v6.49
| File | Changes |
|------|---------|
| MacroLoop.ahk | Added `isHandlingDelegate` guard in `CheckClipboardForDelegate()` and `HandleDelegate()`; `CallLoopFunction()` wraps JS calls with `typeof` guard |
| MEMORY.md | This section |

### Key Learnings
1. **AHK timers are pseudo-threads that can interrupt** — any long-running function (like `HandleDelegate`) can be interrupted by a timer callback. Always use re-entrance guards for timer-driven state machines.
2. **Clipboard is a shared resource** — `InjectJS()` temporarily overwrites the clipboard with JS code. If another function reads the clipboard during that window (even after restoration), race conditions can occur.
3. **Page refreshes destroy window globals** — SPA navigations or preview reloads wipe `window.__delegateComplete` and other globals. Always use `typeof` checks before calling injected global functions from AHK.
4. **typeof guard is cheap insurance** — wrapping every `CallLoopFunction` call costs nothing at runtime but prevents cascading ReferenceErrors that leave the system in a broken state.

## V6.50 Changes (2026-02-19) - Re-Inject Before __delegateComplete

### Critical Fix: __delegateComplete Still Not Defined After typeof Guard (MacroLoop.ahk)
**Bug**: The v6.49 `typeof` guard prevented the crash, but `__delegateComplete` was still never actually called — the `console.warn` fired every time, meaning the loop never resumed after delegation. The function doesn't exist because the page refreshed during the 10-30s delegation process, wiping all injected globals.
**Evidence**: Chrome DevTools console showed `__delegateComplete not defined` warning (from the typeof guard) instead of the function executing.
**Root Cause**: `HandleDelegate()` called `CallLoopFunction("__delegateComplete")` immediately after returning to the project tab, but the macro-looping.js script was no longer in memory due to page refresh.
**Fix**: Added **Step 6b** in `HandleDelegate()` — re-inject the full macro-looping.js script via `EmbedMacroLoopScript()` before calling `__delegateComplete`:

```autohotkey
; Step 6: Reset devToolsOpened for project tab
devToolsOpened := false
Sleep(500)

; Step 6b: Re-inject macro-looping.js (page may have refreshed)
EmbedMacroLoopScript()
Sleep(1000)

; Now __delegateComplete exists again
CallLoopFunction("__delegateComplete")
```

**Why this works**: `EmbedMacroLoopScript()` reads `macro-looping.js` from disk, replaces all `__PLACEHOLDER__` values from config.ini, and injects via `InjectJS()`. The script's teardown-and-replace pattern means it safely re-initializes even if a partial instance exists. After injection, all globals (`__delegateComplete`, `__loopStart`, `__loopStop`, etc.) are available again.

### HandleDelegate Flow (Updated v6.50)
```
HandleDelegate(direction)
    |-- isHandlingDelegate = true (re-entrance guard)
    |-- Step 0: Close DevTools (F12) + reset devToolsOpened
    |-- Step 1: GetCurrentUrl() → ExtractProjectId()
    |-- Step 2: Search for settings tab (Ctrl+Tab loop)
    |-- Step 3: Focus web page, reset devToolsOpened for settings tab
    |-- Step 4: RunComboSafe(direction) → wait 3s
    |-- Step 5a: Close DevTools (F12) before return tab search
    |-- Step 5b: Search for project tab (Ctrl+Shift+Tab loop)
    |-- Step 6: Reset devToolsOpened for project tab
    |-- Step 6b: EmbedMacroLoopScript() ← NEW (re-inject after page refresh)
    |-- Step 7: CallLoopFunction("__delegateComplete")
    |-- Clear stale signals (clipboard + title markers)
    |-- isHandlingDelegate = false
```

### Files Modified in v6.50
| File | Changes |
|------|---------|
| MacroLoop.ahk | Added Step 6b: `EmbedMacroLoopScript()` + 1s settle before `__delegateComplete` call |
| MEMORY.md | This section |

### Key Learning
5. **typeof guard is necessary but not sufficient** — it prevents crashes but doesn't fix the root cause. If a function is expected to exist, the script that defines it must be re-injected before calling it. The typeof guard serves as a safety net for edge cases where re-injection also fails.

## V6.51 Changes (2026-02-19) - Settle Delay & Auto-Check Removal

### Critical Fix #1: 500ms Settle Delay in pollForDialogReady() (macro-looping.js)
**Bug**: `checkSystemBusy()` executed immediately after `MainProgressXPath` was detected, but the optional free credit progress bar (`ProgressXPath`) hadn't finished rendering yet. The Radix portal needs additional time to mount sibling elements after the main container appears.
**Evidence**: "All methods failed for Progress Bar" logged on every cycle even when free credits were available, because `findElement()` ran before the DOM was stable.
**Fix**: After `MainProgressXPath` is detected and `clearInterval` fires, a `setTimeout(callback, 500)` adds a 500ms settle delay before proceeding. This ensures the full dialog DOM (including optional free credit bar) is stable before credit checks run.

### Critical Fix #2: Removed Workspace Auto-Check (macro-looping.js)
**Bug**: `startStatusRefresh()` was auto-started on script injection, running `refreshStatus()` every `WorkspaceCheckIntervalMs` (default 5000ms = 5 seconds). This called `ensureProjectDialogOpen()` every 5 seconds, constantly clicking the project button, opening/closing the dialog, and disrupting the UI — even when the loop was stopped.
**Root Cause**: The auto-check was designed to passively monitor workspace name and credit status, but it requires opening the project dialog (workspace name lives inside the Radix popover). Opening the dialog every 5 seconds is extremely disruptive.
**Fix**: Removed the `startStatusRefresh()` call from the initialization block. Workspace name and credit status are now ONLY checked:
1. During active loop cycles (inside `runCycle()`)
2. Via manual "Check" button clicks
3. The `startStatusRefresh()` and `stopStatusRefresh()` functions remain available for future use if needed

### Cycle Flow (v6.51)
```
runCycle()
  |-- Step 0: isUserTypingInPrompt() → SKIP if typing
  |-- Step 1: ensureProjectDialogOpen() (skip click if aria-expanded=true)
  |-- Step 2: pollForDialogReady() — polls every 200ms for MainProgressXPath
  |       |-- Main bar found → wait 500ms settle delay (NEW in v6.51)
  |       |-- Timeout → proceed anyway
  |-- Step 3: fetchWorkspaceName() + First Credit Check (rect + styles)
  |-- Step 4: DOUBLE-CONFIRM (re-open + re-check if Step 3 found no credit)
  |-- Step 5: If confirmed no credit → Delegate to AHK
  |-- Step 6: closeProjectDialog() — always close after check
```

### Files Modified in v6.51
| File | Changes |
|------|---------|
| macro-looping.js | 500ms settle delay in pollForDialogReady(); removed auto-start of startStatusRefresh() |
| config.ini | Version bump to 6.51 |
| SPEC.md | Version bump to 6.51, updated pollForDialogReady documentation |
| MEMORY.md | This section |

### Key Learnings
6. **DOM sibling rendering is not atomic** — When a Radix portal mounts a dialog, the main container element may appear before its sibling children (like optional progress bars) are rendered. Always add a settle delay after detecting the parent before checking for children.
7. **Auto-check intervals that open UI dialogs are inherently disruptive** — Never auto-open UI elements on a timer unless the loop is actively running and requires that data. Passive monitoring should only read DOM state that exists without user interaction.

## V6.52 Changes (2026-02-19) - Lightweight Probe Optimizations

### Optimization #1: Combo Probe in HandleDelegate Step 4 (MacroLoop.ahk)
**Problem**: When HandleDelegate switches to the settings tab to run combo, it always called `RunComboSafe(direction)` which enters the full 3-tier injection path. Even with the fast path, it had overhead: the `scriptEmbedded` flag was set for the **project tab**, not the settings tab, so the probe/recovery logic would often do unnecessary work or a full 40KB re-injection.
**Fix**: Before calling RunComboSafe, inject a tiny probe (~120 chars):
```javascript
if(typeof window.__comboSwitch==='function'){
  window.__comboSwitch('down');
  document.title='__AHK_COMBO_PROBED__'+document.title
}else{
  document.title='__AHK_COMBO_MISSING__'+document.title
}
```
- AHK reads the title marker to determine the result
- If `__AHK_COMBO_PROBED__` → combo already present, called directly, **skip RunComboSafe entirely**
- If `__AHK_COMBO_MISSING__` → fall through to full RunComboSafe (40KB injection)
- Marker is cleaned up immediately after reading

### Optimization #2: MacroLoop Probe in HandleDelegate Step 6b (MacroLoop.ahk)
**Problem**: After returning to the project tab, `EmbedMacroLoopScript()` always re-injected the full ~50KB macro-looping.js + xpath-utils.js, even if the page hadn't refreshed and the script was still embedded.
**Fix**: Before calling EmbedMacroLoopScript, inject a tiny probe (~100 chars):
```javascript
if(typeof window.__delegateComplete==='function'){
  document.title='__AHK_LOOP_PROBED__'+document.title
}else{
  document.title='__AHK_LOOP_MISSING__'+document.title
}
```
- If `__AHK_LOOP_PROBED__` → script still present, **skip full re-injection**, call `__delegateComplete` directly
- If `__AHK_LOOP_MISSING__` → page was refreshed, do full `EmbedMacroLoopScript()` + 1s settle
- Marker is cleaned up immediately after reading

### Updated HandleDelegate Flow (v6.52)
```
HandleDelegate(direction)
  |-- Step 0: Close DevTools (F12) + reset devToolsOpened
  |-- Step 1: GetCurrentUrl() → ExtractProjectId()
  |-- Step 2: Search for settings tab (Ctrl+Tab loop)
  |-- Step 3: Focus web page, reset devToolsOpened
  |-- Step 4: PROBE for __comboSwitch (~120 chars)        ← NEW
  |     |-- FOUND → call directly, skip RunComboSafe
  |     |-- MISSING → RunComboSafe(direction) (full 40KB)
  |-- Step 5a: Close DevTools (F12)
  |-- Step 5b: Search for project tab (Ctrl+Shift+Tab loop)
  |-- Step 6: Reset devToolsOpened
  |-- Step 6b: PROBE for __delegateComplete (~100 chars)  ← NEW
  |     |-- FOUND → skip EmbedMacroLoopScript
  |     |-- MISSING → EmbedMacroLoopScript() (full ~50KB)
  |-- Step 7: CallLoopFunction("__delegateComplete")
  |-- Cleanup: Clear stale signals
```

### Performance Impact
| Scenario | Before v6.52 | After v6.52 |
|----------|-------------|-------------|
| Combo on settings tab (already embedded) | ~40KB inject via RunCombo fast path | ~120 char probe, direct call |
| Combo on settings tab (not embedded) | ~40KB inject | ~120 char probe + ~40KB inject |
| MacroLoop return (no page refresh) | ~50KB re-inject always | ~100 char probe, skip inject |
| MacroLoop return (page refreshed) | ~50KB re-inject | ~100 char probe + ~50KB re-inject |

### Title Marker Registry (Updated)
| Marker | Set By | Meaning |
|--------|--------|---------|
| `__AHK_REINJECT__` | combo.js fast path | `__comboSwitch` not found, need recovery |
| `__AHK_RECOVERED__` | combo.js sessionStorage | Cache recovery succeeded |
| `__AHK_NO_CACHE__` | combo.js sessionStorage | No cache, need full inject |
| `__AHK_DELEGATE_UP/DOWN__` | macro-looping.js | Delegation signal to AHK |
| `__AHK_COMBO_FAILED__<step>__` | combo.js | Combo failed at step |
| **`__AHK_COMBO_PROBED__`** | **Step 4 probe** | **combo.js exists on settings tab** |
| **`__AHK_COMBO_MISSING__`** | **Step 4 probe** | **combo.js NOT on settings tab** |
| **`__AHK_LOOP_PROBED__`** | **Step 6b probe** | **macro-looping.js exists on project tab** |
| **`__AHK_LOOP_MISSING__`** | **Step 6b probe** | **macro-looping.js NOT on project tab** |

### Files Modified in v6.52
| File | Changes |
|------|---------|
| MacroLoop.ahk | Step 4: combo probe before RunComboSafe; Step 6b: loop probe before EmbedMacroLoopScript |
| config.ini | Version bump to 6.52 |
| SPEC.md | Version bump to 6.52 |
| MEMORY.md | This section |

### Key Learnings
8. **Probe before inject** — Always check if a function exists on the current tab with a tiny `typeof` probe (~100 chars) before committing to a full script injection (~40-50KB). The probe cost is negligible compared to the full injection overhead (disk read + placeholder replacement + clipboard + paste + execute).
9. **Tab-specific state vs global flags** — AHK flags like `scriptEmbedded` track state per-session, not per-tab. When switching tabs during delegation, these flags become stale. Title-marker probes are the only reliable way to check per-tab JS state from AHK.

---

## v6.53 — Embedded URL in Title Signal + Delegation Failure Guard

**Date**: 2026-02-19

### Problem
HandleDelegate was failing 100% of the time because `GetCurrentUrl()` returned empty after F12 closed DevTools. The Ctrl+L/Ctrl+C address bar read is unreliable immediately after DevTools closure. This caused an infinite loop: JS delegates → AHK fails (empty URL) → calls __delegateComplete → JS re-delegates → repeat forever.

### Changes

| File | Change |
|------|--------|
| macro-looping.js | `dispatchDelegateSignal()` now embeds full `window.location.href` in title: `__AHK_DELEGATE_DOWN__URL:https://.../__ENDURL__` |
| MacroLoop.ahk | `CheckClipboardForDelegate()` extracts URL from title signal via regex, passes to `HandleDelegate()` |
| MacroLoop.ahk | `HandleDelegate(direction, embeddedUrl)` uses embedded URL directly, falls back to `GetCurrentUrl()` only if missing |
| MacroLoop.ahk | `consecutiveDelegateFailures` counter stops loop after 3 consecutive failures |
| config.ini | Version bumped to 6.53 |
| SPEC.md | Documented embedded URL signal format and failure guard |
| MEMORY.md | This section |

### Key Learnings
10. **Never rely on keyboard shortcuts for data extraction during automation** — Ctrl+L/Ctrl+C to read the address bar is fragile; focus state after F12 is unpredictable. Embed data directly in the communication channel (title signal) to eliminate the dependency.
11. **Always add failure circuit-breakers** — Any retry loop that lacks a maximum failure count will create infinite cascading failures. A simple counter + stop is essential for self-healing automation.
12. **Title signals can carry payload** — The `document.title` signaling channel is not limited to simple markers. URL-encoded payloads with delimiters (`URL:...__ENDURL__`) reliably transfer structured data from JS to AHK without clipboard interference.

---

## v6.54 — Pre-Delegate InjectJS Removal

**Date**: 2026-02-19

### Problem
Force Up/Down buttons showed "SWITCHING" but nothing happened. Root cause: `CheckClipboardForDelegate()` called `InjectJS()` to clean the title marker BEFORE calling `HandleDelegate()`. This InjectJS took 2-3 seconds of keyboard automation (F12, Ctrl+Shift+J, paste, Enter), which disrupted browser state, overwrote the clipboard, and left DevTools in an unpredictable state before HandleDelegate even started.

### Fix
Removed the `InjectJS()` title-cleaning calls from `CheckClipboardForDelegate()`. The `isHandlingDelegate` guard already prevents duplicate signal detection, and HandleDelegate cleans up the title at completion (both success and error paths).

### Key Learnings
13. **Never do heavy I/O between signal detection and signal handling** — The signal detection function should do the absolute minimum work before handing off to the handler. Any keyboard automation (InjectJS) between detection and handling disrupts the browser state that the handler depends on.

---

## v6.55–v7.0 — Modular Config, Element Descriptors & Constants

**Date**: 2026-02-19 to 2026-02-20

### What Changed

#### Modular Config System (v6.55)
Monolithic `Config.ahk` split into 10+ submodules under `Config/`:
- Each INI section has its own loader function (`LoadHotkeys()`, `LoadComboSwitch()`, etc.)
- `ConfigUtils.ahk` provides `IniReadInt()` and `LoadElementDescriptor()` helpers
- `Validate.ahk` runs startup key validation
- `Watcher.ahk` handles config hot-reload

#### Dot-Notation INI Sections (v6.55)
Flat sections like `[ComboSwitch]` split into logical subsections:
- `[ComboSwitch.XPaths]`, `[ComboSwitch.Transfer]`, `[ComboSwitch.Timing]`, etc.
- `[MacroLoop.Timing]`, `[MacroLoop.URLs]`, `[MacroLoop.XPaths]`, etc.
- `[CreditStatus.API]`, `[CreditStatus.Timing]`, `[CreditStatus.Retry]`, etc.

#### Config-Driven Element Descriptors (v6.55)
Each ComboSwitch element gets a dedicated config section with 6 fallback fields:
```ini
[ComboSwitch.Transfer]
TextMatch=Transfer|Transfer project
Tag=button
Selector=
AriaLabel=Transfer
HeadingSearch=transfer
Role=
```
Loaded by `LoadElementDescriptor(prefix)` using dynamic variable interpolation.

#### Centralized Constants (v6.56)
All INI key names and defaults moved to `Config/Constants/` folder:
- Separate files for keys (`ComboKeys.ahk`) and defaults (`ComboDefaults.ahk`)
- `Sections.ahk` defines section name constants
- Eliminates magic strings throughout config loading

#### Combo.ahk Global Scope Fix (v7.0)
30 element descriptor globals explicitly initialized at file scope (suppresses `#Warn`) and redeclared inside `RunCombo()` for AHK v2 function-scope access.

#### Documentation Reorganization (v7.0)
All markdown files moved from project root to `specs/` subfolder. `Automator.ahk` tray menu paths updated. Folder renamed to `marco-script-ahk-v7.0`.

### V7 (AHK v2) - Current
- All V5.2 features plus:
- **Modular Config System** — 10+ config submodules under `Config/`
- **Dot-Notation INI** — hierarchical section grouping
- **Config-Driven Element Descriptors** — per-element fallback fields in config
- **Centralized Constants** — dedicated files for keys, defaults, sections
- **Documentation in specs/** — all MD files organized in subfolder

### Files Modified
| File | Change |
|------|--------|
| Config.ahk | Orchestrator only, delegates to submodules |
| Config/*.ahk | New loader modules (10 files) |
| Config/Constants/*.ahk | New constant files (15+ files) |
| Combo.ahk | 30 element descriptor globals with file-scope init |
| config.ini | Dot-notation sections, version 7.0 |
| Automator.ahk | Build version 7.0, specs/ paths |
| specs/*.md | Documentation reorganized |

### Key Learnings
14. **AHK v2 dynamic variable interpolation (`%prefix%`) requires file-scope `global` declarations** — Variables assigned via `%prefix%TextMatch := value` must have a prior `global TransferTextMatch := ""` at file scope, otherwise `#Warn` fires and the variable may not be visible in function scope.
15. **Dot-notation INI sections improve maintainability** — Grouping related keys under `[Module.Group]` makes config.ini self-documenting and reduces the risk of key name collisions.
16. **Constants files prevent magic strings** — Centralizing INI key names and defaults in dedicated files ensures consistency between loaders, validators, and documentation.
17. **NEVER optimize away the F12 close/reopen cycle in JsInject.ahk** — Ctrl+Shift+J alone does NOT reliably refocus an already-open console. The F12→Ctrl+Shift+J sequence is the ONLY guaranteed way to get a focused console input for paste operations. The v6.56 "fast-path" (skipping F12) silently broke all sequential injections.
18. **Config-driven placeholders MUST have hardcoded fallbacks** — Any `splitPipe('__PLACEHOLDER__')` or `cfgStr('__PLACEHOLDER__')` call must use `|| hardcodedDefault` to fall back to known-working values. Without this, unreplaced or empty placeholders disable all non-XPath detection methods.
19. **Sequential multi-script injection is the critical stress test** — The first injection always works (fresh DevTools). The second injection (e.g., combo.js after xpath-utils.js) is where console focus issues surface. Always test with the full combo up/down flow, not single-script injection.

## CRITICAL: JsInject.ahk — Do Not Modify Pattern (v7.0)

**The `else` branch in `InjectViaDevTools()` MUST use F12→Ctrl+Shift+J:**
```autohotkey
} else {
    Send("{F12}")        ; Close DevTools completely
    Sleep(300)           ; Wait for close
    Send("^+j")          ; Reopen with Console input focused
    Sleep(consoleOpenDelayMs)
}
```
**DO NOT "optimize" this to skip F12.** See `specs/spec-issues-v7.0.md` Issue #1 for full details.

## V7.4 Changes (2026-02-21) - Bearer Token UI, Enhanced Fetch Logging & Clear All

### Bearer Token Management (combo.js)
**Problem**: API calls to Lovable's workspace endpoint failed silently with no way to provide authentication credentials from the browser.

**Solution**: Three-tier token resolution with persistent storage:
1. **Config.ini token** (`LovableBearerToken`) — highest priority, set by AHK placeholder
2. **localStorage token** (`ahk_bearer_{projectId}`) — persistent per-project, set via UI
3. **Cookie session fallback** (`credentials: 'include'`) — when no explicit token exists

#### Controller UI Addition
- Password-type input field in the ComboSwitch controller panel
- **👁/🔒 Show/Hide toggle** button adjacent to the input — switches between `type='password'` and `type='text'` so the user can verify the token value before saving
- **Save** button stores token to `localStorage` with project-specific key
- **Clear** button removes the stored token
- On load, pre-fills input if a saved token exists
- Token is never logged in plaintext — always redacted to first 8 chars + `***`

### Enhanced Fetch Logging (combo.js)
**Problem**: API fetch failures showed generic error messages with no request/response detail, making debugging impossible.

**Solution**: `singleApiFetch()` now logs comprehensive metadata:
- **Before request**: URL, method, headers (with bearer token redacted), body payload
- **On success**: Status code, response body preview (up to 500 chars)
- **On failure**: Status code, error body preview (up to 500 chars), full stack trace
- **On network error**: Exception message with stack trace

### Clear All Data Button (combo.js)
**Problem**: No way to reset all automation state without manually clearing localStorage entries.

**Solution**: "Clear All Data" button in the controller panel that:
- Scans all `localStorage` keys for `ahk_` or `ml_` prefixes
- Deletes only automation-related entries, preserving other site data
- Logs the count of cleared items
- Does NOT affect `sessionStorage` or cookies

### Enum-Style Static Classes (DRY Pattern)

AHK v2 has no native `enum` keyword. We use static classes as named-constant namespaces to eliminate magic strings. See `specs/enum-in-ahk.md` for the full pattern guide.

**New enum classes added in v7.4:**

| Class | File | Values | Replaces |
|-------|------|--------|----------|
| `ProgressStatus` | `Constants/ProgressStatus.ahk` | `IDLE`, `IN_PROGRESS`, `DONE`, `ERROR`, `TIMEOUT` | Hardcoded `"done"`, `"error"`, `"in_progress"`, `"timeout"`, `"idle"` in Delegate.ahk & Helpers.ahk |
| `LogLevel` | `Constants/LogLevel.ahk` | `INFO`, `WARN`, `ERROR`, `DEBUG` | `LOG_LEVEL_INFO`, `LOG_LEVEL_WARN`, `LOG_LEVEL_ERROR`, `LOG_LEVEL_DEBUG` globals in Utils.ahk |
| `AuthMode` | `Constants/AuthMode.ahk` | `COOKIE_SESSION`, `TOKEN` | Hardcoded `"cookieSession"` in CreditDefaults.ahk |

**Usage pattern:**
```ahk
; Before (magic string):
if (clipStatus = "done") {

; After (enum reference):
if (clipStatus = ProgressStatus.DONE) {
```

### Architectural Decisions
20. **Project-scoped localStorage keys prevent cross-project token leakage** — Using `ahk_bearer_{projectId}` ensures tokens are isolated per workspace project. The `projectId` is extracted from the URL path (`/projects/{id}`).
21. **Token redaction is mandatory in all log paths** — Any log statement that touches a bearer token must truncate to 8 chars + `***`. This applies to fetch headers, storage operations, and diagnostic exports.
22. **Selective localStorage cleanup preserves site functionality** — The Clear All button only targets `ahk_` and `ml_` prefixed keys, avoiding destruction of the host site's own localStorage data (auth tokens, preferences, etc.).
23. **Enum-style static classes eliminate magic strings** — All repeated string literals used as state values, log levels, or mode selectors must be defined as static class members in `Config/Constants/`. This prevents typo bugs, enables autocomplete, and provides a single source of truth.
24. **ValidateEnums() halts on failure with MsgBox + ExitApp** — `ValidateConfig()` calls `ValidateEnums()` which tries to access every member of `ProgressStatus`, `LogLevel`, and `AuthMode` inside `try/catch` blocks. On success, all values are logged to `activity.txt` via `SubLog`. On failure, errors are logged to `error.txt`, then a `MsgBox` (OK/Cancel, warning icon) gives the user the choice to exit (`ExitApp`) or continue anyway for debugging.
25. **Bearer token save validates input before storage** — The Save Token button rejects empty/whitespace-only values and tokens shorter than 10 characters. Rejected attempts show a red ⚠ warning in the title label that auto-clears after 2.5s, preventing silent auth failures from empty tokens overriding cookie-session fallback.
26. **findElement supports exact-match mode via `textMatchExact`** — Element descriptors can set `textMatchExact: true` to force Method 2 (text scan) to use strict equality (`===`) instead of `indexOf` substring matching. This prevents false positives where a broad term like "Save" inadvertently matches "Save Token". Applied to the Confirm button descriptor to ensure only "Confirm transfer" or "Confirm" are matched.

### Files Modified in v7.4
| File | Changes |
|------|---------|
| combo.js | Bearer token UI (with input validation), enhanced fetch logging, Clear All Data button |
| config.ini | Version bump to 7.4, added LovableBearerToken placeholder |
| specs/SPEC.md | Documented token resolution, fetch logging, Clear All |
| specs/README.md | Version bump to 7.4, changelog entry |
| specs/MEMORY.md | This section |
| Config/Constants/ProgressStatus.ahk | New enum: combo.js polling states |
| Config/Constants/LogLevel.ahk | New enum: log severity levels (replaces globals) |
| Config/Constants/AuthMode.ahk | New enum: authentication mode values |
| Config/Constants.ahk | Added includes for ProgressStatus, LogLevel, AuthMode |
| Utils.ahk | Replaced `LOG_LEVEL_*` globals with `LogLevel.*` references |
| CreditDefaults.ahk | `AUTH_MODE` default uses `AuthMode.COOKIE_SESSION` |
| Delegate.ahk | All status comparisons use `ProgressStatus.*` |
| Helpers.ahk | `BuildClipboardReadJs` and `ResetElementStatus` use `ProgressStatus.IDLE` |
| Validate.ahk | `ValidateEnums()` startup check with MsgBox halt-on-failure |
| specs/enum-in-ahk.md | New spec documenting the enum pattern for AHK v2 |
| specs/spec-issues-v7.4.md | New issue tracker (3 issues, all resolved) |

## V7.5 Changes (2026-02-21) - Direct Workspace Move, Mode Toggle, DevTools Reuse

### DevTools Reuse Optimization (JsInject.ahk)
**Problem**: Every subsequent injection closed DevTools with F12 then reopened with Ctrl+Shift+J, wasting ~1 second per call.
**Fix**: Removed the F12 close/reopen cycle. On subsequent calls, `Ctrl+Shift+J` alone re-focuses the Console input. Uses a short `refocusDelayMs` (300ms) instead of the full `consoleOpenDelayMs`.

```
First call:  Ctrl+Shift+J (full open) + consoleOpenDelayMs
Subsequent:  Ctrl+Shift+J (re-focus)  + 300ms refocusDelayMs
```

### isOnSettingsPage() Scope Fix (combo.js)
**Bug**: `isOnSettingsPage()` was defined inside `createControllerUI()` but called from the outer IIFE init block, causing `ReferenceError`.
**Fix**: Hoisted the function to the IIFE scope so it's available to both the UI builder and the initialization guard.

### Mode Toggle: Sequential vs Direct (combo.js)
Two switching modes for workspace transfers, toggled via buttons in the controller UI:

| Mode | Mechanism | When to Use |
|------|-----------|-------------|
| **Sequential** (default) | Up/Down buttons → 8-step DOM combo flow | Browsing adjacent workspaces |
| **Direct** | Dropdown + Move button → `PUT` API call | Jumping to a specific workspace by name |

**UI behavior**:
- Sequential mode shows Up/Down/Status buttons + keyboard hint
- Direct mode hides those and shows a workspace `<select>` dropdown + Move button
- Toggle buttons: "Sequential" (blue active) / "Direct" (green active)

### Workspace Dropdown (combo.js)
The dropdown (`#ahk-workspace-select`) is populated from `creditState.perWorkspace` after a Status check:
- Each option shows: `WorkspaceName (used/limit)`
- Current workspace (matched by name from status display) is marked with `▶` and disabled
- Auto-populated on every credit status update via `populateWorkspaceDropdown()`
- Shows "Click Status first" placeholder if no data loaded yet

### moveToWorkspace API Function (combo.js)
Direct workspace switching via API instead of the 8-step DOM combo:

```
moveToWorkspace(targetWorkspaceId, targetWorkspaceName)
    |-- Extract projectId from URL (/projects/{id})
    |-- Resolve bearer token (config > localStorage > none)
    |-- PUT https://api.lovable.dev/projects/{projectId}/move-to-workspace
    |     Body: { workspace_id: targetWorkspaceId }
    |     Headers: Authorization: Bearer {token}
    |-- On success: update status, add history entry, refresh credits after 2s
    |-- On failure: show HTTP status + error body in #ahk-move-status
```

**Exposed as**: `window.__moveToWorkspace(workspaceId, workspaceName)`

### Nested Workspace Object Parsing (combo.js)
`parseApiResponse()` now handles both response shapes:
- **Flat**: `[{ id, name, billing_period_credits_used, ... }, ...]`
- **Nested**: `[{ workspace: { id, name, ... }, current_member: { ... } }, ...]`

Detection: `var ws = rawWs.workspace || rawWs;`

Each workspace entry now stores `id` and `fullName` alongside `name` (truncated) for the dropdown.

### History Entry for Direct Move
The combo history panel (`#ahk-combo-history`) supports a new `move` direction type:
- Arrow: `⇒` (double right arrow, vs `↑`/`↓` for sequential)
- Color: `#059669` (emerald green)

### Architectural Decisions
27. ~~**Mode toggle preserves both workflows**~~ Removed in v7.5.1 — both navigation and workspace management are always visible.
28. **Dropdown auto-refreshes from credit state** — `populateWorkspaceDropdown()` is called from `updateCreditDisplay()`, ensuring the dropdown stays synchronized with the latest API data without requiring a separate fetch.
29. **moveToWorkspace uses the same token resolution as checkCreditsViaApi** — Config > localStorage > none. This keeps authentication consistent across all API interactions.

## V7.5.1 Changes (2026-02-21) - Controller UI Overhaul

### Removed Mode Toggle
The Sequential/Direct mode toggle was removed. Both navigation buttons (Up/Down/Status) and the workspace management section (searchable dropdown + Move button) are now **always visible** in a single unified layout. This eliminates the extra click required to switch modes.

### Layout Restructure
The controller body was reordered for better information hierarchy:
1. **Project name** — Shows current project ID from URL (`🔗 Project: abc12345`)
2. **NOW section** — Current workspace with billing, daily, and free credit breakdown
3. **Status display** — NOW/NEXT workspace navigation with project ID
4. **Credit display** — Total credits, free tier status, total free remaining
5. **Button row** — Up, Down, Status buttons with shortcut hints
6. **Workspace section** — Searchable dropdown with Focus Current button
7. **Bearer Token** — Collapsible (auto-collapsed if saved)
8. **JS Executor** — Textbox, Run button, command history
9. **Utilities** — Action history, logs, XPath tester, Clear All

### Searchable Custom Workspace Dropdown with Emojis
Replaced the native `<select>` with a custom `div`-based searchable dropdown:
- **Search**: Real-time filtering via text input
- **Emojis**: 📍 current workspace, 🟢/🟡/🔴 usage severity, 🎁 free credits, 📅 daily usage
- **Color-coded progress bars**: Green (<60%), Yellow (60-90%), Red (>90%)
- **Current workspace highlighting**: Cyan left border, larger bold font, `CURRENT` badge, distinct background
- **Focus Current button**: `📍 Focus Current` scrolls to the current workspace
- **Auto-scroll**: On load and on tab switch, the list scrolls to show the current workspace

### Keyboard Navigation in Workspace List
- **Arrow Up/Down** in the search input selects workspaces without scrolling the list
- **Enter** triggers move to the selected workspace immediately
- `setWsNavIndex()` tracks selection state with purple highlight outline

### Free Credits Per Workspace
`parseApiResponse()` now stores additional fields per workspace:
- `freeGranted` — `credits_granted` from API
- `freeRemaining` — `Math.max(0, credits_granted - credits_used)`
- `hasFree` — boolean flag for quick checks
- `dailyUsed`, `dailyLimit` — daily credit counters

Each workspace item displays: `💰 used/limit` + `📅 daily` + `🎁 N free` (or `🎁 0 free`)

### Integer-Only Credit Values
All credit values displayed in the UI use `Math.round()` — no decimal places. Applied in:
- `parseApiResponse()` for `used`, `limit`, `dailyUsed`, `dailyLimit`, `freeGranted`, `freeRemaining`
- `updateCreditDisplay()` for total billing and daily summaries
- `renderWorkspaceList()` for per-workspace display

### Auto-Fetch Credits on Init
Credits are automatically fetched 1 second after controller injection (`checkCreditsStatus('init')`). Uses cache TTL to avoid redundant API calls. The workspace dropdown populates automatically without requiring a manual Status button click.

### Collapsible Bearer Token Section
If a bearer token is saved in localStorage, the token input section is auto-collapsed showing only:
`▶ Bearer Token 🔑 (saved, 142 chars)`
Click the header to expand and edit. If no token is saved, the section is expanded by default with `⚠️ (not set)`.

### No Confirmation Dialog on Move
The `confirm()` dialog was removed from the Move button. Clicking `🚀 Move Project` or pressing Enter in the workspace list immediately triggers the API call. This speeds up the automation workflow.

### Ctrl+Alt+M Shortcut for Move
New keyboard shortcut `Ctrl+Alt+M` triggers `triggerMoveFromSelection()` — moves the project to the currently selected workspace. Shown in the Move button tooltip.

### NOW Section with Free Credits
A dedicated `#ahk-now-section` element shows the current workspace's full credit breakdown:
- 📍 Workspace name (cyan, bold)
- 💰 Billing credits (used/limit)
- 📅 Daily credits (used/limit)
- 🎁 Free credits remaining (or 0 free)

Updated by `updateCreditDisplay()` after each API fetch.

### Progress Bar Accuracy
Each workspace's progress bar uses its own `billing_period_credits_used / billing_period_credits_limit` ratio. Previously, some workspaces appeared to show low progress because the bar width calculation was correct but the visual was too small — the bar height was increased from 4px to 5px and min-width set to 60px for better visibility.

### Shared Bearer Token (v7.5)
The bearer token localStorage key changed from project-scoped (`ahk_bearer_{projectId}`) to domain-scoped (`ahk_bearer_token`). Both `combo.js` and `macro-looping.js` read from this single key. A one-time migration copies old project-scoped values to the new key.

### Deferred XPathUtils Detection (v7.5)
If `window.XPathUtils` is not available at parse time, a 500ms `setTimeout` retries detection and binds the logger. This handles tight injection timing between `xpath-utils.js` and `combo.js`.

### Files Modified in v7.5 / v7.5.1
| File | Changes |
|------|---------|
| combo.js | Removed mode toggle, layout restructure, searchable dropdown with emojis, free credits per workspace, integer rounding, auto-fetch, collapsible token, no confirm on move, Ctrl+Alt+M, keyboard nav, NOW section, Focus Current button, shared bearer token, deferred XPathUtils |
| macro-looping.js | Shared bearer token reader, deferred XPathUtils detection |
| JsInject.ahk | F6 re-focus for subsequent injections (200ms delay), removed F12 close/reopen |
| Combo.ahk | Increased xpath-utils.js sleep to 500ms, title-marker verification, removed F12 from fast path |
| MacroLoop/Embed.ahk | Increased xpath-utils.js sleep to 500ms |
| specs/SPEC.md | Documented UI overhaul, updated UI diagram, new shortcuts |
| specs/MEMORY.md | This section |

## V7.5.2 Changes - DOM Project Name, Credit Logic, var→const/let

### DOM-First Project Name Detection (combo.js)
**Problem**: Project name was detected from API workspace response or document title, which could be wrong or unavailable.
**Solution**: Added `ProjectNameXPath` to config.ini pointing to the visible project name element in the header bar (`/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div[1]/div/p`).

Detection priority chain in `getDisplayProjectName()`:
1. **DOM XPath** (`XPATH.PROJECT_NAME`) — reads directly from page, most accurate
2. **Cached API name** (`creditState.projectName`) — from `/user/workspaces` response
3. **Document title** — regex match `"ProjectName - Lovable"`
4. **URL UUID** — last resort, truncated to 8 chars

`creditState.projectName` is **cleared to null** in `tryReinject()` on SPA navigation / MutationObserver detection, forcing a fresh DOM read on next access.

### Full Stack for ProjectNameXPath
| Layer | File | Change |
|-------|------|--------|
| Config | config.ini | Added `ProjectNameXPath` under `[ComboSwitch.XPaths]` |
| Constants | ComboKeys.ahk | Added `PROJECT_NAME_XPATH` static key |
| Loader | ComboSwitch.ahk | Reads & logs the new XPath from INI |
| Injector | Combo.ahk | Replaces `__PROJECT_NAME_XPATH__` placeholder in JS |
| Controller | combo.js | New `getProjectNameFromDom()`, updated `getDisplayProjectName()` |

### Credit Logic Fix
**Problem**: Free/available credit calculations were incorrect.
**Solution**: Added explicit calculated fields per workspace:
- `dailyFree = daily_credits_limit - daily_credits_used` (free daily remaining)
- `available = billing_period_credits_limit - billing_period_credits_used` (total available)
- Both displayed prominently on top of credit display and NOW section with color coding (green=positive, red=zero)

### Hover Tooltips on Workspace Items
Each workspace item in the dropdown list now shows a rich native `title` tooltip on hover containing:
- Calculated values (Daily Free, Available) with formulas
- Raw data (ID, billing usage, daily usage, trial credits, subscription status, role)
- Built by `buildTooltipText(ws)` function using the stored `ws.raw` API response

### var→const/let Migration (Complete)
Converted **120+ `var` declarations** to `const` or `let` across all remaining sections:
- `renderWorkspaceList`, `populateWorkspaceDropdown`, `setWsNavIndex`, `scrollToCurrentWorkspace`
- `buildBody` elements: wsDropdownContainer, wsList, wsSelected, wsMoveRow, moveBtn, moveStatus
- JS Executor: jsLabel, jsRow, textarea, runBtn
- History panels: histLabel, histBox, jsHistLabel, jsHistBox
- Log export: logExportRow, logLabel, copyLogBtn, downloadLogBtn, clearLogBtn
- Token section: tokenSection, tokenTitle, tokenBody, tokenInputRow, tokenInput, tokenToggleBtn, tokenBtnRow, tokenSaveBtn, tokenClearBtn
- Clear All: clearAllRow, clearAllBtn, clearAllHint
- XPath Tester: xpathTestSection, xpathTestTitle, xpathTestInput, xpathTestResult, xpathTestBtnRow, xpFindBtn, xpClickBtn, xpFireAllBtn
- findElement methods: all loop vars, descriptors, selectors
- Utility functions: migrateBearerToken, pollForElement, extractOptionLabels, saveKnownWorkspaces, findExactMatchIndex, findPartialMatchIndex, calculateTargetIndex
- ComboSwitch steps: clickTransferButton, waitForCombo1Text, waitForCombo2Button, waitForDropdownOpen, waitForOptions, selectTargetOption, waitForConfirmButton
- Credit system: sanitizeHeaders, singleApiFetch, checkCreditsViaApi, checkCreditsViaDom, checkCreditsStatus
- UI lifecycle: createControllerUI, toggleMinimize, restorePanel, placeMarker, setupPersistence
- Keyboard handler: all key detection vars

### THEME/FONT Constants Applied Throughout
All hardcoded color strings in converted sections replaced with `THEME.*` and `FONT.*` references for consistent styling.

### Files Modified in v7.5.2
| File | Changes |
|------|---------|
| config.ini | Added `ProjectNameXPath` under `[ComboSwitch.XPaths]` |
| ComboKeys.ahk | Added `PROJECT_NAME_XPATH` constant |
| ComboSwitch.ahk | Reads & logs ProjectNameXPath |
| Combo.ahk | Replaces `__PROJECT_NAME_XPATH__` placeholder |
| combo.js | DOM project name detection, credit logic fix (dailyFree/available), hover tooltips, 120+ var→const/let, THEME/FONT constants |
| specs/MEMORY.md | This section |

## V7.5.3 Changes - UI Consolidation, Progress Bars & Filtering

### Consolidated Project Name Display
- Removed standalone `#ahk-project-name` element
- Project name (🚀) now displayed inline within the "NOW" section alongside workspace info
- Up/Down navigation buttons moved to the same line as current workspace name
- Reduces vertical space and eliminates redundant project name repetition

### Inverted Progress Bars (Available Credits)
- Main progress bar now shows **available/remaining** credits instead of usage
- Fill direction inverted: bar fills based on `available / limit` ratio
- Color coding: green (>40%), orange (10-40%), red (≤10%) based on availability percentage
- Fixes previous display where bar showed consumed credits, which was confusing

### Yellow Daily Free Credits Bar
- Added a second dedicated progress bar for daily free credits
- Uses `THEME.YELLOW` color to visually distinguish from main billing credits
- Shows `dailyFree / dailyLimit` ratio (e.g., "0/5 free" or "3/5 free")
- Allows quick visual check of remaining free daily credits

### Focus Current Button Fix
- Enhanced "Focus Current" (🎯) logic to handle edge cases
- If current workspace name is missing, triggers a credit check first to populate data
- Added fallback: scrolls to the manually selected item if exact match not found
- Ensures the button always navigates to the relevant workspace entry

### Free Only Filter
- Added "🆓 Free Only" toggle button in workspace list header
- Filters workspace list to show only workspaces with `dailyFree > 0`
- Toggle state tracked via `data-active` attribute on the button
- Visual feedback: button background changes when filter is active
- Works with existing search/filter — combines with text search if present

### Credit Display Accuracy
- "NOW" section displays calculated metrics: `dailyFree` and `available`
- Formulas confirmed: `dailyFree = daily_credits_limit - daily_credits_used`, `available = billing_period_credits_limit - billing_period_credits_used`
- Progress bars reflect these calculated values, not raw API numbers

### Files Modified in v7.5.3
| File | Changes |
|------|---------|
| combo.js | Consolidated layout, inverted progress bar, yellow free bar, Focus fix, Free Only filter |
| specs/MEMORY.md | This section |

## V7.6 Changes - Documentation & DevTools Console Focus

### JSON-schema.md Created
- New comprehensive data reference at `specs/JSON-schema.md`
- Documents API response schema (`GET /user/workspaces`) with all workspace fields and types
- Documents internal combo.js data models: `creditState`, `perWorkspace[]`, `comboHistory[]`, `jsHistory[]`
- Documents all `config.ini` sections with keys, types, defaults, and descriptions
- Full placeholder injection map: 30+ placeholders mapped from INI keys through AHK to JS

### DevTools Console Tab Focus Fix
- **Problem**: When DevTools was open on a non-Console tab (Elements, Network, etc.), subsequent injections used `F6` which focuses the address bar, not the Console input — causing JS paste to fail silently
- **Solution**: Changed subsequent-call path in `JsInject.ahk` from `F6` to `Ctrl+Shift+J`
- `Ctrl+Shift+J` reliably switches to the Console panel regardless of which DevTools tab is active
- **Trade-off**: If already on Console, `Ctrl+Shift+J` is a toggle and may close DevTools; next call recovers via the first-time open path (`devToolsOpened` flag)
- Refocus delay increased from 200ms to 300ms to account for panel switching

### CHANGELOG.md Created
- New `specs/CHANGELOG.md` centralizes all version history from v4.9 through v7.6
- Follows Keep a Changelog format with Added/Fixed/Changed categories per version
- Single reference point for release notes

### Version Bump to 7.6
- `Automator.ahk`: `AHK_BUILD_VERSION` → `"7.6"`
- `GeneralDefaults.ahk`: `SCRIPT_VERSION` → `"7.6"`
- `config.ini`: `ScriptVersion` → `7.6`

### Files Modified in v7.6
| File | Changes |
|------|---------|
| JsInject.ahk | Ctrl+Shift+J for subsequent calls (replaces F6), 300ms refocus delay |
| Automator.ahk | Version bump to 7.6 |
| GeneralDefaults.ahk | Version bump to 7.6 |
| config.ini | Version bump to 7.6 |
| specs/JSON-schema.md | New — comprehensive data reference |
| specs/CHANGELOG.md | New — centralized version history |
| specs/MEMORY.md | This section |

## V7.8 Changes - InjectJSQuick, Idempotent Init & Domain Guards

### InjectJSQuick() — Lightweight Injection
**Problem**: Each `InjectJS()` call performs a full DevTools toggle cycle (F12 close → Ctrl+Shift+J reopen). When multiple scripts are injected consecutively (e.g., `RunCombo` injected 6 times), Chrome loses page context after ~5 rapid cycles, causing scripts to execute in the DevTools document (`hostname=devtools`) instead of the page.

**Solution**: New `InjectJSQuick()` function in `JsInject.ahk`:
- **Skips** F12/Ctrl+Shift+J entirely — Console is already focused from a preceding `InjectJS()` call
- **Only** performs: save clipboard → set clipboard to JS → Ctrl+V paste → Enter execute → restore clipboard
- Uses existing `pasteDelayMs` timing from config
- Must be called **after** at least one full `InjectJS()` in the same batch

```autohotkey
InjectJSQuick(js) {
    ; No F12, no Ctrl+Shift+J — Console already focused
    oldClip := ClipboardAll()
    A_Clipboard := js
    Send("^v")        ; Paste
    Sleep(pasteDelayMs)
    Send("{Enter}")   ; Execute
    A_Clipboard := oldClip
}
```

### 3-Call Injection Flow (RunCombo)
**Before (v7.6)**: `RunCombo` made 6 `InjectJS()` calls → 6 F12/Ctrl+Shift+J cycles:
1. DOM check snippet
2. DOM check cleanup
3. XPathUtils check snippet
4. XPathUtils check cleanup
5. xpath-utils.js (if needed)
6. combo.js (if needed)

**After (v7.8)**: Reduced to 3 calls (1 full + 2 quick):
1. `InjectJS(domCheckSnippet)` — full DevTools open, includes self-cleaning `setTimeout(2000)`
2. `InjectJSQuick(xpathCheckSnippet)` — paste-only, includes self-cleaning `setTimeout(2000)`
3. `InjectJSQuick(combo.js)` — paste-only

Self-cleaning title markers (`setTimeout` that resets `document.title` after 2000ms) eliminated the need for separate cleanup injection calls.

### EmbedMacroLoopScript Optimization
**Before**: `EmbedMacroLoopScript()` in `Embed.ahk` made 2 full `InjectJS()` calls (xpath-utils.js + macro-looping.js).
**After**: 1 full + 1 quick:
1. `InjectJS(xpathUtilsJs)` — opens Console
2. `InjectJSQuick(macroLoopingJs)` — paste-only, Console already focused

### Domain Guard (combo.js & macro-looping.js)
Both scripts validate `window.location.hostname` before executing:
- **Expected domains**: `lovable.dev`, `localhost`, and common dev variants
- On mismatch: logs hostname, href, expected domains, and cause analysis, then **aborts** immediately
- Prevents scripts from running inside the DevTools document context (`hostname=devtools` or empty hostname)

```javascript
const ALLOWED_HOSTS = ['lovable.dev', 'localhost', '127.0.0.1'];
const hostname = window.location.hostname;
if (!ALLOWED_HOSTS.some(h => hostname.includes(h))) {
    console.error('[Script] Domain guard: aborting on', hostname);
    return;
}
```

### Idempotent Init (combo.js & macro-looping.js)
Both scripts check for an existing DOM marker before initializing:
- **combo.js**: Checks `document.getElementById('__SCRIPT_MARKER_ID__')`
- **macro-looping.js**: Checks `document.getElementById('ahk-macro-loop-script')`

If the marker exists, the script **returns immediately** without:
- Tearing down existing UI
- Resetting in-memory state (loop status, history, credits)
- Re-registering event listeners or MutationObservers

This prevents state loss during re-injection (e.g., after a combo.js re-embed, credit history and loop status are preserved).

### Version Bump to 7.8
- `Automator.ahk`: `AHK_BUILD_VERSION` → `"7.8"`
- `GeneralDefaults.ahk`: `SCRIPT_VERSION` → `"7.8"`
- `config.ini`: `ScriptVersion` → `7.8`

### Files Modified in v7.8
| File | Changes |
|------|---------|
| JsInject.ahk | Added `InjectJSQuick()` function |
| Combo.ahk | 3-call flow (1 full + 2 quick), self-cleaning title markers |
| Embed.ahk | `InjectJSQuick` for macro-looping.js after xpath-utils.js |
| combo.js | Domain guard, idempotent init (no teardown on re-inject) |
| macro-looping.js | Domain guard, idempotent init |
| Automator.ahk | Version bump to 7.8 |
| GeneralDefaults.ahk | Version bump to 7.8 |
| config.ini | Version bump to 7.8 |
| specs/CHANGELOG.md | v7.8 release notes |
| specs/MEMORY.md | This section |

### Version Auto-Sync Mechanism (v7.18)
**Before**: If `config.ini` `ScriptVersion` didn't match `AHK_BUILD_VERSION`, a blocking `MsgBox` dialog appeared asking the user to continue or exit.
**After**: `AHK_BUILD_VERSION` in `Automator.ahk` is the **single source of truth**. On startup, if `config.ini` has a different `ScriptVersion`, it is **silently overwritten** via `IniWrite()` — no dialog, no user action required.

**Flow**:
```
Startup → LoadConfig() → compare AHK_BUILD_VERSION vs scriptVersion
  ├─ Match    → no action
  └─ Mismatch → IniWrite(AHK_BUILD_VERSION, configFile, "General", "ScriptVersion")
                 scriptVersion := AHK_BUILD_VERSION
                 WarnLog + InfoLog to activity.txt
                 (try/catch: if IniWrite fails, WarnLog and continue)
```

**Architectural Decision #27**: `AHK_BUILD_VERSION` is authoritative; `config.ini ScriptVersion` is a derived value auto-synced on startup. Developers only need to update the hardcoded constant in `Automator.ahk` — `config.ini` and `GeneralDefaults.ahk` will align automatically.
