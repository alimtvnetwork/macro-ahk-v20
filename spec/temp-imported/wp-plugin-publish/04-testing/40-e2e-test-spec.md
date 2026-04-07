# 40 — End-to-End Test Specification

> **Location:** `spec/wp-plugin-publish/04-testing/40-e2e-test-spec.md`  
> **Updated:** 2026-02-02  
> **Status:** Active

---

## Overview

This document defines the E2E test suite for WP Plugin Publish. Tests run against **real WordPress sites** configured in the application and validate the complete plugin lifecycle: registration, synchronization, and publishing.

---

## Test Architecture

### Test Runner

- **Backend:** Go test service (`backend/internal/services/e2e/`)
- **Frontend:** React UI for test execution and results viewing
- **Database:** Split DB architecture for test data isolation
- **API:** REST endpoints for triggering/monitoring tests

### Test Categories

| Category | Description | Tests |
|----------|-------------|-------|
| `plugin-crud` | Plugin registration, update, delete | 5 |
| `site-connections` | Site CRUD, WP REST API connectivity | 4 |
| `sync-operations` | File scanning, hash comparison, change detection | 6 |
| `publish-flow` | ZIP upload, single-file patches, backup/restore | 5 |

---

## Test Configuration

### Split Database Integration

Tests use a dedicated database layer following the Split DB architecture:

```
data/
├── root.db
└── tests/
    ├── config/
    │   └── test-config.db       # Test configuration
    ├── results/
    │   ├── {run-id}.db          # Per-run results
    │   └── ...
    └── fixtures/
        └── test-fixtures.db      # Test fixtures and mock data
```

### Test Configuration Schema

```sql
-- test-config.db
CREATE TABLE test_suites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,          -- plugin-crud, site-connections, sync-operations, publish-flow
    enabled BOOLEAN DEFAULT TRUE,
    timeout_seconds INTEGER DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE test_cases (
    id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    preconditions TEXT,              -- JSON array of required state
    steps TEXT NOT NULL,             -- JSON array of test steps
    expected_result TEXT NOT NULL,
    timeout_seconds INTEGER DEFAULT 10,
    order_index INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (suite_id) REFERENCES test_suites(id)
);
```

### Test Results Schema

```sql
-- {run-id}.db
CREATE TABLE test_run (
    id TEXT PRIMARY KEY,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    status TEXT DEFAULT 'running',   -- running, passed, failed, aborted
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    skipped_tests INTEGER DEFAULT 0,
    duration_ms INTEGER
);

CREATE TABLE test_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    suite_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    status TEXT NOT NULL,            -- passed, failed, skipped, error
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    duration_ms INTEGER,
    error_message TEXT,
    error_details TEXT,              -- Full stack trace
    request_data TEXT,               -- JSON of request sent
    response_data TEXT,              -- JSON of response received
    logs TEXT,                       -- Related log entries
    FOREIGN KEY (run_id) REFERENCES test_run(id)
);
```

---

## Test Suites

### 1. Plugin CRUD (TC-PLUGIN-*)

| ID | Name | Description | Steps |
|----|------|-------------|-------|
| TC-PLUGIN-001 | Register Plugin | Register a new plugin from local directory | 1. Call POST /plugins with valid path<br>2. Verify response contains plugin data<br>3. Verify plugin appears in GET /plugins |
| TC-PLUGIN-002 | Register Invalid Path | Attempt to register non-existent path | 1. Call POST /plugins with invalid path<br>2. Verify error response with E3002 |
| TC-PLUGIN-003 | Update Plugin | Update plugin settings | 1. Create plugin<br>2. Call PUT /plugins/{id}<br>3. Verify updated fields |
| TC-PLUGIN-004 | Delete Plugin | Delete plugin registration | 1. Create plugin<br>2. Call DELETE /plugins/{id}<br>3. Verify 404 on GET /plugins/{id} |
| TC-PLUGIN-005 | Scan Plugin Files | Scan local plugin directory | 1. Create plugin<br>2. Call POST /watcher/scan/{id}<br>3. Verify file count returned |

### 2. Site Connections (TC-SITE-*)

| ID | Name | Description | Steps |
|----|------|-------------|-------|
| TC-SITE-001 | Register Site | Register a WordPress site | 1. Call POST /sites with valid credentials<br>2. Verify response contains site data<br>3. Verify site appears in GET /sites |
| TC-SITE-002 | Test Connection | Test WP REST API connectivity | 1. Create site<br>2. Call POST /sites/{id}/test<br>3. Verify success response with WP version |
| TC-SITE-003 | Invalid Credentials | Test with bad credentials | 1. Create site with invalid password<br>2. Call POST /sites/{id}/test<br>3. Verify error response |
| TC-SITE-004 | Create Plugin Mapping | Map plugin to site | 1. Create plugin<br>2. Create site<br>3. Call POST /plugins/{id}/mappings<br>4. Verify mapping created |

### 3. Sync Operations (TC-SYNC-*)

| ID | Name | Description | Steps |
|----|------|-------------|-------|
| TC-SYNC-001 | Detect New Files | Detect newly added files | 1. Create plugin<br>2. Add file to plugin directory<br>3. Trigger scan<br>4. Verify "added" status in changes |
| TC-SYNC-002 | Detect Modified Files | Detect file modifications | 1. Create plugin with existing file<br>2. Modify file content<br>3. Trigger scan<br>4. Verify "modified" status |
| TC-SYNC-003 | Detect Deleted Files | Detect removed files | 1. Create plugin with file<br>2. Delete file<br>3. Trigger scan<br>4. Verify "deleted" status |
| TC-SYNC-004 | Compare Local/Remote | Compare hashes with remote | 1. Create plugin and site mapping<br>2. Call POST /plugins/{id}/sites/{siteId}/sync<br>3. Verify changedFiles count |
| TC-SYNC-005 | Git Pull Detection | Detect changes after git pull | 1. Create git-enabled plugin<br>2. Call POST /git/pull/{id}<br>3. Verify scan triggered automatically |
| TC-SYNC-006 | Batch Scan All | Scan all plugins at once | 1. Create multiple plugins<br>2. Call POST /watcher/scan-all<br>3. Verify results for each plugin |

### 4. Publish Flow (TC-PUBLISH-*)

| ID | Name | Description | Steps |
|----|------|-------------|-------|
| TC-PUBLISH-001 | Full ZIP Upload | Upload complete plugin as ZIP | 1. Create plugin and mapping<br>2. Call POST /plugins/{id}/sites/{siteId}/publish with mode=full<br>3. Verify filesUpdated count |
| TC-PUBLISH-002 | Selected Files Patch | Upload only changed files | 1. Create plugin with changes<br>2. Call publish with mode=selected, files=[...]<br>3. Verify only selected files updated |
| TC-PUBLISH-003 | Backup Before Publish | Create backup before publishing | 1. Call publish with createBackup=true<br>2. Verify backupId in response<br>3. Verify backup file exists |
| TC-PUBLISH-004 | Restore From Backup | Restore plugin from backup | 1. Create backup<br>2. Call POST /backups/{id}/restore<br>3. Verify restore success |
| TC-PUBLISH-005 | Publish All Sites | Publish to all mapped sites | 1. Create plugin with multiple mappings<br>2. Call batch publish endpoint<br>3. Verify all sites updated |

---

## Test Fixtures

### Plugin Fixtures

```json
{
  "test_plugin_valid": {
    "name": "Test Plugin",
    "path": "./test-fixtures/plugins/test-plugin",
    "watchEnabled": true,
    "excludePatterns": ["node_modules", ".git"]
  },
  "test_plugin_git": {
    "name": "Git Plugin",
    "path": "./test-fixtures/plugins/git-plugin",
    "gitEnabled": true,
    "gitRemoteUrl": "https://github.com/example/test-plugin.git",
    "buildCommand": "npm run build"
  }
}
```

### Site Fixtures

```json
{
  "test_site_primary": {
    "name": "Test WordPress Site",
    "url": "${TEST_WP_URL}",
    "username": "${TEST_WP_USER}",
    "applicationPassword": "${TEST_WP_APP_PASSWORD}"
  }
}
```

---

## API Endpoints

### E2E Test Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/e2e/suites` | List all test suites |
| GET | `/api/v1/e2e/suites/{id}/cases` | List test cases in suite |
| POST | `/api/v1/e2e/run` | Start test run (all or specific suites) |
| POST | `/api/v1/e2e/run/{suiteId}` | Run specific suite |
| GET | `/api/v1/e2e/runs` | List past test runs |
| GET | `/api/v1/e2e/runs/{id}` | Get run details and results |
| DELETE | `/api/v1/e2e/runs/{id}` | Delete test run |

### Request/Response Examples

**Start Test Run:**
```json
POST /api/v1/e2e/run
{
  "suites": ["plugin-crud", "sync-operations"],
  "parallel": false,
  "stopOnFailure": false
}

Response:
{
  "success": true,
  "data": {
    "runId": "run-2026-02-02-001",
    "status": "running",
    "totalTests": 11
  }
}
```

**Get Run Results:**
```json
GET /api/v1/e2e/runs/run-2026-02-02-001

Response:
{
  "success": true,
  "data": {
    "id": "run-2026-02-02-001",
    "status": "completed",
    "totalTests": 11,
    "passed": 9,
    "failed": 2,
    "skipped": 0,
    "durationMs": 45230,
    "results": [
      {
        "caseId": "TC-PLUGIN-001",
        "status": "passed",
        "durationMs": 1234
      },
      {
        "caseId": "TC-SYNC-004",
        "status": "failed",
        "durationMs": 5678,
        "error": {
          "message": "Hash mismatch",
          "details": "Expected SHA256:abc..., got SHA256:def..."
        }
      }
    ]
  }
}
```

---

## WebSocket Events

| Event | Payload | Description |
|-------|---------|-------------|
| `e2e:run:started` | `{runId, totalTests}` | Test run began |
| `e2e:test:started` | `{runId, caseId, caseName}` | Individual test started |
| `e2e:test:completed` | `{runId, caseId, status, durationMs}` | Individual test finished |
| `e2e:run:completed` | `{runId, status, passed, failed}` | All tests finished |
| `e2e:run:error` | `{runId, error}` | Fatal error during run |

---

## Error Handling

### Error Codes

| Code | Category | Description |
|------|----------|-------------|
| E7001 | E2E | Test suite not found |
| E7002 | E2E | Test case not found |
| E7003 | E2E | Test run in progress |
| E7004 | E2E | Test timeout exceeded |
| E7005 | E2E | Fixture initialization failed |
| E7006 | E2E | Precondition not met |
| E7007 | E2E | Assertion failed |

---

## Success Criteria

- [ ] All 20 test cases defined and executable
- [ ] Test results stored in split database
- [ ] WebSocket real-time progress updates
- [ ] Error details include request/response data
- [ ] Fixtures configurable via environment
- [ ] Test runs can be aborted mid-execution
- [ ] Historical runs accessible for comparison

---

*E2E tests validate the complete plugin lifecycle against real WordPress sites.*
