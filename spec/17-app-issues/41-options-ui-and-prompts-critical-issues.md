# Issue 41: Options UI & Prompts Critical Issues (User Reported)

**Version**: vTBD
**Date**: 2026-03-18
**Status**: Fixed (all checklist items completed)

---

## Issue Summary

### What happened

Multiple high-impact UX and data model issues were reported across Scripts, Projects, Config editor, and Prompts flows. Several actions fail or do not match expected architecture, causing broken workflows.

### Where it happened

- **Feature**: Scripts section model/UI
- **Feature**: Projects section Add flow
- **Feature**: Config editor (Raw JSON)
- **Feature**: Prompt management save + editor
- **Feature**: Extension embedded prompt insertion

### Symptoms and impact

- Add and edit flows are inconsistent or broken.
- Prompt save can fail with quota exceeded.
- Editor capabilities are incomplete (syntax highlighting/format/strip formatting).
- Prompt insertion may truncate content in embedded mode.
- Overall impact: core authoring workflows become unreliable.

### How it was discovered

User report during manual end-to-end usage.

---

## TODO and Follow-Ups

1. [x] **Scripts architecture/UI**: Ensure Scripts section focuses on scripts as primary entities; each script has a name and supports multiple bound JSON configs; allow linking from script library.
2. [x] **Projects Add button + model**: Fix non-working Add in Projects; support same bind UI pattern as Scripts; one script per row/group with multiple ordered JSON configs; project supports multiple script groups.
3. [x] **Config Raw JSON editor**: Ensure Raw JSON tab has JSON syntax highlighting + formatter and no blank-page failure.
4. [x] **Prompts persistence quota fix**: Resolve `QUOTA_BYTES_PER_ITEM quota exceeded`; move prompt persistence from quota-limited storage path to SQLite-backed storage.
5. [x] **Markdown editor quality**: Add robust markdown syntax highlighting, markdown formatter, and a control to strip/remove bold formatting.
6. [x] **Embedded prompt insertion completeness**: Fix prompt insertion so selecting items like Unified AI prompt inserts full text (no truncation).
7. [x] **Reliability requirement**: Keep “zero blank page” behavior with visible error modal/panel for any runtime failure.

---

## Execution Plan (One by One)

1. Fix Projects Add flow + script/config binding model
2. Fix Scripts section model/UI to match the same pattern
3. Fix Config Raw JSON highlighting/formatter and crash safety
4. Fix Prompt save quota by moving to SQLite
5. Improve Markdown editor (highlight + formatter + strip bold)
6. Fix embedded prompt full-text insertion
7. Run end-to-end regression checks for Scripts, Projects, Configs, and Prompts

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [ ] Root-cause + code fix log per item added after each implementation
- [ ] End-to-end test evidence captured after each item
