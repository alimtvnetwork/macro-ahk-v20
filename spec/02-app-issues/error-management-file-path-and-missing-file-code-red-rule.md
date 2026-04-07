# Error Management — File Path and Missing File Code-Red Rule

**Created**: 2026-04-07
**Status**: MANDATORY / CODE RED
**Priority**: Code Red — highest enforcement level
**Applies to**: All runtime modules, background scripts, standalone scripts, injection pipeline, SDK

---

## Rule Summary

Every error related to a file or path MUST include:

1. **Exact file path** — the full resolved path that was attempted
2. **Operation** — what was being done (read, write, inject, load, resolve, copy, move, extract)
3. **Failure reason** — why it failed (does not exist, permission denied, path invalid, etc.)
4. **Module name** — which component logged the error
5. **Recovery action** — what fallback was taken (if any)

Generic messages like `"file not found"` or `"failed to load"` without the exact path are **FORBIDDEN**.

---

## Mandatory Error Log Format

```
[ERROR] <module>: <operation> failed
  Path: <exact file path or storage key>
  Missing: <what was expected at that path>
  Reason: <why it was not found or failed>
  Recovery: <fallback taken, or "none — hard failure">
```

### Example

```
[ERROR] script-resolver: Script code fetch failed
  Path: chrome.runtime.getURL("projects/scripts/macro-controller/macro-looping.js")
  Missing: Script code for "macro-looping.js" (HTTP 404)
  Reason: File does not exist in web_accessible_resources — build may have excluded it
  Recovery: Trying bundled fallback path "projects/scripts/macro-controller/macro-looping.js"
```

---

## Acceptable Failure Reasons

| Reason Code | Description |
|-------------|-------------|
| `file_not_exist` | File does not exist at the specified path |
| `path_invalid` | Path format is malformed or unresolvable |
| `path_inaccessible` | Path exists but cannot be accessed (permissions, CORS, CSP) |
| `name_mismatch` | Expected filename does not match actual filename at path |
| `extension_mismatch` | File extension differs from expected type |
| `permission_denied` | OS or browser permission prevents access |
| `not_created` | File was expected from a prior build/generation step but was never created |
| `removed_moved_renamed` | File was previously available but has since been removed, moved, or renamed |
| `quota_exceeded` | Storage quota prevents read/write |
| `corrupt_unreadable` | File exists but content is corrupt or unparseable |
| `dependency_missing` | File depends on another file that is itself missing |

---

## Scope of Application

This rule applies to ALL file and path related errors across:

### 1. Injection Pipeline
- Script code resolution (`script-resolver.ts`)
- Built-in script guard (`builtin-script-guard.ts`)
- CSP fallback injection (`csp-fallback.ts`)
- Cache read/write (`injection-cache.ts`)
- Cache warming (`cache-warmer.ts`)

### 2. Storage and Database
- OPFS session log files (`session-log-writer.ts`)
- SQLite database files (`db-manager.ts`)
- Schema migrations (`schema-migration.ts`)
- IndexedDB cache operations

### 3. Script and Config Resolution
- Script file fetch from `web_accessible_resources`
- Config JSON resolution from storage
- Theme JSON resolution
- Dependency resolution (`dependency-resolver.ts`)

### 4. Deployment and Build
- PowerShell deploy script cache clearing
- Build artifact verification
- Version sync validation
- Seed manifest loading

### 5. Authentication and Tokens
- Cookie reading failures
- JWT token seeding into tabs
- Bearer token storage/retrieval

### 6. SDK and Standalone Scripts
- HTTP module token refresh
- Bridge communication failures
- File operations in marco-sdk

---

## Error Level Classification

| Severity | When to use |
|----------|-------------|
| **ERROR** (Code Red) | File is required and pipeline cannot continue without it |
| **WARN** | File is optional or a fallback path exists |
| **INFO** | File was found via a non-primary path (for diagnostics) |

---

## Warnings and Path Logging

**Clarification**: Both ERROR and WARN level logs for file/path issues MUST include exact paths. This is not limited to errors only. Any log entry that references a file or path failure — even at warning level — must include the full path.

---

## Sensitive Path Masking

**Clarification**: No path masking is applied in development or extension contexts. If a future deployment context requires path sanitization (e.g., user-facing cloud logs), a masking layer will be added at the log transport level, not at the log creation level. Log creation always writes the full path.

---

## Applies To: Runtime and DevTools

**Clarification**: This rule applies to:
- Runtime logs (background service worker console)
- DevTools mirrored logs (tab console.groupCollapsed output)
- SQLite persisted error records
- OPFS session log files
- Injection diagnostics persisted via `persistInjectionError`

It does NOT currently apply to user-facing UI error toasts (which should remain human-friendly summaries).

---

## Standard Error Template (TypeScript)

```typescript
// Use this pattern for all file/path errors:
logCaughtError(
  BgLogTag.MODULE_NAME,
  `<operation> failed\n` +
  `  Path: <exact path>\n` +
  `  Missing: <what was expected>\n` +
  `  Reason: <why it failed>`,
  error
);
```

---

## Monitoring: Repeated Path Failures

If the same path fails 3+ times within a single pipeline run, an additional summary log SHOULD be emitted:

```
[WARN] <module>: Repeated path failure detected
  Path: <path>
  Occurrences: <count>
  First failure: <timestamp or stage>
  Reason: Check whether the path is permanently invalid or a transient issue
```

---

## Deployment Checklist Addition

- [ ] Verify no generic "file not found" messages exist without exact paths
- [ ] Verify all file-related ERROR logs include Path/Missing/Reason fields
- [ ] Verify all file-related WARN logs include Path/Missing/Reason fields

---

```
If you have any question and confusion, feel free to ask, and if you are creating tasks for creating
multiple tasks, and if it is bigger ones, then do it in a way so that if we say next, you do those
remaining tasks. Do you understand? Always add this part at the end of the writing inside the code
block. Do you understand? Can you please do that?
```