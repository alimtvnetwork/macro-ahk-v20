# Root Cause Analysis: Credit Refresh No-Reload

## RCA-1: Missing Loading State

The Credits button onclick handler immediately calls `fetchLoopCreditsWithDetect(false)` without disabling the button or showing a spinner. The async fetch can take 2-5 seconds, during which the user gets no feedback and may click again, causing duplicate requests.

## RCA-2: No TTL-Aware Token Retrieval

The Credits button does not call `authBridge.getBearerToken()` which checks token age against a configurable TTL (default 2 min). Instead it relies on whatever token is in state, which may be stale. The Auth Bridge already handles freshness — the button should use it so that stale tokens are automatically refreshed from the session cookie before the API call is made.

## RCA-3: No Retry With Force-Refreshed Token

When the first API request fails (401/403/network error), the current code either silently fails or shows an error immediately. It should instead call `authBridge.getBearerToken({ force: true })` to force a fresh cookie read, then retry the request exactly once. Only if the retry also fails should the error toast be shown.

## RCA-4: No Workspace Focus After Fetch

After `parseLoopApiResponse()` populates `loopCreditState.perWorkspace`, the current workspace is matched by name in `loopCreditState.currentWs`, but the UI does not scroll or highlight it in the workspace list. The `ui.update()` call refreshes the credit bars but does not trigger workspace list navigation.

## Non-Regression Rules

1. Credits button MUST show loading state during fetch.
2. Credits button MUST obtain token via `authBridge.getBearerToken()` (TTL-aware).
3. On first API failure, MUST retry once with `getBearerToken({ force: true })`.
4. After successful fetch, workspace list MUST focus the current workspace.
5. Error toast MUST only appear after the retry also fails.
6. Auth recovery MUST be silent (no toast unless final failure).
7. Duplicate clicks during loading MUST be ignored (in-flight guard).
8. TTL value MUST come from config (not hardcoded).
