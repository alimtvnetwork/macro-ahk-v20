# Injection Pipeline Optimization Guide

**Target: ≤500ms total injection latency (from ~7-8s current)**
**File: `src/background/handlers/injection-handler.ts`**
**Storage Layer: WASM SQLite (sql.js) — single-threaded, synchronous-capable**
**Data Access Pattern: Immediate — scripts read namespace data on load (no lazy loading)**

---

## Table of Contents

1. [Current Pipeline Waterfall](#1-current-pipeline-waterfall)
2. [Architecture Constraints](#2-architecture-constraints)
3. [Fix #1: Eliminate Sequential File Reads (Save ~3-5s)](#3-fix-1-eliminate-sequential-file-reads)
4. [Fix #2: Cache `readAllProjects()` Per Injection Cycle (Save ~200-500ms)](#4-fix-2-cache-readallprojects)
5. [Fix #3: Hoist Config Storage Read (Save ~100-300ms)](#5-fix-3-hoist-config-storage-read)
6. [Fix #4: Parallelize Independent Pipeline Stages (Save ~300-800ms)](#6-fix-4-parallelize-independent-stages)
7. [Fix #5: Skip Relay Probe on Known Tabs (Save ~200-500ms)](#7-fix-5-skip-relay-probe)
8. [Fix #6: Pre-Serialize Namespace Blob on Project Save (Save ~4s at runtime)](#8-fix-6-pre-serialize-namespace-blob)
9. [Fix #7: Batch Script Injection (Save ~500-1000ms)](#9-fix-7-batch-script-injection)
10. [Fix #8: Add Timing Instrumentation](#10-fix-8-timing-instrumentation)
11. [Implementation Order & Risk Matrix](#11-implementation-order)
12. [Target Budget Breakdown](#12-target-budget)
13. [Verification Checklist](#13-verification-checklist)

---

## 1. Current Pipeline Waterfall

```
handleInjectScripts()
│
├─ Stage 0:   prependDependencyScripts()        ~50-100ms
│  └─ readAllProjects()                          ← CALL #1 (chrome.storage.local)
│  └─ resolveInjectionOrder() (topological sort)
│
├─ Stage 1:   resolveInjectionRequestScripts()   ~100ms
│
├─ Stage 1.5: bootstrapNamespaceRoot()           ~50ms
│  └─ chrome.scripting.executeScript × 1
│
├─ Stage 2a:  ensureRelayInjected()              ~200-500ms
│  └─ probeRelayHealth() × 1-2
│  └─ chrome.scripting.executeScript × 2-3
│
├─ Stage 2b:  seedTokensIntoTab()                ~200-500ms
│  └─ HTTP fetchAuthToken() + executeScript
│
├─ Stage 3+4: injectAllScripts()                 ~500-1500ms
│  └─ SEQUENTIAL loop: for each script →
│     wrapWithIsolation() + injectWithCspFallback()
│
├─ Stage 5a:  injectSettingsNamespace()           ~200ms
│  └─ readAllProjects()                          ← CALL #2
│  └─ handleGetSettings()
│  └─ injectWithCspFallback × 1
│
└─ Stage 5b:  injectProjectNamespaces()           ~3000-5000ms  ← PRIMARY BOTTLENECK
   └─ readAllProjects()                          ← CALL #3
   └─ FOR EACH PROJECT (active + globals + deps):
      ├─ handleFileList()                        (SQLite read)
      ├─ FOR EACH FILE (up to 50):               ← SEQUENTIAL!
      │  └─ handleFileGet()                      (SQLite read + base64 decode)
      ├─ chrome.storage.local.get(ALL_CONFIGS)   ← REDUNDANT per-project
      ├─ initProjectDb()                         (WASM SQLite init)
      ├─ seedConfigToDb()
      └─ injectWithCspFallback()
                                                 ─────────────
                                        TOTAL:   ~6000-8000ms
```

### Identified Issues Summary

| # | Issue | Location (lines) | Severity | Est. Savings |
|---|-------|-------------------|----------|-------------|
| 1 | Sequential file reads in loop | 505-514 | 🔴 Critical | 3-5s |
| 2 | Triple `readAllProjects()` calls | 419, 462, 603 | 🟠 High | 200-500ms |
| 3 | Redundant `chrome.storage.local.get(ALL_CONFIGS)` inside per-project loop | 522 | 🟠 High | 100-300ms |
| 4 | Stages 1.5, 2a, 2b run sequentially but are independent | 86-94 | 🟡 Medium | 300-800ms |
| 5 | Relay probe on every injection even for known-good tabs | 717-761 | 🟡 Medium | 200-500ms |
| 6 | No pre-computation — all namespace data built at injection time | 456-581 | 🔴 Critical | ~4s |
| 7 | Scripts injected sequentially | 125-128 | 🟡 Medium | 500-1000ms |

---

## 2. Architecture Constraints

**You MUST respect these constraints in all fixes:**

1. **sql.js is single-threaded**: `Promise.all()` on individual `handleFileGet()` calls provides NO real parallelism against the same WASM SQLite instance. The optimization must reduce the NUMBER of calls, not parallelize them.

2. **Immediate data access**: Scripts read `RiseupAsiaMacroExt.Projects.<CodeName>` namespace data during initialization. The namespace MUST be fully populated BEFORE the script executes. Lazy loading is NOT an option.

3. **MAIN world injection**: Namespaces must be in the MAIN world for console access. CSP fallback exists but degrades functionality.

4. **Dependency ordering**: Scripts must be injected in topological order (globals first, then deps, then active project scripts). Do NOT parallelize script injection in a way that breaks ordering.

5. **chrome.scripting.executeScript()**: Each call is an IPC round-trip to the renderer process (~30-80ms). Minimize the total number of calls.

---

## 3. Fix #1: Eliminate Sequential File Reads

**Impact: 🔴 Critical — saves ~3-5s**
**Risk: Low**
**File: `file-storage-handler.ts` + `injection-handler.ts`**

### Problem

Lines 505-514 of `injection-handler.ts`:
```typescript
for (const f of filesToLoad) {
    try {
        const { file } = await handleFileGet({ fileId: f.id });
        if (file) {
            const data = typeof file.dataBase64 === "string"
                ? atob(file.dataBase64)
                : "";
            fileCache.push({ name: f.filename, data });
        }
    } catch { /* skip unreadable files */ }
}
```

This loops up to 50 files PER PROJECT, calling `handleFileGet()` sequentially. With 3 projects × 20 files = 60 sequential async SQLite reads.

### Solution: Bulk SQL Query

**Step A**: Add a new function `handleFileGetBulk` to `file-storage-handler.ts`:

```typescript
/**
 * Retrieves multiple files in a single SQL query.
 * Returns all matching files — callers should handle missing IDs gracefully.
 */
export async function handleFileGetBulk(
    { fileIds }: { fileIds: string[] }
): Promise<{ files: Array<{ id: string; filename: string; dataBase64: string }> }> {
    if (fileIds.length === 0) return { files: [] };

    // sql.js supports synchronous exec — use a single IN clause
    const placeholders = fileIds.map(() => "?").join(",");
    const query = `SELECT id, filename, data_base64 FROM files WHERE id IN (${placeholders})`;

    // Execute against the WASM SQLite instance
    const db = getFilesDb(); // however you access the sql.js Database instance
    const results = db.exec(query, fileIds);

    if (!results.length || !results[0].values.length) {
        return { files: [] };
    }

    const files = results[0].values.map(([id, filename, dataBase64]) => ({
        id: String(id),
        filename: String(filename),
        dataBase64: String(dataBase64 ?? ""),
    }));

    return { files };
}
```

> **IMPORTANT**: Adapt the SQL column names (`id`, `filename`, `data_base64`) to match your actual schema. Check `file-storage-handler.ts` for the real column names.

**Step B**: Replace the sequential loop in `injection-handler.ts` (lines 499-518):

```typescript
// BEFORE (sequential — ~3-5s for 60 files):
const { files: fileList } = await handleFileList({ projectId: pid });
const filesToLoad = fileList.slice(0, 50);
for (const f of filesToLoad) {
    const { file } = await handleFileGet({ fileId: f.id });
    // ...
}

// AFTER (single bulk query — ~5-20ms):
let fileCache: Array<{ name: string; data: string }> = [];
try {
    const { files: fileList } = await handleFileList({ projectId: pid });
    const fileIds = fileList.slice(0, 50).map(f => f.id);
    const { files: bulkFiles } = await handleFileGetBulk({ fileIds });

    // Build a lookup for filename from the fileList
    const nameMap = new Map(fileList.map(f => [f.id, f.filename]));

    fileCache = bulkFiles.map(f => ({
        name: nameMap.get(f.id) ?? f.filename,
        data: f.dataBase64 ? atob(f.dataBase64) : "",
    }));
} catch {
    fileCache = [];
}
```

### Why This Works

sql.js executes SQL synchronously in WASM. One `SELECT ... WHERE id IN (...)` with 50 IDs completes in <5ms vs 50 sequential async `handleFileGet` calls that each go through the async message handler overhead (~50-100ms each).

---

## 4. Fix #2: Cache `readAllProjects()`

**Impact: 🟠 High — saves ~200-500ms**
**Risk: Very Low**
**File: `injection-handler.ts`**

### Problem

`readAllProjects()` reads from `chrome.storage.local`, which is an async IPC call. It's called 3 times in the same injection cycle:

1. Line 603: inside `prependDependencyScripts()`
2. Line 419: inside `injectSettingsNamespace()`
3. Line 462: inside `injectProjectNamespaces()`

Each call is ~70-150ms.

### Solution

Hoist the call to the top of `handleInjectScripts()` and pass it down:

```typescript
export async function handleInjectScripts(
    message: MessageRequest,
): Promise<{ results: InjectionResult[] }> {
    // ... existing msg setup ...

    // ✅ Read once, pass everywhere
    const allProjects = await readAllProjects().catch(() => [] as StoredProject[]);

    // Stage 0: pass allProjects
    const scriptsWithDeps = await prependDependencyScripts(msg.scripts, allProjects);

    // ... stages 1-4 unchanged ...

    // Stage 5a: pass allProjects
    await injectSettingsNamespace(msg.tabId, allProjects);

    // Stage 5b: pass allProjects
    await injectProjectNamespaces(msg.tabId, allProjects);

    // ... rest unchanged ...
}
```

Update function signatures:
```typescript
async function prependDependencyScripts(
    callerScripts: unknown[],
    allProjects: StoredProject[],  // ← new parameter
): Promise<unknown[]> {
    // Remove: allProjects = await readAllProjects();
    // Use parameter directly
}

async function injectSettingsNamespace(
    tabId: number,
    allProjects: StoredProject[],  // ← new parameter
): Promise<void> {
    // Remove: allProjects = await readAllProjects();
    // Use parameter directly
}

async function injectProjectNamespaces(
    tabId: number,
    allProjects: StoredProject[],  // ← new parameter
): Promise<void> {
    // Remove: allProjects = await readAllProjects();
    // Use parameter directly
}
```

---

## 5. Fix #3: Hoist Config Storage Read

**Impact: 🟠 High — saves ~100-300ms**
**Risk: Very Low**
**File: `injection-handler.ts`**

### Problem

Lines 522-524 inside the per-project loop:
```typescript
for (const pid of projectIds) {
    // ... file loading ...
    const configResult = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);  // ← EVERY iteration!
    const configs = Array.isArray(configResult[STORAGE_KEY_ALL_CONFIGS])
        ? configResult[STORAGE_KEY_ALL_CONFIGS]
        : [];
    // ...
}
```

With 3 projects, this is 3 identical `chrome.storage.local.get()` calls.

### Solution

Hoist before the loop:

```typescript
async function injectProjectNamespaces(tabId: number, allProjects: StoredProject[]): Promise<void> {
    // ... existing project ID collection ...

    // ✅ Read configs ONCE before the loop
    let allConfigs: any[] = [];
    try {
        const configResult = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
        allConfigs = Array.isArray(configResult[STORAGE_KEY_ALL_CONFIGS])
            ? configResult[STORAGE_KEY_ALL_CONFIGS]
            : [];
    } catch { /* empty */ }

    for (const pid of projectIds) {
        // ... use allConfigs instead of re-reading ...
    }
}
```

---

## 6. Fix #4: Parallelize Independent Pipeline Stages

**Impact: 🟡 Medium — saves ~300-800ms**
**Risk: Low-Medium**
**File: `injection-handler.ts`**

### Problem

Stages 1.5, 2a, and 2b are completely independent but run sequentially:

```typescript
// Line 86-94 — SEQUENTIAL but INDEPENDENT
await bootstrapNamespaceRoot(msg.tabId);    // Stage 1.5: ~50ms
await ensureRelayInjected(msg.tabId);       // Stage 2a:  ~200-500ms
await seedTokensIntoTab(msg.tabId);         // Stage 2b:  ~200-500ms
```

### Solution

Run them in parallel with `Promise.all()`:

```typescript
// ✅ PARALLEL — these are independent
await Promise.all([
    bootstrapNamespaceRoot(msg.tabId),
    ensureRelayInjected(msg.tabId),
    seedTokensIntoTab(msg.tabId),
]);
```

### Safety Check

These are safe to parallelize because:
- `bootstrapNamespaceRoot` injects into MAIN world
- `ensureRelayInjected` injects into ISOLATED world
- `seedTokensIntoTab` does HTTP + executeScript (different target)
- They don't read/write shared state

**HOWEVER**: Verify that `bootstrapNamespaceRoot` MUST complete before `injectAllScripts` (Stage 3+4). If scripts depend on `window.RiseupAsiaMacroExt` existing, then `bootstrapNamespaceRoot` must finish before Stage 3 starts. In that case, use:

```typescript
// bootstrapNamespaceRoot MUST finish before scripts run
// but relay + token seed can happen in parallel with it
await Promise.all([
    bootstrapNamespaceRoot(msg.tabId),
    ensureRelayInjected(msg.tabId),
    seedTokensIntoTab(msg.tabId),
]);
// All three done → safe to proceed to script injection
```

This works because `Promise.all` waits for ALL to complete.

---

## 7. Fix #5: Skip Relay Probe on Known Tabs

**Impact: 🟡 Medium — saves ~200-500ms**
**Risk: Very Low**
**File: `injection-handler.ts`**

### Problem

`ensureRelayInjected()` already has a `relayInjectedTabs` Set cache (line 704), but on first injection into a tab, it does:

1. `probeRelayHealth()` — 1 `chrome.scripting.executeScript` call that also does a `chrome.runtime.sendMessage` round-trip
2. Potentially: clear sentinel + reinject relay (2 more `executeScript` calls)
3. `probeRelayHealth()` again post-injection

That's **2-4 executeScript IPC calls** (~30-80ms each).

### Solution: Trust the Manifest

If the relay is declared in `manifest.json` under `content_scripts`, it should already be present in any tab loaded after extension install. The safety net is only needed for tabs loaded BEFORE extension install/update.

```typescript
async function ensureRelayInjected(tabId: number): Promise<void> {
    if (relayInjectedTabs.has(tabId)) return;

    // ✅ Optimistic: assume manifest content_scripts already injected relay.
    // Only probe if we haven't confirmed this tab yet.
    // Use a single combined probe-and-inject instead of probe → inject → probe.
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: () => {
                // Check sentinel AND fix in one call
                if ((window as any).__marcoRelayActive) {
                    return { status: "already_active" };
                }
                return { status: "needs_injection" };
            },
        });

        const status = (result?.result as any)?.status;

        if (status === "already_active") {
            relayInjectedTabs.add(tabId);
            return;
        }

        // Only inject if actually needed
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            files: ["content-scripts/message-relay.js"],
        });
        relayInjectedTabs.add(tabId);

    } catch (err) {
        console.warn("[injection] Relay injection failed: %s",
            err instanceof Error ? err.message : String(err));
    }
}
```

**Savings**: Reduced from 2-4 `executeScript` calls to 1-2.

### Even More Aggressive: Skip Probe Entirely for Second+ Runs

```typescript
// At module level, track tabs where we've injected at least once
const tabsWithSuccessfulInjection = new Set<number>();

async function ensureRelayInjected(tabId: number): Promise<void> {
    if (relayInjectedTabs.has(tabId)) return;

    // If we've successfully injected scripts into this tab before,
    // the relay must be present (from manifest or previous safety-net injection)
    if (tabsWithSuccessfulInjection.has(tabId)) {
        relayInjectedTabs.add(tabId);
        return;
    }

    // ... normal probe logic for truly first-time tabs ...
}
```

---

## 8. Fix #6: Pre-Serialize Namespace Blob on Project Save

**Impact: 🔴 Critical — saves ~4s at injection time (moves cost to save-time)**
**Risk: Medium (requires architectural change)**
**Files: Project save handler + `injection-handler.ts`**

### Problem

The entire Stage 5b (lines 456-581) rebuilds namespace data from scratch on every injection:
- Reads all files from SQLite
- Decodes base64
- Reads configs from storage
- Initializes WASM SQLite DB
- Seeds config
- Builds namespace script string

This is pure waste — the data only changes when the user saves/edits a project.

### Solution: Compute-on-Write, Inject-on-Read

**Step A**: When a project is saved (file added/removed, config changed, script edited), pre-build the namespace injection script and store it:

```typescript
// In your project save handler (wherever projects are created/updated):

async function onProjectSaved(project: StoredProject): Promise<void> {
    // ... existing save logic ...

    // ✅ Pre-build the namespace injection script
    const prebuiltScript = await buildPrebuiltNamespace(project);

    // Store alongside the project
    await chrome.storage.local.set({
        [`ns_cache_${project.id}`]: {
            script: prebuiltScript,
            hash: computeHash(project),  // For invalidation
            builtAt: Date.now(),
        },
    });
}

async function buildPrebuiltNamespace(project: StoredProject): Promise<string> {
    const projectSlug = project.slug || slugify(project.name);
    const codeName = project.codeName || toCodeName(projectSlug);

    // Load files (this is now a save-time cost, not injection-time)
    const { files: fileList } = await handleFileList({ projectId: project.id });
    const fileIds = fileList.slice(0, 50).map(f => f.id);
    const { files: bulkFiles } = await handleFileGetBulk({ fileIds });
    const nameMap = new Map(fileList.map(f => [f.id, f.filename]));
    const fileCache = bulkFiles.map(f => ({
        name: nameMap.get(f.id) ?? f.filename,
        data: f.dataBase64 ? atob(f.dataBase64) : "",
    }));

    return buildProjectNamespaceScript({
        codeName,
        slug: projectSlug,
        projectName: project.name,
        projectVersion: project.version,
        projectId: project.id,
        description: project.description,
        dependencies: (project.dependencies ?? []).map(d => ({
            projectId: d.projectId,
            version: d.version,
        })),
        scripts: (project.scripts ?? []).map((s, i) => ({
            name: s.path.split("/").pop() ?? s.path,
            order: s.order ?? i,
            isEnabled: true,
        })),
        fileCache,
        cookieBindings: (project.cookies ?? []).map(c => ({
            cookieName: c.cookieName,
            url: c.url,
            role: c.role,
        })),
    });
}
```

**Step B**: At injection time, just read the pre-built script:

```typescript
async function injectProjectNamespaces(tabId: number, allProjects: StoredProject[]): Promise<void> {
    const activeId = getActiveProjectId();
    if (!activeId) return;

    // ... collect projectIds (same as before) ...

    // ✅ Batch-read all pre-built namespace scripts
    const cacheKeys = [...projectIds].map(pid => `ns_cache_${pid}`);
    const cached = await chrome.storage.local.get(cacheKeys);

    // Inject each — this is now just reading a string and calling executeScript
    for (const pid of projectIds) {
        const entry = cached[`ns_cache_${pid}`];
        if (!entry?.script) {
            // Cache miss — fall back to building on-the-fly (should be rare)
            console.warn("[injection:ns] Cache miss for project %s — building on-the-fly", pid);
            await buildAndInjectNamespaceForProject(tabId, pid, allProjects);
            continue;
        }

        try {
            await injectWithCspFallback(tabId, entry.script, "MAIN");
        } catch (err) {
            console.error("[injection:ns] Failed to inject cached namespace for %s", pid);
        }
    }
}
```

### Cache Invalidation Triggers

The pre-built namespace cache (`ns_cache_<projectId>`) must be rebuilt when:
- A file is added, removed, or modified in the project
- A script is added, removed, or reordered
- Project metadata changes (name, slug, version, description)
- Dependencies change
- Config bindings change
- Cookie bindings change

Add cache invalidation calls to each of these save paths.

---

## 9. Fix #7: Batch Script Injection

**Impact: 🟡 Medium — saves ~500-1000ms**
**Risk: Medium**
**File: `injection-handler.ts`**

### Problem

Lines 125-128:
```typescript
for (const script of scripts) {
    const result = await injectSingleScript(tabId, script.injectable, script.configJson, script.themeJson);
    results.push(result);
}
```

Each script = `wrapWithIsolation()` + `chrome.scripting.executeScript()`. With 5 scripts, that's 5 sequential IPC calls.

### Solution: Concatenate Independent Scripts

**IMPORTANT**: This only works if scripts don't depend on the execution result of previous scripts in the same batch. Dependency-ordered scripts from different projects likely ARE independent once the dependency-project scripts run first.

```typescript
async function injectAllScripts(
    tabId: number,
    scripts: Array<{ injectable: InjectableScript; configJson: string | null; themeJson: string | null }>,
): Promise<InjectionResult[]> {
    if (scripts.length === 0) return [];

    // ✅ Option A: Concatenate all wrapped code into a single injection
    const startTime = Date.now();
    const wrappedParts: string[] = [];
    const scriptMeta: Array<{ id: string; name: string }> = [];

    for (const script of scripts) {
        try {
            const wrapped = wrapWithIsolation(script.injectable, script.configJson, script.themeJson);
            wrappedParts.push(wrapped);
            scriptMeta.push({ id: script.injectable.id, name: script.injectable.name ?? script.injectable.id });
        } catch (err) {
            // If wrapping fails, record error for this script
            return scripts.map(s => ({
                scriptId: s.injectable.id,
                isSuccess: false,
                errorMessage: `Wrap failed: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: Date.now() - startTime,
            }));
        }
    }

    // Single executeScript call with all code concatenated
    const combinedCode = wrappedParts.join("\n;\n");

    try {
        await executeInTab(tabId, combinedCode);
        return scriptMeta.map(s => ({
            scriptId: s.id,
            scriptName: s.name,
            isSuccess: true,
            durationMs: Date.now() - startTime,
        }));
    } catch (err) {
        // If combined injection fails, fall back to sequential
        console.warn("[injection] Combined injection failed, falling back to sequential");
        return injectAllScriptsSequential(tabId, scripts);
    }
}

// Keep original sequential as fallback
async function injectAllScriptsSequential(
    tabId: number,
    scripts: Array<{ injectable: InjectableScript; configJson: string | null; themeJson: string | null }>,
): Promise<InjectionResult[]> {
    const results: InjectionResult[] = [];
    for (const script of scripts) {
        const result = await injectSingleScript(tabId, script.injectable, script.configJson, script.themeJson);
        results.push(result);
    }
    return results;
}
```

### Caveat

If individual CSS injection per script (lines 145-163) must happen BEFORE that script's JS, concatenation gets more complex. In that case, group scripts by whether they have CSS assets:
- Scripts without CSS: batch their JS together
- Scripts with CSS: inject CSS first, then JS individually

---

## 10. Fix #8: Add Timing Instrumentation

**Impact: Diagnostic — required to verify you hit the 500ms target**
**Risk: None**

Add structured timing to `handleInjectScripts()`:

```typescript
export async function handleInjectScripts(
    message: MessageRequest,
): Promise<{ results: InjectionResult[] }> {
    const pipelineStart = performance.now();
    const timings: Record<string, number> = {};

    const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
        const start = performance.now();
        const result = await fn();
        timings[label] = performance.now() - start;
        return result;
    };

    const allProjects = await time("readAllProjects", () =>
        readAllProjects().catch(() => [] as StoredProject[]));

    const scriptsWithDeps = await time("stage0_deps", () =>
        prependDependencyScripts(msg.scripts, allProjects));

    const { prepared, skipped } = await time("stage1_resolve", () =>
        resolveInjectionRequestScripts(scriptsWithDeps));

    // ... skip results ...

    await time("stage1.5_2a_2b_parallel", () => Promise.all([
        bootstrapNamespaceRoot(msg.tabId),
        ensureRelayInjected(msg.tabId),
        seedTokensIntoTab(msg.tabId),
    ]));

    const execResults = await time("stage3_4_inject", () =>
        injectAllScripts(msg.tabId, prepared));

    await time("stage5a_settings_ns", () =>
        injectSettingsNamespace(msg.tabId, allProjects));

    await time("stage5b_project_ns", () =>
        injectProjectNamespaces(msg.tabId, allProjects));

    const totalMs = performance.now() - pipelineStart;
    console.log("[injection] ── TIMING ── total=%.1fms breakdown=%s",
        totalMs, JSON.stringify(timings, null, 0));

    // ... rest unchanged ...
}
```

---

## 11. Implementation Order

Execute fixes in this order (highest impact + lowest risk first):

| Phase | Fix | Risk | Estimated Savings | Cumulative Target |
|-------|-----|------|-------------------|-------------------|
| 1 | #8 Timing instrumentation | None | 0ms (diagnostic) | Baseline measured |
| 2 | #2 Cache `readAllProjects()` | Very Low | 200-500ms | ~6.5s |
| 3 | #3 Hoist config storage read | Very Low | 100-300ms | ~6.2s |
| 4 | #1 Bulk file SQL query | Low | 3000-5000ms | ~2s |
| 5 | #4 Parallelize stages 1.5/2a/2b | Low | 300-800ms | ~1.4s |
| 6 | #5 Skip relay probe optimistically | Very Low | 200-500ms | ~1.0s |
| 7 | #7 Batch script injection | Medium | 500-1000ms | ~0.5s |
| 8 | #6 Pre-serialize on save | Medium | Moves remaining cost off critical path | ~0.3s |

### Phase 1-4 (Safe, High-Impact): Should get you to ~2s
### Phase 5-7 (Medium Risk): Should get you to ~0.5s
### Phase 8 (Architectural): Insurance policy for the 500ms target

---

## 12. Target Budget Breakdown (500ms)

After all fixes applied:

```
readAllProjects (cached, 1 call)     ~70ms
Stage 0: Dependency resolution        ~30ms   (in-memory sort, no I/O)
Stage 1: Script resolution            ~50ms
Stages 1.5+2a+2b: PARALLEL           ~100ms  (max of 3 parallel tasks)
Stage 3+4: Batched script injection   ~80ms   (1 executeScript call)
Stage 5a: Settings namespace          ~50ms   (1 executeScript call)
Stage 5b: Project namespaces          ~100ms  (read pre-built cache + N executeScript calls)
Overhead/logging                      ~20ms
                                      ─────
                              TOTAL:  ~500ms
```

### If You're Still Over 500ms

Additional micro-optimizations:
- **Merge Stage 5a and 5b into Stage 3+4**: Concatenate settings namespace + project namespace scripts + user scripts into a SINGLE `executeScript` call
- **Precompute settings namespace on settings change** (same pattern as Fix #6)
- **Use `chrome.storage.session`** instead of `chrome.storage.local` for hot data (faster, in-memory)
- **Eliminate `injectWithCspFallback`**: If you know the target site's CSP policy, skip the fallback mechanism entirely and inject directly

---

## 13. Verification Checklist

After implementing each fix, verify:

- [ ] **Timing log output**: Check `[injection] ── TIMING ──` log for each stage
- [ ] **Namespace access works**: Open console on target page, verify `RiseupAsiaMacroExt.Projects.<CodeName>` is accessible
- [ ] **File cache populated**: Verify `RiseupAsiaMacroExt.Projects.<CodeName>.files.list()` returns expected files
- [ ] **Config seeded**: Verify config data is accessible through namespace
- [ ] **Dependency order preserved**: With multi-project deps, verify globals run before deps, deps before active project
- [ ] **CSP fallback still works**: Test on a CSP-restricted page (e.g., GitHub)
- [ ] **Relay still functional**: Verify message passing between content script and background works
- [ ] **Token seeding works**: Verify authentication tokens are available in the page
- [ ] **No regressions on first-time tab injection**: Clear `relayInjectedTabs` and test fresh
- [ ] **Total pipeline time ≤ 500ms**: Measured via timing instrumentation

### Regression Test Matrix

| Scenario | What to verify |
|----------|---------------|
| Single project, no deps | Basic injection works, namespace registered |
| Project with 2 dependencies | Correct injection order, all namespaces registered |
| Project with global dependency | Global scripts injected first |
| CSP-restricted page | Fallback works, degraded health reported |
| Tab reinjection (Run pressed twice) | Relay skipped, faster second run |
| Project with 50 files | File cache fully populated, no timeout |
| Project with config binding | Config seeded to SQLite, accessible in namespace |

---

## Appendix: Key File Locations

| File | Purpose |
|------|---------|
| `src/background/handlers/injection-handler.ts` | Main pipeline orchestrator (THIS FILE) |
| `src/background/handlers/file-storage-handler.ts` | `handleFileGet`, `handleFileList` — add `handleFileGetBulk` here |
| `src/background/handlers/project-helpers.ts` | `readAllProjects()` — reads from `chrome.storage.local` |
| `src/background/project-namespace-builder.ts` | `buildProjectNamespaceScript()` — builds the IIFE string |
| `src/background/settings-namespace-builder.ts` | `buildSettingsNamespaceScript()` |
| `src/background/project-db-manager.ts` | `initProjectDb()` — WASM SQLite instance per project |
| `src/background/config-seeder.ts` | `seedConfigToDb()` — seeds config JSON into project DB |
| `src/background/dependency-resolver.ts` | `resolveInjectionOrder()` — topological sort |
| `src/background/csp-fallback.ts` | `injectWithCspFallback()` — MAIN→ISOLATED fallback |
| `src/background/handlers/token-seeder.ts` | `seedTokensIntoTab()` — HTTP + executeScript |
| `src/background/state-manager.ts` | `getActiveProjectId()`, `setTabInjection()` |
