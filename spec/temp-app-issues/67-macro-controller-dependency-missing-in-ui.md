# Issue 67 — Macro Controller Dependency on SDK Not Visible in UI

**Date**: 2026-03-25  
**Status**: ✅ Fixed  
**Severity**: Medium  
**Component**: Options UI, Project Detail View

---

## Issue Summary

The Macro Controller project declares a dependency on the Riseup Macro SDK in its seeding code (`dependencies: [{ projectId: SDK_PROJECT_ID, version: "^1.0.0" }]` at `default-project-seeder.ts` line 181), but the Options UI has **no tab or section** that displays project dependencies.

Users repeatedly report confusion about which project depends on which.

## Root Cause

1. **No "General" or "Overview" tab**: The project detail view tabs are: Scripts, URL Rules, Variables, XPath, Cookies, Update, Docs — none shows project metadata like dependencies, global flag, or removable flag
2. **`ProjectDependency` type exists** in `src/shared/project-types.ts` (lines 49-53) but is never rendered in any UI component
3. The `StoredProject.dependencies` field is populated by the seeder but invisible to the user

## Solution Direction

Add a **"General"** tab (or "Overview") as the first tab in the project detail view:

### General Tab Contents
- **Project Info**: Name, version, description, slug, codeName (read-only summary)
  - Slug and codeName displayed in their own row below title (merged from Issue #65)
- **Dependencies**: List of `ProjectDependency` entries showing:
  - Parent project name (resolved from `projectId`)
  - Version constraint (e.g., `^1.0.0`)
  - Status indicator (resolved/missing)
- **Flags**: `isGlobal`, `isRemovable` as read-only badges
- **Settings**: `isolateScripts`, `logLevel`, `retryOnNavigate`

## Affected Files

| File | Change |
|------|--------|
| `src/components/options/ProjectDetailView.tsx` | Add "General" tab, render dependencies |
| `src/shared/project-types.ts` | No change needed (type already exists) |

## Done Checklist

- [x] "General" tab added as first tab in project detail view
- [x] Dependencies list rendered with project name resolution
- [x] isGlobal and isRemovable flags shown as badges
- [x] Project settings (logLevel, isolateScripts, retryOnNavigate) shown
