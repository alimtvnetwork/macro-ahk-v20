/**
 * Marco Extension — Injection Request Resolver
 *
 * Normalizes popup injection requests into executable scripts.
 * Returns both resolved scripts and skipped entries with reasons.
 */

import type { InjectableScript, SkipReason } from "../../shared/injection-types";
import type { ScriptEntry } from "../../shared/project-types";
import type { ScriptBindingResolved } from "../../shared/types";
import { resolveScriptBindings, type SkippedScript } from "../script-resolver";

/** Executable script plus its resolved config and theme JSON payloads. */
export interface PreparedInjectionScript {
    injectable: InjectableScript;
    configJson: string | null;
    themeJson: string | null;
}

/** Full resolution result from the request resolver. */
export interface InjectionResolveResult {
    prepared: PreparedInjectionScript[];
    skipped: SkippedScript[];
}

/** Resolves popup-provided scripts into executable injection inputs. */
export async function resolveInjectionRequestScripts(
    scripts: unknown[],
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
        console.warn("[injection:resolve] %d scripts failed type check (resolver mismatch)", mismatched);
        for (let i = 0; i < scripts.length; i++) {
            if (!isInjectableScript(scripts[i])) {
                const raw = scripts[i] as Record<string, unknown>;
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
            })),
        ),
        skipped,
    };
}

/** Resolves stored project script entries through the script store. */
async function resolveProjectEntryScripts(
    entries: ScriptEntry[],
): Promise<InjectionResolveResult> {
    const bindings = buildScriptBindings(entries);
    const { resolved, skipped } = await resolveScriptBindings(bindings);

    return {
        prepared: sortPreparedScripts(
            resolved.map(({ injectable, configJson, themeJson }) => ({
                injectable,
                configJson,
                themeJson,
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
function isProjectScriptEntry(value: unknown): value is ScriptEntry {
    return typeof value === "object"
        && value !== null
        && typeof (value as ScriptEntry).path === "string"
        && typeof (value as ScriptEntry).order === "number"
        && !("code" in (value as Record<string, unknown>));
}

/** Returns true when the value is already an executable injection script. */
function isInjectableScript(value: unknown): value is InjectableScript {
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
