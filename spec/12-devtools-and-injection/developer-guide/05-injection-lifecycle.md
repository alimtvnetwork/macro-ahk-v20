# 05 — Injection Lifecycle

> How scripts are loaded and executed in the browser.
> Updated to match the canonical diagram: `injection-pipeline-workflow.mmd`

---

## Pipeline Overview

The injection pipeline is triggered by the user clicking **Run Scripts** or **Force Run Scripts** in the popup. The orchestrator (`handleInjectScripts`) manages all stages sequentially unless explicitly marked as parallel.

Two modes:
- **Normal** — uses cache when available
- **Force Reload** — bypasses cache, rebuilds from scratch

---

## Pre-Pipeline: User Trigger + Toast + Cache Gate

### User Trigger

1. User clicks **Run Scripts** (normal) or **Force Run Scripts** (forceReload) in popup
2. Orchestrator records `performance.now()` start time
3. Queries active tab via `chrome.tabs`
4. Logs `INFO: pipeline START tabId, url, scriptCount`

### Loading Toast

A fixed overlay with spinner ("Injecting scripts...") is injected into the tab immediately. It remains visible during the entire pipeline and is replaced by the result toast at the end.

### Force Run Bypass

If `forceReload` is set:
- Cached entry is deleted from IndexedDB
- Logs `INFO: FORCE RUN — cache cleared`
- Skips directly to Stage 0a

### Cache Decision Gate

For normal runs:
1. Read current version from `chrome.runtime.getManifest().version`
2. Look up cached payload in IndexedDB (`marco_injection_cache`) by version key
3. Outcomes:
   - **HIT** (version matches) → Skip Stages 0–3, use cached wrapped payload, jump to Stage 4
   - **MISS** (version mismatch) → Log `cached=A.B.C current=X.Y.Z`, proceed to Stage 0a
   - **MISS** (cache empty) → Log `no cached payload found`, proceed to Stage 0a
   - **CORRUPT** (unreadable) → Log `ERROR: corrupt, delete + rebuild`, proceed to Stage 0a

> Cache key is the manifest version string only. No hashing. No content comparison. Single entry for entire payload.

---

## Stage 0a: ensureBuiltinScriptsExist

Ensures required built-in scripts exist in `chrome.storage.local`.

1. Read required built-in script IDs from manifest
2. Check each exists in `chrome.storage.local`
3. Log `INFO` per found script, `ERROR` per missing script
4. Self-heal missing scripts from bundled `/scripts/` directory
5. If any built-in is still missing after self-heal → **HARD ERROR** for that script, continue with remaining

> Built-in scripts: SDK preamble, relay installer, namespace bootstrap.

---

## Stage 0b: prependDependencyScripts

Resolves inter-project dependencies and orders scripts.

1. Read `dependsOn` from each project config
2. Build DAG, perform topological sort
3. Prepend dependency scripts before dependents
4. Log `INFO: resolved order`
5. Missing dependency → **ERROR** for both the dependency and the dependent

> Example: if B depends on A, injection order becomes [A, B, …]

---

## Stage 1: resolveInjectionRequestScripts

Resolves each script to injectable code + config.

1. Load script code from `chrome.storage.local`
2. Load bound config JSON and theme JSON (if any)
3. Unresolvable script = **HARD ERROR** (not silently skipped)
4. Log `ERROR` per failed script with reason (`code_not_found`, `config_missing`, `type_mismatch`)
5. If **zero** scripts resolve → pipeline halts, error toast shown, `LOG ERROR`

---

## Stage 2: Tab Environment Prep (Parallel — `Promise.all`)

Three tasks run in parallel:

### 2a: bootstrapNamespaceRoot

```javascript
window.RiseupAsiaMacroExt ??= { Projects: {} };
```

- Injected into **MAIN world** via `chrome.scripting.executeScript`
- MAIN world = page JS context, shares `window` with page scripts
- If CSP blocks → health = **DEGRADED**, `LOG ERROR`
- **No ISOLATED world fallback** — namespace would be invisible to page scripts

### 2b: ensureRelayInjected

- Relay is a content script in **ISOLATED world**
- Bridges page `postMessage` events to `chrome.runtime.sendMessage`
- Duplicate check: looks for `__marcoRelayInstalled` marker
- If marker exists → skip. If not → inject

> ISOLATED world: separate JS environment. Shares DOM but not `window` variables. Relay uses `postMessage` as the bridge.

### 2c: seedTokensIntoTab

1. Read `marco_bearer_token` + timestamp from storage
2. If age under TTL (2 min) → use stored token
3. If expired → re-read cookie, store with new timestamp
4. Write token to tab `localStorage` via MAIN world injection

> Simple flow: read cookie → store with timestamp → check expiry → re-read if stale. NO auth logic, NO JWT validation, NO waterfall.

---

## Stage 3: Wrap + Prepare

After Stage 2 completes, the pipeline checks whether any scripts have CSS assets:

### Path A: CSS Detected → Sequential Injection Mode

CSS must load **before** its JS runs. Each script is injected individually:

1. `chrome.scripting.insertCSS` — inject stylesheet
2. Wait for CSS load
3. Wrap JS with try-catch IIFE
4. Execute wrapped JS

> If a script has no CSS, its JS is injected in the same order but the CSS step is skipped.

### Path B: No CSS → Batch Mode

All scripts are batched into a single payload:

1. **Wrap** each script in a try-catch IIFE:
   - Own function scope (no variable leaks)
   - `try/catch` (one failure doesn't break others)
   - SDK preamble (`window.marco` helper access)
   - Error reporting via `postMessage`
2. **Combine** all wrapped IIFEs into one string: `IIFE1 + \n + IIFE2 + \n + IIFE3`
3. **Cache** the combined payload in IndexedDB (key = version string, no hashing)

> One string = one `executeScript` call = one IPC round-trip to tab.

### Cache Invalidation (3 layers)

| Layer | Trigger |
|-------|---------|
| 1 | `chrome.runtime.onInstalled` clears cache |
| 2 | Version key mismatch auto-rebuilds |
| 3 | PowerShell `run.ps1` as safety net |

---

## Stage 4: Execute in Tab

The wrapped payload is executed in the tab with a **4-tier CSP fallback** strategy. Health transitions to **DEGRADED** on any non-primary path.

### Tier 1 (Primary): MAIN World Blob Injection

1. Convert code string to `Blob` (`type: text/javascript`)
2. `URL.createObjectURL` creates a `blob:` URL
3. Create `<script>` element with `src = blob URL`
4. Append to `document.body` or `document.documentElement`
5. Browser executes in **MAIN world**
6. Revoke blob URL after execution

> Blob URLs are treated as same-origin by the browser, bypassing most CSP restrictions.

### Tier 2: USER_SCRIPT World (Chrome 135+)

If MAIN blob injection fails (CSP blocks):

1. `chrome.userScripts.execute()` with `world: "USER_SCRIPT"`
2. Configures a custom world with relaxed CSP (`unsafe-inline`, `unsafe-eval`)
3. Health = **DEGRADED**

> USER_SCRIPT world has access to page DOM but separate JS context. Available on Chrome 135+. Falls back to Tier 3 if `chrome.userScripts` API is unavailable or fails.

### Tier 3: ISOLATED World Blob Injection

If USER_SCRIPT is unavailable or fails:

1. `chrome.scripting.executeScript` with `world: "ISOLATED"`
2. Runs blob injection from ISOLATED world context
3. Health = **DEGRADED**

> ISOLATED world has its own `window` object. Cannot see `RiseupAsiaMacroExt` or page variables.

### Tier 4 (Last Resort): ISOLATED World Eval

If ISOLATED blob also fails:

1. `chrome.scripting.executeScript` with `world: "ISOLATED"` using `eval()`
2. Health = **DEGRADED**
3. `LOG ERROR: All higher tiers failed`

> Most macro features will NOT work in ISOLATED world. This is explicit degraded mode. A combined error message logs the failure reason for all 4 tiers.

### Fallback Chain Summary

```
MAIN Blob → USER_SCRIPT (Chrome 135+) → ISOLATED Blob → ISOLATED Eval
     ✅              ⚠️ DEGRADED            ⚠️ DEGRADED       ⚠️ DEGRADED
```

### UI Injection Flow

After successful MAIN world execution:
- Script runs in page context
- `MacroController` class initializes
- Creates UI container in DOM
- UI becomes visible to user

---

## Stage 5: Populate Data Namespaces (Parallel with Stages 3+4)

> **Note**: Stage 5 runs **in parallel** with Stages 3+4 for performance. Namespaces are independent of script execution and can be injected concurrently.

Root object `RiseupAsiaMacroExt` exists from Stage 2a. Stage 5 fills it with runtime data.

### 5a: Settings + llmGuide

```javascript
RiseupAsiaMacroExt.Settings = { /* key-value pairs */ };
RiseupAsiaMacroExt.docs = { llmGuide: "..." };
```

- If CSP blocks → **DEGRADED** + `LOG ERROR`

### 5b: Projects per CodeName

```javascript
RiseupAsiaMacroExt.Projects.MyProject = { vars: new Map([...]) };
```

- Each project gets a `vars` Map for console variable access
- Console usage: `RiseupAsiaMacroExt.Projects.X.vars.get("key")`

> Scripts access data lazily via `marco.whenReady` or on user interaction, not synchronously at load time.

---

## Post-Pipeline Processing

### Log Mirroring

All pipeline logs are mirrored to:
1. Tab DevTools via `console.groupCollapsed`
2. Extension SQLite via `recordInjection`
3. OPFS session log

### Performance Budget Check

If total pipeline time exceeds **2000ms** → `LOG WARN: PERFORMANCE BUDGET EXCEEDED`

### Post-Injection Verification

6 globals are verified after injection:

| # | Global | Purpose |
|---|--------|---------|
| 1 | `window.marco` | SDK helper |
| 2 | `window.RiseupAsiaMacroExt` | Root namespace |
| 3 | `window.MacroController` | Controller class |
| 4 | `api.mc` | Controller instance |
| 5 | UI container in DOM | Visual confirmation |
| 6 | `__macroExtInjected` flag | Injection marker |

Each failed check → `LOG WARN`. Results saved to state manager.

### Final Toast

| Condition | Toast |
|-----------|-------|
| All pass | ✅ SUCCESS (green): "N scripts injected successfully" |
| Warnings | ⚠️ WARNING (amber): "N injected, M warnings" |
| Failure | ❌ ERROR (red): "Injection failed: reason" |

Returns `InjectionResult[]` array to popup.

---

## Removed / Not Implemented

The following items from earlier spec versions have been **explicitly removed** and should NOT be re-implemented:

| Item | Reason |
|------|--------|
| **Dynamic Loading (Runtime)** — old Stage 7 | Removed from pipeline. The `RiseupAsiaMacroExt.require()` mechanism is documented separately but is not part of the main injection pipeline. |
| **Script-to-Script Communication** — old Stage 5 | Now implicit via the shared `window.RiseupAsiaMacroExt` namespace and `marco.*` SDK. No dedicated pipeline stage needed. |
| **Templates preamble** (`window.__MARCO_TEMPLATES__`) | No longer injected as a global. Templates are handled differently. |
| **Prompts SQLite seeding** from asset injection order | Removed in v7.43. The macro controller now fetches prompts dynamically via the `GET_PROMPTS` bridge message. |
| **Simple `chrome.scripting.executeScript`** as primary injection | Replaced by 3-tier CSP fallback (Blob → textContent → ISOLATED). Direct `executeScript` is no longer the primary path. |
| **File path resolution** (`isAbsolute` / `filePath`) | Scripts are resolved from `chrome.storage.local`, not from file paths. The old `ExtensionBasePath` setting is obsolete. |

---

## Asset Injection Order

For each project, assets are injected in this sequence:

```
1. CSS          → chrome.scripting.insertCSS (if script has CSS assets)
2. JSON configs → injected as window.__MARCO_CONFIG__ = {...}
3. JSON themes  → injected as window.__MARCO_THEME__ = {...}
4. JavaScript   → IIFE-wrapped, executed via Stage 4 blob injection
```

## Cross-Project Ordering

Projects are injected in `loadOrder` sequence:

| Project | loadOrder | Dependencies |
|---------|-----------|-------------|
| marco-sdk | 0 | none |
| xpath | 1 | none |
| macro-controller | 2 | xpath |

The SDK (`marco-sdk`) always loads first because it creates `window.marco` which all other projects depend on.
