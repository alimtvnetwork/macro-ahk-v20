# Automator — Future Work Roadmap

**Last Updated**: 2026-04-07
**Active Codebase**: `marco-script-ahk-v7.latest/` (v7.23)
**Chrome Extension**: v2.117.0
**Detailed Plan**: `.lovable/plan.md`
**Suggestions Tracker**: `.lovable/memory/suggestions/01-suggestions-tracker.md`
**Completed Plans**: `.lovable/memory/workflow/completed/`
**Issue Write-Ups**: `/spec/17-app-issues/`
**Risk Report**: `.lovable/memory/workflow/03-reliability-risk-report.md`

---

## Current Status: v7.23 AHK + Extension v2.117.0 — Stable

All critical AHK features implemented. 44 issue write-ups documented. 26 engineering standards established. Chrome Extension at v2.117.0 with full React UI unification, session-bridge auth, SQLite bundles, User Script API, Context Menu, relative scaling, view transitions, hover micro-interactions, 7-stage injection pipeline with cache gate, and 4-tier CSP fallback. ESLint zero errors/warnings. All immediate workstream items complete.

### 2026-04-08 Session

- **Release CI hardening (v2.117.0)**: Fixed GitHub Actions failure when `pnpm-lock.yaml` is absent by falling back to `pnpm install --no-frozen-lockfile --lockfile=false` for root and `chrome-extension`. Added root + extension lint steps before tests. Release notes now explicitly include PowerShell/Bash install commands, manual unpacked-install steps, and `changelog.md` asset listing.

- **Rename Preset Persistence (v2.115.0)**: Added project-scoped IndexedDB KV store (`ProjectKvStore`) and `RenamePresetStore` for persistent rename configuration presets. Preset selector dropdown in bulk rename panel with Save/New/Delete. Auto-save on Apply, Close, and Cancel. Auto-load on panel open. Generic KV store is reusable by any plugin.
- **Spec Created**: `spec/10-macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md` — full spec for rename persistence with IndexedDB.
- **New Files**: `project-kv-store.ts` (generic KV), `rename-preset-store.ts` (preset CRUD).
- **Modified**: `bulk-rename.ts` (preset UI), `bulk-rename-fields.ts` (preset row builder), `workspace-rename.ts` (barrel exports).

### 2026-04-07 Session

- **Injection Pipeline Cache Gate**: Added IndexedDB-backed pipeline cache with HIT/MISS/FORCE states. On cache HIT, Stages 0–3 are skipped entirely. 3-layer invalidation: manifest version mismatch, automated rebuild, and manual `INVALIDATE_CACHE` message.
- **4-Tier CSP Fallback Chain**: Documented and aligned code with diagram — MAIN World Blob → USER_SCRIPT (Chrome 135+) → ISOLATED Blob → ISOLATED Eval. Updated spec and Mermaid diagram.
- **Force Run Support**: Added `forceReload` flag to context menu ("⚡ Force Run (bypass cache)") and shortcut handler (`force-run-scripts` command). Registered in `manifest.json` — users assign shortcut at `chrome://extensions/shortcuts`.
- **LLM Guide Updated**: `generate-llm-guide.ts` rewritten to reflect 7-stage + cache gate pipeline, 4-tier CSP fallback, `forceReload` parameter on `INJECT_SCRIPTS`, and pipeline cache documentation.
- **S-056 Completed**: Cross-Project Sync spec matured from DRAFT v1.0.0 → READY v2.0.0. Added conflict resolution rules, SQLite storage backend design with content hashing, and comprehensive edge case handling (14 acceptance criteria).
- **S-052 Completed**: Prompt click E2E verification checklist (7 tests) added to issue write-up #52. Covers fresh render, snapshot restore, MAIN world relay, save round-trip, error boundary, and action button isolation. Awaits manual Chrome execution.
- **ESLint**: Zero errors, zero warnings maintained throughout all changes.

### 2026-04-06 Hotfix

- Fixed click-injection ordering bug: if any script in the resolved chain has CSS, the injector now preserves full dependency order sequentially instead of executing non-CSS deps out of order.
- Added marco-sdk as an explicit macro-controller dependency so `window.marco` toast/auth APIs are guaranteed on manual inject.
- Fixed manual-run dependency recovery so `xpath` is forced ahead of `macro-looping` even when stored project metadata or popup ordering is stale.
- Improved session log read failures to print the exact missing OPFS path: `session-logs/session-<id>`.
- Fixed false-positive injection success by restoring macro-controller startup recovery hooks and re-registering the controller singleton in `api.mc`.
- Fixed cross-database `Sessions` lookups that caused repeated `no such table: Sessions` errors in error/user-script logging paths.
- Blocked built-in scripts from falling back to stale embedded storage code when bundled recovery fails.
- Unified extension/runtime script version to `2.98.0`. 

---

## Remaining Backlog

### Priority 1: E2E Verification (Blocked — Manual)

| Task | Description | Status |
|------|-------------|--------|
| **Task 1.2** — E2E Chrome Verification | Load extension in Chrome, verify popup/options/CRUD/injection/context menu/import-export. S-052 checklist ready. | Blocked (requires manual Chrome testing) |

### Priority 2: Test Coverage

| Task | Description | Status |
|------|-------------|--------|
| **Task 2.2** — React Component Tests (S-021) | Unit tests for PopupApp, OptionsApp, ProjectsSection, ProjectEditor, DiagnosticsPanel. Target: 900+ tests | Ready |

### Priority 3: P Store — Project & Script Store

A marketplace for discovering, searching, and importing projects/scripts from a remote store API. Configurable store URL in Settings, search with caching, import flow. **Not ready — owner will fine-tune spec first.**

Spec folder: `spec/05-chrome-extension/82-pstore-project-store/`

### Priority 4: Cross-Project Sync (Spec Ready)

Shared asset library with synced/pinned/detached linking, project groups, version history, and import/export. Spec matured to READY v2.0.0 with conflict resolution, storage backend, and edge cases.

Spec: `spec/13-features/cross-project-sync.md`

---

## Completed Work (Summary)

| Area | Highlights |
|------|-----------|
| **AHK Layer** | E2E tests (22 suites, 150+ cases), XPath self-healing, config schema validation, hot-reload, token expiry UI |
| **Extension Releases** | v1.0–v2.98.0: injection, SQLite, auth, context menu, scaling, React unification, view transitions, cache gate, force run |
| **React UI Unification** | All 12 steps complete — content scripts moved, message client migrated, version bumped |
| **Immediate Workstream** | Swagger API Explorer, Storage Browser (4 categories), Prompt Seeding, Overflow Menus, Project Files Panel, ZIP Export/Import |
| **Injection Pipeline** | 7-stage + cache gate, 4-tier CSP fallback (MAIN Blob → USER_SCRIPT → ISOLATED Blob → ISOLATED Eval), Force Run (context menu + shortcut) |
| **UI Polish** | Tailwind hover micro-interactions (Task 4.1), direction-aware view transitions (Task 4.2) |
| **Build & Docs** | Build verification (Task 2.1), CDP injection docs (Task 3.1), AI onboarding checklist (Task 3.2), LLM guide updated |
| **Code Quality** | ESLint 1390 → 0 issues, SonarJS integration, TS migration v2 (6 phases) |
| **Specs Matured** | S-056 Cross-Project Sync (READY v2.0.0), S-052 Prompt Click verification checklist |
| **Issues Resolved** | #76–#90: cookie binding, hot-reload, globals migration, auth bridge, injection pipeline, IndexedDB cache, prompt click fix |

---

## Next Task Selection

| # | Task | Effort | Impact | Blocker |
|---|------|--------|--------|---------|
| 1 | **Task 2.2** — React component tests | Medium | High — catches UI regressions | None |
| 2 | **Task 1.2** — E2E Chrome verification | Low | High — validates real-world usage | Manual Chrome required |
| 3 | **Cross-Project Sync** — Shared asset library | High | High — new feature | Spec ready |
| 4 | **P Store** — Project marketplace | High | High — new feature | Owner spec pending |

**Recommended next**: Task 2.2 (React component tests) — no blockers, highest actionable impact.

---

## Engineering Principles (Summary)

1. Root Cause Analysis First
2. Known-Good State Wins
3. UI Sync Completeness
4. Side Effect Awareness
5. API-First, DOM-Fallback
6. No Direct resp.json()
7. SQLite Schema Consistency
8. Issue Write-Up Mandatory
9. NEVER change code without discussing with user first

Full list: `/spec/06-coding-guidelines/engineering-standards.md` (26 standards)
