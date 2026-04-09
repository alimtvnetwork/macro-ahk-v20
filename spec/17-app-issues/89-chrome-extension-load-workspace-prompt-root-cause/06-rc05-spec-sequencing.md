# RC-05: Spec Sequencing Inconsistency

**Parent:** [01-overview.md](./01-overview.md)
**Status:** 🔴 Open

---

## Symptom

The spec folder numbering is inconsistent. `02-issues` contains bug reports but should represent **app issues** more broadly. `01-data-and-api` is placed before issues, which doesn't match the logical dependency order.

## Current Spec Ordering

| # | Folder | Content |
|---|--------|---------|
| 00 | overview | Master docs, architecture |
| 01 | data-and-api | Data schemas, API specs |
| 02 | issues | Bug reports, issue tracking |
| 03 | tasks | Roadmap, task breakdowns |
| 04 | macro-controller | Macro controller specs |
| 05 | chrome-extension | Extension architecture |
| 06 | coding-guidelines | Coding standards |
| 07 | devtools-and-injection | DevTools, injection |
| 08 | features | Feature specs |
| 09 | imported | External specs |
| 10 | prompts | AI prompts |

## Proposed Corrected Ordering

| # | Folder | Content | Rationale |
|---|--------|---------|-----------|
| 00 | overview | Master docs, architecture | Unchanged |
| 01 | app-issues | Bug reports, issue tracking, debugging | Formerly `02-issues` — issues are highest priority after overview |
| 02 | data-and-api | Data schemas, API specs | Formerly `01-data-and-api` — foundational data comes after issues |
| 03 | tasks | Roadmap, task breakdowns | Unchanged |
| 04 | macro-controller | Macro controller specs | Unchanged |
| 05 | chrome-extension | Extension architecture | Unchanged |
| 06 | coding-guidelines | Coding standards | Unchanged |
| 07 | devtools-and-injection | DevTools, injection | Unchanged |
| 08 | features | Feature specs | Unchanged |
| 09 | imported | External specs | Unchanged |
| 10 | prompts | AI prompts | Unchanged |

## Impact Analysis: Cross-Reference Changes

### Files referencing `spec/17-app-issues/`
- All 80+ issue files use relative paths to each other (unaffected since they move together)
- External references from `spec/11-chrome-extension/`, `spec/10-macro-controller/`, `.lovable/memory/` files

### Files referencing `spec/07-data-and-api/`
- `spec/readme.md` — needs updating
- `.lovable/memory/project/documentation-hierarchy.md` — needs updating
- Any `@see` comments in source code

### Migration Steps

1. Rename `spec/17-app-issues/` → `spec/17-app-issues/`
2. Rename `spec/07-data-and-api/` → `spec/07-data-and-api/`
3. Update `spec/readme.md`
4. Update `.lovable/memory/project/documentation-hierarchy.md`
5. Search all source files for `spec/01-` and `spec/02-` references
6. Update any `@see` annotations in TypeScript files
7. Verify no broken links

## Risk Assessment

**High risk** — 80+ files reference `spec/17-app-issues/` paths. All internal relative links within the issues folder will continue to work (relative paths), but any ABSOLUTE paths or references FROM other folders will break.

**Recommendation:** This should be done as a dedicated task with a find-and-replace audit, NOT mixed with implementation work.

## Acceptance Criteria

- [ ] Spec folders are renumbered per the corrected ordering
- [ ] `spec/readme.md` reflects new ordering
- [ ] All cross-references are updated (zero broken links)
- [ ] Memory files updated
- [ ] Source code `@see` annotations updated
