# Issue 71 — Updater UI Missing Most UpdaterInfo Fields

**Date**: 2026-03-25  
**Status**: ✅ Fixed  
**Severity**: Medium  
**Component**: Options UI, UpdaterPanel

---

## Issue Summary

The UpdaterPanel component (`src/components/options/UpdaterPanel.tsx`) only exposes 3 fields in the "Add Source" form: Name, Script URL, and Version Info URL. The spec (`spec/11-chrome-extension/58-updater-system.md`) and data model (`spec/07-data-and-api/data-models.md`) define **20+ fields** on UpdaterInfo that are not represented in the UI.

## Missing Fields

### From UpdaterInfo model (spec 17):

| Field | Type | In UI? |
|-------|------|--------|
| Name | String | ✅ |
| ScriptUrl | String | ✅ |
| VersionInfoUrl | String | ✅ |
| InstructionUrl | String | ❌ |
| IsGit | Boolean | ❌ |
| IsRedirectable | Boolean | ❌ |
| MaxRedirectDepth | Int | ❌ |
| HasChangelogFromVersionInfo | Boolean | ❌ |
| HasUserConfirmBeforeUpdate | Boolean | ❌ |
| AutoCheckIntervalMinutes | Int | ❌ |
| CacheExpiryMinutes | Int | ❌ |
| CachedRedirectUrl | String | ❌ |
| CachedRedirectExpiresAt | DateTime | ❌ |
| CurrentVersion | String | ❌ |
| LatestVersion | String | ❌ |
| LastCheckAt | DateTime | ❌ (shown in list but not editable) |
| LastUpdateAt | DateTime | ❌ |
| Status | String | ✅ (read-only) |

### Missing Related Tables
- **UpdaterEndpoint**: Ordered list of fallback URLs — no UI to add/remove/reorder
- **UpdaterStep**: Ordered update steps (Download, Execute, Update, Validate) — no UI
- **UpdaterCategory**: Category tagging (Script, Core, Plugin) — no UI

## Root Cause

The UpdaterPanel was implemented as a minimal MVP with only 3 fields. The `UpdaterEntry` interface in the component (lines 23-36) includes some fields but doesn't match the full spec.

## Solution Direction

1. **Expand the Add form** with collapsible "Advanced Settings" section containing all UpdaterInfo fields
2. **Add endpoint management**: Ordered list of URLs with drag-to-reorder
3. **Add step management**: Define update execution steps
4. **Add category tagging**: Multi-select from available categories
5. **Show detailed view**: Click an updater entry to see/edit all fields
6. **Wire to real handler**: Replace `setTimeout` mock with actual `CHECK_FOR_UPDATE` message

## UI Layout

```
Add Source
├── Basic: Name, Script URL, Version Info URL, Instruction URL
├── Behavior: IsGit, IsRedirectable, MaxRedirectDepth
├── Schedule: AutoCheckIntervalMinutes, CacheExpiryMinutes
├── Confirmation: HasChangelog, HasUserConfirm
├── Endpoints: [Ordered URL list]
└── Steps: [Ordered step list]
```

## Done Checklist

- [x] All UpdaterInfo fields exposed in Add/Edit form
- [x] Endpoint management (add/remove/reorder)
- [x] Step management (add/remove/reorder)
- [x] Category tagging
- [x] Wired to real CHECK_FOR_UPDATE handler
- [x] UI header alignment fixed (per user feedback)
