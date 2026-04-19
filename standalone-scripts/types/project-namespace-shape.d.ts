/**
 * Per-Project Namespace Shape — Single Source of Truth (TYPES)
 *
 * Both the runtime self-namespace registration in
 *   `standalone-scripts/marco-sdk/src/self-namespace.ts`
 * and the IIFE generator in
 *   `src/background/project-namespace-builder.ts`
 * MUST produce a value matching `ProjectNamespace` exactly.
 *
 * Runtime helpers (`assertEmittedShape`, `PROJECT_NAMESPACE_KEYS`) live in
 *   `src/background/project-namespace-shape-guard.ts`
 * — they are only consumed by the IIFE builder, so they are kept out of
 * the SDK rootDir.
 *
 * If you add, rename, or change a sub-namespace here you MUST update:
 *   1. `standalone-scripts/marco-sdk/src/self-namespace.ts`
 *   2. The IIFE template in `src/background/project-namespace-builder.ts`
 *   3. `PROJECT_NAMESPACE_KEYS` in `project-namespace-shape-guard.ts`
 *   4. `spec/12-devtools-and-injection/developer-guide/04-sdk-namespace.md`
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 */

export {};

declare global {
    /* ============================================================= *
     *  Sub-namespace shapes                                          *
     * ============================================================= */

    interface NamespaceVarsApi {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        getAll: () => Promise<Record<string, unknown>>;
    }

    interface NamespaceUrlRule {
        pattern: string;
        label: string;
    }

    interface NamespaceOpenTab {
        id: number;
        url: string;
        title: string;
    }

    interface NamespaceUrlsApi {
        getMatched: () => NamespaceUrlRule | null;
        listOpen: () => NamespaceOpenTab[];
        getVariables: () => Record<string, string>;
    }

    interface NamespaceXPathApi {
        getChatBox: () => Element | null;
    }

    interface NamespaceCookieBindingPublic {
        cookieName: string;
        url: string;
        role: string;
    }

    interface NamespaceCookiesApi {
        bindings: ReadonlyArray<NamespaceCookieBindingPublic>;
        get: (nameOrRole: string) => Promise<string | null>;
        getByRole: (role: string) => Promise<string | null>;
        getSessionToken: () => Promise<string | null>;
        /**
         * Returns whatever the underlying SDK cookie module produces.
         * Concrete implementations (SDK self-namespace vs per-project IIFE)
         * may return either a `Record<string,string>` or richer
         * `CookieDetail[]` — callers should narrow as needed.
         */
        getAll: () => Promise<unknown>;
    }

    interface NamespaceKvApi {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        delete: (key: string) => Promise<void>;
        /**
         * Returns the project's KV entries. Concrete implementations may
         * yield either `string[]` (key list) or richer `{key,value}[]`
         * rows — callers should narrow as needed.
         */
        list: () => Promise<unknown>;
    }

    interface NamespaceFilesApi {
        save: (name: string, data: string) => Promise<unknown>;
        read: (name: string) => Promise<unknown>;
        list: () => Promise<unknown>;
        cache: Readonly<Record<string, string>>;
    }

    interface NamespaceMetaDependency {
        projectId: string;
        version: string;
    }

    interface NamespaceMeta {
        name: string;
        version: string;
        slug: string;
        codeName: string;
        id: string;
        description: string;
        dependencies: ReadonlyArray<NamespaceMetaDependency>;
    }

    interface NamespaceLogApi {
        info: (msg: string, meta?: Record<string, unknown>) => unknown;
        warn: (msg: string, meta?: Record<string, unknown>) => unknown;
        error: (msg: string, meta?: Record<string, unknown>) => unknown;
    }

    interface NamespaceScriptInfoPublic {
        name: string;
        order: number;
        isEnabled: boolean;
    }

    interface NamespaceDbTable {
        findMany: (where?: Record<string, unknown>) => Promise<unknown[]>;
        create: (data: Record<string, unknown>) => Promise<unknown>;
        update: (where: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown>;
        delete: (where: Record<string, unknown>) => Promise<unknown>;
        count: (where?: Record<string, unknown>) => Promise<number>;
    }

    interface NamespaceDbApi {
        table: (tableName: string) => NamespaceDbTable;
    }

    interface NamespaceRestKvApi {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<unknown>;
        delete: (key: string) => Promise<unknown>;
        list: () => Promise<unknown>;
    }

    interface NamespaceRestFilesApi {
        save: (name: string, data: string) => Promise<unknown>;
        read: (name: string) => Promise<unknown>;
        list: () => Promise<unknown>;
    }

    interface NamespaceRestDbApi {
        query: (table: string, method: string, params: unknown) => Promise<unknown>;
    }

    interface NamespaceRestApi {
        kv: NamespaceRestKvApi;
        files: NamespaceRestFilesApi;
        db: NamespaceRestDbApi;
    }

    interface NamespaceNotifyApi {
        toast: (msg: string, level?: string, opts?: unknown) => unknown;
        dismiss: (id: string) => unknown;
        dismissAll: () => unknown;
        onError: (cb: (e: unknown) => void) => unknown;
        getRecentErrors: () => unknown[];
    }

    interface NamespaceDocsApi {
        overview: string;
    }

    /* ============================================================= *
     *  Top-level namespace contract                                  *
     * ============================================================= */

    interface ProjectNamespace {
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
}
