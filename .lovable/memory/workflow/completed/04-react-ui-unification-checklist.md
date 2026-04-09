# React UI Unification — Migration Checklist

**Created**: 2026-03-15
**Updated**: 2026-03-16
**Goal**: Single React codebase for Chrome extension popup, options, and browser preview.
**Architecture**: Full monorepo with adapter pattern, big-bang cutover, separate extension theme.

---

## Phase 1: Foundation ✅

### Step 1: PlatformAdapter Interface ✅
- [x] Create `src/platform/platform-adapter.ts` — core interface (`sendMessage`, `storage`, `tabs`, `getExtensionUrl`)
- [x] Create `src/platform/chrome-adapter.ts` — real `chrome.*` implementation with retry logic
- [x] Create `src/platform/preview-adapter.ts` — mock implementation with in-memory storage + stub data
- [x] Create `src/platform/index.ts` — factory with `getPlatform()` auto-detection
- [x] Create `src/platform/chrome-api-types.ts` — ambient `chrome` namespace for preview build
- [x] Verify preview build passes (`tsc --noEmit`)

### Step 2: Move Shared Types to `src/shared/` ✅
- [x] Copy all 8 files from `chrome-extension/src/shared/` → `src/shared/`
- [x] Replace `chrome-extension/src/shared/*` with thin re-exports (307 import sites preserved)
- [x] Verify preview build passes
- [x] Verify extension typecheck passes

---

## Phase 2: Build Pipeline ✅

### Step 3: Extension Vite Config (MPA) ✅
- [x] Create `vite.config.extension.ts` at project root
- [x] Configure MPA entry points: React `popup.html` + React `options.html`
- [x] Configure background service worker bundle (no code-splitting)
- [x] Port `manualChunks` logic to prevent dynamic `import()` in SW context
- [x] Port post-build validators (dynamic import scan, manifest copy, icons, build-meta)

### Step 4: Separate Extension Theme ✅
- [x] Create `src/styles/extension-theme.css` with Dark+ design tokens (HSL variables)
- [x] Update `chrome-extension/tailwind.config.js` with semantic token mappings
- [x] Refactor `src/popup/popup.css` to use token references (no raw hex)
- [x] Create `src/options/options.css` — tokenized Dark+ stylesheet

### React Popup PoC ✅
- [x] Create `src/popup/PopupApp.tsx` — React popup with header, status cards, health ping, project selector
- [x] Create `src/popup/popup-entry.tsx` — React mount point
- [x] Uses `getPlatform().sendMessage()` for all data fetching

---

## Phase 3: Migrate Background & Content Scripts (Partially Done)

### Step 5: Move Background to `src/background/` ✅
- [x] Copy 56 files from `chrome-extension/src/background/` → `src/background/` (including `handlers/`, `seed-chunks/`)
- [x] Rewrite all `@/background/` imports in handlers to relative paths (`../`)
- [x] Rewrite all `@/shared/` imports to relative paths (`../../shared/`, `../shared/`)
- [x] Generate 56 re-export shims at `chrome-extension/src/background/`
- [x] Update `vite.config.extension.ts` entry to `src/background/index.ts`
- [x] Simplify `manualChunks` to match `/src/background/` and `/src/shared/`
- [x] Exclude `src/background/` from `tsconfig.app.json` (needs `@types/chrome`)
- **Note**: `chrome-extension/vite.config.ts` manualChunks still works — catches both shim and canonical paths

### Step 6: Move Content Scripts to `src/content-scripts/` ✅
- [x] Move `chrome-extension/src/content-scripts/` → `src/content-scripts/`
- [x] Update re-exports in extension directory
- [x] Add content-scripts as build entries in both vite configs
- [x] Exclude `src/content-scripts/` from `tsconfig.app.json` (uses `chrome.*` APIs)
- **Note**: 5 files in `src/content-scripts/` (xpath-strategies, xpath-recorder, network-reporter, message-relay, prompt-injector); shims use same pattern as background. Both vite configs now include xpath-recorder, network-reporter, and message-relay as build entries. prompt-injector is used inline via `chrome.scripting.executeScript`, not as a standalone entry.

---

## Phase 4: React UI Migration ✅

### Step 7: Convert Popup to React ✅
- [x] Create `src/popup/PopupApp.tsx` as React root
- [x] Uses `getPlatform().sendMessage()` for all data fetching
- [x] Create `popup.html` entry point with React mount
- [x] Wire into extension Vite config

### Step 8: Convert Options Page to React ✅
- [x] Create `src/options/OptionsApp.tsx` — sidebar + section routing + top bar + footer
- [x] Port all 4 sections: ProjectsSection, ScriptsLibrary, DiagnosticsPanel, AboutSection
- [x] Port ProjectEditor with URL rules, scripts, cookies, variables editors
- [x] Create Toast shared component
- [x] Add Framer Motion transitions (sidebar spring indicator, section AnimatePresence, staggered editor)
- [x] Update `vite.config.extension.ts` to point options entry to React `src/options/options.html`

### Step 9: Delete Legacy Plain HTML/TS/CSS ✅
- [x] Deleted `chrome-extension/src/popup/` — 13 files (popup.html, popup.ts, popup.css, popup-status.ts, popup-utils.ts, popup-actions.ts, popup-debug-panel.ts, popup-force-inject.ts, popup-injection-results.ts, popup-panel-reveal.ts, popup-scripts.ts, popup-sqlite-bundle.ts, popup-action-log.ts)
- [x] Deleted `chrome-extension/src/options/` — 25 files (options.html, options.ts, options.css, and all options-*.ts modules)
- [x] Updated `chrome-extension/vite.config.ts` popup/options entries to point to React HTML files in `src/`
- **Note**: Re-export shims in `chrome-extension/src/shared/` kept — still needed for background shim chain

---

## Phase 5: Validation & Polish

### Step 10: End-to-End Verification
- [ ] Load extension in Chrome, verify popup opens and displays status
- [ ] Verify options page loads all tabs (projects, scripts, diagnostics, about)
- [ ] Verify project CRUD (create, edit, duplicate, delete, import/export)
- [ ] Verify script CRUD + toggle + injection
- [ ] Verify XPath recorder toggle
- [ ] Verify log export (JSON + ZIP)
- [ ] Verify SQLite bundle import/export
- [ ] Verify context menu actions
- [ ] Verify hot-reload poller still detects new builds
- [ ] Verify preview environment renders same UI with mock data

### Step 11: Migrate `src/lib/message-client.ts` ✅
- [x] Replace custom chrome detection with `getPlatform().sendMessage()`
- [x] Remove duplicate mock response data (now in `preview-adapter.ts`)
- [x] All 10 consumer files unchanged — `sendMessage` signature preserved as thin wrapper

### Step 12: Update Documentation & Memory ✅
- [x] Update `plan.md` with UI unification progress
- [x] Update memory files for new directory structure
- [ ] Move this checklist to `.lovable/memory/workflow/completed/` when all steps done
- [x] Update `changelog.md` with v1.18.0 migration summary
- [x] Bump version in `manifest.json` (1.18.0.0), `EXTENSION_VERSION` (1.18.0)

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| SW dynamic `import()` | Post-build validator scans background bundle |
| CSP violation in extension pages | No `unsafe-eval`; React works without it |
| 307 import sites break | Re-export shims preserve all existing paths |
| Mock data drift | Single `preview-adapter.ts` is canonical mock source |
| Theme inconsistency | Separate `extension-theme.css` with Dark+ tokens |
| Manifest path mismatch | `copyManifest()` plugin rewrites paths at build time |
| Background tsconfig errors | `src/background/` excluded from preview tsconfig |

---

## File Count Summary

| Location | Files | Status |
|----------|-------|--------|
| `src/platform/` | 5 | ✅ Created |
| `src/shared/` | 8 | ✅ Created (canonical) |
| `chrome-extension/src/shared/` | 8 | ✅ Re-export shims |
| `src/styles/` | 1 | ✅ `extension-theme.css` |
| `src/popup/` | 4 | ✅ React PoC |
| `src/options/` | 14 | ✅ Full React port |
| `src/background/` | 56 | ✅ Canonical (moved from chrome-extension) |
| `chrome-extension/src/background/` | 56 | ✅ Re-export shims |
| `src/content-scripts/` | 5 | ✅ Canonical (xpath-strategies, xpath-recorder, network-reporter, message-relay, prompt-injector) |
| `chrome-extension/src/content-scripts/` | 4 | ✅ Re-export shims (+ .gitkeep) |
