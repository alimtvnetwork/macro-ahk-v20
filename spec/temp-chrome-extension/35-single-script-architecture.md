# Chrome Extension — Single Script Architecture

**Version**: v1.0.0  
**Date**: 2026-03-12  
**Supersedes**: Multi-script seeding (combo-switch.js + macro-controller.js + macro-looping.js)

---

## Purpose

Define the simplified script architecture where the Chrome Extension seeds and injects **one single script** — `macro-looping.js` — driven by a JSON configuration injected via `window.__MARCO_CONFIG__`.

This replaces the previous 3-script model (combo-switch.js, macro-controller.js, macro-looping.js) to reduce complexity and align with the reference implementation in `01-script-direct-copy-paste.js`.

---

## Architecture Decision

### What Changed

| Before (Multi-Script) | After (Single Script) |
|---|---|
| 3 default scripts seeded: combo-switch.js, macro-controller.js, macro-looping.js | 1 default script seeded: macro-looping.js |
| 3 config JSONs: combo-config, controller-config, looping-config | 1 config JSON: macro-looping-config.json |
| Script order matters (controller → combo → looping) | Single script, no ordering needed |
| XPathUtils injected separately as a dependency | XPathUtils embedded inline within macro-looping.js |
| Auth panel from macro-controller.js | Auth panel embedded within macro-looping.js |
| Combo switch from combo-switch.js | Combo switch logic embedded within macro-looping.js |

### Why

1. **User requirement**: Only one script should be seeded and injected.
2. **Reference implementation**: The `01-script-direct-copy-paste.js` (5349 lines) is the canonical reference — it contains XPathUtils + MacroLoop as a single unified script.
3. **Simplicity**: One script means fewer injection failures, no ordering bugs, no cross-script dependencies.

---

## Script: macro-looping.js

### Source of Truth

The standalone reference file `01-script-direct-copy-paste.js` at the repo root contains the full working implementation. This is the canonical version that the seeded `macro-looping.js` must match.

### Key Components (all embedded in one IIFE)

1. **XPathUtils** (Part 1) — XPath query, reactClick, findElement (multi-method), overlay detection
2. **MacroLoop Controller** (Part 2) — The main loop engine containing:
   - Domain guard with force-inject bypass (`window.__loopForceInject`)
   - Element IDs, timing, XPaths, URLs from config
   - localStorage logging system
   - Bearer token resolution (localStorage → cookie → config)
   - Credit API integration (fetch, parse, workspace detection)
   - Move-to-workspace API
   - UI panel (loop controls, credit display, workspace dropdown, activity log)
   - Keyboard shortcuts
   - Start/stop loop state machine

### Config Binding

The script reads its configuration from `window.__MARCO_CONFIG__` which is injected by the extension before the script runs (via the 3-stage injection sequence defined in Spec variable-injection-logic).

### Config JSON: macro-looping-config.json

Located at `standalone-scripts/macro-controller/02-macro-controller-config.json` (existing) and seeded as `macro-looping-config.json`. Structure:

```json
{
    "comboSwitch": { "xpaths": {}, "fallbacks": {}, "timing": {}, "elementIds": {}, "shortcuts": {} },
    "macroLoop": { "timing": {}, "urls": {}, "xpaths": {}, "elementIds": {}, "shortcuts": {} },
    "creditStatus": { "api": {}, "timing": {}, "retry": {}, "xpaths": {} },
    "general": { "debug": true }
}
```

---

## Seeding Changes

### default-scripts-seeder.ts

- **REMOVE**: `buildDefaultComboScript()`, `buildDefaultControllerScript()`, and their configs
- **KEEP**: `buildDefaultLoopingScript()` and `buildDefaultLoopingConfig()` only
- **UPDATE**: The looping script chunk must contain the FULL reference script (XPathUtils + MacroLoop)
- **CONFIG**: The looping config must use the `02-macro-controller-config.json` structure (comboSwitch + macroLoop + creditStatus sections)

### Seed IDs

- **REMOVE**: `DEFAULT_COMBO_SCRIPT_ID`, `DEFAULT_COMBO_CONFIG_ID`, `DEFAULT_CONTROLLER_SCRIPT_ID`, `DEFAULT_CONTROLLER_CONFIG_ID`
- **KEEP**: `DEFAULT_LOOPING_SCRIPT_ID`, `DEFAULT_LOOPING_CONFIG_ID`

---

## Popup UI Changes

### Script List

- Only `macro-looping.js` appears in the scripts list
- Toggle switch controls enable/disable for this single script

### Buttons

- **Run** and **Re-inject** buttons: Keep as a single pair at the top (project controls area), remove duplicate buttons from quick-actions
- **Re-inject** clears markers (`ahk-loop-script`, `ahk-combo-script`, `marco-auth-panel`, `marco-controller-marker`) then injects fresh
- **Run** injects additively without clearing

### Tooltips

- Fix tooltip clipping at UI edges: tooltips near the bottom of the popup must open upward, tooltips near the right edge must shift left
- All tooltips must be fully visible within the 420px popup width

### Help Button

- Add a green "?" help button next to the version label in the header
- Opens a brief help overlay or the README

### Log Copying

- The "Logs" button must copy ALL session logs (from background service worker + from the injected script's localStorage logs) as a combined JSON report
- Ensure the clipboard write completes before showing success

### Keyboard Shortcut

- Add `Ctrl+Shift+R` as a Chrome extension command for "Run" (inject scripts)
- Display the shortcut badge on the Run button

---

## Injection Flow

```
1. User clicks "Run" in popup
2. Popup sends INJECT_SCRIPTS message to background
3. Background resolves macro-looping.js from storage
4. Background injects in 3 stages:
   a. Custom variables (if any) → window context
   b. Config JSON → window.__MARCO_CONFIG__
   c. macro-looping.js → MAIN world execution
5. Script reads window.__MARCO_CONFIG__ and initializes
6. Script creates UI panels on the page
7. Popup calls window.__loopShowPanel() to reveal UI
```

---

## Force Inject Flags

For manual testing on non-target domains:

- `window.__loopForceInject = true` — bypasses domain guard in macro-looping.js
- Set automatically by popup before injection

---

## Files Affected

| File | Change |
|---|---|
| `seed-chunks/seed-ids.ts` | Remove combo/controller IDs |
| `seed-chunks/combo-*.ts` | Delete |
| `seed-chunks/controller-*.ts` | Delete |
| `seed-chunks/looping-script-chunk.ts` | Update to contain full reference script |
| `seed-chunks/looping-config-chunk.ts` | Update to use unified config structure |
| `default-scripts-seeder.ts` | Remove combo/controller seeding |
| `popup.html` | Remove duplicate buttons, add Help button |
| `popup.css` | Fix tooltip clipping |
| `popup-actions.ts` | Remove duplicate button bindings |
| `popup-force-inject.ts` | Update force flags |
| `manifest.json` | Add keyboard shortcut command |

---

*Single script architecture specification v1.0.0 — 2026-03-12*
