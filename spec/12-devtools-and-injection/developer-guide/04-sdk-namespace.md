# 04 — SDK Namespace Reference (`marco.*`)

> Complete API reference for the `window.marco` frozen namespace.

---

## Overview

The Marco SDK (`window.marco`) is a frozen namespace available to all scripts running in the MAIN world. It provides access to extension services via a postMessage bridge to the background service worker.

```
MAIN world script
  → marco.auth.getToken()
  → window.postMessage({ source: "marco-sdk", type: "AUTH_GET_TOKEN", requestId })
  → Content Script relay (ISOLATED world)
  → chrome.runtime.sendMessage({ type: "AUTH_GET_TOKEN", requestId })
  → Background service worker
  → Response flows back the same chain
  → Promise resolves in MAIN world
```

**Bridge timeout**: 15 seconds per request. All SDK methods (except sync ones) return Promises.

---

## `marco.auth` — Token Management

| Method | Returns | Description |
|--------|---------|-------------|
| `getToken()` | `Promise<string \| null>` | Resolved bearer token from best source |
| `getSource()` | `Promise<string>` | Token source: `"extension"`, `"localStorage"`, `"cookie"`, `"none"` |
| `refresh()` | `Promise<string \| null>` | Force re-resolve from all sources |
| `isExpired()` | `Promise<boolean>` | Check JWT `exp` claim vs current time |
| `getJwtPayload()` | `Promise<Record<string, unknown> \| null>` | Decoded JWT payload (no verification) |
| `getLastAuthDiag()` | `AuthResolutionDiag \| null` | Last token resolution diagnostic (sync) |

**Message types**: `AUTH_GET_TOKEN`, `AUTH_GET_SOURCE`, `AUTH_REFRESH`, `AUTH_IS_EXPIRED`, `AUTH_GET_JWT`

### Token Resolution Order

1. **Bridge** (extension relay) — fastest, preferred
2. **localStorage** (`marco_bearer_token`) — fallback if bridge times out (3s)
3. **None** — no token available

---

## `marco.cookies` — Cookie Access

| Method | Returns | Description |
|--------|---------|-------------|
| `get(name)` | `Promise<string \| null>` | Raw cookie value by name |
| `getDetail(name)` | `Promise<CookieDetail \| null>` | Full parsed cookie object |
| `getAll()` | `Promise<CookieDetail[]>` | All cookies for current domain |

```typescript
interface CookieDetail {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number | null;   // epoch ms, null = session
    secure: boolean;
    httpOnly: boolean;
    sameSite: "strict" | "lax" | "none";
}
```

**Message types**: `COOKIES_GET`, `COOKIES_GET_DETAIL`, `COOKIES_GET_ALL`

---

## `marco.config` — Project Configuration

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<unknown>` | Single config value |
| `getAll()` | `Promise<Record<string, unknown>>` | Full project config |
| `set(key, value)` | `Promise<void>` | Update config (persists to storage, broadcasts change) |
| `onChange(callback)` | `void` | Register listener for config changes |

**Reactivity**: When `set()` is called, the value persists and a `CONFIG_CHANGED` event broadcasts to all listeners registered via `onChange()`.

**Message types**: `CONFIG_GET`, `CONFIG_GET_ALL`, `CONFIG_SET`

---

## `marco.xpath` — XPath Evaluation

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<string \| null>` | Named XPath expression string |
| `getAll()` | `Promise<Record<string, string>>` | All XPath configs |
| `resolve(key)` | `Element \| null` | Evaluate XPath → first matching element (**sync**) |
| `resolveAll(key)` | `Element[]` | Evaluate XPath → all matching elements (**sync**) |
| `refreshCache()` | `Promise<void>` | Re-fetch XPath map from background |

> **Note**: `resolve()` and `resolveAll()` are **synchronous** — they use a cached XPath map populated on SDK init. Call `refreshCache()` if XPaths change at runtime.

**Message types**: `XPATH_GET`, `XPATH_GET_ALL`

---

## `marco.kv` — Key-Value Storage

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<string \| null>` | Project-scoped KV value |
| `set(key, value)` | `Promise<void>` | Set KV pair |
| `delete(key)` | `Promise<void>` | Delete KV pair |
| `list()` | `Promise<Array<{ key, value }>>` | All KV pairs |

**Message types**: `KV_GET`, `KV_SET`, `KV_DELETE`, `KV_LIST`

---

## `marco.files` — File Storage

| Method | Returns | Description |
|--------|---------|-------------|
| `save(path, content, mime?)` | `Promise<void>` | Save file (base64 for binary) |
| `read(path)` | `Promise<{ content, mime }>` | Read file content |
| `delete(path)` | `Promise<void>` | Delete file |
| `list()` | `Promise<FileEntry[]>` | List all files |

```typescript
interface FileEntry {
    filename: string;
    mimeType: string | null;
    size: number | null;
    createdAt: string;
}
```

**Message types**: `FILE_SAVE`, `FILE_READ`, `FILE_DELETE`, `FILE_LIST`

---

## `marco.notify` — Toast Notifications

| Method | Returns | Description |
|--------|---------|-------------|
| `toast(message, level?, opts?)` | `void` | Show a toast (level: `"info"`, `"warn"`, `"error"`, `"success"`) |
| `info(message, opts?)` | `void` | Info toast shortcut |
| `success(message, opts?)` | `void` | Success toast shortcut |
| `warning(message, opts?)` | `void` | Warning toast shortcut |
| `error(message, opts?)` | `void` | Error toast shortcut |
| `dismissAll()` | `void` | Dismiss all visible toasts |
| `onError(callback)` | `void` | Register error listener |
| `getRecentErrors()` | `RecentError[]` | Get recent error history (max 50) |

**Toast behavior**:
- Max 3 visible, oldest auto-dismissed on overflow
- 5s deduplication window prevents toast storms
- Error toasts: 30s auto-dismiss; others: 12s
- Copy button includes version + timestamp

---

## `marco.utils` — Shared Utilities

| Method | Signature | Description |
|--------|-----------|-------------|
| `withTimeout` | `<T>(promise, ms, fallback) → Promise<T>` | Wrap a promise with a timeout |
| `withRetry` | `<T>(fn, options) → Promise<T>` | Retry async function with configurable backoff |
| `createConcurrencyLock` | `<T>() → ConcurrencyLock<T>` | Single-flight concurrency lock |
| `delay` | `(ms) → Promise<void>` | Promise-based delay |
| `pollUntil` | `<T>(condition, options?) → Promise<T \| null>` | Poll until truthy or timeout |
| `waitForElement` | `(options) → Promise<Element \| null>` | Wait for a DOM element to appear |
| `debounce` | `(fn, ms) → fn` | Debounce a function |
| `throttle` | `(fn, ms) → fn` | Throttle a function |
| `safeJsonParse` | `<T>(json, fallback) → T` | Safe JSON parse |
| `formatDuration` | `(ms) → string` | Human-readable duration |
| `uid` | `(prefix?) → string` | Short unique ID |
| `deepClone` | `<T>(value) → T` | Deep-clone plain objects |
| `isObject` | `(value) → boolean` | Check if non-null object |

---

## `marco.prompts` — Prompt Management

| Method | Returns | Description |
|--------|---------|-------------|
| `getAll()` | `Promise<PromptEntry[]>` | All prompts (cache-first with background revalidation) |
| `save(prompt)` | `Promise<PromptEntry>` | Save or update a prompt |
| `delete(id)` | `Promise<void>` | Delete prompt by ID |
| `reorder(ids)` | `Promise<void>` | Reorder prompts |
| `inject(text, options?)` | `boolean` | Inject text into page editor element |
| `getConfig()` | `Promise<ResolvedPromptsConfig>` | Resolved prompts config |
| `invalidateCache()` | `Promise<void>` | Clear in-memory + IndexedDB cache |
| `preWarm()` | `Promise<PromptEntry[]>` | Pre-warm cache for instant dropdown |

**Cache cascade**: in-memory → IndexedDB (stale-while-revalidate, 24h TTL) → extension bridge (with 3 retries).

---

## `marco.api` — HTTP API Client

| Method | Returns | Description |
|--------|---------|-------------|
| `call(path, options?)` | `Promise<ApiResponse>` | Call endpoint by path (e.g., `"credits.fetchWorkspaces"`) |
| `credits.fetchWorkspaces(options?)` | `Promise<ApiResponse>` | Typed: fetch all workspaces |
| `credits.fetchBalance(wsId, options?)` | `Promise<ApiResponse>` | Typed: workspace credit balance |
| `credits.resolve(wsId, options?)` | `Promise<ApiResponse>` | Typed: resolve with fallback |
| `workspace.move(projectId, targetWsId, options?)` | `Promise<ApiResponse>` | Typed: move project |
| `workspace.rename(wsId, newName, options?)` | `Promise<ApiResponse>` | Typed: rename workspace |
| `workspace.markViewed(projectId, options?)` | `Promise<ApiResponse>` | Typed: mark viewed |
| `workspace.probe(options?)` | `Promise<ApiResponse>` | Typed: connectivity check |
| `workspace.resolveByProject(projectId, options?)` | `Promise<ApiResponse>` | Typed: resolve workspace |

The API module uses an Axios instance with automatic bearer token injection, 401 recovery (token refresh), and 429 retry with backoff.

---

## Per-Project Namespace

Each project gets a project-scoped namespace registered under its **`codeName`** (PascalCase derived from the project's slug):

```javascript
window.RiseupAsiaMacroExt.Projects.{CodeName}.vars.get(key)
window.RiseupAsiaMacroExt.Projects.{CodeName}.vars.set(key, value)
window.RiseupAsiaMacroExt.Projects.{CodeName}.cookies.get(bindTo)
window.RiseupAsiaMacroExt.Projects.{CodeName}.kv.get(key)
window.RiseupAsiaMacroExt.Projects.{CodeName}.meta    // { name, version, slug, codeName }
window.RiseupAsiaMacroExt.Projects.{CodeName}.log.info(msg)
```

Replace `{CodeName}` with **your project's actual codeName** — e.g. `MacroController`, `MarcoDashboard`, etc. Run `Object.keys(RiseupAsiaMacroExt.Projects)` in the page console to see what's registered on the current tab.

### Two flavours of registered namespace

| Namespace | Registered by | Purpose | `urls` / `db` |
|-----------|---------------|---------|---------------|
| `Projects.RiseupMacroSdk` | The SDK IIFE itself, at init (`standalone-scripts/marco-sdk/src/self-namespace.ts`) | **Self-namespace** so the documented API surface is callable from the SDK layer alone, even on tabs with zero user projects | **Stubs** — `urls.getMatched()` returns `null`, `urls.listOpen()` returns `[]`, `db.table(...).*` rejects with `"SDK has no project DB"` |
| `Projects.{YourCodeName}` | The background `injection-handler` after your project's scripts are injected (`src/background/project-namespace-builder.ts`) | **Full per-project namespace** with project metadata, cookie bindings, scripts list, file cache, and a real project-scoped SQLite DB | **Real implementations** — matched URL rule, open tabs, URL-template variables, and full Prisma-style `db.<Table>.{findMany,create,update,delete,count}` |

Use `Projects.RiseupMacroSdk` only for SDK-level smoke tests or when you need a guaranteed-present namespace before any user project loads. For real work — variables, cookies, KV, files, DB, URL rules — always use **your own project's codeName** namespace.

### Verifying at runtime

```javascript
// What's registered on this tab?
Object.keys(RiseupAsiaMacroExt.Projects)
// → ["RiseupMacroSdk", "MacroController"]

// Self-namespace (always present once SDK loads)
RiseupAsiaMacroExt.Projects.RiseupMacroSdk.meta
// → { name: "Rise Up Macro SDK", version: "...", codeName: "RiseupMacroSdk", ... }

// Your user project (present only when its URL rules match this tab)
RiseupAsiaMacroExt.Projects.MacroController.urls.getMatched()
// → { pattern: "...", label: "..." }   (real rule object)
```


## Message Type Naming Convention

All background message types use **SCREAMING_SNAKE_CASE**:

```
AUTH_GET_TOKEN       (not auth-get-token)
COOKIES_GET_DETAIL   (not cookie_get_detail)
CONFIG_SET           (not configSet)
```
