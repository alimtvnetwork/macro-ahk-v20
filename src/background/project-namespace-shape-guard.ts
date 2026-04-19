/**
 * Per-Project Namespace Shape — Runtime Guard
 *
 * Pairs with the type contract in
 *   `standalone-scripts/types/project-namespace-shape.d.ts`
 *
 * `assertEmittedShape()` is called by the IIFE builder on every generated
 * script so any drift between the documented `ProjectNamespace` and the
 * actually-emitted JS source fails the build immediately.
 *
 * Kept in `src/background/` (not in `standalone-scripts/types/`) so that
 * the SDK build's `rootDir` does not pull in a runtime module.
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 */

/**
 * Ordered list of top-level keys both implementations MUST emit.
 * Mirrors `keyof ProjectNamespace` exactly. Update both together.
 */
export const PROJECT_NAMESPACE_KEYS: ReadonlyArray<keyof ProjectNamespace> = [
    "vars",
    "urls",
    "xpath",
    "cookies",
    "kv",
    "files",
    "meta",
    "log",
    "scripts",
    "db",
    "api",
    "notify",
    "docs",
] as const;

/**
 * Build-time guard for the IIFE generator: confirms the emitted JS source
 * declares every required top-level sub-namespace.
 *
 * Throws with an exact missing-key list — code-red friendly.
 */
export function assertEmittedShape(emittedSource: string, where: string): void {
    const missing: string[] = [];
    for (const key of PROJECT_NAMESPACE_KEYS) {
        // Match `key: ` at the start of an object property — tolerant of
        // surrounding whitespace and Object.freeze(...) wrapping.
        const re = new RegExp(`(^|[\\s,{])${key}\\s*:`, "m");
        if (!re.test(emittedSource)) missing.push(key);
    }
    if (missing.length > 0) {
        throw new Error(
            `[project-namespace-shape] Emitted IIFE in ${where} is missing required sub-namespaces: ${missing.join(", ")}. ` +
                `Required keys: ${PROJECT_NAMESPACE_KEYS.join(", ")}. ` +
                `Update the generator and the matching self-namespace.ts implementation together.`,
        );
    }
}
