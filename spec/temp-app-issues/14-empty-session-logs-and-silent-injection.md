# Issue #14: Empty Session Logs & Silent Injection Failure

**Status**: FIXED  
**Version**: v1.0.4  
**Severity**: Critical — no diagnostic visibility, user sees 0 logs  
**Category**: Logging / Injection Pipeline / Seeder  

## Symptom

User clicks "Run" or "Re-inject", popup shows injection feedback, but:
1. "Logs" button exports `{ logCount: 0, errorCount: 0, logs: [], errors: [] }`
2. No console logs visible in the popup or page DevTools
3. Scripts show "not loaded" despite toggles appearing ON
4. User has zero diagnostic visibility into what happened

## Root Causes

### Root Cause #1: Session-Scoped Log Export (Critical)

`GET_SESSION_LOGS` queries logs by `currentSessionId`. MV3 service workers restart frequently (idle timeout, navigation, memory pressure). Each restart calls `boot()` → `startSession()` → new session ID.

**Timeline of a typical failure:**

| Step | SW Lifecycle | Session ID |
|---|---|---|
| 1. User clicks "Run" | Lifecycle A | `abc-123` |
| 2. Injection succeeds, logs written | Lifecycle A | `abc-123` |
| 3. SW goes idle, terminates | — | — |
| 4. User clicks "Logs" | Lifecycle B (new boot) | `def-456` |
| 5. `GET_SESSION_LOGS` queries session `def-456` | Lifecycle B | `def-456` |
| 6. Result: 0 logs (all logs are under `abc-123`) | — | — |

The SQLite DB persists via OPFS, so the data IS there — it's just invisible because the query filters by the wrong session.

### Root Cause #2: Default Scripts Seeder Resets User Preferences

`seedScripts()` in `default-scripts-seeder.ts` runs on **every boot** and contains normalization logic:

```typescript
// Forces combo-switch and macro-looping back to isEnabled: false
const shouldDisable = script.id === DEFAULT_COMBO_SCRIPT_ID
    || script.id === DEFAULT_LOOPING_SCRIPT_ID;
if (shouldDisable && script.isEnabled !== false) {
    return { ...script, isEnabled: false };
}
```

This means:
1. User enables combo-switch via popup toggle → `isEnabled: true` saved to storage
2. SW restarts (MV3 lifecycle) → `boot()` → `seedDefaultScripts()`
3. Seeder reads scripts, finds combo-switch with `isEnabled: true`
4. Normalization forces it back to `isEnabled: false`
5. Popup still shows old toggle state until refresh
6. Next "Run" click → script-resolver skips disabled scripts
7. User sees "injected" but the script never actually ran

### Root Cause #3: No Popup-Side Injection Diagnostics

All injection logging (`[injection]` prefix) goes to the **service worker console**, which is only accessible via `chrome://extensions` → "Inspect views: service worker". Users looking at the popup console or page console see nothing injection-related.

## Fixes

### Fix #1: Return Recent Logs Across All Sessions

Modified `handleGetSessionLogs` to fall back to recent cross-session logs when the current session is empty. This ensures the "Logs" button always returns useful data regardless of SW lifecycle boundaries.

### Fix #2: Remove Boot-Time isEnabled Normalization

Removed the normalization loop from `seedScripts()` that forced default scripts back to their initial enabled/disabled states. The seeder now only adds missing scripts with their default `isEnabled` values — it never overwrites existing preferences.

### Fix #3: Version Bump

Bumped to v1.0.4 to mark the fix.

## Rules

- **RULE-LOG-1**: `GET_SESSION_LOGS` MUST return recent logs even when the current session has no entries. Session-scoped queries MUST fall back to cross-session recent history.
- **RULE-SEED-1**: The default scripts seeder MUST NOT overwrite user-modified fields (`isEnabled`, `code`, `configBinding`) on existing scripts. It may only ADD missing scripts.

## Files Changed

- `chrome-extension/src/background/handlers/logging-handler.ts` — Fallback to recent cross-session logs
- `chrome-extension/src/background/default-scripts-seeder.ts` — Removed isEnabled normalization
- `chrome-extension/manifest.json` — Version bump to 1.0.4
- `chrome-extension/src/shared/constants.ts` — Version bump to 1.0.4
