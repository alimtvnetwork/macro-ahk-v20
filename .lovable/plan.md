## Root Cause Analysis

### Problem: Large/missing prompts not appearing in dropdown

**Root Cause (3 layers):**

1. **Missing prompt entry**: `Unit Test Issues V2 Enhanced` (5689 chars, the largest prompt) is present in the bundled `macro-prompts.json` (aggregated from `standalone-scripts/prompts/14-unit-test-issues-v2-enhanced/`) but is **missing from both fallback lists**:
   - `DEFAULT_PROMPTS` in `prompt-loader.ts` (13 entries, missing #14)
   - `getFallbackDefaultPrompts()` in `prompt-handler.ts` (13 entries, missing #14)

2. **Silent filtering**: `normalizePromptEntries()` in `prompt-utils.ts` silently drops entries where `name` or `text` is falsy (`if (name && text)`), with **no diagnostic logging** — making it impossible to identify why prompts disappear.

3. **Fallback chain fragility**: When the extension bridge or SDK is unavailable, the hardcoded `DEFAULT_PROMPTS` is used. Any prompt not in this list simply vanishes with no trace.

### Fix Plan

| # | File | Change |
|---|------|--------|
| 1 | `prompt-loader.ts` | Add `Unit Test Issues V2 Enhanced` to `DEFAULT_PROMPTS` |
| 2 | `prompt-handler.ts` | Add `Unit Test Issues V2 Enhanced` to `getFallbackDefaultPrompts()` |
| 3 | `prompt-utils.ts` | Add warning log in `normalizePromptEntries` when entries are dropped (name or text missing) |
| 4 | `startup-timing.ts` | Append version number to the timing summary footer |
| 5 | Version files | Bump 2.110.0 → 2.111.0 |
| 6 | `CHANGELOG.md` | Add v2.111.0 entry |
| 7 | Memory | Write RCA to memory |
