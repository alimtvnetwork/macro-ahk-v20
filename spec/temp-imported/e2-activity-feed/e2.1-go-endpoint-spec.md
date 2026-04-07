# E2.1 Go Endpoint Specification: Unified Activity Feed

> Status: **Spec complete** — ready for Go backend implementation

## Endpoint

```
GET /api/v1/activity
```

## Query Parameters

| Param    | Type   | Default | Description |
|----------|--------|---------|-------------|
| `limit`  | int    | 50      | Max entries per page (1–100) |
| `offset` | int    | 0       | Pagination offset |
| `siteId` | int    | —       | Filter by site ID |
| `type`   | string | —       | Filter by type: `publish`, `snapshot`, `plugin`, `config`, `connection` |
| `from`   | string | —       | ISO-8601 date/time lower bound |
| `to`     | string | —       | ISO-8601 date/time upper bound |
| `search` | string | —       | Full-text search on title, action, siteName |

## Response Schema

Uses the standard response envelope. `Results` contains `ActivityEntry[]`:

```json
{
  "Status": { "IsSuccess": true, "Code": 200, ... },
  "Attributes": {
    "TotalRecords": 142,
    "PerPage": 50,
    "CurrentPage": 1,
    "TotalPages": 3,
    "IsSingle": false,
    "IsMultiple": true,
    "HasAnyErrors": false
  },
  "Navigation": {
    "NextPage": "/api/v1/activity?offset=50&limit=50",
    "PrevPage": null,
    "CloserLinks": []
  },
  "Results": [
    {
      "id": "pub_123",
      "timestamp": "2026-02-12T10:30:00Z",
      "siteId": 1,
      "siteName": "Production Site",
      "type": "publish",
      "action": "deploy",
      "title": "Published contact-form-pro v2.4.1",
      "metadata": {
        "pluginName": "contact-form-pro",
        "version": "2.4.1",
        "filesUpdated": 12,
        "sessionId": "sess_abc"
      },
      "source": "go",
      "machineName": "DEV-01",
      "version": "2.4.1"
    }
  ]
}
```

## Data Sources to Aggregate

### 1. Publish Sessions (Go — SQLite `publish_history` table)
- Map to `type: "publish"`
- `action`: "deploy" | "self-update"  
- `title`: "Published {pluginName} v{version}" or "Self-update {from} → {to}"
- `metadata`: pluginId, pluginName, version, newVersion, filesUpdated, durationMs, sessionId, isSelfUpdate

### 2. Snapshot Events (WordPress — via `POST /wp-json/riseup-asia-uploader/v1/snapshots/activity`)
- **New WP endpoint needed**: Returns activity_logs filtered to snapshot actions
- Map to `type: "snapshot"`
- `action`: "create" | "restore" | "delete" | "export" | "import" | "cleanup"
- `title`: Derive from WP log message
- `metadata`: snapshotId, snapshotType, tables, size, mode
- `source`: "wordpress"

### 3. Plugin Events (WordPress — via `POST /wp-json/riseup-asia-uploader/v1/activity-logs`)
- **New WP endpoint needed**: Returns activity_logs filtered to plugin actions
- Map to `type: "plugin"`
- `action`: "install" | "activate" | "deactivate" | "delete" | "upload"
- `source`: "wordpress"

### 4. Connection Events (Go — derive from `sites` table status changes + test logs)
- Map to `type: "connection"`
- `action`: "test" | "connect" | "disconnect"
- `source`: "go"

### 5. Config Events (Go — derive from settings change audit trail)
- Map to `type: "config"`
- `action`: "update"
- `metadata`: setting name, old value, new value
- `source`: "go"

## Aggregation Strategy

1. **Parallel fetch**: Query Go DB + fan-out to all connected sites' WP endpoints concurrently
2. **Normalize timestamps**: All sources normalized to UTC ISO-8601
3. **Merge & sort**: Combine all sources, sort by `timestamp DESC`
4. **Paginate**: Apply offset/limit after merge
5. **Cache**: Short-lived cache (30s) keyed by query params to avoid repeated WP fan-out

## Performance Considerations

- WP fan-out is bounded by connected site count (typically <20)
- Each WP call has a 5s timeout; failed sites are skipped with a warning in logs
- Go-local sources (publish, connection, config) are fast SQLite queries
- For `siteId` filter, only fan-out to that single site
- Consider cursor-based pagination in v2 for large datasets

## Error Handling

- If a WP site is unreachable, its entries are omitted (no error returned to client)
- Go-local data is always returned
- A `warnings` array in metadata can indicate skipped sites:
  ```json
  { "metadata": { "skippedSites": [{ "siteId": 2, "reason": "timeout" }] } }
  ```

## Dependencies

- **New WP endpoints**: `POST /snapshots/activity` and `POST /activity-logs` (filtered, paginated)
- **Go site adapter**: New methods `GetSnapshotActivity(siteId, params)` and `GetPluginActivity(siteId, params)`
- **Go handler**: `GET /api/v1/activity` in a new `activity_handler.go`
- **Go service**: `ActivityService` with `GetFeed(params)` that orchestrates aggregation
