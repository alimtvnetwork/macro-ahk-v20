# Check Button Issue #11 — Missing Builtin Script Guard on Multiple Injection Paths

**Component**: `src/background/handlers/injection-request-resolver.ts`, `src/background/auto-injector.ts`, `src/background/spa-reinject.ts`
**Version affected**: v2.3.0
**Status**: Fixed
**Original**: Issue #11 (Check-button series)

---

## Issue Summary

1. **What happened**: Clicking "Run Scripts" in the popup shows "0 injected, 1 skipped: macro-looping.js: script not found in store — try reinstalling the extension" even though the extension is correctly installed and the script exists in the dist bundle.
2. **Where it happened**: Three injection paths were missing the builtin script guard:
   - Popup manual injection (`injection-request-resolver.ts` → `resolveProjectEntryScripts`)
   - Auto-injector (`auto-injector.ts` → `autoInjectForTab`) — registers its own `webNavigation.onCompleted` listener independently from `injection-handler.ts`
   - SPA re-injector (`spa-reinject.ts` → `reinjectFromSnapshot`)
3. **Symptoms and impact**: Users cannot inject scripts from any path if `chrome.storage.local` is empty. Toast shows "script not found in store" with a misleading suggestion to reinstall.
4. **How it was discovered**: User reported the error on the Lovable site after clicking Run Scripts on a matching page.

## Root Cause Analysis

1. **Direct cause**: Three out of four `resolveScriptBindings()` callers did NOT call `ensureBuiltinScriptsExist()` before resolving. If `chrome.storage.local` has no scripts (e.g., after a storage clear, corrupt install, or first-time race), the resolver returns "missing" for all scripts.

2. **Contributing factors**:
   - Only `injection-handler.ts` (line 85) had the guard — but this path is only used for popup-triggered injection via message passing.
   - `auto-injector.ts` registers its own `webNavigation.onCompleted` listener and bypasses `injection-handler.ts` entirely.
   - `spa-reinject.ts` uses stored bindings from `lastGoodBindings` and resolves independently.
   - The popup "Run Scripts" path goes through `injection-request-resolver.ts` directly.

3. **Triggering conditions**:
   - Scripts missing from `chrome.storage.local` (storage cleared, race condition on install, or corrupt state)
   - Any of the three unguarded paths executes

4. **Why the existing spec did not prevent it**: The builtin-script-guard spec only documented its integration with the `injection-handler.ts` path. The other three callers of `resolveScriptBindings` were not covered.

## Fix Description

1. **What was changed**: Added `ensureBuiltinScriptsExist()` + `readAllProjects()` calls before `resolveScriptBindings()` in all three affected files:
   - `src/background/handlers/injection-request-resolver.ts` — in `resolveProjectEntryScripts()`
   - `src/background/auto-injector.ts` — in `autoInjectForTab()`
   - `src/background/spa-reinject.ts` — in `reinjectFromSnapshot()`
2. **New rules**: Every injection path (auto, manual, SPA re-inject) must call the builtin script guard before resolving bindings.
3. **Why it resolves the root cause**: The guard reads all projects, checks if any referenced built-in scripts are missing from the store, and triggers `seedFromManifest()` to restore them before the resolver runs.

## Affected Paths — Full Audit

| # | File | Caller | Guard before fix | Guard after fix |
|---|------|--------|-------------------|-----------------|
| 1 | `injection-handler.ts` | Popup message handler | ✅ Already had | ✅ |
| 2 | `injection-request-resolver.ts` | Popup `resolveProjectEntryScripts` | ❌ Missing | ✅ Added |
| 3 | `auto-injector.ts` | `webNavigation.onCompleted` listener | ❌ Missing | ✅ Added |
| 4 | `spa-reinject.ts` | `onHistoryStateUpdated` listener | ❌ Missing | ✅ Added |

## Prevention and Non-Regression

| # | Rule | Anti-pattern |
|---|------|-------------|
| NR-11-A | Every injection entry point must call `ensureBuiltinScriptsExist()` before resolving | ❌ Adding a new injection path without the guard |
| NR-11-B | Test popup "Run Scripts" after any storage-related changes | ❌ Only testing auto-injection on navigation |
| NR-11-C | Search for all callers of `resolveScriptBindings` to ensure guard coverage | ❌ Assuming one path covers all injection flows |
| NR-11-D | Audit `resolveScriptBindings` callers when adding new injection paths | ❌ Registering new navigation listeners without guard |

## Cross-References

- [Check Button Master Overview](01-overview.md)
- [Issue #10: Runtime Seed Drift](10-runtime-seed-drift.md)
- [Self-Healing Script Storage Memory](../../.lovable/memory/architecture/self-healing-script-storage.md)
- Sources: `src/background/handlers/injection-request-resolver.ts`, `src/background/auto-injector.ts`, `src/background/spa-reinject.ts`
- Guard: `src/background/builtin-script-guard.ts`

## Done Checklist

- [x] Root cause identified: missing guard on 3 of 4 injection paths
- [x] Fix applied to `injection-request-resolver.ts`
- [x] Fix applied to `auto-injector.ts`
- [x] Fix applied to `spa-reinject.ts`
- [x] Full audit of all `resolveScriptBindings` callers completed
- [x] Issue write-up created and updated under `spec/17-app-issues/check-button/`
- [x] Non-regression rules documented
