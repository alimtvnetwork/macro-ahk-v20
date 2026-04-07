# Issue #15: Deploy Does Not Reload Extension When Browser Is Running

**Status**: FIXED  
**Version**: v1.0.4  
**Severity**: High — forces manual reload on every deploy  
**Category**: Toolchain / Deployment  

## Symptom

Running `.\run.ps1 -d` or `.\run.ps1 -d -v` builds the extension but does NOT reload it in Chrome when the browser is already running. The script opens `chrome://extensions/` and tells the user to manually click the ↻ reload button. This breaks the deploy workflow — the user expects the extension to be live after the script completes.

## Root Cause

The `Deploy-Extension` function in `run.ps1` has three strategy tiers:

| Condition | Strategy | Auto-reload? |
|---|---|---|
| Chrome < v137, not running | `--load-extension` cold start | ✅ Yes |
| Chrome v137+, not running | Launch + open `chrome://extensions` | ❌ No (manual) |
| Chrome already running | Open `chrome://extensions` in new tab | ❌ No (manual) |

**Two out of three strategies require manual intervention.** Since Chrome is almost always running during development, the user is stuck clicking ↻ reload after every single build.

### Why `--load-extension` doesn't work when Chrome is running

Chrome's `--load-extension` CLI flag only works on cold start (no existing Chrome processes). When Chrome is already running, the new process just sends the URL to the existing instance and exits — the flag is ignored entirely.

### No existing auto-reload mechanism

The build script writes a `.reload-signal` file (line 612-613) but nothing reads it. The extension has no mechanism to detect when its own dist/ files have been updated.

## Fix: Build-Meta Polling Hot Reload

### How it works

1. **Vite plugin** (`generateBuildMeta`) writes `dist/build-meta.json` on every build:
   ```json
   { "buildId": "a1b2c3d4", "timestamp": "2026-03-12T18:30:00.000Z" }
   ```

2. **Service worker module** (`hot-reload.ts`) polls `chrome.runtime.getURL('build-meta.json')` every 2 seconds

3. On first poll → stores the `buildId` as baseline

4. On subsequent polls → if `buildId` changes → calls `chrome.runtime.reload()`

5. The extension automatically reloads with the new build — no manual click needed

### Why this works

When an extension is loaded from a folder (via `--load-extension` or "Load unpacked"), Chrome reads files directly from that folder. So `fetch(chrome.runtime.getURL('build-meta.json'))` reads the ACTUAL file on disk, not a cached copy. When the build updates `dist/build-meta.json`, the next poll sees the new content.

### Safety

- If `build-meta.json` doesn't exist → polling quietly stops (production builds)
- If fetch fails (network error, file deleted) → silently skipped
- Polling only runs in the service worker (no popup/content script overhead)
- 2-second interval is lightweight for a simple JSON fetch

## Rules

- **RULE-DEPLOY-1**: Every build MUST generate `build-meta.json` in dist/ with a unique buildId.
- **RULE-DEPLOY-2**: The service worker MUST poll for build-meta changes and auto-reload when detected.
- **RULE-DEPLOY-3**: The hot-reload mechanism MUST be safe for production (graceful no-op when build-meta.json is absent).

## Files Changed

- `chrome-extension/vite.config.ts` — Added `generateBuildMeta()` plugin
- `chrome-extension/src/background/hot-reload.ts` — Build-meta polling and auto-reload
- `chrome-extension/src/background/service-worker-main.ts` — Import hot-reload module
- `run.ps1` — Updated deploy messaging to reflect auto-reload capability
- `chrome-extension/manifest.json` — Added `build-meta.json` to `web_accessible_resources`
