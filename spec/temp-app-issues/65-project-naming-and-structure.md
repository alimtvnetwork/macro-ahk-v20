# Issue 65 — Project Naming Convention & Structure

**Date**: 2026-03-25  
**Status**: ✅ Closed (name fixed; slug/codeName UI merged into Issue #67)  
**Severity**: Medium  
**Component**: Default Project Seeder, Options UI

---

## Issue Summary

Multiple naming and structural problems in the SDK project as displayed in the Options UI:

1. **Incorrect display name**: Project shows "Rise Up Macro SDK" — should be "Riseup Macro SDK" (one word, lowercase 'up')
2. **Slug placement wrong**: The `slug` badge is inline with the description field, making it look like part of the description. It should be displayed below the title in its own row
3. **Missing CodeName display**: The `codeName` (PascalCase identifier used in SDK namespace) is not shown anywhere in the project header. Developers need to see this to write code against the SDK

## Root Cause

1. **Naming**: `buildSdkProject()` in `src/background/default-project-seeder.ts` line 142 hardcodes `name: "Rise Up Macro SDK"` — should be `"Riseup Macro SDK"`
2. **Slug placement**: `ProjectHeader` in `src/components/options/ProjectDetailView.tsx` line 460-462 renders the slug inline with the description input, squeezed into the same row
3. **Missing codeName**: `ProjectHeader` never computes or displays `codeName`. The `toCodeName()` utility exists in `src/lib/slug-utils.ts` but is unused in the header

## Affected Files

| File | Issue |
|------|-------|
| `src/background/default-project-seeder.ts` | Wrong name string "Rise Up Macro SDK" (lines 99, 142, 154) |
| `src/components/options/ProjectDetailView.tsx` | Slug inline with description (line 460-462), no codeName display |
| `standalone-scripts/marco-sdk/src/index.ts` | Console log says "Rise Up Macro SDK" (line 61) |

## Solution Direction

1. Change all occurrences of "Rise Up Macro SDK" to "Riseup Macro SDK" across seeder, SDK source, specs, and memory files
2. Move slug display below the name/version row, in its own labeled section
3. Add codeName display next to slug, computed via `toCodeName(slug)`
4. Layout should be:
   ```
   [← Back]  Riseup Macro SDK  v1.0.0  [+1]
             Description: Core SDK providing...
             slug: riseup-macro-sdk | codeName: RiseupMacroSdk
   ```

## Done Checklist

- [ ] All "Rise Up" references changed to "Riseup" in code + specs
- [ ] Slug displayed in own row below description
- [ ] CodeName displayed next to slug
- [ ] Seeder normalized to correct name on update
