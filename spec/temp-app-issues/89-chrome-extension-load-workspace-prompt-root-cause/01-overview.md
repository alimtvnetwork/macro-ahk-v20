# Issue #89: Chrome Extension — Load Delay, Workspace, Prompt & Sequencing Root Cause Analysis

**Version:** v1.74.0+
**Date:** 2026-04-01
**Status:** 🔴 Open — Root cause analysis and spec phase (no implementation yet)
**Severity:** P1

---

## Scope

This spec tracks five interrelated issues in the Chrome extension's injection and startup flow:

| # | Issue | Symptom |
|---|-------|---------|
| **RC-01** | Extension startup delay | Clicking a script causes multi-second delay before UI appears |
| **RC-02** | Missing startup toast | No immediate visual feedback during initialization |
| **RC-03** | Workspace loading failure | Workspaces not loading in macro UI controller |
| **RC-04** | Prompt population failure | Prompts not populating in macro controller dropdown |
| **RC-05** | Spec sequencing inconsistency | `02-issues` should be app issues; data/API should follow after |

Each issue has a dedicated root cause file in this folder.

---

## Current Workflow: Extension Injection → UI Ready

The following sequence describes the **actual current flow** from user click to interactive UI:

### Phase A: Background (Service Worker)

```
1. User clicks extension popup → triggers INJECT_SCRIPTS message
2. Background receives message
3. readAllProjects() — reads projects from chrome.storage.local
4. For each matching project:
   a. resolveScriptBindings() — finds scripts in chrome.storage.local
   b. For each script binding:
      i.   getCachedScriptCode(filePath) — check IndexedDB cache
      ii.  If miss: fetch(chrome.runtime.getURL(filePath)) — read from web_accessible_resources
      iii. Cache result in IndexedDB via cacheScriptCode()
   c. resolveDependencies() — resolve dependency scripts (SDK, XPath)
   d. Resolve config JSON and theme JSON from chrome.storage.local
5. Stage 1.5: bootstrapNamespaceRoot() — inject RiseupAsiaMacroExt into MAIN world
6. Stage 2: ensureRelayInjected() + seedTokensIntoTab()
7. Stage 3: Wrap each script with IIFE + SDK preamble
8. Stage 4: Execute via injectWithCspFallback() — one executeScript per script
9. Stage 5a: Inject Settings namespace
10. Stage 5b: Inject per-project namespaces
```

### Phase B: Content (Macro Controller Startup — `startup.ts`)

```
11. bootstrap() executes in page context
12. Places script marker div
13. Registers window globals + namespace dual-write
14. showToast('loading workspace...') ← DEPENDS ON SDK notify being ready
15. registerTokenBroadcastListener()
16. Sets 5s UI creation timeout (fallback)
17. Pre-warms prompts via SDK or loader fallback
18. loadWorkspacesOnStartup():
    a. ensureTokenReady(2000) — waits for auth token
    b. Parallel: fetchLoopCreditsAsync + fetchTier1Prefetch (mark-viewed API)
    c. On success: resolve workspace from tier1 data or full autoDetect
    d. cancelTimeoutAndCreateUi() — create UI panel
    e. updateUI()
19. scheduleWorkspaceRetry() — up to 4 retries at 1.5s intervals
20. setupAuthResync() — visibility/focus listeners
```

### Where Delay Occurs (Suspected)

| Stage | Suspected Cost | Root Cause |
|-------|---------------|------------|
| Step 3: readAllProjects | 200-500ms | Reads entire project store from chrome.storage.local |
| Step 4b-ii: fetch() per script | 3-5s | Sequential fetch from web_accessible_resources when cache misses |
| Step 8: Serial executeScript | 500-1000ms | One chrome.scripting.executeScript per script |
| Step 14: showToast | 0ms (but invisible) | SDK notify not yet available → toast queued, never shown |
| Step 18a: ensureTokenReady | 0-2000ms | Waits for auth bridge/localStorage |
| Step 18b: API calls | 500-2000ms | Network round-trip to lovable.dev API |

**Total observed: 7-8s cold start, 3-5s warm start**

---

## Expected Workflow (Optimized)

```
1. User clicks script → INJECT_SCRIPTS message
2. Background immediately:
   a. Read projects + scripts + configs in ONE chrome.storage.local.get()
   b. For each script: IndexedDB cache HIT (pre-cached during boot)
   c. Concatenate all wrapped scripts into ONE executeScript call
3. Parallel: bootstrapNamespaceRoot + ensureRelay + seedTokens
4. Single executeScript with concatenated bundle
5. Macro controller starts:
   a. IMMEDIATE DOM toast (no SDK dependency) — "MacroLoop loading..."
   b. Parallel: token resolution + prompt pre-warm
   c. Credit fetch + workspace detection
   d. Create UI with loaded data
   e. Ready state
```

**Target: ≤500ms cold start, ≤200ms warm start**

---

## Ambiguities Requiring Clarification

1. **"Microcontroller"** — assumed to refer to the macro controller (`standalone-scripts/macro-controller/`). If it refers to a separate component, this spec needs updating.

2. **Workspace → Prompt dependency** — It is unclear whether prompts require workspace context before rendering, or whether both can load in parallel with separate readiness states. Current code loads them independently (prompts pre-warmed, workspace from API).

3. **Cache storage layer** — Current implementation uses IndexedDB for script code, `chrome.storage.local` for script/config metadata. Should all caching move to IndexedDB? Or should boot pre-cache into service worker memory?

4. **Spec reordering impact** — Renumbering `02-issues` → `02-app-issues` and shifting `01-data-and-api` may break cross-references in 80+ existing issue files and 20+ chrome extension specs. Need to enumerate all affected `@see` and relative-path references.

5. **Toast without SDK** — The startup toast delegates to `window.marco.notify` (SDK). If SDK isn't injected yet, toast is queued but invisible. Should the toast use a standalone DOM-based fallback that doesn't depend on SDK?

---

## Cross-References

- [Issue #87 — Injection Pipeline Performance](../87-injection-pipeline-performance/)
- [Issue #84 — Check Button & Workspace Load Fixes](../84-check-button-and-workspace-load-fixes.md)
- [Issue #54 — Startup Workspace Load Regression](../54-startup-workspace-load-and-loop-button-regression.md)
- [Issue #50 — Prompt Loading Breaking Issues](../50-prompt-loading-breaking-issues.md)
- [Issue #64 — Prompts Loading When Cached](../64-prompts-loading-when-cached.md)
- [Spec 52 — Prompt Caching IndexedDB](../../07-chrome-extension/52-prompt-caching-indexeddb.md)
- [Spec 45 — Prompt Manager CRUD](../../07-chrome-extension/45-prompt-manager-crud.md)
- [Memory: Injection Pipeline Performance Plan](../../.lovable/memory/architecture/injection-pipeline-performance-plan.md)
- [Memory: IndexedDB Injection Cache](../../.lovable/memory/architecture/indexeddb-injection-cache.md)
- [Memory: Prompts System V2](../../.lovable/memory/features/macro-controller/prompts-system-v2.md)
