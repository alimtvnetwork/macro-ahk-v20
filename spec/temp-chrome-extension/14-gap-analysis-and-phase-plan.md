# Chrome Extension — Gap Analysis & Phase Plan

**Version**: v0.2
**Date**: 2026-02-28

---

## Gap Analysis

Comparison of the user's expanded requirements against existing specs (01–11).

### ✅ Already Covered (No Changes Needed)

| Requirement | Covered In |
|-------------|------------|
| Manifest V3 architecture | 01-overview.md |
| INI → JSON config conversion | 02-config-json-schema.md |
| Cookie-based auth (HttpOnly) | 04-cookie-and-auth.md |
| Content script adaptation (placeholder removal, token flow) | 05-content-script-adaptation.md |
| SQLite logging with sessions, levels, categories | 06-logging-architecture.md |
| Remote config endpoints | 07-advanced-features.md |
| Conditional injection by URL pattern | 07-advanced-features.md |
| XPath recorder | 07-advanced-features.md |
| 4-part semantic versioning | 08-version-management.md |
| Error recovery flows (WASM, storage, network, injection) | 09-error-recovery.md |
| Basic popup UI (status cards, scripts, quick actions) | 10-popup-options-ui.md |
| Options page (9 sections, sidebar nav) | 10-popup-options-ui.md |
| Testing pyramid (unit, integration, E2E) | 11-testing-strategy.md |

### ❌ Missing — Now Added

| # | Gap | New Spec |
|---|-----|----------|
| G-01 | **Project model** — grouping URL rules, scripts, configs under named projects | `12-project-model-and-url-rules.md` |
| G-02 | **URL matching** — exact, prefix, regex modes with exclude patterns and precedence | `12-project-model-and-url-rules.md` |
| G-03 | **Multi-script management** — upload, folder paths, metadata analysis, tagging | `13-script-and-config-management.md` |
| G-04 | **Multi-config management** — upload, folder paths, validation, binding | `13-script-and-config-management.md` |
| G-05 | **Config → script injection method** — global var, message, parameter (3 methods defined) | `13-script-and-config-management.md` |
| G-06 | **Drag-and-drop file upload** | `13-script-and-config-management.md` |
| G-07 | **Script execution world** — user chooses ISOLATED or MAIN per script | `12-project-model-and-url-rules.md` |
| G-08 | **Multi-script precedence** — inject all matching in priority order, dedup by scriptId | `12-project-model-and-url-rules.md` |
| G-09 | **User script error capture** — stack traces from 3rd-party JS with scriptId/configId context | `13-script-and-config-management.md` |
| G-10 | **Project selector in popup** — select active project, view URL rules | ✅ `15-expanded-popup-options-ui.md` |
| G-11 | **Projects section in options** — CRUD for projects and URL rules | ✅ `15-expanded-popup-options-ui.md` |
| G-12 | **PowerShell profile auto-detection** — list available profiles, prompt user | ✅ Updated `03-powershell-installer.md` v0.2 |
| G-13 | **PowerShell watch mode** — auto-reload extension on file changes | ✅ Updated `03-powershell-installer.md` v0.2 |
| G-14 | **Log fields** — projectId, urlRuleId, scriptId, configId in every log entry | ✅ Updated `06-logging-architecture.md` v0.2 |
| G-15 | **ZIP export** — bundle .db files + config + metadata in one archive | ✅ Updated `06-logging-architecture.md` v0.2 |
| G-16 | **Database visibility in UI** — storage usage, table row counts, data browser | Partially in `10-popup-options-ui.md` (Data Management); needs detail |
| G-17 | **Version bump on every change** — policy for micro-bumps | ✅ Updated `08-version-management.md` v0.2 |
| G-18 | **AHK issue lessons mapped to extension prevention** | `12-project-model-and-url-rules.md` |
| G-19 | **Permissions manifest consolidation** — final permissions list for expanded features | ✅ Updated `01-overview.md` v0.3 |
| G-20 | **Service worker lifecycle** — MV3 worker termination, SQLite rehydration, alarm-based keepalive | ✅ Updated `09-error-recovery.md` v0.2 (Flow 8) |
| G-21 | **CSP detection and fallback** — MAIN world injection may fail on strict CSP pages | ✅ Updated `09-error-recovery.md` v0.2 (Flow 9) |
| G-22 | **Multi-tab behavior** — which tab's state shows in popup, per-tab injection tracking | ✅ Updated `15-expanded-popup-options-ui.md` |
| G-23 | **Onboarding / first-run experience** — welcome page, default project auto-creation, permission grants | ✅ Updated `15-expanded-popup-options-ui.md` |

---

## Phase Plan

### Phase 1: Foundation — Project Model & Storage (5 credits)

**Goal**: Establish the project/URL-rule/script/config data model and storage layer.

**Spec files to create/update**:
- ✅ `12-project-model-and-url-rules.md` (created)
- ✅ `13-script-and-config-management.md` (created)

**Steps**:
1. Define Project, UrlRule, ScriptBinding, ConfigBinding TypeScript interfaces ✅
2. Define URL matching logic (exact, prefix, regex) with precedence rules ✅
3. Define script/config storage schema in `chrome.storage.local` ✅
4. Define config validation rules (JSON parse, schema, size, placeholder check) ✅
5. Define config → script injection methods (global, message, parameter) ✅
6. Define default bundled project for Lovable ✅
7. Map AHK issues to extension prevention strategies ✅

**Acceptance criteria**:
- [x] Data model documented with TypeScript interfaces
- [x] URL matching modes and precedence fully specified
- [x] Config injection methods defined with code examples
- [x] Storage keys and schemas documented
- [x] Default project defined

**Risks**: `showDirectoryPicker()` API may not persist permissions across sessions. Mitigated by documenting the limitation and storing path as reference.

---

### Phase 2: Expanded UI — Popup & Options Projects Section (5 credits) ✅

**Goal**: Add project management flows to the popup and options page.

**Spec files created/updated**:
- ✅ `15-expanded-popup-options-ui.md` (created) — Full popup project selector, options Projects CRUD, URL rule inline editor, script/config binding, drag-and-drop zones, metadata badges, 4 interaction flows, message protocol additions

**Steps**:
1. Add "Projects" section to options sidebar (first item) ✅
2. Design project list UI with create/edit/delete/duplicate/toggle/import/export ✅
3. Design URL rule inline editor with match mode, preview, conditions ✅
4. Add script/config binding UI within URL rule editor ✅
5. Add project selector dropdown to popup with match status indicator ✅
6. Add drag-and-drop zone component spec (shared, 6 visual states, validation) ✅
7. Add script metadata badges (world, line count, DOM, IIFE, chrome API) ✅

**Acceptance criteria**:
- [x] Options page has a Projects section with full CRUD wireframes
- [x] Popup shows active project with URL rule status
- [x] Drag-and-drop spec covers visual states, validation, and error handling
- [x] Script-config binding UI fully wireframed

**Risks**: Popup width (380px) is tight for project selector. Mitigated with dropdown instead of inline list.

---

### Phase 3: Logging Expansion — Context Fields & ZIP Export (5 credits) ✅

**Goal**: Add projectId/urlRuleId/scriptId/configId to log entries; add ZIP export.

**Spec files updated**:
- ✅ `06-logging-architecture.md` — Updated to v0.2: added context columns, ZIP export, USER_SCRIPT_ERROR, schema migration

**Steps**:
1. Add `project_id`, `url_rule_id`, `script_id`, `config_id`, `ext_version` columns to `logs` table ✅
2. Add context columns + `script_file`, `error_line`, `error_column` to `errors` table ✅
3. Update `log()` function signature to accept context object ✅
4. Define ZIP export format: `marco-export-{session}-{date}.zip` with metadata.json ✅
5. Define USER_SCRIPT_ERROR capture flow with error handler injection code ✅
6. Add `USER_SCRIPT_ERROR` + 4 more error codes to error_codes table ✅
7. Define schema migration strategy (ALTER TABLE, version tracking) ✅
8. Add `PROJECT` and `MATCHING` log categories ✅

**Acceptance criteria**:
- [x] Log schema has context fields
- [x] ZIP export format fully specified
- [x] User-script error capture documented with stack trace handling

---

### Phase 4: PowerShell Expansion — Profile Detection & Watch Mode (5 credits) ✅

**Goal**: Expand PowerShell spec for auto-detect profiles and watch mode.

**Spec files updated**:
- ✅ `03-powershell-installer.md` — Updated to v0.2: profile auto-detection, interactive picker, direct mode, watch mode, Edge support, 3 end-to-end workflows

**Steps**:
1. Add `-ListProfiles` switch that scans Chrome User Data dir and lists available profiles ✅
2. Add interactive profile picker when `-Profile` not specified ✅
3. Add `-Watch` switch for file-change monitoring with auto-reload ✅
4. Add `-Direct` mode to point Chrome to repo folder (no copy) ✅
5. Document two reload methods: signal file (default) and CDP (advanced) ✅
6. Document 3 end-to-end workflows: dev, user update, first-time setup ✅
7. Confirm: load-unpacked reads from source folder, watch automates reload ✅
8. Add Edge (Chromium) support via `-Browser` parameter ✅

**Acceptance criteria**:
- [x] Profile auto-detection documented with PowerShell code
- [x] Watch mode specified with file monitoring approach
- [x] Reload workflow documented end-to-end
- [x] "Connected extension receives latest changes" flow confirmed

---

### Phase 5: Version Policy, Permissions, Service Worker Lifecycle & Cross-References (5 credits) ✅

**Goal**: Update version management for micro-bump policy, consolidate manifest permissions, document service worker lifecycle risks, clarify multi-tab behavior, and ensure all specs cross-reference correctly.

**Spec files updated**:
- ✅ `08-version-management.md` v0.2 — Micro-bump policy, git hook (bash + PowerShell), bump decision matrix, changelog automation
- ✅ `01-overview.md` v0.3 — Deliverables table updated (15 specs), consolidated permissions manifest with justification table, optional permission flow
- ✅ `09-error-recovery.md` v0.2 — Flow 8 (service worker termination/rehydration, alarms-based keepalive, state persistence checklist), Flow 9 (CSP detection, MAIN→ISOLATED fallback, pre-check)
- ✅ `15-expanded-popup-options-ui.md` — Multi-tab behavior (active tab query, per-tab injection tracking, navigation reset), onboarding (welcome page, first-run popup hint)

**Acceptance criteria**:
- [x] Version bump policy documented for every change size
- [x] All spec files listed in overview with correct descriptions
- [x] Manifest permissions consolidated in one section
- [x] Service worker lifecycle documented with rehydration strategy
- [x] CSP fallback documented
- [x] Multi-tab popup behavior clarified
- [x] First-run onboarding documented
- [x] Cross-references are consistent

---

### Phase 6: Testing Strategy Update (3 credits) ✅

**Goal**: Add test cases for new features (projects, script management, config injection, service worker lifecycle).

**Spec files updated**:
- ✅ `11-testing-strategy.md` v0.2 — Added U-09–U-14 (20+ new unit tests), I-08–I-13 (30+ new integration tests), E2E-16–E2E-21 (6 new E2E flows), expanded regression checklist

**Acceptance criteria**:
- [x] 14+ new unit tests documented (added 20+ across U-09 to U-14)
- [x] 5+ new integration tests documented (added 30+ across I-08 to I-13)
- [x] 3+ new E2E flows documented (added 6: E2E-16 to E2E-21)

---

## Phase Summary

| Phase | Goal | Credits | Dependencies | Gaps Covered |
|-------|------|---------|-------------|--------------|
| 1 | Project model & storage | 5 | None | G-01–G-09, G-18 |
| 2 | UI expansion (popup + options) | 5 | Phase 1 | G-10, G-11 |
| 3 | Logging expansion | 5 | Phase 1 | G-14, G-15 |
| 4 | PowerShell expansion | 5 | None | G-12, G-13 |
| 5 | Version, permissions, lifecycle, cross-refs | 5 | Phases 1-4 | G-16, G-17, G-19–G-23 |
| 6 | Testing strategy update | 3 | Phases 1-5 | — |

**Total estimated effort**: ~28 credits

**Recommended order**: Phase 1 → Phase 4 → Phase 2 → Phase 3 → Phase 5 → Phase 6
(Phase 4 is independent and can run in parallel with Phase 2)

---

## Feedback on User Requirements

### Strengths of the Requirements

1. **Project-centric model** is the right abstraction — it naturally groups URL rules, scripts, and configs
2. **Multi-script support** extends the extension far beyond Lovable-specific automation
3. **Per-script world selection** (ISOLATED/MAIN) is technically sound and covers all use cases
4. **Session-based logging with version** will make debugging significantly easier
5. **Stack trace capture for user scripts** is crucial for debugging uploaded JS
6. **ZIP export** is the right format for sharing complete debug packages

### Refinements Made

1. Added **deduplication** — if two rules inject the same script, it only runs once per page load
2. Added **config inheritance chain** — rule config > project default > bundled defaults
3. Added **script metadata analysis** — auto-detect IIFE, chrome API usage, DOM usage to help users pick the right execution world
4. Added **hash-based change detection** for scripts and configs to avoid unnecessary updates
5. Added **default project** shipped with extension for Lovable automation (backward compatibility)

### Potential Concerns

1. **Storage quota**: Multiple large scripts + configs + SQLite DBs could approach the 10 MB chrome.storage.local limit. The `unlimitedStorage` permission mitigates this.
2. **Folder watch API**: `showDirectoryPicker()` has limited persistence. Users may need to re-grant folder access after browser restart.
3. **MAIN world security**: Scripts in MAIN world can access page globals, which means they can also be read by malicious page scripts. The spec recommends ISOLATED as default.
