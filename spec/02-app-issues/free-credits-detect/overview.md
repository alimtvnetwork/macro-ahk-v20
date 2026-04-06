# Free Credit Detection via API — Specification

> **Version**: 1.1.0  
> **Last updated**: 2026-03-30  
> **Status**: Implemented (v1.74.0)  
> **Severity**: Medium (UX + reliability improvement)

---

## Summary

Replace the current DOM-based free-credit detection (clicking the Project Button → reading the progress bar XPath) with a lightweight **API poll** to `GET /workspaces/{workspaceId}/credit-balance`. The API is the **primary** source; XPath progress-bar check is retained as a **fallback** only when the API call fails.

---

## Design Decisions

| Decision | Choice | Detail |
|----------|--------|--------|
| Detection strategy | **API primary, XPath fallback** | Use API by default; fall back to XPath if API fails (network error, 401 after recovery) |
| Poll timing | **100s interval + pre-move check** | Poll every 100s; additionally, if `daily_remaining` ≤ threshold, trigger auto-move immediately |
| Credit threshold | **Configurable `MinDailyCredit`** | `hasFreeCredit = daily_remaining >= config.MinDailyCredit` (default: `2`). If below threshold → auto-move to next workspace (up or down based on loop direction) |
| Workspace ID source | **TBD — user will provide workspace list API** | Workspace ID resolution API to be shared separately |

---

## Current Behavior (Before)

1. The loop engine clicks the **Project Button** to open the workspace dialog
2. Reads the **progress bar** XPath (`CONFIG.PROGRESS_XPATH`) inside the dialog DOM
3. If progress bar is found → system is BUSY (`isIdle = false`)
4. If not found → system is IDLE (`isIdle = true`)
5. Calls `syncCreditStateFromApi()` to update `state.hasFreeCredit`

**Problems:**
- Depends on dialog DOM being open (fragile — portal `div[6]` can shift)
- XPath breaks when Lovable UI updates
- Requires visual side-effects (dialog opens/closes) that the user can see
- Slow: open dialog → wait → read → close dialog (~1–2s)
- Binary detection only (has credit / no credit) — no threshold awareness

---

## New Behavior (After)

1. On a **100-second interval** (configurable), call:
   ```
   GET https://api.lovable.dev/workspaces/{workspaceId}/credit-balance
   Authorization: Bearer {token}
   ```
2. Parse the JSON response
3. Determine free credit availability: `hasFreeCredit = daily_remaining >= MinDailyCredit`
4. **If `daily_remaining < MinDailyCredit`** (default 2):
   - Trigger auto-move to next workspace (direction: up or down, matching current loop direction)
   - Log: `"Daily credits (${daily_remaining}) below threshold (${MinDailyCredit}), moving ${direction}"`
5. Update `state.hasFreeCredit` and `loopCreditState` accordingly
6. No dialog interaction required
7. **On API failure**: Fall back to existing XPath progress-bar check

---

## API Endpoint

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `https://api.lovable.dev/workspaces/{workspaceId}/credit-balance` |
| **Auth** | `Authorization: Bearer {token}` |
| **Content-Type** | `application/json` |
| **Credentials** | `include` (cookie fallback) |

### Sample Response

```json
{
  "$schema": "https://api.lovable.dev/GetWorkspaceCreditBalanceOutputBody.json",
  "ledger_enabled": true,
  "total_remaining": 3,
  "total_granted": 5,
  "daily_remaining": 3,
  "daily_limit": 5,
  "total_billing_period_used": 2,
  "expiring_grants": [],
  "grant_type_balances": [
    {
      "grant_type": "daily",
      "granted": 5,
      "remaining": 3
    }
  ]
}
```

Also saved as: [`sample-response.json`](./sample-response.json)

---

## Key Fields for Free Credit Detection

| JSON Field | Type | Usage |
|-----------|------|-------|
| `daily_remaining` | `number` | **Primary**: compared against `MinDailyCredit` threshold |
| `daily_limit` | `number` | Total daily free credit cap |
| `total_remaining` | `number` | Overall remaining (daily + billing + grants) |
| `total_granted` | `number` | Total credits granted this period |
| `total_billing_period_used` | `number` | Credits consumed in current billing period |
| `grant_type_balances` | `array` | Per-grant-type breakdown (daily, billing, topup, etc.) |
| `expiring_grants` | `array` | Grants about to expire (empty if none) |

---

## Free Credit Logic

```ts
// Configurable threshold — default 2
const MIN_DAILY_CREDIT = config.MinDailyCredit ?? 2;

const hasFreeCredit = response.daily_remaining >= MIN_DAILY_CREDIT;

// If below threshold and loop is running → auto-move
if (!hasFreeCredit && state.running) {
  const direction = state.loopDirection; // 'up' | 'down'
  moveToAdjacentWorkspace(direction);
}
```

---

## Polling & Timing

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| Poll interval | **100 seconds** | Yes (`creditBalanceCheckInterval`) |
| Cache TTL | 30s (existing) | Yes (`creditCacheTtl`) |
| Min gap between calls | 10s | Hardcoded guard |
| Pre-move fresh check | Yes — always call before auto-move | N/A |

### Poll Flow

```
Timer fires (every 100s)
  └─ fetchCreditBalance(workspaceId)
       ├─ Success → update hasFreeCredit, check threshold
       │    └─ daily_remaining < MinDailyCredit?
       │         ├─ Yes → moveToAdjacentWorkspace(loopDirection)
       │         └─ No  → continue loop normally
       └─ Failure → fall back to XPath progress-bar check
```

---

## Auto-Move Direction

When `daily_remaining < MinDailyCredit`, the system moves to the **next** workspace based on the current loop direction:

| Loop Direction | Move Target |
|---------------|-------------|
| `'down'` (default) | Next workspace below in list |
| `'up'` | Next workspace above in list |

This uses the existing `moveToAdjacentWorkspace()` function, which already skips depleted workspaces.

---

## Fallback: XPath Progress Bar

When the API call fails (network error, 401 after auth recovery, timeout), the system falls back to the existing XPath-based detection:

1. Open project dialog (Steps 1–2 of Check)
2. Read progress bar XPath
3. Update `hasFreeCredit` based on presence/absence

**Fallback triggers:**
- Fetch throws (network error)
- HTTP 401/403 after `recoverAuthOnce()` retry
- Response missing `daily_remaining` field
- Timeout (>5s)

---

## Configuration (config.ini additions)

```ini
[CreditStatus.Balance]
CheckIntervalSeconds=100
MinDailyCredit=2
EnableApiDetection=1
FallbackToXPath=1
```

---

## Integration Points

| Component | Change |
|-----------|--------|
| `credit-fetch.ts` | Add `fetchCreditBalance(workspaceId): Promise<CreditBalanceResponse>` |
| `credit-types.ts` | Add `CreditBalanceResponse` interface |
| `loop-engine.ts` | Replace progress-bar XPath check with API call + threshold logic |
| `shared-state.ts` | Update `hasFreeCredit` from API response |
| `CreditManager.ts` | Add `fetchBalance(workspaceId)` method |
| `check-button.ts` | Step 3 tries API first, XPath fallback |
| Config loader | Read `MinDailyCredit`, `CheckIntervalSeconds` from ini |

---

## What Changes vs What Stays

| Aspect | Before | After |
|--------|--------|-------|
| Free credit detection | XPath on progress bar in dialog | **API primary**, XPath fallback |
| Detection threshold | Binary (has/hasn't) | **Configurable** (`MinDailyCredit`, default 2) |
| Auto-move trigger | `dailyFree === 0` | `daily_remaining < MinDailyCredit` |
| Move direction | First available workspace | **Follows loop direction** (up/down) |
| Dialog interaction for credit check | Required | **Not required** (API only) |
| Workspace detection (Check Steps 1–2) | XPath on project dialog | **Unchanged** |
| Auth token resolution | Bearer token waterfall | **Unchanged** |
| Poll interval | 60s (full workspace list) | **100s** (lightweight balance check) |

---

## Workspace ID Resolution

Workspace ID is resolved via `GET /projects/{projectId}/workspace`:

```
1. Extract projectId from current page URL (/projects/{uuid})
2. GET https://api.lovable.dev/projects/{projectId}/workspace
3. Response: workspace.id, workspace.name
4. Use workspace.id for /workspaces/{id}/credit-balance
```

See: [Workspace Name API Spec](../../06-macro-controller/workspace-name/overview.md)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| 401/403 | Trigger `recoverAuthOnce()`, retry once, then XPath fallback |
| Network error | Log warning, XPath fallback |
| Malformed JSON | Log error, XPath fallback |
| Missing `daily_remaining` | Treat as `0` → XPath fallback |
| Token expired | Silent recovery via existing auth waterfall |
| Workspace ID unknown | Skip API, use XPath fallback |

---

## Guards & Safety

- Never clear `hasFreeCredit` to `false` without a successful API response OR successful XPath fallback
- If workspace ID is unknown, skip API call and fall back to XPath
- Rate limit: minimum 10s between consecutive `/credit-balance` calls per workspace
- XPath fallback must not fire if API succeeded in the same cycle

---

## Non-Regression Rules

| Rule ID | Description |
|---------|-------------|
| NR-FC-01 | Workspace detection (Steps 1–2 of Check) must remain XPath-based |
| NR-FC-02 | `state.workspaceFromApi` flag behavior unchanged |
| NR-FC-03 | Auto-move function unchanged — only the trigger threshold changes |
| NR-FC-04 | Credits button refresh flow unchanged (still calls full workspace list) |
| NR-FC-05 | Existing `loopCreditState.perWorkspace` data must still be populated from `/user/workspaces` |
| NR-FC-06 | XPath fallback must remain functional — do not remove progress-bar detection code |
| NR-FC-07 | Loop direction (up/down) must be respected in auto-move |

---

## Cross-References

- [Check Button Spec](../../07-chrome-extension/60-check-button-spec.md)
- [Credit Refresh Behavior](../../.lovable/memory/features/macro-controller/credit-refresh-behavior.md)
- [Credit System Spec](../../06-macro-controller/credit-system.md)
- [Bearer Token Policy](../../.lovable/memory/features/macro-controller/workspace-api-bearer-token-policy.md)
- [Issue #36: Bearer Token Removal](../36-bearer-token-removal-broke-credit-bar.md)
- [Sample Response](./sample-response.json)

---

*Free Credit Detection Spec v1.1.0 — 2026-03-30*
