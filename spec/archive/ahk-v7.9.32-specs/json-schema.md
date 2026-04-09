# JSON-schema.md — Automator v7.9.21 Data Reference

## 1. API Response Schema

### Endpoint: `GET /user/workspaces`

**Base URL**: Configured via `config.ini` → `[CreditStatus.API]` → `LovableApiBaseUrl`

**Authentication**:
- `cookieSession` (default): Uses browser cookies via `credentials: 'include'`
- `token`: Sends `Authorization: Bearer <token>` header
- Token resolution order: config.ini → localStorage (`ahk_bearer_token`) → none

### Response Shape

```json
{
  "workspaces": [
    {
      "workspace": {
        "id": "uuid-string",
        "name": "My Workspace",
        "billing_period_credits_used": 37,
        "billing_period_credits_limit": 100,
        "daily_credits_used": 5,
        "daily_credits_limit": 5,
        "credits_granted": 0,
        "credits_used": 0,
        "last_trial_credit_period": "2026-02",
        "subscription_status": "active"
      },
      "membership": {
        "role": "owner"
      }
    }
  ]
}
```

> **Note**: The API may also return a flat array `[{ id, name, ... }]` without the `workspaces` wrapper. The parser handles both shapes: `data.workspaces || data || []`.

### Workspace Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique workspace identifier |
| `name` | string | Workspace display name |
| `billing_period_credits_used` | number | Credits consumed this billing period |
| `billing_period_credits_limit` | number | Total credits allowed this billing period |
| `daily_credits_used` | number | Credits consumed today |
| `daily_credits_limit` | number | Max free daily credits (typically 5) |
| `credits_granted` | number | One-time granted credits (promotional) |
| `credits_used` | number | Granted credits consumed |
| `last_trial_credit_period` | string | ISO month string (e.g., `"2026-02"`) for trial eligibility |
| `subscription_status` | string | `"active"`, `"trialing"`, `"canceled"`, etc. |

### Membership Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | User's role: `"owner"`, `"member"`, `"admin"` |

---

## 2. Internal Data Models (combo.js)

### `creditState` — Global Credit State

```javascript
const creditState = {
  lastCheckedAt: null,        // Date.now() timestamp of last successful check
  freeTierAvailable: null,    // boolean — any workspace has free credits remaining
  totalCreditsText: '',       // Summary string: "37/100 | Daily: 5/5"
  perWorkspace: [],           // Array of parsed workspace objects (see below)
  source: null,               // 'api' | 'dom' — how data was obtained
  autoTimerId: null,          // setInterval ID for auto-refresh
  projectName: null,          // Detected project name (DOM XPath → title → workspace)
  rawSchema: null             // Raw API JSON for debugging (stored by parseApiResponse)
};
```

### `perWorkspace[]` — Parsed Workspace Entry

Each element in `creditState.perWorkspace`:

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `id` | string | `ws.id` | Workspace UUID |
| `name` | string | `ws.name` (truncated to 12 chars) | Short display name |
| `fullName` | string | `ws.name` | Full workspace name |
| `used` | number | `ws.billing_period_credits_used` | Billing credits consumed |
| `limit` | number | `ws.billing_period_credits_limit` | Billing credits limit |
| `dailyUsed` | number | `ws.daily_credits_used` | Daily credits consumed |
| `dailyLimit` | number | `ws.daily_credits_limit` | Daily credits limit |
| `dailyFree` | number | `dailyLimit - dailyUsed` | **Calculated**: remaining free daily credits |
| `rollover` | number | `rolloverLimit - rolloverUsed` | **Calculated**: remaining rollover credits |
| `rolloverLimit` | number | `ws.rollover_credits_limit` | Rollover credits limit |
| `rolloverUsed` | number | `ws.rollover_credits_used` | Rollover credits consumed |
| `available` | number | computed | **Calculated**: Total Credits − rolloverUsed − dailyUsed − billingUsed |
| `billingAvailable` | number | `limit - used` | **Calculated**: remaining billing period credits |
| `topupLimit` | number | `ws.topup_credits_limit` | Top-up credits limit |
| `totalCredits` | number | computed | **Calculated**: granted + daily + billing + topup + rollover limits |
| `totalCreditsUsed` | number | `ws.total_credits_used` | Total credits consumed across all pools |
| `freeGranted` | number | `ws.credits_granted` | Promotional credits granted |
| `freeRemaining` | number | `freeGranted - credits_used` | Promotional credits remaining |
| `hasFree` | boolean | computed | `freeGranted > 0 && credits_used < freeGranted` |
| `subscriptionStatus` | string | `ws.subscription_status` | Subscription state |
| `role` | string | `membership.role` | User's workspace role |
| `raw` | object | full workspace JSON | Raw data for tooltip display |

### Calculated Credit Formulas

```
Total Credits    = credits_granted + daily_credits_limit + billing_period_credits_limit + topup_credits_limit + rollover_credits_limit
Available Credit = Total Credits - rollover_credits_used - daily_credits_used - billing_period_credits_used
Free Credit Available = daily_credits_limit - daily_credits_used
dailyFree  = daily_credits_limit - daily_credits_used
rollover   = rollover_credits_limit - rollover_credits_used
billingAvailable = billing_period_credits_limit - billing_period_credits_used
```

### `comboHistory[]` — Combo Action History

Last 5 combo switch actions (FIFO, newest first):

```javascript
{ time: "02:15:30 PM", direction: "up"|"down"|"move", target: "WorkspaceName" }
```

### `jsHistory[]` — JS Executor History

Last 20 executed JS commands (FIFO, newest first):

```javascript
{ time: "14:15:30", code: "document.title", success: true, result: "My Project - Lovable" }
```

---

## 3. config.ini Schema

### `[Hotkeys]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ComboDown` | hotkey | `^Down` | Combo switch down shortcut |
| `ComboUp` | hotkey | `^Up` | Combo switch up shortcut |
| `GmailUnread` | hotkey | `^+F9` | Gmail unread search shortcut |
| `MacroLoopUp` | hotkey | `^+Up` | MacroLoop toggle up |
| `MacroLoopDown` | hotkey | `^+Down` | MacroLoop toggle down |
| `LoopIntervalDecrease` | hotkey | `^+[` | Decrease loop interval |
| `LoopIntervalIncrease` | hotkey | `^+]` | Increase loop interval |
| `LoopIntervalStep` | number (ms) | `5000` | Interval adjustment step |
| `DelegateUp` | hotkey | `^+=` | Delegate up hotkey |
| `DelegateDown` | hotkey | `^+-` | Delegate down hotkey |
| `ComboAltUp` | hotkey | `^!Up` | Alt combo up shortcut |
| `ComboAltDown` | hotkey | `^!Down` | Alt combo down shortcut |
| `UseSmartShortcuts` | 0\|1 | `0` | 1 = check URL before combo |

### `[ComboSwitch.XPaths]`

| Key | Placeholder | Description |
|-----|-------------|-------------|
| `TransferButtonXPath` | `__TRANSFER_XPATH__` | XPath to Transfer button |
| `ProjectNameXPath` | `__PROJECT_NAME_XPATH__` | XPath to project name element |
| `Combo1XPath` | `__COMBO1_XPATH__` | Current project text in modal |
| `Combo2ButtonXPath` | `__COMBO2_XPATH__` | Project dropdown button |
| `OptionsContainerXPath` | `__OPTIONS_XPATH__` | Dropdown options container |
| `ConfirmButtonXPath` | `__CONFIRM_XPATH__` | Confirm transfer button |

### `[ComboSwitch.Transfer]` — Fallback Detection

| Key | Type | Description |
|-----|------|-------------|
| `TextMatch` | pipe-separated | Button text to match (e.g., `Transfer\|Transfer project`) |
| `Tag` | string | HTML tag to scan (default: `button`) |
| `Selector` | CSS selector | Direct CSS selector |
| `AriaLabel` | string | `aria-label` attribute match |
| `HeadingSearch` | string | Heading proximity search keyword |
| `Role` | string | ARIA `role` attribute |

> Same structure applies to: `[ComboSwitch.Combo1]`, `[ComboSwitch.Combo2]`, `[ComboSwitch.Options]`, `[ComboSwitch.Confirm]`

### `[ComboSwitch.Timing]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `PollIntervalMs` | number | `300` | Polling interval during combo steps |
| `OpenMaxAttempts` | number | `20` | Max attempts to open dropdown |
| `WaitMaxAttempts` | number | `20` | Max attempts to wait for elements |
| `RetryCount` | number | `2` | Auto-retry on combo failure |
| `RetryDelayMs` | number | `1000` | Delay between retries |
| `ConfirmDelayMs` | number | `500` | Delay before clicking Confirm |

### `[ComboSwitch.ElementIDs]`

| Key | Placeholder | Description |
|-----|-------------|-------------|
| `ScriptMarkerId` | `__SCRIPT_MARKER_ID__` | Embed marker element ID |
| `ButtonContainerId` | `__BUTTON_CONTAINER_ID__` | Controller container ID |
| `ButtonUpId` | `__BUTTON_UP_ID__` | Up button ID |
| `ButtonDownId` | `__BUTTON_DOWN_ID__` | Down button ID |
| `JsExecutorId` | `__JS_EXECUTOR_ID__` | JS textbox ID |
| `JsExecuteBtnId` | `__JS_EXECUTE_BTN_ID__` | JS execute button ID |
| `ProgressStatusId` | (literal) | Progress status element ID |

### `[ComboSwitch.Shortcuts]`

| Key | Default | Description |
|-----|---------|-------------|
| `FocusTextboxKey` | `/` | Key to focus JS textbox |
| `ComboUpKey` | `ArrowUp` | Keyboard combo up |
| `ComboDownKey` | `ArrowDown` | Keyboard combo down |
| `ShortcutModifier` | `none` | Modifier key requirement |

### `[MacroLoop.Timing]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `LoopIntervalMs` | number | `50000` | Main loop cycle interval |
| `CountdownIntervalMs` | number | `1000` | Countdown display update |
| `FirstCycleDelayMs` | number | `500` | Delay before first cycle |
| `PostComboDelayMs` | number | `4000` | Wait after combo completes |
| `PageLoadDelayMs` | number | `2500` | Page load wait time |
| `DialogWaitMs` | number | `3000` | Wait after clicking project button |
| `WorkspaceCheckIntervalMs` | number | `5000` | Auto workspace name check |

### `[MacroLoop.URLs]`

| Key | Default | Description |
|-----|---------|-------------|
| `RequiredDomain` | `https://lovable.dev/` | Domain validation |
| `SettingsTabPath` | `/settings?tab=project` | Settings page path suffix |
| `DefaultView` | `?view=codeEditor` | Default view parameter |

### `[MacroLoop.XPaths]`

| Key | Description |
|-----|-------------|
| `ProjectButtonXPath` | Project button in nav sidebar |
| `MainProgressXPath` | Main credit progress bar |
| `ProgressXPath` | Free credit progress bar |
| `WorkspaceNameXPath` | Workspace name in dialog |
| `WorkspaceNavXPath` | Workspace name in persistent nav (auto-discover if empty) |
| `FreeCreditProgressXPath` | Free credit bar in dialog |
| `PromptActiveXPath` | Prompt area (skip dialog if focused) |
| `LoopControlsXPath` | Container for loop UI |

### `[MacroLoop.ElementIDs]`

| Key | Description |
|-----|-------------|
| `LoopScriptMarkerId` | Loop script embed marker |
| `LoopContainerId` | Loop controls container |
| `LoopStatusId` | Loop status display |
| `LoopStartBtnId` / `LoopStopBtnId` | Start/stop buttons |
| `LoopUpBtnId` / `LoopDownBtnId` | Up/down buttons |
| `LoopRecordIndicatorId` | Recording indicator |
| `LoopJsExecutorId` / `LoopJsExecuteBtnId` | Loop JS executor |

### `[AHK.Timing]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ConsoleOpenDelayMs` | number | `800` | Wait after opening DevTools |
| `PasteDelayMs` | number | `200` | Wait after pasting |
| `ExecuteDelayMs` | number | `300` | Wait after Enter |
| `BrowserActivateDelayMs` | number | `150` | Wait for browser focus |
| `AddressBarDelayMs` | number | `100` | Wait for address bar ops |
| `DelegateTabSwitchDelayMs` | number | `300` | Tab switching delay |
| `DelegateMaxTabSearch` | number | `10` | Max tabs to search |

### `[Gmail]`

| Key | Default | Description |
|-----|---------|-------------|
| `URL` | `https://mail.google.com` | Gmail URL |
| `SearchQuery` | `in:inbox is:unread` | Search query |
| `OpenDelayMs` | `1500` | Wait after opening Gmail |
| `SlashDelayMs` | `500` | Wait after pressing `/` |
| `TypeDelayMs` | `300` | Wait after typing query |
| `EnterDelayMs` | `100` | Wait after pressing Enter |

### `[CreditStatus.API]`

| Key | Default | Description |
|-----|---------|-------------|
| `LovableApiBaseUrl` | `https://api.lovable.dev` | API base URL |
| `LovableAuthMode` | `cookieSession` | Auth mode: `cookieSession`, `token`, `officialFlow` |
| `LovableBearerToken` | (empty) | Bearer token (redacted in logs) |

### `[CreditStatus.Timing]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `AutoCheckEnabled` | 0\|1 | `1` | Enable auto credit refresh |
| `AutoCheckIntervalSeconds` | number | `60` | Seconds between checks |
| `CacheTtlSeconds` | number | `30` | Skip re-fetch within TTL |

### `[CreditStatus.Retry]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `MaxRetries` | number | `2` | Retry attempts on API failure |
| `RetryBackoffMs` | number | `1000` | Base backoff delay (doubles per retry) |

### `[CreditStatus.XPaths]`

| Key | Description |
|-----|-------------|
| `PlansButtonXPath` | Plans & Credits sidebar button |
| `FreeProgressBarXPath` | Free credits progress bar |
| `TotalCreditsXPath` | Total credits text element |

### `[General]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `BrowserExe` | string | `chrome.exe` | Target browser executable |
| `ScriptVersion` | string | `7.9.21` | Must match `AHK_BUILD_VERSION` in Automator.ahk |
| `Debug` | 0\|1 | `1` | Verbose logging |
| `ConfigWatchIntervalMs` | number | `2000` | Config hot-reload poll (0 = disabled) |

---

## 4. Placeholder Injection Map

AHK reads values from `config.ini` and replaces placeholders in JS files before injection:

| Placeholder | INI Section | INI Key |
|-------------|-------------|---------|
| `__SCRIPT_MARKER_ID__` | ComboSwitch.ElementIDs | ScriptMarkerId |
| `__BUTTON_CONTAINER_ID__` | ComboSwitch.ElementIDs | ButtonContainerId |
| `__BUTTON_UP_ID__` | ComboSwitch.ElementIDs | ButtonUpId |
| `__BUTTON_DOWN_ID__` | ComboSwitch.ElementIDs | ButtonDownId |
| `__JS_EXECUTOR_ID__` | ComboSwitch.ElementIDs | JsExecutorId |
| `__JS_EXECUTE_BTN_ID__` | ComboSwitch.ElementIDs | JsExecuteBtnId |
| `__TRANSFER_XPATH__` | ComboSwitch.XPaths | TransferButtonXPath |
| `__PROJECT_NAME_XPATH__` | ComboSwitch.XPaths | ProjectNameXPath |
| `__COMBO1_XPATH__` | ComboSwitch.XPaths | Combo1XPath |
| `__COMBO2_XPATH__` | ComboSwitch.XPaths | Combo2ButtonXPath |
| `__OPTIONS_XPATH__` | ComboSwitch.XPaths | OptionsContainerXPath |
| `__CONFIRM_XPATH__` | ComboSwitch.XPaths | ConfirmButtonXPath |
| `__COMBO_POLL_INTERVAL_MS__` | ComboSwitch.Timing | PollIntervalMs |
| `__COMBO_OPEN_MAX_ATTEMPTS__` | ComboSwitch.Timing | OpenMaxAttempts |
| `__COMBO_WAIT_MAX_ATTEMPTS__` | ComboSwitch.Timing | WaitMaxAttempts |
| `__COMBO_RETRY_COUNT__` | ComboSwitch.Timing | RetryCount |
| `__COMBO_RETRY_DELAY_MS__` | ComboSwitch.Timing | RetryDelayMs |
| `__COMBO_CONFIRM_DELAY_MS__` | ComboSwitch.Timing | ConfirmDelayMs |
| `__SCRIPT_VERSION__` | General | ScriptVersion |
| `__DIRECTION__` | (runtime) | `"up"` or `"down"` |
| `__LOVABLE_API_BASE_URL__` | CreditStatus.API | LovableApiBaseUrl |
| `__LOVABLE_AUTH_MODE__` | CreditStatus.API | LovableAuthMode |
| `__LOVABLE_BEARER_TOKEN__` | CreditStatus.API | LovableBearerToken |
| `__CREDITS_AUTO_CHECK_ENABLED__` | CreditStatus.Timing | AutoCheckEnabled |
| `__CREDITS_AUTO_CHECK_INTERVAL_S__` | CreditStatus.Timing | AutoCheckIntervalSeconds |
| `__CREDITS_CACHE_TTL_S__` | CreditStatus.Timing | CacheTtlSeconds |
| `__CREDITS_MAX_RETRIES__` | CreditStatus.Retry | MaxRetries |
| `__CREDITS_RETRY_BACKOFF_MS__` | CreditStatus.Retry | RetryBackoffMs |
| `__PLANS_BUTTON_XPATH__` | CreditStatus.XPaths | PlansButtonXPath |
| `__FREE_PROGRESS_XPATH__` | CreditStatus.XPaths | FreeProgressBarXPath |
| `__TOTAL_CREDITS_XPATH__` | CreditStatus.XPaths | TotalCreditsXPath |

---

## 5. Project-to-Workspace Detection API (v7.9.20+)

### Endpoint: `POST /projects/{projectId}/mark-viewed`

**Purpose**: Maps a project UUID to its parent workspace ID. Used by both `combo.js` and `macro-looping.js` to detect which workspace the current project belongs to.

**Base URL**: `https://api.lovable.dev`

**Authentication**: Same as `/user/workspaces` — bearer token with 401 cookie-session fallback.

**Request**:
```http
POST /projects/ba4ea8e6-aef7-473c-85d6-50b76bf14f45/mark-viewed
Content-Type: application/json
Authorization: Bearer <token>

{}
```

**Response** (HTTP 200):
```json
{
  "workspace_id": "ciNMBSTjM5RhDJo7upDm"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `workspace_id` | string | The ID of the workspace that owns this project |

**Usage Flow**:
1. Extract `projectId` from the current URL (`/projects/{uuid}/...`)
2. `POST /projects/{projectId}/mark-viewed` → get `workspace_id`
3. Look up `workspace_id` in the `wsById` dictionary (see below) for O(1) matching
4. Set `state.workspaceName` and `loopCreditState.currentWs` from the matched entry
5. Set `state.workspaceFromApi = true` to prevent DOM observers from overwriting

**Fallback Chain** (if mark-viewed fails):
1. DOM scraping via `WorkspaceNavXPath` or `autoDiscoverWorkspaceNavElement()`
2. Default to `perWorkspace[0]` (last resort)

> **History**: Replaces the non-functional `GET /projects/{id}` which returns HTTP 405. The `mark-viewed` endpoint was chosen because it reliably returns `workspace_id` as a side effect of marking the project as recently viewed.

---

## 6. `wsById` Dictionary — O(1) Workspace Lookup (v7.9.20+)

### Structure

Built during `parseLoopApiResponse()` / `parseApiResponse()` immediately after parsing the workspace list:

```javascript
// Built from perWorkspace array
loopCreditState.wsById = {};
for (var w = 0; w < perWs.length; w++) {
  if (perWs[w].id) {
    loopCreditState.wsById[perWs[w].id] = perWs[w];
  }
}
```

### Schema

```javascript
wsById = {
  "ciNMBSTjM5RhDJo7upDm": { /* perWorkspace entry — see Section 2 */ },
  "6OptYfbHEmfcj4dV45ns": { /* perWorkspace entry */ },
  // ...
};
```

**Key**: Workspace `id` (string, from API `ws.id`)
**Value**: Full parsed `perWorkspace` entry (same schema as Section 2)

### Usage

```javascript
var wsId = markViewedResponse.workspace_id;  // e.g. "ciNMBSTjM5RhDJo7upDm"
var matched = loopCreditState.wsById[wsId];  // O(1) lookup
if (matched) {
  state.workspaceName = matched.fullName || matched.name;
  state.workspaceFromApi = true;  // v7.9.21: prevent DOM overwrite
  loopCreditState.currentWs = matched;
}
```

### `state.workspaceFromApi` Guard (v7.9.21)

| Flag Value | Meaning | DOM Observer Behavior |
|---|---|---|
| `false` (default) | Workspace not yet detected via API | DOM observers may set `state.workspaceName` |
| `true` | API/move has authoritatively set workspace | DOM observers log & skip — will not overwrite |

Set to `true` by: `autoDetectLoopCurrentWorkspace` (API match), `detectWorkspaceFromDom` (API-flow fallback), `moveToWorkspace` (explicit move success).

---

## 7. Move-to-Workspace API

### Endpoint: `PUT /projects/{projectId}/move-to-workspace`

**Purpose**: Moves the current project to a different workspace.

**Request**:
```http
PUT /projects/ba4ea8e6-aef7-473c-85d6-50b76bf14f45/move-to-workspace
Content-Type: application/json
Authorization: Bearer <token>

{
  "workspace_id": "6OptYfbHEmfcj4dV45ns"
}
```

**Response**: HTTP 200 on success (body varies).

**Authentication**: Bearer token with 401 cookie-session fallback (same pattern as all other endpoints).
