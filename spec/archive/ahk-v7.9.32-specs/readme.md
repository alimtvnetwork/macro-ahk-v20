# Automator v7.4 - Modular Config & Element Descriptors Edition

Browser automation for lovable.dev using AutoHotkey v2 + JavaScript injection.

## What's New in v7.0

- **📁 Documentation Restructure**: All `.md` files moved to `specs/` subfolder
- **🏗️ Modular Config Architecture**: Monolithic `Config.ahk` replaced with `Config/` directory containing 11 submodules
- **📋 Centralized Constants**: All INI keys, defaults, and section names in `Config/Constants/` (17 files)
- **🔧 Dot-Notation INI Sections**: e.g. `[ComboSwitch.XPaths]`, `[MacroLoop.Timing]`
- **🔍 Element Descriptor Fallback System**: TextMatch → Tag → Selector → ClassName → Role chains
- **✅ Config Validation**: `Validate.ahk` checks all loaded values post-load
- **👁️ Config Watcher**: `Watcher.ahk` for live config reload support

## What's New in v7.4

- **🔑 Bearer Token UI**: Password input with show/hide toggle in controller panel; per-project `localStorage` persistence (`ahk_bearer_{projectId}`)
- **📡 Enhanced Fetch Logging**: `singleApiFetch()` logs full request/response metadata with token redaction (8 chars + `***`)
- **🧹 Clear All Data**: Button clears only `ahk_` and `ml_` prefixed `localStorage` keys, preserving site data
- **🏷️ Enum-Style Static Classes**: `ProgressStatus`, `LogLevel`, `AuthMode` replace all magic strings in AHK logic
- **✅ ValidateEnums() Startup Check**: Verifies all enum class members resolve at launch; logs to `activity.txt` or `error.txt`
- **📄 spec-issues-v7.4.md**: New issue tracker for v7.4 known issues and follow-ups

## Previous Highlights

- **v7.0**: Modular config architecture, centralized constants, element descriptor fallback, config validation & watcher
- **v6.55–v6.56**: Config modularization, element descriptor globals, credit status module
- **v4.8**: Dedicated log functions (InfoLog, WarnLog, ErrorLog, DebugLog), error log file
- **v4.7**: Debug mode toggle, activity log panels, color-coded logs
- **v4.1–v4.6**: JS Executor textbox, Run button, MacroLoop delegate mode

## Quick Start

1. Double-click `Automator.ahk`
2. Gear icon appears in system tray
3. Open Chrome, go to https://lovable.dev/
4. **IMPORTANT**: Press `Ctrl+Shift+J` to open DevTools Console (keep it open!)
5. Navigate to a project's Settings > Project tab
6. Press `Ctrl+Down` or `Ctrl+Up` for ComboSwitch
7. Use the JS Executor textbox to run custom scripts
8. Press `Ctrl+Shift+Alt+Down` to start AutoLoop

**⚠️ CRITICAL**: You must manually open DevTools (step 4) BEFORE using the script.

## Tray Icon

| Icon | State |
|------|-------|
| ⚙️ Gear | Idle/Ready |
| ▶️ Green Arrow | AutoLoop Running |

**Right-click** the tray icon for all actions with hotkey labels.

## Hotkeys

| Hotkey | Action |
|--------|--------|
| `Ctrl+Down` | ComboSwitch next (down) |
| `Ctrl+Up` | ComboSwitch previous (up) |
| `Ctrl+Shift+Alt+Down` | Start AutoLoop (down) |
| `Ctrl+Shift+Alt+Up` | Start AutoLoop (up) |
| `Ctrl+Shift+F9` | Gmail search unread |
| `Esc` | Stop AutoLoop / Exit |

## File Structure

```
marco-script-ahk-v7.0/
├── Automator.ahk               # Main entry point (AHK v2)
├── combo.js                    # ComboSwitch embedded script
├── macro-looping.js            # MacroLoop embedded script
├── xpath-utils.js              # XPath utility functions
├── config.ini                  # All configuration (dot-notation sections)
├── test-xpath-examples.md      # XPath testing reference
│
├── specs/                      # 📁 All documentation
│   ├── README.md               # This file
│   ├── SPEC.md                 # Technical specification
│   ├── MEMORY.md               # AI learning document
│   ├── spec-issues-v6.55.md    # v6.55 issue tracker
│   ├── spec-issues-v6.56.md    # v6.56 issue tracker
│   ├── spec-issues-v7.4.md     # v7.4 issue tracker
│   └── enum-in-ahk.md          # Enum pattern reference
│
├── Includes/
│   ├── Config.ahk              # Config orchestrator (loads all submodules)
│   ├── Combo.ahk               # ComboSwitch logic
│   ├── AutoLoop.ahk            # AutoLoop logic
│   ├── MacroLoop.ahk           # MacroLoop logic
│   ├── JsInject.ahk            # DevTools + textbox injection
│   ├── Gmail.ahk               # Gmail automation
│   ├── HotkeyFormat.ahk        # Hotkey label formatter
│   ├── Utils.ahk               # Shared utilities
│   │
│   └── Config/                 # 🏗️ Modular config system
│       ├── ConfigUtils.ahk     # ReadIni/ReadIniInt helpers
│       ├── Hotkeys.ahk         # [Hotkeys] section loader
│       ├── ComboSwitch.ahk     # [ComboSwitch.*] sections loader
│       ├── MacroLoop.ahk       # [MacroLoop.*] sections loader
│       ├── CreditStatus.ahk    # [CreditStatus.*] sections loader
│       ├── AhkTiming.ahk       # [AHK.Timing] section loader
│       ├── Gmail.ahk           # [Gmail] section loader
│       ├── General.ahk         # [General] section loader
│       ├── Validate.ahk        # Post-load config validation
│       ├── Watcher.ahk         # Live config reload support
│       │
│       └── Constants/          # 📋 All INI keys, defaults & section names
│           ├── Sections.ahk        # Sec class (all section name constants)
│           ├── CommonDefaults.ahk  # CommonDef class (shared defaults)
│           ├── ElementKeys.ahk     # ElemKey class (element ID keys)
│           ├── GeneralKeys.ahk     # GenKey class
│           ├── GeneralDefaults.ahk # GenDef class
│           ├── HotkeyKeys.ahk     # HkKey class
│           ├── HotkeyDefaults.ahk # HkDef class
│           ├── TimingKeys.ahk     # TimKey class
│           ├── TimingDefaults.ahk # TimDef class
│           ├── ComboKeys.ahk      # CsKey class
│           ├── ComboDefaults.ahk  # CsDef class
│           ├── LoopKeys.ahk       # MlKey class
│           ├── LoopDefaults.ahk   # MlDef class
│           ├── CreditKeys.ahk    # CrKey class
│           ├── CreditDefaults.ahk # CrDef class
│           ├── GmailKeys.ahk     # GmKey class
│           ├── GmailDefaults.ahk  # GmDef class
│           ├── ProgressStatus.ahk # Polling state enum
│           ├── LogLevel.ahk       # Log severity enum
│           └── AuthMode.ahk       # Auth mode enum
```

## Configuration

Edit `config.ini`, then right-click tray → Reload Script.

### INI Section Structure (v7.0 dot-notation)

| Section | Purpose |
|---------|---------|
| `[General]` | Debug mode, script version |
| `[Hotkeys]` | All hotkey bindings |
| `[AHK.Timing]` | Global AHK delays |
| `[Gmail]` | Gmail automation settings |
| `[ComboSwitch.XPaths]` | ComboSwitch XPath selectors |
| `[ComboSwitch.Timing]` | ComboSwitch timing values |
| `[ComboSwitch.ElementIDs]` | Embedded UI element IDs |
| `[ComboSwitch.Shortcuts]` | Keyboard shortcuts |
| `[ComboSwitch.Transfer]` | Transfer button descriptors |
| `[ComboSwitch.Combo1]` | First combo dropdown descriptors |
| `[ComboSwitch.Combo2]` | Second combo dropdown descriptors |
| `[ComboSwitch.Options]` | Option list descriptors |
| `[ComboSwitch.Confirm]` | Confirm button descriptors |
| `[MacroLoop.Timing]` | MacroLoop timing values |
| `[MacroLoop.URLs]` | Target URLs |
| `[MacroLoop.XPaths]` | MacroLoop XPath selectors |
| `[MacroLoop.ElementIDs]` | MacroLoop UI element IDs |
| `[MacroLoop.Shortcuts]` | MacroLoop keyboard shortcuts |
| `[CreditStatus.API]` | Credit check API config |
| `[CreditStatus.Timing]` | Credit check timing |
| `[CreditStatus.Retry]` | Retry logic config |
| `[CreditStatus.XPaths]` | Credit status XPaths |
| `[CreditStatus.ElementIDs]` | Credit status UI element IDs |

### Hotkey Syntax

| Symbol | Key |
|--------|-----|
| `^` | Ctrl |
| `+` | Shift |
| `!` | Alt |
| `#` | Win |

## How ComboSwitch Works

1. **First Press**: Injects `combo.js` → embeds as script → creates Up/Down buttons + JS Executor
2. **Subsequent Presses**: Just clicks the existing button (fast!)

## AutoLoop Workflow

1. Click tool button
2. Check for progress bar
3. If BUSY: Click suggestion → Click execute
4. If IDLE: Navigate to settings → Run combo → Go back

## Requirements

- Windows with **AutoHotkey v2** installed
- Google Chrome (or Chromium browser)
- Access to DevTools Console (Ctrl+Shift+J) - only for initial embed

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No tray icon | Check AHK v2 installed |
| Buttons don't appear | Check TransferButtonXPath in config.ini |
| Wrong domain error | Navigate to lovable.dev first |
| Combo fails | Update XPaths in config.ini |
| JS Executor not visible | Refresh page, re-run combo hotkey |
| JS Executor errors | Check console for E011 error code |
