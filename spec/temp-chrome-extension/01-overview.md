# Chrome Extension — Overview Specification

**Version**: v0.3 (Phase 5 Update)
**Date**: 2026-02-28
**Status**: Phases 1–5 complete, Phase 6 remaining

---

## Purpose

Replace the AHK v2 desktop automation layer with a **Chrome Extension** that natively runs in the browser. This eliminates the dependency on Windows, AutoHotkey, DevTools Console injection, and clipboard-based paste pipelines.

---

## Goals

1. **Zero AHK dependency** — The extension runs entirely in Chrome; no desktop executable needed
2. **Native cookie access** — Read `lovable-session-id.id` directly via Chrome `cookies` API (no HttpOnly restriction)
3. **Embedded JS controllers** — Ship `combo.js` and `macro-looping.js` as content scripts or extension-injected scripts
4. **JSON config** — Convert `config.ini` (INI format, AHK-specific) to `config.json` for native JS consumption
5. **One-click install** — PowerShell script handles git pull + Chrome profile injection + developer mode enablement
6. **Professional branding** — Custom SVG logo for the extension icon

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               Chrome Extension (Manifest V3)                 │
│                                                               │
│  manifest.json ─── Extension manifest (permissions, scripts)  │
│       │                                                       │
│       ├── config.json ─── All settings (replaces config.ini)  │
│       │                                                       │
│       ├── background.js ─── Service worker                    │
│       │     ├── Cookie reader (lovable-session-id.id)         │
│       │     ├── Config loader (reads config.json)             │
│       │     ├── Message router (popup ↔ content scripts)      │
│       │     └── Token management (cookie → bearer)            │
│       │                                                       │
│       ├── content-scripts/                                    │
│       │     ├── combo.js ─── ComboSwitch controller            │
│       │     └── macro-looping.js ─── MacroLoop controller      │
│       │                                                       │
│       ├── popup/                                               │
│       │     ├── popup.html ─── Extension popup UI              │
│       │     ├── popup.js ─── Popup logic                       │
│       │     └── popup.css ─── Popup styling                    │
│       │                                                       │
│       ├── options/                                             │
│       │     ├── options.html ─── Settings page                 │
│       │     └── options.js ─── Config editor                   │
│       │                                                       │
│       └── icons/                                               │
│             ├── icon-16.png                                    │
│             ├── icon-48.png                                    │
│             └── icon-128.png (generated from SVG)              │
└─────────────────────────────────────────────────────────────┘
                              │
                        Direct API calls
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Lovable API Layer                           │
│                                                               │
│  GET  /user/workspaces                                        │
│  PUT  /projects/{id}/move-to-workspace                        │
│  POST /projects/{id}/mark-viewed                              │
│                                                               │
│  Auth: Bearer token (from cookie, auto-resolved)              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Changes from AHK

| Concern | AHK v2 (Current) | Chrome Extension (New) |
|---------|-------------------|----------------------|
| Config format | `config.ini` (INI) | `config.json` (JSON) |
| Config loading | AHK reads INI → replaces `__PLACEHOLDER__` tokens in JS | JS reads `config.json` directly at runtime |
| JS injection | Ctrl+Shift+J → Ctrl+V paste into DevTools Console | Content script auto-injected by Chrome |
| Cookie access | `document.cookie` (fails for HttpOnly) | `chrome.cookies.get()` API (reads all cookies) |
| Token resolution | localStorage → `document.cookie` → manual paste | `chrome.cookies` → localStorage (automatic) |
| Hotkeys | AHK `^+Up`, `^+Down` etc. | `chrome.commands` API or in-page keyboard listeners |
| Platform | Windows only | Any OS with Chrome |
| Installation | Download AHK + run script | Load unpacked extension or Chrome Web Store |
| Updates | Git pull + restart AHK | Git pull + PowerShell reload, or auto-update from CWS |

---

## What Stays the Same

1. **JS controller logic** — `combo.js` and `macro-looping.js` core logic is reused with minimal changes
2. **API endpoints** — Same Lovable API calls (`/user/workspaces`, `/move-to-workspace`)
3. **UI panels** — Same floating draggable panels injected into the page
4. **Credit formulas** — Same `calcTotalCredits()`, `calcAvailableCredits()`, `calcFreeCreditAvailable()`
5. **Workspace detection** — XPath-only detection (Project Dialog DOM → Default) — mark-viewed API removed in v7.17
6. **Smart switching** — Same `moveToAdjacentWorkspace()` logic

---

## Key Decisions (Resolved)

1. **Manifest V3** — V2 is deprecated. MV3 only.
2. **Programmatic injection only** — All scripts injected via `chrome.scripting.executeScript`. NO static `content_scripts` in manifest. See `05-content-script-adaptation.md` v0.2.
3. **Config storage** — `chrome.storage.local` for runtime config, `config.json` bundled as default
4. **Popup vs side panel** — Popup for quick actions; the main controller UI stays in-page
5. **Persistence** — OPFS-first, `chrome.storage.local` fallback. See `19-opfs-persistence-strategy.md`.
6. **Build system** — Vite + `@crxjs/vite-plugin`. See `17-build-system.md`.
7. **Config injection** — 2 methods only: Global variable (MAIN) and Message passing (both worlds). Method 3 (parameter) removed. See `20-user-script-error-isolation.md`.

---

## Scope

### Phase 1 — MVP
- [ ] `manifest.json` with permissions for `lovable.dev` and `api.lovable.dev`
- [ ] `background.js` with cookie reader for `lovable-session-id.id`
- [ ] Content scripts: adapted `combo.js` and `macro-looping.js`
- [ ] `config.json` with all settings from `config.ini`
- [ ] SVG logo → PNG icons (16, 48, 128)
- [ ] Basic popup showing status (connected/disconnected, current workspace)
- [ ] Conditional script injection via `chrome.scripting.executeScript` (see `07-advanced-features.md`)

### Phase 2 — Enhanced
- [ ] Options page for editing `config.json` settings
- [ ] `chrome.commands` for keyboard shortcuts
- [ ] Auto-update token on expiry via `chrome.cookies` listener
- [ ] Badge icon showing workspace credit status
- [ ] Remote config endpoint — fetch config from URL (see `07-advanced-features.md`)
- [ ] XPath Recorder — click-to-capture XPath tool (see `07-advanced-features.md`)

### Phase 3 — Distribution
- [ ] PowerShell installer for developer mode loading
- [ ] Chrome Web Store listing (if needed)
- [ ] Auto-update mechanism

---

## File Deliverables

| File | Description | Status |
|------|-------------|--------|
| `01-overview.md` | This file — high-level overview | ✅ v0.3 |
| `02-config-json-schema.md` | Full config.json schema (INI → JSON mapping) | ✅ v0.1 |
| `03-powershell-installer.md` | PowerShell deployment, profile detection, watch mode | ✅ v0.2 |
| `04-cookie-and-auth.md` | Cookie reading and token management | ✅ v0.1 |
| `05-content-script-adaptation.md` | Programmatic injection model, migration strategy | ✅ v0.2 |
| `06-logging-architecture.md` | SQLite logging, context fields, ZIP export, user-script errors | ✅ v0.2 |
| `07-advanced-features.md` | Remote config, conditional injection, XPath recorder | ✅ v0.1 |
| `08-version-management.md` | Versioning, micro-bump policy, git hooks, changelog | ✅ v0.2 |
| `09-error-recovery.md` | Error recovery flows, service worker lifecycle, CSP fallback | ✅ v0.2 |
| `10-popup-options-ui.md` | Popup and options page UI wireframes and flows | ✅ v0.1 |
| `11-testing-strategy.md` | Unit, integration, E2E tests, regression checklist | ✅ v0.2 |
| `12-project-model-and-url-rules.md` | Project data model, URL matching, script binding | ✅ v0.2 |
| `13-script-and-config-management.md` | Script/config upload, storage, folder watch, drag-drop | ✅ v0.2 |
| `14-gap-analysis-and-phase-plan.md` | Gap analysis (23 gaps), 6-phase plan | ✅ v0.2 |
| `15-expanded-popup-options-ui.md` | Projects CRUD, URL rule editor, drag-drop zones, multi-tab | ✅ v0.2 |
| `16-ai-implementation-risk-audit.md` | AI failure risk assessment (16 risks), 4-phase remediation plan | ✅ v1.2 |
| `17-build-system.md` | Vite build config, entry points, WASM handling, project structure | ✅ v1.0 |
| `18-message-protocol.md` | Unified message type registry with all payloads and handlers | ✅ v1.1 |
| `19-opfs-persistence-strategy.md` | OPFS-first SQLite persistence, cold-start buffer, state rehydration | ✅ v1.0 |
| `20-user-script-error-isolation.md` | Try/catch wrapper, error attribution, config Method 3 removal | ✅ v1.0 |
| `21-ai-implementation-guide.md` | Step-by-step build order (12 phases), dependency graph, pitfalls | ✅ v1.0 |
| `22-cross-spec-consistency-audit.md` | Cross-spec audit: 12 issues found and fixed, 17 consistency checks | ✅ v1.2 |
| `23-coding-guidelines.md` | Naming, boolean logic, function size, formatting, file organization, project config schema | ✅ v1.2 |

---

## Consolidated Manifest Permissions (v0.3)

The expanded feature set requires the following permissions in `manifest.json`:

```json
{
  "manifest_version": 3,
  "permissions": [
    "cookies",           // Read lovable-session-id.id HttpOnly cookie
    "scripting",         // chrome.scripting.executeScript for script injection
    "storage",           // chrome.storage.local for config, SQLite DBs, projects
    "unlimitedStorage",  // Large SQLite DBs + multiple scripts/configs
    "webNavigation",     // Detect page loads for URL rule matching
    "downloads",         // Export .db files, ZIP bundles, JSON exports
    "tabs",              // Query active tab URL for popup project matching
    "alarms",            // Keep service worker alive for SQLite operations
    "activeTab"          // Inject scripts into current tab on user action
  ],
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://api.lovable.dev/*",
    "https://*.lovable.app/*"
  ],
  "optional_permissions": [
    "management"         // For self-reload in watch/dev mode
  ],
  "optional_host_permissions": [
    "https://*/*"        // For user-defined URL rules on any domain
  ]
}
```

### Permission Justification

| Permission | Required By | Why |
|------------|-------------|-----|
| `cookies` | `04-cookie-and-auth.md` | Read HttpOnly session cookie for API auth |
| `scripting` | `12-project-model-and-url-rules.md` | Inject user scripts per URL rules |
| `storage` | `06-logging-architecture.md`, `13-script-and-config-management.md` | SQLite DBs, projects, scripts, configs |
| `unlimitedStorage` | `06-logging-architecture.md` | logs.db + errors.db + scripts can exceed 10 MB |
| `webNavigation` | `12-project-model-and-url-rules.md` | URL rule matching on navigation events |
| `downloads` | `06-logging-architecture.md` | ZIP/JSON/DB export |
| `tabs` | `15-expanded-popup-options-ui.md` | Query active tab for popup project selector |
| `alarms` | `09-error-recovery.md` | Service worker keepalive during active SQLite sessions |
| `activeTab` | `07-advanced-features.md` | XPath recorder, one-off script injection |
| `optional: management` | `03-powershell-installer.md` | `chrome.runtime.reload()` for watch mode |
| `optional: https://*/*` | `12-project-model-and-url-rules.md` | User may create URL rules for non-Lovable domains |

### Optional Permission Flow (R-14 Resolution)

> **⚠️ CRITICAL**: `chrome.permissions.request()` **MUST** be called from a user gesture context (click/keypress handler). It will silently fail or throw if called asynchronously without a gesture.

**Trigger**: The permission request is initiated by the **[Save Changes]** button click (sticky save bar) or the **[Collapse ▲]** button on the URL Rule editor — whichever the user clicks to commit their changes. The check happens synchronously in the click handler before the async save.

When a user creates a URL rule for a domain not in `host_permissions`:

```
User edits URL rule Match Value: "https://internal.example.com/*"
    │
    ▼
Live preview shows: "⚠ Permission needed for this domain"
(informational only — does NOT trigger permission request)
    │
    ▼
User clicks [Save Changes] (sticky save bar) or [Collapse ▲]
    │
    ▼
onClick handler (synchronous, user gesture context):
  1. Parse domain from matchValue
  2. Check: chrome.permissions.contains({ origins: [domain] })
     │
     ├── Already granted → save normally
     │
     └── Not granted → immediately call (same click handler):
          chrome.permissions.request({ origins: ["https://internal.example.com/*"] })
          │
          ├── Granted → save rule, show ✅
          └── Denied → save rule but mark with ⚠ icon
               Show warning: "Script injection won't work for this domain without permission.
               You can grant it later from the rule's [⚠ Grant] button."
```

**Re-grant button**: Rules saved without permission show a `[⚠ Grant]` button inline. Clicking it calls `chrome.permissions.request()` directly (user gesture).

---

## References

- Current AHK architecture: `spec/03-architecture.md`
- Current config.ini schema: `marco-script-ahk-v7.latest/specs/JSON-schema.md`
- API reference: `spec/03-data-and-api/data-schema.md`
- Workspace detection: `spec/06-macro-controller/workspace-management.md`
- Cookie diagnostic: `combo.js` → `getBearerTokenFromCookie()` function
- Gap analysis: `spec/07-chrome-extension/14-gap-analysis-and-phase-plan.md`
