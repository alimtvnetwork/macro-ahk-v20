/**
 * Marco Extension — Injection Handler
 *
 * Handles INJECT_SCRIPTS and GET_TAB_INJECTIONS messages.
 * Uses chrome.scripting.executeScript with error isolation wrappers.
 * See spec 12-project-model-and-url-rules and 20-user-script-error-isolation.
 * Before user scripts run, platform session cookies are seeded into localStorage.
 *
 * Dependency resolution: When the active project has dependencies,
 * dependency scripts are prepended in topological order (globals first).
 * See: src/background/dependency-resolver.ts
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { InjectableScript, InjectionResult, SkipReason } from "../../shared/injection-types";
import type { StoredProject } from "../../shared/project-types";
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
import { handleFileList, handleFileGet } from "./file-storage-handler";
import { generateLlmGuide } from "../../lib/generate-llm-guide";
import { toCodeName, slugify } from "../../lib/slug-utils";

/* ------------------------------------------------------------------ */
/*  INJECT_SCRIPTS                                                     */
/* ------------------------------------------------------------------ */

/** Injects scripts into the specified tab with error isolation. */
export async function handleInjectScripts(
    message: MessageRequest,
): Promise<{ results: InjectionResult[] }> {
    const msg = message as MessageRequest & {
        tabId: number;
        scripts: unknown[];
    };

    console.log("[injection] ── PIPELINE START ── tabId=%d, raw scripts=%d", msg.tabId, msg.scripts.length);

    // Stage 0: Dependency resolution — prepend dependency project scripts
    const scriptsWithDeps = await prependDependencyScripts(msg.scripts);
    console.log("[injection] 0/4 DEPS     — %d scripts after dependency resolution (was %d)",
        scriptsWithDeps.length, msg.scripts.length);

    // Stage 1: Resolve
    const resolveStart = performance.now();
    const { prepared: preparedScripts, skipped: skippedScripts } = await resolveInjectionRequestScripts(scriptsWithDeps);
    const sorted = preparedScripts.map((entry) => entry.injectable);
    console.log("[injection] 1/4 RESOLVE  — %d scripts resolved, %d skipped in %.1fms: [%s]",
        sorted.length,
        skippedScripts.length,
        performance.now() - resolveStart,
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

    if (sorted.length === 0) {
        console.log("[injection] ── PIPELINE END ── no executable scripts, returning %d skip results", skipResults.length);
        return { results: skipResults };
    }

    // Stage 1.5: Bootstrap RiseupAsiaMacroExt root in MAIN world (must succeed)
    await bootstrapNamespaceRoot(msg.tabId);

    // Stage 2a: Ensure message relay content script is present
    await ensureRelayInjected(msg.tabId);

    // Stage 2b: Token seeding
    const seedStart = performance.now();
    await seedTokensIntoTab(msg.tabId);
    console.log("[injection] 2/4 SEED     — token seeding completed in %.1fms", performance.now() - seedStart);

    // Stage 3 & 4: Wrap + Execute (per-script)
    const execResults = await injectAllScripts(msg.tabId, preparedScripts);

    // Stage 5a: Settings namespace registration
    await injectSettingsNamespace(msg.tabId);

    // Stage 5b: Per-project namespace registration
    await injectProjectNamespaces(msg.tabId);

    const results = [...skipResults, ...execResults];

    console.log("[injection] ── PIPELINE END ── %d/%d succeeded, %d skipped",
        execResults.filter((r) => r.isSuccess).length, execResults.length, skipResults.length);

    const lastSuccess = execResults.find((r) => r.isSuccess);
    const lastSuccessPath = lastSuccess?.injectionPath;
    const lastDomTarget = lastSuccess?.domTarget;
    recordInjection(msg.tabId, sorted, lastSuccessPath, lastDomTarget);
    return { results };
}


/** Injects each script sequentially, collecting results. */
async function injectAllScripts(
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

/** Injects one script into a tab and logs the result. */
async function injectSingleScript(
    tabId: number,
    script: InjectableScript,
    resolvedConfigJson: string | null,
    resolvedThemeJson: string | null,
): Promise<InjectionResult> {
    const startTime = Date.now();
    const configJson = resolvedConfigJson;
    const projectId = getActiveProjectId() ?? undefined;

    // ── CSS injection (before JS) — see spec/16-standalone-script-assets-pipeline.md §6 ──
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
            console.warn("[injection] CSS      — \"%s\" failed to inject %s: %s",
                script.name, script.assets.css,
                cssError instanceof Error ? cssError.message : String(cssError));
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

        await logInjectionSuccess(script, projectId);
        return buildSuccessResult(script.id, startTime, execResult.path, execResult.domTarget);
    } catch (injectionError) {
        console.error("[injection] 4/4 EXECUTE  — \"%s\" ❌ failed: %s",
            script.name, injectionError instanceof Error ? injectionError.message : String(injectionError));

        await logInjectionFailure(script, projectId, injectionError);
        return buildErrorResult(script.id, startTime, injectionError);
    }
}

/** Logs a successful script injection to the logs DB. */
async function logInjectionSuccess(
    script: InjectableScript,
    projectId: string | undefined,
): Promise<void> {
    const codeSnippet = script.code.slice(0, 200);

    try {
        await handleLogEntry({
            type: "LOG_ENTRY",
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: `Injected "${script.name}" (${script.code.length} chars): ${codeSnippet}`,
            scriptId: script.id,
            projectId,
            configId: script.configBinding,
        } as MessageRequest);
    } catch (loggingError) {
        const reason = loggingError instanceof Error
            ? loggingError.message
            : String(loggingError);

        console.warn("[injection] logInjectionSuccess skipped: %s", reason);
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

        console.warn("[injection] logInjectionFailure skipped: %s", reason);
    }
}


/** Executes wrapped code in the specified tab using CSP-aware fallback. */
async function executeInTab(tabId: number, code: string): Promise<{ path: string; domTarget?: string }> {
    const result = await injectWithCspFallback(tabId, code, "MAIN");

    if (!result.isSuccess) {
        throw new Error(result.errorMessage ?? "Injection failed in MAIN and ISOLATED worlds.");
    }

    if (result.isFallback) {
        console.warn(
            "[injection] ⚠️ Script executed via %s fallback (tab %d) — window.marco created in non-MAIN world, " +
            "RiseupAsiaMacroExt.Projects.* may not be accessible from the page console.",
            result.world, tabId,
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

    console.error(`[injection] Script ${scriptId} failed: ${errorMessage}`);

    return {
        scriptId,
        isSuccess: false,
        errorMessage,
        durationMs: Date.now() - startTime,
    };
}

/** Records the injection in the state manager. */
function recordInjection(tabId: number, scripts: InjectableScript[], injectionPath?: string, domTarget?: string): void {
    const scriptIds = scripts.map((s) => s.id);
    const projectId = getActiveProjectId() ?? "";

    setTabInjection(tabId, {
        scriptIds,
        timestamp: new Date().toISOString(),
        projectId,
        matchedRuleId: "",
        injectionPath,
        domTarget,
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
    const bootstrapCode = `;(function(){
if(!window.RiseupAsiaMacroExt){window.RiseupAsiaMacroExt={Projects:{}};}
else if(!window.RiseupAsiaMacroExt.Projects){window.RiseupAsiaMacroExt.Projects={};}
})();`;

    try {
        // Attempt MAIN world ONLY — no fallback. This is a hard requirement.
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (code: string) => {
                const s = document.createElement("script");
                s.textContent = code;
                (document.head || document.documentElement).appendChild(s);
                s.remove();
            },
            args: [bootstrapCode],
            world: "MAIN" as chrome.scripting.ExecutionWorld,
        });
        console.log("[injection:bootstrap] ✅ RiseupAsiaMacroExt root bootstrapped in MAIN world (tab %d)", tabId);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
            "[injection:bootstrap] ❌ CRITICAL — Failed to bootstrap RiseupAsiaMacroExt in MAIN world (tab %d): %s\n" +
            "  → Developer Guide console access (RiseupAsiaMacroExt.Projects.*) will NOT work.\n" +
            "  → CSP on this page is blocking inline scripts in the MAIN world.",
            tabId, msg,
        );
        transitionHealth("DEGRADED", "RiseupAsiaMacroExt MAIN world bootstrap blocked by CSP");

        // Also inject a visible console warning into the page
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    console.error(
                        "%c[Marco Extension] ⚠️ MAIN world namespace blocked by CSP",
                        "color: red; font-weight: bold; font-size: 14px;",
                        "\n\nRiseupAsiaMacroExt.Projects.* will NOT be available in the console.",
                        "\nThis page's Content Security Policy is blocking inline script execution.",
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
async function injectSettingsNamespace(tabId: number): Promise<void> {
    try {
        const { settings } = await handleGetSettings();
        const activeId = getActiveProjectId();
        let allProjects: StoredProject[] = [];
        try { allProjects = await readAllProjects(); } catch { /* empty */ }
        const activeProject = activeId ? allProjects.find((p) => p.id === activeId) : undefined;
        const codeName = activeProject
            ? (activeProject.codeName || toCodeName(activeProject.slug || slugify(activeProject.name)))
            : "Default";
        const slug = activeProject
            ? (activeProject.slug || slugify(activeProject.name))
            : "default";
        const llmGuide = generateLlmGuide(codeName, slug);
        const script = buildSettingsNamespaceScript(settings, llmGuide);
        const result = await injectWithCspFallback(tabId, script, "MAIN");
        if (result.isFallback) {
            console.error(
                "[injection:settings] ⚠️ CRITICAL — Settings namespace injected via %s fallback (tab %d).\n" +
                "  → RiseupAsiaMacroExt.Settings will NOT be visible in the page console.\n" +
                "  → CSP on this page blocked MAIN world injection.",
                result.world, tabId,
            );
            transitionHealth("DEGRADED", "Settings namespace fell back to " + result.world + " — not visible in MAIN world");
        } else {
            console.log("[injection:settings] Registered RiseupAsiaMacroExt.Settings + docs (port=%d)", settings.broadcastPort);
        }
    } catch (err) {
        console.warn("[injection:settings] Failed to register settings namespace: %s",
            err instanceof Error ? err.message : String(err));
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
async function injectProjectNamespaces(tabId: number): Promise<void> {
    const activeId = getActiveProjectId();
    if (!activeId) return;

    let allProjects: StoredProject[];
    try {
        allProjects = await readAllProjects();
    } catch {
        console.warn("[injection:ns] Failed to read projects for namespace registration");
        return;
    }

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

    for (const pid of projectIds) {
        const project = allProjects.find((p) => p.id === pid);
        if (!project) continue;

        const projectSlug = project.slug || slugify(project.name);
        const codeName = project.codeName || toCodeName(projectSlug);

        // Pre-load file cache for sync access
        let fileCache: Array<{ name: string; data: string }> = [];
        try {
            const { files: fileList } = await handleFileList({ projectId: pid });
            // Limit to first 50 files to avoid oversized IIFE
            const filesToLoad = fileList.slice(0, 50);
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
        } catch {
            fileCache = [];
        }

        const nsScript = buildProjectNamespaceScript({
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

        try {
            const nsResult = await injectWithCspFallback(tabId, nsScript, "MAIN");
            if (nsResult.isFallback) {
                console.error(
                    "[injection:ns] ⚠️ CRITICAL — Namespace \"%s\" (codeName=%s) injected via %s fallback (tab %d).\n" +
                    "  → RiseupAsiaMacroExt.Projects.%s will NOT be visible in the page console.\n" +
                    "  → CSP on this page blocked MAIN world injection.",
                    project.name, codeName, nsResult.world, tabId, codeName,
                );
                transitionHealth("DEGRADED", `Project namespace ${codeName} fell back to ${nsResult.world} — not visible in MAIN world`);
            } else {
                console.log("[injection:ns] Registered namespace for \"%s\" (codeName=%s)", project.name, codeName);
            }
        } catch (err) {
            console.error("[injection:ns] ❌ Failed to register namespace for \"%s\" (codeName=%s): %s",
                project.name, codeName, err instanceof Error ? err.message : String(err));
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
async function prependDependencyScripts(callerScripts: unknown[]): Promise<unknown[]> {
    const activeId = getActiveProjectId();
    if (!activeId) return callerScripts;

    let allProjects: StoredProject[];
    try {
        allProjects = await readAllProjects();
    } catch {
        console.warn("[injection:deps] Failed to read projects for dependency resolution");
        return callerScripts;
    }

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
        console.error("[injection:deps] Dependency resolution failed: %s", resolution.errorMessage);
        // Even on failure, still prepend global project scripts
        return [...collectGlobalScripts(globalProjects), ...callerScripts];
    }

    // Step 4: Collect scripts in resolved order (skip active project)
    const depScripts: unknown[] = [];
    for (const projectId of resolution.order) {
        if (projectId === activeId) continue;
        const depProject = allProjects.find((p) => p.id === projectId);
        if (!depProject?.scripts?.length) continue;

        const baseOrder = -1000 + depScripts.length;
        for (const script of depProject.scripts) {
            depScripts.push({
                ...script,
                order: baseOrder + script.order,
            });
        }

        console.log("[injection:deps] Prepending %d scripts from %s \"%s\" (id=%s)",
            depProject.scripts.length,
            depProject.isGlobal ? "global" : "dependency",
            depProject.name, depProject.id);
    }

    if (depScripts.length === 0) return callerScripts;

    console.log("[injection:deps] Total: %d dependency scripts + %d caller scripts",
        depScripts.length, callerScripts.length);

    return [...depScripts, ...callerScripts];
}

/** Fallback: collects scripts from global projects when topological sort fails. */
function collectGlobalScripts(globalProjects: StoredProject[]): unknown[] {
    const scripts: unknown[] = [];
    for (const gp of globalProjects) {
        if (!gp.scripts?.length) continue;
        const baseOrder = -2000 + scripts.length;
        for (const script of gp.scripts) {
            scripts.push({ ...script, order: baseOrder + script.order });
        }
    }
    return scripts;
}

/* ------------------------------------------------------------------ */
/*  Relay Injection (safety net for content_scripts manifest entry)     */
/* ------------------------------------------------------------------ */

const relayInjectedTabs = new Set<number>();

interface RelayHealthResult {
    hasSentinel: boolean;
    isRuntimeHealthy: boolean;
}

/**
 * Ensures the message-relay content script is running in the tab.
 * The relay is normally injected via manifest content_scripts, but
 * this acts as a safety net if the tab was loaded before the extension
 * was installed/updated.
 */
async function ensureRelayInjected(tabId: number): Promise<void> {
    if (relayInjectedTabs.has(tabId)) {
        return;
    }

    try {
        const relayHealth = await probeRelayHealth(tabId);

        if (relayHealth.hasSentinel && relayHealth.isRuntimeHealthy) {
            relayInjectedTabs.add(tabId);
            return;
        }

        if (relayHealth.hasSentinel && !relayHealth.isRuntimeHealthy) {
            console.warn("[injection] Relay sentinel exists but runtime is stale in tab %d — reinjecting", tabId);

            await chrome.scripting.executeScript({
                target: { tabId },
                world: "ISOLATED",
                func: () => {
                    delete (window as unknown as Record<string, unknown>).__marcoRelayActive;
                },
            });
        }

        // Inject the relay content script
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            files: ["content-scripts/message-relay.js"],
        });

        const postInjectHealth = await probeRelayHealth(tabId);

        if (!postInjectHealth.isRuntimeHealthy) {
            console.warn("[injection] Relay reinjection completed but runtime ping still failed in tab %d", tabId);
        }

        relayInjectedTabs.add(tabId);
        console.log("[injection] Message relay injected into tab %d (safety net)", tabId);
    } catch (relayError) {
        const reason = relayError instanceof Error ? relayError.message : String(relayError);
        console.warn("[injection] Failed to inject message relay: %s", reason);
    }
}

async function probeRelayHealth(tabId: number): Promise<RelayHealthResult> {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: async () => {
                const hasSentinel = !!(window as unknown as Record<string, unknown>).__marcoRelayActive;
                let isRuntimeHealthy = false;

                try {
                    const ping = await chrome.runtime.sendMessage({ type: "__PING__" });
                    isRuntimeHealthy = typeof ping === "object"
                        && ping !== null
                        && (ping as { isOk?: boolean }).isOk === true;
                } catch {
                    isRuntimeHealthy = false;
                }

                return { hasSentinel, isRuntimeHealthy };
            },
        });

        const raw = result?.result as RelayHealthResult | undefined;

        if (raw) {
            return raw;
        }
    } catch {
        // fall through
    }

    return { hasSentinel: false, isRuntimeHealthy: false };
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
