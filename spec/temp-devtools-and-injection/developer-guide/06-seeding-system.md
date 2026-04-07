# 06 — Seeding System

> How `instruction.json` and `seed-manifest.json` drive automatic script registration.

---

## Overview

Seeding is the process of registering scripts, configs, and project metadata into `chrome.storage.local` so the injection pipeline knows what to load and where to find it. The system uses a **declarative manifest** generated at build time.

## Seed Manifest

At build time, `scripts/generate-seed-manifest.mjs` scans all projects and generates:

```
chrome-extension/dist/projects/seed-manifest.json
```

### Manifest Structure

```json
{
    "version": "1.0.0",
    "generatedAt": "2026-04-03T...",
    "projects": [
        {
            "name": "xpath",
            "displayName": "XPath Utilities",
            "version": "1.0.0",
            "description": "...",
            "basePath": "projects/scripts/xpath",
            "isGlobal": true,
            "isRemovable": false,
            "loadOrder": 1,
            "dependencies": [],
            "targetUrls": ["*"],
            "scripts": [
                {
                    "id": "default-xpath",
                    "file": "xpath.js",
                    "name": "XPath Utilities",
                    "version": "1.0.0",
                    "world": "MAIN",
                    "isIife": true
                }
            ],
            "configs": [],
            "css": [],
            "templates": []
        }
    ]
}
```

## How Seeding Works

1. **On extension install/update**, the background service worker calls `seedFromManifest()`
2. The seeder fetches `seed-manifest.json` via `chrome.runtime.getURL()`
3. For each project in the manifest:
   - **Scripts** → upserted into storage with file paths (not embedded code)
   - **Configs** → upserted with JSON content fetched from extension files
   - **CSS** → registered for `chrome.scripting.insertCSS()` injection
   - **Templates** → registered for window global injection
4. Upsert is **idempotent** — re-running the seeder with the same manifest produces no changes

## Storage Schema

### Scripts

```typescript
interface StoredScript {
    id: string;
    name: string;
    version: string;
    filePath: string;       // Relative to extension root
    isAbsolute: number;     // 0 = relative, 1 = absolute URL
    isEnabled: number;
    world: "MAIN" | "ISOLATED";
    loadOrder: number;
    dependencies: string;   // JSON array of project names
}
```

### Configs

```typescript
interface StoredConfig {
    id: string;
    name: string;
    key: string;
    content: string;        // JSON string of the config data
    injectAs?: string;      // Window global name
}
```

## Adding a New Project to Seeding

Simply create a valid `instruction.ts` with a `seed` block in your project's `src/` folder. The build pipeline will:

1. Compile `instruction.ts` → `dist/instruction.json`
2. Include the project in `seed-manifest.json` generation
3. Copy artifacts to `chrome-extension/dist/projects/scripts/{name}/`

No seeder code modifications needed — the manifest-driven system discovers projects automatically.

> **Note:** `instruction.ts` is the sole manifest — no separate `script-manifest.json` is required.

## Prompt Seeding

Prompts follow a separate path:

1. Aggregated from `standalone-scripts/prompts/` → `dist/prompts/macro-prompts.json`
2. Deployed to `chrome-extension/dist/prompts/`
3. On boot: **full wipe + reseed** — all rows cleared from Prompts tables, then re-inserted
4. User-created prompts are **not preserved** across deployments
