# Issue 55 — Workspace APIs Sent Without Bearer Token

## Issue Summary

Workspace API requests (rename, move, and workspace-list fetch) could be sent without an `Authorization: Bearer ...` header when token resolution returned empty. This made requests fail with 401/403 and created confusion in DevTools because calls appeared as cookie-only auth attempts.

## Impact

- Rename (`PUT /user/workspaces/:id`) occasionally executed without bearer token.
- Move workspace flows and adjacent workspace fetch could execute without bearer token.
- Behavior was inconsistent and caused repeated auth failures.

## Root Cause Analysis

1. **Optional auth header pattern**
   - Several call sites built headers as:
     - `if (token) headers.Authorization = 'Bearer ' + token`
   - When `token` was empty, the request still executed.

2. **Cookie-only fallback path**
   - Legacy fallback logic intentionally allowed requests with `credentials: include` but no bearer header.
   - This conflicted with the current auth policy and user expectation.

3. **401 recovery fallback could still proceed without token**
   - In rename flow, recovery failure path could retry with an empty token.

## Fix Description

### Code changes

1. **`workspace-rename.ts`**
   - Enforced bearer-token-required request path for rename.
   - Added explicit `NO_BEARER_TOKEN` fail-fast handling.
   - Removed recovery fallback path that retried rename with empty token.
   - Kept 403 no-limit fallback and 401 auth-retry behavior, but both now require a bearer token.

2. **`workspace-management.ts`**
   - Enforced bearer token for:
     - `verifyWorkspaceSessionAfterFailure()`
     - `moveToWorkspace()`
     - `moveToAdjacentWorkspace()` workspace fetch
   - Added pre-request auth recovery when token is missing.
   - If recovery fails, request is blocked and UI receives a clear auth-missing error.

## Non-Regression Rules

1. Never send workspace API requests without `Authorization` header.
2. If token is missing, run one recovery attempt first.
3. If recovery still yields no token, fail fast with explicit error/toast.
4. Do not silently fall back to cookies-only mode for workspace endpoints.

## Validation Checklist

- [x] Build succeeds after changes (`npm run build:macro-controller`)
- [x] Rename flow blocks unauthenticated request and reports missing token
- [x] Move flow blocks unauthenticated request and reports missing token
- [x] Workspace fetch in move-adjacent path requires bearer token

## Files Modified

- `standalone-scripts/macro-controller/src/workspace-rename.ts`
- `standalone-scripts/macro-controller/src/workspace-management.ts`
