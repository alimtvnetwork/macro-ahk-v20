# Issue 43: Scripts, Projects & Markdown Editor UX Overhaul

**Version**: vTBD
**Date**: 2026-03-18
**Status**: ✅ Fixed (AHK file dialog delegation deferred — platform-specific)

---

## Issue Summary

Multiple UX and architecture improvements needed across Scripts, Projects, and Markdown editors in the Chrome extension Options UI.

---

## 1. Scripts Section — Bundle/Group Model

### Current behavior
Scripts are flat entries with a single JS file and an optional single config binding.

### Required behavior
- Scripts section should list script **groups/bundles** (like Projects list — with names, cards).
- Each script group is a named entity containing:
  - **Multiple ordered JSON configs** (loaded first, in order)
  - **Multiple ordered JS files** (run after configs, in order)
- "New" flow should support:
  - Dropping multiple `.json` and `.js` files
  - Adding individual JSON configs or JS files
  - Reordering items within the group
- Each JSON config has a name and order position.
- Each JS file has a name and order position.
- Load sequence: all JSON configs (in order) → all JS files (in order).

---

## 2. Projects Section — Script Binding UX

### Current behavior
Projects can add scripts but the flow is limited.

### Required behavior
Three ways to add scripts to a project:
1. **Select from Script Library** — pick an existing script group/bundle by name
2. **Create New** — inline creation with drop zones for JS/JSON files
3. **Manual entry** — blank script entry

Each project can have **multiple script groups**, ordered.
Each script group follows the same model: multiple ordered JSON configs + multiple ordered JS files.

---

## 3. RunAt Dropdown — UX Polish

### Current behavior
Dropdown shows `document_start`, `document_idle`, `document_end` with underscores.

### Required behavior
- Display in Pascal case: **Start**, **Idle**, **End**
- Add a **? icon** (tooltip on hover) next to each option explaining:
  - **Start**: "Runs before the DOM is parsed. Use for blocking scripts, early overrides, or intercepting network requests."
  - **Idle**: "Runs after the DOM is fully parsed and initial scripts have executed. Best default for most scripts."
  - **End**: "Runs after the page and all resources are fully loaded. Use for post-load cleanup or analytics."
- Apply this change in **both** the Scripts section and the Projects section.

---

## 4. Markdown Editor — Scroll, Highlighting & Preview

### Current behavior
- Scroll up/down is broken in the markdown editor
- Syntax highlighting looks bad / is broken
- No preview mode

### Required behavior
- Fix scrolling so the editor scrolls normally (both the edit area and highlighted overlay)
- Fix markdown syntax highlighting to render correctly without visual glitches
- Add **Edit / Preview toggle tabs**:
  - Edit tab: the code editor with syntax highlighting
  - Preview tab: rendered markdown output (HTML preview)
- Apply fixes to **all markdown editors** across the app (prompts, descriptions, etc.)

---

## Execution Plan

1. Refactor Scripts data model to support bundle/group (multiple JS + multiple JSON, ordered)
2. Update Scripts section UI — list view + group editor with multi-file support
3. Update Projects section — script binding with library select + inline create
4. Fix RunAt dropdown (Pascal case + tooltips) in both Scripts and Projects
5. Fix Markdown editor (scrolling, highlighting, Edit/Preview toggle)

---

## Merged from Issue #44

The following unique items from #44 (Comprehensive UX Fixes & Auto-Attach) are now tracked here.
Items already completed in #44 are marked ✅.

### Project Name & Version Display (from #44 §1)
- Project cards must display the project **name** prominently
- Hide version badge when version is empty (fixes bare "V" display)
- Project name must be editable with a visible **Save** button

### Syntax Highlighter Fix (from #44 §3)
- Displayed code must exactly match underlying source
- Copied text must match displayed text
- No HTML entity or tag leakage into visible output

### Save Button — Explicit Save Flow (from #44 §6)
- Every editing view (Projects, Scripts) must have a visible Save button
- Show loading state while persisting + success toast
- Unsaved changes visually indicated (dirty-state badge)

### Auto-Attach Files (from #44 §5) — Partially Complete
- ✅ Auto-attach config schema defined
- ✅ Auto Attach UI in macro controller menu
- ✅ Attach workflow automation (Plus → Attach click)
- ✅ Load Test Scripts button added
- [ ] AHK delegation for OS file dialog (Windows)
- [ ] End-to-end testing of prompt auto-injection after attach

### Macro Controller UI Polish (from #44 §4) — ✅ Complete
- ✅ Button row padding and centering
- ✅ Button click animation with color slide effect

### Editor IntelliSense (from #44 §16) — ✅ Complete

---

## Done Checklist

- [x] Issue spec created
- [x] Scripts bundle model implemented
- [x] Scripts section UI updated
- [x] Projects script binding updated
- [x] RunAt dropdown polished
- [x] Markdown editor fixed with preview
- [x] Project name/version display fixed (from #44)
- [x] Syntax highlighter rendering fixed (from #44) — Monaco editor used
- [x] Save button added to all edit flows (from #44)
- [ ] AHK delegation for file dialog (from #44) — platform-specific, deferred
- [x] Button spacing and animation (from #44)
- [x] Auto Attach UI + workflow (from #44)
- [x] IntelliSense in editor (from #44)
