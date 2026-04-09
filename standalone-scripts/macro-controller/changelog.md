# Macro Controller — Changelog

## v2.1.0 (2026-04-03)

### Version Alignment

- Bumped version from 1.74.0 → 2.1.0 to match extension manifest v2.1.0.0
- Eliminates version mismatch banner in popup

---

## v1.74.0 (2026-03-31)

### Code Quality Audit — Full CQ Compliance

- **var elimination**: Converted all legacy `var` declarations to `const`/`let` — 0 remaining
- **CQ11 (module-level `let`)**: All mutable module-level state encapsulated in singleton classes (`BulkRenameManager`, `PromptLoaderState`, `AuthRecoveryManager`, `ToastManager`, etc.) — 0 violations
- **CQ12 (global mutation)**: All shared array/map mutations replaced with immutable data flow — 0 violations
- **CQ13 (C-style `for` loops)**: 13 justified exceptions documented (index-based APIs: `localStorage.key(i)`, `snapshotItem(i)`, reverse iteration)
- **CQ16 (nested named functions)**: Resolved all 60 violations across 25+ files
  - `auth-bridge.ts`: `finish`/`onResponse`/`onPong` → `finishBridgeAttempt`/`handleBridgeResponse`/`handleRelayPong` with `BridgeAttemptCtx`/`RelayPingCtx`
  - `prompt-loader.ts`: 5 closures → `finishRelay`/`handleRelayResponse`/`handlePromptRelayResponse`/`finishLegacyLoad`/`_fetchFromExtensionAttempt` with `RelayCtx`/`PromptRelayCtx`
  - `rename-bulk.ts`: Recursive `doNext` closures → private methods `_doNextRename`/`_doNextUndo` on `BulkRenameManager`
  - `task-next-ui.ts`: `doNextTask` → module-scope with `TaskNextLoopCtx`; `tryClickAndAdvance` with `ClickContext`
  - `bulk-rename.ts`: 9 named functions → `const` arrow assignments (drag handlers, preview, ETA, start-num bindings)
  - `database-modal.ts`: `switchTab` → `switchDbTab` at module scope
  - `settings-ui.ts`: `switchTab`/`onEsc` → `switchSettingsTab`/`onSettingsEsc` at module scope
  - `loop-controls.ts`, `check-button.ts`, `prompt-injection.ts`, `async-utils.ts`, `menu-helpers.ts`, `menu-builder.ts`, `startup-global-handlers.ts`, `prompt-dropdown.ts`, `save-prompt-dropdown.ts`: Various nested helpers extracted to module scope with context interfaces
  - `hot-reload-section.ts`, `save-prompt.ts`, `section-auth-diag.ts`, `section-ws-history.ts`, `panel-controls.ts`, `ws-dialog-detection.ts`, `ws-move.ts`, `startup-persistence.ts`, `startup-token-gate.ts`, `macro-looping.ts`: Final 12 closures converted
  - `auth-diag-waterfall.ts` (`renderWaterfall`), `database-json-migrate.ts` (`checkDone`), `save-prompt-prompt-list.ts` (`updateStyles`), `save-prompt-task-next.ts` (`positionSubmenu`), `settings-tab-panels.ts` (`makeToggle`): Last 5 nested functions → `const` assignments
- **Type safety**: 4 `any` (3 test, 1 facade) and 2 `as unknown as` (SDK window access) — all justified
- **`Record<string, any>`**: 0 remaining

### Audit Report

- Full audit documented in `.lovable/memory/audit/macro-controller-cq-audit-2026-03-31.md`
- Compliance: CQ11/CQ12 100%, CQ13 100% (exceptions documented), CQ16 100% (all 60/60 fixed) ✅
- Version bump: 1.73.0 → 1.74.0

---

## v1.73.0 (2026-03-28)

### Performance Audit (MC-01 → MC-08, EXT-01 → EXT-03)

- **MC-01**: Replaced all hot-path `innerHTML` assignments with `textContent` for XSS safety and performance
- **MC-02**: Converted `element.style.cssText` bulk assignments to individual `style.*` properties where applicable
- **MC-03**: Replaced `setInterval` countdown timer with `requestAnimationFrame` for smoother rendering
- **MC-04**: Narrowed `MutationObserver` scope — `childList: true` on main container without `subtree`
- **MC-05**: Added conditional polling — diagnostics and status updates pause when tab is hidden or panel collapsed
- **MC-06**: Replaced `querySelector` lookups with cached `getElementById` where IDs exist
- **MC-07**: Deduplicated repeated DOM style strings into shared constants
- **MC-08**: Reduced macro controller bundle size by 12% (389 KB → 344 KB)
- **EXT-01**: Removed `framer-motion` dependency (0 KB saved in bundle, replaced with native CSS transitions)
- **EXT-02**: Tree-shook unused Radix UI subpath imports
- **EXT-03**: Lazy-loaded `MonacoCodeEditor` via `React.lazy()` + `Suspense` to defer ~2 MB Monaco bundle

### Type System Cleanup

- Eliminated **all** `as unknown as` double-casts (111 → 0) across the entire codebase
- Added index signatures to `XPathConfig`, `TimingConfig`, `TaskNextSettings`, and `LogManagerConfig` interfaces
- Changed `CreditManager.getState()` return type from `Record<string, unknown>` to `LoopCreditState`
- Added `taskNextDeps?` to `PanelBuilderDeps` interface (was accessed via double-cast)
- Replaced `resolve._timer` monkey-patch in auth recovery with a proper `Map<resolve, timer>`
- Added `MarcoSDK` interface to `globals.d.ts` for typed `window.marco` access
- Replaced `this as unknown as HTMLElement` patterns with direct element references
- Explicit `ThemePreset` construction in `resolvePreset()` schema v1 fallback (no more structural cast)
- Final audit: 0 `as unknown as`, 1 justified `as any` (class→facade window assignment)

### UIManager Registration & Bootstrap Refactor

- **Fixed**: `MacroController: UIManager not registered` error — `UIManager` was defined but never instantiated
- Wired up `new UIManager()` → `setCreateFn()` → `mc.registerUI()` in `macro-looping.ts`
- Refactored `bootstrap()` in `startup.ts` to use `mc.ui.create()` instead of `deps.createUI()`
- Removed `createUI` and `destroyPanel` from bootstrap dependency injection — UIManager now owns full lifecycle

### Housekeeping

- Archived completed performance audit specs to `spec/archive/`
- Version bump: 1.72.0 → 1.73.0 (all components synchronized)
