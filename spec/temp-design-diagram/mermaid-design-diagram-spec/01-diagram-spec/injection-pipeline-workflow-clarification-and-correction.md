# Injection Pipeline Workflow — Clarification & Correction Spec

**Created**: 2026-04-07  
**Status**: Approved  
**Diagram**: `standalone-scripts/macro-controller/diagrams/injection-pipeline-workflow.mmd`  
**Image**: `standalone-scripts/macro-controller/diagrams/images/injection-pipeline-workflow.png`

---

## Overview

This spec documents the corrected injection pipeline — the full flow from the user clicking **Run Scripts** in the popup to scripts executing in the target tab. Every stage is explained with concrete behavior, required logging, error handling, and UI feedback.

---

## Pipeline Entry: handleInjectScripts

**What it does**: This is the top-level orchestrator function called when the user clicks "Run Scripts" in the extension popup. It:

1. Records `performance.now()` as pipeline start time.
2. Identifies the active tab via `chrome.tabs.query`.
3. Injects a **loading spinner toast** into the tab (a small overlay notification that says "Injecting scripts...").
4. Kicks off Stage 0 through Stage 5 sequentially (with parallelism within stages where safe).
5. Catches any unhandled error at the top level and surfaces it as an **error toast** in the tab.
6. Returns an `InjectionResult[]` array to the popup for status display.

**Logging**: `[pipeline] START tabId=<id> url=<url> scriptCount=<n>` (INFO level).

---

## UI Feedback: Loading Spinner & Toast

- A **loading spinner toast** is injected into the tab DOM at pipeline start via `chrome.scripting.executeScript`. It is a small fixed-position overlay showing a spinner and "Injecting scripts..." text.
- The toast is **removed** at the end of the pipeline and replaced with either:
  - **Success toast** (green): "N scripts injected successfully"
  - **Warning toast** (amber): "N scripts injected, M warnings" (e.g., namespace degraded)
  - **Error toast** (red): "Injection failed: <reason>"
- Toasts auto-dismiss after 4 seconds.

---

## Stage 0a: ensureBuiltinScriptsExist

**Purpose**: Validates that all built-in scripts (scripts bundled with the extension, such as the Marco SDK preamble, relay installer, namespace bootstrap) exist in `chrome.storage.local`.

**Behavior**:
1. Reads the list of required built-in script IDs from the project manifest.
2. For each script, checks if it exists in `chrome.storage.local` with valid, non-empty code.
3. If a script is **found**: log `[stage:0a] Built-in script found: <scriptId>` (INFO).
4. If a script is **missing**: log `[stage:0a] ERROR: Built-in script missing: <scriptId>` (ERROR).
5. Missing built-in scripts trigger **self-healing** — the guard re-seeds them from the extension's bundled assets (`/scripts/` directory).
6. If re-seeding also fails, the pipeline records a **hard error** for that script but continues with remaining scripts (the missing script will appear as failed in results).

**Logging**:
- INFO: Each found script.
- ERROR: Each missing script with re-seed attempt result.
- WARN: If re-seeding was needed (indicates storage corruption or first-run).

---

## Stage 0b: prependDependencyScripts (Topological Sort)

**Purpose**: Ensures dependency scripts are injected before the scripts that depend on them. Uses topological sort on the dependency graph defined in project configuration.

**Behavior**:
1. Reads dependency declarations from each project's `dependsOn` field.
2. Builds a directed acyclic graph (DAG) of script dependencies.
3. Performs topological sort to determine injection order.
4. Prepends dependency scripts to the injection queue ahead of their dependents.
5. If a dependency **cannot be found** in the script store, it is logged as an error and the dependent script is also marked as failed.

**Logging**:
- INFO: `[stage:0b] Dependency order: [scriptA, scriptB, scriptC]` — the resolved order.
- INFO: `[stage:0b] Injecting dependency: <scriptId> (required by: <dependentId>)` — for each dependency.
- ERROR: `[stage:0b] Dependency not found: <scriptId> (required by: <dependentId>)` — missing dependency.
- WARN: `[stage:0b] Circular dependency detected between <A> and <B>` — if the DAG has cycles (should not happen, but guarded).

---

## Stage 1: resolveInjectionRequestScripts

**Purpose**: Converts the popup's injection request (a list of script entries or raw injectable scripts) into fully resolved, executable `PreparedInjectionScript` objects with their code, config JSON, and theme JSON loaded.

**Behavior**:
1. Determines if input scripts are `ScriptEntry[]` (stored project scripts with `path` + `order`) or `InjectableScript[]` (already have `code`).
2. For `ScriptEntry[]`: loads code from `chrome.storage.local` via `resolveScriptBindings`, loads associated config and theme JSON.
3. For `InjectableScript[]`: passes through with type validation.
4. Any script that **fails resolution** (code not found, config missing, type mismatch) is classified as a **hard error**:
   - Logged as ERROR: `[stage:1] HARD ERROR: Script unresolvable: <scriptId> reason=<reason>`
   - Added to the `skipped` array with reason.
   - The pipeline continues with remaining scripts but the failed script is surfaced as an error in final results.
5. If **zero scripts resolve** successfully, the pipeline halts with an error toast: "No scripts could be resolved — check script store integrity."

**Logging**:
- INFO: `[stage:1] Resolved <n>/<total> scripts`
- ERROR: Each unresolvable script with reason (e.g., `code_not_found`, `config_missing`, `type_mismatch`).
- The phrase "return skipped results + mirror to tab" is **removed**. Instead: unresolved scripts are hard errors logged to both extension console and mirrored to tab DevTools.

---

## Stage 2: Parallel Bootstrap (3 tasks via Promise.all)

**Purpose**: Prepares the tab environment before any user scripts execute. Three independent tasks run in parallel:

### 2a: bootstrapNamespaceRoot

Creates `window.RiseupAsiaMacroExt` in the tab's MAIN world. This is the root namespace object that all macro scripts attach to. It must exist before any script tries to access `RiseupAsiaMacroExt.require()` or register a module.

- Injected via `chrome.scripting.executeScript` into the **MAIN world**.
- If CSP (Content Security Policy — see Stage 4 for full explanation) blocks this injection, the namespace cannot be created in MAIN world. This is logged as ERROR and the extension health is set to `DEGRADED`.
- **No fallback**: the namespace MUST be in MAIN world because page scripts need to access it. ISOLATED world injection would be invisible to page scripts.

### 2b: ensureRelayInjected

Installs the message relay content script in the ISOLATED world. This relay bridges communication between page scripts (MAIN world) and the background service worker via `window.postMessage` → `chrome.runtime.sendMessage`.

- Checks if the relay is already installed (via a sentinel global).
- If not present, injects the relay content script.
- Logged: `[stage:2b] Relay injected` or `[stage:2b] Relay already present`.

### 2c: seedTokensIntoTab

Seeds authentication tokens from the extension's stored cookies/tokens into the tab's `localStorage` so that page scripts can read bearer tokens without needing direct cookie access.

- Reads JWT from extension storage (resolved via the auth bridge 2-tier waterfall).
- Writes to tab's `localStorage` via `chrome.scripting.executeScript` in MAIN world.
- Logged: `[stage:2c] Token seeded: <key>=<truncated>` or `[stage:2c] No token available to seed`.

**Dependency rule**: All three tasks must complete before Stage 3 begins. If any task fails, its error is logged but the pipeline continues (the failure may cause downstream issues that will be caught by post-injection verification).

---

## Stage 3: Script Wrapping & Preparation

**Purpose**: Transforms each resolved script's raw code into an isolated, safe-to-execute form. This stage prepares the code for injection but does NOT execute it.

### What "batch concatenate wrapped scripts" means

When no scripts have CSS assets, all scripts are combined into a **single code string** for a single injection call (one `chrome.scripting.executeScript` invocation instead of N). This is a performance optimization — one IPC call instead of many.

### What "wrapWithIsolation" means

Each script's code is wrapped in an IIFE (Immediately Invoked Function Expression) with error handling:

```javascript
// Example: what wrapWithIsolation produces
(function() {
  "use strict";
  try {
    // --- SDK preamble injected here ---
    const marco = window.RiseupAsiaMacroExt?.sdk || {};
    
    // --- original script code ---
    console.log("Hello from MyScript");
    // ... rest of script ...
    
  } catch (e) {
    console.error("[MacroExt:MyScript] Runtime error:", e);
    window.RiseupAsiaMacroExt?.reportError?.("MyScript", e);
  }
})();
```

This ensures:
- Each script runs in its own function scope (no variable leaks between scripts).
- Errors in one script do not crash other scripts.
- The SDK preamble gives each script access to the `marco` helper object.

### What "combine into single code string" means

After wrapping, all wrapped IIFEs are concatenated with newlines:

```javascript
// Script 1 (order: 1)
(function() { /* wrapped script 1 */ })();

// Script 2 (order: 2)  
(function() { /* wrapped script 2 */ })();

// Script 3 (order: 3)
(function() { /* wrapped script 3 */ })();
```

This single string is passed to Stage 4 for execution.

### CSS Asset Handling

If any script has associated CSS assets (declared in project config):
- The pipeline switches to **sequential injection** instead of batch.
- Each script is injected individually via `injectSingleScript`.
- CSS is injected FIRST (via `chrome.scripting.insertCSS`), then the script's JS code.
- This ensures CSS is available before the script runs (the script may depend on CSS classes or variables).
- Logged: `[stage:3] CSS asset detected for <scriptId>, switching to sequential mode`.
- Logged: `[stage:3] Injecting CSS: <cssPath> for script <scriptId>`.

**Logging**:
- INFO: `[stage:3] Wrapping <n> scripts, mode=<batch|sequential>`
- INFO: `[stage:3] Combined code size: <bytes> bytes` (for batch mode)
- WARN: If combined code exceeds 500KB: `[stage:3] Large payload warning: <bytes> bytes`

---

## Stage 4: Execute in Tab (CSP-Aware)

**Purpose**: Executes the prepared code string in the target tab. This stage handles Content Security Policy restrictions that may block inline script execution.

### What is CSP (Content Security Policy)?

CSP is a browser security mechanism. Websites can set HTTP headers like:
```
Content-Security-Policy: script-src 'self' https://cdn.example.com
```
This tells the browser: "Only execute scripts from my own domain or cdn.example.com." When CSP is active, injecting inline JavaScript via `chrome.scripting.executeScript` with `func` may be blocked because the browser treats it as inline script execution. The extension must detect this and use alternative injection methods.

### Execution Flow

#### Primary: MAIN World Direct Blob Injection

1. The combined code string is converted to a `Blob` with MIME type `text/javascript`.
2. A `blob:` URL is created via `URL.createObjectURL(blob)`.
3. A `<script>` element is created with `src` set to the blob URL.
4. The script element is appended to `document.head`.
5. This runs in the **MAIN world** — the same JavaScript context as the page itself — so injected code can access `window`, `document`, and all page globals.
6. The blob URL is revoked after execution completes.

**Why blob?** Blob URLs bypass CSP `script-src` restrictions in most cases because the browser treats blob URLs as same-origin. This is the preferred injection method.

#### Fallback 1: userScripts API (Chrome 120+)

If blob injection fails (some very strict CSP policies block blob URLs too):
1. The extension checks if `chrome.userScripts` API is available (requires Chrome 120+ and `userScripts` permission in manifest).
2. If available, registers the code as a user script via `chrome.userScripts.register()`.
3. The user script executes in the MAIN world with full page access.
4. After execution, the registration is cleaned up.
5. Logged: `[stage:4] CSP blocked blob injection, using userScripts API fallback`.

**Why check availability?** The `userScripts` API is only available in Chrome 120+ and requires the `userScripts` permission. Older Chrome versions or browsers without this permission cannot use this path.

#### Fallback 2: ISOLATED World Blob Injection (Last Resort)

If `userScripts` API is also unavailable:
1. The code is injected via `chrome.scripting.executeScript` into the **ISOLATED world** (the content script sandbox).
2. ISOLATED world does NOT share `window` with the page — page globals are invisible.
3. This is a **degraded mode**: scripts that need `window.RiseupAsiaMacroExt` or page DOM manipulation will partially or fully fail.
4. Logged as ERROR: `[stage:4] ERROR: Forced to ISOLATED world — scripts will have limited page access`.
5. Extension health is set to `DEGRADED`.

**Why this fallback exists**: It is a last resort to execute utility scripts that don't need page globals (e.g., logging-only scripts). Most scripts will fail in this mode, which is why it produces an ERROR log and DEGRADED health.

**Logging**:
- INFO: `[stage:4] Executing in MAIN world via blob injection`
- WARN: `[stage:4] CSP blocked, attempting userScripts fallback`
- ERROR: `[stage:4] userScripts unavailable, falling back to ISOLATED world (DEGRADED)`
- ERROR: `[stage:4] Execution failed: <error message>`

---

## Stage 5: Namespace Registration (Post-Execution)

### Why namespaces are injected AFTER script execution (corrected explanation)

**IMPORTANT CLARIFICATION**: The namespaces injected in Stage 5 are **data namespaces** (settings values, project variable bindings), NOT the root namespace object. The root namespace (`window.RiseupAsiaMacroExt`) is already created in Stage 2a BEFORE any scripts run.

Stage 5 populates the namespace with **runtime data** that scripts may read lazily:

### 5a: injectSettingsNamespace

Writes extension settings and the LLM guide into `window.RiseupAsiaMacroExt.Settings`:
```javascript
window.RiseupAsiaMacroExt.Settings = { /* extension settings */ };
window.RiseupAsiaMacroExt.llmGuide = "...";
```
Scripts that need settings use `RiseupAsiaMacroExt.Settings.get("key")` — this works even if called after Stage 5 completes because the namespace root already exists from Stage 2a and scripts access settings asynchronously or on user interaction (not during initial execution).

### 5b: injectProjectNamespaces

Writes per-project variable bindings:
```javascript
window.RiseupAsiaMacroExt.Projects = {
  "ProjectA": { vars: new Map([["key1", "value1"]]) },
  "ProjectB": { vars: new Map([["key2", "value2"]]) }
};
```
Accessible via `RiseupAsiaMacroExt.Projects.ProjectA.vars.get("key1")`.

### Execution model

- 5a and 5b run in **parallel** (they write to different sub-namespaces).
- Both inject via `chrome.scripting.executeScript` in MAIN world.
- If CSP blocks injection, health is set to DEGRADED and the error is logged.

**Logging**:
- INFO: `[stage:5a] Settings namespace injected (<n> keys)`
- INFO: `[stage:5b] Project namespaces injected: [ProjectA, ProjectB]`
- ERROR: `[stage:5] Namespace injection failed: <reason>` — sets health to DEGRADED.

### Dependency safety

The root namespace object (`window.RiseupAsiaMacroExt`) is created in Stage 2a. Scripts execute in Stage 4. Data namespaces are populated in Stage 5. Scripts that reference `RiseupAsiaMacroExt.Settings` during initial execution (synchronously, immediately) would get `undefined`. This is acceptable because:
1. Scripts should access settings on user interaction or via `setTimeout`/`requestAnimationFrame`, not synchronously at load time.
2. The SDK preamble (injected in Stage 3 wrapping) includes a `marco.whenReady()` helper that defers access until namespaces are populated.

---

## Post-Pipeline

### Result Collection

All `InjectionResult` objects from Stage 4 (and Stage 3 sequential path) are collected into a single array. Each result contains:
- `scriptId`: which script was injected.
- `success`: boolean.
- `world`: which world it executed in (MAIN, ISOLATED).
- `durationMs`: execution time.
- `error`: error message if failed.

### Log Mirroring

All pipeline logs accumulated during Stages 0-5 are **mirrored to the tab's DevTools console** via `chrome.scripting.executeScript`:
```javascript
console.groupCollapsed("[MacroExt] Injection Pipeline Log");
// ... all accumulated log lines ...
console.groupEnd();
```
This ensures developers can see the full pipeline trace in the tab's DevTools without needing the extension's background console.

Logs are also written to the **extension's logging surface** (SQLite via `recordInjection` and OPFS session log).

### Performance Budget

If `totalMs` (pipeline end minus start) exceeds the budget (default: 2000ms):
- Logged as WARN: `[pipeline] PERFORMANCE BUDGET EXCEEDED: <totalMs>ms (budget: 2000ms)`
- The warning is included in the tab DevTools mirror.

### Timing Recording

`recordInjectionTiming` writes to SQLite:
- Pipeline start/end timestamps.
- Per-stage durations.
- Total script count and success count.

### Post-Injection Verification

`verifyPostInjectionGlobals` checks 6 globals in the tab:

| Check | What it verifies | Failure meaning |
|-------|-----------------|-----------------|
| `window.marco` | SDK helper object exists | SDK preamble failed to inject |
| `window.RiseupAsiaMacroExt` | Root namespace exists | Stage 2a bootstrap failed |
| `window.MacroController` | Main controller class | Core script failed |
| `api.mc` | Controller singleton | Controller didn't initialize |
| UI container element | DOM element for macro UI | UI rendering failed |
| Injection marker | `__macroExtInjected` flag | Pipeline didn't complete |

Results are saved to the state manager. Any failed check produces a WARN log.

### Final Toast

- **All passed**: Success toast (green).
- **Some warnings**: Warning toast (amber) listing which checks failed.
- **Critical failure** (namespace or SDK missing): Error toast (red).

---

## Logging Summary Table

| Stage | Log Level | What is Logged |
|-------|-----------|---------------|
| Entry | INFO | Pipeline start, tab ID, URL, script count |
| 0a | INFO/ERROR | Each built-in script found/missing, re-seed results |
| 0b | INFO/ERROR | Dependency order, each dependency found/missing |
| 1 | INFO/ERROR | Resolution count, each skipped script with reason |
| 2a | INFO/ERROR | Namespace bootstrap result, CSP block if any |
| 2b | INFO | Relay injection or already-present |
| 2c | INFO | Token seeding result |
| 3 | INFO/WARN | Wrap mode, combined size, CSS detection |
| 4 | INFO/WARN/ERROR | Execution world, CSP fallback path, execution errors |
| 5 | INFO/ERROR | Namespace data injection results |
| Post | INFO/WARN | Timing, budget, verification results |
| Final | INFO/ERROR | Success/failure toast, final result summary |

All logs are mirrored to both the **extension background console** and the **tab DevTools console**.

---

## Ambiguities Documented

1. **Missing script halts pipeline vs. continues**: Currently, a missing built-in script (Stage 0a) triggers self-healing and continues. A missing user script (Stage 1) is a hard error for that script but the pipeline continues with remaining scripts. The pipeline only fully halts if zero scripts resolve.

2. **CSS assets — mandatory or optional**: CSS assets are optional. If declared in project config, they are injected before their script. If CSS injection fails, the script still executes (with a WARN log) because the CSS may be cosmetic, not functional.

3. **Namespace injection timing**: The root namespace (`RiseupAsiaMacroExt`) is created in Stage 2a (before scripts). Data namespaces (Settings, Projects) are populated in Stage 5 (after scripts). Scripts must use `marco.whenReady()` for synchronous settings access during load.

4. **ISOLATED world fallback**: This is a genuine last-resort degraded mode. Most scripts will partially fail. It exists because executing something (e.g., logging scripts) is better than executing nothing. The degradation is explicitly logged as ERROR.

---

## Corrected Execution Order Summary

```
1. handleInjectScripts — pipeline start, record timing
2. Show loading spinner toast in tab
3. Stage 0a: Validate built-in scripts (self-heal if missing)
4. Stage 0b: Resolve dependencies (topological sort, prepend)
5. Stage 1: Resolve all scripts to executable form (hard error for failures)
6. Stage 2: Parallel bootstrap [namespace root + relay + token seeding]
7. Stage 3: Wrap scripts in IIFE isolation + SDK preamble
   - If CSS assets: sequential inject (CSS first, then JS per script)
   - If no CSS: batch concatenate all wrapped scripts
8. Stage 4: Execute in tab (MAIN blob → userScripts fallback → ISOLATED last resort)
9. Stage 5: Populate data namespaces (Settings + Projects) — parallel
10. Post: Collect results, mirror logs, check budget, record timing
11. Verify 6 post-injection globals
12. Show success/warning/error toast, return results
```
