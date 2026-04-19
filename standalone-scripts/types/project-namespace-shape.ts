/**
 * Per-Project Namespace Shape — Single Source of Truth
 *
 * Both the runtime self-namespace registration in
 *   `standalone-scripts/marco-sdk/src/self-namespace.ts`
 * and the IIFE generator in
 *   `src/background/project-namespace-builder.ts`
 * MUST produce a value matching `ProjectNamespace` exactly.
 *
 * If you add, rename, or change a sub-namespace here:
 *   1. Update `self-namespace.ts` so the SDK self-namespace still satisfies
 *      `ProjectNamespace`.
 *   2. Update the string-emitting IIFE in `project-namespace-builder.ts` and
 *      its `assertEmittedShape()` companion below.
 *   3. Update `spec/12-devtools-and-injection/developer-guide/04-sdk-namespace.md`.
 *
 * Why a `.ts` file (not `.d.ts`)?
 *   We need both the type AND a runtime helper (`assertEmittedShape`) the
 *   builder can call against a fixture object to keep the two sides aligned
 *   at compile time.
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 */

/* ============================================================= *
 *  Sub-namespace shapes                                          *
 * ============================================================= */

export interface NamespaceVarsApi {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
}

export interface NamespaceUrlRule {
    pattern: string;
    label: string;
}

export interface NamespaceOpenTab {
    id: number;
    url: string;
    title: string;
}

export interface NamespaceUrlsApi {
    getMatched: () => NamespaceUrlRule | null;
    listOpen: () => NamespaceOpenTab[];
    getVariables: () => Record<string, string>;
}

export interface NamespaceXPathApi {
    getChatBox: () => Element | null;
}

export interface NamespaceCookieBindingPublic {
    cookieName: string;
    url: string;
    role: string;
}

export interface NamespaceCookiesApi {
    bindings: ReadonlyArray<NamespaceCookieBindingPublic>;
    get: (nameOrRole: string) => Promise<string | null>;
    getByRole: (role: string) => Promise<string | null>;
    getSessionToken: () => Promise<string | null>;
    getAll: () => Promise<Record<string, string>>;
}

export interface NamespaceKvApi {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: () => Promise<string[]>;
}

export interface NamespaceFilesApi {
    save: (name: string, data: string) => Promise<void>;
    read: (name: string) => Promise<string>;
    list: () => Promise<string[]>;
    cache: Readonly<Record<string, string>>;
}

export interface NamespaceMetaDependency {
    projectId: string;
    version: string;
}

export interface NamespaceMeta {
    name: string;
    version: string;
    slug: string;
    codeName: string;
    id: string;
    description: string;
    dependencies: ReadonlyArray<NamespaceMetaDependency>;
}

export interface NamespaceLogApi {
    info: (msg: string, meta?: Record<string, unknown>) => unknown;
    warn: (msg: string, meta?: Record<string, unknown>) => unknown;
    error: (msg: string, meta?: Record<string, unknown>) => unknown;
}

export interface NamespaceScriptInfoPublic {
    name: string;
    order: number;
    isEnabled: boolean;
}

export interface NamespaceDbTable {
    findMany: (where?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: Record<string, unknown>) => Promise<unknown>;
    update: (where: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown>;
    delete: (where: Record<string, unknown>) => Promise<unknown>;
    count: (where?: Record<string, unknown>) => Promise<number>;
}

export interface NamespaceDbApi {
    table: (tableName: string) => NamespaceDbTable;
}

export interface NamespaceRestKvApi {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
    list: () => Promise<unknown>;
}

export interface NamespaceRestFilesApi {
    save: (name: string, data: string) => Promise<unknown>;
    read: (name: string) => Promise<unknown>;
    list: () => Promise<unknown>;
}

export interface NamespaceRestDbApi {
    query: (table: string, method: string, params: unknown) => Promise<unknown>;
}

export interface NamespaceRestApi {
    kv: NamespaceRestKvApi;
    files: NamespaceRestFilesApi;
    db: NamespaceRestDbApi;
}

export interface NamespaceNotifyApi {
    toast: (msg: string, level?: string, opts?: unknown) => unknown;
    dismiss: (id: string) => unknown;
    dismissAll: () => unknown;
    onError: (cb: (e: unknown) => void) => unknown;
    getRecentErrors: () => unknown[];
}

export interface NamespaceDocsApi {
    overview: string;
}

/* ============================================================= *
 *  Top-level namespace contract                                  *
 * ============================================================= */

export interface ProjectNamespace {
    vars: NamespaceVarsApi;
    urls: NamespaceUrlsApi;
    xpath: NamespaceXPathApi;
    cookies: NamespaceCookiesApi;
    kv: NamespaceKvApi;
    files: NamespaceFilesApi;
    meta: NamespaceMeta;
    log: NamespaceLogApi;
    scripts: ReadonlyArray<NamespaceScriptInfoPublic>;
    db: NamespaceDbApi;
    api: NamespaceRestApi;
    notify: NamespaceNotifyApi;
    docs: NamespaceDocsApi;
}

/**
 * Ordered list of top-level keys both implementations MUST emit.
 * The IIFE builder asserts its emitted source contains every key in this
 * list at build time so generator drift is caught immediately.
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
