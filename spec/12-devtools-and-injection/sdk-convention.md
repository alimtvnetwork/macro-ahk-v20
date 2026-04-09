# Spec 18 — Marco SDK Convention & Shared Project Architecture

**Status**: 📝 Draft  
**Version**: 1.0  
**Date**: 2026-03-23

---

## Summary

Define a standardized SDK (`marco.*`) that scripts in the MAIN world use to access extension-provided services (auth, cookies, config, XPath, KV, files). The SDK is delivered as a **separate shared project** that other projects declare as a dependency.

---

## Architecture

### Delivery Model: Shared Project

The SDK is a standalone project at `standalone-scripts/marco-sdk/`.

```
standalone-scripts/
├── marco-sdk/            ← NEW: shared SDK project
│   ├── src/
│   │   ├── index.ts      ← entry point, builds `window.marco`
│   │   ├── auth.ts
│   │   ├── cookies.ts
│   │   ├── config.ts
│   │   ├── xpath.ts
│   │   ├── kv.ts
│   │   ├── files.ts
│   │   └── bridge.ts     ← postMessage relay helper
│   ├── dist/
│   │   └── marco-sdk.js  ← compiled IIFE
│   └── readme.md
├── macro-controller/     ← depends on marco-sdk
│   ├── project.json      ← { "dependencies": [{ "projectId": "marco-sdk", "version": "^1.0.0" }] }
│   └── ...
```

### Injection Order

1. Extension resolves dependency graph (topological sort)
2. `marco-sdk.js` is injected into MAIN world **first**
3. It creates and freezes `window.marco` namespace
4. Dependent projects (e.g., macro-controller) load after and access `marco.*`

### Bridge Pattern

All SDK methods use the same relay:

```
MAIN world (marco.auth.getToken())
  → window.postMessage({ source: 'marco-sdk', type: 'AUTH_GET_TOKEN', requestId })
  → Content Script relay (ISOLATED world)
  → chrome.runtime.sendMessage({ type: 'AUTH_GET_TOKEN', requestId })
  → Background service worker (handles request)
  → Response flows back via the same chain
  → Promise resolves in MAIN world
```

---

## API Surface

### `marco.auth`

| Method | Returns | Description |
|--------|---------|-------------|
| `getToken()` | `Promise<string \| null>` | Resolved bearer token from best source |
| `getSource()` | `Promise<string>` | `'extension'` \| `'localStorage'` \| `'cookie'` \| `'none'` |
| `refresh()` | `Promise<string \| null>` | Force re-resolve from all sources |
| `isExpired()` | `Promise<boolean>` | Check JWT `exp` claim vs current time |
| `getJwtPayload()` | `Promise<Record<string, unknown> \| null>` | Decoded JWT payload (no verification) |

**Background message types**: `AUTH_GET_TOKEN`, `AUTH_GET_SOURCE`, `AUTH_REFRESH`, `AUTH_IS_EXPIRED`, `AUTH_GET_JWT`

### `marco.cookies`

| Method | Returns | Description |
|--------|---------|-------------|
| `get(name)` | `Promise<string \| null>` | Raw cookie value |
| `getDetail(name)` | `Promise<CookieDetail \| null>` | Full parsed object |
| `getAll()` | `Promise<CookieDetail[]>` | All cookies for current domain |

```typescript
interface CookieDetail {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;  // epoch ms, null = session
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}
```

**Background message types**: `COOKIES_GET`, `COOKIES_GET_DETAIL`, `COOKIES_GET_ALL`

### `marco.config`

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<unknown>` | Single config value |
| `getAll()` | `Promise<Record<string, unknown>>` | Full project config |
| `set(key, value)` | `Promise<void>` | Update config (persists to storage) |

**Background message types**: `CONFIG_GET`, `CONFIG_GET_ALL`, `CONFIG_SET`

### `marco.xpath`

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<string \| null>` | Named XPath expression |
| `getAll()` | `Promise<Record<string, string>>` | All XPath configs |
| `resolve(key)` | `Element \| null` | Evaluate XPath → first matching DOM element (sync, runs in MAIN) |
| `resolveAll(key)` | `Element[]` | Evaluate XPath → all matching elements (sync, runs in MAIN) |

> Note: `resolve` and `resolveAll` are **synchronous** — they fetch the XPath string from cache and evaluate locally. The cache is populated on SDK init and refreshed on `config` changes.

**Background message types**: `XPATH_GET`, `XPATH_GET_ALL`

### `marco.kv` (existing — no changes)

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<string \| null>` | Project-scoped KV value |
| `set(key, value)` | `Promise<void>` | Set KV pair |
| `delete(key)` | `Promise<void>` | Delete KV pair |
| `list()` | `Promise<Array<{ key, value }>>` | All KV pairs |

**Background message types**: `KV_GET`, `KV_SET`, `KV_DELETE`, `KV_LIST`

### `marco.files` (existing — no changes)

| Method | Returns | Description |
|--------|---------|-------------|
| `save(path, content, mime?)` | `Promise<void>` | Save file (base64 for binary) |
| `read(path)` | `Promise<{ content, mime }>` | Read file |
| `delete(path)` | `Promise<void>` | Delete file |
| `list()` | `Promise<FileEntry[]>` | List all files |

**Background message types**: `FILE_SAVE`, `FILE_READ`, `FILE_DELETE`, `FILE_LIST`

---

## Shared Project Configuration

### `project.json` Schema

```json
{
  "id": "marco-sdk",
  "name": "Marco SDK",
  "version": "1.0.0",
  "shared": true,
  "description": "Core SDK for Marco extension scripts",
  "entry": "dist/marco-sdk.js",
  "exports": {
    "namespace": "marco",
    "frozen": true
  }
}
```

### Dependency Declaration (in consuming projects)

```json
{
  "id": "macro-controller",
  "name": "Macro Controller",
  "version": "1.61.0",
  "dependencies": [
    { "projectId": "marco-sdk", "version": "^1.0.0" }
  ]
}
```

---

## Dependency Resolution

### Algorithm

1. Build adjacency list from all project `dependencies`
2. Topological sort (Kahn's algorithm)
3. Detect circular dependencies → throw error
4. Return ordered list of projects to inject

### Caching (IndexedDB)

- Key: `marco-dep-cache-{projectId}-{version}`
- On load: check cached version vs declared version
- Mismatch → invalidate cache, fetch fresh from `dist/projects/scripts/`
- Cache TTL: none (version-pinned, invalidated only on mismatch)

---

## Message Type Naming Convention

All background message types follow **SCREAMING_SNAKE_CASE** with namespace prefix:

```
AUTH_GET_TOKEN       (not auth-get-token, not authGetToken)
COOKIES_GET_DETAIL   (not cookie_get_detail)
CONFIG_SET           (not configSet)
```

### API Endpoint Naming (HTTP-style, for backend routes)

When these are exposed as HTTP-like endpoints (e.g., in Swagger/API explorer):

```
/auth/get-token          ← hyphen-case, lowercase, full words
/cookies/get-detail
/config/set
/key-values/set          ← NOT kv-set, NOT kv_set
/files/read
```

---

## Migration Plan

### Phase 1: Create `marco-sdk` shared project
- Extract existing `marco.kv` from macro-controller into SDK
- Add `auth`, `cookies`, `config`, `xpath` modules
- Build IIFE bundle

### Phase 2: Update macro-controller
- Add `marco-sdk` as dependency in `project.json`
- Remove inline `marco.kv` implementation
- Replace direct `window.postMessage` auth calls with `marco.auth.*`
- Replace direct cookie reading with `marco.cookies.*`

### Phase 3: Update extension injection pipeline
- Implement dependency graph resolution in background
- Inject shared projects before dependent projects
- Add IndexedDB version cache

---

## Resolved Design Decisions

- [x] SDK as shared project or built-in? → **Shared project**
- [x] Cookie format: raw or parsed? → **Both** (`.get()` = raw, `.getDetail()` = full object)
- [x] Should `marco.config.set()` trigger re-inject? → **Yes** — dependent scripts are re-injected when config changes, ensuring reactivity
- [x] Should shared projects support transitive deps? → **Yes** — full transitive dependency resolution via topological sort
- [x] Version range syntax? → **Semver ranges** (`^1.0.0` matches `1.x.x`)

### Config Reactivity Detail

When `marco.config.set(key, value)` is called:
1. Value is persisted to `chrome.storage.local`
2. Background broadcasts `CONFIG_CHANGED` event with `{ key, value, projectId }`
3. Content script relay forwards to MAIN world
4. SDK emits `marco.config.onChange(callback)` for scripts that want to react without re-inject
5. If the changed key is in a dependent project's `reactiveConfigKeys` list, that project is **torn down and re-injected** with fresh config

### Transitive Dependency Resolution

```
macro-controller
  └── depends on marco-sdk (^1.0.0)
        └── depends on marco-utils (^1.0.0)

Resolution order: [marco-utils, marco-sdk, macro-controller]
```

Circular dependencies are detected during topological sort and throw a hard error with the cycle path logged.

### Semver Range Matching

Uses simplified semver:
- `^1.0.0` → matches `>=1.0.0 <2.0.0`
- `~1.2.0` → matches `>=1.2.0 <1.3.0`
- `1.5.0` → exact match only
