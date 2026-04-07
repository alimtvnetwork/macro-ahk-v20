# Issue #31: HTML Entry Points Output to Wrong Path in dist/

**Version:** v1.0.0 toolchain  
**Date:** 2026-03-02  
**Status:** Resolved  
**Priority:** HIGH — Extension fails to load popup and options pages.

---

## Issue Summary

### What happened
After building the Chrome Extension, the `dist/manifest.json` referenced `popup/popup.html` and `options/options.html`, but Vite output the HTML files to `dist/src/popup/popup.html` and `dist/src/options/options.html` (preserving the `src/` directory prefix). Chrome could not find the popup or options pages.

Additionally, the deploy function copied files into Chrome's `Extensions/` directory, which Chrome ignores for unpacked extensions — causing "Service worker registration failed. Status code: 11" because Chrome was reading the source `manifest.json` (with `src/background/index.ts`) instead of the built `dist/manifest.json`.

### Where it happened
- **Feature:** Extension build pipeline + deploy
- **Files:** `chrome-extension/vite.config.ts` (copyManifest plugin), `run.ps1` (Deploy-Extension)
- **Functions:** `copyManifest()` path rewriting, `Deploy-Extension()`

### Symptoms and impact
- Chrome showed "Service worker registration failed. Status code: 11"
- Manifest displayed `src/background/index.ts` (source path) instead of `background/index.js` (built path)
- Extension did not appear in `chrome://extensions` after deploy
- Popup and options pages returned 404 even when extension was manually loaded

### How it was discovered
User loaded the extension and observed the service worker error in `chrome://extensions` error log, with the manifest showing unrewritten `src/` paths highlighted.

---

## Root Cause Analysis

### Direct cause (Build)
Vite treats HTML entry points differently from JS/TS entry points in multi-page builds:

- **JS/TS entries**: The Rollup input key determines the output path. `'background/index': resolve(__dirname, 'src/background/index.ts')` outputs to `dist/background/index.js`. ✓
- **HTML entries**: Vite preserves the file's path relative to the project root. `'popup/popup': resolve(__dirname, 'src/popup/popup.html')` outputs to `dist/src/popup/popup.html` (not `dist/popup/popup.html`). ✗

The `copyManifest()` plugin assumed HTML outputs would follow the same key-based naming as JS entries, rewriting paths to `popup/popup.html` and `options/options.html` — but the actual files were at `src/popup/popup.html` and `src/options/options.html` (relative to `dist/`).

### Direct cause (Deploy)
The `Deploy-Extension()` function copied `dist/*` into `Chrome\User Data\<Profile>\Extensions\Marco_Automation\1.0.0.0\`. Chrome does not load extensions from this location — it only recognizes:
1. Web Store extensions (stored by CRX ID in `Extensions/`)
2. Unpacked extensions registered via `chrome://extensions` UI or `--load-extension` CLI flag

### Contributing factors
1. No automated test validated that manifest paths matched actual `dist/` file paths.
2. The Vite documentation on multi-page HTML output path behavior is not prominently documented.
3. The deploy approach was modeled after Web Store extension installation structure, not the unpacked developer workflow.

### Triggering conditions
- Any build + deploy cycle.
- The error is deterministic — 100% failure rate.

### Why existing guardrails did not prevent it
- The build itself succeeded (exit code 0) — Vite does not validate manifest path references.
- The preflight system checked package resolution but not output path correctness.
- The deploy function verified `manifest.json` existed but not that its internal paths matched actual files.

---

## Fix Description

### What was changed

**File: `chrome-extension/vite.config.ts`** — Updated `copyManifest()` path rewriting to match actual Vite HTML output paths:

```typescript
// BEFORE — ❌ Assumed HTML follows key-based naming
manifest.action.default_popup = 'popup/popup.html';
manifest.options_page = 'options/options.html';

// AFTER — ✓ Matches actual Vite output (preserves src/ prefix for HTML)
manifest.action.default_popup = 'src/popup/popup.html';
manifest.options_page = 'src/options/options.html';
```

**File: `run.ps1`** — Rewrote `Deploy-Extension()` to use Chrome's `--load-extension` flag:

```powershell
# BEFORE — ❌ Copied to Extensions/ folder (Chrome ignores this for unpacked)
Copy-Item -Recurse -Force "$extDistPath\*" $extVersionDir

# AFTER — ✓ Launches Chrome with --load-extension pointing to dist/
$launchArgs = @(
    "--load-extension=`"$extDistAbsolute`""
    "--profile-directory=`"$ProfileFolder`""
)
Start-Process -FilePath $browserExe -ArgumentList $launchArgs
```

### Why this resolves the root cause
1. Manifest paths now match Vite's actual output structure (`src/popup/popup.html` instead of `popup/popup.html`).
2. Chrome loads the extension directly from `dist/` via `--load-extension`, which implicitly enables developer mode and registers it as an unpacked extension.

---

## Iterations History

**Iteration 1 (final):** Corrected manifest path rewriting + rewrote deploy to `--load-extension`.
- Result: Extension loads successfully. Popup and options pages resolve correctly.

---

## Prevention and Non-Regression

### Prevention rules

> **RULE 1 (Build):** When rewriting manifest paths in `copyManifest()`, always verify the target path exists in `dist/` after build. HTML entries in Vite preserve their `src/` directory structure — never assume they follow the Rollup input key naming.

> **RULE 2 (Deploy):** Never copy extension files to Chrome's `Extensions/` folder for unpacked development. Always use `--load-extension` CLI flag to register unpacked extensions.

### Anti-pattern reference
```typescript
// ❌ WRONG — assumes HTML output follows input key
manifest.action.default_popup = 'popup/popup.html';

// ✓ CORRECT — matches actual Vite output path
manifest.action.default_popup = 'src/popup/popup.html';
```

```powershell
# ❌ WRONG — Chrome ignores manually placed files in Extensions/
Copy-Item -Recurse "$distPath\*" "$profileDir\Extensions\MyExt\1.0.0\"

# ✓ CORRECT — Chrome loads and registers the unpacked extension
Start-Process chrome.exe "--load-extension=`"$distPath`""
```

### Acceptance criteria / test scenarios
1. Run `.\run.ps1 -d` — Chrome launches with extension visible in toolbar.
2. Click extension icon — popup renders correctly.
3. Right-click extension → Options — options page renders correctly.
4. Inspect `dist/manifest.json` — `default_popup` is `src/popup/popup.html`, `options_page` is `src/options/options.html`, `service_worker` is `background/index.js`.
5. Verify `dist/src/popup/popup.html` and `dist/src/options/options.html` exist as files.

### Guardrails
- Consider adding a post-build validation step that checks every path in `dist/manifest.json` resolves to an actual file in `dist/`.

### References
- `chrome-extension/vite.config.ts` — manifest path rewriting
- `run.ps1` — Deploy-Extension function
- `spec/17-app-issues/30-esm-dynamic-require-build-failure.md` — related build issue

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root cause and prevention rules documented
- [x] Anti-pattern reference included
- [x] Both build and deploy fixes applied
- [x] Iterations history included

---

*Issue #31 — Resolved 2026-03-02*
