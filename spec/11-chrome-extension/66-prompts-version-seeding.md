# Spec 66 — Prompts Version-Based Seeding & Task Next Shortcuts

**Date**: 2026-03-23  
**Status**: Implemented  
**Spec**: `spec/11-chrome-extension/66-prompts-version-seeding.md`

---

## Overview

Ensures prompts are re-seeded when the bundled prompt catalog changes (version-based), while skipping re-seeding on normal startups. Also adds keyboard shortcuts for Task Next presets.

## Prompts Seeding Pipeline

```
standalone-scripts/prompts/*/
  → scripts/aggregate-prompts.mjs
  → dist/prompts/macro-prompts.json
  → chrome.runtime.getURL("prompts/macro-prompts.json")
  → loadBundledDefaultPrompts()
  → seedDefaultPromptsIfEmpty()
  → SQLite Prompts table
```

### Version-Based Logic

1. Compute a hash-based version string from bundled prompts: `<count>-<hash36>`
2. Store in `chrome.storage.local` under key `marco_prompts_seed_version`
3. On startup:
   - If Prompts table is empty → full seed + store version
   - If stored version differs from computed → re-seed (upsert) + update version
   - If versions match → skip

### Manual Re-Seed

- Message type: `RESEED_PROMPTS` (already wired in message registry)
- UI: Refresh button in PromptManagerPanel
- Behavior: Clears all prompts + re-inserts from bundled JSON + updates version key

## Task Next Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+1 | Task Next ×1 |
| Ctrl+Shift+2 | Task Next ×2 |
| ... | ... |
| Ctrl+Shift+9 | Task Next ×9 |
| Ctrl+Shift+0 | Task Next ×10 |

Implementation: `standalone-scripts/macro-controller/src/ui/keyboard-handlers.ts`

Shortcuts detect both shifted digit symbols (`!@#$%^&*()`) and unshifted digits for cross-keyboard compatibility.

## Related Files

| File | Purpose |
|------|---------|
| `src/background/handlers/prompt-handler.ts` | Version-based seeding logic |
| `scripts/aggregate-prompts.mjs` | Prompt aggregation build step |
| `standalone-scripts/macro-controller/src/ui/keyboard-handlers.ts` | Ctrl+Shift shortcuts |
| `standalone-scripts/macro-controller/src/ui/task-next-ui.ts` | Task Next execution |

## Related Specs
- Spec 45: Prompt Manager CRUD (`spec/11-chrome-extension/45-prompt-manager-crud.md`)
- Spec 52: Prompt Caching (`spec/11-chrome-extension/52-prompt-caching-indexeddb.md`)
