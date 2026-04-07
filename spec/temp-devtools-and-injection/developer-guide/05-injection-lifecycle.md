# 05 — Injection Lifecycle

> How scripts are loaded and executed in the browser.

---

## 7-Stage Lifecycle

### Stage 1: Dependency Resolution

1. Background reads script entries from `chrome.storage.local`
2. `resolveDependencies()` scans each script's `dependencies[]`
3. Missing dependencies are auto-resolved from the script store
4. All scripts are topologically sorted by `loadOrder` (lower = first)
5. Circular dependencies throw a hard error with the cycle path logged

### Stage 2: Namespace Bootstrapping

```javascript
window.RiseupAsiaMacroExt ??= { Projects: {} };
```

The root namespace is created if it doesn't exist. Each project registers its sub-namespace under `Projects.{CodeName}`.

### Stage 3: Relay Installation

The content script relay is installed in the ISOLATED world. It listens for `postMessage` events from the MAIN world and forwards them to the background via `chrome.runtime.sendMessage`.

### Stage 4: IIFE Execution

Scripts are injected via `chrome.scripting.executeScript` with `world: "MAIN"`. Each script is a self-contained IIFE — no module imports at runtime.

### Stage 5: Script-to-Script Communication

Scripts communicate via the shared `window.RiseupAsiaMacroExt` namespace and the `marco.*` SDK. The SDK is always injected first (loadOrder: 0).

### Stage 6: CSP Fallback Handling

If Content Security Policy blocks `chrome.scripting.executeScript`, the system falls back to injecting via a `<script>` element with the code as `textContent`.

### Stage 7: Dynamic Loading (Runtime)

Scripts can be dynamically loaded at runtime via the injection handler. This supports hot-reloading during development.

---

## Asset Injection Order

For each project, assets are injected in this strict sequence:

```
1. CSS          → chrome.scripting.insertCSS({ files: [...] })
2. JSON configs → fetch() → inject as window.__MARCO_CONFIG__ = {...}
3. Templates    → fetch() → inject as window.__MARCO_TEMPLATES__ = {...}
4. Prompts      → seeded into SQLite (background process)
5. JavaScript   → chrome.scripting.executeScript({ files: [...] })
```

## Cross-Project Ordering

Projects are injected in `loadOrder` sequence:

| Project | loadOrder | Dependencies |
|---------|-----------|-------------|
| marco-sdk | 0 | none |
| xpath | 1 | none |
| macro-controller | 2 | xpath |

The SDK (`marco-sdk`) always loads first because it creates `window.marco` which all other projects depend on.

## Path Resolution

Scripts store **file paths** in storage, not embedded code. At injection time:

```javascript
if (script.isAbsolute) {
    url = script.filePath;                          // Use as-is (external URL)
} else {
    url = chrome.runtime.getURL(script.filePath);   // Resolve relative to extension
}
// Fetch code from URL; fallback to script.code if fetch fails
```

### Example stored paths:

| Script | FilePath | IsAbsolute |
|--------|----------|------------|
| `xpath.js` | `projects/scripts/xpath/xpath.js` | 0 |
| `macro-looping.js` | `projects/scripts/macro-controller/macro-looping.js` | 0 |

## Settings

| Key | Value | Purpose |
|-----|-------|---------|
| `ExtensionBasePath` | `chrome-extension://{id}/` | Base URL for resolving relative file paths |
