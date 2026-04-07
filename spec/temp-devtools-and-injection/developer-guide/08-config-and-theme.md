# 08 — Config & Theme System

> Runtime configuration injection, theme variables, and LESS pipeline.

---

## Runtime Config Injection

JSON config files declared in `instruction.ts` are injected as `window` globals before JavaScript executes:

```typescript
// instruction.ts
configs: [
    { file: "macro-looping-config.json", key: "config", injectAs: "__MARCO_CONFIG__" },
    { file: "macro-theme.json", key: "theme", injectAs: "__MARCO_THEME__" },
],
```

At injection time, the extension:
1. Fetches the JSON file from `chrome.runtime.getURL()`
2. Injects it as a window global: `window.__MARCO_CONFIG__ = { ... }`
3. The script can then read it directly or via `marco.config.get(key)`

## Config File Structure

### `macro-looping-config.json` (Example)

```json
{
    "loopEnabled": true,
    "maxRetries": 5,
    "delayBetweenLoopsMs": 3000,
    "targetUrl": "https://example.com/*",
    "features": {
        "autoScroll": true,
        "captureScreenshots": false
    }
}
```

## Reading Config at Runtime

```javascript
// Via window global (synchronous, available immediately after injection)
const config = window.__MARCO_CONFIG__;
const maxRetries = config.maxRetries;

// Via SDK (asynchronous, fetches from storage)
const maxRetries2 = await marco.config.get("maxRetries");
const allConfig = await marco.config.getAll();
```

## Updating Config at Runtime

```javascript
// Persist + broadcast change
await marco.config.set("maxRetries", 10);

// Listen for changes (from any source)
marco.config.onChange((key, value) => {
    console.log(`Config changed: ${key} = ${value}`);
    if (key === "loopEnabled" && !value) {
        stopLoop();
    }
});
```

## Theme System

### `macro-theme.json` Structure

```json
{
    "presets": {
        "dark": {
            "colors": {
                "primary": "#6366f1",
                "background": "#0a0a0f",
                "surface": "#1a1a2e",
                "text": "#e2e8f0",
                "success": "#22c55e",
                "warning": "#eab308",
                "error": "#ef4444",
                "status": {
                    "errorBg": "#4a1515",
                    "errorPale": "#fca5a5",
                    "warningBg": "#3d3d1e",
                    "successBg": "#1a3d33"
                },
                "toast": {
                    "info": { "bg": "#1a1a3d", "border": "#3b82f6", "text": "#93c5fd" }
                }
            }
        }
    }
}
```

### Theme Injection

```javascript
// Injected as window global
const theme = window.__MARCO_THEME__;
const darkColors = theme.presets.dark.colors;

// The notify module automatically reads theme colors for toast styling
marco.notify.info("Themed toast!");
```

## LESS Pipeline

### Variables → CSS Custom Properties

LESS source files (`less/{name}.less`) can define variables that map to CSS custom properties:

```less
// less/macro-looping.less
@primary: #6366f1;
@bg-surface: #1a1a2e;

.marco-panel {
    background: @bg-surface;
    border-color: @primary;
}
```

Compiled to `dist/{name}.css` and injected into `<head>` before JavaScript runs.

### Template System

Templates in `templates/` are compiled to `dist/templates.json` and injected as `window.__MARCO_TEMPLATES__`:

```javascript
const tpl = window.__MARCO_TEMPLATES__;
const panelHtml = tpl["control-panel"];  // Key = filename without extension
document.body.insertAdjacentHTML("beforeend", panelHtml);
```

## Config Binding in Scripts

Scripts can declare which config they depend on via `configBinding` and `themeBinding`:

```typescript
scripts: [
    {
        file: "macro-looping.js",
        order: 1,
        configBinding: "config",   // Ensures __MARCO_CONFIG__ is injected first
        themeBinding: "theme",     // Ensures __MARCO_THEME__ is injected first
        isIife: true,
    },
],
```

The injection pipeline guarantees that bound configs are available as window globals before the script executes.
