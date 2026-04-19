/**
 * Shared global type declarations for the RiseupAsiaMacroExt SDK namespace.
 *
 * This file is the single source of truth for `window.RiseupAsiaMacroExt.*`
 * across all standalone-scripts projects (marco-sdk, macro-controller, xpath, ...).
 *
 * Conventions:
 *   - No `any`. No bare `unknown` in public API surface.
 *   - Generic `<T>` escape hatches are placed only at extensible leaves
 *     (e.g. ProjectMeta extension fields, KV store value types).
 *   - Per-project namespaces extend `RiseupAsiaProjectBase<TApi, TInternal>`
 *     so each project can declare its own typed `api` / `_internal` shape.
 *
 * Do NOT add `unknown` index signatures here unless you also update the
 * Unknown Usage Policy memory and document the leaf-only justification.
 */

export {};

declare global {
    /* ============================================================= *
     *  Logger contract                                                *
     * ============================================================= */

    interface RiseupAsiaLogger {
        error(fn: string, msg: string, error?: unknown): void;
        warn(fn: string, msg: string): void;
        info(fn: string, msg: string): void;
        debug(fn: string, msg: string): void;
        console(fn: string, msg: string, ...args: unknown[]): void;
        stackTrace(fn: string, msg: string, error?: unknown): void;
    }

    /* ============================================================= *
     *  Cookie binding contract                                        *
     * ============================================================= */

    interface RiseupAsiaCookieBinding {
        cookieName?: string;
        url?: string;
        role?: string;
    }

    /* ============================================================= *
     *  Project meta — read-only identity                              *
     * ============================================================= */

    interface RiseupAsiaProjectMeta {
        id?: string;
        name?: string;
        slug?: string;
        codeName?: string;
        version?: string;
        displayName?: string;
        description?: string;
        dependencies?: ReadonlyArray<{ projectId: string; version: string }>;
    }

    /* ============================================================= *
     *  Generic project base — every per-project namespace extends    *
     *  this with its own typed `api` and `_internal` shapes.         *
     * ============================================================= */

    interface RiseupAsiaProjectBase<
        TApi extends object = Record<string, never>,
        TInternal extends object = Record<string, never>,
    > {
        meta: RiseupAsiaProjectMeta;
        api: TApi;
        _internal: TInternal;
        cookies?: { bindings?: ReadonlyArray<RiseupAsiaCookieBinding> };
    }

    /**
     * Default project shape used by the generic namespace builder.
     * Concrete projects (e.g. MacroController) override `api` / `_internal`
     * via their own typed namespace declaration.
     */
    type RiseupAsiaProject = RiseupAsiaProjectBase;

    /* ============================================================= *
     *  Root namespace                                                 *
     * ============================================================= */

    interface RiseupAsiaMacroExtNamespace {
        Logger?: RiseupAsiaLogger;
        Projects?: Record<string, RiseupAsiaProject | undefined>;
        Settings?: {
            Broadcast?: { BaseUrl?: string };
        };
    }

    /**
     * Bare global access — no `window.` prefix needed in consumer code.
     * The namespace is bootstrapped by the SDK before any project scripts run.
     */
    const RiseupAsiaMacroExt: RiseupAsiaMacroExtNamespace | undefined;
}
