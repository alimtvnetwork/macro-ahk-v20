# Issue 77 — Script Re-Inject from Extension

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| ID           | 77                                     |
| Status       | ✅ Fixed (all tasks complete)          |
| Severity     | Enhancement                            |
| Version      | 1.69.0                                 |
| Created      | 2026-03-26                             |
| Updated      | 2026-03-26                             |
| Component    | Macro Controller + Chrome Extension    |

---

## Problem Statement

When a standalone script (e.g., `macro-looping.js`) is rebuilt via `npm run build:macro-controller`, the injected runtime in the browser still runs the **old version**. The developer must manually:

1. Rebuild the extension (`npm run build:extension`)
2. Reload the unpacked extension in `chrome://extensions`
3. Hard-refresh the project tab
4. Re-inject the script

This 4-step friction loop adds 30–60s per iteration during active development.

### What This Feature Solves

Steps 3–4 (page refresh + manual re-inject). The extension **must still be rebuilt and reloaded** (steps 1–2) for the new script to appear in its bundled `web_accessible_resources`. Once the extension is reloaded, this feature detects the version mismatch and re-injects without a page refresh.

## Root Cause

- The extension bundles compiled scripts into `dist/projects/scripts/{name}/` at build time via the `copyProjectScripts()` Vite plugin
- Once injected into the page's MAIN world, the script blob is static — no mechanism exists to detect or push updates
- The `instruction.json` contains a `version` field but it's never compared against the injected runtime's `VERSION` constant

## Solution: Script Re-Inject

### Architecture

```
┌──────────────────────┐     GET_SCRIPT_INFO       ┌─────────────────────┐
│  Macro Controller    │ ──────────────────────────►│  Chrome Extension   │
│  (MAIN world)        │                            │  (Service Worker)   │
│                      │  { version, scriptSource } │                     │
│  🔄 Re-inject button │ ◄──────────────────────────│  Reads bundled file │
│  shows: v1.69.0      │                            │  via getURL()       │
│  available: v1.70.0  │                            │                     │
│                      │  destroyPanel() + eval()   │                     │
│                      │  (self-managed in MAIN)    │                     │
└──────────────────────┘                            └─────────────────────┘
```

**Key design decision**: The macro controller handles its own teardown + blob re-eval in MAIN world. The extension only provides the script source — it does NOT perform injection. This avoids duplicating injection logic.

### Message Contract

#### `GET_SCRIPT_INFO` — Version check + optional script fetch

**Request** (page → extension via bridge):
```json
{
  "type": "GET_SCRIPT_INFO",
  "source": "marco-controller",
  "scriptName": "macroController"
}
```

**Response** (version check only):
```json
{
  "isOk": true,
  "scriptName": "macroController",
  "bundledVersion": "1.70.0",
  "outputFile": "macro-looping.js",
  "sizeBytes": 1697450
}
```

#### `HOT_RELOAD_SCRIPT` — Fetch script source for re-injection

**Request** (page → extension via bridge):
```json
{
  "type": "HOT_RELOAD_SCRIPT",
  "source": "marco-controller",
  "scriptName": "macroController"
}
```

**Response** (includes full script text):
```json
{
  "isOk": true,
  "scriptName": "macroController",
  "version": "1.70.0",
  "scriptSource": "/* full JS content */"
}
```

### How the Extension Reads Scripts

Scripts are accessed via `chrome.runtime.getURL()` which reads from the **bundled** `web_accessible_resources`, NOT the filesystem. This means:

```typescript
// ✅ Correct — reads from extension bundle
const url = chrome.runtime.getURL("projects/scripts/macro-controller/instruction.json");
const res = await fetch(url);

// ❌ Wrong — service workers cannot access the developer's filesystem
const fs = require("fs");
```

**Implication**: The extension must be rebuilt (`npm run build:extension`) and reloaded in `chrome://extensions` for new script versions to be available. This feature eliminates steps 3–4 (page refresh + manual re-inject), not steps 1–2.

### `instruction.json` Schema

Each standalone script folder contains a compiled `instruction.json` (from `src/instruction.ts`):

```json
{
  "schemaVersion": "1.0",
  "name": "macro-controller",
  "displayName": "Macro Controller",
  "version": "2.1.0",
  "description": "Macro Controller for workspace and credit management",
  "world": "MAIN",
  "dependencies": ["xpath"],
  "loadOrder": 2,
  "assets": {
    "css": [{ "file": "macro-looping.css", "inject": "head" }],
    "scripts": [{ "file": "macro-looping.js", "order": 1, "isIife": true }]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | ✅ | Schema version for forward compatibility |
| `name` | string | ✅ | Project identifier (matches folder name) |
| `displayName` | string | ✅ | Human-readable name |
| `version` | string | ✅ | Semver version string |
| `world` | string | ❌ | Injection world: `"MAIN"` or `"ISOLATED"` |
| `dependencies` | string[] | ❌ | Other project names required first |
| `loadOrder` | number | ❌ | Injection priority (lower = earlier) |
| `assets` | object | ✅ | CSS, configs, scripts, templates, prompts |
| `description` | string | ❌ | Human-readable description |

### Script Folder Mapping

The handler maps logical names to folder paths:

```typescript
const SCRIPT_FOLDER_MAP: Record<string, string> = {
    macroController: "macro-controller",
    "marco-sdk": "marco-sdk",
    xpath: "xpath",
};
```

### UI: Re-Inject Section in Macro Controller

Located in the **menu/dropdown** area of the macro controller panel:

```
┌─────────────────────────────────┐
│ 🔄 Script Re-Inject             │
│ Running: v1.69.0                │
│ Available: v1.70.0  [Re-Inject] │
│ Last checked: 18:30:45          │
└─────────────────────────────────┘
```

- **Manual check**: Click section header or a "Check" button to query `GET_SCRIPT_INFO`
- **Check on panel creation**: One-time check when the panel is first built
- **No auto-polling**: Manual-only to avoid wasteful polling (developer triggers when needed)
- **Re-inject button**: Visible only when version mismatch detected
- **Post-update flow**: Macro controller calls `destroyPanel()` → creates blob from `scriptSource` → evaluates → new panel auto-creates

### Re-Injection Flow (Macro Controller Side)

```
1. User clicks [Re-Inject]
2. Save state to localStorage (see State Preservation below)
3. Call destroyPanel() — cleans up DOM, timers, observers, loops
4. Remove old blob <script> elements (data-marco-injection attribute)
5. Create new Blob from scriptSource
6. Append <script> with blob URL + sourceURL directive
7. New script self-initializes → reads preserved state → restores
```

### State Preservation Keys

Before teardown, the following state is saved to `localStorage` under the prefix `__marco_reinject_`:

| Key | Type | Description |
|-----|------|-------------|
| `__marco_reinject_wsName` | string | Current workspace name |
| `__marco_reinject_wsId` | string | Current workspace ID |
| `__marco_reinject_loopRunning` | boolean | Whether loop was active |
| `__marco_reinject_loopDirection` | string | Loop direction (`"up"` / `"down"`) |
| `__marco_reinject_creditData` | JSON string | Serialized credit state |
| `__marco_reinject_timestamp` | number | Unix ms when state was saved |

**Restoration rules**:
- On startup, check for `__marco_reinject_timestamp`
- If present and < 10s old, restore state and clear all `__marco_reinject_*` keys
- If > 10s old or missing, ignore (stale data) and clear keys
- If `loopRunning` was true, do NOT auto-restart the loop — show a toast: "Script re-injected. Loop was running — click Start to resume."

### Safety Guardrails

1. **Teardown before re-inject**: Call existing `destroyPanel()` flow to clean up DOM, timers, observers
2. **State preservation**: Save critical state to localStorage with TTL (see above)
3. **Relay health**: Verify message relay is active (`window.__marcoRelayActive`) before attempting
4. **Cooldown**: 5s minimum between re-inject attempts to prevent rapid-fire
5. **Graceful fallback**: If state restoration fails, start clean with a console warning

## Implementation Status

| Task | Description | Status |
|------|------------|--------|
| 8.1 | Add `GET_SCRIPT_INFO` + `HOT_RELOAD_SCRIPT` message types to `messages.ts` | ✅ Done |
| 8.2 | Create `script-info-handler.ts` with both handlers | ✅ Done |
| 8.3 | Register handlers in `message-registry.ts` router | ✅ Done |
| 8.4 | Add message types to relay `ALLOWED_TYPES` | ✅ Done |
| 8.5 | Expose `VERSION` via `RiseupAsiaMacroExt.Projects.MacroController.meta.version` + create `hot-reload-section.ts` | ✅ Done |
| 8.6 | Wire re-inject section into `panel-builder.ts` | ✅ Done |
| 8.7 | Implement teardown-safe re-injection (state save/restore + blob replacement) | ✅ Done |
| 8.8 | Build, sync, and test | ✅ Done |

## Acceptance Criteria

- [ ] `GET_SCRIPT_INFO` returns bundled version from `instruction.json` via `chrome.runtime.getURL()` ✅
- [ ] `HOT_RELOAD_SCRIPT` returns full script source text ✅
- [ ] Content script relay forwards both message types ✅
- [ ] Macro controller shows "Script Re-Inject" section with running vs. available version
- [ ] Re-inject button triggers teardown + blob re-eval + new UI creation
- [ ] State is preserved across re-inject (workspace, credits)
- [ ] Loop is NOT auto-restarted — user must click Start
- [ ] Version mismatch detected on panel creation (one-time check)
- [ ] No page reload required
- [ ] 5s cooldown between re-inject attempts

## Files

### Created (✅ Done)
- `src/background/handlers/script-info-handler.ts` — `GET_SCRIPT_INFO` + `HOT_RELOAD_SCRIPT` handlers

### Modified (✅ Done)
- `src/shared/messages.ts` — Added message types
- `src/background/message-registry.ts` — Registered handlers
- `src/content-scripts/message-relay.ts` — Added to `ALLOWED_TYPES`

### To Create
- `standalone-scripts/macro-controller/src/ui/hot-reload-section.ts` — Re-inject UI section builder

### To Modify
- `standalone-scripts/macro-controller/src/ui/panel-builder.ts` — Wire re-inject section
- `standalone-scripts/macro-controller/src/shared-state.ts` — Expose `VERSION` via `RiseupAsiaMacroExt` namespace (Issue 78)

## Dependencies

- Existing `destroyPanel()` flow (`src/ui/ui-updaters.ts`)
- Bundled `instruction.json` files (via `copyProjectScripts()` Vite plugin)
- Message relay (`src/content-scripts/message-relay.ts`)
- `data-marco-injection` attribute on injected script elements
