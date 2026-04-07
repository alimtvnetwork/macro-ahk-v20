# Root Cause Analysis — Prompt "Next Task" Regression & Newline Formatting

**Version**: v2.108.0  
**Date**: 2026-04-07  
**Severity**: P1 (functional regression)  
**Reference version**: v1.72.3 (known good)

---

## Issue 01: Next Task Regression

### Symptom
When clicking "Task Next", the **Start Prompt** content was injected instead of the **Next Tasks** prompt. This happened every time, making the Task Next feature completely non-functional.

### Expected Behavior
The correct "Next Tasks" prompt should be resolved and injected.

### Root Cause

**Three compounding failures in the prompt pipeline:**

1. **Missing fallback entry**: `DEFAULT_PROMPTS` in `prompt-loader.ts` (the hardcoded fallback array) did **not** contain a "Next Tasks" entry. When the extension bridge or SDK failed to load prompts, the system fell back to this array, which had no matching entry.

2. **Missing slug/id fields**: All entries in `DEFAULT_PROMPTS` lacked `slug` and `id` fields. Even if a "Next Tasks" entry existed, Priority 1 (slug match) and Priority 2 (id match) in `findNextTasksPrompt()` would fail, requiring the slower Priority 3 (derived name slug) path.

3. **Dangerous last-resort fallback**: When no match was found across all 4 priority levels, `findNextTasksPrompt()` returned `entries[0]` (the first entry) as a "last resort". This silently returned "Start Prompt" — the exact regression symptom.

### Pipeline Stage Analysis

| Stage | Input | Output | Issue |
|-------|-------|--------|-------|
| Load (SDK/bridge) | — | `null` or `[]` | Fails silently in some environments |
| Cache (IndexedDB) | — | empty | No cached data if load never succeeded |
| Fallback | `DEFAULT_PROMPTS` | 10 entries | ❌ Missing "Next Tasks" entry |
| Resolve (`findNextTasksPrompt`) | 10 entries, target=`next-tasks` | `entries[0]` | ❌ All 4 priorities miss → dangerous fallback |
| Inject | Start Prompt text | Injected | ✅ Works but wrong content |

### Fix Applied

1. Added "Next Tasks" entry to `DEFAULT_PROMPTS` with `slug: 'next-tasks'`, `id: 'default-next-tasks'`, `category: 'automation'`
2. Added `slug` and `id` fields to ALL `DEFAULT_PROMPTS` entries
3. **Removed** the `entries[0]` last-resort fallback — `findNextTasksPrompt()` now returns `null` with an explicit error log when no match is found
4. Added 4 regression tests covering all priority levels and the null-return contract

### Prevention

- `findNextTasksPrompt` must NEVER fall back to `entries[0]`
- `DEFAULT_PROMPTS` must always include a "Next Tasks" entry
- Regression tests enforce both constraints

---

## Issue 02: Excessive Newline Formatting

### Symptom
Large prompts (e.g., "Unit Test Issues V2 Enhanced") displayed with too many blank lines between sections, reducing readability.

### Root Cause

The `normalizeNewlines()` function only handled raw `\n{3,}` patterns but missed:

1. **Windows `\r\n` line endings**: Prompt text from some sources uses `\r\n` which doubles the newline count. The regex `\n{3,}` doesn't match `\r\n\r\n\r\n`.

2. **Whitespace-padded blank lines**: Lines containing only spaces or tabs between newlines (e.g., `\n \n \n`) are visually blank but the regex `\n{3,}` doesn't match them because there are non-newline characters between the `\n` chars.

### Fix Applied

Enhanced `normalizeNewlines()` with three-stage cleanup:
1. `\r\n` → `\n` (normalize Windows line endings)
2. `\n[ \t]*\n[ \t]*\n` → `\n\n` (collapse blank-ish lines with whitespace)
3. `\n{3,}` → `\n\n` (collapse consecutive newlines)

### Prevention

- Added regression tests for `\r\n` normalization
- Added regression tests for whitespace-between-newlines collapse
- Added multi-gap large prompt test

---

## Process Cause

The `DEFAULT_PROMPTS` array was maintained manually and fell out of sync with the DB-seeded defaults in `prompt-handler.ts`. No automated check ensured parity between the two prompt sources.

## Regression Cause

The `entries[0]` fallback was introduced as a convenience during initial development but created a silent failure mode. When the prompt list changed and "Next Tasks" was no longer findable, the fallback masked the error by returning wrong content instead of failing explicitly.
