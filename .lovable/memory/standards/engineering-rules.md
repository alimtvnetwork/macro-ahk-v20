# Engineering Rules & Standards

## Version Bumping
- **Always bump minor version** on every meaningful change set (features, fixes, refactors).
- Update version in ALL locations: `src/shared/constants.ts`, `src/options/sections/AboutSection.tsx`, `chrome-extension/manifest.json` (both `version` and `version_name`), `standalone-scripts/macro-controller/src/instruction.ts`, `standalone-scripts/marco-sdk/src/instruction.ts`.
- Current version: **2.128.0**

## Memory Updates
- Always update relevant memory files after changes to capture decisions and current state.
- Suggestions tracker: `.lovable/memory/suggestions/01-suggestions-tracker.md`
- Solved issues go to `.lovable/solved-issues/`
- Pending issues stay in `.lovable/pending-issues/`
- Completed pending issues MUST be moved to solved-issues folder

## Development Scope
- Restricted to `marco-script-ahk-v7.latest/`, `chrome-extension/`, and `src/` folders.

## API Response Handling (Rule 9)
- Use `resp.text()` followed by `JSON.parse()` for API responses (not `resp.json()`).

## Issue Write-ups (Rule 10)
- Detailed Root Cause Analysis (RCA) for issues encountered.
- Include: Problem, Root Cause, Solution, Learning, What NOT to Repeat.

## Build Architecture
- Monaco Editor: Real `@monaco-editor/react` in web app, textarea shim in Chrome extension (via Vite alias in `chrome-extension/vite.config.ts`).
- Extension build uses separate `chrome-extension/` Vite config with aliases for `@`, `@ext`, `@standalone`, and `@monaco-editor/react`.
- Build scripts parsing TypeScript must be defensive about whitespace/formatting variations.

## File Naming
- Memory workflow files: `NN-name-of-file.md` (numeric prefix)
- Keep folder file counts minimal — consolidate where possible
- Suggestions tracked in single file, not individual per-suggestion files
