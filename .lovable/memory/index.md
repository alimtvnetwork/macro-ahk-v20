# Memory: index.md
Updated: 2026-04-11

# Project Memory

## Core
Rise Up Macro Chrome extension + standalone scripts. Extension v2.131.0, Macro Controller v7.41.
Never modify files in `skipped/` folders — read-only archives.
Never modify `.release/` folder — keep out of reach.
Version bump (at least minor) on every code change across all version files.
Suggestions go to `.lovable/memory/suggestions/01-suggestions-tracker.md` — single file.
Plans tracked in `plan.md` at repo root. Update after each implementation.
Engineering standards: 26 rules in `spec/06-coding-guidelines/engineering-standards.md`.
ESLint SonarJS: zero warnings, zero errors enforced.
Any bg module using BgLogTag MUST explicitly import it from bg-logger — never rely on implicit availability.
All ERROR logs MUST include exact file path, what was missing, and reasoning — meaningful enough for AI to diagnose.
CODE RED: Every file/path error MUST log exact path + missing item + reason. No generic "file not found". No exceptions.
Dark-only theme enforced — never add light mode or theme toggle.
Auth token utilities live in SDK (AuthTokenUtils static class on marco.authUtils). Controller delegates to SDK at runtime.
MV3 suspension errors (context invalidated, receiving end missing) are operational states, not failures — show yellow not red.

## Memories
- [Reliability report v4](mem://workflow/07-reliability-risk-report-v4) — AI handoff success at 93%, 1,079 tests, all 8 TS migration phases complete, cross-project sync Phase 1 done
- [Versioning policy](mem://workflow/version-synchronization-v3) — Unified v2.131.0 across manifest, constants.ts, standalone scripts, xpath
- [Suggestions convention](mem://workflow/suggestions-convention) — Single-file tracker at .lovable/memory/suggestions/
- [Skipped folders policy](mem://constraints/skipped-folders) — Never edit skipped/ or .release/ folders
- [v1.72.3 RCA & Fix Reference](mem://audit/v1.72.3-vs-current-audit-report) — Root cause analysis for broken prompts, injection, next buttons; fix recipes for future regressions
- [v2.111.0 Large Prompts RCA](mem://audit/v2.111.0-large-prompts-rca) — Root cause: missing from fallback lists + silent normalization filtering
- [v2.112.0 Stale Prompt Text RCA](mem://audit/v2.112.0-stale-prompt-text-rca) — Root cause: hardcoded fallback texts were stale summaries; computeBundledVersion excluded text length from hash
- [Sourcemap strategy](mem://architecture/sourcemap-strategy) — Dev (-d) = inline source maps; production (default) = no source maps
- [Error logging requirements](mem://standards/error-logging-requirements) — All errors must include exact path, missing item, and reasoning for AI diagnosis
- [File path error logging code-red](mem://constraints/file-path-error-logging-code-red) — CODE RED: every file/path error must log exact path, missing item, reason — no exceptions
- [Dark-only theme](mem://preferences/dark-only-theme) — Always dark theme, no toggle, reduced overlay opacity (40%)
- [Rename preset persistence](mem://features/macro-controller/rename-preset-persistence) — Rename presets saved to project-scoped IndexedDB via generic ProjectKvStore, auto-save on Apply/Close
- [Error modal and default databases](mem://features/error-modal-and-default-dbs) — Reusable ErrorModel, ErrorModal with copy diagnostics, default KV+Meta DBs, namespace stub
- [Namespace database creation](mem://features/namespace-database-creation) — Dot-separated PascalCase namespaces, System.*/Marco.* reserved, 25 max, inline form
- [Cross-Project Sync](mem://features/cross-project-sync) — SharedAsset/AssetLink/ProjectGroup tables, migration v7, library handler with sync engine, Phase 1 (data layer) complete
- [SDK AuthTokenUtils](mem://architecture/sdk-auth-token-utils) — Pure token utilities moved to SDK static class, controller delegates via window.marco.authUtils
- [Bridge diagnostics MV3](mem://features/macro-controller/bridge-diagnostics-mv3) — MV3 suspension shown as idle (yellow) not failed (red), auto-wake via wakeBridge()
- [Custom display name](mem://features/macro-controller/custom-display-name) — User-configurable project name in Settings → General, persisted in localStorage, highest priority in title bar
- [No-retry policy](mem://constraints/no-retry-policy) — NEVER add retry/backoff to cycle/credit/auth. Loop interval is natural retry. Issue #88.
- [Startup fix v2.137](mem://auth/startup-fix-v2137) — Gate timeout 12s→2s, removed double auth re-entry in startup, migrated root auth surface to getBearerToken
