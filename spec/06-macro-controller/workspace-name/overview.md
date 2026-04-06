# Workspace Name API — Specification

> **Version**: 1.0.0  
> **Last updated**: 2026-03-30  
> **Status**: Spec Ready  

---

## Purpose

Resolve the **workspace ID and name** for a given project via API, eliminating the need for XPath-based workspace name detection. This endpoint provides the workspace context needed by the `/credit-balance` API.

---

## API Endpoint

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `https://api.lovable.dev/projects/{projectId}/workspace` |
| **Auth** | `Authorization: Bearer {token}` |
| **Content-Type** | `application/json` |
| **Credentials** | `include` |

### URL Parameters

| Parameter | Source | Example |
|-----------|--------|---------|
| `projectId` | Extracted from current page URL (`/projects/{uuid}`) | `b059e8e2-7546-42f5-99c4-a858f8ea9178` |

---

## Sample Response

```json
{
  "$schema": "https://api.lovable.dev/GetUserWorkspaceBody.json",
  "workspace": {
    "id": "pCByLpG3pCAcCwWNDdnq",
    "name": "x Lite 18",
    "owner_id": "0r96K32fxia89KxNTRk58z0a6gC2",
    "created_at": "2026-01-23T18:37:36.177521Z",
    "updated_at": "2026-03-19T19:02:25.86565Z",
    "plan": "ktlo",
    "default_project_visibility": "private",
    "rollover_credits_used": 0,
    "rollover_credits_limit": 0,
    "last_rollover_period": null,
    "credits_used": 0,
    "credits_granted": 0,
    "daily_credits_used": 2,
    "daily_credits_limit": 5,
    "billing_period_credits_used": 0,
    "billing_period_credits_limit": 0,
    "total_credits_used": 5.7,
    "total_credits_used_in_billing_period": 5.7,
    "daily_credits_used_in_billing_period": 5.7,
    "default_monthly_member_credit_limit": null,
    "topup_credits_used": 0,
    "topup_credits_limit": 0,
    "backend_total_used_in_billing_period": 0,
    "is_personal": true,
    "num_projects": 0,
    "referral_count": 0,
    "data_opt_out": true,
    "external_publish_permission_level": "member",
    "is_temporary_edu": true,
    "experimental_features": {
      "transactional_credits": true
    },
    "followers_count": 0
  },
  "current_member": {
    "user_id": "FP3OOftEhoZ8ebYFGQDXhsaG6Bd2",
    "username": "alim_ra",
    "role": "admin",
    "invited_at": "2026-02-08T07:45:02.839763Z",
    "email": "alim.karim@riseup-asia.com",
    "display_name": "Alim",
    "joined_at": "2026-02-08T07:50:28.549065Z"
  },
  "is_member": true
}
```

Also saved as: [`sample-response.json`](./sample-response.json)

---

## Key Fields

| Field Path | Type | Usage |
|-----------|------|-------|
| `workspace.id` | `string` | **Workspace ID** — used in `/workspaces/{id}/credit-balance` |
| `workspace.name` | `string` | **Workspace name** — displayed in UI, used for matching |
| `workspace.plan` | `string` | Plan type (e.g. `ktlo`, `pro`, `business`) |
| `workspace.daily_credits_used` | `number` | Daily credits consumed |
| `workspace.daily_credits_limit` | `number` | Daily credit cap |
| `current_member.role` | `string` | User's role in this workspace |
| `is_member` | `boolean` | Whether the user is a member |

---

## Integration with Free Credit Detection

This endpoint resolves the **workspace ID** needed by the credit-balance API:

```
1. Extract projectId from URL
2. GET /projects/{projectId}/workspace → workspace.id, workspace.name
3. GET /workspaces/{workspace.id}/credit-balance → daily_remaining
4. hasFreeCredit = daily_remaining >= MinDailyCredit
```

---

## Cross-References

- [Free Credit Detection Spec](../../02-app-issues/free-credits-detect/overview.md)
- [Credit Balance Sample](../../02-app-issues/free-credits-detect/sample-response.json)
- [Workspace Detection Protocol](../../../.lovable/memory/features/macro-controller/workspace-detection-protocol.md)

---

*Workspace Name API Spec v1.0.0 — 2026-03-30*
