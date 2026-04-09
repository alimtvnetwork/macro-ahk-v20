# Spec: Standalone Script Assets Pipeline — CSS, LESS, HTML Templates

**Version**: v1.0.0
**Date**: 2026-03-22
**Status**: Planning

---

## 1. Overview

Extend the standalone scripts system to support **per-script assets**:
- **LESS → CSS compilation**: Each script can have a `less/` folder with LESS files compiled to CSS at build time
- **HTML Templates**: Each script can have an `templates/` folder with HTML template files containing variables
- **CSS Injection**: Chrome extension automatically injects compiled CSS for each script alongside the JS
- **Dist-centric deployment**: All build artifacts (JS, CSS, compiled templates) go to `dist/` — Chrome extension picks up from `dist/` only
- **Dynamic prompt loading**: Prompts fetched from Chrome extension SQLite via bridge API instead of static JSON preamble

---

## 2. Folder Structure (Per Script)

```
standalone-scripts/
├── macro-controller/
│   ├── src/                    # TypeScript source (existing)
│   ├── less/                   # NEW: LESS source files
│   │   ├── panel.less
│   │   ├── buttons.less
│   │   └── variables.less      # Shared LESS variables (theme tokens)
│   ├── templates/              # NEW: HTML template files
│   │   ├── about-modal.html    # Template with {{variables}}
│   │   ├── toast.html
│   │   └── _partials/          # Reusable partial templates
│   │       └── credit-bar.html
│   ├── dist/                   # ALL compiled output
│   │   ├── macro-looping.js    # Compiled IIFE (existing)
│   │   ├── macro-looping.css   # Compiled from LESS
│   │   └── templates.json      # Compiled template registry
│   ├── 01-macro-looping.js     # LEGACY: Keep as-is, DO NOT remove
│   ├── 02-macro-controller-config.json  # LEGACY: Keep as-is
│   ├── 03-macro-prompts.json   # LEGACY: Keep as-is
│   ├── 04-macro-theme.json     # LEGACY: Keep as-is
│   ├── src/instruction.ts       # Project manifest (sole source of truth)
│   └── readme.md
├── xpath/
│   ├── src/
│   ├── less/                   # Optional per script
│   ├── dist/
│   └── src/instruction.ts
```

---

## 3. Script Manifest Extension

```json
{
  "name": "macroController",
  "version": "1.56.0",
  "outputFile": "macro-looping.js",
  "world": "MAIN",
  "isGlobal": false,
  "dependencies": ["xpath"],
  "loadOrder": 2,
  "assets": {
    "css": "macro-looping.css",
    "templates": "templates.json"
  },
  "description": "MacroLoop automation controller."
}
```

The `assets` field is optional. If present:
- `css`: relative path (within `dist/`) to compiled CSS file
- `templates`: relative path to compiled template registry JSON

---

## 4. LESS Compilation

### 4.1 Build Pipeline

Each script's `less/` folder is compiled during `npm run build:<script-name>`:

1. **Entry point**: `less/index.less` (or all `.less` files if no index)
2. **Compiler**: `lessc` (npm package `less`)
3. **Output**: `dist/<script-name>.css`
4. **Source maps**: Generated alongside CSS for debugging

### 4.2 LESS Variable System

```less
// less/variables.less — Maps to theme tokens
@panel-bg: var(--marco-panel-bg, #1e1e2e);
@panel-border: var(--marco-panel-border, #313147);
@btn-radius: 8px;
@btn-height: 34px;
@glow-check: 0 0 14px rgba(255,95,109,0.35);

// Gradients
@grad-check: linear-gradient(135deg, #FF5F6D, #FFC371);
@grad-credits: linear-gradient(135deg, #FFB300, #FF6F00);
```

### 4.3 Integration

The compiled CSS uses CSS custom properties that map to `window.__MARCO_THEME__` tokens. The injection handler sets these properties on the host element before CSS loads.

---

## 5. HTML Templating System

### 5.1 Template Format

```html
<!-- templates/about-modal.html -->
<div class="marco-modal" data-template="about-modal">
  <h2>{{title}}</h2>
  <p>Version: {{version}}</p>
  <div class="credits">{{creditBar}}</div>
  {{#if showAdvanced}}
    <div class="advanced">{{advancedContent}}</div>
  {{/if}}
</div>
```

### 5.2 Variable Syntax

| Syntax | Description |
|--------|-------------|
| `{{varName}}` | Simple variable substitution |
| `{{#if condition}}...{{/if}}` | Conditional block |
| `{{#each items}}...{{/each}}` | Loop over array |
| `{{> partialName}}` | Include a partial template |

### 5.3 Compilation

At build time, templates are compiled into a JSON registry:

```json
{
  "about-modal": {
    "html": "<div class=\"marco-modal\">...",
    "variables": ["title", "version", "creditBar", "showAdvanced", "advancedContent"]
  },
  "toast": {
    "html": "...",
    "variables": ["message", "level", "icon"]
  }
}
```

### 5.4 Runtime API

```typescript
// In macro controller source
import { renderTemplate } from './template-engine';

const html = renderTemplate('about-modal', {
  title: 'MacroLoop Controller',
  version: VERSION,
  creditBar: buildCreditBarHtml(),
  showAdvanced: isDebugMode,
  advancedContent: debugPanel
});
modalEl.innerHTML = html;
```

---

## 6. CSS Injection in Chrome Extension

### 6.1 Injection Flow

When the Chrome extension injects a script:

1. Resolve script dependencies (existing)
2. **NEW**: Check `instruction.json` for `assets.css`
3. If CSS asset exists, inject it via `chrome.scripting.insertCSS()`
4. Inject JS script (existing)

### 6.2 Script Injection Handler Changes

```typescript
// In background/handlers/script-injection-handler.ts
async function injectScript(tabId: number, script: ScriptEntry) {
  // 1. Inject CSS first (if asset exists)
  if (script.manifest?.assets?.css) {
    const cssPath = `projects/scripts/${script.folder}/${script.manifest.assets.css}`;
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: [cssPath]
    });
  }
  
  // 2. Inject JS (existing flow)
  await chrome.scripting.executeScript({ ... });
}
```

### 6.3 Chrome Extension Storage Browser

Add a "CSS" section alongside existing storage categories:
- Shows injected CSS files per project/script
- Preview compiled CSS
- Toggle CSS injection on/off per script

---

## 7. Dist-Centric Deployment

### 7.1 Current Flow (Legacy)

```
src/*.ts → Vite → dist/macro-looping.js → cp → 01-macro-looping.js
Chrome extension reads: 01-macro-looping.js (root level)
```

### 7.2 New Flow

```
src/*.ts    → Vite → dist/macro-looping.js
less/*.less → lessc → dist/macro-looping.css
templates/* → compiler → dist/templates.json
Chrome extension reads: dist/* (all artifacts)
```

### 7.3 Legacy File Preservation

Root-level files (`01-macro-looping.js`, `02-*.json`, etc.) remain **untouched** for backward compatibility. The `dist/` folder is the sole source of truth for the Chrome extension's `copyProjectScripts` Vite plugin.

### 7.4 PowerShell (`run.ps1`) Changes

```powershell
# For each script folder:
# 1. Compile TypeScript → dist/*.js (existing)
# 2. NEW: Compile LESS → dist/*.css
# 3. NEW: Compile templates → dist/templates.json
# 4. Copy dist/ contents to chrome-extension/dist/projects/scripts/<name>/
```

---

## 8. Dynamic Prompt Loading

### 8.1 Current Flow (Legacy)

```
03-macro-prompts.json → window.__MARCO_PROMPTS__ (preamble injection)
Macro controller reads window.__MARCO_PROMPTS__ on init
```

### 8.2 New Flow

```
Macro controller → postMessage({ type: 'GET_PROMPTS' })
  → Content script relay
  → Background handler
  → SQLite query (Prompts + Categories tables)
  → Returns JSON array matching 03-macro-prompts.json schema
  → Macro controller populates dropdown
```

### 8.3 Fallback Chain

1. **Primary**: Chrome extension bridge API (`GET_PROMPTS`)
2. **Secondary**: `window.__MARCO_PROMPTS__` (if bridge unavailable)
3. **Tertiary**: Hardcoded minimal fallback (existing)

---

## 9. Build Configuration Changes

### 9.1 New Dependencies

```
less           — LESS → CSS compiler
```

### 9.2 Vite Config Updates

`vite.config.macro.ts`:
- Add LESS compilation step (pre-build)
- Copy templates to dist
- Update `copyProjectScripts` plugin to include `dist/*.css` and `dist/*.json`

### 9.3 Package.json Scripts

```json
{
  "build:macro-controller": "npm run build:macro-less && tsc --noEmit ... && vite build ...",
  "build:macro-less": "lessc standalone-scripts/macro-controller/less/index.less standalone-scripts/macro-controller/dist/macro-looping.css"
}
```

---

## 10. Task Breakdown

### Phase 1: Foundation (Dist + Manifest)
- **T-1**: Create `less/` and `templates/` folder structure for macro-controller
- **T-2**: Assets are now declared in `instruction.ts` (no separate manifest needed)
- **T-3**: Update `copyProjectScripts` Vite plugin to read from `dist/` only
- **T-4**: Update `run.ps1` to deploy from `dist/` folder

### Phase 2: LESS Pipeline
- **T-5**: Install `less` npm dependency
- **T-6**: Create LESS variable file mapping theme tokens
- **T-7**: Extract inline button/panel styles to LESS
- **T-8**: Add LESS compilation to build pipeline
- **T-9**: Verify CSS output and injection

### Phase 3: CSS Injection
- **T-10**: Add CSS injection support to script injection handler
- **T-11**: Add CSS section to Chrome extension storage browser
- **T-12**: Test CSS injection alongside JS injection

### Phase 4: HTML Templating
- **T-13**: Build template compiler (Handlebars-like syntax)
- **T-14**: Create `renderTemplate()` runtime API
- **T-15**: Extract About modal and Toast to templates
- **T-16**: Add template compilation to build pipeline

### Phase 5: Dynamic Prompts
- **T-17**: Add `GET_PROMPTS` message handler in Chrome extension background
- **T-18**: Update macro controller to request prompts via bridge
- **T-19**: Implement fallback chain (bridge → preamble → hardcoded)
- **T-20**: Remove static JSON preamble injection for prompts

---

*Spec v1.0.0 — 2026-03-22*
