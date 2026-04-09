# CHANGELOG.md — Automator Version History

All notable changes to the Automator project are documented in this file.

---

## v7.19.1 (2026-03-04)

### Fixed
- **Manual Check button guard regression** — `runCheck` button was blocked for most of the loop cycle by `countdown > 10` guard. Updated to only block while active delegation/move is in progress (`state.isDelegating`).
- **Macro Auth panel controls** — Added reliable drag, minimize, and close controls for the injected auth panel in both standalone controller script and extension-seeded default controller script.

### Files
- `marco-script-ahk-v7.latest/macro-looping.js`
- `01-script-direct-copy-paste.js`
- `standalone-scripts/macro-controller/macro-controller.js`
- `chrome-extension/src/background/default-scripts-seeder.ts`

---

## v7.14.0 (2026-02-25)

### Fixed
- **Check button uses wrong detection path (Issue #28)** — `runCheck()` was calling `autoDetectLoopCurrentWorkspace` (v7.13.0) which includes a `POST mark-viewed` API call (Tier 1). This is unnecessary and unreliable for the Check button. The Check button should ONLY use XPath: click Project Button → read workspace name from dialog → update state. Removed Tier 1 API from `runCheck()`, now calls `detectWorkspaceViaProjectDialog` directly.

### Changed
- **Default loop interval** — `LoopIntervalMs` changed from 50000 (50s) to 100000 (100s) in `config.ini`.

### Files
- `macro-looping.js` — `runCheck()` simplified to XPath-only detection
- `config.ini` — `LoopIntervalMs=100000`, `ScriptVersion=7.14`

---

## v7.13.0 (2026-02-25)

### Fixed
- **Check button skips Tier 1 API detection (Issue #28)** — `runCheck()` called `detectWorkspaceViaProjectDialog()` directly (Tier 2 XPath only), completely bypassing `autoDetectLoopCurrentWorkspace()` which includes Tier 1 API detection via `POST /projects/{id}/mark-viewed`. When XPath failed (dialog didn't render, stale XPath, DOM race), the cleared `state.workspaceName` caused unconditional fallback to `perWs[0]` (first workspace). Fix: `runCheck()` now calls `autoDetectLoopCurrentWorkspace(token)` for full Tier 1 API → Tier 2 XPath → Tier 3 Default hierarchy. Guard flags (`workspaceFromApi`, `workspaceName`) are cleared before detection to force fresh re-detection.

### Files
- `macro-looping.js` — `runCheck()` rewritten to use `autoDetectLoopCurrentWorkspace` instead of direct Tier 2 call

---

## v7.12.0 (2026-02-25)

### Fixed
- **Available credits formula missing freeUsed (Issue #27A)** — `calcAvailableCredits()` subtracted `rolloverUsed`, `dailyUsed`, and `billingUsed` from `totalCredits` but did NOT subtract `credits_used` (usage against `credits_granted`). This inflated the `⚡ Available` number by `credits_granted` when those credits were fully consumed. Example: P01 with all credits exhausted showed ⚡105/294 instead of ⚡0/294. Fix: Added `freeUsed` as 5th parameter to `calcAvailableCredits()` in both controllers. Updated all call sites including inline fallback in `updateStatus()`.
- **Workspace defaults to first on initial load (Issue #27B)** — `detectWorkspaceViaProjectDialog()` tried to find the project button once with no retry. On initial page load, the API response arrives before the DOM renders the project button, causing immediate fallback to `perWs[0]`. Fix: Added `findProjectButtonWithRetry()` which tries up to 3 times with 1-second delays. Extracted `openDialogAndPoll()` for clarity.

### Files
- `macro-looping.js` — `calcAvailableCredits()`, `parseLoopApiResponse()`, `updateStatus()`, `detectWorkspaceViaProjectDialog()` refactored with retry
- `combo.js` — `calcAvailableCredits()`, parse function updated

---

## v7.11.4 (2026-02-25)

### Fixed
- **Check button does not update workspace name (Issue #26)** — `runCheck()` relied on `detectWorkspaceViaProjectDialog()` guards from v7.11.2 which preserved the existing `state.workspaceName` when XPath matching failed. On a manual Check, the user expects fresh re-detection, but the guard blocked it. Additionally, if the project dialog was already open, the detection would read stale DOM nodes. Fix: (1) `runCheck()` now saves and clears `state.workspaceName` before detection, restoring only on total failure; (2) if the dialog is already open, it force-closes then reopens for a clean read; (3) polling logic extracted to reusable `pollForWorkspaceName()` function.

---

## v7.11.3 (2026-02-25)

### Fixed
- **Check button skips workspace detection & shows no feedback (Issue #25)** — `runCheck()` had three problems: (1) No visual "Searching..." feedback in the status bar, (2) when `perWorkspace` was empty, `fetchLoopCredits()` was called fire-and-forget then `continueCheck()` ran immediately with no workspace data, (3) the empty-workspace path never called `detectWorkspaceViaProjectDialog`. Fix: Status bar now shows "🔍 Searching for workspace..." immediately; added `fetchLoopCreditsAsync()` promise-returning variant; empty-workspace path awaits credit fetch then runs XPath detection before proceeding.

---

## v7.11.2 (2026-02-25)

### Fixed
- **MacroLoop workspace name clobbers to P01 on cycle** — Three Tier 2/3 fallback paths in `detectWorkspaceViaProjectDialog()` and `closeDialogAndDefault()` unconditionally overwrote `state.workspaceName` with `perWs[0]` when XPath detection failed. During running cycles (`runCycle` resets `workspaceFromApi=false` every ~50s), if both Tier 1 (API) and Tier 2 (XPath) fail, the fallback would replace a valid workspace name with P01. Fix: All three paths now check `if (!state.workspaceName)` before defaulting — same guard pattern already present in `combo.js`. See Issue #24.

---

## v7.11 (2026-02-25)

### Changed
- Version bump to v7.11 (consolidates v7.10.x patch series)

### Fixed
- **Cookie-only auth skips Tier 1 workspace detection (v7.11.1)** — `autoDetectLoopCurrentWorkspace()` and `autoDetectCurrentWorkspace()` required both `projectId` AND `bearerToken` to attempt the mark-viewed API call. When using `cookieSession` auth mode (no bearer token in localStorage), Tier 1 was entirely skipped, causing workspace name to be wrong on first load. Fix: Tier 1 now only requires `projectId`; cookie auth via `credentials: 'include'` handles authentication.

---

## v7.10.3 (2026-02-25)

### Fixed
- **Workspace detection wrong on initial load** — Restored mark-viewed API as Tier 1 workspace detection (was removed in v7.9.30). The XPath-only approach (Tier 2) requires clicking the project dialog which is fragile when XPaths change. `POST /projects/{id}/mark-viewed` returns `workspace_id` which maps to `wsById` dictionary for O(1) lookup. Both `macro-looping.js` and `combo.js` now use 3-tier detection: API mark-viewed → Project Dialog XPath → Default first workspace.

### Files
- `macro-looping.js` — `autoDetectLoopCurrentWorkspace()`: Added Tier 1 mark-viewed API call before XPath fallback
- `combo.js` — `autoDetectCurrentWorkspace()`: Same Tier 1 mark-viewed API restoration

---

## v7.10.2 (2026-02-25)

### Fixed
- **XPath multi-match workspace detection (Issue #22)** — `getByXPath(CONFIG.WORKSPACE_XPATH)` returned only the first matching DOM node, which could be a non-workspace element (e.g., project name, label). Replaced with `getAllByXPath()` to iterate all matching nodes and validate each against known workspaces. First valid match wins. Logs every node checked for diagnostics.
- **combo.js: same multi-match fix** — `detectWorkspaceViaProjectDialogCombo()` used single-match `findByXPath()`. Added `findAllByXPath()` and updated the polling loop to iterate all nodes with the same validate-and-match pattern.

### Files
- `macro-looping.js` — `detectWorkspaceViaProjectDialog()`: `getByXPath` → `getAllByXPath` + iterate-and-validate
- `combo.js` — added `findAllByXPath()`, updated `detectWorkspaceViaProjectDialogCombo()`: `findByXPath` → `findAllByXPath` + iterate-and-validate

---

## v7.10.1 (2026-02-25)

### Fixed
- **GetCurrentUrl timing — press twice to work (Issue #19, Iteration 2)** — `ActivateBrowserPage()` alone was insufficient; the window wasn't ready for keyboard input. Added `WinWaitActive("ahk_id " hwnd, , 3)` + `Sleep(browserActivateDelayMs)` after activation.
- **Workspace name stuck after external change (Issue #20)** — `workspaceFromApi` guard in `autoDetectLoopCurrentWorkspace()` blocked re-detection on every 50s cycle and manual Check. Once set to `true`, the controller showed stale workspace names indefinitely. Fixed by resetting `state.workspaceFromApi = false` before detection in `runCycle`, `runCheck`, and double-confirm.
- **InjectViaDevTools — Ctrl+Shift+J sent before window ready (Issue #21)** — Same pattern as Issue #19. `ActivateBrowserPage()` returned before the window was ready for keyboard input, so `Ctrl+Shift+J` fired too early and DevTools failed to open. Added `WinWaitActive` + settle delay after both `ActivateBrowserPage()` calls (attempt 1 and retry).

### Added
- **Engineering Standard #19**: WinWaitActive Mandatory After Window Activation
- **Engineering Standard #20**: Guard Flags Must Reset on Cycle Boundaries (RULE-GUARD-1)
- **Engineering Standard #21**: Every Cycle Must Force Fresh Detection (RULE-DETECT-1)
- **Code Style Standards renumbered** to #22–#26

### Files
- `MacroLoop/Routing.ahk` (v7.0 + v7.32), `macro-looping.js`, `spec/08-coding-guidelines/engineering-standards.md`, `spec/02-app-issues/19-*.md`, `spec/02-app-issues/20-*.md`

---

## v7.10 (2026-02-25)

### Fixed
- **GetCurrentUrl activates DevTools window (Issue #19)** — Replaced generic `WinActivate` with `ActivateBrowserPage()`. Added `ClipWait` return value check.

### Added
- **Engineering Standard #17**: Always Use ActivateBrowserPage()
- **Engineering Standard #18**: ClipWait Must Check Return Value
- **Code Style Standards #19–#23** (small functions, small files, positive conditions, reuse, logging)
- **Anti-patterns table expanded** — generic WinActivate, negative conditions, large functions, copy-pasted code

### Files
- `MacroLoop/Routing.ahk` (v7.0 + v7.32), `spec/08-coding-guidelines/engineering-standards.md`, `spec/02-app-issues/19-*.md`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.45 (2026-02-23)

### Fixed
- **DevTools context injection bug (DOMAIN GUARD ABORT)** — Removed F12 from injection sequence. Now uses Ctrl+Shift+J ONLY. Added F6 after Ctrl+Shift+J to ensure cursor is in console input prompt.

### Added
- **🍪 From Cookie button** — New button in both combo.js and macro-looping.js bearer token UI that reads the `lovable-session-id.id` cookie, saves it to localStorage, verifies via `/user/workspaces` API, and triggers a full data refresh.

### Files
- `JsInject.ahk`, `Combo.ahk`, `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.35 (2026-02-23)

### Added
- **Cookie-based bearer token fallback** — When the bearer token in localStorage is missing or expired, the system now reads the `lovable-session-id.id` cookie as a fallback source. The cookie value is auto-saved to localStorage for future use.
- **`resolveToken()` unified function** — Token resolution chain: `config.ini` → `localStorage` → `lovable-session-id.id` cookie. All API call sites updated to use this single function.
- **Auto-recovery on 401/403** — Instead of immediately marking the token as expired, the system first checks if a valid cookie token exists. If found (and different from the stored one), it auto-saves and logs recovery. Only marks expired if no cookie fallback is available.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.34 (2026-02-23)

### Fixed
- **Post-move workspace name STILL resetting to perWs[0]** — Root cause: v7.9.32 removed XPath from the post-move handler itself, but `fetchLoopCredits()` / `checkCreditsViaApi()` (called 2s after move) still invoked `autoDetectCurrentWorkspace()` which ran XPath on a stale DOM and overwrote the authoritative name. Fix: added an **authoritative guard** at the top of both `autoDetectLoopCurrentWorkspace()` and `autoDetectCurrentWorkspace()` — if workspace was already set via API success (`state.workspaceFromApi=true` / `window.__wsCurrentName` matches a known workspace), XPath detection is skipped entirely.

### Engineering Rule
- **Post-mutation credit refreshes must NOT re-detect workspace** — the credit fetch path must respect the authoritative workspace state set by the mutation. XPath detection is only for initial detection or manual "Check" clicks, never for post-move refreshes.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.33 (2026-02-23)

### Fixed
- **Force move shortcuts unreachable in combo.js** — The Alt+Up/Down handler was placed after the `if (!isCtrlAlt) return;` guard, making it impossible to trigger. Moved force-move check before the guard.

### Changed
- **Combo shortcuts → Ctrl+Right/Left** — AHK combo hotkeys changed from Ctrl+Up/Down to Ctrl+Right (down) / Ctrl+Left (up) to free Up/Down for force move.
- **Force move shortcuts → Ctrl+Up/Down** — Changed from Alt+Up/Down (which didn't register in browser) to Ctrl+Up/Down. Both macro-looping.js and combo.js updated.
- **All tooltips and hint text updated** to reflect new shortcut assignments.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `HotkeyDefaults.ahk`, `config.ini`

---

## v7.9.32 (2026-02-23)

### Fixed
- **Post-move workspace name reset to perWs[0]** — Root cause: after a successful API move, the post-move XPath detection opened the project dialog before the page reflected the new workspace, causing the dialog to show the old workspace name, which failed validation and fell back to `perWs[0]`. Fix: removed post-move XPath detection entirely; the API success response already authoritatively sets `state.workspaceName`, so only a credit refresh is needed.

### Changed
- **Force move shortcuts changed to Alt+Up/Down** — Alt+Shift+Up/Down didn't register in the browser. Simplified to Alt+Up/Alt+Down. Tooltips updated.
- **Button click animation** — Force move buttons (⏫/⏬) now show a scale pulse animation on click for visual feedback.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.31 (2026-02-23)

### Changed
- **Post-move workspace sync** — After any successful `moveToWorkspace()`, both controllers now run XPath-based workspace detection to verify and sync the workspace name in the UI.
- **Force move shortcuts changed to Alt+Shift+Up/Down** — Avoids conflict with AHK hotkeys. Tooltips updated on ⏫/⏬ buttons.
- **Force move button padding** — Added +1px top padding (`5px 8px 4px` → `6px 8px 5px` combo, `5px 8px 4px` loop) for better visual centering.
- **Quick Paste Save on token expiry** — When bearer token expires (401/403), a "Paste Save" button appears next to the title for one-click clipboard paste + save.
- **Token verification after paste** — `pasteAndVerifyToken()` queries `/user/workspaces` to confirm token validity, then auto-detects workspace via XPath if valid.

### Files
- `macro-looping.js`, `combo.js`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.30 (2026-02-23)

### Changed
- **Removed mark-viewed API call** — `POST /projects/{id}/mark-viewed` removed from both controllers. It returned nothing useful (empty body). Workspace detection now uses XPath-only approach (Project Dialog click → read workspace name via `WorkspaceNameXPath`).
- **Check button detects workspace** — `runCheck()` in `macro-looping.js` now runs workspace detection via Project Dialog XPath before checking progress, ensuring project and workspace stay in sync.
- **Simplified detection hierarchy** — Now 3-tier: XPath Dialog → Default workspace → Guard flag. No API tier.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.29 (2026-02-23)

### Fixed
- **Bearer token expiry indicator scoped to controller** — `markBearerTokenExpired()` now targets token title by ID (`loop-bearer-title` / `combo-bearer-title`) instead of scanning all page `div` elements. The 🔴 EXPIRED label only appears within the controller's own Bearer Token header.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.28 (2026-02-23)

### Changed
- **Force Move buttons improved** — `macro-looping.js`: Changed `⬆ Move` / `⬇ Move` to `⏫ Move Up` / `⏬ Move Down` with descriptive tooltips including keyboard shortcut hints (Ctrl+Up/Down).
- **Workspace Focus button text** — `macro-looping.js`: Changed `📍` (icon-only) to `📍 Focus Current` with descriptive tooltip for clarity.
- **Force Move Up/Down buttons added to combo.js** — New `⏫` and `⏬` buttons flanking the Move Project button in the workspace move row, calling `moveToAdjacentWorkspaceCombo('up'/'down')`.

### Files
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.27 (2026-02-23)

### Added
- **Ctrl+Up/Down browser shortcuts** — Both controllers: pressing Ctrl+Up or Ctrl+Down (without Alt) triggers an instant API-based force move to the adjacent workspace. MacroLoop calls `forceSwitch()`, ComboSwitch calls `moveToAdjacentWorkspaceCombo()`. Added to both keydown handlers.
- **`moveToAdjacentWorkspaceCombo(direction)`** — New function in `combo.js` mirroring `moveToAdjacentWorkspace()` from `macro-looping.js`. Finds current workspace by exact/partial match, calculates adjacent index with wrap-around, and calls `moveToWorkspace()`.
- **📋 Paste & Save button** — Both controllers: new button in the bearer token section that reads the clipboard, pastes into the token input, and saves to localStorage in one click. Validates min 10 chars. Resets token expiry indicator on successful paste.
- **Bearer token expiry indicator** — On any 401 or 403 API response, the bearer token input gets a red border + glow, and the section title changes to "Bearer Token 🔴 EXPIRED — replace token!". Applied to `singleApiFetch` (combo), `autoDetectCurrentWorkspace` (combo), `autoDetectLoopCurrentWorkspace` (macro), `moveToWorkspace` (macro), and `runCycle` (macro).
- **`markBearerTokenExpired(controller)`** — New function in both controllers that marks the bearer token UI as expired (red border, red title label).

### Changed
- **runCycle fetch logging upgraded** — Now follows v7.9.24 comprehensive logging standard: logs URL, auth, response status, content-type, content-length, and body preview.
- **401/403 handling expanded** — All API fetch paths that previously only handled 401 now also handle 403 as a token expiry signal.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.26 (2026-02-23)

### Added
- **Tier 2 project dialog fallback in combo.js** — Ported the `detectWorkspaceViaProjectDialog` pattern from `macro-looping.js` to `combo.js` as `detectWorkspaceViaProjectDialogCombo`. When `mark-viewed` API (Tier 1) returns empty body, fails to parse, or returns unknown `workspace_id`, combo.js now clicks `ProjectButtonXPath` → reads `WorkspaceNameXPath` → validates against known workspaces → closes dialog. Replaces the unreliable `reverseWorkspaceLookupCombo` which scanned body text and often matched P01 incorrectly.
- **Two new config placeholders in combo.js** — `CREDIT_CFG.PROJECT_BUTTON_XPATH` (`__COMBO_PROJECT_BUTTON_XPATH__`) and `CREDIT_CFG.WORKSPACE_XPATH` (`__COMBO_WORKSPACE_XPATH__`) injected from the same `[MacroLoop.XPaths]` config.ini values via `Combo.ahk` `BuildComboJS()`.

### Removed
- **`reverseWorkspaceLookupCombo()`** — Replaced entirely by `detectWorkspaceViaProjectDialogCombo()`. The body-text scanning approach was unreliable (always matched P01 on pages with multiple workspace names visible).

### Detection Hierarchy (Combo.js — now matches MacroLoop)
1. **Tier 1 — API**: `POST /projects/{id}/mark-viewed` → `workspace_id` → `wsById` dictionary
2. **Tier 2 — Project Dialog DOM**: Click `ProjectButtonXPath` → read `WorkspaceNameXPath` → validate → close dialog
3. **Tier 3 — Default**: First workspace in `perWorkspace` (last resort only)

### Files
- `combo.js`, `Includes/Combo.ahk`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.25 (2026-02-23)

### Fixed
- **Workspace detection: Project Dialog fallback (Tier 2)** — When `mark-viewed` API returns empty body (Tier 1 fails), the script now **clicks the Project Button** (`ProjectButtonXPath`) to open the project dialog, then reads the workspace name from `WorkspaceNameXPath` (`/html/body/div[6]/div/div[2]/div[1]/p`). This replaces the broken `reverseWorkspaceLookup` which scanned body text and always defaulted to P01.
- **fetchLoopCredits now follows v7.9.24 logging standard** — Uses `resp.text()` + `JSON.parse()` instead of `resp.json()`, logs full URL, auth, headers, status, content-type, content-length, and body preview.

### Detection Hierarchy
1. **Tier 1 — API**: `POST /projects/{id}/mark-viewed` → extract `workspace_id` → match in `wsById` dictionary
2. **Tier 2 — Project Dialog DOM**: Click `ProjectButtonXPath` → wait for dialog → read `WorkspaceNameXPath` → validate against known workspaces → close dialog
3. **Tier 3 — Default**: First workspace in `perWorkspace` (last resort only)

### Files
- `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`, `Automator.ahk`
- `spec/06-macro-controller/workspace-detection.md`

---

## v7.9.24 (2026-02-23)

### Fixed
- **Comprehensive fetch logging on ALL API calls** — Every `fetch()` now logs: full URL, auth method, sanitized bearer token (12 chars + REDACTED), request headers, request body, response status, statusText, content-type, content-length, and body preview (first 200 chars). Applied to mark-viewed, credit fetch, and move-to-workspace in both `macro-looping.js` and `combo.js`.
- **Error response body logging** — Non-2xx responses now log the error body (first 500 chars) instead of just the status code.
- **Empty body handling improved logging** — When mark-viewed returns empty body, logs now include status code and content-type for diagnostic clarity.

### Added
- **Issue #07 RCA document** — `spec/02-app-issues/07-mark-viewed-empty-body-vague-logging.md` documenting the empty body root cause and the new logging standard.

### Engineering Standards
- **Rule**: Every `fetch()` MUST use `resp.text()` + `JSON.parse()`, never `resp.json()` directly.
- **Rule**: Every `fetch()` MUST log URL, auth, headers, status, content-type, content-length, and body preview.
- **Rule**: Bearer tokens in logs MUST be sanitized: first 12 chars + `...REDACTED`.

### Files
- `macro-looping.js`, `combo.js`, `GeneralDefaults.ahk`, `config.ini`
- `spec/02-app-issues/07-mark-viewed-empty-body-vague-logging.md`

---

## v7.9.22 (2026-02-23)

### Fixed
- **workspaceFromApi guard was never activated** — `state.workspaceFromApi` was defined in v7.9.16 but never set to `true`, allowing DOM observers (MutationObserver, fetchWorkspaceName, fetchWorkspaceNameFromNav) to overwrite the API-detected workspace name with whatever the nav element showed (always the first workspace P01).
- **All 4 DOM workspace setter paths now guarded** — `fetchWorkspaceName`, `fetchWorkspaceNameFromNav`, observer init, and MutationObserver callback all check `state.workspaceFromApi` before overwriting.
- **mark-viewed response parsing hardened** — Now tries `data.workspace_id`, `data.project.workspace_id`, and `data.workspaceId` paths. Dumps raw JSON response and wsById keys in activity log for diagnostics.

### Added
- **`window.__loopDiag()` diagnostic function** — Dumps full detection state (workspaceName, workspaceFromApi, currentWsId, wsById keys, all workspace names/IDs) to activity log and JS console. Callable from JS Executor.
- **Comprehensive debug logging** — mark-viewed raw response, wsById keys before lookup, response keys on failure.

### Files
- `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`, `Automator.ahk`

---

## v7.9.20 (2026-02-23)

### Fixed
- **Workspace detection: replaced broken GET with POST mark-viewed** — `GET /projects/{id}` returns HTTP 405. Now uses `POST /projects/{id}/mark-viewed` which reliably returns `workspace_id`. Applied to both `combo.js` and `macro-looping.js`.
- **O(1) workspace lookup via wsById dictionary** — After parsing workspaces, a `wsById` dictionary (keyed by workspace ID) is built for instant lookup instead of linear array scan.
- **Correct workspace now displayed** — The status bar, progress bar, and credit data reflect the actual workspace (e.g., P16/P20) instead of always defaulting to P01.

### Files
- `combo.js`, `macro-looping.js`

---

## v7.9.19 (2026-02-23)

### Fixed
- **Workspace detection 405 failure** — `GET /projects/{id}` returns HTTP 405 (Method Not Allowed). Added DOM-based fallback: reads workspace name from nav element and matches against loaded workspace list. Applied to both `macro-looping.js` and `combo.js`.
- **Blind default to first workspace** — `parseLoopApiResponse` no longer sets `currentWs = perWs[0]` unconditionally. Now only sets it if `state.workspaceName` already matches a known workspace.
- **All fallback paths use DOM detection** — No workspace_id, unmatched workspace_id, and API failure paths all use `detectWorkspaceFromDom()` instead of blindly defaulting to `perWs[0]`.

### Files
- `combo.js`, `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`, `Automator.ahk`

---

## v7.9.18 (2026-02-22)

### Fixed
- **Progress bar missing granted credits segment** — Added 🎁 `freeRemaining` (orange) segment to progress bars in both combo.js and macro-looping.js. Previously only showed 💰 Billing + 🔄 Rollover + 📅 Daily, missing the `credits_granted` portion. This caused the bar to show e.g. 32/289 filled when available was actually 132/289.
- **Workspace name fallback validation** — `autoDetectLoopCurrentWorkspace` fallback paths now validate existing `state.workspaceName` via `isKnownWorkspaceName()`. Prevents garbage names (e.g., "Preview") from persisting when the API can't determine workspace_id.

### Files
- `combo.js`, `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`, `Automator.ahk`

---

## v7.9.17 (2026-02-22)

### Fixed
- **Top-level status bar credit display** — Now uses the same `calcTotalCredits` / `calcAvailableCredits` formulas and visual style (12px bar, reddish used background, `⚡available/total` format) as workspace items. Previously used old logic that summed available portions as "total" and had a smaller 6px bar with different styling.

### Files
- `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`, `Automator.ahk`

---

## v7.9.16 (2026-02-22)

### Fixed
- **Workspace name detection fix** — DOM observer and auto-discovery now validate discovered names against the known workspace list (`isKnownWorkspaceName()`). Prevents the project name (e.g., "macro-ahk") from being incorrectly displayed as the workspace name in the MacroLoop status bar. API-detected workspace names remain authoritative.

### Files
- `macro-looping.js`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.15 (2026-02-22)

### Fixed
- **Credit formulas corrected** — Total Credits = `credits_granted + daily_credits_limit + billing_period_credits_limit + topup_credits_limit + rollover_credits_limit`. Available Credit = `Total Credits - rollover_credits_used - daily_credits_used - billing_period_credits_used`. Free Credit Available = `daily_credits_limit - daily_credits_used`.
- **Extracted shared helper functions** — `calcTotalCredits()`, `calcAvailableCredits()`, `calcFreeCreditAvailable()` added to both controllers to eliminate duplicated formula logic.
- **Tooltips & progress bars updated** — Now show correct Total Credits and Available breakdown.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`, `JSON-schema.md`

---

## v7.9.14 (2026-02-22)

### Fixed
- **Total capacity formula** — Added missing `rollover_credits_limit` to formula. Now: `credits_granted + daily_credits_limit + total_credits_used_in_billing_period + topup_credits_limit + rollover_credits_limit`. For P02 JSON: `10 + 5 + 172 + 0 + 100 = 287`.
- **Progress bar widened** — Combo bar `max-width` 240px→300px (min 120px), macro bar 200px→260px (min 100px).
- **Version bump** — Synchronized to `7.9.14`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.13 (2026-02-22)

### Fixed
- **Total capacity formula** — Was using `billing_period_credits_used` (often 0) instead of `total_credits_used_in_billing_period` (e.g., 171.5), causing absurdly small denominators (e.g., ⚡95/20 instead of ⚡120/187). Now parses `total_credits_used_in_billing_period` from the API and stores it as `totalUsedInBilling` in both controllers.
- **Tooltip shows total capacity breakdown** — Added `⚡ Total Capacity` line to hover tooltips in both controllers showing the formula components (granted + daily + billingUsed + topup).
- **Version bump** — Synchronized to `7.9.13`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.12 (2026-02-22)

### Changed
- **Progress bar width increased** — Combo bar `max-width` from 180px→240px, macro bar from 140px→200px for better readability.
- **Credit labels clarified** — `⚡` now shows available as bold cyan number, with total capacity as smaller dimmed `/N` suffix instead of the confusing `available/total` format.
- **Tooltip text improved** — `⚡` tooltip now reads "Total Available (sum of all credit types)" instead of "Available / Total capacity".
- **Version bump** — Synchronized to `7.9.12`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.11 (2026-02-22)

### Added
- **Macro controller workspace tooltips** — Added rich hover tooltips to workspace items in the MacroLoop controller, matching combo.js parity. Tooltips display calculated metrics (Daily Free, Rollover, Available, Billing Only) and raw API data (ID, usage, subscription status, role, trial info). Added `used`, `dailyUsed`, `rolloverUsed`, `subscriptionStatus`, and `role` fields to parsed workspace data.
- **Version bump** — Synchronized to `7.9.11`.

### Files
- `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.10 (2026-02-22)

### Changed
- **Progress bar visual overhaul** — Bar height increased to 14px (combo) / 12px (macro) for better visibility. Font size increased to 10px. Background now shows a reddish tint (`rgba(239,68,68,0.25)`) representing used/consumed credits, so unfilled portion is clearly distinguishable from available credits. Added inset shadow for depth. Tooltips on each emoji now explain what each credit type means (e.g., "💰 Billing = credits remaining in billing period").
- **Version bump** — Synchronized to `7.9.10`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.9 (2026-02-22)

### Changed
- **Total credits formula updated** — Progress bar total capacity now uses: `credits_granted + daily_credits_limit + billing_period_credits_used + topup_credits_limit`. Both `combo.js` and `macro-looping.js` updated. `topup_credits_limit` field now parsed from API response and stored per workspace.
- **Version bump** — Synchronized to `7.9.9`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.8 (2026-02-22)

### Added
- **JS Execution History (MacroLoop)** — Ported from combo.js: history array (max 20 entries), ArrowUp/Down keyboard recall in textbox, click-to-recall history panel. Both controllers now have full JS history parity.
- **DevTools injection failure detection (S-009)** — `VerifyInjectionSuccess()` in `JsInject.ahk` checks if injection ran in DevTools context. Tracks consecutive failures and shows TrayTip notification after 3 failures with recovery instructions.
- **Double-click workspace move** — Both controllers: double-clicking a workspace item immediately calls `moveToWorkspace()` via API with full UI sync.
- **Advanced workspace filters** — Rollover (🔄), Billing (💰), and Min Credits (⚡) filter controls added alongside existing Free Only (🆓).
- **Icon legend** — Compact legend explaining emoji meanings in both controllers.

### Changed
- **Progress bar redesign** — Full bar = total capacity. Segments show available as proportion of total. Increased height, gradient fills, tooltips. Shows `available/totalCapacity`.
- **Version bump** — Synchronized to `7.9.8`.

### Files
- `macro-looping.js`, `combo.js`, `JsInject.ahk`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.7 (2026-02-21)

### Changed
- **Delegation replaced by direct API move** — MacroLoop no longer delegates workspace switching to AHK (no tab switching, clipboard signals, or title markers). New `performDirectMove(direction)` in `macro-looping.js` calls `moveToAdjacentWorkspace()` (PUT `/move-to-workspace`) directly. Both the loop cycle's "no free credit" path and `forceSwitch()` now use this simplified flow.
- **AHK clipboard polling removed** — `ToggleMacroLoop` no longer starts the 500ms `CheckClipboardForDelegate` timer. JS handles all workspace moves via API.
- **Version bump** — Synchronized to `7.9.7`.

### Deprecated
- **`Delegate.ahk`** — Entire 8-step HandleDelegate flow (tab search, controller check, combo injection, title polling, tab return).
- **`SignalPoll.ahk`** — Clipboard & title signal polling for delegation.
- **`TabSearch.ahk`** — Tab identification from window titles (only used by HandleDelegate).
- **`ForceDelegateLog.ahk`** — Dedicated force_delegate.log logging (only used by HandleDelegate).
- **`dispatchDelegateSignal()`** in `macro-looping.js` — Title/clipboard signaling to AHK.
- **`delegateComplete()`** in `macro-looping.js` — AHK callback after delegation (kept for backward compatibility).

### Files
- `macro-looping.js`, `Lifecycle.ahk`, `Delegate.ahk`, `SignalPoll.ahk`, `TabSearch.ahk`, `ForceDelegateLog.ahk`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.6 (2026-02-21)

### Changed
- **Available credits formula** — Updated to include free trial/granted credits: `available = (credits_granted - credits_used) + (billing_period_credits_limit + rollover_credits_limit - rollover_credits_used - billing_period_credits_used)`. Both `combo.js` and `macro-looping.js` now parse `credits_granted` and `credits_used` from the API response.
- **MacroLoop credit parity** — `macro-looping.js` now tracks `freeGranted`, `freeRemaining`, and `hasFree` per workspace (previously only in `combo.js`).
- **Version bump** — `AHK_BUILD_VERSION`, `GeneralDefaults.SCRIPT_VERSION`, and `config.ini ScriptVersion` synchronized to `7.9.6`.

### Files
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`

---

## v7.9.2 (2026-02-21)

### Fixed
- **Workspace state clobber bug** — `autoDetectCurrentWorkspace()` in both `combo.js` and `macro-looping.js` unconditionally overwrote `__wsCurrentName`/`state.workspaceName` with `perWs[0]` (first workspace) on any API failure or mismatch. This caused the header, NOW line, and CURRENT marker to revert to P01 ~2 seconds after a successful switch/move. Fixed all 6 fallback paths (3 per controller) to preserve existing known-good state. See `specs/spec-issues-v7.9-workspace-state-clobber.md`.

### Files
- `combo.js`, `macro-looping.js`, `specs/spec-issues-v7.9-workspace-state-clobber.md`

---

## v7.9.1 (2026-02-21)

### Added
- **`ClickPageContent()` execution context anchoring** — New function in `JsInject.ahk` that clicks in the browser's upper 1/3 area + `WinActivate` after F12 close but before Ctrl+Shift+J reopen. Ensures Console targets the page document, not the DevTools frame.
- **`PageClickDelayMs` config** — New timing parameter in `[AHK.Timing]` section of `config.ini` (default 100ms). Controls the delay after the page-anchoring click for slower machines.
- **Full move API request logging** — `moveToWorkspace()` in `macro-looping.js` now logs complete request details before sending: URL, request body (`{workspace_id: ...}`), sanitized bearer token (first 12 + last 4 chars), projectId, and headers. On failure, logs the same details again for easy copy-paste debugging.
- **Workspace ID in parsed data** — `parseLoopApiResponse()` now includes `id` field from the API response in each parsed workspace object. Previously missing, causing `data-ws-id="undefined"` in the workspace list.

### Fixed
- **ClickPageContent coordinate bug** — Previous implementation (v7.9.0) clicked at lower 2/3 of window (`winH * 2 // 3`), which landed directly ON bottom-docked DevTools panel. Changed to upper 1/3 (`Max(100, winH // 3)`). Root cause of persistent `[ComboSwitch] DOMAIN GUARD ABORT (hostname: devtools)` errors.
- **Current workspace matching resilience** — `moveToAdjacentWorkspace()` in `macro-looping.js` now tries partial/case-insensitive matching as fallback when exact match fails, and defaults to first workspace instead of aborting with error.
- **Credit bar order** — Reordered stacked credit bars in both `combo.js` and `macro-looping.js`: 💰 Billing (green) → 🔄 Rollover (purple) → 📅 Daily Free (yellow). Previously yellow was first; now yellow (daily free) is last as it depletes first.

### Changed
- **Credit bar label order** — Inline emoji labels now display as: `💰billing 🔄rollover 📅dailyFree ⚡total` (matching the visual bar order).

### Files
- `JsInject.ahk`, `macro-looping.js`, `combo.js`, `config.ini`, `Config/Constants/TimingKeys.ahk`, `Config/Constants/TimingDefaults.ahk`, `Config/AhkTiming.ahk`

---

## v7.8 (2026-02-21)

### Added
- **`InjectJSQuick()`** — New lightweight injection function in `JsInject.ahk` that pastes+executes JS directly without the F12/Ctrl+Shift+J DevTools toggle. Used for consecutive calls within the same batch when Console is already focused.
- **Domain guard in `macro-looping.js`** — Validates hostname before execution, preventing injection into DevTools context. Logs hostname, href, expected domains, and cause on abort.
- **Idempotent init in `macro-looping.js`** — Checks for existing script marker and returns immediately if already embedded, preserving UI and in-memory state (loop status, history, credits). No teardown-and-replace.

### Fixed
- **DevTools focus thrashing in `RunCombo`** — Previously made 6 separate `InjectJS` calls, each closing+reopening DevTools (F12 → Ctrl+Shift+J). After 5 rapid cycles, Chrome lost page context and scripts executed in DevTools document (`hostname=devtools`). Now reduced to 3 calls (1 full + 2 quick).
- **DevTools toggling in `EmbedMacroLoopScript`** — `macro-looping.js` injection now uses `InjectJSQuick` since Console is already focused from the preceding `xpath-utils.js` injection. Reduced from 2 full toggles to 1.
- **Self-cleaning title markers** — DOM check and XPathUtils verification JS snippets auto-clean via `setTimeout(2000)`, eliminating separate cleanup `InjectJS` calls.
- **Improved domain guard logging in `combo.js`** — Now logs hostname, href, expected domains, and cause analysis when aborting.

### Changed
- **Version bump** — `AHK_BUILD_VERSION`, `GeneralDefaults.SCRIPT_VERSION`, and `config.ini ScriptVersion` synchronized to `7.8`.

---

## v7.7 (2026-02-21)

### Added
- **Rollover credits support** — New `rollover_credits_limit` and `rollover_credits_used` fields consumed from `GET /user/workspaces` API response.
- **Three stacked progress bars** — Vertical stack in workspace list, NOW section, and credit summary header:
  - 🟡 **Yellow** — Daily Free credits (`daily_credits_limit - daily_credits_used`).
  - 🟣 **Purple** — Rollover credits (`rollover_credits_limit - rollover_credits_used`).
  - 🟢 **Green** — Billing Period credits (`billing_period_credits_limit - billing_period_credits_used`).
- **Updated Available formula** — `Available = billing_period_credits_limit + rollover_credits_limit - rollover_credits_used - billing_period_credits_used`.
- **Enhanced tooltips** — Full mathematical breakdown showing rollover raw data and calculated values on hover.
- **MacroLoop credit API integration** — `macro-looping.js` now fetches credit data via API independently, with three-bar display (yellow/purple/green) in the status section, 💳 refresh button, and auto-fetch on initialization.

### Changed
- **Credit consumption priority** — Daily Free → Rollover → Billing Period (billing credits used last).

---

## v7.6 (2026-02-21)

### Added
- **`specs/JSON-schema.md`** — Comprehensive data reference documenting API response schema (`GET /user/workspaces`), internal combo.js data models (`creditState`, `perWorkspace[]`, `comboHistory[]`, `jsHistory[]`), all `config.ini` sections with types/defaults, and the full placeholder injection map.
- **`specs/CHANGELOG.md`** — This file; centralizes all version history.
- **Export Compiled JS** — Tray menu entries ("Export combo.js", "Export macro-looping.js") that resolve all `__PLACEHOLDER__` tokens from config.ini, save the compiled JS to `logs/compiled-<name>.js` with a metadata header, and copy to clipboard for easy paste-into-DevTools debugging.
- **`Includes/ExportCompiledJS.ahk`** — Generic `SaveCompiledJS(scriptName, compiledJs, sourceFile)` utility + per-script `ExportComboJS()` / `ExportMacroLoopJS()` wrappers.
- **`BuildComboJS(direction)`** in Combo.ahk and **`BuildMacroLoopJS()`** in MacroLoop/Embed.ahk — Extracted placeholder-resolution logic into reusable builder functions shared by both injection and export paths.

### Fixed
- **DevTools Console tab focus** — Changed subsequent-call injection from `F6` (address bar focus) to `Ctrl+Shift+J` (Console panel switch). Ensures Console is focused even when DevTools is open on Elements/Network/etc. tab.
- **Toggle-close recovery** — Added mandatory `F12` (close) → `Sleep 300ms` → `Ctrl+Shift+J` (reopen) sequence for subsequent injections. Prevents the toggle-close bug where `Ctrl+Shift+J` would close DevTools if the Console tab was already active. The F12 reset guarantees a clean closed state before reopening.

### Changed
- Version bump from 7.5.3 → 7.6 across `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`.
- **Expanded testing checklist** — Added "DevTools Console Focus (v7.6)" section to `MEMORY.md` with 7 manual test scenarios covering all DevTools tabs (Elements, Network, Sources, Console), rapid double-press, and manual close recovery.

---

## v7.5.3 (2026-02-21)

### Added
- **Yellow daily free credits bar** — Dedicated `THEME.YELLOW` progress bar showing `dailyFree / dailyLimit`.
- **Free Only filter** — "🆓 Free Only" toggle in workspace list header filters to workspaces with `dailyFree > 0`.

### Fixed
- **Inverted progress bars** — Main bar now shows **available/remaining** credits (green fill) instead of consumed credits.
- **Focus Current button** — Enhanced 🎯 logic with fallback scroll and auto credit-check when workspace name is missing.
- **Credit display accuracy** — Confirmed formulas: `dailyFree = daily_credits_limit - daily_credits_used`, `available = billing_period_credits_limit - billing_period_credits_used`.

### Changed
- **Consolidated project name** — Removed standalone `#ahk-project-name`; merged into NOW section. Up/Down buttons on same line as workspace name.

---

## v7.5.2 (2026-02-21)

### Added
- **DOM-first project name detection** — New XPath (`ProjectNameXPath`) scrapes project name from page before falling back to API/title.
- **Rich hover tooltips** — `buildTooltipText(ws)` provides native tooltip with calculated metrics and raw JSON on workspace hover.

### Changed
- **`var` → `const`/`let` migration** — 120+ declarations converted across combo.js (JS Executor, token management, XPath tester, credit system, UI lifecycle, ComboSwitch steps).
- **THEME/FONT constants** — All hardcoded color strings replaced with `THEME.*` and `FONT.*` references.

### Files
- `config.ini`, `ComboKeys.ahk`, `ComboSwitch.ahk`, `Combo.ahk`, `combo.js`

---

## v7.5 (2026-02-20)

### Changed
- **DevTools reuse optimization** — Subsequent injections use `F6` re-focus instead of close/reopen cycle, saving ~300ms per injection.
- **Refocus delay** — Configurable `refocusDelayMs` (default 200ms) for subsequent calls.

### Files
- `JsInject.ahk`

---

## v7.4 (2026-02-19)

### Added
- **Force Delegate logging** — `ForceDelegateLog.ahk` for detailed tab-search and delegation tracing.
- **Spec issues tracker** — `spec-issues-v7.4.md` for known issues.

---

## v7.1 (2026-02-19)

### Added
- **Modular Config architecture** — Split monolithic `Config.ahk` into sub-modules:
  - `Config/AhkTiming.ahk`, `Config/ComboSwitch.ahk`, `Config/General.ahk`, `Config/Gmail.ahk`, etc.
- **Constants system** — Dedicated `Constants/` folder with enums: `AuthMode`, `LogLevel`, `ProgressStatus`, `Sections`, and per-section keys/defaults.
- **Config validation** — `Config/Validate.ahk` for startup config integrity checks.
- **Config watcher** — `Config/Watcher.ahk` polls `config.ini` for hot-reload.

---

## v7.0 (2026-02-18)

### Added
- **MacroLoop modular architecture** — Split into sub-modules: `Delegate.ahk`, `Embed.ahk`, `Globals.ahk`, `Helpers.ahk`, `Lifecycle.ahk`, `Routing.ahk`, `SignalPoll.ahk`, `TabSearch.ahk`.
- **Force delegate flow** — 8-step tab-search-or-create process for reliable cross-tab delegation.
- **Signal polling** — Clipboard-based async communication between JS and AHK using `ProgressStatus` enums.

---

## v5.2 (2026-02-18)

### Added
- **Three-tier fast path** — sessionStorage self-healing: Direct call → sessionStorage recovery → full injection.
- **Title-marker signaling** — `__AHK_REINJECT__`, `__AHK_RECOVERED__`, `__AHK_NO_CACHE__` for JS→AHK state communication.
- **Exponential backoff** — `checkCreditsViaApi()` retries with `RetryBackoffMs * 2^attempt` before DOM fallback.
- **Visual retry indicator** — Yellow "Retrying (X/Y)..." in credit display during backoff.
- **MutationObserver UI persistence** — Panels survive SPA navigation and React re-renders (500ms debounce).
- **JS Command History** — Last 20 commands with Up/Down arrow navigation and click-to-recall.
- **Config hot-reload** — `StartConfigWatcher()` polls file modification timestamp.

---

## v4.9 (2026-02-17)

### Added
- **Comprehensive logging** — Every action logged BEFORE executing; `GetCallerInfo()`, `SubLog()`, `LogKeyPress()` in Utils.ahk.
- **Robust Transfer button detection** — `findTransferButton()` with 4-method fallback: XPath → text scan → heading proximity → ARIA labels.
- **Floating/draggable panels** — Both ComboSwitch and MacroLoop panels are draggable with grab-handle header.
- **Hide/minimize** — `[-]` minimizes, `[+]` expands, `[x]` hides, `Ctrl+Alt+H` restores.
- **MacroLoop keyboard shortcuts** — `Ctrl+Alt+Up/Down` toggle, `Ctrl+Alt+H` show/hide.
- **Fresh logs on startup** — `logs/` folder cleared and recreated on each launch.

### Changed
- **Boolean naming convention** — All boolean vars use `is`/`has` prefix; no `not` in conditions.
- **WARNING comments** — Added to every function that sends keyboard shortcuts or calls external processes.

### Files
- `Utils.ahk`, `Config.ahk`, `JsInject.ahk`, `Combo.ahk`, `MacroLoop.ahk`, `Automator.ahk`, `combo.js`, `macro-looping.js`, `Gmail.ahk`, `AutoLoop.ahk`
