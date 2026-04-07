# Issue 62 — Backend Menu Swagger Visibility, Storage Expansion, Prompt Completeness, and Project Files/ZIP Workflow

**Date**: 2026-03-22  
**Status**: ✅ Fixed (all 6 tasks implemented — verified 2026-04-05)
**Requested by user**: Yes

---

## Problem Summary

The user reported multiple UX/functionality gaps that must be handled as a single coordinated workstream:

1. Swagger-like API endpoint explorer is not visible where expected in backend menu.
2. Storage browser still lacks Session/Cookies/IndexedDB surfaces.
3. Prompt area shows only one prompt instead of complete seeded + user prompts.
4. Timing/Data/Network/Diagnostics should be moved under an overflow `...` menu.
5. Projects area needs a new **Files & Storage** option:
   - file tree for project folder/files
   - VSCode-like text editor
   - save + delete operations
6. Project ZIP workflow is required:
   - full export as ZIP
   - import with conflict modes: **Merge** or **Replace all**

---

## Scope

### In Scope
- Backend menu discoverability and IA updates
- Storage browser coverage updates (Session, Cookies, IndexedDB)
- Prompt list regression root-cause + fix
- Overflow menu consolidation for specific tools
- Project file manager (CRUD for text files)
- ZIP import/export (project-level data + files)

### Out of Scope (for this workstream)
- Arbitrary binary editor features
- Cross-project sync conflict UI beyond Merge/Replace-all
- Backend/cloud architecture changes unrelated to extension storage model

---

## Execution Order (One Task at a Time)

| Order | Task | Deliverable | Acceptance |
|------:|------|-------------|------------|
| 1 | Backend Swagger discoverability | API Explorer visible in backend menu | User can open API explorer without going through hidden location |
| 2 | Storage surfaces | Session/Cookies/IndexedDB sections in Storage browser | User can inspect each source from options UI |
| 3 | Prompt completeness | Prompt section shows complete seeded + user prompts | No single-prompt regression; seeded catalog restored |
| 4 | Overflow menu | `...` menu for timing/data/network/diagnostics | Hover/click access works and declutters main toolbar |
| 5 | Files & Storage manager | Project file tree + editor + save/delete | User can browse/edit/delete files for selected project |
| 6 | ZIP workflow | Export ZIP + import Merge/Replace all | Replace-all wipes target project before repopulation; Merge preserves non-conflicting entries |

---

## Technical Notes (Implementation Intent)

- Prefer existing SQLite-backed project data APIs (`project_kv`, `project_files`) where available.
- Keep operations routed through extension message handlers.
- Add explicit status/progress to long-running import/export actions.
- Preserve schema consistency (PascalCase for extension DB schema where applicable).

---

## Validation Strategy

For each task:
1. Implement minimal required change.
2. Run typecheck/build.
3. Verify end-to-end behavior in extension UI.
4. Only then proceed to next task.

---

## Pending Clarifications Before Task 1 Implementation

1. Exact backend menu destination label for API Explorer (new top-level item vs existing backend subsection entry).
2. Files editor capability for non-text files (block vs readonly preview).
3. ZIP payload composition boundaries (project-only vs include prompt associations and KV metadata by default).
