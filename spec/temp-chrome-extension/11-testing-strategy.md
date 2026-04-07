# Chrome Extension — Testing Strategy

**Version**: v0.2 (Phase 6 Expansion)
**Date**: 2026-02-28
**Changes in v0.2**: Added U-09–U-14 (URL matching, config validation, service worker), I-08–I-13 (project CRUD, config injection, multi-tab), E2E-16–E2E-21 (project flows, onboarding, CSP fallback), updated regression checklist

---

## Purpose

Define the testing pyramid for the Marco Chrome Extension: what to test, how to test it, and when. Covers unit tests (isolated logic), integration tests (component interactions), end-to-end manual tests (full user flows), and regression checklists for releases.

---

## Testing Pyramid

```
            ┌───────────┐
            │  Manual   │  ~21 flows — run before each release
            │   E2E     │  Real browser, real extension, real lovable.dev
            ├───────────┤
            │Integration│  ~42 tests — message passing, config loading,
            │  Tests    │  injection rules, DB ops, project CRUD, multi-tab
            ├───────────┤
            │   Unit    │  ~100 tests — pure functions, no browser APIs
            │   Tests   │  XPath, config, credits, retry, version, URL matching,
            │           │  service worker rehydration, CSP detection
            └───────────┘
```

---

## Test Runner & Framework

| Layer | Tool | Runs In |
|-------|------|---------|
| Unit | **Vitest** (fast, ESM-native) | Node.js (CI + local) |
| Integration | **Vitest** + `chrome` API mocks | Node.js with mocked `chrome.*` |
| E2E / Manual | Checklist + optional Playwright | Real Chrome with extension loaded |

### Chrome API Mocking

```javascript
// test/mocks/chrome.js — Shared mock for all tests
export const chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0.1', version_name: '1.0.0 (build 1)' }),
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    getURL: (path) => `chrome-extension://mock-id/${path}`
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      getBytesInUse: vi.fn().mockResolvedValue(0),
      QUOTA_BYTES: 10485760
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined)
    }
  },
  cookies: {
    get: vi.fn(),
    onChanged: { addListener: vi.fn() }
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    get: vi.fn(),
    onUpdated: { addListener: vi.fn() }
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: true }])
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  },
  downloads: {
    download: vi.fn()
  },
  webNavigation: {
    onHistoryStateUpdated: { addListener: vi.fn() },
    onCommitted: { addListener: vi.fn() }
  },
  commands: {
    onCommand: { addListener: vi.fn() }
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() }
  },
  permissions: {
    request: vi.fn().mockResolvedValue(true),
    contains: vi.fn().mockResolvedValue(true)
  }
};

globalThis.chrome = chrome;
```

---

## Unit Tests (~100 tests)

Pure functions with no browser dependencies. Fast, deterministic, run in CI.

### U-01: Credit Calculation

| Test | Input | Expected |
|------|-------|----------|
| `calcTotalCredits` with full data | `{ monthly: 200, daily: 5 }` | `205` |
| `calcTotalCredits` with zero daily | `{ monthly: 200, daily: 0 }` | `200` |
| `calcAvailableCredits` with usage | `{ total: 200, used: 142 }` | `58` |
| `calcAvailableCredits` over limit | `{ total: 200, used: 210 }` | `0` (clamped) |
| `calcFreeCreditAvailable` fresh day | `{ dailyUsed: 0, dailyLimit: 5 }` | `5` |
| `calcFreeCreditAvailable` exhausted | `{ dailyUsed: 5, dailyLimit: 5 }` | `0` |

```javascript
describe('Credit Calculations', () => {
  test('calcTotalCredits sums monthly + daily', () => {
    expect(calcTotalCredits({ monthly: 200, daily: 5 })).toBe(205);
  });
  test('calcAvailableCredits clamps at zero', () => {
    expect(calcAvailableCredits({ total: 200, used: 210 })).toBe(0);
  });
});
```

### U-02: XPath Computation

| Test | Input Element | Expected Output |
|------|--------------|-----------------|
| Element with unique ID | `<button id="submit">` | `//*[@id="submit"]` |
| Element with data-testid | `<div data-testid="ws-card">` | `//*[@data-testid="ws-card"]` |
| Element with role + aria-label | `<button role="button" aria-label="Transfer">` | `//button[@role="button"][@aria-label="Transfer"]` |
| Button with unique text | `<button>Confirm transfer</button>` | `//button[normalize-space(text())="Confirm transfer"]` |
| Positional fallback | `<div><span></span><span></span></div>` (2nd span) | `/html/body/div/span[2]` |
| Duplicate IDs | Two elements with `id="dup"` | Falls through to positional |

```javascript
describe('XPath Computation', () => {
  test('prefers ID-based xpath', () => {
    const el = createMockElement('button', { id: 'submit' });
    expect(computeXPath(el)).toBe('//*[@id="submit"]');
  });
  test('falls back to positional when ID is not unique', () => {
    const el = createDuplicateIdElement('button', 'dup');
    expect(computeXPath(el)).toMatch(/^\/html\/body\//);
  });
});
```

### U-03: Config Schema Validation

| Test | Input | Expected |
|------|-------|----------|
| Valid complete config | Full config.json | No errors |
| Missing required section | Config without `creditStatus` | Error: `creditStatus required` |
| Invalid type (string where number expected) | `loopIntervalMs: "fast"` | Error: `expected number` |
| Invalid enum value | `authMode: "magic"` | Error: `must be cookieSession or token` |
| Empty config | `{}` | Merged with defaults, no crash |
| Extra unknown keys | `{ foo: "bar" }` | Ignored (no error), stripped on save |

### U-04: Retry Logic

| Test | Scenario | Expected |
|------|----------|----------|
| Success on first try | fn resolves | Returns result, no retry |
| Success on 2nd try | fn fails once then resolves | Returns result, 1 retry logged |
| All retries exhausted | fn fails 4 times | Throws after 3 retries |
| Exponential backoff timing | 3 retries | Delays: ~1s, ~2s, ~4s (±500ms jitter) |
| Non-retryable error | fn throws `{ retryable: false }` | Throws immediately, no retry |

```javascript
describe('withRetry', () => {
  test('retries up to maxRetries then throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });
});
```

### U-05: Version Parsing & Comparison

| Test | Input | Expected |
|------|-------|----------|
| Parse `1.2.3.4` | `"1.2.3.4"` | `{ major: 1, minor: 2, patch: 3, build: 4 }` |
| Compare major bump | `"1.0.0"` vs `"2.0.0"` | Needs migration |
| Same version | `"1.1.0"` vs `"1.1.0"` | No migration |
| Config older than extension | config `"1.0.0"`, ext `"2.0.0"` | `migrateConfig` called |

### U-06: URL Pattern Matching

| Test | URL | Pattern | Regex | Expected |
|------|-----|---------|-------|----------|
| Exact domain match | `https://lovable.dev/projects/abc` | `https://lovable.dev/*` | — | ✅ Match |
| Subdomain match | `https://preview.lovable.dev/x` | `https://*.lovable.dev/*` | — | ✅ Match |
| Path regex match | `https://lovable.dev/projects/abc-123` | — | `^/projects/[a-f0-9-]+` | ✅ Match |
| Path regex exclude | `https://lovable.dev/projects/abc/settings` | — | exclude: `^/projects/.*/settings` | ❌ Excluded |
| No match | `https://google.com/search` | `https://lovable.dev/*` | — | ❌ No match |
| Settings page | `https://lovable.dev/settings?tab=project` | `https://lovable.dev/settings*` | `^/settings` | ✅ Match |

### U-07: Token Redaction

| Test | Input | Expected |
|------|-------|----------|
| Full token | `"eyJhbGciOiJIUzI1NiJ9.payload.sig"` | `"eyJhbGci...REDACTED"` |
| Short token | `"abc"` | `"abc...REDACTED"` |
| Empty token | `""` | `"(empty)"` |
| Null token | `null` | `"(none)"` |
| Token in headers object | `{ Authorization: "Bearer eyJ..." }` | `{ Authorization: "Bearer eyJhbGci...REDACTED" }` |

### U-08: Storage Budget Calculation

| Test | Input | Expected |
|------|-------|----------|
| Under 70% | 5 MB / 10 MB | `{ percent: 50, level: 'ok' }` |
| Warning zone | 8 MB / 10 MB | `{ percent: 80, level: 'warning' }` |
| Critical zone | 9.5 MB / 10 MB | `{ percent: 95, level: 'critical' }` |
| Unlimited storage | 50 MB / Infinity | `{ percent: 0, level: 'ok' }` |

### U-09: Project URL Rule Matching (v0.2)

| Test | URL | Rule Config | Expected |
|------|-----|-------------|----------|
| Exact match | `https://lovable.dev/projects/abc` | `{ matchMode: 'exact', pattern: 'https://lovable.dev/projects/abc' }` | ✅ Match |
| Prefix match | `https://lovable.dev/projects/abc/edit` | `{ matchMode: 'prefix', pattern: 'https://lovable.dev/projects/' }` | ✅ Match |
| Prefix no match | `https://lovable.dev/settings` | `{ matchMode: 'prefix', pattern: 'https://lovable.dev/projects/' }` | ❌ No match |
| Regex match | `https://lovable.dev/projects/abc-123` | `{ matchMode: 'regex', pattern: '^https://lovable\\.dev/projects/[a-f0-9-]+$' }` | ✅ Match |
| Regex no match | `https://lovable.dev/projects/abc/settings` | `{ matchMode: 'regex', pattern: '^https://lovable\\.dev/projects/[a-f0-9-]+$' }` | ❌ No match |
| Exclude pattern | `https://lovable.dev/projects/abc/settings` | `{ matchMode: 'prefix', pattern: '...projects/', excludePatterns: ['/settings$'] }` | ❌ Excluded |
| Multiple rules precedence | `https://lovable.dev/projects/abc` | Rule A (priority 10) + Rule B (priority 20) | Rule A wins (lower = higher priority) |
| Invalid regex | `https://lovable.dev/x` | `{ matchMode: 'regex', pattern: '[invalid(' }` | ❌ Error caught, logged, rule skipped |
| Case insensitive | `https://Lovable.DEV/projects/abc` | `{ matchMode: 'prefix', pattern: 'https://lovable.dev/', caseInsensitive: true }` | ✅ Match |
| Empty pattern | `https://lovable.dev/x` | `{ matchMode: 'exact', pattern: '' }` | ❌ No match |

```javascript
describe('Project URL Rule Matching', () => {
  test('prefix match works for subpaths', () => {
    const rule = { matchMode: 'prefix', pattern: 'https://lovable.dev/projects/' };
    expect(matchUrlRule('https://lovable.dev/projects/abc/edit', rule)).toBe(true);
  });
  test('exclude patterns override match', () => {
    const rule = {
      matchMode: 'prefix',
      pattern: 'https://lovable.dev/projects/',
      excludePatterns: ['/settings$']
    };
    expect(matchUrlRule('https://lovable.dev/projects/abc/settings', rule)).toBe(false);
  });
  test('invalid regex does not throw', () => {
    const rule = { matchMode: 'regex', pattern: '[invalid(' };
    expect(() => matchUrlRule('https://x.com', rule)).not.toThrow();
    expect(matchUrlRule('https://x.com', rule)).toBe(false);
  });
});
```

### U-10: Config Validation (v0.2)

| Test | Input | Expected |
|------|-------|----------|
| Valid project config | `{ id, name, urlRules: [...], scriptBindings: [...] }` | No errors |
| Missing project name | `{ id, urlRules: [] }` | Error: `name is required` |
| Invalid URL rule matchMode | `{ matchMode: 'fuzzy' }` | Error: `matchMode must be exact, prefix, or regex` |
| Script binding missing scriptId | `{ world: 'MAIN' }` | Error: `scriptId is required` |
| URL rule with empty pattern | `{ matchMode: 'exact', pattern: '' }` | Error: `pattern cannot be empty` |
| Valid timing override | `{ loopIntervalMs: 60000 }` | No errors |
| Negative timing value | `{ loopIntervalMs: -100 }` | Error: `must be positive number` |
| Config version mismatch | `{ version: '0.5.0' }` (ext v2.x) | Warning: `migration recommended` |

### U-11: Service Worker Rehydration (v0.2)

| Test | Scenario | Expected |
|------|----------|----------|
| `ensureInitialized` first call | No prior state | `initDatabases`, `loadActiveErrors`, `resumeSession` called |
| `ensureInitialized` second call | Already initialized | Returns immediately, no re-init |
| `resumeSession` with valid session | `chrome.storage.session` has ID, DB has matching open session | Continues existing session |
| `resumeSession` with stale session | Session ID exists but session ended in DB | Creates new session |
| `resumeSession` with no stored session | `chrome.storage.session` empty | Creates new session |
| Alarm-based flush | `marco-db-flush` alarm fires | `flushToStorage` called after `ensureInitialized` |
| Alarm-based storage check | `marco-storage-check` alarm fires | `checkStorageBudget` called |
| Keepalive start/stop | Active XPath recording | `chrome.alarms.create` called with 24s period; `chrome.alarms.clear` on stop |

```javascript
describe('Service Worker Rehydration', () => {
  test('ensureInitialized only runs once', async () => {
    const initDb = vi.fn();
    const mod = createRehydrationModule({ initDatabases: initDb });
    await mod.ensureInitialized();
    await mod.ensureInitialized();
    expect(initDb).toHaveBeenCalledTimes(1);
  });
  test('resumeSession creates new session when storage is empty', async () => {
    chrome.storage.session.get.mockResolvedValue({});
    const createSession = vi.fn();
    await resumeSession({ createNewSession: createSession });
    expect(createSession).toHaveBeenCalled();
  });
});
```

### U-12: CSP Detection (v0.2)

| Test | Error Message | Expected |
|------|--------------|----------|
| CSP error string | `"Refused to execute inline script due to Content Security Policy"` | `isCSPError` returns `true` |
| CSP acronym | `"CSP violation in script execution"` | `isCSPError` returns `true` |
| Generic error | `"Cannot read property of undefined"` | `isCSPError` returns `false` |
| Empty message | `""` | `isCSPError` returns `false` |
| Null error | `null` | `isCSPError` returns `false` |

### U-13: Multi-Project Priority Resolution (v0.2)

| Test | URL | Projects | Expected |
|------|-----|----------|----------|
| Single project matches | URL matches project A only | [A, B] | Project A selected |
| Multiple projects match | URL matches A (priority 20) and B (priority 10) | [A, B] | Project B wins (lower priority) |
| No projects match | URL matches nothing | [A, B] | `null` returned |
| Disabled project skipped | URL matches A (disabled) and B (enabled) | [A, B] | Project B selected |
| Default project fallback | URL matches default only | [default, custom] | Default project selected |

### U-14: Optional Permission Checks (v0.2)

| Test | Domain | Host Permissions | Expected |
|------|--------|-----------------|----------|
| Covered domain | `lovable.dev` | `["https://lovable.dev/*"]` | `needsPermission` returns `false` |
| Uncovered domain | `internal.example.com` | `["https://lovable.dev/*"]` | `needsPermission` returns `true` |
| Wildcard match | `preview.lovable.dev` | `["https://*.lovable.dev/*"]` | `needsPermission` returns `false` |
| Already granted optional | `example.com` (previously granted) | base only | `needsPermission` returns `false` |

---

## Integration Tests (~42 tests)

Test component interactions with mocked Chrome APIs. Verify message passing, config cascade, and DB operations.

### I-01: Config Loading Cascade

| Test | Storage State | Bundled File | Remote | Expected |
|------|--------------|-------------|--------|----------|
| All sources available | Has overrides | Exists | Returns 200 | Remote config merged over local |
| No storage, no remote | Empty | Exists | Disabled | Bundled defaults loaded + stored |
| Remote fails, fallback enabled | Has config | Exists | Returns 500 | Local config used, warn logged |
| Remote fails, fallback disabled | Empty | Exists | Returns 500 | Bundled defaults + error logged |
| All fail | Empty | Missing | Returns 500 | Emergency hardcoded defaults |

```javascript
describe('Config Loading Cascade', () => {
  test('merges remote config over local when available', async () => {
    chrome.storage.local.get.mockResolvedValue({
      config: { version: '1.0.0', macroLoop: { timing: { loopIntervalMs: 50000 } } }
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ macroLoop: { timing: { loopIntervalMs: 60000 } } })
    });

    const config = await loadConfigWithRemote();
    expect(config.macroLoop.timing.loopIntervalMs).toBe(60000);
  });
});
```

### I-02: Token Flow (Background ↔ Content Script)

| Test | Scenario | Expected |
|------|----------|----------|
| GET_TOKEN with valid cookie | Cookie exists | Returns token string |
| GET_TOKEN with no cookie | Cookie missing | Returns `""` |
| REFRESH_TOKEN after expiry | Cookie refreshed | Returns new token, cache updated |
| REFRESH_TOKEN cookie gone | No cookie | Returns `""`, TOKEN_EXPIRED sent to tabs |
| Cookie change listener — set | New cookie set | Cache updated, TOKEN_UPDATED broadcast |
| Cookie change listener — removed | Cookie deleted | Cache cleared, TOKEN_EXPIRED broadcast |
| Token caching — within TTL | Cached 10s ago, TTL 30s | Returns cached (no cookie API call) |
| Token caching — expired TTL | Cached 40s ago, TTL 30s | Re-reads cookie |

### I-03: Script Injection Rules Engine

| Test | URL | Rules | Expected |
|------|-----|-------|----------|
| Matching rule, enabled | `lovable.dev/projects/abc` | combo rule enabled | `executeScript` called with combo.js |
| Matching rule, disabled | `lovable.dev/projects/abc` | combo rule disabled | `executeScript` NOT called |
| Multiple matching rules | `lovable.dev/projects/abc` | combo + macro rules | Both scripts injected |
| Exclude regex matches | `lovable.dev/projects/abc/settings` | combo with exclude | `executeScript` NOT called |
| Condition: cookie missing | `lovable.dev/projects/abc` | requires cookie | `executeScript` NOT called |
| Condition: element missing | `lovable.dev/projects/abc` | requires `#app` | `executeScript` NOT called |
| Condition: delay | `lovable.dev/projects/abc` | 500ms delay | `executeScript` called after ~500ms |
| Non-matching URL | `google.com/search` | lovable rules only | `executeScript` NOT called |
| SPA navigation | History state change | Same tab, new path | Rules re-evaluated |

### I-04: SQLite Database Operations

| Test | Operation | Expected |
|------|-----------|----------|
| Init fresh DB | No stored data | Tables created, session inserted |
| Load existing DB | Stored byte array | DB deserialized, data intact |
| Insert log entry | `log('INFO', ...)` | Row in logs table with correct columns |
| Insert error entry | `logError(...)` | Row in errors table + corresponding log row |
| Flush to storage | Export + store | `chrome.storage.local.set` called with byte array |
| Prune old sessions | 10 sessions, keep 3 | 7 oldest deleted + their logs/errors/api_calls |
| Integrity check pass | Valid DB | Returns `true` |
| Integrity check fail | Corrupted bytes | Returns `false`, triggers recreation |
| Fallback migration | Fallback logs exist in storage | Imported into SQLite, fallback key removed |

### I-05: Error Recovery Flows

| Test | Trigger | Expected |
|------|---------|----------|
| WASM load fail → retry → success | First `initSqlJs` throws, second succeeds | DB initialized, recovery logged |
| WASM load fail → retry → fail | Both `initSqlJs` throw | Fallback mode activated, flag set |
| Storage full → prune succeeds | `set` throws quota, prune frees space | Flush succeeds after prune |
| Storage full → all pruning fails | Every prune attempt still over quota | `persistenceEnabled = false`, tabs notified |
| Injection fail → retry succeeds | First `executeScript` throws, retry works | Script injected, recovery logged |
| DB corruption → recreate | Integrity check fails | Fresh DB created, error logged |
| Network offline → online | `offline` then `online` events | Polling paused then resumed with immediate refresh |

### I-06: Active Errors & Badge

| Test | Active Errors | Expected Badge |
|------|--------------|----------------|
| No errors | Empty map | No badge |
| One warning | `STORAGE_FULL: warning` | Yellow `!` |
| Warning + error | `STORAGE_FULL: warning, AUTH_EXPIRED: error` | Orange `!!` |
| Fatal error | `WASM_LOAD_FAIL: fatal` | Red `X` |
| Error cleared | Was `AUTH_EXPIRED`, now cleared | Badge removed |

### I-07: Popup Data Loading

| Test | Background State | Expected Popup |
|------|-----------------|----------------|
| Everything healthy | Token valid, workspace detected, scripts injected | All green status cards |
| Token expired | Cookie gone | Token card: ❌ Expired, error bar shown |
| No workspace | Not on lovable.dev | Workspace: "No workspace detected" |
| Degraded logging | WASM failed | Error bar: "SQLite unavailable" |
| Storage warning | 92% usage | Footer bar: yellow, percentage shown |

### I-08: Project CRUD & Storage (v0.2)

| Test | Operation | Expected |
|------|-----------|----------|
| Create project | `createProject({ name: 'Test', urlRules: [...] })` | Stored in `chrome.storage.local`, ID generated |
| Read project | `getProject(id)` | Returns full project object |
| Update project name | `updateProject(id, { name: 'New Name' })` | Name updated, other fields unchanged |
| Delete project | `deleteProject(id)` | Removed from storage, scripts/configs unbound |
| List projects | `listProjects()` | Returns array sorted by priority |
| Create project with duplicate name | Same name as existing | Succeeds (names don't need to be unique) |
| Delete default project | Attempt to delete default-lovable | Rejected with error: "Cannot delete default project" |
| Project with max URL rules | 50 URL rules | All stored and queryable |

```javascript
describe('Project CRUD', () => {
  test('createProject generates unique ID and stores', async () => {
    const project = await createProject({ name: 'Test', urlRules: [] });
    expect(project.id).toBeDefined();
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
  test('deleteProject refuses to delete default project', async () => {
    await expect(deleteProject('default-lovable')).rejects.toThrow('Cannot delete default');
  });
});
```

### I-09: Config Injection Methods (v0.2)

| Test | Injection Method | Expected |
|------|-----------------|----------|
| Global variable injection | `world: 'MAIN', configMethod: 'global'` | `window.__MARCO_CONFIG__` set before script runs |
| Message-based injection | `world: 'ISOLATED', configMethod: 'message'` | Script receives config via `chrome.runtime.sendMessage` response |
| Parameter injection | `configMethod: 'parameter'` | Script function called with config as argument |
| No config injection | `configMethod: 'none'` | Script runs without any config context |
| Config with secrets resolved | Config has `{{SECRET_TOKEN}}` | Secret replaced with stored value before injection |
| Config merge: deep | `mergeStrategy: 'deep'` | Nested objects merged recursively |
| Config merge: replace | `mergeStrategy: 'replace'` | Remote config replaces local entirely |

### I-10: Multi-Tab Injection Tracking (v0.2)

| Test | Scenario | Expected |
|------|----------|----------|
| Track injection on tab A | `trackInjection(tabA, 'combo.js', 'MAIN')` | `tabInjections.get(tabA)` has combo.js entry |
| Track second script same tab | `trackInjection(tabA, 'macro.js', 'MAIN')` | Tab A has 2 entries |
| Tab closed cleanup | `chrome.tabs.onRemoved` fires for tab A | `tabInjections.get(tabA)` is `undefined` |
| Navigation resets tab state | `webNavigation.onCommitted` fires (main frame) | Tab injection map cleared |
| Sub-frame navigation ignored | `webNavigation.onCommitted` fires (frameId=1) | Tab injection map preserved |
| GET_STATUS includes tab context | Popup queries status | Response includes `tabContext` with matched project + injected scripts |

```javascript
describe('Multi-Tab Injection Tracking', () => {
  test('tab close cleans up injection tracking', () => {
    trackInjection(42, 'combo.js', 'MAIN');
    expect(tabInjections.has(42)).toBe(true);
    simulateTabRemoved(42);
    expect(tabInjections.has(42)).toBe(false);
  });
  test('main frame navigation resets tab state', () => {
    trackInjection(42, 'combo.js', 'MAIN');
    simulateNavigation(42, { frameId: 0 });
    expect(tabInjections.has(42)).toBe(false);
  });
  test('sub-frame navigation preserves tab state', () => {
    trackInjection(42, 'combo.js', 'MAIN');
    simulateNavigation(42, { frameId: 1 });
    expect(tabInjections.has(42)).toBe(true);
  });
});
```

### I-11: Service Worker Lifecycle Integration (v0.2)

| Test | Scenario | Expected |
|------|----------|----------|
| Message handler calls ensureInitialized | `onMessage` fires with `GET_STATUS` | `ensureInitialized()` called before handling |
| Alarm handler calls ensureInitialized | `onAlarm` fires with `marco-db-flush` | `ensureInitialized()` called, then `flushToStorage()` |
| Keepalive prevents termination | XPath recording active | `chrome.alarms.create('marco-keepalive', { periodInMinutes: 0.4 })` called |
| Keepalive stopped | XPath recording stopped | `chrome.alarms.clear('marco-keepalive')` called |
| DB flush on keepalive tick | `marco-keepalive` alarm fires | `flushToStorage()` called |

### I-12: CSP Fallback Integration (v0.2)

| Test | Scenario | Expected |
|------|----------|----------|
| MAIN world succeeds | No CSP blocking | Script injected in MAIN, `{ success: true, world: 'MAIN' }` |
| MAIN world fails, ISOLATED succeeds | CSP blocks MAIN | Fallback to ISOLATED, warning logged, `{ success: true, world: 'ISOLATED' }` |
| Both worlds fail | Script has syntax error | Error thrown, logged as `INJECTION_FAILED` |
| CSP pre-check detects strict CSP | Page has `script-src 'self'` meta tag | `{ strict: true }` returned, skip MAIN attempt |
| CSP pre-check: no CSP | No meta tag | `{ strict: false }` returned, try MAIN normally |

```javascript
describe('CSP Fallback', () => {
  test('falls back to ISOLATED when MAIN blocked by CSP', async () => {
    chrome.scripting.executeScript
      .mockRejectedValueOnce(new Error('Refused to execute due to CSP'))
      .mockResolvedValueOnce([{ result: true }]);

    const result = await injectUserScript(42, { world: 'MAIN' }, { content: '...' });
    expect(result.world).toBe('ISOLATED');
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });
});
```

### I-13: Onboarding Flow Integration (v0.2)

| Test | Scenario | Expected |
|------|----------|----------|
| Fresh install triggers onboarding | `onInstalled` with `reason: 'install'` | `chrome.tabs.create` called with welcome URL |
| Default project created on install | Fresh install | `chrome.storage.local.set` called with default-lovable project |
| First-run flag set | Fresh install | `marco_first_run_complete` set to `false` |
| First-run hint dismissed | User clicks "Got it" | `marco_first_run_complete` set to `true` |
| Update does NOT trigger onboarding | `onInstalled` with `reason: 'update'` | `chrome.tabs.create` NOT called with welcome URL |
| First-run hint not shown after dismiss | `marco_first_run_complete === true` | Hint div hidden in popup |

---

## Manual E2E Test Procedures (~21 flows)

Run in real Chrome with the extension loaded unpacked.

### Prerequisites

- Chrome with developer mode enabled
- Extension loaded from `chrome-extension/` directory
- Logged in to `lovable.dev` (valid session cookie)
- A project open in the editor

---

### E2E-01: Fresh Install & First Load

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load unpacked extension | Extension icon appears in toolbar |
| 2 | Click extension icon | Popup opens with status |
| 3 | Verify version | Header shows correct version from manifest |
| 4 | Check connection | Status card shows ✅ Online |
| 5 | Check token | Status card shows ✅ Valid (or expiry time) |
| 6 | Check config | Status card shows ✅ Loaded, source: local |
| 7 | Navigate to a project | Scripts show ✅ injected |
| 8 | Check workspace | Workspace name and credits displayed |

### E2E-02: Token Lifecycle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open popup, verify token valid | ✅ Valid with expiry |
| 2 | Open DevTools → Application → Cookies | `lovable-session-id.id` present |
| 3 | Delete the cookie manually | Cookie removed |
| 4 | Open popup | Token card: ❌ Expired or Missing |
| 5 | Error bar shows login prompt | "Session expired — please log in" |
| 6 | Refresh lovable.dev, log in again | Cookie restored |
| 7 | Open popup | Token card: ✅ Valid again |
| 8 | Verify no manual intervention needed | Auto-recovery via cookie listener |

### E2E-03: ComboSwitch Controller

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a project page | ComboSwitch panel appears (floating) |
| 2 | Verify workspace list loads | Workspaces displayed with names |
| 3 | Click a workspace name | Project moves to selected workspace |
| 4 | Use Up/Down buttons | Cycles through adjacent workspaces |
| 5 | Click Status button (💳) | Credit info updates |
| 6 | Press `/` key | Focus moves to textbox |
| 7 | Minimize panel `[−]` | Panel collapses to header only |
| 8 | Restore panel `[+]` | Panel expands back |
| 9 | Hide panel `[×]` | Panel disappears |
| 10 | Click "Reinject" in popup | Panel reappears |

### E2E-04: MacroLoop Controller

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a project page | MacroLoop panel appears |
| 2 | Click Start (or press `s`) | Loop begins, countdown visible |
| 3 | Verify cycle executes | Status updates, workspace check runs |
| 4 | Click Stop (or press `x`) | Loop stops cleanly |
| 5 | Verify credit check runs | Credit display updated |
| 6 | Use Up/Down arrows | Workspace navigation works |
| 7 | Click CSV export | CSV file downloads with workspace data |

### E2E-05: XPath Recorder

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open popup, click [🔴 Record] | Button changes to [⏹ Stop (0)] |
| 2 | Click an element on the page | Element gets red outline briefly |
| 3 | XPath copied to clipboard | Paste confirms XPath string |
| 4 | Click 3 more elements | Counter shows [⏹ Stop (4)] |
| 5 | Click [⏹ Stop] | Results expand in popup |
| 6 | Verify each entry shows XPath, tag, text | All 4 entries listed |
| 7 | Click 📋 on one entry | That XPath copied to clipboard |
| 8 | Click [Copy All XPaths] | All 4 XPaths copied (newline-separated) |
| 9 | Click [Export JSON] | JSON file downloads with structured data |
| 10 | Click [Clear] | Results list emptied |

### E2E-06: Options Page — Config Editing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options page (popup → Settings) | Full-tab page loads with sidebar |
| 2 | Navigate to Timing section | All timing values displayed |
| 3 | Change `loopIntervalMs` to 60000 | Field gets cyan border (modified) |
| 4 | Sticky save bar appears | "Unsaved changes (1 modified)" |
| 5 | Click [Save Changes] | Bar shows "✅ Saved" |
| 6 | Switch to a project tab | MacroLoop uses new 60s interval |
| 7 | Return to options, click [Reset to Defaults] | All values revert |
| 8 | Save again | Defaults applied |

### E2E-07: Options Page — XPath Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → XPaths section | All XPath fields shown |
| 2 | Click [🔍 Test] next to Transfer Button | Status shows ✅ Found (1 match) or ❌ Not found |
| 3 | Enter invalid XPath syntax `///bad` | Red border + syntax error message |
| 4 | Click [Validate] (test all) | All XPaths tested, summary shown |
| 5 | Fix a broken XPath | Status updates on next test |

### E2E-08: Logging & Export

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform several actions (switch workspace, check credits) | — |
| 2 | Open popup, click [📋 Copy Logs] | Logs copied to clipboard |
| 3 | Paste into text editor | Formatted log entries visible |
| 4 | Click [💾 Export DB] → logs.db | `.db` file downloads |
| 5 | Open in SQLite viewer | Tables visible: sessions, logs, api_calls |
| 6 | Verify session has correct version | Version matches manifest |
| 7 | Verify token values are REDACTED | No full tokens in any column |

### E2E-09: Error Recovery — Offline

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Disconnect network (airplane mode or DevTools throttling → Offline) | — |
| 2 | Open popup | Connection card: 📡 Offline |
| 3 | Badge shows yellow `!` | — |
| 4 | Attempt credit check | Fails gracefully, uses cached data |
| 5 | Reconnect network | — |
| 6 | Open popup | Connection card: ✅ Online |
| 7 | Credits auto-refresh | Fresh data loaded |

### E2E-10: Error Recovery — Storage Full

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fill storage near quota (inject test data) | — |
| 2 | Trigger a log flush | Storage full error caught |
| 3 | Open popup | Error bar: "Storage full" |
| 4 | Click [Prune Now] or go to options → Data → [Prune Old Sessions] | Old sessions deleted |
| 5 | Verify logging resumes | New entries persist |

### E2E-11: Script Injection Rules

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Scripts | Default rules visible |
| 2 | Disable combo rule | Toggle OFF |
| 3 | Navigate to a project page | Only macro-loop panel appears (no combo) |
| 4 | Re-enable combo rule | Toggle ON |
| 5 | Click [Reinject] in popup | Combo panel appears |
| 6 | Add a new rule for `/settings` path | New rule card appears |
| 7 | Navigate to settings page | New script injected (if script file exists) |

### E2E-12: Remote Config

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Remote | Remote toggle OFF |
| 2 | Add endpoint URL | Endpoint card appears |
| 3 | Click [Test] | Response preview shown (or error) |
| 4 | Enable remote toggle | — |
| 5 | Save changes | Config fetched from remote on next interval |
| 6 | Verify merged values | Changed values reflected in Timing/XPaths sections |

### E2E-13: Version Update

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Note current version in popup | e.g., v1.0.0 (build 1) |
| 2 | Run `build.ps1` to bump BUILD | manifest.json updated |
| 3 | Click "Reload" on `chrome://extensions` | Extension reloads |
| 4 | Open popup | New version displayed |
| 5 | Check console for update log | "Updated from v1.0.0.1 to v1.0.0.2" |

### E2E-14: Factory Reset

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Data | Reset section visible |
| 2 | Click [💣 Factory Reset] | Confirmation modal with "type RESET" |
| 3 | Type `RESET`, confirm | All data cleared |
| 4 | Popup shows default state | No workspace, fresh session |
| 5 | Config reverts to bundled defaults | All options at default values |

### E2E-15: SPA Navigation Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a project page | Both panels visible |
| 2 | Click browser back/forward | SPA navigation occurs |
| 3 | Verify panels survive | Panels still attached to DOM |
| 4 | Navigate to a non-project page (e.g., settings) | Panels may hide (based on injection rules) |
| 5 | Navigate back to project | Panels re-appear (re-injection or DOM survival) |

### E2E-16: Project Creation & URL Rule Matching (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Projects | Default "Lovable Automation" project visible |
| 2 | Click [+ New Project] | Empty project form opens |
| 3 | Enter name: "Internal Tools" | Name field populated |
| 4 | Add URL rule: prefix match `https://internal.example.com/` | Rule card added |
| 5 | Permission prompt appears (if not in host_permissions) | Chrome permission dialog shown |
| 6 | Grant permission | Rule saved with green checkmark |
| 7 | Add a script binding: select uploaded script | Script bound to project |
| 8 | Save project | Toast: "Project saved" |
| 9 | Navigate to `https://internal.example.com/dashboard` | Script injects on the page |
| 10 | Open popup | Shows matched project "Internal Tools" with injected script status |

### E2E-17: Script Upload & Management (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Scripts & Configs | Script library shown |
| 2 | Click [Upload Script] or drag-drop a `.js` file | File uploaded, appears in list |
| 3 | Verify file metadata | Name, size, last modified shown |
| 4 | Bind script to a project | Script appears in project's script bindings |
| 5 | Navigate to matching page | Script injects and runs |
| 6 | Upload a new version of the same script | Old version replaced, notification shown |
| 7 | Delete the script | Script removed from library and all project bindings |

### E2E-18: ZIP Export for Diagnostics (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open options → Data Management | Export section visible |
| 2 | Click [📦 Export Diagnostic ZIP] | ZIP file downloads |
| 3 | Extract ZIP contents | Contains: logs.db, errors.db, config.json, session-summary.json |
| 4 | Verify session-summary.json | Has version, session count, timestamp, active errors |
| 5 | Verify logs.db | Opens in SQLite viewer, contains recent sessions |
| 6 | Verify no raw tokens in any file | All token fields show REDACTED |

### E2E-19: First-Run Onboarding (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Install extension fresh (or clear all data + reload) | Welcome tab opens automatically |
| 2 | Welcome page shows getting started info | Lists pre-configured scripts, quick start steps, permissions |
| 3 | Click [Open Settings] | Options page opens |
| 4 | Close welcome tab | — |
| 5 | Open popup | First-run hint banner visible at top |
| 6 | Click [Got it] on hint | Banner disappears permanently |
| 7 | Close and reopen popup | Hint banner does NOT reappear |

### E2E-20: Multi-Tab Context (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Tab A: `lovable.dev/projects/abc` | Scripts inject |
| 2 | Open Tab B: `lovable.dev/settings` | No scripts inject (different URL rules) |
| 3 | Focus Tab A, open popup | Shows "Lovable Automation" project, injected scripts with green status |
| 4 | Focus Tab B, open popup | Shows "No matching rule for this page" or settings-specific project |
| 5 | Open Tab C: `chrome://extensions` | Popup shows "Extension cannot run on this page" |
| 6 | Close Tab A | — |
| 7 | Focus Tab B, open popup | Tab A's injection state is cleaned up (no stale data) |

### E2E-21: CSP Fallback Visual Indicator (v0.2)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a project with a URL rule for a CSP-strict page | Rule saved |
| 2 | Bind a script set to `world: 'MAIN'` | Script binding configured |
| 3 | Navigate to the CSP-strict page | Script attempts MAIN, falls back to ISOLATED |
| 4 | Open popup | Script shows `ISO⚠` badge instead of `MAIN` |
| 5 | Hover over badge | Tooltip: "Fell back from MAIN due to page CSP" |
| 6 | Check console logs | Warning logged: "Script 'x' fell back to ISOLATED world due to CSP on {url}" |

---

## Regression Checklist (Pre-Release)

Run before every version bump. Mark each item ✅ or ❌:

```
## Core Functionality
[ ] Extension loads without errors in chrome://extensions
[ ] Popup opens and shows correct version
[ ] Token auto-reads from cookie (no manual paste)
[ ] ComboSwitch: workspace list loads, switch works
[ ] MacroLoop: start/stop cycle, credit check
[ ] XPath Recorder: record 3+ elements, export works
[ ] Options page: all sections load, save works
[ ] Config changes apply to content scripts without reload

## Projects & Scripts (v0.2)
[ ] Default project exists and matches lovable.dev URLs
[ ] Create/edit/delete custom project works
[ ] URL rule matching (exact, prefix, regex) works
[ ] Script upload, binding, and injection works
[ ] Multi-tab: popup shows correct project per active tab
[ ] Optional permission prompt for non-default domains

## Logging & Export
[ ] Log export (copy + .db download) works
[ ] ZIP diagnostic export includes all expected files
[ ] No full tokens visible in any log output

## Error Recovery
[ ] Offline → online recovery works
[ ] Service worker wake-up rehydrates DBs correctly
[ ] CSP fallback: MAIN → ISOLATED with indicator
[ ] No console errors in background service worker
[ ] No console errors in content scripts

## Version & Display
[ ] Version matches manifest in all display locations
[ ] BUILD number increments on commit (git hook)
[ ] First-run onboarding shows on fresh install only
```

---

## CI Pipeline (Future)

```
git push
    │
    ▼
GitHub Actions
    ├── npm install + vitest run (unit + integration)
    ├── ESLint + type check
    ├── Bundle size check (sql.js WASM < 1.5 MB total)
    └── Build extension ZIP artifact
```

Not implemented in Phase 1. Unit and integration tests run locally via `npx vitest run`.
