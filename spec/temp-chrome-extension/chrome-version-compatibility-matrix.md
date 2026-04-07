# Chrome Version Compatibility Matrix

**Extension**: Marco Automation v1.16.0
**Manifest Version**: 3
**Last Updated**: 2026-03-15

---

## Minimum Requirements

| Requirement | Value | Reason |
|-------------|-------|--------|
| **Manifest V3** | Chrome 88+ | MV3 support introduced |
| **`chrome.scripting`** | Chrome 88+ | Programmatic script injection API |
| **Service Worker** | Chrome 93+ | `type: "module"` support in background |
| **`wasm-unsafe-eval` CSP** | Chrome 96+ | Required for sql.js (SQLite WASM) |
| **`chrome.storage.session`** | Chrome 102+ | Used for transient state (network status) |
| **`chrome.commands` customization** | Chrome 35+ | Keyboard shortcut registration |
| **OPFS (Origin Private File System)** | Chrome 102+ | Preferred SQLite persistence backend |
| **Effective minimum** | **Chrome 102+** | Union of all required APIs |

---

## Deployment Strategy by Version

| Chrome Version | `--load-extension` | Deployment Method | Notes |
|----------------|-------------------|-------------------|-------|
| **102–136** | ✅ Supported | Cold launch via `run.ps1 -d` | Full automatic loading |
| **137+** (branded) | ❌ Disabled | Manual load or hot-reload | `--load-extension` removed from branded Chrome |
| **Chrome for Testing** | ✅ Supported | Cold launch via `run.ps1 -d` | Download with `run.ps1 -dl` |
| **Microsoft Edge** | ✅ Supported | Cold launch via `run.ps1 -d -e edge` | Chromium-based, full compatibility |

### Workarounds for Chrome 137+

1. **First install**: Manually load unpacked via `chrome://extensions/`
2. **Subsequent deploys**: Hot-reload polls `build-meta.json` every 1s, auto-reloads on buildId change
3. **Alternative**: Use Chrome for Testing (`run.ps1 -dl`) which retains `--load-extension`
4. **Alternative**: Deploy to Edge (`run.ps1 -d -e edge`)

---

## API Compatibility Matrix

| API | Min Version | Used For | Fallback |
|-----|-------------|----------|----------|
| `chrome.scripting.executeScript` | 88 | Script injection into tabs | None (required) |
| `chrome.webNavigation.onCompleted` | 88 | Auto-injection trigger | None (required) |
| `chrome.storage.local` | 88 | Projects, scripts, configs | None (required) |
| `chrome.storage.session` | 102 | Transient state (network status) | Graceful degradation |
| `chrome.cookies.get` | 88 | Session-bridge auth token resolution | None (auth fails gracefully) |
| `chrome.contextMenus` | 88 | Right-click project/script menu | None (menu absent) |
| `chrome.commands` | 88 | Keyboard shortcuts (Ctrl+Shift+↓) | None (shortcut unavailable) |
| `chrome.alarms` | 88 | Keepalive tick (30s), flush, prune | None (required for persistence) |
| `chrome.downloads` | 88 | SQLite bundle export | None (export fails gracefully) |
| `navigator.storage.getDirectory` (OPFS) | 102 | Primary SQLite persistence | Falls back to `chrome.storage.local` |
| `WebAssembly` + `wasm-unsafe-eval` | 96 | sql.js SQLite engine | None (required) |

---

## SQLite Persistence Fallback Chain

| Priority | Backend | Min Version | Condition |
|----------|---------|-------------|-----------|
| 1 | OPFS | Chrome 102+ | `navigator.storage.getDirectory()` available |
| 2 | `chrome.storage.local` | Chrome 88+ | OPFS unavailable (serialized DB binary) |
| 3 | In-memory | Any | Both OPFS and storage fail (no persistence) |

---

## Known Version-Specific Issues

| Chrome Version | Issue | Severity | Status |
|----------------|-------|----------|--------|
| 137+ (branded) | `--load-extension` CLI flag removed | Medium | Mitigated via hot-reload + Chrome for Testing |
| Any | DevTools must be open for `InjectViaDevTools` (AHK) | Low | Extension uses `chrome.scripting` instead |
| 102–104 | OPFS API may have early bugs | Low | Falls back to storage.local automatically |

---

## Tested Configurations

| Browser | Version Range | OS | Status |
|---------|---------------|-----|--------|
| Chrome (branded) | 120–137+ | Windows 10/11 | ✅ Primary target |
| Chrome for Testing | Latest | Windows 10/11 | ✅ Recommended for dev |
| Microsoft Edge | 120+ | Windows 10/11 | ✅ Supported |
| Chromium (unbranded) | 102+ | Any | ⚠️ Expected to work (untested) |
| Firefox | — | — | ❌ Not supported (MV3 differences) |
| Safari | — | — | ❌ Not supported |

---

## Manifest Permissions

```json
{
  "permissions": [
    "contextMenus",    // Right-click menu
    "cookies",         // Session-bridge auth
    "scripting",       // Programmatic injection
    "storage",         // Project/config persistence
    "unlimitedStorage",// Large SQLite DBs
    "webNavigation",   // Auto-injection on navigation
    "downloads",       // Bundle export
    "tabs",            // Active tab queries
    "alarms",          // Keepalive, flush, prune
    "activeTab"        // Current tab access
  ],
  "optional_permissions": ["management"],
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://api.lovable.dev/*",
    "https://*.lovable.app/*"
  ]
}
```

---

## Content Security Policy

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self';
```

- `'self'`: Standard extension script loading
- `'wasm-unsafe-eval'`: Required for sql.js WebAssembly compilation (Chrome 96+)
- No `'unsafe-eval'`: User scripts use indirect eval `(0, eval)(code)` via `chrome.scripting.executeScript` in the page's MAIN world, which bypasses extension CSP

---

## Recommendation

**For development**: Use Chrome for Testing (download via `run.ps1 -dl`) to avoid `--load-extension` restrictions in Chrome 137+.

**For end users**: Any Chromium-based browser ≥ v102 works. Chrome 120+ recommended for best stability.
