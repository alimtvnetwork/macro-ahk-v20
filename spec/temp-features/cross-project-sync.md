# Spec: Cross-Project Sync — Shared Assets & Linked Projects

**Version**: 1.0.0  
**Status**: DRAFT  
**Created**: 2026-03-26  

---

## 1. Problem Statement

Users managing multiple projects duplicate prompts, scripts, and settings across each one. There's no mechanism to share assets between projects, sync changes, or link related projects together.

---

## 2. Features

### 2.1 Shared Asset Library

A global (non-project-specific) asset pool for reusable items:

| Asset Type | Description |
|------------|-------------|
| Prompts | Reusable prompt templates |
| Scripts | Utility scripts usable across projects |
| Chains | Automation chains (from spec/21) |
| Settings Presets | Bundled configuration snapshots |

### 2.2 Asset Linking Model

```
Global Library
  └── SharedPrompt "code-review" v2.1
        ├── linked → Project A (uses v2.1)
        ├── linked → Project B (uses v2.0, update available)
        └── linked → Project C (detached, local copy)
```

Three link states:
- **Synced**: auto-updates when library version changes
- **Pinned**: locked to a specific version
- **Detached**: local copy, no further updates

### 2.3 Project Groups

Related projects can be grouped:

```json
{
  "groupName": "Client X",
  "projects": ["proj-uuid-1", "proj-uuid-2", "proj-uuid-3"],
  "sharedSettings": {
    "storeUrl": "https://...",
    "theme": "dark"
  }
}
```

Group-level settings cascade to member projects unless overridden locally.

---

## 3. UI Design

### 3.1 Library Tab

New "Library" tab in Options sidebar:

```
┌──────────────────────────────────────────┐
│ 📚 Shared Library                         │
├──────────────────────────────────────────┤
│ [Prompts] [Scripts] [Chains] [Presets]   │
│                                          │
│ ┌────────────────────────────────────┐   │
│ │ 📝 code-review          v2.1      │   │
│ │ Used in: Project A, B             │   │
│ │ [Edit] [Version History] [Delete] │   │
│ ├────────────────────────────────────┤   │
│ │ 📝 fix-errors            v1.0     │   │
│ │ Used in: Project A                │   │
│ │ [Edit] [Version History] [Delete] │   │
│ └────────────────────────────────────┘   │
│                                          │
│ [+ Add to Library from Project ▾]        │
└──────────────────────────────────────────┘
```

### 3.2 Sync Status in Project View

In the project's Prompts/Scripts list, linked items show sync status:

```
📝 code-review  🔗 v2.1 ✅ synced
📝 fix-errors   📌 v1.0 (pinned)
📝 my-custom    ── local only
```

### 3.3 Project Groups Panel

```
┌─────────────────────────────┐
│ 📂 Project Groups           │
├─────────────────────────────┤
│ ▸ Client X (3 projects)     │
│ ▸ Personal (5 projects)     │
│ ▸ Experiments (2 projects)  │
│                             │
│ [+ New Group]               │
└─────────────────────────────┘
```

---

## 4. Data Model

### 4.1 New Tables

```sql
CREATE TABLE SharedAsset (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Type TEXT NOT NULL,          -- 'prompt' | 'script' | 'chain' | 'preset'
  Name TEXT NOT NULL,
  Slug TEXT UNIQUE NOT NULL,
  ContentJson TEXT NOT NULL,
  Version TEXT NOT NULL DEFAULT '1.0.0',
  CreatedAt TEXT DEFAULT (datetime('now')),
  UpdatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE AssetLink (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  SharedAssetId INTEGER NOT NULL REFERENCES SharedAsset(Id),
  ProjectId INTEGER NOT NULL REFERENCES Project(Id),
  LinkState TEXT NOT NULL DEFAULT 'synced',  -- synced | pinned | detached
  PinnedVersion TEXT,
  LocalOverrideJson TEXT,
  UNIQUE(SharedAssetId, ProjectId)
);

CREATE TABLE ProjectGroup (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL,
  SharedSettingsJson TEXT,
  CreatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ProjectGroupMember (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  GroupId INTEGER NOT NULL REFERENCES ProjectGroup(Id),
  ProjectId INTEGER NOT NULL REFERENCES Project(Id),
  UNIQUE(GroupId, ProjectId)
);
```

---

## 5. Sync Engine

```
On Library Asset Update (v2.0 → v2.1):
  ├── Find all AssetLinks where LinkState = 'synced'
  ├── For each: update project's local copy with new content
  ├── Show toast: "Updated 'code-review' in 2 projects"
  │
  ├── Find all AssetLinks where LinkState = 'pinned'
  │   └── Show badge: "Update available (v2.1)"
  │
  └── Detached links: no action
```

---

## 6. Files to Create

| File | Description |
|------|-------------|
| `src/pages/options/views/LibraryView.tsx` | Shared library browser |
| `src/components/library/AssetCard.tsx` | Library item card |
| `src/components/library/VersionHistory.tsx` | Version diff viewer |
| `src/components/library/SyncBadge.tsx` | Link state indicator |
| `src/components/groups/ProjectGroupPanel.tsx` | Group management |
| `src/lib/sync-engine.ts` | Asset sync logic |
| `src/lib/version-manager.ts` | Semantic versioning helpers |

---

## 7. Acceptance Criteria

- [ ] Library tab shows all shared assets with version info
- [ ] Assets can be promoted from a project to the library
- [ ] Linked assets show sync/pinned/detached status
- [ ] Synced assets auto-update across projects on library edit
- [ ] Pinned assets show "update available" badge
- [ ] Detached assets are fully independent copies
- [ ] Project groups cascade shared settings
- [ ] Version history shows diffs between versions
- [ ] Import/export shared library as JSON bundle
