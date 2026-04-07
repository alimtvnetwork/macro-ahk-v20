# Changelog

All notable changes to the Marco Chrome Extension are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v1.75.0] — 2026-04-07

### Fixed
- **Next Task regression** — `normalizePromptEntries()` dropped `slug`, `id`, `isDefault` fields causing `findNextTasksPrompt()` to always fall through to `entries[0]` (start prompt) instead of resolving the correct `next-tasks` slug
- **Excessive newlines in large prompts** — added `normalizeNewlines()` to collapse 3+ consecutive blank lines before editor injection

### Changed
- `pasteIntoEditor()` now normalizes whitespace before injecting prompt text
- Macro Controller version bump: 2.104.0 → 2.105.0

### Root Cause Analysis
- [RCA: prompt-next-task-regression](spec/02-app-issues/prompt-next-task-regression-newline-formatting-root-cause-version-bump-and-changelog.md)

---

## [v2.4.0] — 2026-04-05

### Added
- Advanced Automation engine (chains, scheduling, step executors, condition evaluators)
- Color-coded console.group/groupEnd for injection pipeline logs mirrored to tab DevTools
- Nested sub-groups in pipeline logs (📊 Stage Summary + 📜 Per-Script Results)
- Method-name prefixes in manifest-seeder and session-log-writer error messages

### Fixed
- `compile-instruction.mjs` — capture preamble `const` declarations (e.g. `LOVABLE_BASE_URL`) for `new Function()` evaluation context

### Verified
- Build pipeline (`npm run build:extension`) produces all 17 expected output files
- React UI unification Steps 1-9, 11-12 confirmed complete; content scripts already migrated
- `message-client.ts` already uses `getPlatform().sendMessage()` — no direct `chrome.runtime` calls
- CDP injection fallback fully documented (spec 47)
- AI onboarding checklist (S-029) already in master overview

---

## [v7.17] — 2026-02-25

### Fixed
- Controller injection failure — `LoopControlsXPath` updated (`div[2]` → `div[3]`)
- Check button no longer dies on 401 — falls through to XPath detection
- 401/403 now triggers `markBearerTokenExpired` in both sync/async fetch
- Per-selector verbose logging with ✅/❌ (previously only logged count)

### Removed
- Tier 1 mark-viewed API fully deleted from `autoDetectLoopCurrentWorkspace()`

### Added
- Token expiry UI feedback
- 📥 Export Bundle feature
- XPath self-healing via CSS selector fallback (S-012)

---

## [v7.16] — 2026-02-25

### Changed
- Strict injection-first sequence with Step 0 verification

---

## [v7.9.53] — 2026-02-24

### Changed
- Progress bar segment reorder: 🎁→💰→🔄→📅
- Rollover segment styled gray

---

## [v7.9.52] — 2026-02-24

### Added
- CSV export for workspace data
- Workspace count label in UI

---

## [v7.9.51] — 2026-02-24

### Fixed
- InjectJSQuick focus-steal fix — detached Console no longer loses focus (issue #13)

---

## [v7.9.45] — 2026-02-23

### Changed
- F12 removed from injection; Ctrl+Shift+J only

### Fixed
- Ctrl+Shift+J toggle-close bug when Console already active (issue #12)

---

## [v7.9.41] — 2026-02-23

### Restored
- DevTools two-branch injection strategy

---

## [v7.9.40] — 2026-02-23

### Added
- Smart workspace switching — automatically skips depleted workspaces

---

## [v7.9.34] — 2026-02-23

### Fixed
- Post-move state corruption — authoritative API guard prevents stale XPath overwrite (issue #09)

---

## [v7.9.25] — 2026-02-23

### Added
- 3-tier workspace detection hierarchy

---

## [v7.9.24] — 2026-02-23

### Changed
- Comprehensive fetch logging standard applied across all API calls

---

## [v7.9.15] — 2026-02-22

### Changed
- Credit formula finalized with shared helpers

---

## [v7.9.8] — 2026-02-22

### Added
- JS history tracking
- Injection failure detection
- Double-click move support

---

## [v7.9.7] — 2026-02-21

### Changed
- AHK delegation deprecated → API-direct mode

---

## [v7.9.2] — 2026-02-21

### Fixed
- Workspace state clobber on rapid switches

---

## [v7.9.1] — 2026-02-21

### Added
- ClickPageContent context anchoring

---

## [v7.8] — 2026-02-21

### Added
- InjectJSQuick — optimized 3-call injection
- Domain guard for script isolation

---

## [v7.5] — 2026-02-21

### Added
- Bearer token sharing across modules
- Unified layout system
- Searchable workspace dropdown

---

## [v7.0] — 2026-02-21

### Changed
- Full modular architecture rewrite
- Config constants extracted to `config.ini`

### Added
- Credit status API integration

---

## [v6.55] — 2026-02-19

### Milestone
- Stable baseline archived (`marco-script-ahk-v6.55/`)

---

## [v6.45] — 2026-02-19

### Fixed
- Toggle-close bug
- Double-confirm prompt guard

---

## [v6.1] — 2026-02-18

### Fixed
- DevTools collision with delegation stability

---

## [v5.4] — 2026-02-18

### Fixed
- `$`-prefix hotkeys regression
- F6 removed from injection flow

---

## [v5.2] — 2026-02-18

### Added
- Three-tier fast path recovery
- Exponential backoff on retries

---

## [v4.9] — 2026-02-17

### Added
- Foundation: logging, draggable UIs, multi-method XPath, keyboard shortcuts
