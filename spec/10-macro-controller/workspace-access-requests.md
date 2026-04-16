# Workspace Access Requests — Fallback Workspace Switch

**Status:** Draft  
**Version:** v2.142.0  
**Author:** Riseup Asia LLC  
**Created:** 2026-04-16  

---

## 1. Problem Statement

The current workspace switching mechanism (`moveToWorkspace`) relies on:

```
PUT /projects/{projectId}/move-to-workspace
Body: { "workspace_id": "{targetWorkspaceId}" }
```

This **requires a project ID**, which is extracted from the current URL via `extractProjectIdFromUrl()`. When the user is **not inside a project page** (e.g., on the Lovable dashboard at `https://lovable.dev/`, a settings page, or any non-project route), `extractProjectIdFromUrl()` returns `null` and the move is aborted with:

```
logError('Cannot extract projectId from URL', window.location.href);
updateLoopMoveStatus('error', 'No project ID in URL');
```

This means **workspace switching is completely broken when not viewing a project**.

---

## 2. Proposed Solution

Introduce a **fallback workspace switch** using the `workspace-access-requests` endpoint:

```
GET /workspaces/{wsId}/workspace-access-requests
Authorization: Bearer {token}
```

### Decision Logic

```
User triggers workspace switch (via dropdown, adjacent move, or loop engine)
  │
  ├─ extractProjectIdFromUrl() returns a valid project ID?
  │   ├─ YES → Use existing PUT /projects/{projectId}/move-to-workspace (current behavior)
  │   └─ NO  → Use GET /workspaces/{wsId}/workspace-access-requests (NEW fallback)
```

The fallback does **not** move a project between workspaces. It switches the user's active workspace context on the platform, which is sufficient when the goal is to use credits from a different workspace.

---

## 3. Endpoint Specification

### 3.1 Request

| Field         | Value                                                    |
|---------------|----------------------------------------------------------|
| **Method**    | `GET`                                                    |
| **URL**       | `https://api.lovable.dev/workspaces/{wsId}/workspace-access-requests` |
| **Auth**      | `Authorization: Bearer {jwt_token}`                      |
| **Headers**   | `content-type: application/json`                         |
| **Body**      | None (`null`)                                            |

- `{wsId}` is the target workspace ID (e.g., `B9CNw3XgjU84u59I15cR`).
- The JWT bearer token is obtained via the existing `resolveToken()` / `recoverAuthOnce()` auth contract.

### 3.2 Expected Response

The endpoint returns the workspace access request data. The exact response shape should be validated during implementation, but based on the API pattern it is expected to return:

```json
{
  "workspace_id": "B9CNw3XgjU84u59I15cR",
  "status": "...",
  ...
}
```

A **2xx** response indicates the workspace context switch was successful or the access was already granted.

### 3.3 Error Responses

| Status | Meaning                          | Action                                    |
|--------|----------------------------------|-------------------------------------------|
| 200    | Success                          | Update state, refresh credits              |
| 401    | Token expired                    | Invalidate token, attempt auth recovery    |
| 403    | Forbidden — no access            | Show toast error, do not retry             |
| 404    | Workspace not found              | Show toast error, do not retry             |
| 429    | Rate limited                     | Show toast warning, fail-fast (no retry)   |
| 5xx    | Server error                     | Show toast error, fail-fast (no retry)     |

---

## 4. Integration Points

### 4.1 Files to Modify

| File | Change |
|------|--------|
| `standalone-scripts/macro-controller/src/ws-move.ts` | Add fallback branch in `moveToWorkspace()` when `projectId` is `null` |
| `standalone-scripts/marco-sdk/src/api-registry.ts` | Add `switchContext` endpoint to `workspace` group |
| `standalone-scripts/macro-controller/src/types/api-paths.ts` | Add path constant (if needed) |
| `standalone-scripts/macro-controller/src/shared-state.ts` | No changes expected |

### 4.2 API Registry Entry

Add to `standalone-scripts/marco-sdk/src/api-registry.ts` under the `workspace` group:

```typescript
switchContext: Object.freeze({
    url: "/workspaces/{wsId}/workspace-access-requests",
    method: "GET" as const,
    auth: true,
    description: "Switch active workspace context without moving a project (fallback when no project ID available)",
}),
```

### 4.3 SDK Method

The `marco.api.workspace` SDK layer should expose a new method:

```typescript
// In the SDK's workspace API module:
async switchContext(wsId: string, options?: { baseUrl?: string }): Promise<ApiResponse>
```

This follows the same pattern as `workspace.probe()` and `workspace.move()`.

---

## 5. Implementation Guide (for `ws-move.ts`)

### 5.1 Modify `moveToWorkspace()` (lines 329–370)

The current function aborts when `projectId` is null. Change it to branch into the fallback:

```typescript
export async function moveToWorkspace(targetWorkspaceId: string, targetWorkspaceName: string): Promise<void> {
  const isConfirmed = await confirmMove(targetWorkspaceName);
  if (!isConfirmed) {
    log('Move cancelled by user', 'info');
    updateLoopMoveStatus('error', 'Move cancelled');
    return;
  }

  // Resolve auth token (shared by both paths)
  let token = resolveToken();
  if (!token) {
    log('No bearer token — recovering before move request', 'warn');
    try {
      const recoveredToken = await recoverAuthOnce();
      token = recoveredToken || resolveToken();
    } catch {
      handleMoveNoToken();
      return;
    }
    if (!token) {
      handleMoveNoToken();
      return;
    }
  }

  const projectId = extractProjectIdFromUrl();

  if (projectId) {
    // ✅ Primary path: move project to target workspace
    await executeMove(projectId, targetWorkspaceId, targetWorkspaceName, false);
  } else {
    // ✅ Fallback path: switch workspace context without moving a project
    log('No project ID in URL — using workspace-access-requests fallback', 'warn');
    await executeSwitchContext(targetWorkspaceId, targetWorkspaceName, false);
  }
}
```

### 5.2 New Function: `executeSwitchContext()`

```typescript
async function executeSwitchContext(
  targetWorkspaceId: string,
  targetWorkspaceName: string,
  isRetry: boolean,
): Promise<void> {
  const token = resolveToken();
  if (!token) {
    handleMoveNoToken();
    return;
  }

  const label = isRetry ? ' (auth-retry)' : '';
  log('=== SWITCH WORKSPACE CONTEXT ===' + label, 'delegate');
  log('GET /workspaces/' + targetWorkspaceId + '/workspace-access-requests', 'delegate');
  logSub('Target: ' + targetWorkspaceName + ' (id=' + targetWorkspaceId + ')', 1);

  updateLoopMoveStatus('loading', 'Switching to ' + targetWorkspaceName + '...');

  try {
    const resp = await window.marco!.api!.workspace.switchContext(
      targetWorkspaceId,
      { baseUrl: CREDIT_API_BASE },
    );

    if (isAuthFailure(resp.status) && !isRetry) {
      // Auth recovery — invalidate and retry once
      invalidateSessionBridgeKey(token);
      log('Switch got ' + resp.status + ' — retrying with fallback token', 'warn');

      const fallbackToken = resolveToken();
      if (fallbackToken) {
        await executeSwitchContext(targetWorkspaceId, targetWorkspaceName, true);
        return;
      }

      try {
        const recovered = await recoverAuthOnce();
        if (recovered || resolveToken()) {
          await executeSwitchContext(targetWorkspaceId, targetWorkspaceName, true);
          return;
        }
      } catch { /* fall through */ }

      handleMoveNoToken();
      return;
    }

    if (!resp.ok) {
      const bodyPreview = JSON.stringify(resp.data).substring(0, 500);
      logError('Switch context failed', 'HTTP ' + resp.status + ' | body: ' + bodyPreview);
      updateLoopMoveStatus('error', 'HTTP ' + resp.status + ': ' + bodyPreview.substring(0, 80));
      return;
    }

    // Success — update state same as move success
    handleMoveSuccess(targetWorkspaceName, label);
  } catch (err) {
    logError('Switch context error', '' + (err as Error).message);
    updateLoopMoveStatus('error', (err as Error).message);
    clearDelegationState();
  }
}
```

### 5.3 Adjacent Move Integration

The adjacent move functions (`moveToAdjacentWorkspace`, `moveToAdjacentWorkspaceCached`) ultimately call `moveToWorkspace()`. Since the fallback logic is inside `moveToWorkspace()`, **no changes are needed** in the adjacent move code — the fallback is automatically inherited.

---

## 6. Detection: "Are We Inside a Project?"

The detection is already implemented via `extractProjectIdFromUrl()` in `workspace-detection.ts`. It returns:

- **A UUID string** — when on a project page (e.g., `https://lovable.dev/projects/abc-123-...`)
- **`null`** — when on any non-project page (dashboard, settings, etc.)

This is the single source of truth for the branching decision. No additional detection logic is needed.

### URL Patterns That Return a Project ID

| Pattern | Example |
|---------|---------|
| `/projects/{id}` | `https://lovable.dev/projects/9a79d068-099a-44a9-b473-9b957a747129` |
| `id-preview--{uuid}.domain` | `id-preview--9a79d068-099a-44a9-b473-9b957a747129.lovable.app` |
| `{uuid}--preview.domain` | `9a79d068-099a-44a9-b473-9b957a747129--preview.lovable.app` |

### URL Patterns That Return `null`

| Pattern | Example |
|---------|---------|
| Dashboard | `https://lovable.dev/` |
| Settings | `https://lovable.dev/settings` |
| Billing | `https://lovable.dev/billing` |
| Any non-project route | `https://lovable.dev/integrations` |

---

## 7. Logging & Toast Messages

| Scenario | Log Level | Toast |
|----------|-----------|-------|
| Fallback path chosen | `warn` | None (internal) |
| Switch context success | `success` | "Switched to {workspaceName}" |
| Switch context auth failure (retrying) | `warn` | "Switch auth {status} — retrying..." |
| Switch context HTTP error | `error` (via `logError`) | "HTTP {status}: {bodyPreview}" |
| Switch context network error | `error` (via `logError`) | "{error.message}" |

All error logs MUST use `logError()` with exact context. Never swallow errors silently.

---

## 8. Testing Checklist

- [ ] On a project page (`/projects/...`), workspace switch uses `PUT move-to-workspace` (unchanged)
- [ ] On the dashboard (`/`), workspace switch uses `GET workspace-access-requests` (new)
- [ ] Auth failure (401/403) triggers single retry with token recovery
- [ ] Success updates `state.workspaceName`, clears cached workspace ID, refreshes credits
- [ ] Adjacent moves (up/down) work correctly on non-project pages
- [ ] UI dropdown and status indicators update after switch
- [ ] No retry loops — fail-fast on second failure (per no-retry policy)

---

## 9. Constraints

- **No retry loops**: Auth recovery is attempted once. If the retry also fails, abort immediately (per `mem://constraints/no-retry-policy`).
- **No Supabase**: All auth via `getBearerToken()` contract (per `mem://constraints/no-supabase`).
- **Namespace logging**: All errors via `logError()`, never bare `log()` for errors (per `mem://standards/error-logging-via-namespace-logger.md`).
- **Sequential fail-fast**: No exponential backoff, no recursive retry.
