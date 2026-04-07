

# SPEC.md Update: Credit Status Checker + MacroLoop Injection Documentation

## Overview

This plan updates `SPEC.md` to document three things:
1. The MacroLoop injection change (now uses shared InjectJS)
2. The Credit Status Checker feature (API-first + DOM fallback)
3. CW seedable config keys and logging requirements

No code implementation -- spec and documentation only.

---

## Phase 1: API Response Schema Summary

Add a new section to SPEC.md documenting the parsed schema from `GET /user/workspaces`.

**Key fields per workspace object:**

| Field | Type | Use |
|-------|------|-----|
| `name` | string | Workspace display name |
| `plan` | string | Plan identifier (e.g. `pro_1`) |
| `plan_type` | string | `monthly` etc. |
| `daily_credits_used` | number | Daily usage |
| `daily_credits_limit` | number | Daily cap (e.g. 5) |
| `billing_period_credits_used` | number | Period usage |
| `billing_period_credits_limit` | number | Period cap (e.g. 100) |
| `credits_granted` | number | Free/trial credits granted |
| `last_trial_credit_period` | string or null | If present, indicates free tier active |
| `subscription_status` | string | `trialing`, `active`, etc. |
| `rollover_credits_used` / `_limit` | number | Rollover tracking |
| `topup_credits_used` / `_limit` | number | Top-up tracking |
| `membership.role` | string | `owner`, `admin`, `member` |

**Free tier detection rule:** If `credits_granted > 0` OR `last_trial_credit_period` matches current month, then `freeTierAvailable = true`.

**Credits summary text:** Derived from `daily_credits_used / daily_credits_limit` and `billing_period_credits_used / billing_period_credits_limit`.

---

## Phase 2: MacroLoop Injection Update (already partially in SPEC.md)

The current SPEC.md already documents this at lines 265-325. Verify completeness against acceptance criteria:

- [x] InjectJS documented as shared mechanism
- [x] Ctrl+A paste marked as deprecated
- [x] OpenDevToolsIfNeeded marked as deprecated no-op
- [x] Migration rationale documented

**Action:** No further changes needed for this section -- it is already complete from the previous update.

---

## Phase 3: ComboSwitch Controller UI Spec Update

Update the existing "UI Elements Created" section (lines 198-228) to add:

1. **Fixed placement requirement** -- controller must be appended near end of `document.body` with `position: fixed; top: 80px; right: 20px; z-index: 99998`. Currently the code already does this when dragged, but the spec should mandate it as the default initial state.

2. **New buttons in the button row:**
   - "Status" button -- triggers credit status check
   - Keyboard shortcut: `Ctrl+Alt+S` (HTML-level, not AHK)

3. **Credit status display area** inside the controller body:

```text
+---------------------------------------------+
| ComboSwitch v4.10             [ - ] [ x ]   |
+---------------------------------------------+
| [Up]  [Down]  [Status]                       |
| Ctrl+Alt+Up / Down / Ctrl+Alt+S              |
|                                              |
| NOW: ProjectA | ^ ProjectC . v ProjectB      |
|                                              |
| Credits: 36.6/100 | Daily: 5/5 | Free: Yes  |
| P01: 36.6/100  P02: 0/100  P03: 0/100 ...   |
| Last checked: 14:32:05 (api)                 |
|                                              |
| JS Executor (Ctrl+/ to focus, Ctrl+Enter)    |
| +----------------------------------+ [Run]   |
| | Enter JavaScript code here...    |         |
| +----------------------------------+         |
|                                              |
| Recent Actions                               |
| | 05:15:30 PM  v  ProjectB        |          |
+---------------------------------------------+
```

4. **Display fields:**
   - `freeTierAvailable` -- green/red indicator
   - `totalCreditsText` -- raw summary string
   - Per-workspace credit breakdown (all workspaces shown)
   - `lastCheckedAt` -- timestamp
   - `source` -- "api" or "dom"

5. **Sidebar behavior:** Leave Plans and Credits sidebar open after DOM fallback check.

---

## Phase 4: Status Retrieval Spec (API-first + DOM fallback)

### Authentication Rule

The spec will document three approved auth approaches:

1. **Cookie-based fetch** (preferred): Use `fetch(url, { credentials: 'include' })` from within the logged-in browser session. Since combo.js runs in the page context on `lovable.dev`, the browser automatically sends session cookies. No token extraction needed.
2. **User-provided token** via CW config key `lovableBearerToken` (fallback if cookies don't work).
3. **No token exfiltration**: The script must never read `Authorization` headers from intercepted requests or localStorage.

### API-First Path

```text
checkCreditsStatus()
  |-- fetch('https://api.lovable.dev/user/workspaces', { credentials: 'include' })
  |-- On success (200):
  |     Parse JSON -> extract all workspace credit fields
  |     Set freeTierAvailable, totalCreditsText, per-workspace data
  |     Update controller UI
  |     Log: correlationId, timestamp, source=api, status=200, parsed fields
  |-- On failure (non-200 or network error):
  |     Log: correlationId, error, status code
  |     Fall through to DOM fallback
```

### DOM Fallback Path

```text
domFallback()
  |-- Click Plans and Credits button:
  |     XPath: /html/body/div[3]/div/div/aside/nav/div[2]/div[2]/button[3]
  |-- Wait for Total Credits Count element visible:
  |     XPath: /html/body/div[3]/.../div[1]/p[2]
  |     Max wait: 20 attempts x 300ms
  |-- Read innerText -> totalCreditsText
  |-- Check Free Progress Bar exists:
  |     XPath: /html/body/div[3]/.../div[4]
  |     If present -> freeTierAvailable = true
  |-- Update controller UI
  |-- Leave sidebar open (do not close)
  |-- Log: correlationId, source=dom, xpaths used, extracted text
```

### Check Frequency

- **Auto-refresh:** Configurable timer (default 60s), controlled by `creditsAutoCheckIntervalSeconds`
- **On-demand:** Click "Status" button or press `Ctrl+Alt+S`
- **Cache TTL:** Skip re-fetch if last check was within `creditsStatusCacheTtlSeconds`

---

## Phase 5: CW Seedable Config + Logging

### New config.ini Keys (under [CreditStatus])

| Key | Default | Description |
|-----|---------|-------------|
| `LovableApiBaseUrl` | `https://api.lovable.dev` | API endpoint base |
| `LovableAuthMode` | `cookieSession` | `cookieSession`, `token`, or `officialFlow` |
| `LovableBearerToken` | *(empty)* | Only used if AuthMode=token |
| `CreditsAutoCheckEnabled` | `1` | Enable auto-refresh |
| `CreditsAutoCheckIntervalSeconds` | `60` | Auto-refresh interval |
| `CreditsStatusCacheTtlSeconds` | `30` | Skip re-fetch if within TTL |
| `MaxRetries` | `2` | API retry count |
| `RetryBackoffMs` | `1000` | Backoff between retries |

### New Placeholders for combo.js

| Placeholder | Config Key |
|-------------|------------|
| `__LOVABLE_API_BASE_URL__` | LovableApiBaseUrl |
| `__LOVABLE_AUTH_MODE__` | LovableAuthMode |
| `__LOVABLE_BEARER_TOKEN__` | LovableBearerToken |
| `__CREDITS_AUTO_CHECK_ENABLED__` | CreditsAutoCheckEnabled |
| `__CREDITS_AUTO_CHECK_INTERVAL_S__` | CreditsAutoCheckIntervalSeconds |
| `__CREDITS_CACHE_TTL_S__` | CreditsStatusCacheTtlSeconds |
| `__CREDITS_MAX_RETRIES__` | MaxRetries |
| `__CREDITS_RETRY_BACKOFF_MS__` | RetryBackoffMs |
| `__PLANS_BUTTON_XPATH__` | PlansButtonXPath |
| `__FREE_PROGRESS_XPATH__` | FreeProgressBarXPath |
| `__TOTAL_CREDITS_XPATH__` | TotalCreditsXPath |

### DOM Fallback XPaths (under [CreditStatus])

| Key | Value |
|-----|-------|
| `PlansButtonXPath` | `/html/body/div[3]/div/div/aside/nav/div[2]/div[2]/button[3]` |
| `FreeProgressBarXPath` | `/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[2]/div/div[2]/div/div[4]` |
| `TotalCreditsXPath` | `/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[1]/p[2]` |

### Seeding Rules

1. Seed from `config.ini` on first run
2. Persist to DB after seeding
3. DB becomes source of truth
4. UI can edit DB values
5. `LovableBearerToken` is redacted as `***REDACTED***` in all logs and exports

### Logging Schema

Every status check logs:
- `correlationId` (unique per run)
- `timestamp` and `triggerSource` (`auto` or `onDemand`)
- API result: endpoint, status code, parsed field count (no raw response body)
- DOM fallback: xpaths used, visibility wait outcome, extracted innerText
- Errors: message + stack trace
- Token values are NEVER logged in plaintext

### New Error Codes

| Code | Description |
|------|-------------|
| E012 | Credit status API request failed |
| E013 | Plans and Credits button not found (DOM fallback) |
| E014 | Total Credits element not visible after timeout |
| E015 | Credit status parse error |

---

## Technical: Files to Modify

1. **`marco-script-ahk-v4/SPEC.md`** -- Add sections for Credit Status Checker (schema, retrieval flow, UI, config, logging, error codes)
2. **`marco-script-ahk-v4/config.ini`** -- Add `[CreditStatus]` section with new keys and XPaths

No code changes to `combo.js`, `Combo.ahk`, or `MacroLoop.ahk` in this spec-only phase.

---

## Open Questions (Listed, Not Resolved)

1. Will `fetch(url, { credentials: 'include' })` work for the Lovable API from the page context, or does it require an explicit Authorization header?
2. Should the auto-check timer pause when the browser tab is not visible?
3. Should the per-workspace display be collapsible if there are many workspaces?

