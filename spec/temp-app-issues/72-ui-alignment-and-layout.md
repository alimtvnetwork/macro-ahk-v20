# Issue 72 — UI Alignment and Layout Inconsistencies

**Date**: 2026-03-25  
**Status**: ✅ Fixed  
**Severity**: Low  
**Component**: Options UI

---

## Issue Summary

User reports visual inconsistencies in the project detail view:

1. **Description text position**: In the Macro Controller project, the description text appears shifted to the right due to the description input field alignment. Should be left-aligned with the title
2. **Update tab header**: The "Update Sources" heading appears too far left; should be consistent with other tab content alignment
3. **Slug display**: Slug is inline with description, making it hard to read

## Root Cause

In `ProjectHeader` (`ProjectDetailView.tsx` lines 453-463):
- The description `Input` and the `slug` code badge are in the same flex row
- The description input has `px-1` while the name has `px-2`, causing misalignment
- The Update tab header uses default padding which may differ from other tabs

## Solution Direction

1. Move slug and codeName to their own row below description (resolves issue 65 as well)
2. Normalize padding across all tab content headers
3. Await user screenshot for precise pixel-level fixes

## Done Checklist

- [ ] Description text aligned with title
- [ ] Slug/codeName in their own row
- [ ] Tab content headers consistently aligned
- [ ] Verified with screenshot comparison
