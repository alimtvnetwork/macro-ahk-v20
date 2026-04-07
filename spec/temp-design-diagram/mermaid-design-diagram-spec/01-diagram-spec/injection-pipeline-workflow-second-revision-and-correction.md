# Injection Pipeline Workflow — Second Revision & Correction Spec

**Created**: 2026-04-07  
**Status**: Approved  
**Supersedes**: `injection-pipeline-workflow-clarification-and-correction.md`  
**Diagram**: `standalone-scripts/macro-controller/diagrams/injection-pipeline-workflow.mmd`  
**Image**: `standalone-scripts/macro-controller/diagrams/images/injection-pipeline-workflow.png`

---

## Summary of Corrections in This Revision

| # | Issue | Correction |
|---|-------|-----------|
| 1 | Auth bridge / JWT waterfall in token seeding | Removed. Token seeding only reads cookie, stores with timestamp, checks expiry |
| 2 | CSP not explained concretely | Added full definition with HTTP header example |
| 3 | Relay injection vague | Explained what relay does, why it exists, practical meaning of isolated world |
| 4 | Duplicate prevention via "sentinel global" vague | Replaced with script-ID marker check |
| 5 | Stage 2 confusing | Rewritten in plain language with ordered steps |
| 6 | CSS handling unclear | Described as the more complex path with ordered steps |
| 7 | "IPC optimization" jargon | Explained as reducing tab↔background round-trips |
| 8 | "Wrap with isolation" vague | Explained as try-catch IIFE so one script failure doesn't break others |
| 9 | Concatenation vague | Added concrete before/after example |
| 10 | 5KB size warning | Removed entirely — arbitrary small thresholds are not useful |
| 11 | Stage 4 too many fallback branches | Simplified to known working path + one real fallback |
| 12 | Isolated world not explained | Explained as separate JS environment that cannot see page globals |
| 13 | Namespace order wrong | Moved namespace requirement earlier; root created before execution |
| 14 | No caching mentioned | Added IndexedDB payload cache with version/deploy invalidation |
| 15 | UI injection flow missing | Added explicit step showing how script enters the page |
| 16 | Diagram style unclear | Rewritten with right-side annotation branches |

---

## Pipeline Entry: handleInjectScripts

When the user clicks **Run Scripts** in the popup:

1. Record `performance.now()` as pipeline start time
2. Query the active tab via `chrome.tabs.query`
3. Inject a **loading spinner toast** into the tab — a fixed-position overlay saying "Injecting scripts..."
4. Execute Stages 0–5 in order
5. Replace spinner with a result toast (success / warning / error)
6. Return `InjectionResult[]` to the popup

**Log**: `[pipeline] START tabId=<id> url=<url> scriptCount=<n>` (INFO)

---

## Cache Decision Gate (Before Stage 0)

Before running the full pipeline, check the **IndexedDB injection cache** (`marco_injection_cache` store):

1. Compute a cache key from: extension version + project config hash + script content hashes
2. Look up the key in IndexedDB
3. **Cache HIT**: The fully prepared, wrapped, concatenated injection payload is available. Skip Stages 0–3 entirely. Jump directly to Stage 4 (execution). Log: `[cache] HIT — reusing cached payload, key=<hash>` (INFO)
4. **Cache MISS**: Proceed through Stages 0–3 normally. After Stage 3 produces the final payload, store it in IndexedDB with the cache key. Log: `[cache] MISS — building fresh payload` (INFO)
5. **Cache INVALIDATION**: The cache is cleared on:
   - Extension install or update (`chrome.runtime.onInstalled`)
   - User clicking "Invalidate Cache" in popup
   - Any `chrome.storage.local` change to script code

This avoids rebuilding the entire wrapped payload on every injection when nothing has changed.

---

## Stage 0a: ensureBuiltinScriptsExist

**Purpose**: Validate that all built-in scripts (SDK preamble, relay installer, namespace bootstrap) are present in `chrome.storage.local`.

**Steps**:
1. Read the list of required built-in script IDs from the manifest
2. For each script, check if it exists with valid non-empty code
3. **Found** → Log: `[stage:0a] Built-in script found: <scriptId>` (INFO)
4. **Missing** → Log: `[stage:0a] Built-in script MISSING: <scriptId>` (ERROR)
5. Missing scripts trigger **self-healing**: re-seed from bundled `/scripts/` assets
6. If re-seeding also fails → **hard error** for that script. It appears as failed in results. Pipeline continues with remaining scripts.

---

## Stage 0b: prependDependencyScripts (Topological Sort)

**Purpose**: Ensure dependency scripts are injected before scripts that depend on them.

**Steps**:
1. Read `dependsOn` fields from project configuration
2. Build a dependency graph (DAG)
3. Topological sort to get correct injection order
4. Prepend dependency scripts before their dependents

**Logging**:
- INFO: `[stage:0b] Dependency order: [A, B, C]`
- INFO: `[stage:0b] Injecting dependency: <id> (required by: <dependentId>)`
- ERROR: `[stage:0b] Dependency NOT FOUND: <id> (required by: <dependentId>)` — dependent also marked failed

---

## Stage 1: resolveInjectionRequestScripts

**Purpose**: Convert script entries into executable form with code, config JSON, and theme JSON loaded.

**Steps**:
1. For each script entry, load code from `chrome.storage.local`
2. Load associated config JSON and theme JSON if bound
3. If a script **cannot be resolved** (code not found, config missing, type mismatch):
   - This is a **hard error**, not a silent skip
   - Log: `[stage:1] HARD ERROR: Script unresolvable: <id> reason=<reason>` (ERROR)
   - The script is added to the failed results
4. If **zero scripts** resolve → pipeline halts, error toast shown, log ERROR

**Logging**:
- INFO: `[stage:1] Resolved <n>/<total> scripts`
- ERROR: Each unresolvable script with reason

---

## Stage 2: Tab Environment Preparation

Three tasks run via `Promise.all`. All three must complete before Stage 3.

### 2a: bootstrapNamespaceRoot

Creates the root namespace object `window.RiseupAsiaMacroExt = { Projects: {} }` in the tab's **MAIN world** via `chrome.scripting.executeScript`.

- MAIN world = the same JavaScript context as the page itself. Code injected here can access `window`, `document`, and all page globals.
- If CSP blocks this (see Stage 4 for full CSP explanation), log ERROR and set health to DEGRADED. No fallback — ISOLATED world would be invisible to page scripts.

**Log**: `[stage:2a] Namespace root created in MAIN world` (INFO) or `[stage:2a] ERROR: CSP blocked namespace bootstrap` (ERROR)

### 2b: ensureRelayInjected

Installs the **message relay content script** in the tab's ISOLATED world.

**What the relay does**: Page scripts (running in MAIN world) cannot call `chrome.runtime.sendMessage` directly — that API only exists in extension contexts. The relay content script sits in the ISOLATED world (which has access to both `window.addEventListener` and `chrome.runtime`) and acts as a bridge:

1. Listens for `window.postMessage` from page scripts
2. Forwards valid messages to the background via `chrome.runtime.sendMessage`
3. Sends responses back to the page via `window.postMessage`

**What "ISOLATED world" means practically**: Chrome runs content scripts in a separate JavaScript environment from the page. ISOLATED world code can read/write the page DOM but has its own `window` object — it cannot see variables set by page scripts, and page scripts cannot see variables set by content scripts. The relay uses the DOM (`window.postMessage`) as the bridge between these two worlds.

**Duplicate prevention**: Before injecting, check if a script marker already exists:
1. Each relay script sets a marker: `window.__marcoRelayInstalled = true`
2. Before injection, run `chrome.scripting.executeScript` to check if `window.__marcoRelayInstalled` is `true`
3. If marker exists → skip injection, log: `[stage:2b] Relay already present — skipping` (INFO)
4. If marker absent → inject relay, log: `[stage:2b] Relay injected` (INFO)

### 2c: seedTokensIntoTab

Seeds the bearer token from extension storage into the tab's `localStorage` so page scripts can read it.

**Correct behavior** (no authentication logic):
1. Read the stored bearer token and its timestamp from `chrome.storage.local` (keys: `marco_bearer_token`, `marco_token_saved_at`)
2. Check if the stored token is still fresh: `(Date.now() - savedAt) < TTL` (default TTL: 2 minutes)
3. If **fresh** → use the stored token
4. If **expired or missing** → read the cookie from `chrome.cookies.get`, store the new value with current timestamp
5. Write the token into the tab's `localStorage` via `chrome.scripting.executeScript` in MAIN world
6. This is NOT an authentication flow — no JWT validation, no waterfall, no auth bridge. Just read cookie → store with timestamp → check expiry → re-read if stale.

**Log**: `[stage:2c] Token seeded (age: <seconds>s)` (INFO) or `[stage:2c] No token available` (WARN)

---

## Stage 3: Script Wrapping & Preparation

**Purpose**: Transform each script's raw code into safe, isolated, executable form.

### What "wrap with isolation" means

Each script is wrapped in a **try-catch inside an IIFE** (Immediately Invoked Function Expression). The purpose is simple: if one script throws an error, the remaining scripts still run. Without this, a single `ReferenceError` in Script A would abort Script B and C.

**Before wrapping** (raw script code):
```javascript
console.log("Hello from MyScript");
document.querySelector("#app").style.color = "red";
```

**After wrapping** (what actually gets injected):
```javascript
;(function() {
    // SDK preamble — gives script access to marco helpers
    const marco = window.RiseupAsiaMacroExt?.sdk || {};

    try {
        console.log("Hello from MyScript");
        document.querySelector("#app").style.color = "red";
    } catch (__marcoErr) {
        console.error("[Marco:MyScript] Runtime error:", __marcoErr);
        window.postMessage({
            source: "marco-controller",
            type: "USER_SCRIPT_ERROR",
            scriptId: "MyScript",
            message: __marcoErr.message
        }, "*");
    }
})();
```

Key properties:
- **Own function scope**: variables declared in one script don't leak to others
- **Error isolation**: one script's crash doesn't stop other scripts
- **SDK access**: each script gets the `marco` helper object via the preamble
- **Error reporting**: failures are reported through the relay to the background for logging

### What "concatenate into single code string" means

After wrapping each script individually, the wrapped IIFEs are joined with newlines into one string:

```javascript
// Script 1 (order: 1)
;(function() { try { /* script 1 code */ } catch(e) { /* report */ } })();

// Script 2 (order: 2)
;(function() { try { /* script 2 code */ } catch(e) { /* report */ } })();

// Script 3 (order: 3)
;(function() { try { /* script 3 code */ } catch(e) { /* report */ } })();
```

**Why concatenate?** Instead of calling `chrome.scripting.executeScript` three separate times (three round-trips between background and tab), one call executes all three scripts. This reduces overhead — each `executeScript` call involves serialization, IPC, and scheduling. With 10+ scripts, the savings are significant.

### CSS Asset Handling (the complex path)

When a script declares CSS assets in its project config (`cssAssets` field):

1. **Detect**: Check each script's config for `cssAssets` presence
2. **Switch to sequential mode**: Cannot batch-concatenate because CSS must be injected BEFORE its associated JS
3. **For each script with CSS**:
   a. Inject CSS via `chrome.scripting.insertCSS({ files: [cssPath] })` — this adds the stylesheet to the page
   b. Wait for CSS injection to complete
   c. Then inject the wrapped JS for that script
   d. Log: `[stage:3] CSS injected: <path> for <scriptId>` (INFO)
4. Scripts without CSS are injected in the same order but without the CSS step

**Why CSS first?** The script may reference CSS classes, custom properties, or styled DOM elements. If JS runs before CSS loads, the UI may flash unstyled content or fail to find expected styles.

**Log**:
- INFO: `[stage:3] Preparing <n> scripts, mode=<batch|sequential>`
- INFO: `[stage:3] CSS detected for <scriptId>, using sequential injection`

### Store in cache

After preparing the final payload (wrapped + concatenated), store it in IndexedDB with the computed cache key for reuse. Log: `[cache] Stored payload, key=<hash>, size=<bytes>` (INFO)

---

## Stage 4: Execute in Tab (CSP-Aware)

**Purpose**: Run the prepared code string in the target tab's page context.

### What is CSP (Content Security Policy)?

CSP is a security feature where websites tell the browser which scripts are allowed to run. A website sets this via an HTTP response header:

```
Content-Security-Policy: script-src 'self' https://cdn.example.com
```

This means: "Only run scripts loaded from my own domain (`'self'`) or from `https://cdn.example.com`. Block everything else."

**Why it matters for this pipeline**: When our extension tries to inject JavaScript into a page with strict CSP, the browser may block the execution because the injected code doesn't come from an allowed source. The extension must use injection methods that work around CSP.

### Primary Execution Path: MAIN World Blob Injection

This is the known working path used in the existing codebase:

1. Convert the code string to a `Blob` object with MIME type `text/javascript`
2. Create a URL for the blob via `URL.createObjectURL(blob)`
3. Create a `<script>` element with `src` pointing to the blob URL
4. Append the `<script>` to `document.documentElement` (or `document.body`)
5. The browser executes the script in the **MAIN world** — the page's own JavaScript context
6. Revoke the blob URL after execution

**Why blob works around CSP**: Most CSP policies don't block `blob:` URLs because the browser treats them as same-origin. The script content never appears as inline code in the HTML, so `script-src` restrictions on inline scripts don't apply.

**Log**: `[stage:4] Executing via MAIN world blob injection` (INFO)

### How the script enters the page (UI injection flow)

The blob `<script>` tag is appended to the page's actual DOM:

```
Background (executeScript) → Tab's MAIN world
  → document.documentElement.appendChild(scriptElement)
  → Browser parses and executes the blob JS
  → Script code runs with full access to window, document, DOM
  → MacroController class initializes, creates UI container
  → UI is now visible in the page
```

The script is not loaded from a URL or file — it is created in-memory as a blob, given a temporary URL, and executed as if it were a normal `<script src="...">` tag. After execution, the script element remains in the DOM but the blob URL is revoked (the code is already parsed and running).

### Fallback: ISOLATED World (Last Resort)

If blob injection fails (very rare — only on pages with extremely strict CSP that blocks blob URLs):

1. Execute via `chrome.scripting.executeScript` with `world: "ISOLATED"`
2. **ISOLATED world** is a separate JavaScript environment. It shares the DOM with the page but has its own `window` object. This means:
   - Scripts CANNOT access `window.RiseupAsiaMacroExt` (it was created in MAIN world)
   - Scripts CANNOT access page variables or page-defined functions
   - Scripts CAN still manipulate DOM elements
3. This is **degraded mode** — most macro functionality will not work
4. Log: `[stage:4] ERROR: Blob injection failed, forced to ISOLATED world — DEGRADED MODE` (ERROR)
5. Extension health set to `DEGRADED`
6. Every fallback activation is logged clearly so it is obvious which path was used

**Note**: The `chrome.userScripts` API path from the previous revision is removed. The existing codebase uses blob injection successfully. Only add the userScripts path if blob injection is proven to fail on real-world sites. Speculative fallback branches add complexity without value.

**Logging**:
- INFO: `[stage:4] Executing via MAIN world blob injection`
- ERROR: `[stage:4] Blob injection FAILED: <error>. Falling back to ISOLATED world.`
- ERROR: `[stage:4] DEGRADED MODE: Scripts running in ISOLATED world — page globals inaccessible`

---

## Stage 5: Populate Data Namespaces

**Important**: The **root namespace** (`window.RiseupAsiaMacroExt`) was already created in Stage 2a before any scripts executed. Stage 5 populates it with **data** — settings and project variables.

### Why data population happens after script execution

Scripts don't read settings synchronously at load time. They access settings:
- On user interaction (button clicks, form submissions)
- Via `marco.whenReady()` which defers until namespaces are populated
- Via `setTimeout` / `requestAnimationFrame`

The root object exists from Stage 2a, so `window.RiseupAsiaMacroExt` is never `undefined`. Only the `.Settings` and `.Projects` sub-properties are populated here.

### 5a: injectSettingsNamespace

```javascript
window.RiseupAsiaMacroExt.Settings = { /* key-value pairs */ };
window.RiseupAsiaMacroExt.llmGuide = "...";
```

### 5b: injectProjectNamespaces

```javascript
window.RiseupAsiaMacroExt.Projects.ProjectA = { vars: new Map([...]) };
window.RiseupAsiaMacroExt.Projects.ProjectB = { vars: new Map([...]) };
```

5a and 5b run in parallel (they write to different sub-properties). Both inject via `chrome.scripting.executeScript` in MAIN world.

**Log**:
- INFO: `[stage:5a] Settings namespace populated (<n> keys)`
- INFO: `[stage:5b] Project namespaces populated: [ProjectA, ProjectB]`
- ERROR: `[stage:5] Namespace injection failed: <reason>` — health set to DEGRADED

---

## Post-Pipeline

### Log Mirroring

All pipeline logs from Stages 0–5 are mirrored to:
1. **Tab DevTools** via `chrome.scripting.executeScript` → `console.groupCollapsed("[MacroExt] Injection Pipeline")`
2. **Extension SQLite** via `recordInjection`
3. **OPFS session log** for diagnostic export

### Performance Budget

If total pipeline time exceeds 2000ms:
- Log WARN: `[pipeline] PERFORMANCE BUDGET EXCEEDED: <ms>ms (budget: 2000ms)`

### Timing Recording

Write to SQLite: pipeline start/end, per-stage durations, script count, success count.

### Post-Injection Verification

Check 6 globals in the tab:

| Check | Verifies | Failure meaning |
|-------|----------|-----------------|
| `window.marco` | SDK helper | SDK preamble failed |
| `window.RiseupAsiaMacroExt` | Root namespace | Stage 2a failed |
| `window.MacroController` | Controller class | Core script failed |
| `api.mc` | Controller instance | Controller didn't init |
| UI container element | DOM element | UI rendering failed |
| `__macroExtInjected` | Completion flag | Pipeline incomplete |

### Final Toast

- All passed → ✅ Success toast (green)
- Some warnings → ⚠️ Warning toast (amber)
- Critical failure → ❌ Error toast (red)

---

## Explicit Ambiguities (Documented, Not Assumed)

1. **Missing script → halt or continue?** Current behavior: the failed script is marked as an error in results; remaining scripts continue. The pipeline does NOT halt on a single script failure.
2. **CSS assets mandatory or optional?** Optional enhancements. Scripts work without CSS but may have unstyled UI.
3. **Namespace population order**: Root namespace is created in Stage 2a (before execution). Data namespaces are populated in Stage 5 (after execution). If a future script requires synchronous settings access at load time, Stage 5 should be moved before Stage 4.
4. **Which fallback paths are real?** Only blob injection (primary) and ISOLATED world (last resort) are real. The userScripts API path is removed until proven necessary.

---

```
Do you understand? Can you please do that?

If you have any question and confusion, feel free to ask, and if you are creating tasks
for creating multiple tasks, and if it is bigger ones, then do it in a way so that if we
say next, you do those remaining tasks.
```
