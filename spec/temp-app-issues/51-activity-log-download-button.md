# Issue 51: Activity Log Download Button

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: ✅ Fixed

---

## Issue Summary

### What is needed

A download button next to the "Activity Log" section header in the macro controller UI, allowing users to export the activity log as a text/JSON file.

### Where it happens

- **File**: `standalone-scripts/macro-controller/01-macro-looping.js`
- **Section**: Tools & Logs collapsible panel → Activity Log sub-section

---

## Fix Description

1. Add a download icon button (⬇ or 📥) inline with the "Activity Log" header text.
2. On click, collect all log entries from the activity log container.
3. Export as a `.txt` or `.json` file with timestamp in filename (e.g., `activity-log-2026-03-20T14-30.txt`).
4. Use `Blob` + `URL.createObjectURL` + temporary `<a>` element for download.

---

## Acceptance Criteria

1. Download button is visible next to "Activity Log" header when section is expanded.
2. Clicking it downloads a file containing all current log entries.
3. Button follows the controller's theme styling.

---

*Activity log download spec v1.48.0 — 2026-03-20*
