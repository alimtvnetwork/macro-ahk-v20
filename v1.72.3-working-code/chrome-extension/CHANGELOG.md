# Changelog

All notable changes to the Marco Chrome Extension are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.49.0] - 2026-03-20

### Fixed
- **Check button fast path**: Skip 5s extension bridge timeout when token is already in localStorage — Check now starts instantly
- **Page guard**: Check warns user when not on a project page (XPath will fail)
- **Auth badge sync**: Badge updates to 🟢/🔴 after Check resolves/fails token
- **Progress bar delay**: Reduced Step 3 delay from 500ms to 100ms — total Check flow ~3s faster
- Macro controller version bumped to v7.37

## [1.48.0] - 2026-03-20

### Fixed
- Check button now resolves auth token before running check (Issue 46)
- Startup uses `fetchLoopCreditsAsync` with auto-detect workspace + UI update on completion
- `fetchLoopCredits` error handler now calls `updateUI()` — prevents "Initializing..." stuck state
- Empty workspace list guard in `closeDialogAndDefault` (Issue 46)
- Stopped status shows helpful hint when no workspaces are loaded

### Added
- Changelog modal in macro controller hamburger menu
- Detailed auth diagnostics on Check button flow (Step 0: auth → Step 1: detect)
- SQL injection defense-in-depth: table name allowlists on all dynamic SQL queries

### Changed
- Bumped macro-looping script to v7.35
- Version sync: extension 1.48.0, script 7.35
- Dark theme contrast: warm white (#e8e8e8) and highlight yellow (#f5e6b8) replace light blue

## [1.18.0] - 2026-03-16

### Changed — React UI Unification

Complete migration of popup and options page from plain HTML/TS/CSS to a unified React codebase sharing components between the Chrome extension and the browser preview.

#### Architecture
- **PlatformAdapter pattern** — `src/platform/` with `chrome-adapter`, `preview-adapter`, and factory (`getPlatform()`); components never call `chrome.*` directly
- **Shared types canonical** — `src/shared/` is the single source of truth; `chrome-extension/src/shared/` re-exports via shims
- **Extension Vite MPA config** — `vite.config.extension.ts` builds popup, options, background SW, and content scripts from root `src/`
- **Dark+ design token system** — `src/styles/extension-theme.css` with HSL variables; separate `chrome-extension/tailwind.config.js` for extension builds

#### Migrated Modules
- **Background scripts** — 56 files moved from `chrome-extension/src/background/` to `src/background/` with re-export shims
- **Content scripts** — 3 files (`xpath-recorder`, `xpath-strategies`, `network-reporter`) moved to `src/content-scripts/` with re-export shims
- **Message client** — `src/lib/message-client.ts` now delegates to `getPlatform().sendMessage()`, eliminating ~180 lines of duplicate mock data

#### React UI
- **React Popup** — `src/popup/PopupApp.tsx` with status cards, health ping, project selector, quick actions, debug panel
- **React Options** — 14 files porting all 4 sections (Projects, Scripts, Diagnostics, About) with full project editor (URL rules, scripts, cookies, variables)
- **Framer Motion transitions** — sidebar spring-animated indicator, section fade transitions, staggered editor entry animations
- **Legacy UI deleted** — removed 38 files from `chrome-extension/src/popup/` and `chrome-extension/src/options/`

#### Testing
- **35 smoke tests** across 5 React components (`PopupApp`, `OptionsApp`, `ProjectsSection`, `ProjectEditor`, `DiagnosticsPanel`)

### Fixed
- **CSS `@import` ordering** — moved Google Fonts `@import` before `@tailwind` directives in `extension-theme.css`
- **WASM path** — fixed `sql-wasm.wasm` copy path in `vite.config.extension.ts` to resolve from root `node_modules/`
- **Tailwind config** — added `fontFamily.heading` and `fontFamily.body` to root `tailwind.config.ts`

## [1.17.0] - 2026-03-15

### Added
- **Import preview dialog** — selecting a `.zip` bundle for import now shows a preview dialog with item counts, per-item new/overwrite diff badges, and a destructive warning for Replace All mode before confirming
- **Wired Export DB & Import buttons** — popup footer Export DB and Import buttons now trigger actual SQLite bundle export/import operations with loading states and toast feedback

## [1.16.0] - 2026-03-14

### Fixed
- **SQLite bundle schema mismatch** — standardized configs table column name to `json` in both extension and web app SQLite bundles, fixing silent data loss when importing bundles cross-context
- **Import config data loss** — `readConfigsFromDb()` now returns `json` field (matching `StoredConfig` type) instead of `data`, fixing configs being silently dropped during import
- **Meta table schema inconsistency** — aligned `meta.value` column to nullable `TEXT` in web app bundle to match extension version

## [1.15.0] - 2026-03-14

### Changed
- **Relative progress bar scaling (v7.23)** — workspace list progress bars now scale relative to the highest `totalCredits` across all visible workspaces, so bars accurately reflect capacity differences (e.g., 105-credit workspace appears ~51% width next to a 205-credit workspace). Status bar remains full-width. Issue #38.

## [1.14.0] - 2026-03-14

### Added
- **Per-project Export DB** — each project card now has an "Export DB" button that packages only the selected project plus its linked scripts and configs into a scoped SQLite ZIP (`marco-<slug>-backup.zip`)
- **Toast notifications** — replaced all native `alert()` dialogs with consistent in-app toast notifications (success/error/info variants) across the Options page

### Changed
- **Refactored `options-projects.ts`** — split 365-line file into three focused modules (`options-projects.ts`, `options-projects-actions.ts`, `options-projects-import.ts`), all under the 200-line guideline

### Fixed
- **Context menu duplicate-id errors** — added `chrome.contextMenus.removeAll()` before recreation to prevent "Cannot create item with duplicate id" errors on service worker restart

## [1.13.0] - 2026-03-14

### Fixed
- **Root-cause fix for missing import/export controls** — Options page now renders the actual extension-side controls for `Export JSON`, `Export SQLite Bundle`, and `Import SQLite Bundle`
- **Corrected implementation target** — import/export wiring now lives in `chrome-extension/src/options/*` (the codepath built by `run.ps1 -d`), not only in the root React app

### Added
- Project-card **Export JSON** action in the extension Options > Projects list
- SQLite bundle actions in Options > Projects with `Merge` and `Replace All` import modes

## [1.12.0] - 2026-03-14

### Changed
- **Animated tooltips enriched** — each footer button now has a unique color accent, dedicated icon, and staggered framer-motion entrance animation
- **Project export options split** — project cards now show separate "Export JSON" (project manifest) and "Export DB" (SQLite bundle) buttons

## [1.11.0] - 2026-03-14

### Changed
- **Shortcut tooltip upgraded** — Framer Motion spring animation, larger ↓ arrow key, gradient overlay with backdrop blur
- **OS-aware modifier key** — tooltip dynamically shows ⌘ on Mac/iOS or Ctrl on Windows/Linux
- **Copy shortcut to clipboard** — clicking the keyboard icon copies the shortcut text and shows a checkmark confirmation
- **Customize shortcut link** — tooltip footer links to `chrome://extensions/shortcuts` for remapping

## [1.10.0] - 2026-03-14

### Changed
- **Status cards simplified to single-line** — removed label/detail rows; each card now shows `[dot] Online`, `[dot] Token Valid`, `[dot] Config Hardcoded` with details in tooltip only
- **Status cards are clickable** — Connection/Token navigate to Diagnostics, Config navigates to Configs editor in Options page
- **Run shortcut updated** — all references changed from `Ctrl+Shift+R` to `Ctrl+Shift+↓` across popup, help overlay, and XPath recorder

### Added
- **JS Edit & Config Edit buttons** per script row — link-style buttons that open the Options page Scripts/Configs editor for the relevant script
- `.btn-link` CSS class for inline action links in script rows
- `.status-card-clickable` CSS class for hover/pointer cursor on status cards
- **Unit tests for popup-sqlite-bundle** — 11 tests covering import mode selection (`getSelectedImportMode`), confirmation logic for Replace All vs Merge, message routing (`SAVE_ALL_DATA` vs individual `SAVE_PROJECT/SCRIPT/CONFIG`), and ZIP parsing with sql.js/jszip mocks
- **Export split into Export Logs + Export Project + Import Project** — renamed "Export" to "Export Logs" (ZIP with logs/errors/DB), added "Export Project" button (exports active project as portable JSON via `EXPORT_PROJECT` message), added "Import Project" button with file picker and duplicate-name confirmation dialog
- Help overlay updated to document all three export/import actions

## [1.9.0] - 2026-03-14

### Added
- **Import mode selector** in popup SQLite bundle — dropdown to choose between "Merge" (upsert, default) and "Replace All" (destructive wipe + import)
- Confirmation dialog for "Replace All" mode warning about data loss
- `.import-mode-group` and `.import-mode-select` styled components in popup CSS

## [1.8.0] - 2026-03-14

### Added
- **Popup SQLite Bundle buttons** — quick-access "Export DB" and "Import DB" buttons in the extension popup for SQLite ZIP backup without opening the Options page
- `popup-sqlite-bundle.ts` — handles full export/import lifecycle (sql.js + jszip) from the popup UI
- Hidden file input for ZIP selection with merge-mode import (upsert)
- Purple-themed `.sqlite-bundle-actions` styling in popup CSS

## [1.6.0] - 2026-03-14

### Added
- **User Script Logging API** (`marco.log.info/warn/error/debug/write`) — user scripts can log structured entries into extension SQLite databases with auto-injected project/script context (Spec 42)
- **Cross-Site Data Bridge** (`marco.store.set/get/delete/keys/getAll/clear`) — async key-value store for cross-origin data sharing between scripts, with project-scoped and global namespaces (Spec 42)
- **Marco SDK auto-injection** — `window.marco` is automatically injected before every user script via `injection-wrapper.ts`
- 7 new message types: `USER_SCRIPT_LOG`, `USER_SCRIPT_DATA_SET/GET/DELETE/KEYS/GET_ALL/CLEAR`
- `user-script-log-handler.ts` — rate limiting (100/sec), sensitive metadata redaction
- `data-bridge-handler.ts` — key/value validation (256 char keys, 1MB values, 1000 keys/project)
- `marco-sdk-template.ts` — generates injectable SDK IIFE with frozen `window.marco` object
- 26 unit tests for Spec 42 handlers (user-script-log + data-bridge)
- End-to-end test plan (`marco-script-ahk-v7.latest/specs/test-plan.md`) — 22 suites, 150+ test cases

### Changed
- `injection-wrapper.ts` now injects `buildMarcoSdkScript()` before each user script

## [1.5.0] - 2026-03-13

### Added
- Browser right-click context menu with project selection, Run/Re-inject, Copy Logs, Export Logs, and Status actions
- Context menu specification document (`spec/03-imported-spec/15-chrome-extension/03-context-menu-spec.md`)
- `contextMenus` permission added to manifest
- Dynamic project submenu auto-rebuilds on project changes (SET_ACTIVE_PROJECT, SAVE_PROJECT, DELETE_PROJECT)

## [1.4.0] - 2026-03-13

### Changed
- Wired up real latency (round-trip ms) on Connection status card
- Config card now shows actual last-sync time instead of placeholder
- Refactored Popup.tsx into PopupHeader, PopupFooter, and usePopupActions hook

## [1.3.0] - 2026-03-13

### Added
- Merge import: single-project bundles can be imported without replacing all existing data
- Diff summary in bundle preview dialog showing which items are **new** vs **overwrite** with color-coded badges
- Tooltips on diff badges explaining merge/overwrite behavior
- Placeholder third line on Connection ("latency: —") and Config ("last sync: —") status cards for visual alignment
- Filled primary-styled footer action buttons (Logs, Export, Refresh)

### Changed
- Version badge made larger and more visually prominent with glow effect
- Help icon repositioned to far-right of header button group (after Settings)
- Footer buttons changed from outline to filled primary variant
- Status bar cards now all display 3 rows for consistent height alignment
- Version bumped to 1.3.0

## [1.2.0] - 2026-03-13

### Changed
- Status bar redesigned: Connection, Token, and Config now display as equal 3-column grid cards with colored indicator dots
- Version badge in popup header made prominent with primary-tinted background and mono font
- Help (?) icon repositioned to header row with green accent styling
- Footer redesigned: Logs, Export, and Refresh now render as a 3-column button grid
- Shortcut label updated to `Ctrl+Shift+↓` with `<kbd>` styling in footer
- Health state row removed from inline status bar (still available in Options dashboard)

### Added
- `<kbd>` shortcut indicator in popup footer showing the injection hotkey
- Help button in header linking to documentation

## [1.1.0] - 2026-03-12

### Added
- Comprehensive script reference spec (`spec/12-chrome-extension/40-macro-looping-script-complete-reference.md`) covering auth, credit formulas, progress bar colors, buttons, loop logic, and global API
- Emoji icons on credit labels: 🎁 Bonus, 💰 Monthly, 🔄 Rollover, 📅 Free, ⚡ Available — with detailed tooltips
- Session-bridge authentication: background script seeds `lovable-session-id` into page localStorage, bypassing HttpOnly cookie restrictions
- Auth diagnostic row (`#loop-auth-diag`) showing token source (🟢/🔴) and resolution method
- Shared `renderCreditBar(opts)` function — single source of truth for all 3 rendering sites
- Compact mode bar now shows segmented colors AND all emoji credit labels (previously single-color with ⚡ only); labels with value 0 are hidden

### Changed
- Progress bar height increased: full mode 12px → 18px, compact mode 8px → 14px
- Bar background changed to reddish tint `rgba(239,68,68,0.25)` to indicate used/depleted area
- Labels switched from letter abbreviations (`B: M: R: F:`) to emoji icons (`🎁 💰 🔄 📅`)
- Font size bumped from 10px to 11px for better readability
- Segment transitions added (`width 0.3s ease`) for smooth credit updates
- Run-scripts shortcut changed from `Ctrl+Shift+R` to `Ctrl+Shift+Down`
- Auto-load credits/workspaces delay reduced from 2s to 500ms

### Removed
- Manual bearer token paste/save UI panel (replaced by session-bridge)
- Legacy default scripts (`macro-controller.js`, `combo-switch.js`) pruned at startup

### Fixed
- `401 Authorization header required` on credits API due to HttpOnly cookie visibility
- Compact mode workspace items showing single-color bar instead of segmented colors

## [1.0.0] - 2026-02-20

### Added
- Initial release: macro-looping.js as single injected content script
- SQLite logging with logs.db + errors.db
- Cookie-based authentication
- Basic popup UI with script management
- Programmatic injection (no static content_scripts)
- Project model with URL rules, script/config bindings
- Options page with config editor
