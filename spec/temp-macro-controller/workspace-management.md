# 07 — Workspace Management Specification

**Version**: v7.17
**Last Updated**: 2026-02-25

---

## Workspace Detection (v7.17 — XPath + CSS Self-Healing)

The mark-viewed API (formerly Tier 1) was **removed in v7.17**. Detection is now 3-tier:

### Tier 1 — Project Dialog DOM via XPath (Primary)
1. Click `ProjectButtonXPath` to open project dialog
2. Wait up to 1500ms for dialog to render
3. Read workspace name from `WorkspaceNameXPath` (uses `getAllByXPath` + iterate-and-validate since v7.10.2)
4. Validate against known workspaces via `isKnownWorkspaceName()`
5. Close dialog

### Tier 2 — CSS Selector Fallback (S-012, Self-Healing)
If `WorkspaceNameXPath` returns no results after 1500ms:
1. Try 10 CSS selectors against the open dialog (e.g., `[data-testid*="workspace"]`, `[role="dialog"] h2`, `[data-radix-popper-content-wrapper] span`)
2. Each selector is logged with index and result (✅/❌)
3. Found text is validated against known workspace names (exact + partial match)
4. **Warning logged**: "⚠️ Workspace detected via CSS fallback — consider updating WorkspaceNameXPath"
5. Close dialog

### Tier 3 — Default
Fall back to `perWorkspace[0]` (first workspace). Last resort only.

### Detection Without Credit API
If the credit API returns 401/403 (expired token), detection still works:
- `runCheck()` calls `doXPathDetect([])` with an empty workspace list
- The workspace name is still read from the dialog XPath
- The UI shows "Bearer Token 🔴 EXPIRED" with recovery buttons

---

## Controller Injection Sequence (Step 0)

Before any dialog interaction, the controller verifies:
1. Script marker element exists in DOM
2. `window.__loopStart` function is defined
3. UI container is appended at `CONFIG.CONTROLS_XPATH`

If Step 0 fails after 5 retries, falls back to `document.body`.

**Current XPath**: `/html/body/div[3]/div/div[2]/main/div/div/div[3]`

---

## Check Button — XPath-Only Detection (v7.17)

The **Check** button (`runCheck()`) performs pure XPath-based detection:

1. Clear `state.workspaceName` to force fresh detection
2. If no workspaces loaded, attempt credit fetch (but proceed to XPath regardless of API result)
3. Click `ProjectButtonXPath` to open project dialog
4. Poll `WorkspaceNameXPath` for workspace name
5. Validate against known workspaces (if available)
6. Check progress bar XPath for busy/idle status
7. Update UI via `syncCreditStateFromApi()` + `updateUI()`

**Guard**: Only executable when loop is stopped OR countdown ≤ 10 seconds.

**No `mark-viewed` API call. No `workspaceFromApi` flag.** The Check button is a pure DOM operation.

---

## Token Expiry Handling (v7.17)

When the credit API (`GET /user/workspaces`) returns 401 or 403:
1. `markBearerTokenExpired('loop')` is called immediately
2. Bearer token input border turns red with glow
3. Title shows: "Bearer Token 🔴 EXPIRED — replace token!"
4. Two recovery buttons injected: "Paste Save" and "🍪 Cookie"
5. Detection continues via XPath regardless

---

## Critical Rules

### DOM Validation
Any name from DOM scraping MUST be validated against the known workspace list before setting state. Invalid names (project names, nav text, "Preview") are silently discarded.

### Authoritative Guard
After a successful API move, `state.workspaceFromApi = true` prevents DOM observers from overwriting the authoritative workspace name.

### Post-Mutation No Re-Detect
After `moveToWorkspace()` succeeds via API, do NOT run DOM-based workspace detection. The API response authoritatively sets the workspace. Only a credit refresh follows.

---

## Workspace Switching

### Manual Move
- **Double-click** workspace item → immediate API move + full UI sync
- **Move button** → move to selected workspace
- **Force move buttons** (⏫/⏬) or **Ctrl+Up/Down** → move to adjacent workspace

### Smart Switching (v7.9.40)
`moveToAdjacentWorkspace()`:
1. Fetches fresh workspace data from `/user/workspaces`
2. Walks in requested direction (up/down)
3. Finds first workspace with `dailyFree > 0`
4. Skips depleted workspaces
5. Falls back to immediate neighbor if all depleted
6. Falls back to cached data if API fetch fails

### Auto-Move (MacroLoop)
`runCycle()` checks `dailyFree` every `LoopIntervalMs` (default 100s). If `dailyFree == 0`, triggers `performDirectMove()` which calls `moveToAdjacentWorkspace()`.

---

## Workspace History

Project-scoped history stored in `localStorage`:
- Key: `ml_workspace_history_{projectId}`
- Entries: `{ time, from, to, projectName, projectId }`
- Updated on every successful `moveToWorkspace()`

---

## Workspace Count Label

The "🏢 Workspaces" header dynamically shows:
- `Workspaces (42)` — no filter active, showing total
- `Workspaces (5/42)` — filter active, showing filtered/total

Updates on: search input, Free Only toggle, Rollover filter, Billing filter.

---

## Keyboard Shortcuts

| Shortcut | Controller | Action |
|----------|-----------|--------|
| Ctrl+Up | Both | Force move to previous workspace |
| Ctrl+Down | Both | Force move to next workspace |
| Ctrl+Left | AHK | ComboSwitch up (settings page) |
| Ctrl+Right | AHK | ComboSwitch down (settings page) |
| Arrow Up/Down | In search input | Navigate workspace list |
| Enter | In search input | Move to selected workspace |
| Double-click | Workspace item | Immediate API move |
