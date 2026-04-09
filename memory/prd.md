# AutoHotkey Automation Tool - PRD

## Original Problem Statement
Enhance an AutoHotkey (AHK) based automation tool that interacts with the `lovable.dev` website. The tool includes JavaScript injection for UI manipulation, combo switching, macro looping, and Gmail automation.

## Core Requirements

### 1. JavaScript Executor
- Visible textbox and "Execute" button on the web page
- AHK script automates using the textbox instead of developer console

### 2. Conditional Script Injection
- Check if executor textbox exists before injection
- Inject `combo.js` only if UI doesn't exist

### 3. XPath Bug Fix
- Corrected XPath: `/html/body/div[6]/div[2]/div[1]/div/p`

### 4. Improved Error Logging
- Detailed error messages including failed XPath and file location

### 5. Keyboard Shortcuts
- `/` focuses JS executor textbox
- `Up/Down` arrows trigger combo buttons
- `Ctrl+Alt+Up/Down` for combo switching and loop control
- `Ctrl+Alt+H` to hide/show controller panels
- All shortcuts configurable in `config.ini`

### 6. Macro Loop Feature (v3.0 - Delegate Mode)
- `Ctrl+Shift+Up/Down` starts MacroLoop on project pages
- JS monitors progress XPath, delegates to AHK for tab switching
- JS does NOT change `window.location.href` - AHK handles all tab operations
- **Delegate Hotkeys**:
  - `Ctrl+Shift++` - JS signals AHK to switch tabs and trigger combo UP
  - `Ctrl+Shift+-` - JS signals AHK to switch tabs and trigger combo DOWN

### 7. Dynamic Interval Adjustment
- `Ctrl+Shift+[` - Decrease interval by 5 seconds
- `Ctrl+Shift+]` - Increase interval by 5 seconds
- Min: 5s, Max: 120s

### 8. Debug Mode (v4.7)
- Tray Menu Toggle for debug mode
- Config Persistence saved to `config.ini` (Debug=1 or 0)
- Activity Log Panels in both `combo.js` and `macro-looping.js`
- Verbose Logging for all file reads, writes, and executions
- Color Coding: ERROR (red), INFO (green/gray), DEBUG (purple), WARN (orange)

### 9. Comprehensive Logging Standards (v4.9)
- Every action logged BEFORE executing (key presses, injections, shortcuts)
- Sub-actions indented with tabs for hierarchical trace output
- Function names dynamically included via `Error("trace").Stack` parsing in AHK
- `is`/`has` prefix for all boolean variables
- No `not` in if conditions - invert to meaningful positive names
- WARNING comments on functions with side effects (shortcuts, external calls)
- `FormatHotkeyLabel()` for human-readable key display in logs
- Logs folder cleared on startup for fresh session logs

### 10. Robust Element Detection (v4.9)
- Transfer button detection via 4-method fallback (XPath, text scan, heading proximity, ARIA labels)
- Future: extend multi-method detection to other critical XPaths

### 11. Floating/Draggable Controller UIs (v4.9)
- Both ComboSwitch and MacroLoop panels are draggable via their header bar
- On first drag, panel detaches and becomes a floating `position:fixed` window
- Hide/minimize with `[ - ]` (minimize), `[ x ]` (hide), `Ctrl+Alt+H` (restore)

## Architecture (v4.9)

```
+------------------------------------------------------------------+
|  PROJECT TAB                              SETTINGS TAB            |
|  +--------------------+                  +--------------------+   |
|  |  macro-looping.js  |                  |    combo.js        |   |
|  |  (v3.0 Delegate)   |                  |                    |   |
|  |                    |   AHK HANDLES    |                    |   |
|  |  1. setInterval    |   TAB SWITCHING  |  4. Receives       |   |
|  |     monitors       |                  |     Ctrl+Up/Down   |   |
|  |     progress XPath |                  |                    |   |
|  |                    |  +-----------+   |  5. Triggers       |   |
|  |  2. When IDLE:     |  |  AHK      |   |     combo switch   |   |
|  |     dispatch       |--|  catches  |-->|                    |   |
|  |     Ctrl+Shift++/- |  |  hotkey   |   |                    |   |
|  |                    |  |           |   |                    |   |
|  |  3. Wait for       |<-|  Switches |---|                    |   |
|  |     __delegate     |  |  back     |   |                    |   |
|  |     Complete()     |  +-----------+   |                    |   |
|  +--------------------+                  +--------------------+   |
+------------------------------------------------------------------+
```

## What's Been Implemented

### Completed Features
- [x] JavaScript Executor UI (textbox + button via `combo.js`)
- [x] Conditional Script Injection in `JsInject.ahk`
- [x] XPath bug fix in `config.ini`
- [x] Enhanced error logging in `combo.js`
- [x] Configurable keyboard shortcuts (`/`, `Up/Down` arrows)
- [x] Major code refactoring (centralized `config.ini`)
- [x] Tray menu restoration (icons, Gmail, MacroLoop entries)
- [x] MacroLoop dedicated hotkeys (`Ctrl+Shift+Up/Down`)
- [x] Dynamic interval adjustment (`Ctrl+Shift+[/]`)
- [x] MacroLoop v3.0 - Delegate Mode (JS monitors, AHK switches tabs)
- [x] Debug Mode v4.7 - Verbose activity logging with browser UI panels
- [x] Comprehensive logging overhaul (v4.9) - all AHK and JS files
- [x] Code quality standards (is/has naming, no negatives, WARNING comments)
- [x] Fresh logs on startup (logs folder cleared)
- [x] Robust Transfer button detection (4-method fallback)
- [x] Floating/draggable controller UIs (both panels)
- [x] Hide/minimize for both controller UIs
- [x] Keyboard shortcuts for MacroLoop panel (Ctrl+Alt+Up/Down/H)

## Code Architecture
```
/marco-script-ahk-v4/
|-- Automator.ahk           # Main script v4.9, tray menu, hotkey registration, logs cleanup
|-- config.ini              # Central configuration for all settings
|-- combo.js                # Combo switch UI/logic, draggable, hide/minimize, keyboard shortcuts
|-- macro-looping.js        # MacroLoop v3.0 Delegate mode, draggable, hide/minimize, shortcuts
|-- SPEC.md                 # Technical specification
|-- MEMORY.md               # Learning document with design decisions
|-- README.md               # User-facing documentation
+-- Includes/
    |-- Config.ahk          # Loads settings from config.ini with per-section logging
    |-- JsInject.ahk        # Injects JS into browser DevTools with key press logging
    |-- Combo.ahk           # ComboSwitch logic with WARNING comments
    |-- MacroLoop.ahk       # MacroLoop + HandleDelegate (tab switching)
    |-- AutoLoop.ahk        # AutoLoop with idle state handling
    |-- Gmail.ahk           # Gmail automation
    |-- HotkeyFormat.ahk    # Human-readable hotkey labels
    +-- Utils.ahk           # Logging framework (GetCallerInfo, SubLog, LogKeyPress)
```

## Key Hotkeys Configuration
```ini
[Hotkeys]
ComboDown=^Down              # Ctrl+Down - Smart shortcut
ComboUp=^Up                  # Ctrl+Up - Smart shortcut
MacroLoopUp=^+Up             # Ctrl+Shift+Up - Start MacroLoop UP
MacroLoopDown=^+Down         # Ctrl+Shift+Down - Start MacroLoop DOWN
DelegateUp=^+=               # Ctrl+Shift++ - JS delegates UP to AHK
DelegateDown=^+-             # Ctrl+Shift+- - JS delegates DOWN to AHK
LoopIntervalDecrease=^+[     # Decrease interval
LoopIntervalIncrease=^+]     # Increase interval
ComboAltUp=^!Up              # Ctrl+Alt+Up - Combo switch alternative
ComboAltDown=^!Down          # Ctrl+Alt+Down - Combo switch alternative
GmailUnread=^+F9             # Gmail shortcut
```

## Browser Keyboard Shortcuts (JS-side)
```
Ctrl+Alt+Up     - Toggle ComboSwitch/MacroLoop action (depends on page)
Ctrl+Alt+Down   - Toggle ComboSwitch/MacroLoop action (depends on page)
Ctrl+Alt+H      - Hide/show controller panels
Ctrl+Enter      - Execute JS in textbox
/               - Focus textbox
ArrowUp/Down    - Trigger combo buttons
```

## Testing Checklist
1. [ ] Run `Automator.ahk` - verify v4.9 in tray tooltip
2. [ ] Logs folder should be cleared on startup
3. [ ] Navigate to settings page on lovable.dev
4. [ ] Press `Ctrl+Down` - ComboSwitch should work (Transfer button found via fallback methods)
5. [ ] Drag the ComboSwitch panel to verify floating behavior
6. [ ] Minimize/hide the panel, press `Ctrl+Alt+H` to restore
7. [ ] Navigate to a project page on lovable.dev
8. [ ] Press `Ctrl+Shift+Down` - MacroLoop should start
9. [ ] Verify MacroLoop UI has drag, hide/minimize, keyboard shortcuts
10. [ ] Press `Esc` to stop loop

## Backlog / Future Tasks
- Apply multi-method detection to all XPaths (currently only Transfer button)
- Persist UI across SPA navigation (MutationObserver)
- Auto-retry failed combo steps
- JS execution history in textbox
- Config hot-reload without restart
- Tray notification on errors

## Notes
- This is a desktop automation project (not a web app)
- All logic in AHK scripts and injected JavaScript
- `config.ini` is single source of truth for all configurable parameters
- Key change in v4.4: JS never changes URLs - AHK handles all tab navigation
- Key change in v4.9: Comprehensive logging, robust element detection, draggable UIs
