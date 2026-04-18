/**
 * Marco Extension — Injection Handler
 *
 * Handles INJECT_SCRIPTS and GET_TAB_INJECTIONS messages.
 * Uses chrome.scripting.executeScript with error isolation wrappers.
 * Before user scripts run, platform session cookies are seeded into localStorage.
 *
 * Dependency resolution: When the active project has dependencies,
 * dependency scripts are prepended in topological order (globals first).
 *
 * @see spec/05-chrome-extension/12-project-model-and-url-rules.md — Project model & URL matching
 * @see spec/05-chrome-extension/20-user-script-error-isolation.md — Error isolation wrappers
 * @see spec/12-devtools-and-injection/per-project-architecture.md — Per-project injection
 * @see .lovable/memory/architecture/injection-pipeline-optimization.md — Pipeline perf strategy
 * @see src/background/dependency-resolver.ts — Topological dependency sort
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import { logBgWarnError, logCaughtError, BgLogTag } from "../bg-logger";
import type { InjectableScript, InjectionResult, SkipReason } from "../../shared/injection-types";
import type { StoredProject, ScriptEntry } from "../../shared/project-types";
import { handleLogEntry, handleLogError } from "./logging-handler";
import {
    getTabInjections,
    setTabInjection,
    getActiveProjectId,
} from "../state-manager";
import { wrapWithIsolation } from "./injection-wrapper";
import { injectWithCspFallback } from "../csp-fallback";
import { transitionHealth } from "../health-handler";
import { seedTokensIntoTab } from "./token-seeder";
import { resolveInjectionRequestScripts } from "./injection-request-resolver";
import { resolveInjectionOrder, type ProjectNode } from "../dependency-resolver";
import { readAllProjects } from "./project-helpers";
import { buildProjectNamespaceScript } from "../project-namespace-builder";
import { buildSettingsNamespaceScript } from "../settings-namespace-builder";
import { handleGetSettings } from "./settings-handler";
import { getFilesByProject } from "./file-storage-handler";
import { generateLlmGuide } from "../../lib/generate-llm-guide";
import { toCodeName, slugify } from "../../lib/slug-utils";
import { STORAGE_KEY_ALL_CONFIGS, EXTENSION_VERSION } from "../../shared/constants";
import { readNamespaceCaches } from "../namespace-cache";
import { hashSettingsKey, getSettingsNsCache, setSettingsNsCache } from "../settings-ns-cache";
import { recordInjectionTiming } from "../injection-timing-history";
import { ensureBuiltinScriptsExist } from "../builtin-script-guard";
import { mirrorDiagnosticToTab, mirrorPipelineLogsToTab } from "../injection-diagnostics";
import { cacheGet, cacheSet, cacheDelete } from "../injection-cache";
import type { CacheCategory } from "../injection-cache";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Checks whether the injection toast setting is enabled. */
async function isInjectionToastEnabled(): Promise<boolean> {
    try {
        const { settings } = await handleGetSettings();
        return settings.showInjectionToast !== false;
    } catch {
        return true; // default on
    }
}

/* ------------------------------------------------------------------ */
/*  Module-level caches                                                */
/* ------------------------------------------------------------------ */

/** LLM guide cache — keyed by `codeName:slug`, avoids regenerating ~10KB template per injection */
const _llmGuideCache = new Map<string, string>();

/** Cache key for the combined wrapped payload in IndexedDB */
const PIPELINE_CACHE_KEY = "pipeline_payload" as const;
const PIPELINE_CACHE_CATEGORY: CacheCategory = "scripts";

/* ------------------------------------------------------------------ */
/*  INJECT_SCRIPTS                                                     */
/* ------------------------------------------------------------------ */

/** Injects scripts into the specified tab with error isolation. */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
export async function handleInjectScripts(
    message: MessageRequest,
): Promise<{ results: InjectionResult[] }> {
    const pipelineStart = performance.now();
    const timings: Record<string, number> = {};

    const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
        const start = performance.now();
        const result = await fn();
        timings[label] = Math.round((performance.now() - start) * 10) / 10;
        return result;
    };

    const msg = message as MessageRequest & {
        tabId: number;
        scripts: ScriptEntry[];
        forceReload?: boolean;
    };

    const isForceRun = msg.forceReload === true;

    // ── Early guard: skip injection on restricted URLs (chrome://, edge://, about:, etc.) ──
    try {
        const tab = await chrome.tabs.get(msg.tabId);
        const tabUrl = tab.url ?? "";
        if (/^(chrome|edge|brave|opera|about|devtools|chrome-extension):\/\//i.test(tabUrl)) {
            console.warn("[injection] BLOCKED — cannot inject into restricted URL: %s (tabId=%d)", tabUrl, msg.tabId);
            return {
                results: (msg.scripts as Array<{ id?: string }>).map((s) => ({
                    scriptId: s.id ?? "unknown",
                    success: false,
                    error: `Cannot inject into restricted URL: ${tabUrl}`,
                })) as InjectionResult[],
            };
        }
    } catch (tabErr) {
        console.warn("[injection] BLOCKED — tab %d is inaccessible (closed or discarded): %s", msg.tabId, (tabErr as Error).message);
        return { results: [] };
    }

    console.log("[injection] ── PIPELINE START ── tabId=%d, raw scripts=%d, forceReload=%s", msg.tabId, msg.scripts.length, isForceRun);

    // Show loading spinner toast at start of injection
    const toastEnabledEarly = await isInjectionToastEnabled();
    if (toastEnabledEarly) {
        void showInjectionLoadingToast(msg.tabId, msg.scripts.length).catch(() => {});
    }

    // ── Force Run: clear cached payload before proceeding ──
    if (isForceRun) {
        await cacheDelete(PIPELINE_CACHE_CATEGORY, PIPELINE_CACHE_KEY);
        console.log("[injection] FORCE RUN — pipeline cache cleared by user");
    }

    // ── Cache Gate: check for cached wrapped payload ──
    if (!isForceRun) {
        const cachedPayload = await time("cache_gate", () =>
            cacheGet<{ code: string; scriptMeta: Array<{ id: string; name: string }> }>(PIPELINE_CACHE_CATEGORY, PIPELINE_CACHE_KEY));
        if (cachedPayload) {
            console.log("[injection] CACHE HIT — skipping Stages 0–3, using cached payload (%d chars, %d scripts) in %.1fms",
                cachedPayload.code.length, cachedPayload.scriptMeta.length, timings["cache_gate"]);
            // Jump directly to Stage 2 (env prep) + Stage 4 (execute) with cached payload
            return await executeCachedPayload(msg.tabId, cachedPayload, pipelineStart, timings, time);
        }
        console.log("[injection] CACHE MISS — proceeding through full pipeline (%.1fms)", timings["cache_gate"]);
    }

    // ✅ 15.2: Read all projects ONCE, pass to all consumers
    const allProjects = await time("readAllProjects", () =>
        readAllProjects().catch(() => [] as StoredProject[]));

    // ✅ Auto-reseed missing built-in scripts before resolving
    const didReseedBuiltins = await time("stage0_guard", () => ensureBuiltinScriptsExist(allProjects));
    if (didReseedBuiltins) {
        await mirrorDiagnosticToTab(
            msg.tabId,
            "[builtin-guard] Missing built-in scripts were detected and reseeded from manifest",
            "warn",
        );
    }

    // Stage 0: Dependency resolution — prepend dependency project scripts
    const scriptsWithDeps = await time("stage0_deps", () => prependDependencyScripts(msg.scripts, allProjects));
    console.log("[injection] 0/4 DEPS     — %d scripts after dependency resolution (was %d)",
        scriptsWithDeps.length, msg.scripts.length);

    // Stage 1: Resolve
    const { prepared: preparedScripts, skipped: skippedScripts } = await time("stage1_resolve", () =>
        resolveInjectionRequestScripts(scriptsWithDeps));
    const sorted = preparedScripts.map((entry) => entry.injectable);
    console.log("[injection] 1/4 RESOLVE  — %d scripts resolved, %d skipped in %.1fms: [%s]",
        sorted.length,
        skippedScripts.length,
        timings["stage1_resolve"],
        sorted.map((s) => s.name ?? s.id).join(", "));

    // Build skip results with explicit reasons
    const skipResults: InjectionResult[] = skippedScripts.map((s) => ({
        scriptId: s.scriptId,
        scriptName: s.scriptName,
        isSuccess: false,
        skipReason: s.reason,
        errorMessage: buildSkipMessage(s.reason, s.scriptName),
        durationMs: 0,
    }));

    await mirrorSkippedResultsToTab(msg.tabId, skipResults);

    if (sorted.length === 0) {
        const totalMs = Math.round((performance.now() - pipelineStart) * 10) / 10;
        console.log("[injection] ── PIPELINE END (empty) ── total=%.1fms breakdown=%s",
            totalMs, JSON.stringify(timings));
        void mirrorPipelineLogsToTab(msg.tabId, [
            { msg: `[Marco] ── INJECTION PIPELINE (empty) ── 0 scripts resolved, ${skippedScripts.length} skipped, ${totalMs}ms`, level: "warn" },
            ...skipResults.map((r) => ({
                msg: `[Marco]   ⏭ ${r.scriptName ?? r.scriptId} — ${r.errorMessage ?? r.skipReason ?? "skipped"}`,
                level: "warn" as const,
            })),
        ], `⚠️ Marco Injection — 0 scripts (${totalMs}ms)`);
        return { results: skipResults };
    }

    // ✅ 15.5: Parallelize independent stages 1.5, 2a, 2b
    await time("stage1_5_2a_2b_parallel", () => Promise.all([
        bootstrapNamespaceRoot(msg.tabId),
        ensureRelayInjected(msg.tabId),
        seedTokensIntoTab(msg.tabId),
    ]));
    console.log("[injection] 2/4 SEED     — bootstrap+relay+token completed in %.1fms", timings["stage1_5_2a_2b_parallel"]);

    // Stage 3 & 4: Wrap + Execute scripts
    // Stage 5a/5b: Namespace registration — runs IN PARALLEL with script injection
    // Namespaces are independent of script execution and can be injected concurrently.
    // Note: Config seeding was moved to project save handler (off injection hot path).
    const scriptInjectStart = performance.now();
    const nsInjectStart = performance.now();
    const [execResults] = await time("stage3_4_5_parallel", () => Promise.all([
        injectAllScripts(msg.tabId, preparedScripts).then(r => {
            timings["stage3_4_scripts"] = Math.round((performance.now() - scriptInjectStart) * 10) / 10;
            return r;
        }),
        injectSettingsNamespace(msg.tabId, allProjects).then(() => {
            timings["stage5a_settings"] = Math.round((performance.now() - nsInjectStart) * 10) / 10;
        }),
        injectProjectNamespaces(msg.tabId, allProjects).then(() => {
            timings["stage5b_namespaces"] = Math.round((performance.now() - nsInjectStart) * 10) / 10;
        }),
    ]));

    const totalMs = Math.round((performance.now() - pipelineStart) * 10) / 10;
    const results = [...skipResults, ...execResults];

    const successCount = execResults.filter((r) => r.isSuccess).length;
    const failCount = execResults.length - successCount;

    console.log("[injection] ── TIMING ── total=%.1fms breakdown=%s",
        totalMs, JSON.stringify(timings));
    console.log("[injection] ── PIPELINE END ── %d/%d succeeded, %d skipped, total=%.1fms",
        successCount, execResults.length, skipResults.length, totalMs);
    console.log(
        "[injection] ── PERF NOTE ── Config seeding removed from injection hot path (moved to save-time). " +
        "Scripts: %.1fms | Settings NS: %.1fms | Project NS: %.1fms",
        timings["stage3_4_scripts"] ?? 0,
        timings["stage5a_settings"] ?? 0,
        timings["stage5b_namespaces"] ?? 0,
    );

    // ── Mirror full pipeline summary to tab console (visible in DevTools) ──
    type PipelineLine = { msg: string; level: "log" | "warn" | "error" | "__group__" | "__groupEnd__" };
    const pipelineLines: PipelineLine[] = [
        // ── Stage Summary sub-group ──
        { msg: `📊 Stage Summary (${totalMs}ms)`, level: "__group__" },
        { msg: `0/4 DEPS      ${scriptsWithDeps.length} scripts (${msg.scripts.length} raw + deps)`, level: "log" },
        { msg: `1/4 RESOLVE   ${sorted.length} resolved, ${skippedScripts.length} skipped (${(timings["stage1_resolve"] ?? 0)}ms)`, level: "log" },
        { msg: `2/4 SEED      bootstrap+relay+token (${(timings["stage1_5_2a_2b_parallel"] ?? 0)}ms)`, level: "log" },
        { msg: `3/4 BATCH     ${sorted.length} scripts combined (${(timings["stage3_4_scripts"] ?? 0)}ms)`, level: "log" },
        { msg: `4/4 EXECUTE   ✅ ${successCount} succeeded, ${failCount} failed, ${skipResults.length} skipped`, level: successCount > 0 ? "log" : "warn" },
        { msg: `TOTAL ${totalMs}ms — scripts:${(timings["stage3_4_scripts"] ?? 0)}ms | ns:${(timings["stage5a_settings"] ?? 0)}ms+${(timings["stage5b_namespaces"] ?? 0)}ms`, level: "log" },
        { msg: "", level: "__groupEnd__" },

        // ── Per-Script Results sub-group ──
        { msg: `📜 Per-Script Results (${execResults.length + skipResults.length})`, level: "__group__" },
    ];

    for (const r of execResults) {
        const icon = r.isSuccess ? "✅" : "❌";
        const via = r.injectionPath ? ` via ${r.injectionPath}` : "";
        pipelineLines.push({
            msg: `${icon} ${r.scriptName ?? r.scriptId} (${r.durationMs ?? 0}ms${via})`,
            level: r.isSuccess ? "log" : "error",
        });
    }
    for (const r of skipResults) {
        pipelineLines.push({
            msg: `⏭ ${r.scriptName ?? r.scriptId} — ${r.errorMessage ?? r.skipReason ?? "skipped"}`,
            level: "warn",
        });
    }

    pipelineLines.push({ msg: "", level: "__groupEnd__" });

    // Fire-and-forget: don't block pipeline on tab mirroring
    const groupIcon = failCount > 0 ? "❌" : "✅";
    void mirrorPipelineLogsToTab(msg.tabId, pipelineLines, `${groupIcon} Marco Injection — ${successCount}/${execResults.length} scripts (${totalMs}ms)`);

    // Performance budget alert — configurable via Settings > Injection Budget
    let budgetMs = 500;
    try {
        const { settings } = await handleGetSettings();
        budgetMs = settings.injectionBudgetMs ?? 500;
    } catch { /* use default */ }
    if (totalMs > budgetMs) {
        logBgWarnError(
            BgLogTag.INJECTION,
            `PERFORMANCE BUDGET EXCEEDED — ${totalMs}ms (budget: ${budgetMs}ms) breakdown=${JSON.stringify(timings)}`,
        );
        void mirrorDiagnosticToTab(
            msg.tabId,
            `[Marco] ⚠️ PERFORMANCE BUDGET EXCEEDED — ${totalMs}ms (budget: ${budgetMs}ms)`,
            "warn",
        );
    }

    // Record cumulative timing history
    recordInjectionTiming(totalMs, sorted.length, budgetMs);

    const lastSuccess = execResults.find((r) => r.isSuccess);
    const lastSuccessPath = lastSuccess?.injectionPath;
    const lastDomTarget = lastSuccess?.domTarget;
    recordInjection(msg.tabId, sorted, lastSuccessPath, lastDomTarget, totalMs, budgetMs);

    // ── Post-injection verification — confirm globals actually landed in MAIN world ──
    if (successCount > 0) {
        void verifyPostInjectionGlobals(msg.tabId).catch(() => {});
    }

    // ── Show injection toasts if enabled ──
    const toastEnabled = await isInjectionToastEnabled();
    if (toastEnabled && successCount > 0) {
        void showInjectionToastInTab(msg.tabId, successCount, execResults.length, totalMs).catch(() => {});
    }
    if (toastEnabled && failCount > 0) {
        const failedNames = execResults.filter(r => !r.isSuccess).map(r => r.scriptName ?? r.scriptId);
        void showInjectionFailureToastInTab(msg.tabId, failedNames, failCount, execResults.length, totalMs).catch(() => {});
    }

    return { results };
}


/**
 * Executes a cached wrapped payload, skipping Stages 0–3.
 * Still runs Stage 2 (env prep) and Stage 5 (namespaces) since those
 * are tab-specific and cannot be cached across tabs.
 */
// eslint-disable-next-line max-lines-per-function
async function executeCachedPayload(
    tabId: number,
    cached: { code: string; scriptMeta: Array<{ id: string; name: string }> },
    pipelineStart: number,
    timings: Record<string, number>,
    time: <T>(label: string, fn: () => Promise<T>) => Promise<T>,
): Promise<{ results: InjectionResult[] }> {
    const allProjects = await time("readAllProjects", () =>
        readAllProjects().catch(() => [] as StoredProject[]));

    // Stage 2: Tab environment prep (always needed per-tab)
    await time("stage2_env_prep", () => Promise.all([
        bootstrapNamespaceRoot(tabId),
        ensureRelayInjected(tabId),
        seedTokensIntoTab(tabId),
    ]));
    console.log("[injection] 2/4 SEED     — bootstrap+relay+token (cached path) in %.1fms", timings["stage2_env_prep"]);

    // Stage 4: Execute cached payload
    const execStart = performance.now();
    const execResult = await executeInTab(tabId, cached.code);
    const execMs = Math.round((performance.now() - execStart) * 10) / 10;
    timings["stage4_cached_exec"] = execMs;

    const results: InjectionResult[] = cached.scriptMeta.map((meta) => ({
        scriptId: meta.id,
        scriptName: meta.name,
        isSuccess: true,
        durationMs: execMs,
        injectionPath: execResult.path,
        domTarget: execResult.domTarget,
    }));

    console.log("[injection] 4/4 EXECUTE  — cached batch ✅ %d scripts via %s in %.1fms",
        cached.scriptMeta.length, execResult.path, execMs);

    // Stage 5: Namespaces (always needed per-tab)
    const nsStart = performance.now();
    await time("stage5_namespaces", () => Promise.all([
        injectSettingsNamespace(tabId, allProjects),
        injectProjectNamespaces(tabId, allProjects),
    ]));
    timings["stage5_ns"] = Math.round((performance.now() - nsStart) * 10) / 10;

    const totalMs = Math.round((performance.now() - pipelineStart) * 10) / 10;
    const successCount = results.length;

    console.log("[injection] ── PIPELINE END (cached) ── %d/%d succeeded, total=%.1fms breakdown=%s",
        successCount, results.length, totalMs, JSON.stringify(timings));

    // Post-pipeline: mirror, budget, verification, toast
    type PipelineLine = { msg: string; level: "log" | "warn" | "error" | "__group__" | "__groupEnd__" };
    const pipelineLines: PipelineLine[] = [
        { msg: `📊 Cached Pipeline (${totalMs}ms)`, level: "__group__" },
        { msg: `CACHE HIT — skipped Stages 0–3`, level: "log" },
        { msg: `2/4 SEED      ${(timings["stage2_env_prep"] ?? 0)}ms`, level: "log" },
        { msg: `4/4 EXECUTE   ✅ ${successCount} scripts via ${execResult.path} (${execMs}ms)`, level: "log" },
        { msg: `5/5 NS        ${(timings["stage5_ns"] ?? 0)}ms`, level: "log" },
        { msg: `TOTAL ${totalMs}ms`, level: "log" },
        { msg: "", level: "__groupEnd__" },
    ];
    void mirrorPipelineLogsToTab(tabId, pipelineLines, `✅ Marco Injection (cached) — ${successCount} scripts (${totalMs}ms)`);

    let budgetMs = 500;
    try {
        const { settings } = await handleGetSettings();
        budgetMs = settings.injectionBudgetMs ?? 500;
    } catch { /* use default */ }
    if (totalMs > budgetMs) {
        logBgWarnError(BgLogTag.INJECTION, `PERFORMANCE BUDGET EXCEEDED (cached path) — ${totalMs}ms (budget: ${budgetMs}ms)`);
    }

    recordInjectionTiming(totalMs, successCount, budgetMs);

    const scripts = cached.scriptMeta.map((m) => ({ id: m.id, name: m.name, code: "" })) as unknown as InjectableScript[];
    recordInjection(tabId, scripts, execResult.path, execResult.domTarget, totalMs, budgetMs);

    if (successCount > 0) {
        void verifyPostInjectionGlobals(tabId).catch(() => {});
    }

    const toastEnabled = await isInjectionToastEnabled();
    if (toastEnabled && successCount > 0) {
        void showInjectionToastInTab(tabId, successCount, results.length, totalMs).catch(() => {});
    }

    return { results };
}


/**
 * ✅ 15.7: Batch script injection — concatenates wrapped scripts into a single
 * executeScript call when possible. Scripts with CSS assets are injected
 * individually (CSS must precede their JS). Falls back to sequential on failure.
 */
// eslint-disable-next-line max-lines-per-function
async function injectAllScripts(
    tabId: number,
    scripts: Array<{ injectable: InjectableScript; configJson: string | null; themeJson: string | null }>,
): Promise<InjectionResult[]> {
    if (scripts.length === 0) return [];

    const startTime = Date.now();
    const projectId = getActiveProjectId() ?? undefined;

    const results: InjectionResult[] = [];

    const orderedScripts = [...scripts].sort((a, b) => {
        const aOrder = a.injectable.order ?? 0;
        const bOrder = b.injectable.order ?? 0;
        return aOrder - bOrder;
    });

    // CRITICAL: preserve dependency order across CSS and non-CSS scripts.
    // If any script in the chain needs CSS, batching only the non-CSS subset can
    // execute a dependent script before its prerequisites. In that case, inject
    // the full ordered chain sequentially.
    const hasCssScript = orderedScripts.some((s) => Boolean(s.injectable.assets?.css));
    if (hasCssScript) {
        console.log("[injection] 3/4 ORDER    — CSS-bearing chain detected, forcing sequential ordered injection (%d scripts)", orderedScripts.length);
        for (const script of orderedScripts) {
            const result = await injectSingleScript(tabId, script.injectable, script.configJson, script.themeJson, script.codeSource);
            results.push(result);
        }
        return results;
    }

    // No CSS dependencies in the chain — safe to batch in resolved order.
    if (orderedScripts.length > 0) {
        try {
            const wrappedParts: string[] = [];
            const scriptMeta: Array<{ id: string; name: string }> = [];

            for (const script of orderedScripts) {
                const wrapped = wrapWithIsolation(script.injectable, script.configJson, script.themeJson);
                wrappedParts.push(wrapped);
                scriptMeta.push({ id: script.injectable.id, name: script.injectable.name ?? script.injectable.id });
            }

            const combinedCode = wrappedParts.join("\n;\n");
            console.log("[injection] 3/4 BATCH    — %d scripts combined (%d chars)", orderedScripts.length, combinedCode.length);

            // Store wrapped payload in IndexedDB cache for future runs
            void cacheSet(PIPELINE_CACHE_CATEGORY, { code: combinedCode, scriptMeta }, PIPELINE_CACHE_KEY)
                .then(() => console.log("[injection] CACHE STORE — payload cached for version=%s, size=%d bytes", EXTENSION_VERSION, combinedCode.length))
                .catch(() => { /* best-effort cache write */ });

            const execResult = await executeInTab(tabId, combinedCode);
            const durationMs = Date.now() - startTime;

            for (const meta of scriptMeta) {
                results.push({
                    scriptId: meta.id,
                    scriptName: meta.name,
                    isSuccess: true,
                    durationMs,
                    injectionPath: execResult.path,
                    domTarget: execResult.domTarget,
                });
                // Fire-and-forget: logging is non-critical, don't block injection
                const matchedScript = orderedScripts.find(s => s.injectable.id === meta.id)!;
                logInjectionSuccess(
                    matchedScript.injectable,
                    projectId,
                    matchedScript.codeSource,
                ).catch(() => {});
            }

            console.log("[injection] 4/4 EXECUTE  — batch ✅ %d scripts via %s in %dms",
                scriptMeta.length, execResult.path, durationMs);
        } catch (batchError) {
            // Fallback to sequential on batch failure
            logCaughtError(BgLogTag.INJECTION, "Batch injection failed, falling back to sequential", batchError);
            for (const script of orderedScripts) {
                const result = await injectSingleScript(tabId, script.injectable, script.configJson, script.themeJson, script.codeSource);
                results.push(result);
            }
        }
    }

    return results;
}

/** Injects one script into a tab and logs the result. */
// eslint-disable-next-line max-lines-per-function
async function injectSingleScript(
    tabId: number,
    script: InjectableScript,
    resolvedConfigJson: string | null,
    resolvedThemeJson: string | null,
    resolvedCodeSource?: string,
): Promise<InjectionResult> {
    const startTime = Date.now();
    const configJson = resolvedConfigJson;
    const projectId = getActiveProjectId() ?? undefined;

    // ── CSS injection (before JS) — see spec/12-devtools-and-injection/standalone-script-assets.md §6 ──
    if (script.assets?.css) {
        try {
            // CSS path is now under per-project subfolder
            const cssPath = script.assets.css.startsWith("projects/")
                ? script.assets.css
                : `projects/scripts/${script.assets.css}`;
            await chrome.scripting.insertCSS({
                target: { tabId },
                files: [cssPath],
            });
            console.log("[injection] CSS      — \"%s\" injected %s (tab %d)",
                script.name, script.assets.css, tabId);
        } catch (cssError) {
            // CSS injection failure is non-fatal — log and continue with JS
            logCaughtError(BgLogTag.INJECTION, `CSS "${script.name}" failed to inject ${script.assets.css}`, cssError);
        }
    }

    // Stage 3: Wrap
    console.log("[injection] 3/4 WRAP     — \"%s\" (id=%s) configBinding=%s hasConfig=%s hasTheme=%s codeLen=%d",
        script.name, script.id, script.configBinding ?? "none",
        configJson !== null, resolvedThemeJson !== null, script.code.length);

    try {
        const wrappedCode = wrapWithIsolation(script, configJson, resolvedThemeJson);
        console.log("[injection] 3/4 WRAP     — wrapped code length: %d chars", wrappedCode.length);

        // Stage 4: Execute
        const execStart = performance.now();
        const execResult = await executeInTab(tabId, wrappedCode);
        console.log("[injection] 4/4 EXECUTE  — \"%s\" ✅ success via %s (target: %s) in %.1fms (tab %d)",
            script.name, execResult.path, execResult.domTarget, performance.now() - execStart, tabId);

        // Fire-and-forget: don't block injection for logging
        logInjectionSuccess(script, projectId, resolvedCodeSource).catch(() => {});
        return buildSuccessResult(script.id, startTime, execResult.path, execResult.domTarget);
    } catch (injectionError) {
        logCaughtError(BgLogTag.INJECTION, `4/4 EXECUTE — "${script.name}" failed`, injectionError);

        // Fire-and-forget: don't block injection for logging
        logInjectionFailure(script, projectId, injectionError).catch(() => {});
        return buildErrorResult(script.id, startTime, injectionError);
    }
}

/** Extracts the VERSION constant from macro-looping script code. */
function extractMacroVersion(code: string): string | null {
    // Match patterns like: VERSION = '2.94.0' or VERSION="1.72.0"
    const match = code.match(/VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
    return match?.[1] ?? null;
}

/** Logs a successful script injection to the logs DB. */
async function logInjectionSuccess(
    script: InjectableScript,
    projectId: string | undefined,
    codeSource?: string,
): Promise<void> {
    const codeSnippet = script.code.slice(0, 200);
    const sourceTag = codeSource ? ` [source: ${codeSource}]` : "";

    // Legacy version detection for macro-looping
    const isMacroLooping = script.name.includes("macro-looping") || script.id.includes("macro-looping");
    if (isMacroLooping) {
        const injectedVersion = extractMacroVersion(script.code);
        if (injectedVersion && injectedVersion !== EXTENSION_VERSION) {
            const legacyMsg = `LEGACY SCRIPT DETECTED\n  Path: chrome.storage.local script="${script.name}" id="${script.id}"\n  Missing: Current version macro-looping.js v${EXTENSION_VERSION}\n  Reason: Injected script is v${injectedVersion} but extension is v${EXTENSION_VERSION} — stale cache or embedded code fallback. Source: ${codeSource ?? "unknown"}`;
            console.error("[injection] " + legacyMsg);
            try {
                await handleLogError({
                    type: "LOG_ERROR",
                    code: "LEGACY_SCRIPT_INJECTED",
                    message: legacyMsg,
                    stack: `Injected version: ${injectedVersion}, Expected: ${EXTENSION_VERSION}, Source: ${codeSource ?? "unknown"}, Code length: ${script.code.length}`,
                } as MessageRequest);
            } catch { /* best effort */ }
        }
    }

    try {
        await handleLogEntry({
            type: "LOG_ENTRY",
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: `Injected "${script.name}" (${script.code.length} chars${sourceTag}): ${codeSnippet}`,
            scriptId: script.id,
            projectId,
            configId: script.configBinding,
        } as MessageRequest);
    } catch (loggingError) {
        logCaughtError(BgLogTag.INJECTION, "logInjectionSuccess skipped", loggingError);
    }
}

/** Logs a failed script injection to the errors DB. */
async function logInjectionFailure(
    script: InjectableScript,
    projectId: string | undefined,
    error: unknown,
): Promise<void> {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    try {
        await handleLogError({
            type: "LOG_ERROR",
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: `Script "${script.name}" failed: ${errorMessage}`,
            scriptId: script.id,
            projectId,
            configId: script.configBinding,
            scriptFile: script.code.slice(0, 500),
        } as MessageRequest);
    } catch (loggingError) {
        const reason = loggingError instanceof Error
            ? loggingError.message
            : String(loggingError);

        logCaughtError(BgLogTag.INJECTION, "logInjectionFailure skipped", loggingError);
    }
}

/** Mirrors skipped-script diagnostics into the active tab console. */
async function mirrorSkippedResultsToTab(
    tabId: number,
    results: InjectionResult[],
): Promise<void> {
    const skipped = results.filter((result) => result.skipReason);

    if (skipped.length === 0) {
        return;
    }

    const detailLines = skipped.map((result) =>
        `- ${result.scriptName ?? result.scriptId}: ${result.errorMessage ?? "skipped"}`,
    ).join("\n");

    await mirrorDiagnosticToTab(
        tabId,
        `[injection] ${skipped.length} script(s) skipped during manual run\n${detailLines}`,
        "warn",
    );
}


/** Executes wrapped code in the specified tab using CSP-aware fallback. */
async function executeInTab(tabId: number, code: string): Promise<{ path: string; domTarget?: string }> {
    const result = await injectWithCspFallback(tabId, code, "MAIN");

    if (!result.isSuccess) {
        throw new Error(result.errorMessage ?? "Injection failed in MAIN and ISOLATED worlds.");
    }

    if (result.isFallback) {
        logBgWarnError(
            BgLogTag.INJECTION,
            `Script executed via ${result.world} fallback (tab ${tabId}) — window.marco created in non-MAIN world, RiseupAsiaMacroExt.Projects.* may not be accessible from the page console.`,
        );
    }

    return { path: resolveInjectionPath(result), domTarget: result.domTarget ?? "unknown" };
}

/** Builds a successful injection result. */
function buildSuccessResult(
    scriptId: string,
    startTime: number,
    injectionPath?: string,
    domTarget?: string,
): InjectionResult {
    return {
        scriptId,
        isSuccess: true,
        durationMs: Date.now() - startTime,
        injectionPath,
        domTarget,
    };
}

/** Maps CspInjectionResult world to a human-readable injection path label. */
function resolveInjectionPath(result: import("../csp-fallback").CspInjectionResult): string {
    if (result.world === "USER_SCRIPT") return "userScripts";
    if (result.isFallback && result.world === "ISOLATED") return "isolated-blob";
    return "main-blob";
}

/** Builds an error injection result. */
function buildErrorResult(
    scriptId: string,
    startTime: number,
    error: unknown,
): InjectionResult {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    logBgWarnError(BgLogTag.INJECTION, `Script ${scriptId} failed: ${errorMessage}`);

    return {
        scriptId,
        isSuccess: false,
        errorMessage,
        durationMs: Date.now() - startTime,
    };
}

/** Records the injection in the state manager. */
function recordInjection(tabId: number, scripts: InjectableScript[], injectionPath?: string, domTarget?: string, pipelineDurationMs?: number, budgetMs?: number): void {
    const scriptIds = scripts.map((s) => s.id);
    const projectId = getActiveProjectId() ?? "";

    setTabInjection(tabId, {
        scriptIds,
        timestamp: new Date().toISOString(),
        projectId,
        matchedRuleId: "",
        injectionPath,
        domTarget,
        pipelineDurationMs,
        budgetMs,
    });
}

/** Builds a human-readable skip message for a given reason. */
function buildSkipMessage(reason: SkipReason, scriptName: string): string {
    switch (reason) {
        case "disabled":
            return `Script "${scriptName}" is disabled — enable it in the Scripts panel to inject.`;
        case "missing":
            return `Script "${scriptName}" not found in storage — it may have been deleted or not yet seeded.`;
        case "resolver_mismatch":
            return `Script "${scriptName}" could not be resolved — the format doesn't match any known script type.`;
        default:
            return `Script "${scriptName}" was skipped (unknown reason).`;
    }
}

/* ------------------------------------------------------------------ */
/*  MAIN-World Namespace Bootstrap                                     */
/* ------------------------------------------------------------------ */

/**
 * Bootstraps `window.RiseupAsiaMacroExt = { Projects: {} }` in the page's
 * MAIN world before any scripts or namespaces are injected.
 *
 * This MUST run in MAIN world (not USER_SCRIPT / ISOLATED) because the
 * Developer Guide documents direct console access like:
 *   `RiseupAsiaMacroExt.Projects.MyProject.vars.get("key")`
 *
 * If MAIN world injection fails (CSP), we log a loud error and transition
 * health to DEGRADED so the user knows docs-style access won't work.
 */
async function bootstrapNamespaceRoot(tabId: number): Promise<void> {
    try {
        // Execute directly in MAIN world — NO <script> element indirection.
        // The previous approach created a <script textContent=...> tag which
        // CSP blocks on pages with script-src restrictions (no 'unsafe-inline').
        // chrome.scripting.executeScript({ func, world: "MAIN" }) already runs
        // the func in the page's MAIN world, so we set the global directly.
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const win = window as unknown as Record<string, unknown>;
                if (!win.RiseupAsiaMacroExt) {
                    win.RiseupAsiaMacroExt = { Projects: {} };
                } else {
                    const ext = win.RiseupAsiaMacroExt as Record<string, unknown>;
                    if (!ext.Projects) {
                        ext.Projects = {};
                    }
                }
            },
            world: "MAIN" as chrome.scripting.ExecutionWorld,
        });
        console.log("[injection:bootstrap] ✅ RiseupAsiaMacroExt root bootstrapped in MAIN world (tab %d)", tabId);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logCaughtError(BgLogTag.INJECTION_BOOTSTRAP, `CRITICAL — Failed to bootstrap namespace\n  Path: chrome.scripting.executeScript → tabId=${tabId}, world=MAIN\n  Missing: window.RiseupAsiaMacroExt root namespace object\n  Reason: ${msg} — chrome.scripting.executeScript itself was blocked (not CSP — likely tab closed or restricted page)`, err);
        transitionHealth("DEGRADED", "RiseupAsiaMacroExt MAIN world bootstrap failed");

        // Also inject a visible console warning into the page
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    console.error(
                        "%c[Marco Extension] ⚠️ MAIN world namespace bootstrap failed",
                        "color: red; font-weight: bold; font-size: 14px;",
                        "\n\nRiseupAsiaMacroExt.Projects.* will NOT be available in the console.",
                        "\n\nWorkaround: Use window.marco.* API directly (available in the injected script world).",
                    );
                },
                world: "MAIN" as chrome.scripting.ExecutionWorld,
            });
        } catch { /* best-effort warning */ }
    }
}


/* ------------------------------------------------------------------ */

/**
 * Injects `window.RiseupAsiaMacroExt.Settings` with current extension
 * settings as a frozen read-only object.
 */
async function injectSettingsNamespace(tabId: number, allProjects: StoredProject[]): Promise<void> {
    try {
        const activeId = getActiveProjectId();
        const activeProject = activeId ? allProjects.find((p) => p.id === activeId) : undefined;
        const codeName = activeProject
            ? (activeProject.codeName || toCodeName(activeProject.slug || slugify(activeProject.name)))
            : "Default";
        const slug = activeProject
            ? (activeProject.slug || slugify(activeProject.name))
            : "default";

        // ✅ Cache LLM guide per codeName+slug — it's ~10KB of static template
        const guideKey = `${codeName}:${slug}`;
        if (!_llmGuideCache.has(guideKey)) {
            _llmGuideCache.set(guideKey, generateLlmGuide(codeName, slug));
        }
        const llmGuide = _llmGuideCache.get(guideKey)!;

        // ✅ Phase 10: Cache the full settings namespace script
        const { settings } = await handleGetSettings();
        const settingsHash = hashSettingsKey(settings as unknown as Record<string, unknown>, guideKey);
        let script = getSettingsNsCache(settingsHash);
        if (script) {
            console.log("[injection:settings] Phase 10: using cached settings namespace script");
        } else {
            script = buildSettingsNamespaceScript(settings, llmGuide);
            setSettingsNsCache(settingsHash, script);
            console.log("[injection:settings] Phase 10: rebuilt and cached settings namespace script (%d chars)", script.length);
        }
        const result = await injectWithCspFallback(tabId, script, "MAIN");
        if (result.isFallback) {
            logBgWarnError(BgLogTag.INJECTION_SETTINGS, `CRITICAL — Settings namespace injected via ${result.world} fallback (tab ${tabId}). RiseupAsiaMacroExt.Settings will NOT be visible in the page console.`);
            transitionHealth("DEGRADED", "Settings namespace fell back to " + result.world + " — not visible in MAIN world");
        } else {
            console.log("[injection:settings] Registered RiseupAsiaMacroExt.Settings + docs (port=%d)", settings.broadcastPort);
        }
    } catch (err) {
        logCaughtError(BgLogTag.INJECTION_SETTINGS, "Failed to register settings namespace", err);
    }
}

/* ------------------------------------------------------------------ */
/*  Per-Project Namespace Registration                                 */
/* ------------------------------------------------------------------ */

/**
 * After scripts are injected, registers per-project namespaces under
 * `window.RiseupAsiaMacroExt.Projects.<CodeName>` for each project
 * in the dependency chain + the active project.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
async function injectProjectNamespaces(tabId: number, allProjects: StoredProject[]): Promise<void> {
    const activeId = getActiveProjectId();
    if (!activeId) return;

    const activeProject = allProjects.find((p) => p.id === activeId);
    if (!activeProject) return;

    // Collect: active project + ALL global projects + explicit transitive deps
    const projectIds = new Set<string>([activeId]);

    // Always include global projects for namespace registration
    for (const p of allProjects) {
        if (p.isGlobal === true) projectIds.add(p.id);
    }

    const queue = (activeProject.dependencies ?? []).map((d) => d.projectId);
    while (queue.length > 0) {
        const depId = queue.shift()!;
        if (projectIds.has(depId)) continue;
        projectIds.add(depId);
        const dep = allProjects.find((p) => p.id === depId);
        if (dep?.dependencies) {
            for (const sub of dep.dependencies) {
                if (!projectIds.has(sub.projectId)) queue.push(sub.projectId);
            }
        }
    }

    // ✅ 15.3: Read all configs ONCE before the loop
    let allConfigs: Array<Record<string, unknown>> = [];
    try {
        const configResult = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
        allConfigs = Array.isArray(configResult[STORAGE_KEY_ALL_CONFIGS])
            ? configResult[STORAGE_KEY_ALL_CONFIGS]
            : [];
    } catch { /* empty */ }

    // ✅ 15.8: Batch-read pre-built namespace caches
    const pidArray = [...projectIds];
    const cachedScripts = await readNamespaceCaches(pidArray);

    // ✅ 15.9: Batch all namespace scripts into a SINGLE executeScript call
    // Instead of one IPC per project, concatenate all namespace scripts and inject once.
    const nsScriptParts: string[] = [];
    const nsProjectNames: string[] = [];

    for (const pid of projectIds) {
        const project = allProjects.find((p) => p.id === pid);
        if (!project) continue;

        const projectSlug = project.slug || slugify(project.name);
        const codeName = project.codeName || toCodeName(projectSlug);

        if (codeName === "MacroController") {
            console.log("[injection:ns] Skipped generic namespace injection for \"%s\" (%s) — runtime namespace is owned by the script bundle", project.name, codeName);
            continue;
        }

        let nsScript = cachedScripts.get(pid);
        if (!nsScript) {
            let fileCache: Array<{ name: string; data: string }> = [];
            try {
                fileCache = getFilesByProject(pid, 50);
            } catch {
                fileCache = [];
            }

            nsScript = buildProjectNamespaceScript({
                codeName,
                slug: projectSlug,
                projectName: project.name,
                projectVersion: project.version,
                projectId: project.id,
                description: project.description,
                dependencies: (project.dependencies ?? []).map((d) => ({
                    projectId: d.projectId,
                    version: d.version,
                })),
                scripts: (project.scripts ?? []).map((s, i) => ({
                    name: s.path.split("/").pop() ?? s.path,
                    order: s.order ?? i,
                    isEnabled: true,
                })),
                fileCache,
                cookieBindings: (project.cookies ?? []).map((c) => ({
                    cookieName: c.cookieName,
                    url: c.url,
                    role: c.role,
                })),
            });
            console.log("[injection:ns] Cache miss for \"%s\" — built on-the-fly (%d chars)", project.name, nsScript.length);
        } else {
            console.log("[injection:ns] Cache hit for \"%s\" (%d chars)", project.name, nsScript.length);
        }

        nsScriptParts.push(nsScript);
        nsProjectNames.push(`${project.name} (${codeName})`);
    }

    if (nsScriptParts.length > 0) {
        const combinedNs = nsScriptParts.join("\n;\n");
        console.log("[injection:ns] Batch injecting %d namespaces (%d chars): [%s]",
            nsScriptParts.length, combinedNs.length, nsProjectNames.join(", "));

        try {
            const nsResult = await injectWithCspFallback(tabId, combinedNs, "MAIN");
            if (nsResult.isFallback) {
                logBgWarnError(BgLogTag.INJECTION_NS, `CRITICAL — ${nsScriptParts.length} namespaces injected via ${nsResult.world} fallback (tab ${tabId}). RiseupAsiaMacroExt.Projects.* will NOT be visible in page console.`);
                transitionHealth("DEGRADED", `Project namespaces fell back to ${nsResult.world} — not visible in MAIN world`);
            } else {
                console.log("[injection:ns] ✅ Registered %d namespaces in single IPC call", nsScriptParts.length);
            }
        } catch (err) {
            logCaughtError(BgLogTag.INJECTION_NS, "Batch namespace injection failed, falling back to sequential", err);
            // Sequential fallback
            for (let i = 0; i < nsScriptParts.length; i++) {
                try {
                    await injectWithCspFallback(tabId, nsScriptParts[i], "MAIN");
                    console.log("[injection:ns] Registered namespace for %s (sequential fallback)", nsProjectNames[i]);
                } catch (seqErr) {
                    logCaughtError(BgLogTag.INJECTION_NS, `Failed: ${nsProjectNames[i]}`, seqErr);
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Dependency Resolution                                              */
/* ------------------------------------------------------------------ */

/**
 * Reads the active project's dependency graph and prepends dependency
 * project scripts in topological order (globals first) before the
 * caller-provided scripts.
 *
 * CRITICAL: Global projects (isGlobal === true) are ALWAYS injected
 * before any matched project, even if not explicitly listed as
 * dependencies. This is the "implicit global dependency" policy.
 * See: .lovable/memory/features/projects/global-project-injection-policy.md
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
async function prependDependencyScripts(callerScripts: ScriptEntry[], allProjects: StoredProject[]): Promise<ScriptEntry[]> {
    const activeId = getActiveProjectId();
    if (!activeId) return callerScripts;

    const activeProject = allProjects.find((p) => p.id === activeId);
    if (!activeProject) return callerScripts;

    // Step 1: Collect ALL global projects (implicit deps, always load first)
    const globalProjects = allProjects.filter(
        (p) => p.isGlobal === true && p.id !== activeId,
    );

    // Step 2: Collect explicit transitive dependencies + globals into the graph
    const relevantIds = new Set<string>([activeId]);
    for (const gp of globalProjects) {
        relevantIds.add(gp.id);
    }
    const queue = [...(activeProject.dependencies ?? []).map((d) => d.projectId)];

    while (queue.length > 0) {
        const depId = queue.shift()!;
        if (relevantIds.has(depId)) continue;
        relevantIds.add(depId);
        const depProject = allProjects.find((p) => p.id === depId);
        if (depProject?.dependencies) {
            for (const sub of depProject.dependencies) {
                if (!relevantIds.has(sub.projectId)) queue.push(sub.projectId);
            }
        }
    }

    // Safety net: manual/click injection can still run against stale project metadata.
    // Ensure the built-in dependency chain is always recoverable for Macro Controller.
    for (const requiredProjectId of ["marco-sdk", "xpath"]) {
        const requiredProject = allProjects.find((p) => p.id === requiredProjectId);
        if (requiredProject && requiredProject.id !== activeId) {
            relevantIds.add(requiredProject.id);
        }
    }

    // Step 3: Build ProjectNode array for topological sort
    const nodes: ProjectNode[] = allProjects
        .filter((p) => relevantIds.has(p.id))
        .map((p) => ({
            id: p.id,
            name: p.name,
            version: p.version,
            isGlobal: p.isGlobal === true,
            dependencies: (p.dependencies ?? []).map((d) => ({
                projectId: d.projectId,
                version: d.version,
            })),
        }));

    const resolution = resolveInjectionOrder(nodes);

    if (!resolution.isSuccess) {
        logBgWarnError(BgLogTag.INJECTION_DEPS, `Dependency resolution failed: ${resolution.errorMessage}`);
        // Even on failure, still prepend global project scripts
        return [...collectGlobalScripts(globalProjects), ...callerScripts];
    }

    const callerScriptKeys = new Set(
        callerScripts
            .map(getScriptIdentity)
            .filter((value): value is string => value !== null),
    );

    const projectOrderIndex = new Map<string, number>();
    for (const [index, projectId] of resolution.order.entries()) {
        projectOrderIndex.set(projectId, index);
    }

    const scriptKeyToProjectId = new Map<string, string>();
    for (const project of allProjects) {
        if (!relevantIds.has(project.id)) continue;
        for (const script of project.scripts ?? []) {
            scriptKeyToProjectId.set(normalizeScriptIdentity(script.path), project.id);
        }
    }

    // Step 4: Collect scripts in resolved order (skip active project)
    const depScripts: ScriptEntry[] = [];
    for (const projectId of resolution.order) {
        if (projectId === activeId) continue;
        const depProject = allProjects.find((p) => p.id === projectId);
        if (!depProject?.scripts?.length) continue;

        const baseOrder = -1000 + depScripts.length;
        for (const [scriptIndex, script] of depProject.scripts.entries()) {
            if (callerScriptKeys.has(normalizeScriptIdentity(script.path))) {
                continue;
            }
            depScripts.push({
                ...script,
                order: baseOrder + (script.order ?? scriptIndex),
            });
        }

        console.log("[injection:deps] Prepending %d scripts from %s \"%s\" (id=%s)",
            depProject.scripts.length,
            depProject.isGlobal ? "global" : "dependency",
            depProject.name, depProject.id);
    }

    if (depScripts.length === 0) return callerScripts;

    const reorderedCallerScripts = callerScripts.map((script, index) => {
        if (!isScriptEntryLike(script)) return script;

        const scriptKey = getScriptIdentity(script);
        if (!scriptKey) return script;

        const projectId = scriptKeyToProjectId.get(scriptKey);
        const projectRank = projectId !== undefined
            ? projectOrderIndex.get(projectId)
            : undefined;

        if (projectRank === undefined) return script;

        return {
            ...script,
            order: projectRank * 1000 + (script.order ?? index),
        };
    });

    console.log("[injection:deps] Total: %d dependency scripts + %d caller scripts",
        depScripts.length, callerScripts.length);

    return [...depScripts, ...reorderedCallerScripts];
}

/** Fallback: collects scripts from global projects when topological sort fails. */
function collectGlobalScripts(globalProjects: StoredProject[]): ScriptEntry[] {
    const scripts: ScriptEntry[] = [];
    for (const gp of globalProjects) {
        if (!gp.scripts?.length) continue;
        const baseOrder = -2000 + scripts.length;
        for (const script of gp.scripts) {
            scripts.push({ ...script, order: baseOrder + script.order });
        }
    }
    return scripts;
}

function isScriptEntryLike(value: unknown): value is { path?: string; id?: string; name?: string; order?: number } {
    return typeof value === "object" && value !== null;
}

function getScriptIdentity(value: unknown): string | null {
    if (!isScriptEntryLike(value)) return null;

    const candidate = typeof value.path === "string"
        ? value.path
        : typeof value.id === "string"
            ? value.id
            : typeof value.name === "string"
                ? value.name
                : null;

    return candidate ? normalizeScriptIdentity(candidate) : null;
}

function normalizeScriptIdentity(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

/* ------------------------------------------------------------------ */
/*  Relay Injection (safety net for content_scripts manifest entry)     */
/* ------------------------------------------------------------------ */

const relayInjectedTabs = new Set<number>();

/**
 * ✅ 15.6: Optimized relay injection — single combined probe-and-inject.
 * Reduces from 2-4 executeScript IPC calls to 1-2.
 */
async function ensureRelayInjected(tabId: number): Promise<void> {
    if (relayInjectedTabs.has(tabId)) {
        return;
    }

    try {
        // Single probe: check sentinel + runtime health in one call
        const [probeResult] = await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: async () => {
                const hasSentinel = !!(window as unknown as Record<string, unknown>).__marcoRelayActive;
                if (!hasSentinel) return { status: "needs_injection" as const };

                try {
                    const ping = await chrome.runtime.sendMessage({ type: "__PING__" });
                    const isHealthy = typeof ping === "object"
                        && ping !== null
                        && (ping as { isOk?: boolean }).isOk === true;
                    if (isHealthy) return { status: "healthy" as const };
                } catch { /* runtime stale */ }

                // Sentinel exists but runtime is stale — clear sentinel for reinjection
                delete (window as unknown as Record<string, unknown>).__marcoRelayActive;
                return { status: "needs_injection" as const };
            },
        });

        const status = (probeResult?.result as { status: string } | undefined)?.status;

        if (status === "healthy") {
            relayInjectedTabs.add(tabId);
            return;
        }

        // Inject the relay content script (only when needed)
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            files: ["content-scripts/message-relay.js"],
        });

        relayInjectedTabs.add(tabId);
        console.log("[injection] Message relay injected into tab %d (safety net)", tabId);
    } catch (relayError) {
        logCaughtError(BgLogTag.INJECTION, "Failed to inject message relay", relayError);
    }
}


/*  GET_TAB_INJECTIONS                                                 */
/* ------------------------------------------------------------------ */

/** Returns injection status for all scripts in a tab. */
export async function handleGetTabInjections(
    message: MessageRequest,
): Promise<{ injections: Record<number, unknown> }> {
    const msg = message as MessageRequest & { tabId: number };
    const allInjections = getTabInjections();
    const hasTabId = msg.tabId !== undefined;

    if (hasTabId) {
        const tabRecord = allInjections[msg.tabId] ?? null;
        return { injections: { [msg.tabId]: tabRecord } };
    }

    return { injections: allInjections };
}

/* ------------------------------------------------------------------ */
/*  Post-injection toast in target tab                                  */
/* ------------------------------------------------------------------ */

/**
 * Shows a styled success toast in the target tab after scripts are injected.
 * Uses window.marco.notify if the SDK is available, otherwise falls back to
 * a lightweight DOM-based toast in the bottom-right corner.
 */
// eslint-disable-next-line max-lines-per-function
async function showInjectionToastInTab(
    tabId: number,
    successCount: number,
    totalCount: number,
    durationMs: number,
): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            // eslint-disable-next-line max-lines-per-function
            func: (ok: number, total: number, ms: number, version: string) => {
                const msg = `✅ Marco v${version} — ${ok}/${total} scripts injected (${ms}ms)`;

                // Dismiss loading toast first
                const loader = document.getElementById("__marco-inject-toast-loading");
                // eslint-disable-next-line sonarjs/no-duplicate-string
                if (loader) { loader.style.opacity = "0"; loader.style.transform = "translateY(8px) scale(0.96)"; setTimeout(() => loader.remove(), 300); }

                // Try SDK toast first
                const m = (window as unknown as Record<string, Record<string, ((...args: unknown[]) => void)>>).marco;
                if (m?.notify?.success) {
                    try { m.notify.success(msg, { duration: 4000 }); return; } catch { /* fall through */ }
                }

                // DOM fallback — self-contained, no dependencies
                const CONTAINER_ID = "__marco-inject-toast";
                let container = document.getElementById(CONTAINER_ID);
                if (!container) {
                    container = document.createElement("div");
                    container.id = CONTAINER_ID;
                    container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
                    (document.body || document.documentElement).appendChild(container);
                }

                const toast = document.createElement("div");
                toast.style.cssText = [
                    "pointer-events:auto",
                    "display:flex",
                    "align-items:center",
                    "gap:8px",
                    "padding:10px 16px",
                    "border-radius:10px",
                    "font-size:12px",
                    "font-weight:500",
                    "color:#d1fae5",
                    "background:linear-gradient(135deg,#065f46 0%,#064e3b 100%)",
                    "border:1px solid rgba(16,185,129,0.3)",
                    "box-shadow:0 8px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(16,185,129,0.1)",
                    "opacity:0",
                    "transform:translateY(12px) scale(0.96)",
                    "transition:all 0.35s cubic-bezier(0.16,1,0.3,1)",
                    "max-width:380px",
                    "backdrop-filter:blur(12px)",
                ].join(";") + ";";

                const icon = document.createElement("span");
                icon.textContent = "✅";
                icon.style.cssText = "font-size:16px;flex-shrink:0;";

                const body = document.createElement("span");
                body.textContent = `Marco v${version} — ${ok}/${total} scripts injected (${ms}ms)`;

                const close = document.createElement("button");
                close.textContent = "✕";
                close.style.cssText = "background:none;border:none;color:#d1fae5;font-size:14px;cursor:pointer;opacity:0.6;padding:0 2px;margin-left:4px;transition:opacity 0.2s;";
                close.onmouseenter = () => { close.style.opacity = "1"; };
                close.onmouseleave = () => { close.style.opacity = "0.6"; };
                close.onclick = () => dismiss();

                toast.appendChild(icon);
                toast.appendChild(body);
                toast.appendChild(close);
                container.appendChild(toast);

                // Animate in
                requestAnimationFrame(() => {
                    toast.style.opacity = "1";
                    toast.style.transform = "translateY(0) scale(1)";
                });

                const dismiss = () => {
                    toast.style.opacity = "0";
                    toast.style.transform = "translateY(8px) scale(0.96)";
                    setTimeout(() => toast.remove(), 350);
                };

                // Auto-dismiss after 4s
                setTimeout(dismiss, 4000);
            },
            args: [successCount, totalCount, Math.round(durationMs), EXTENSION_VERSION],
        });
    } catch (toastError) {
        logCaughtError(BgLogTag.INJECTION, "showInjectionToastInTab failed", toastError);
    }
}

/* ------------------------------------------------------------------ */
/*  Post-injection failure toast in target tab                          */
/* ------------------------------------------------------------------ */

/**
 * Shows a red error toast in the target tab when one or more scripts fail injection.
 * Lists the failed script names so the user knows exactly what went wrong.
 */
// eslint-disable-next-line max-lines-per-function
async function showInjectionFailureToastInTab(
    tabId: number,
    failedNames: string[],
    failCount: number,
    totalCount: number,
    durationMs: number,
): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            // eslint-disable-next-line max-lines-per-function
            func: (names: string[], failed: number, total: number, ms: number, version: string) => {
                const nameList = names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + ` +${names.length - 3} more`;
                const msg = `❌ Marco v${version} — ${failed}/${total} scripts failed (${ms}ms)\n${nameList}`;

                // Dismiss loading toast first
                const loader = document.getElementById("__marco-inject-toast-loading");
                if (loader) { loader.style.opacity = "0"; loader.style.transform = "translateY(8px) scale(0.96)"; setTimeout(() => loader.remove(), 300); }

                // Try SDK toast first
                const m = (window as unknown as Record<string, Record<string, ((...args: unknown[]) => void)>>).marco;
                if (m?.notify?.error) {
                    try { m.notify.error(msg, { duration: 6000 }); return; } catch { /* fall through */ }
                }

                // DOM fallback
                const CONTAINER_ID = "__marco-inject-toast";
                let container = document.getElementById(CONTAINER_ID);
                if (!container) {
                    container = document.createElement("div");
                    container.id = CONTAINER_ID;
                    container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
                    (document.body || document.documentElement).appendChild(container);
                }

                const toast = document.createElement("div");
                toast.style.cssText = [
                    "pointer-events:auto",
                    "display:flex",
                    "align-items:flex-start",
                    "gap:8px",
                    "padding:10px 16px",
                    "border-radius:10px",
                    "font-size:12px",
                    "font-weight:500",
                    "color:#fecaca",
                    "background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%)",
                    "border:1px solid rgba(239,68,68,0.3)",
                    "box-shadow:0 8px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(239,68,68,0.1)",
                    "opacity:0",
                    "transform:translateY(12px) scale(0.96)",
                    "transition:all 0.35s cubic-bezier(0.16,1,0.3,1)",
                    "max-width:400px",
                    "backdrop-filter:blur(12px)",
                ].join(";") + ";";

                const icon = document.createElement("span");
                icon.textContent = "❌";
                icon.style.cssText = "font-size:16px;flex-shrink:0;margin-top:1px;";

                const body = document.createElement("div");
                body.style.cssText = "flex:1;min-width:0;";

                const titleDiv = document.createElement("div");
                titleDiv.textContent = `Marco v${version} — ${failed}/${total} scripts failed (${ms}ms)`;
                titleDiv.style.cssText = "margin-bottom:3px;";

                const detailDiv = document.createElement("div");
                detailDiv.textContent = nameList;
                detailDiv.style.cssText = "font-size:10px;opacity:0.75;word-break:break-word;";

                body.appendChild(titleDiv);
                body.appendChild(detailDiv);

                const close = document.createElement("button");
                close.textContent = "✕";
                close.style.cssText = "background:none;border:none;color:#fecaca;font-size:14px;cursor:pointer;opacity:0.6;padding:0 2px;margin-left:4px;transition:opacity 0.2s;flex-shrink:0;";
                close.onmouseenter = () => { close.style.opacity = "1"; };
                close.onmouseleave = () => { close.style.opacity = "0.6"; };
                close.onclick = () => dismiss();

                toast.appendChild(icon);
                toast.appendChild(body);
                toast.appendChild(close);
                container.appendChild(toast);

                requestAnimationFrame(() => {
                    toast.style.opacity = "1";
                    toast.style.transform = "translateY(0) scale(1)";
                });

                // eslint-disable-next-line sonarjs/no-identical-functions
                const dismiss = () => {
                    toast.style.opacity = "0";
                    toast.style.transform = "translateY(8px) scale(0.96)";
                    setTimeout(() => toast.remove(), 350);
                };

                // Error toasts stay longer — 6s
                setTimeout(dismiss, 6000);
            },
            args: [failedNames, failCount, totalCount, Math.round(durationMs), EXTENSION_VERSION],
        });
    } catch (toastError) {
        logCaughtError(BgLogTag.INJECTION, "showInjectionFailureToastInTab failed", toastError);
    }
}

/* ------------------------------------------------------------------ */
/*  Post-injection verification                                        */
/* ------------------------------------------------------------------ */

/**
 * Runs a lightweight check in the MAIN world to confirm that key globals
 * (marco SDK, MacroController, RiseupAsiaMacroExt, and the UI container)
 * actually exist after injection. Logs a detailed verification report to
 * the tab console so false-positive "SCRIPT_INJECTED" entries are caught.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
async function verifyPostInjectionGlobals(tabId: number): Promise<void> {
    try {
        const [frameResult] = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: () => {
                const win = window as unknown as Record<string, unknown>;
                const marcoSdk = typeof win.marco === "object" && win.marco !== null;
                const extRoot = typeof win.RiseupAsiaMacroExt === "object" && win.RiseupAsiaMacroExt !== null;
                const mcClass = typeof (win as Record<string, unknown>).MacroController === "function";
                const extRootObj = win.RiseupAsiaMacroExt as Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
                const mcInstance = !!(
                    extRoot &&
                    extRootObj?.Projects?.MacroController?.api?.mc
                );
                const uiContainer = !!document.getElementById("macro-loop-container");
                const markerEl = !!document.querySelector("[data-marco-injected]");

                // Capture diagnostic stack trace at verification point for dev debugging
                const verifyStack = new Error("[DEV] post-injection verification snapshot").stack ?? "";

                return { marcoSdk, extRoot, mcClass, mcInstance, uiContainer, markerEl, verifyStack };
            },
        });

        const r = frameResult?.result as {
            marcoSdk: boolean;
            extRoot: boolean;
            mcClass: boolean;
            mcInstance: boolean;
            uiContainer: boolean;
            markerEl: boolean;
            verifyStack: string;
        } | undefined;

        if (!r) return;

        const allOk = r.marcoSdk && r.extRoot && r.mcClass && r.mcInstance && r.uiContainer;
        const status = allOk ? "✅ VERIFIED" : "⚠️ INCOMPLETE";

        const lines: Array<{ msg: string; level: "log" | "warn" | "error" }> = [
            { msg: `window.marco (SDK)           : ${r.marcoSdk ? "✅" : "❌"}`, level: r.marcoSdk ? "log" : "error" },
            { msg: `window.RiseupAsiaMacroExt     : ${r.extRoot ? "✅" : "❌"}`, level: r.extRoot ? "log" : "error" },
            { msg: `window.MacroController (class): ${r.mcClass ? "✅" : "❌"}`, level: r.mcClass ? "log" : "error" },
            { msg: `api.mc (singleton instance)   : ${r.mcInstance ? "✅" : "❌"}`, level: r.mcInstance ? "log" : "warn" },
            { msg: `#macro-loop-container (UI)    : ${r.uiContainer ? "✅" : "❌"}`, level: r.uiContainer ? "log" : "warn" },
            { msg: `[data-marco-injected] marker  : ${r.markerEl ? "✅" : "⚠️ (not required)"}`, level: "log" },
        ];

        if (!allOk) {
            lines.push({ msg: `── Stack at verification point ──`, level: "warn" });
            lines.push({ msg: r.verifyStack, level: "warn" });
        }

        void mirrorPipelineLogsToTab(tabId, lines, `${status} Post-Injection Verification`);

        // Store verification results on the tab injection record for diagnostics copy
        const existingRecord = getTabInjections()[tabId];
        if (existingRecord) {
            setTabInjection(tabId, {
                ...existingRecord,
                verification: {
                    marcoSdk: r.marcoSdk,
                    extRoot: r.extRoot,
                    mcClass: r.mcClass,
                    mcInstance: r.mcInstance,
                    uiContainer: r.uiContainer,
                    markerEl: r.markerEl,
                    verifiedAt: new Date().toISOString(),
                },
            });
        }

        if (!allOk) {
            logBgWarnError(
                BgLogTag.INJECTION,
                `Post-injection verification INCOMPLETE on tab ${tabId}: ` +
                `sdk=${r.marcoSdk} ext=${r.extRoot} mc=${r.mcClass} instance=${r.mcInstance} ui=${r.uiContainer}\n` +
                `Verify stack: ${r.verifyStack}`,
        );
        }
    } catch {
        // Verification is best-effort — never block the pipeline
    }
}

/* ------------------------------------------------------------------ */
/*  Loading spinner toast                                              */
/* ------------------------------------------------------------------ */

/**
 * Shows a loading spinner toast while injection is in progress.
 */
// eslint-disable-next-line max-lines-per-function
async function showInjectionLoadingToast(tabId: number, scriptCount: number): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            // eslint-disable-next-line max-lines-per-function
            func: (count: number, version: string) => {
                const CONTAINER_ID = "__marco-inject-toast";
                let container = document.getElementById(CONTAINER_ID);
                if (!container) {
                    container = document.createElement("div");
                    container.id = CONTAINER_ID;
                    container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
                    (document.body || document.documentElement).appendChild(container);
                }

                const toast = document.createElement("div");
                toast.id = "__marco-inject-toast-loading";
                toast.style.cssText = [
                    "pointer-events:auto",
                    "display:flex",
                    "align-items:center",
                    "gap:8px",
                    "padding:10px 16px",
                    "border-radius:10px",
                    "font-size:12px",
                    "font-weight:500",
                    "color:#bfdbfe",
                    "background:linear-gradient(135deg,#1e3a5f 0%,#1e293b 100%)",
                    "border:1px solid rgba(59,130,246,0.3)",
                    "box-shadow:0 8px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(59,130,246,0.1)",
                    "opacity:0",
                    "transform:translateY(12px) scale(0.96)",
                    "transition:all 0.35s cubic-bezier(0.16,1,0.3,1)",
                    "max-width:380px",
                    "backdrop-filter:blur(12px)",
                ].join(";") + ";";

                // CSS spinner
                const spinner = document.createElement("span");
                spinner.style.cssText = "display:inline-block;width:14px;height:14px;border:2px solid rgba(147,197,253,0.3);border-top-color:#93c5fd;border-radius:50%;flex-shrink:0;";
                const spinId = "__marco-spin-" + Date.now();
                spinner.id = spinId;
                const style = document.createElement("style");
                style.textContent = `@keyframes __marco-spin{to{transform:rotate(360deg)}}#${spinId}{animation:__marco-spin 0.7s linear infinite}`;
                toast.appendChild(style);

                const body = document.createElement("span");
                body.textContent = `Marco v${version} — injecting ${count} script${count !== 1 ? "s" : ""}…`;

                toast.appendChild(spinner);
                toast.appendChild(body);
                container.appendChild(toast);

                requestAnimationFrame(() => {
                    toast.style.opacity = "1";
                    toast.style.transform = "translateY(0) scale(1)";
                });

                // Safety: auto-dismiss after 10s if success/error toast never fires
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.style.opacity = "0";
                        toast.style.transform = "translateY(8px) scale(0.96)";
                        setTimeout(() => toast.remove(), 350);
                    }
                }, 10000);
            },
            args: [scriptCount, EXTENSION_VERSION],
        });
    } catch (e) {
        logCaughtError(BgLogTag.INJECTION, "showInjectionLoadingToast failed", e);
    }
}
