/**
 * Marco Extension — Injection Request Resolver
 *
 * Normalizes popup injection requests into executable scripts.
 * Returns both resolved scripts and skipped entries with reasons.
 *
 * @see spec/05-chrome-extension/12-project-model-and-url-rules.md — Project model & URL matching
 * @see .lovable/memory/architecture/script-injection-pipeline-stages.md — Pipeline stages
 */

import type { InjectableScript, SkipReason } from "../../shared/injection-types";
import type { ScriptEntry } from "../../shared/project-types";
import type { ScriptBindingResolved } from "../../shared/types";
import { resolveScriptBindings, type SkippedScript } from "../script-resolver";
import { ensureBuiltinScriptsExist } from "../builtin-script-guard";
import { persistInjectionWarn } from "../injection-diagnostics";
import { readAllProjects } from "./project-helpers";
import { logBgWarnError, BgLogTag } from "../bg-logger";
import type { JsonRecord } from "./handler-types";

/** Executable script plus its resolved config and theme JSON payloads. */
export interface PreparedInjectionScript {
    injectable: InjectableScript;
    configJson: string | null;
    themeJson: string | null;
    /** Where the script code came from — for injection diagnostics. */
    codeSource: string | null;
}

/** Full resolution result from the request resolver. */
export interface InjectionResolveResult {
    prepared: PreparedInjectionScript[];
    skipped: SkippedScript[];
}

/** Resolves popup-provided scripts into executable injection inputs. */
// eslint-disable-next-line max-lines-per-function -- resolver with diagnostics logging
export async function resolveInjectionRequestScripts(
    scripts: Array<ScriptEntry | InjectableScript | Record<string, string | number | boolean | null>>,
): Promise<InjectionResolveResult> {
    const hasOnlyProjectEntries = scripts.length > 0 && scripts.every(isProjectScriptEntry);

    console.log("[injection:resolve] Input: %d scripts, isProjectEntries=%s",
        scripts.length, hasOnlyProjectEntries);

    if (hasOnlyProjectEntries) {
        const result = await resolveProjectEntryScripts(scripts as ScriptEntry[]);
        console.log("[injection:resolve] Resolved %d project entries → %d executable, %d skipped",
            scripts.length, result.prepared.length, result.skipped.length);
        return result;
    }

    const injectables = scripts.filter(isInjectableScript);
    const mismatched = scripts.length - injectables.length;
    const skipped: SkippedScript[] = [];

    if (mismatched > 0) {
        logBgWarnError(BgLogTag.INJECTION_RESOLVE, `${mismatched}/${scripts.length} scripts failed type check (missing 'id', 'code', or 'order'). These scripts will be SKIPPED silently unless fixed.`);
        void persistInjectionWarn(
            "REQUEST_RESOLVER_MISMATCH",
            `[injection:resolve] ${mismatched}/${scripts.length} popup script payload(s) failed type check and were skipped`,
        );
        for (let i = 0; i < scripts.length; i++) {
            if (!isInjectableScript(scripts[i])) {
                const raw = scripts[i] as Record<string, string | number | boolean | null>;
                skipped.push({
                    scriptId: String(raw?.id ?? raw?.path ?? `unknown-${i}`),
                    scriptName: String(raw?.name ?? raw?.path ?? `script-${i}`),
                    reason: "resolver_mismatch" as SkipReason,
                });
            }
        }
    }

    console.log("[injection:resolve] Passthrough: %d injectable scripts", injectables.length);
    return {
        prepared: sortPreparedScripts(
            injectables.map((injectable) => ({
                injectable,
                configJson: null,
                themeJson: null,
                codeSource: null,
            })),
        ),
        skipped,
    };
}

/** Resolves stored project script entries through the script store. */
async function resolveProjectEntryScripts(
    entries: ScriptEntry[],
): Promise<InjectionResolveResult> {
    // ✅ Self-heal: reseed missing built-in scripts before resolving
    // Without this, the popup "Run Scripts" path skips the guard that
    // the auto-injector applies, causing "script not found in store".
    // See: spec/17-app-issues/check-button/11-popup-injection-missing-guard.md
    const projects = await readAllProjects();
    await ensureBuiltinScriptsExist(projects);

    const bindings = buildScriptBindings(entries);
    const { resolved, skipped } = await resolveScriptBindings(bindings);

    return {
        prepared: sortPreparedScripts(
            resolved.map(({ injectable, configJson, themeJson, codeSource }) => ({
                injectable,
                configJson,
                themeJson,
                codeSource: codeSource ?? null,
            })),
        ),
        skipped,
    };
}

/** Converts project script entries into background script bindings. */
function buildScriptBindings(entries: ScriptEntry[]): ScriptBindingResolved[] {
    return entries.map((script) => ({
        scriptId: script.path,
        configId: script.configBinding ?? null,
        order: script.order,
        world: "MAIN",
        runAt: script.runAt ?? "document_idle",
    }));
}

/** Returns true when the value is a stored project script entry. */
function isProjectScriptEntry(value: ScriptEntry | InjectableScript | Record<string, string | number | boolean | null>): value is ScriptEntry {
    return typeof value === "object"
        && value !== null
        && typeof (value as ScriptEntry).path === "string"
        && typeof (value as ScriptEntry).order === "number"
        && !("code" in value);
}

/** Returns true when the value is already an executable injection script. */
function isInjectableScript(value: ScriptEntry | InjectableScript | Record<string, string | number | boolean | null>): value is InjectableScript {
    return typeof value === "object"
        && value !== null
        && typeof (value as InjectableScript).id === "string"
        && typeof (value as InjectableScript).code === "string"
        && typeof (value as InjectableScript).order === "number";
}

/** Sorts prepared scripts by execution order. */
function sortPreparedScripts(
    scripts: PreparedInjectionScript[],
): PreparedInjectionScript[] {
    return [...scripts].sort(
        (a, b) => a.injectable.order - b.injectable.order,
    );
}
