/**
 * Marco Extension — Per-Project Namespace Builder
 *
 * Generates a small IIFE that registers
 * `window.RiseupAsiaMacroExt.Projects.<CodeName>` with proxy methods
 * that delegate to `window.marco.*`.
 *
 * Injected after a project's scripts so they can immediately use the
 * documented per-project SDK API.
 *
 * See: spec/17-app-issues/66-sdk-global-object-missing.md
 * See: spec/05-chrome-extension/63-rise-up-macro-sdk.md
 * See: spec/17-app-issues/75-sdk-namespace-enrichment-and-developer-tooling.md
 *
 * Shape contract: `standalone-scripts/types/project-namespace-shape.ts`
 * — the emitted IIFE MUST produce a `ProjectNamespace`. The
 * `assertEmittedShape()` helper checks every required top-level key
 * is present in the generated source on every build.
 */

import {
    assertEmittedShape,
    PROJECT_NAMESPACE_KEYS,
} from "./project-namespace-shape-guard";

export { PROJECT_NAMESPACE_KEYS };

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NamespaceScriptInfo {
    name: string;
    order: number;
    isEnabled: boolean;
}

export interface NamespaceDependencyInfo {
    projectId: string;
    version: string;
}

export interface NamespaceFileCache {
    name: string;
    data: string;
}

export interface NamespaceCookieBinding {
    cookieName: string;
    url: string;
    role: string;
}

export interface NamespaceContext {
    codeName: string;
    slug: string;
    projectName: string;
    projectVersion: string;
    projectId: string;
    description?: string;
    dependencies?: NamespaceDependencyInfo[];
    scripts?: NamespaceScriptInfo[];
    /** Pre-loaded file contents for sync access via .files.cache */
    fileCache?: NamespaceFileCache[];
    /** Project cookie bindings for role-based resolution */
    cookieBindings?: NamespaceCookieBinding[];
}

/* ------------------------------------------------------------------ */
/*  Developer Guide Docs (embedded per sub-namespace)                  */
/* ------------------------------------------------------------------ */

function buildDocsObject(cn: string): string {
    return `Object.freeze({
    overview: "RiseupAsiaMacroExt.Projects.${cn} — Per-project SDK namespace providing access to variables, URLs, XPath, cookies, KV store, files, metadata, logging, database, and REST API.",
    vars: "vars.get(key) → Promise<any> | vars.set(key, value) → Promise<void> | vars.getAll() → Promise<Record<string,any>>  —  Read/write project-scoped configuration variables via the extension bridge.",
    urls: "urls.getMatched() → UrlRule|null | urls.listOpen() → Tab[] | urls.getVariables() → Record<string,string>  —  Query matched URL rules and extract URL-template variables.",
    xpath: "xpath.getChatBox() → Element|null  —  Locate the chat input element using the configured XPath selector.",
    cookies: "cookies.bindings → CookieBinding[] | cookies.get(nameOrRole) → Promise<string|null> (role-based lookup first, then literal cookie name) | cookies.getByRole(role) → Promise<string|null> | cookies.getSessionToken() → Promise<string|null> | cookies.getAll() → Promise<Record<string,string>>  —  Read platform session cookies via the extension cookie bridge with project-declared bindings.",
    kv: "kv.get(key) → Promise<any> | kv.set(key, value) → Promise<void> | kv.delete(key) → Promise<void> | kv.list() → Promise<string[]>  —  Project-scoped key-value persistence (SQLite-backed).",
    files: "files.save(name, data) → Promise<void> | files.read(name) → Promise<string> | files.list() → Promise<string[]>  —  Project-scoped file storage (base64-encoded BLOBs).",
    meta: "meta.name, meta.version, meta.slug, meta.codeName, meta.id, meta.description, meta.dependencies  —  Read-only project identity and metadata.",
    log: "log.info(msg, meta?) | log.warn(msg, meta?) | log.error(msg, meta?)  —  Structured logging with automatic [CodeName] prefix, persisted to SQLite Logs table.",
    db: "db.<Table>.findMany(where?) → Promise<Row[]> | db.<Table>.create(data) → Promise<Row> | db.<Table>.update(where, data) → Promise<Row> | db.<Table>.delete(where) → Promise<void> | db.<Table>.count(where?) → Promise<number>  —  Prisma-style query builder for project-scoped SQLite tables.",
    api: "api.kv.get(key) / .set(key,value) / .delete(key) / .list() | api.files.save(name,data) / .read(name) / .list() | api.db.query(table, method, params) | api.schema.list() / .create(table, columns) / .drop(table)  —  REST endpoint helpers (HTTP proxy on port 19280 or bridge relay).",
    scripts: "scripts → Array<{ name, order, isEnabled }>  —  Read-only list of scripts registered for this project.",
    notify: "notify.toast(msg, level?, opts?) | notify.dismiss(id) | notify.dismissAll() | notify.onError(cb) | notify.getRecentErrors()  —  Unified notification system with stacking (max 3), deduplication, and structured error reporting."
  })`;
}

/* ------------------------------------------------------------------ */
/*  IIFE Builder                                                       */
/* ------------------------------------------------------------------ */

/**
 * Builds an IIFE string that registers the per-project namespace on
 * `window.RiseupAsiaMacroExt.Projects.<CodeName>`.
 *
 * The generated code delegates to `window.marco.*` for actual
 * message-bridge communication.
 */
// eslint-disable-next-line max-lines-per-function
export function buildProjectNamespaceScript(ctx: NamespaceContext): string {
    const safe = (v: string) =>
        v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

    const cn = safe(ctx.codeName);
    const slug = safe(ctx.slug);
    const name = safe(ctx.projectName);
    const version = safe(ctx.projectVersion);
    const pid = safe(ctx.projectId);
    const description = safe(ctx.description ?? "");

    // Serialize scripts array as inline JSON
    const scriptsJson = JSON.stringify(
        (ctx.scripts ?? []).map(s => ({
            name: s.name,
            order: s.order,
            isEnabled: s.isEnabled,
        })),
    );

    // Serialize dependencies array as inline JSON
    const depsJson = JSON.stringify(
        (ctx.dependencies ?? []).map(d => ({
            projectId: d.projectId,
            version: d.version,
        })),
    );

    // Serialize file cache as a frozen object { "filename": "content", ... }
    const fileCacheObj: Record<string, string> = {};
    for (const f of ctx.fileCache ?? []) {
        fileCacheObj[f.name] = f.data;
    }
    const fileCacheJson = JSON.stringify(fileCacheObj);

    // Serialize cookie bindings for runtime role-based lookup
    const cookieBindingsJson = JSON.stringify(
        (ctx.cookieBindings ?? []).map(b => ({
            cookieName: b.cookieName,
            url: b.url,
            role: b.role,
        })),
    );

    const iife = `;(function(){
/* Per-project namespace: RiseupAsiaMacroExt.Projects.${cn} */
var root = window.RiseupAsiaMacroExt;
if (!root) { root = { Projects: {} }; window.RiseupAsiaMacroExt = root; }
if (!root.Projects) { root.Projects = {}; }
var existingNs = root.Projects["${cn}"];
if (existingNs && (existingNs._internal || (existingNs.api && existingNs.api.mc))) {
  console.log("[namespace] Preserved existing RiseupAsiaMacroExt.Projects.${cn} runtime namespace");
  return;
}
var m = window.marco;
if (!m) {
  console.warn("[namespace] window.marco not yet available — registering ${cn} with deferred proxy");
  m = {};
}

var pid = "${pid}";
var API_BASE = (root.Settings && root.Settings.Broadcast && root.Settings.Broadcast.BaseUrl) || "http://localhost:19280";
var _cookieBindings = ${cookieBindingsJson};

var ns = Object.freeze({
  vars: Object.freeze({
    get: function(k) { return m.config ? m.config.get(k) : (m.store ? m.store.get(k) : Promise.reject("no store")); },
    set: function(k, v) { return m.config ? m.config.set(k, v) : (m.store ? m.store.set(k, v) : Promise.reject("no store")); },
    getAll: function() { return m.config ? m.config.getAll() : (m.store ? m.store.getAll() : Promise.reject("no store")); }
  }),
  urls: Object.freeze({
    getMatched: function() { return null; },
    listOpen: function() { return []; },
    getVariables: function() { return {}; }
  }),
  xpath: Object.freeze({
    getChatBox: function() { return m.xpath ? m.xpath.getChatBox() : null; }
  }),
  cookies: Object.freeze({
    bindings: Object.freeze(_cookieBindings),
    get: function(nameOrRole) {
      /* Role-based lookup: if nameOrRole matches a binding role, resolve to that cookieName */
      for (var i = 0; i < _cookieBindings.length; i++) {
        if (_cookieBindings[i].role === nameOrRole) {
          return m.cookies ? m.cookies.get(_cookieBindings[i].cookieName) : Promise.resolve(null);
        }
      }
      /* Fallback: treat as literal cookie name */
      return m.cookies ? m.cookies.get(nameOrRole) : Promise.resolve(null);
    },
    getByRole: function(role) {
      for (var i = 0; i < _cookieBindings.length; i++) {
        if (_cookieBindings[i].role === role) {
          return m.cookies ? m.cookies.get(_cookieBindings[i].cookieName) : Promise.resolve(null);
        }
      }
      return Promise.resolve(null);
    },
    getSessionToken: function() {
      for (var i = 0; i < _cookieBindings.length; i++) {
        if (_cookieBindings[i].role === "session") {
          return m.cookies ? m.cookies.get(_cookieBindings[i].cookieName) : Promise.resolve(null);
        }
      }
      return Promise.resolve(null);
    },
    getAll: function() { return m.cookies ? m.cookies.getAll() : Promise.resolve({}); }
  }),
  kv: Object.freeze({
    get: function(k) { return m.kv.get(k); },
    set: function(k, v) { return m.kv.set(k, v); },
    delete: function(k) { return m.kv.delete(k); },
    list: function() { return m.kv.list(); }
  }),
  files: Object.freeze({
    save: function(n, d) { return m.files ? m.files.save(n, d) : Promise.reject("no files api"); },
    read: function(n) { return m.files ? m.files.read(n) : Promise.reject("no files api"); },
    list: function() { return m.files ? m.files.list() : Promise.reject("no files api"); },
    cache: Object.freeze(${fileCacheJson})
  }),
  meta: Object.freeze({
    name: "${name}",
    version: "${version}",
    slug: "${slug}",
    codeName: "${cn}",
    id: "${pid}",
    description: "${description}",
    dependencies: Object.freeze(${depsJson})
  }),
  log: Object.freeze({
    info: function(msg, meta) { return m.log ? m.log.info("[${cn}] " + msg, meta) : console.log("[${cn}]", msg); },
    warn: function(msg, meta) { return m.log ? m.log.warn("[${cn}] " + msg, meta) : console.warn("[${cn}]", msg); },
    error: function(msg, meta) { return m.log ? m.log.error("[${cn}] " + msg, meta) : console.error("[${cn}]", msg); }
  }),
  scripts: Object.freeze(${scriptsJson}),
  db: Object.freeze({
    table: function(tableName) {
      var bridge = m.bridge || m;
      function send(method, params) {
        return bridge.send ? bridge.send({ type: "DB_QUERY", projectId: pid, table: tableName, method: method, params: params || {} })
          : Promise.reject("no bridge");
      }
      return Object.freeze({
        findMany: function(where) { return send("findMany", { where: where }); },
        create: function(data) { return send("create", { data: data }); },
        update: function(where, data) { return send("update", { where: where, data: data }); },
        delete: function(where) { return send("delete", { where: where }); },
        count: function(where) { return send("count", { where: where }); }
      });
    }
  }),
  api: Object.freeze({
    kv: Object.freeze({
      get: function(k) { return fetch(API_BASE + "/projects/" + pid + "/kv/" + encodeURIComponent(k)).then(function(r) { return r.json(); }); },
      set: function(k, v) { return fetch(API_BASE + "/projects/" + pid + "/kv/" + encodeURIComponent(k), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: v }) }).then(function(r) { return r.json(); }); },
      delete: function(k) { return fetch(API_BASE + "/projects/" + pid + "/kv/" + encodeURIComponent(k), { method: "DELETE" }).then(function(r) { return r.json(); }); },
      list: function() { return fetch(API_BASE + "/projects/" + pid + "/kv").then(function(r) { return r.json(); }); }
    }),
    files: Object.freeze({
      save: function(n, d) { return fetch(API_BASE + "/projects/" + pid + "/files/" + encodeURIComponent(n), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: d }) }).then(function(r) { return r.json(); }); },
      read: function(n) { return fetch(API_BASE + "/projects/" + pid + "/files/" + encodeURIComponent(n)).then(function(r) { return r.json(); }); },
      list: function() { return fetch(API_BASE + "/projects/" + pid + "/files").then(function(r) { return r.json(); }); }
    }),
    db: Object.freeze({
      query: function(table, method, params) { return fetch(API_BASE + "/projects/" + pid + "/db/" + encodeURIComponent(table), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: method, params: params }) }).then(function(r) { return r.json(); }); }
    }),
    schema: Object.freeze({
      list: function() { return fetch(API_BASE + "/projects/" + pid + "/db", { method: "SCHEMA", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) }).then(function(r) { return r.json(); }); },
      create: function(table, columns) { return fetch(API_BASE + "/projects/" + pid + "/db", { method: "SCHEMA", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", table: table, columns: columns }) }).then(function(r) { return r.json(); }); },
      drop: function(table) { return fetch(API_BASE + "/projects/" + pid + "/db", { method: "SCHEMA", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "drop", table: table }) }).then(function(r) { return r.json(); }); }
    })
  }),
  notify: Object.freeze({
    toast: function(msg, level, opts) { return m.notify ? m.notify.toast(msg, level, opts) : console.log("[${cn}]", msg); },
    dismiss: function(id) { return m.notify ? m.notify.dismiss(id) : undefined; },
    dismissAll: function() { return m.notify ? m.notify.dismissAll() : undefined; },
    onError: function(cb) { return m.notify ? m.notify.onError(cb) : undefined; },
    getRecentErrors: function() { return m.notify ? m.notify.getRecentErrors() : []; }
  }),
  docs: ${buildDocsObject(cn)}
});

root.Projects["${cn}"] = ns;
console.log("[namespace] Registered RiseupAsiaMacroExt.Projects.${cn}");
})();`;

    /* Build-time guard — fail fast if the generator drifts from the shape
       contract. Emits the exact missing sub-namespace list. */
    assertEmittedShape(
        iife,
        `buildProjectNamespaceScript(codeName="${ctx.codeName}")`,
    );
    /* Touch the imported keys list so tree-shaking keeps it for runtime
       diagnostics consumers that import it from this module. */
    void PROJECT_NAMESPACE_KEYS;
    return iife;
}

