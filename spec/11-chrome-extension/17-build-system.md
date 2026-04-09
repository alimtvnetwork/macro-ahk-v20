# Chrome Extension — Build System

**Version**: v1.1.0  
**Date**: 2026-02-28  
**Fixes**: Risk R-02 (No Build System Specified)

---

## Purpose

Define the exact build toolchain, configuration files, entry points, output structure, and dev/prod workflows for the Chrome Extension. An AI or developer following this spec should produce a buildable, loadable unpacked extension on the first attempt.

---

## Technology Choice: Vite (Plain, No @crxjs)

**Why Vite**: Native TypeScript support, fast rebuild in watch mode, `vite-plugin-static-copy` for WASM binary.

**Why NOT @crxjs/vite-plugin**: v2 is permanently stuck in beta, causes cryptic build failures, and adds a fragile abstraction over the manifest. The plain Vite approach uses custom plugins to copy `manifest.json` (with path rewriting) and icons to `dist/`, which is 100% stable and transparent.

**Alternative considered**: Webpack — heavier config, slower builds, more boilerplate. Rejected.

---

## Project Structure

```
chrome-extension/                    ← Root of the extension project
├── src/
│   ├── background/
│   │   ├── index.ts                 ← Service worker entry point
│   │   ├── message-router.ts        ← Centralized message handler
│   │   ├── db-manager.ts            ← SQLite/OPFS persistence
│   │   ├── cookie-reader.ts         ← chrome.cookies token resolution
│   │   ├── project-matcher.ts       ← URL rule matching engine
│   │   ├── project-matcher.ts       ← URL rule matching engine
│   │   ├── injector.ts             ← Programmatic injection coordinator
│   │   └── state-manager.ts        ← Rehydration from chrome.storage.session
│   │
│   ├── content-scripts/
│   │   └── error-wrapper.ts         ← User script try/catch wrapper
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   │
│   ├── options/
│   │   ├── options.html
│   │   ├── options.ts
│   │   ├── options.css
│   │   └── sections/
│   │       ├── projects.ts
│   │       ├── scripts.ts
│   │       ├── configs.ts
│   │       ├── general.ts
│   │       ├── timing.ts
│   │       ├── xpaths.ts
│   │       ├── auth.ts
│   │       ├── logging.ts
│   │       ├── remote.ts
│   │       ├── data.ts
│   │       └── about.ts
│   │
│   ├── shared/
│   │   ├── types.ts                 ← All TypeScript interfaces (Project, UrlRule, etc.)
│   │   ├── messages.ts              ← Message type enum + payload types (see 18-message-protocol.md)
│   │   ├── constants.ts             ← Storage keys, limits, defaults
│   │   └── utils.ts                 ← SHA-256 hash, UUID, validation helpers
│   │
│   └── assets/
│       ├── icons/
│       │   ├── icon-16.png
│       │   ├── icon-48.png
│       │   └── icon-128.png
│       └── wasm/
│           └── sql-wasm.wasm        ← Copied from node_modules/sql.js/dist/
│
├── manifest.json                    ← Manifest V3 (source of truth)
├── vite.config.ts
├── tsconfig.json
├── package.json                     ← Extension-specific (NOT the Lovable app's)
└── readme.md
```

---

## manifest.json (Canonical)

```json
{
  "manifest_version": 3,
  "name": "Marco Automation",
  "version": "1.0.0.0",
  "description": "Browser automation for Lovable workspace and credit management",
  "permissions": [
    "cookies",
    "scripting",
    "storage",
    "unlimitedStorage",
    "webNavigation",
    "downloads",
    "tabs",
    "alarms",
    "activeTab"
  ],
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://api.lovable.dev/*",
    "https://*.lovable.app/*"
  ],
  "optional_permissions": [
    "management"
  ],
  "optional_host_permissions": [
    "https://*/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "src/assets/icons/icon-16.png",
      "48": "src/assets/icons/icon-48.png",
      "128": "src/assets/icons/icon-128.png"
    }
  },
  "options_page": "src/options/options.html",
  "icons": {
    "16": "src/assets/icons/icon-16.png",
    "48": "src/assets/icons/icon-48.png",
    "128": "src/assets/icons/icon-128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["src/assets/wasm/sql-wasm.wasm"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Note**: The manifest references `src/` paths for readability. A custom Vite plugin (`copyManifest`) rewrites these to `dist/` output paths (e.g., `background/index.js`, `popup/popup.html`) during build. No `@crxjs/vite-plugin` is used.

---

## vite.config.ts

```typescript
import { defineConfig, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

/** Copies manifest.json to dist/ with src/ paths rewritten to output paths. */
function copyManifest(): Plugin { /* see vite.config.ts */ }

/** Copies icon PNGs to dist/assets/icons/. */
function copyIcons(): Plugin { /* see vite.config.ts */ }

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [
      viteStaticCopy({
        targets: [{ src: 'node_modules/sql.js/dist/sql-wasm.wasm', dest: 'wasm' }],
      }),
      copyManifest(),
      copyIcons(),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: isDev,
      minify: isDev ? false : 'esbuild',
      rollupOptions: {
        input: {
          'background/index': resolve(__dirname, 'src/background/index.ts'),
          'popup/popup': resolve(__dirname, 'src/popup/popup.html'),
          'options/options': resolve(__dirname, 'src/options/options.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
  };
});
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## package.json (Extension)

```json
{
  "name": "marco-chrome-extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build --mode production",
    "build:dev": "vite build --mode development",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "sql.js": "^1.10.0",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vite-plugin-static-copy": "^1.0.0"
  }
}
```

---

## Build Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run dev` | Watch mode for development, rebuilds on file change | `dist/` (unminified, sourcemaps) |
| `npm run build` | Production build | `dist/` (minified, no sourcemaps) |
| `npm run build:dev` | One-shot dev build | `dist/` (unminified, sourcemaps) |
| `npm run typecheck` | Type-check without emitting | No output |
| `npm run clean` | Remove build artifacts | Deletes `dist/` |

---

## Loading the Extension

### Development

```bash
cd chrome-extension
npm install
npm run dev
# → dist/ folder created and updated on every save
```

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `chrome-extension/dist/`
4. Extension loads. On file changes, Vite rebuilds automatically; click the reload button on `chrome://extensions` to pick up changes.

### Production

```bash
npm run build
# → dist/ folder ready for deployment
```

### From Parent Repo (Lovable App)

The parent `package.json` has a `build:extension` script. Update it to:

```json
{
  "scripts": {
    "build:extension": "cd chrome-extension && npm install && npm run build"
  }
}
```

---

## WASM Binary Handling

The `sql-wasm.wasm` binary must be available at runtime. The build handles this via:

1. `vite-plugin-static-copy` copies `node_modules/sql.js/dist/sql-wasm.wasm` to `dist/wasm/`
2. `web_accessible_resources` in manifest makes it available to the service worker
3. At runtime, the service worker loads it via:

```typescript
const SQL = await initSqlJs({
  locateFile: (file: string) => chrome.runtime.getURL(`wasm/${file}`)
});
```

---

## Entry Points Summary

| Entry Point | Source | Build Output | Purpose |
|-------------|--------|-------------|---------|
| Service Worker | `src/background/index.ts` | `dist/background/index.js` | Background logic, message router, DB, auth |
| Popup | `src/popup/popup.html` + `.ts` | `dist/popup/popup.html` + `.js` | Extension popup UI |
| Options | `src/options/options.html` + `.ts` | `dist/options/options.html` + `.js` | Full settings page |
| Injector | `src/background/injector.ts` | `dist/background/injector.js` | Programmatic injection coordinator |

**Note**: There are NO static `content_scripts` in the manifest. All injection is programmatic via `chrome.scripting.executeScript`. See `05-content-script-adaptation.md` v0.2.

---

*Build system specification v1.1.0 — 2026-02-28*
