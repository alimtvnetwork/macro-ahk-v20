/**
 * Riseup Macro SDK — Runtime Self-Test
 *
 * Validates that `RiseupAsiaMacroExt.Projects.RiseupMacroSdk` is correctly
 * registered and functional after SDK init. Runs once per page load.
 *
 * Checks performed:
 *  1. Namespace presence — Projects.RiseupMacroSdk exists
 *  2. .meta — required metadata fields present and version matches
 *  3. .kv.list() — round-trips a Promise without throwing synchronously
 *  4. Shape coverage — all 13 documented sub-namespaces are present
 *
 * Results are logged via NamespaceLogger as a single PASS / FAIL line so
 * regressions surface immediately in DevTools on every matched page load.
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 */

import { NamespaceLogger } from "./logger";

const FN = "sdkSelfTest";
const SDK_CODE_NAME = "RiseupMacroSdk";

const REQUIRED_KEYS = [
    "vars", "urls", "xpath", "cookies", "kv", "files",
    "meta", "log", "scripts", "db", "api", "notify", "docs",
] as const;

interface SelfTestResult {
    pass: boolean;
    failures: string[];
    checks: number;
}

export function runSdkSelfTest(expectedVersion: string): SelfTestResult {
    const failures: string[] = [];
    let checks = 0;

    const win = window as unknown as Record<string, unknown>;
    const root = win.RiseupAsiaMacroExt as
        | { Projects?: Record<string, unknown> }
        | undefined;

    /* Check 1 — Root + Projects map */
    checks++;
    if (!root || !root.Projects) {
        failures.push("RiseupAsiaMacroExt.Projects missing");
        return finalize(FN, failures, checks, expectedVersion);
    }

    /* Check 2 — Self-namespace registered */
    checks++;
    const ns = root.Projects[SDK_CODE_NAME] as Record<string, unknown> | undefined;
    if (!ns) {
        failures.push(`Projects.${SDK_CODE_NAME} not registered`);
        return finalize(FN, failures, checks, expectedVersion);
    }

    /* Check 3 — Shape coverage (all 13 sub-namespaces) */
    checks++;
    const missingKeys = REQUIRED_KEYS.filter((k) => !(k in ns));
    if (missingKeys.length > 0) {
        failures.push(`missing sub-namespaces: ${missingKeys.join(", ")}`);
    }

    /* Check 4 — meta fields + version match */
    checks++;
    const meta = ns.meta as
        | { version?: string; codeName?: string; id?: string; name?: string }
        | undefined;
    if (!meta) {
        failures.push(".meta missing");
    } else {
        if (meta.version !== expectedVersion) {
            failures.push(`.meta.version ${meta.version} ≠ expected ${expectedVersion}`);
        }
        if (meta.codeName !== SDK_CODE_NAME) {
            failures.push(`.meta.codeName ${meta.codeName} ≠ ${SDK_CODE_NAME}`);
        }
        if (!meta.id || !meta.name) {
            failures.push(".meta.id or .meta.name missing");
        }
    }

    /* Check 5 — kv.list() returns a Promise without throwing */
    checks++;
    const kv = ns.kv as { list?: () => unknown } | undefined;
    if (!kv || typeof kv.list !== "function") {
        failures.push(".kv.list is not a function");
    } else {
        try {
            const result = kv.list();
            if (!result || typeof (result as { then?: unknown }).then !== "function") {
                failures.push(".kv.list() did not return a Promise");
            } else {
                /* Swallow rejection — the contract is "returns a Promise without
                   throwing synchronously". A rejected promise (e.g. no KV API in
                   this context) is not a self-test failure. */
                (result as Promise<unknown>).catch(() => {
                    /* expected in environments without backend KV */
                });
            }
        } catch (err) {
            failures.push(`.kv.list() threw synchronously: ${(err as Error).message}`);
        }
    }

    return finalize(FN, failures, checks, expectedVersion);
}

function finalize(
    fn: string,
    failures: string[],
    checks: number,
    version: string,
): SelfTestResult {
    const pass = failures.length === 0;
    if (pass) {
        NamespaceLogger.info(
            fn,
            `PASS — Projects.${SDK_CODE_NAME} v${version} (${checks} checks)`,
        );
    } else {
        NamespaceLogger.error(
            fn,
            `FAIL — ${failures.length}/${checks} checks failed: ${failures.join("; ")}`,
        );
    }
    return { pass, failures, checks };
}
