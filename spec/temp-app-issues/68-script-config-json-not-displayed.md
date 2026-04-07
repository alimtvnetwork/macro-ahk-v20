# Issue 68 — Script Config JSON Not Displayed in Scripts Tab

**Date**: 2026-03-25  
**Status**: ✅ Fixed  
**Severity**: Medium  
**Component**: Options UI, Scripts Tab

---

## Issue Summary

The Scripts tab shows script entries with their `configBinding` field (e.g., `macro-looping-config.json`), but the actual JSON content of the bound config file is not visible or editable in the UI. This is confusing because:

1. The spec states that scripts have bound config files that define their runtime parameters
2. The `ScriptBinding` type in the UI includes `configBindings` with JSON content
3. The `ProjectScriptSelector` component receives `availableConfigs` but the config JSON is not prominently displayed

## Root Cause

The `ScriptsTabContent` component (lines 576-655 of `ProjectDetailView.tsx`) matches config bindings by ID (`availableConfigs.find(c => c.id === id)`) and formats the JSON, but the `ProjectScriptSelector` component may not render the JSON content prominently enough, or the config entries may not be resolving because the IDs don't match the stored config binding format.

The default project's `configBinding` is set to `"macro-looping-config.json"` (a path string), but `availableConfigs` uses ID-based lookup. This mismatch means configs never resolve.

## Solution Direction

1. **Fix config resolution**: Match configs by both ID and path/name (same as script resolution uses `findScript`)
2. **Display config JSON**: Show an expandable/collapsible JSON viewer for each bound config in the scripts list
3. **Allow inline editing**: Let users edit config JSON directly from the Scripts tab

## Done Checklist

- [x] Config binding resolved by both ID and path/name
- [x] Config JSON displayed in scripts list (collapsible) — already implemented in ProjectScriptSelector
- [x] Config editing supported inline — already implemented via Monaco editor tabs
