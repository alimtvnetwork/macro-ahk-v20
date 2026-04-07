# 35 — Implementation Plan

> **Location:** `spec/wp-plugin-publish/03-implementation/35-implementation-plan.md`  
> **Updated:** 2026-02-01  
> **Status:** Ready for Implementation

---

## Overview

Phased implementation plan for the remaining backend services. Each phase builds on the previous, ensuring stable foundations.

---

## Phase 1: Plugin Service (Priority: High)

**Duration:** 2-3 hours  
**Dependencies:** None

### Tasks

1. **Create types.go**
   - Define CreateInput, UpdateInput, CreateMappingInput
   - Define ScanResult, FileInfo types

2. **Implement crud.go**
   - List() - Query all plugins with mappings
   - GetByID() - Get single plugin with mappings
   - Create() - Validate path, scan directory, insert
   - Update() - Dynamic field updates
   - Delete() - Cascade delete mappings

3. **Implement scanner.go**
   - ScanDirectory() - Walk directory, calculate hashes
   - ValidatePath() - Check for valid WP plugin structure
   - findMainPluginFile() - Parse plugin header
   - calculateFileHash() - MD5 hash computation

4. **Implement mappings.go**
   - GetMappings() - List mappings for plugin
   - GetMappingsBySite() - List mappings for site
   - CreateMapping() - Create plugin-site link
   - DeleteMapping() - Remove link

5. **Update database migrations**
   - Add Plugins table if not exists
   - Add PluginMappings table if not exists
   - Add indexes

6. **Update API handlers**
   - Wire up all plugin endpoints in router

### Deliverables
- Complete CRUD for plugins
- Directory scanning working
- Plugin-site mappings functional

---

## Phase 2: Sync Service (Priority: High)

**Duration:** 2-3 hours  
**Dependencies:** Phase 1 (Plugin Service)

### Tasks

1. **Create types.go**
   - Define SyncResult, FileChange types
   - Define SyncOptions, BatchSyncResult

2. **Implement check.go**
   - CheckSync() - Compare local/remote for single mapping
   - CheckAllSites() - Check all mappings for a plugin
   - CheckAllPlugins() - Global sync check

3. **Implement compare.go**
   - compareFiles() - Diff local vs remote file lists
   - Build remote file map for O(1) lookups

4. **Implement changes.go**
   - GetFileChanges() - Query pending changes
   - RecordFileChange() - Insert/update change record
   - MarkSynced() - Update synced timestamp
   - ClearChanges() - Remove all changes for plugin

5. **Update database migrations**
   - Add FileChanges table

6. **Update API handlers**
   - Wire up sync endpoints

### Deliverables
- Local/remote file comparison working
- File change tracking in database
- WebSocket sync events broadcasting

---

## Phase 3: File Watcher Service (Priority: Medium)

**Duration:** 2 hours  
**Dependencies:** Phase 1, Phase 2

### Tasks

1. **Implement scanner.go**
   - scanDirectory() - Full directory walk with hash
   - isExcluded() - Pattern matching for excludes
   - calculateHash() - MD5 hash for files

2. **Implement watcher.go**
   - watchLoop() - Main polling loop per plugin
   - broadcastChanges() - Send via WebSocket
   - Debounce logic for rapid changes

3. **Implement service.go**
   - StartAll() - Start watchers for enabled plugins
   - StopAll() - Clean shutdown
   - StartPlugin() / StopPlugin() - Individual control
   - TriggerScan() - Manual scan

4. **Integration with Sync Service**
   - Call RecordFileChange() when changes detected

5. **Update API handlers**
   - Watcher control endpoints

### Deliverables
- Real-time file change detection
- Configurable exclude patterns
- Manual scan trigger

---

## Phase 4: Publish Service (Priority: Medium)

**Duration:** 3 hours  
**Dependencies:** Phase 1, Phase 2, Backup Service

### Tasks

1. **Implement types.go**
   - PublishOptions, PublishResult
   - StageResult, PackageInfo

2. **Implement pipeline.go**
   - Publish() - Orchestrate full pipeline
   - runStage() - Execute and track stage
   - failPublish() - Handle failures

3. **Implement packager.go**
   - CreatePackage() - Build ZIP with correct structure
   - Include manifest and checksums

4. **Implement uploader.go**
   - uploadPackage() - Send to WP REST API
   - Handle chunked uploads for large plugins

5. **Update WordPress client**
   - Add UploadPlugin() method
   - Add ActivatePlugin() method

6. **Update API handlers**
   - Publish endpoints

### Deliverables
- Full publish pipeline working
- Stage-by-stage progress via WebSocket
- Backup before publish (optional)

---

## Phase 5: Git & Build Service (Priority: Medium)

**Duration:** 2-3 hours  
**Dependencies:** Phase 1

### Tasks

1. **Implement types.go**
   - PullResult, BuildResult
   - BatchPullResult, PluginGitConfig

2. **Implement pull.go**
   - Pull() - Single plugin git pull
   - PullAll() - Batch pull
   - GetStatus() - Current git status
   - runGitCommand() - Execute git commands

3. **Implement build.go**
   - Build() - Execute PowerShell/bash command
   - PullAndBuild() - Combined operation
   - Config CRUD for build settings

4. **Add database table**
   - PluginGitConfig table

5. **Update API handlers**
   - Git and build endpoints

### Deliverables
- Git pull working (single and batch)
- PowerShell/bash build execution
- Per-plugin git configuration

---

## Phase 6: Integration & Testing (Priority: High)

**Duration:** 2-3 hours  
**Dependencies:** All previous phases

### Tasks

1. **End-to-end workflow testing**
   - Create plugin → Map to site → Check sync → Publish

2. **WebSocket event verification**
   - All events broadcasting correctly

3. **Error handling review**
   - Consistent error codes
   - Proper logging

4. **Frontend integration**
   - Update hooks to use real API
   - Test all UI flows

5. **Documentation update**
   - Update README with setup instructions
   - Document API endpoints

---

## Implementation Order Summary

```
Week 1:
├── Phase 1: Plugin Service (Day 1)
├── Phase 2: Sync Service (Day 2)
└── Phase 3: File Watcher (Day 3)

Week 2:
├── Phase 4: Publish Service (Day 1-2)
├── Phase 5: Git & Build (Day 2-3)
└── Phase 6: Integration (Day 3-4)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WordPress API changes | Use versioned REST endpoints, test against multiple WP versions |
| Large plugin directories | Implement chunked scanning, limit concurrent operations |
| Git command failures | Graceful error handling, timeout protection |
| PowerShell execution | Sandbox via ExecutionPolicy, timeout limits |

---

## Success Criteria

- [ ] All CRUD operations working for plugins and mappings
- [ ] Sync check accurately detects file differences
- [ ] File watcher detects changes within poll interval
- [ ] Publish uploads and activates plugins successfully
- [ ] Git pull and build commands execute correctly
- [ ] All WebSocket events broadcast as expected
- [ ] Error handling consistent across services

---

*Implementation begins with Phase 1: Plugin Service*
