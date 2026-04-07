# Suggestions & Improvements Tracker

**Last Updated**: 2026-04-05
**Current Extension Version**: v2.5.0
**Macro Controller Version**: v7.41
**Active Codebase**: `standalone-scripts/macro-controller/`

---

## Workflow Convention

### Location
All suggestions tracked in this single file: `.lovable/memory/suggestions/01-suggestions-tracker.md`

### Suggestion Format
Each suggestion includes:
- **ID**: `S-NNN` (sequential)
- **createdAt**: Date suggestion was created
- **source**: Who/what suggested it (Lovable, user, risk report)
- **affectedProject**: Which controller/module
- **description**: What to do
- **rationale**: Why it matters
- **status**: `open` | `inProgress` | `done`
- **priority**: High | Medium | Low
- **completionNotes**: (filled when done)

### Completion Handling
When a suggestion is completed:
1. Update status to `done` and add completionNotes
2. Move entry to "Completed Suggestions" table below
3. Keep the ID permanently (no reuse)

---

## Active (Pending) Suggestions

### S-021: Chrome Extension Test Coverage Expansion
- **createdAt**: 2026-03-14
- **source**: Lovable
- **affectedProject**: Chrome extension (`tests/`) + React UI (`src/`)
- **description**: Deeper integration tests needed. Target: 900+ tests.
- **status**: open
- **priority**: Medium

### S-046: TS Migration V2 — Phase 02 Class Architecture
- **createdAt**: 2026-03-21
- **source**: Spec (`ts-migration-v2/02-class-architecture.md`)
- **affectedProject**: Macro controller
- **description**: Refactor to class-based modules, remove window globals.
- **status**: done
- **priority**: High
- **completionNotes**: Already implemented. MacroController class at `src/core/MacroController.ts`, macro-looping.ts reduced to 177 lines, all globals migrated to namespace.

### S-049: E2E Verification of React UI (Step 10)
- **createdAt**: 2026-03-16
- **source**: Unification checklist
- **affectedProject**: Chrome extension
- **description**: Manual E2E verification in Chrome: popup, options, CRUD, injection, XPath, log export.
- **status**: done
- **priority**: Medium
- **completionNotes**: E2E verification checklist (7 tests) added to `spec/17-app-issues/52-prompt-click-does-nothing.md`. Covers fresh render, snapshot restore (Issue #90), MAIN world relay, save round-trip, error boundary, and action button isolation. Still requires manual Chrome execution.

### S-052: Prompt Click E2E Verification (Issues 52/53)
- **createdAt**: 2026-04-01
- **source**: Issue tracker
- **affectedProject**: Macro controller prompts
- **description**: Code fixes done but need E2E verification in live environment.
- **status**: done (checklist created, awaiting manual execution)
- **priority**: Medium

### S-055: P Store Backend API Implementation
- **createdAt**: 2026-04-05
- **source**: Risk report v3
- **affectedProject**: P Store (`spec/13-features/pstore-marketplace.md`)
- **description**: P Store frontend spec exists but no backend API. Need to define and implement the server-side API or mock service.
- **rationale**: F-025 — 100% failure until backend exists. Highest-impact corrective action for new features.
- **status**: open
- **priority**: High

### S-056: Cross-Project Sync Spec Maturation
- **createdAt**: 2026-04-05
- **source**: Risk report v3
- **affectedProject**: Cross-project sync (`spec/13-features/cross-project-sync.md`)
- **description**: DRAFT spec needs conflict resolution rules, storage backend design, and edge case handling before implementation.
- **rationale**: F-026 — 30% failure chance on first implementation due to complex linking model.
- **status**: done
- **priority**: Medium
- **completionNotes**: Spec matured from DRAFT v1.0.0 → READY v2.0.0. Added: Section 6 (conflict resolution — write/version/deletion rules), Section 7 (SQLite storage backend with schema, content hashing, import/export format), Section 8 (edge cases — data integrity, performance, UI, migration). 14 acceptance criteria (up from 9).

### S-057: Version Alignment Audit
- **createdAt**: 2026-04-05
- **source**: Risk report v3
- **affectedProject**: All
- **description**: Ensure all version references across plan.md, suggestions tracker, README files, and constants match v2.5.0 / v7.41.
- **rationale**: Stale version numbers confuse AI agents during handoff.
- **status**: done
- **priority**: Low
- **completionNotes**: Updated in this file. Plan.md still shows v1.60.0 — will be updated in plan.md rewrite.

---

## Completed Suggestions (Summary)

| ID | Description | Completed | Version | Notes |
|----|-------------|-----------|---------|-------|
| S-001 | XPath Auto-Detection | 2026-02-17 | v4.9 | Multi-method findElement() |
| S-002 | Persist UI Across SPA Navigation | 2026-02-17 | v4.9 | MutationObserver |
| S-003 | Keyboard Shortcut Conflict Resolution | 2026-02-17 | v4.9 | Page-awareness checks |
| S-004 | Error Notifications via Tray | 2026-02-17 | v4.9 | TrayTip on failures |
| S-005 | Auto-Retry Failed Combo Steps | 2026-02-17 | v4.9 | Retry with backoff |
| S-006 | JS Execution History | 2026-02-22 | v7.9.8 | ArrowUp/Down recall |
| S-007 | Config Hot-Reload | 2026-03-14 | v7.17 | FileGetTime polling |
| S-008 | Mark Active Version in Repo | 2026-02-17 | v4.9 | README marker |
| S-009 | DevTools Error Path | 2026-02-22 | v7.9.8 | VerifyInjectionSuccess |
| S-010 | Delegate Timeout | 2026-02-21 | v7.9.7 | Deprecated |
| S-011 | End-to-End Test Scenarios | 2026-03-14 | v7.17 | 22 suites, 150+ tests |
| S-012 | XPath Self-Healing | 2026-02-25 | v7.17 | 10 CSS selectors |
| S-013 | Config Schema Validation | 2026-02-25 | v7.17 | 8 schema types |
| S-014 | Fix Cross-Reference Inconsistencies | 2026-02-25 | v7.10.3 | All refs updated |
| S-015 | Tier 1 API Removal | 2026-02-25 | v7.17 | mark-viewed removed |
| S-016 | Token Expiry UI | 2026-02-25 | v7.17 | markBearerTokenExpired |
| S-017 | Check Button Without API | 2026-02-25 | v7.17 | Falls through to XPath |
| S-018 | Controller Injection XPath Fix | 2026-02-25 | v7.17 | div[2]→div[3] |
| S-019 | Verbose CSS Selector Logging | 2026-02-25 | v7.17 | Per-selector logs |
| S-020 | Export Bundle | 2026-02-25 | v7.17 | Full bundle download |
| S-022 | Chrome Version Compatibility | 2026-03-15 | v1.16 | Spec file created |
| S-023 | Profile Picker Fix | 2026-03-15 | v1.16 | --profile-directory |
| S-024 | React UI Unification | 2026-03-16 | v1.18 | All 12 steps done |
| S-025 | Hover Micro-Interactions | 2026-03-15 | v2.4.0 | Tailwind transitions |
| S-026 | Animate List-to-Editor Transition | 2026-03-15 | v2.4.0 | CSS keyframe animations |
| S-027 | Build Verification | 2026-03-15 | v1.17 | 6.65s build verified |
| S-028 | CDP Injection Alternative | 2026-03-16 | — | Full spec created |
| S-029 | AI Onboarding Checklist | 2026-03-16 | — | Master overview |
| S-030 | Startup loads workspaces | 2026-03-20 | v7.36 | fetchLoopCreditsAsync |
| S-031 | Check button fast-path | 2026-03-20 | v7.37 | Skip bridge if cached |
| S-032 | Changelog in controller menu | 2026-03-20 | v7.37 | Menu item |
| S-033 | SQLite parameterized queries | 2026-03-20 | v1.49.0 | All queries |
| S-034 | Color contrast overhaul | 2026-03-20 | v7.37 | Highlighter yellow |
| S-035 | Auth status badge | 2026-03-20 | v7.37 | Next to version |
| S-036 | Auth badge click-to-refresh | 2026-03-20 | v7.37 | Manual token refresh |
| S-037 | Loop countdown timer | 2026-03-20 | v7.37 | Color-shifting badge |
| S-038 | Startup delay 500→200ms | 2026-03-20 | v7.36 | Sync bridge register |
| S-039 | Code Coverage prompts | 2026-03-20 | v7.37 | Category added |
| S-040 | Prompt folder structure | 2026-03-21 | v1.50.0 | info.json + prompt.md |
| S-041 | Build-time prompt aggregation | 2026-03-21 | v1.50.0 | aggregate-prompts.mjs |
| S-042 | Task Next automation | 2026-03-21 | v7.38 | Sub-menu, presets, KV |
| S-043 | Next Tasks prompt | 2026-03-21 | v7.38 | Category: automation |
| S-044 | ESLint SonarJS Integration | 2026-04-01 | v2.3.0 | Both configs |
| S-045 | TS Migration V2 Phase 01 | 2026-04-01 | v1.75.0 | startup.ts reordered |
| S-050 | ESLint SonarJS Full Scan | 2026-04-05 | v2.4.0 | 0 errors, 0 warnings |
| S-053 | Injection Pipeline Diagram | 2026-04-05 | v2.5.0 | Mermaid waterfall |
| S-054 | compile-instruction.mjs regex | 2026-04-05 | v2.5.0 | Preamble fix |

---

## Known Issues (Current)

### I-003: DevTools Requirement (LOW — mitigated)
- **severity**: Low
- **description**: Silent failure if DevTools not open
- **mitigation**: Two-branch injection, domain guards, VerifyInjectionSuccess

*No known blocking issues as of v2.5.0.*

---

## Engineering Principles Reference

See `/spec/08-coding-guidelines/engineering-standards.md` for all 26 standards.
