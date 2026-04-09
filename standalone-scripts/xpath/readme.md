# XPath Utilities — Standalone Script

**Version**: 1.0.0  
**Author**: Marco Extension Team  
**Type**: Global shared utility (loaded before all dependent scripts)

## Purpose

Provides reusable XPath query and DOM interaction utilities for all injected scripts. Loaded once per tab as `window.XPathUtils`, eliminating duplication across scripts.

## API (`window.XPathUtils`)

| Method | Signature | Description |
|--------|-----------|-------------|
| `getByXPath` | `(xpath: string) => Node \| null` | Returns first node matching XPath |
| `getAllByXPath` | `(xpath: string) => Node[]` | Returns all nodes matching XPath |
| `findElement` | `(descriptor: ElementDescriptor) => Element \| null` | Multi-method element search (XPath → text → CSS → ARIA) |
| `reactClick` | `(el: Element, callerXpath?: string) => void` | Dispatches full pointer/mouse event sequence for React compatibility |
| `version` | `string` | Library version |
| `setLogger` | `(log, logSub, warn) => void` | Attach external logging functions |

## Build

```bash
npm run build:xpath
```

Compiles `src/index.ts` → `dist/xpath.js` (IIFE, exposes `window.XPathUtils`).

## Dependency Graph

```
xpath.js (global, no dependencies)
  ↑
macroController.js (depends on xpath)
  ↑
future-scripts...
```

## dist Output

After `run.ps1 -d`, the compiled script is placed at:

```
chrome-extension/dist/projects/scripts/xpath.js
```
