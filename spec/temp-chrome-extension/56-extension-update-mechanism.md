# Spec 56 — Chrome Extension Self-Update Mechanism

**Priority**: Medium
**Status**: Planning (Awaiting API contract details)

---

## Overview

Add an update URL field in the extension Settings page. The extension periodically checks this URL for newer versions and can self-update.

---

## Flow

```
[Update URL (configured in Settings)]
         │
         ▼
[HTTP GET request]
         │
         ├── Direct API response → parse version + download URL
         │
         └── 301 Redirect → follow → cache final URL → parse version + download URL
                                          │
                                          ▼
                                   [Cache redirected URL]
                                   (avoid re-resolving)
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| URL is empty | No update check |
| URL is invalid | Log error, no update |
| URL returns error (4xx, 5xx) | Log error, no update |
| URL returns 301 redirect | Follow redirect, cache final URL |
| No redirect (direct response) | Use response directly |
| Network offline | Skip check, retry next interval |

---

## API Response (Placeholder)

> **NOTE**: Exact API contract TBD — user will provide details later.

Expected response shape:
```json
{
  "version": "1.20.0",
  "downloadUrl": "https://example.com/marco-extension-v1.20.0.zip",
  "releaseNotes": "Bug fixes and performance improvements",
  "minChromeVersion": "120"
}
```

---

## Redirect Caching

When the update URL returns a 301/302 redirect:
1. Follow the redirect to get the final URL
2. Cache the final URL in `chrome.storage.local` under key `marco_update_resolved_url`
3. On subsequent checks, try the cached URL first
4. If cached URL fails, re-resolve from the original URL
5. Cache TTL: 24 hours

---

## Settings UI

Add to the extension Settings page:
- **Label**: "Extension Update URL"
- **Input**: URL text field
- **Button**: "Check for Updates"
- **Status**: Shows current version, last check time, available update (if any)

---

## Implementation Status

**Paused** — awaiting API contract definition from user. Current tasks:
1. [x] Add URL field to Settings UI
2. [ ] Implement redirect resolution + caching
3. [ ] Implement version comparison
4. [ ] Implement download + install (API contract needed)

---

## Acceptance Criteria

1. [ ] Update URL configurable in Settings
2. [ ] Redirect resolution works (301 → cache final URL)
3. [ ] Invalid/empty URLs handled gracefully
4. [ ] Version comparison identifies available updates
5. [ ] Download mechanism implemented (pending API contract)
