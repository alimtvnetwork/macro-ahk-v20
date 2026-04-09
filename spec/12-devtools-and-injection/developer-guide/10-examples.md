# 10 — Complete Examples

> Step-by-step walkthroughs for building new projects.

---

## Example A: Minimal Project (Single JS, No Config)

A simple script that monitors a page element and logs changes.

### Step 1: Create project folder

```
standalone-scripts/page-monitor/
├── src/
│   ├── index.ts
│   └── instruction.ts
└── readme.md
```

### Step 2: `src/instruction.ts`

```typescript
import type { SeedBlock } from "../../marco-sdk/src/instruction";

export interface ProjectInstruction {
    schemaVersion: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    world: "MAIN" | "ISOLATED";
    dependencies: string[];
    loadOrder: number;
    seed: SeedBlock;
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{ file: string; key: string; injectAs?: string }>;
        scripts: Array<{ file: string; order: number; configBinding?: string; themeBinding?: string; isIife?: boolean }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "page-monitor",
    displayName: "Page Monitor",
    version: "1.0.0",
    description: "Monitor page elements and log changes",
    world: "MAIN",
    dependencies: ["xpath"],
    loadOrder: 3,
    seed: {
        id: "default-page-monitor",
        seedOnInstall: true,
        isRemovable: true,
        autoInject: false,
        runAt: "document_idle",
        cookieBinding: "lovable-session-id.id",
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        cookies: [],
        settings: {},
    },
    assets: {
        css: [],
        configs: [],
        scripts: [
            { file: "page-monitor.js", order: 1, isIife: true },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
```

### Step 4: `src/index.ts`

```typescript
(function pageMonitor() {
    // Idempotency guard
    if ((window as any).__PAGE_MONITOR_LOADED__) return;
    (window as any).__PAGE_MONITOR_LOADED__ = true;

    const TAG = "[page-monitor]";

    async function init() {
        console.log(TAG, "Initializing v1.0.0");

        // Wait for the target element
        const target = await marco.utils.waitForElement({
            selector: "#content",
            timeoutMs: 10000,
        });

        if (!target) {
            console.warn(TAG, "Target element not found");
            marco.notify.warning("Page Monitor: target element not found");
            return;
        }

        // Set up mutation observer
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                console.log(TAG, "DOM changed:", mutation.type, mutation.target);
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        console.log(TAG, "Monitoring started");
        marco.notify.success("Page Monitor active");
    }

    init().catch((err) => {
        console.error(TAG, "Init failed:", err);
        marco.notify.error("Page Monitor failed: " + err.message);
    });
})();
```

### Step 5: Add build script

In root `package.json`:

```json
{
    "scripts": {
        "build:page-monitor": "vite build --config vite.config.page-monitor.ts"
    }
}
```

### Step 6: Build and deploy

```bash
npm run build:page-monitor
npm run build:ext
```

The project is automatically discovered, included in `seed-manifest.json`, and deployed to `chrome-extension/dist/projects/scripts/page-monitor/`.

---

## Example B: Full Project (CSS, Config, Theme, Templates)

A dashboard overlay with customizable theme and config.

### Step 1: Create project folder

```
standalone-scripts/dashboard-overlay/
├── src/
│   ├── index.ts
│   └── instruction.ts
├── less/
│   └── dashboard-overlay.less
├── templates/
│   └── panel.html
└── readme.md
```

### Step 2: `src/instruction.ts`

```typescript
import type { SeedBlock } from "../../marco-sdk/src/instruction";

// (ProjectInstruction interface same as Example A)

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "dashboard-overlay",
    displayName: "Dashboard Overlay",
    version: "1.0.0",
    description: "Customizable dashboard overlay with credit display",
    world: "MAIN",
    dependencies: ["xpath"],
    loadOrder: 4,
    seed: {
        id: "default-dashboard-overlay",
        seedOnInstall: true,
        isRemovable: true,
        autoInject: false,
        runAt: "document_idle",
        cookieBinding: "lovable-session-id.id",
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        cookies: [],
        settings: {},
        configSeedIds: {
            config: "default-dashboard-overlay-config",
            theme: "default-dashboard-overlay-theme",
        },
    },
    assets: {
        css: [
            { file: "dashboard-overlay.css", inject: "head" },
        ],
        configs: [
            { file: "dashboard-config.json", key: "config", injectAs: "__DASHBOARD_CONFIG__" },
            { file: "dashboard-theme.json", key: "theme", injectAs: "__DASHBOARD_THEME__" },
        ],
        scripts: [
            {
                file: "dashboard-overlay.js",
                order: 1,
                configBinding: "config",
                themeBinding: "theme",
                isIife: true,
            },
        ],
        templates: [
            { file: "templates.json", injectAs: "__DASHBOARD_TEMPLATES__" },
        ],
        prompts: [],
    },
};

export default instruction;
```

### Step 4: Config files

**`dashboard-config.json`**:
```json
{
    "refreshIntervalMs": 30000,
    "showCredits": true,
    "position": "bottom-right"
}
```

**`dashboard-theme.json`**:
```json
{
    "presets": {
        "dark": {
            "colors": {
                "panelBg": "#1a1a2e",
                "panelBorder": "#6366f1",
                "text": "#e2e8f0"
            }
        }
    }
}
```

### Step 5: LESS stylesheet

```less
// less/dashboard-overlay.less
@panel-bg: #1a1a2e;
@panel-border: #6366f1;
@text-color: #e2e8f0;

.dashboard-overlay {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 99998;
    background: @panel-bg;
    border: 1px solid @panel-border;
    border-radius: 8px;
    padding: 12px;
    color: @text-color;
    font-family: monospace;
    font-size: 12px;
}
```

### Step 6: Template

```html
<!-- templates/panel.html -->
<div class="dashboard-overlay" id="dashboard-panel">
    <div class="dashboard-header">Dashboard</div>
    <div class="dashboard-credits">Credits: <span id="credit-display">--</span></div>
    <button id="dashboard-refresh">↻ Refresh</button>
</div>
```

### Step 7: `src/index.ts`

```typescript
(function dashboardOverlay() {
    if ((window as any).__DASHBOARD_OVERLAY_LOADED__) return;
    (window as any).__DASHBOARD_OVERLAY_LOADED__ = true;

    const TAG = "[dashboard-overlay]";
    const config = (window as any).__DASHBOARD_CONFIG__ || {};
    const templates = (window as any).__DASHBOARD_TEMPLATES__ || {};

    async function init() {
        console.log(TAG, "Initializing v1.0.0");

        // Inject template
        const panelHtml = templates["panel"];
        if (panelHtml) {
            document.body.insertAdjacentHTML("beforeend", panelHtml);
        }

        // Fetch and display credits
        if (config.showCredits) {
            await refreshCredits();
            setInterval(refreshCredits, config.refreshIntervalMs || 30000);
        }

        // Refresh button
        const refreshBtn = document.getElementById("dashboard-refresh");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", refreshCredits);
        }

        marco.notify.success("Dashboard overlay loaded");
    }

    async function refreshCredits() {
        try {
            const resp = await marco.api.credits.fetchWorkspaces();
            if (resp.ok) {
                const display = document.getElementById("credit-display");
                if (display) {
                    display.textContent = JSON.stringify(resp.data);
                }
            }
        } catch (err) {
            console.error(TAG, "Credit fetch failed:", err);
        }
    }

    init().catch((err) => {
        console.error(TAG, "Init failed:", err);
        marco.notify.error("Dashboard overlay failed: " + err.message);
    });
})();
```

---

## Checklist for New Projects

- [ ] Created `standalone-scripts/{name}/` with `src/index.ts` and `src/instruction.ts`
- [ ] `instruction.ts` includes `schemaVersion`, `seed` block, and all asset declarations
- [ ] Added `build:{name}` script to root `package.json`
- [ ] Set `dependencies` in instruction.ts (at minimum: `["xpath"]`)
- [ ] Set `loadOrder` higher than all dependencies
- [ ] Added idempotency guard in `src/index.ts`
- [ ] Used `[{name}]` prefix for all console logs
- [ ] Tested in browser console that `marco.*` APIs work
- [ ] Verified the project appears in `seed-manifest.json` after build
