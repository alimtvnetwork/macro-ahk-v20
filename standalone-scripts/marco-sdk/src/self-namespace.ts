/**
 * Riseup Macro SDK — Self-Namespace Registration
 *
 * Registers `window.RiseupAsiaMacroExt.Projects.RiseupMacroSdk` at SDK
 * init time so the documented per-project namespace exists at runtime
 * even though the SDK itself is not a "user project" in storage.
 *
 * Mirrors the runtime shape produced by
 *   src/background/project-namespace-builder.ts
 * but wired directly to the in-scope `marco.*` modules — no proxy stub,
 * no late-binding lookup.
 *
 * Shape contract: `standalone-scripts/types/project-namespace-shape.ts`
 * — both this file and `src/background/project-namespace-builder.ts`
 * MUST produce a value satisfying `ProjectNamespace`.
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 */

import { NamespaceLogger } from "./logger";
/* `ProjectNamespace` is a global ambient interface declared in
   `standalone-scripts/types/project-namespace-shape.d.ts` — no import needed. */

interface MarcoLike {
    config?: {
        get: (k: string) => Promise<unknown>;
        set: (k: string, v: unknown) => Promise<void>;
        getAll: () => Promise<Record<string, unknown>>;
    };
    cookies?: {
        get: (name: string) => Promise<string | null>;
        getAll: () => Promise<Record<string, string>>;
    };
    xpath?: { getChatBox: () => Element | null };
    kv: {
        get: (k: string) => Promise<unknown>;
        set: (k: string, v: unknown) => Promise<void>;
        delete: (k: string) => Promise<void>;
        list: () => Promise<string[]>;
    };
    files?: {
        save: (n: string, d: string) => Promise<void>;
        read: (n: string) => Promise<string>;
        list: () => Promise<string[]>;
    };
    notify?: {
        toast: (msg: string, level?: string, opts?: unknown) => unknown;
        dismiss: (id: string) => unknown;
        dismissAll: () => unknown;
        onError: (cb: (e: unknown) => void) => unknown;
        getRecentErrors: () => unknown[];
    };
    version?: string;
}

const SDK_CODE_NAME = "RiseupMacroSdk";
const SDK_SLUG = "riseup-macro-sdk";
const SDK_PROJECT_ID = "marco-sdk";

export function registerSdkSelfNamespace(marco: MarcoLike, version: string): void {
    const win = window as unknown as Record<string, unknown>;
    const root = win.RiseupAsiaMacroExt as
        | { Projects?: Record<string, unknown>; Settings?: { Broadcast?: { BaseUrl?: string } } }
        | undefined;

    if (!root) {
        NamespaceLogger.warn(
            "registerSdkSelfNamespace",
            "RiseupAsiaMacroExt root missing — cannot register RiseupMacroSdk namespace",
        );
        return;
    }
    if (!root.Projects) root.Projects = {};

    /* If a real project namespace already registered itself (rare collision),
       respect it — never clobber a fully-built per-project runtime. */
    const existing = root.Projects[SDK_CODE_NAME] as { _internal?: unknown } | undefined;
    if (existing && existing._internal) {
        console.log(
            "[marco-sdk] Preserved existing RiseupAsiaMacroExt.Projects.RiseupMacroSdk runtime namespace",
        );
        return;
    }

    const apiBase =
        (root.Settings && root.Settings.Broadcast && root.Settings.Broadcast.BaseUrl) ||
        "http://localhost:19280";

    const ns: ProjectNamespace = Object.freeze({
        vars: Object.freeze({
            get: (k: string) =>
                marco.config ? marco.config.get(k) : Promise.reject(new Error("no config")),
            set: (k: string, v: unknown) =>
                marco.config ? marco.config.set(k, v) : Promise.reject(new Error("no config")),
            getAll: () =>
                marco.config ? marco.config.getAll() : Promise.reject(new Error("no config")),
        }),
        urls: Object.freeze({
            getMatched: () => null,
            listOpen: () => [],
            getVariables: () => ({}),
        }),
        xpath: Object.freeze({
            getChatBox: () => (marco.xpath ? marco.xpath.getChatBox() : null),
        }),
        cookies: Object.freeze({
            bindings: Object.freeze([] as Array<{ cookieName: string; url: string; role: string }>),
            get: (name: string) =>
                marco.cookies ? marco.cookies.get(name) : Promise.resolve(null),
            getByRole: () => Promise.resolve(null),
            getSessionToken: () => Promise.resolve(null),
            getAll: () => (marco.cookies ? marco.cookies.getAll() : Promise.resolve({})),
        }),
        kv: Object.freeze({
            get: (k: string) => marco.kv.get(k),
            set: (k: string, v: unknown) => marco.kv.set(k, v),
            delete: (k: string) => marco.kv.delete(k),
            list: () => marco.kv.list(),
        }),
        files: Object.freeze({
            save: (n: string, d: string) =>
                marco.files ? marco.files.save(n, d) : Promise.reject(new Error("no files api")),
            read: (n: string) =>
                marco.files ? marco.files.read(n) : Promise.reject(new Error("no files api")),
            list: () =>
                marco.files ? marco.files.list() : Promise.reject(new Error("no files api")),
            cache: Object.freeze({}),
        }),
        meta: Object.freeze({
            name: "Rise Up Macro SDK",
            version: version,
            slug: SDK_SLUG,
            codeName: SDK_CODE_NAME,
            id: SDK_PROJECT_ID,
            description: "Core SDK — creates and freezes window.marco namespace",
            dependencies: Object.freeze([]),
        }),
        log: Object.freeze({
            info: (msg: string) => console.log("[RiseupMacroSdk]", msg),
            warn: (msg: string) => console.warn("[RiseupMacroSdk]", msg),
            error: (msg: string) => console.error("[RiseupMacroSdk]", msg),
        }),
        scripts: Object.freeze([]),
        db: Object.freeze({
            table: () =>
                Object.freeze({
                    findMany: () => Promise.reject(new Error("SDK has no project DB")),
                    create: () => Promise.reject(new Error("SDK has no project DB")),
                    update: () => Promise.reject(new Error("SDK has no project DB")),
                    delete: () => Promise.reject(new Error("SDK has no project DB")),
                    count: () => Promise.reject(new Error("SDK has no project DB")),
                }),
        }),
        api: Object.freeze({
            kv: Object.freeze({
                get: (k: string) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/kv/${encodeURIComponent(k)}`).then(r => r.json()),
                set: (k: string, v: unknown) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/kv/${encodeURIComponent(k)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ value: v }),
                    }).then(r => r.json()),
                delete: (k: string) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/kv/${encodeURIComponent(k)}`, {
                        method: "DELETE",
                    }).then(r => r.json()),
                list: () =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/kv`).then(r => r.json()),
            }),
            files: Object.freeze({
                save: (n: string, d: string) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/files/${encodeURIComponent(n)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: d }),
                    }).then(r => r.json()),
                read: (n: string) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/files/${encodeURIComponent(n)}`).then(r => r.json()),
                list: () =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/files`).then(r => r.json()),
            }),
            db: Object.freeze({
                query: (table: string, method: string, params: unknown) =>
                    fetch(`${apiBase}/projects/${SDK_PROJECT_ID}/db/${encodeURIComponent(table)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ method, params }),
                    }).then(r => r.json()),
            }),
        }),
        notify: Object.freeze({
            toast: (msg: string, level?: string, opts?: unknown) =>
                marco.notify ? marco.notify.toast(msg, level, opts) : console.log("[RiseupMacroSdk]", msg),
            dismiss: (id: string) => (marco.notify ? marco.notify.dismiss(id) : undefined),
            dismissAll: () => (marco.notify ? marco.notify.dismissAll() : undefined),
            onError: (cb: (e: unknown) => void) =>
                marco.notify ? marco.notify.onError(cb) : undefined,
            getRecentErrors: () => (marco.notify ? marco.notify.getRecentErrors() : []),
        }),
        docs: Object.freeze({
            overview:
                "RiseupAsiaMacroExt.Projects.RiseupMacroSdk — Self-registered SDK namespace exposing the same surface as user-project namespaces, backed directly by window.marco.*",
        }),
    });

    root.Projects[SDK_CODE_NAME] = ns;
    console.log("[marco-sdk] Registered RiseupAsiaMacroExt.Projects.RiseupMacroSdk");
}
