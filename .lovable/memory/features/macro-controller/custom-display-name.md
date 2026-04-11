---
name: Custom display name for title bar
description: User can set a custom project display name in Settings → General that overrides auto-detected name in the title bar
type: feature
---

## Custom Display Name

The title bar project name badge now supports a user-configured custom display name.

### Priority Order (getDisplayProjectName)
0. `state.customDisplayName` — user-set via Settings → General (highest priority)
1. `state.projectNameFromApi` — API-resolved
2. `state.projectNameFromDom` — DOM XPath-resolved
3. Document title parse
4. Truncated project ID

### Persistence
- Stored in `localStorage` key `marco_custom_display_name`
- Loaded on init in `shared-state-runtime.ts`
- Saved/cleared in `settings-ui.ts` → `_saveGeneralSettings()`

### Title Bar Layout Change
- **Line 1 (title bar)**: Shows project name (custom or auto-detected), NOT workspace number
- **Line 2 (status bar)**: Shows workspace number + status (unchanged)

### Files
- `types/config-types.ts` — `customDisplayName` on `ControllerState`
- `shared-state-runtime.ts` — init from localStorage
- `logging.ts` — Priority 0 in `getDisplayProjectName()`
- `settings-tab-panels.ts` — "Custom Display Name" field in General panel
- `settings-ui.ts` — save/clear logic
- `panel-header.ts` + `ui-updaters.ts` — title bar prioritizes project name over workspace
