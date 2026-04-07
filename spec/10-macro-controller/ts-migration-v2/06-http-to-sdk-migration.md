# Phase 06: httpRequest → marco.api SDK Migration

**Created**: 2026-03-31
**Status**: Complete
**Version**: v1.74.0

---

## Summary

Replaced all raw `httpRequest()` / `fetch()` calls in `macro-controller/src/` with typed methods from the centralized `marco.api` SDK module. Deleted the legacy `http-request.ts` utility.

---

## Motivation

| Problem | Impact |
|---------|--------|
| Raw `fetch()` scattered across 7+ files | No centralized error handling, auth injection, or retry logic |
| Manual `Authorization` header wiring | Token injection duplicated in every caller |
| No retry/refresh on 401/429 | Silent failures, stale tokens, rate-limit crashes |
| Untyped responses | Runtime errors from missing fields |

---

## Architecture

### New SDK Modules

| File | Responsibility |
|------|----------------|
| `marco-sdk/src/http.ts` | Shared Axios client with request/response interceptors |
| `marco-sdk/src/api-registry.ts` | Config-driven endpoint definitions (URL, method, auth, timeout, retries) |
| `marco-sdk/src/api.ts` | Typed method wrappers + generic `call("group.endpoint")` path resolver |

### Endpoint Registry

| Group | Endpoint | Method | URL | Auth | Notes |
|-------|----------|--------|-----|------|-------|
| credits | `fetchWorkspaces` | GET | `/user/workspaces` | ✅ | All workspaces + credit info |
| credits | `fetchBalance` | GET | `/workspaces/{wsId}/credit-balance` | ✅ | Single workspace balance |
| credits | `resolve` | GET | `/workspaces/{wsId}/credit-balance` | ✅ | Balance with fallback |
| workspace | `move` | PUT | `/projects/{projectId}/move-to-workspace` | ✅ | Move project between workspaces |
| workspace | `rename` | PUT | `/user/workspaces/{wsId}` | ✅ | Rename a workspace |
| workspace | `markViewed` | POST | `/projects/{projectId}/mark-viewed` | ✅ | Returns workspace_id |
| workspace | `probe` | GET | `/user/workspaces` | ✅ | Connectivity check (8s timeout) |
| workspace | `resolveByProject` | GET | `/projects/{projectId}/workspace` | ✅ | Resolve workspace for project |

### Interceptor Behavior

- **Request**: Auto-injects `Authorization: Bearer <token>` via `sendMessage("AUTH_GET_TOKEN")`. Skippable via `__skipAuth`.
- **401 Response**: Single-flight token refresh via `sendMessage("AUTH_REFRESH")`, then retry.
- **429 Response**: Exponential backoff retry (max 2 attempts).

### Public API Surface

```typescript
// Generic path-based
marco.api.call<T>("credits.fetchBalance", { params: { wsId } })

// Typed wrappers
marco.api.credits.fetchWorkspaces(options?)
marco.api.credits.fetchBalance(wsId, options?)
marco.api.credits.resolve(wsId, options?)

marco.api.workspace.move(projectId, targetWsId, options?)
marco.api.workspace.rename(wsId, newName, options?)
marco.api.workspace.markViewed(projectId, options?)
marco.api.workspace.probe(options?)
marco.api.workspace.resolveByProject(projectId, options?)
```

All methods return `Promise<ApiResponse<T>>` → `{ ok, status, data, headers }`.

---

## Migration Log

| Batch | Files Changed | Description |
|-------|--------------|-------------|
| 1 | 5 new/updated SDK files | Axios client + API registry + typed methods |
| 2 | `credit-fetch.ts`, `credit-balance.ts`, `loop-cycle.ts` | `marco.api.credits.*` |
| 3 | `workspace-detection.ts`, `ws-adjacent.ts`, `ws-move.ts` | `marco.api.workspace.*` |
| 4 | `rename-api.ts`, ~~`http-request.ts`~~ (deleted) | Final migration + cleanup |
| 5 | `task-next-ui.ts`, `auth-resolve.ts`, `workspace-detection.ts` | CQ13/CQ16 fixes, type fix |

### Files Deleted

- `standalone-scripts/macro-controller/src/http-request.ts` — fully replaced by `marco-sdk/src/http.ts`

### Caller Migration Details

| Caller | Before | After |
|--------|--------|-------|
| `credit-fetch.ts` | `httpRequest(url, { headers })` | `marco.api.credits.fetchBalance(wsId)` |
| `credit-balance.ts` | `httpRequest(url, { headers })` | `marco.api.credits.fetchWorkspaces()` |
| `loop-cycle.ts` | `httpRequest(url, { headers })` | `marco.api.credits.fetchWorkspaces()` |
| `workspace-detection.ts` | `httpRequest(url, { method: 'POST' })` | `marco.api.workspace.markViewed(projectId)` |
| `ws-adjacent.ts` | `httpRequest(url, { headers })` | `marco.api.credits.fetchWorkspaces()` |
| `ws-move.ts` | `httpRequest(url, { method: 'PUT', body })` | `marco.api.workspace.move(projectId, targetId)` |
| `rename-api.ts` | `httpRequest(url, { method: 'PUT', body })` | `marco.api.workspace.rename(wsId, newName)` |

---

## Code Quality Fixes (Batch 5)

| File | Violation | Fix |
|------|-----------|-----|
| `task-next-ui.ts` | CQ16 — nested `tryClickButton()` | Extracted to module-scope `tryClickAndAdvance()` with `ClickContext` interface |
| `auth-resolve.ts` | CQ13 — C-style `for` loop | Key collection + `for-of` |
| `workspace-detection.ts` | Type mismatch | `ReadonlyArray` cast for `detectWorkspaceViaProjectDialog` |

---

## Verification

- `tsc --noEmit --project tsconfig.macro.json` → **0 errors**
- `tsc --noEmit --project standalone-scripts/marco-sdk/tsconfig.json` → **0 errors**
- All existing tests passing

---

## Dependencies

- **Spec**: `spec/11-chrome-extension/63-rise-up-macro-sdk.md` — SDK architecture
- **Spec**: `spec/17-app-issues/48-typescript-migration-standalone-scripts.md` — TS migration origin
- **Memory**: `architecture/networking/centralized-api-registry` — pattern documentation

---

*httpRequest→marco.api migration spec v1.74.0 — 2026-03-31*
