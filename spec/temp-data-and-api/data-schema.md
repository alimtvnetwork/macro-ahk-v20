# 04 — Data Schema & API Reference

**Version**: v7.17
**Last Updated**: 2026-02-25

For the full detailed schema, see `marco-script-ahk-v7.latest/specs/JSON-schema.md`.

---

## API Endpoints

### 1. GET /user/workspaces
Lists all workspaces with credit data.

**Auth**: Bearer token or cookie session (`credentials: 'include'`)
**Token resolution**: config.ini → localStorage (`ahk_bearer_token`) → cookie (`lovable-session-id.id`)

**Response**:
```json
{
  "workspaces": [{
    "workspace": {
      "id": "uuid", "name": "My Workspace",
      "billing_period_credits_used": 37, "billing_period_credits_limit": 100,
      "daily_credits_used": 5, "daily_credits_limit": 5,
      "credits_granted": 10, "credits_used": 0,
      "rollover_credits_limit": 50, "rollover_credits_used": 10,
      "topup_credits_limit": 0, "total_credits_used_in_billing_period": 172,
      "subscription_status": "active"
    },
    "membership": { "role": "owner" }
  }]
}
```

### 2. PUT /projects/{projectId}/move-to-workspace
Moves project to another workspace. Body: `{ "workspace_id": "target-id" }`

### ~~3. POST /projects/{projectId}/mark-viewed~~ (REMOVED in v7.17)
~~Returns `{ "workspace_id": "owner-ws-id" }`. Used for workspace detection.~~
**Removed**: Workspace detection now uses XPath-only via Project Dialog. See `06-macro-controller/workspace-management.md`.

---

## Credit Formulas

```
Total Credits     = credits_granted + daily_credits_limit + billing_period_credits_limit
                    + topup_credits_limit + rollover_credits_limit

Available Credits = Total Credits - rollover_credits_used - daily_credits_used
                    - billing_period_credits_used

Free Credit Avail = daily_credits_limit - daily_credits_used
dailyFree         = daily_credits_limit - daily_credits_used
rollover          = rollover_credits_limit - rollover_credits_used
billingAvailable  = billing_period_credits_limit - billing_period_credits_used
```

**Shared helpers**: `calcTotalCredits()`, `calcAvailableCredits()`, `calcFreeCreditAvailable()` — used in both controllers. No inline arithmetic allowed.

---

## Internal Data Model (perWorkspace entry)

| Field | Source | Description |
|-------|--------|-------------|
| `id` | API `ws.id` | Workspace UUID |
| `name` | Truncated 12 chars | Short display name |
| `fullName` | `ws.name` | Full workspace name |
| `used` / `limit` | API billing fields | Billing period used/limit |
| `dailyUsed` / `dailyLimit` | API daily fields | Daily credits |
| `dailyFree` | Calculated | `dailyLimit - dailyUsed` |
| `rollover` / `rolloverLimit` / `rolloverUsed` | API rollover fields | Rollover credits |
| `billingAvailable` | Calculated | `limit - used` |
| `topupLimit` | API | Top-up credits |
| `totalCredits` | Calculated | Sum of all limits |
| `available` | Calculated | Total - all used |
| `freeGranted` / `freeRemaining` | API granted fields | Promotional credits |
| `totalCreditsUsed` | API | Total used across all pools |

### wsById Dictionary (O(1) lookup)
Built during `parseApiResponse()`: `wsById[workspace.id] = perWorkspaceEntry`. Used for workspace matching after API move responses.

---

## config.ini Reference

See `marco-script-ahk-v7.latest/specs/JSON-schema.md` Section 3 for the complete config.ini schema with all sections, keys, types, and defaults.

Key sections: `[Hotkeys]`, `[ComboSwitch.*]`, `[MacroLoop.*]`, `[CreditStatus.*]`, `[AHK.Timing]`, `[General]`
