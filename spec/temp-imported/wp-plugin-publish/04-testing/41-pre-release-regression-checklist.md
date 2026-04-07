# WP Plugin Publish — Pre-Release Regression Checklist

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28  
> **Source**: [E2E Test Specification](40-e2e-test-spec.md)  
> **Total tests**: 20  
> **Estimated time**: ~45 minutes

---

## Instructions

1. Copy this file into your release branch as `checklist-vX.Y.Z.md`
2. Fill in the **Release** and **Tester** fields below
3. Work through each section; tick the box when the test passes
4. Record any failures in the **Notes** column
5. All tests should pass before release; document waivers for any skipped tests

| Field | Value |
|-------|-------|
| **Release** | `v___` |
| **Tester** | |
| **Date** | |
| **Backend version** | `commit:` |
| **Test WP site** | |

---

## Sign-Off Summary

| Suite | Total | Passed | Failed | Waived |
|-------|-------|--------|--------|--------|
| Plugin CRUD | 5 | | | |
| Site Connections | 4 | | | |
| Sync Operations | 6 | | | |
| Publish Flow | 5 | | | |
| **All** | **20** | | | |

**Release decision**: ☐ GO &nbsp; ☐ NO-GO

**Approved by**: _________________________ **Date**: _________

---

## Plugin CRUD (TC-PLUGIN-*)

- [ ] **TC-PLUGIN-001 — Register Plugin**
  POST /plugins with valid path → response contains plugin data → plugin appears in GET /plugins.
  _Notes:_

- [ ] **TC-PLUGIN-002 — Register Invalid Path**
  POST /plugins with non-existent path → error response with E3002.
  _Notes:_

- [ ] **TC-PLUGIN-003 — Update Plugin**
  Create plugin → PUT /plugins/{id} → updated fields verified.
  _Notes:_

- [ ] **TC-PLUGIN-004 — Delete Plugin**
  Create plugin → DELETE /plugins/{id} → 404 on GET /plugins/{id}.
  _Notes:_

- [ ] **TC-PLUGIN-005 — Scan Plugin Files**
  Create plugin → POST /watcher/scan/{id} → file count returned.
  _Notes:_

---

## Site Connections (TC-SITE-*)

- [ ] **TC-SITE-001 — Register Site**
  POST /sites with valid credentials → response contains site data → site appears in GET /sites.
  _Notes:_

- [ ] **TC-SITE-002 — Test Connection**
  Create site → POST /sites/{id}/test → success response with WP version.
  _Notes:_

- [ ] **TC-SITE-003 — Invalid Credentials**
  Create site with bad password → POST /sites/{id}/test → error response.
  _Notes:_

- [ ] **TC-SITE-004 — Create Plugin Mapping**
  Create plugin + site → POST /plugins/{id}/mappings → mapping created.
  _Notes:_

---

## Sync Operations (TC-SYNC-*)

- [ ] **TC-SYNC-001 — Detect New Files**
  Create plugin → add file → scan → "added" status in changes.
  _Notes:_

- [ ] **TC-SYNC-002 — Detect Modified Files**
  Create plugin with file → modify content → scan → "modified" status.
  _Notes:_

- [ ] **TC-SYNC-003 — Detect Deleted Files**
  Create plugin with file → delete file → scan → "deleted" status.
  _Notes:_

- [ ] **TC-SYNC-004 — Compare Local/Remote**
  Create plugin + site mapping → POST sync endpoint → changedFiles count verified.
  _Notes:_

- [ ] **TC-SYNC-005 — Git Pull Detection**
  Create git-enabled plugin → POST /git/pull/{id} → scan triggered automatically.
  _Notes:_

- [ ] **TC-SYNC-006 — Batch Scan All**
  Create multiple plugins → POST /watcher/scan-all → results for each plugin.
  _Notes:_

---

## Publish Flow (TC-PUBLISH-*)

- [ ] **TC-PUBLISH-001 — Full ZIP Upload**
  Create plugin + mapping → publish with mode=full → filesUpdated count verified.
  _Notes:_

- [ ] **TC-PUBLISH-002 — Selected Files Patch**
  Create plugin with changes → publish with mode=selected, files=[...] → only selected files updated.
  _Notes:_

- [ ] **TC-PUBLISH-003 — Backup Before Publish**
  Publish with createBackup=true → backupId in response → backup file exists.
  _Notes:_

- [ ] **TC-PUBLISH-004 — Restore From Backup**
  Create backup → POST /backups/{id}/restore → restore success.
  _Notes:_

- [ ] **TC-PUBLISH-005 — Publish All Sites**
  Create plugin with multiple mappings → batch publish → all sites updated.
  _Notes:_

---

## Failure Log

| Test ID | Failure Description | Severity | Ticket | Waiver? |
|---------|---------------------|----------|--------|---------|
| | | | | |

---

## Related Documentation

- [E2E Test Specification](40-e2e-test-spec.md) — Full test definitions, schemas, and API endpoints

---

*Pre-release regression checklist v1.0.0 — 2026-02-28*
