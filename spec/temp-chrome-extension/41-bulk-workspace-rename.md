# 41 — Bulk Workspace Rename

**Version**: v1.0  
**Date**: 2026-03-13  
**Status**: Draft  

---

## 1. Overview

Adds the ability to rename one or more workspaces directly from the MacroLoop workspace list panel. Supports single right-click rename, multi-select with checkboxes (including Shift+Click range selection), and a bulk rename dialog with template-based naming (prefix, suffix, and sequential numbering).

---

## 2. API Endpoint

### PUT `/user/workspaces/{workspaceId}`

**Base URL**: `CREDIT_API_BASE` (same as existing credit/move endpoints — `https://api.lovable.dev`)

**Auth**: Bearer token via `resolveToken()` (same chain as existing API calls: localStorage session bridge → cookie fallback). On 401/403 with bearer, retry with cookies only + `markBearerTokenExpired()`.

**Request**:
```http
PUT /user/workspaces/{workspaceId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "New Workspace Name",
  "default_monthly_member_credit_limit": -1
}
```

> **Note**: The `default_monthly_member_credit_limit: -1` field is **required** for non-pro workspaces. Without it, the rename request may fail. Including it for pro workspaces is harmless, so it is always sent.

**Response**: 200 OK on success.

**Error handling**: Same pattern as `moveToWorkspace()` — log status, retry on 401/403 without bearer, display error in status UI.

---

## 3. Selection Model

### 3.1 Checkbox per workspace row

Each workspace row in the `loop-ws-list` gets a checkbox element (left side, before the emoji).

- **Single click** on checkbox: toggles that workspace's checked state.
- **Click on row** (not checkbox): existing behavior (navigate/select workspace). No change.
- **Shift+Click** on checkbox: range-select all workspaces between the last-checked checkbox and this one (inclusive). Standard file-manager behavior.

### 3.2 Selection state

```javascript
var loopWsCheckedIds = {};  // { [workspaceId]: true }
var loopWsLastCheckedIdx = -1;  // index of last checkbox click (for Shift range)
```

### 3.3 Select All / Deselect All

A small "☑ All" / "☐ None" toggle button in the workspace dropdown header row (next to existing filter buttons).

### 3.4 Selection count badge

Display count of selected workspaces: e.g., `"3 selected"` — shown next to the workspace count label.

---

## 4. Single Rename (Right-Click)

Right-clicking a workspace row shows a minimal context menu (absolutely positioned div) with:

- **Rename** — opens an inline text input replacing the workspace name, pre-filled with current name. Enter to confirm, Escape to cancel.

### 4.1 Single rename flow

1. User right-clicks row → context menu appears
2. User clicks "Rename" → name text becomes an `<input>` with current value
3. User edits and presses Enter → `PUT /user/workspaces/{id}` with `{ "name": newName }`
4. On success → update `loopCreditState.perWorkspace[i].fullName` and `.name` locally, re-render row
5. After rename completes → `fetchLoopCredits()` to refresh all data from API

---

## 5. Bulk Rename Dialog

### 5.1 Trigger

A **"✏️ Rename"** button appears in the workspace dropdown header when `Object.keys(loopWsCheckedIds).length > 0`. Clicking it opens the Bulk Rename dialog.

### 5.2 Dialog UI

A floating div (same styling pattern as existing dialogs in the MacroLoop panel) containing:

| Field | Type | Description |
|-------|------|-------------|
| **Prefix** | Text input + checkbox | If checked, prepend this text to every workspace name |
| **Suffix** | Text input + checkbox | If checked, append this text to every workspace name |
| **Template** | Text input | Full name template. The `$` placeholder is used for sequential numbering. The number of `$` signs determines zero-padding width. |
| **Start Number** | Number input | Starting number for the sequence (default: 1) |
| **Preview** | Read-only list | Shows what each selected workspace will be renamed to |
| **Apply** | Button | Executes the rename |
| **Cancel** | Button | Closes dialog |

### 5.3 Template Format

The template field uses `$` characters as a sequential number placeholder:

| Template | Start | Count=3 | Output |
|----------|-------|---------|--------|
| `P$$` | 1 | 3 | `P01`, `P02`, `P03` |
| `TEXT$$$` | 5 | 3 | `TEXT005`, `TEXT006`, `TEXT007` |
| `ws-$$$$` | 10 | 2 | `ws-0010`, `ws-0011` |
| `Dev $` | 1 | 3 | `Dev 1`, `Dev 2`, `Dev 3` |

**Rules**:
- Find the **first contiguous run** of `$` characters in the template.
- The **length** of that run = zero-pad width.
- Replace that run with the zero-padded sequence number.
- If no `$` found → template is used as-is for all (no numbering).
- Template is case-sensitive — user controls casing.

### 5.4 Prefix + Suffix + Template interaction

All three can be active simultaneously:

```
finalName = [prefix] + templateResult + [suffix]
```

Example: prefix=`"Team-"`, template=`"P$$"`, suffix=`" Dev"`, start=1, count=3 →  
`Team-P01 Dev`, `Team-P02 Dev`, `Team-P03 Dev`

If template is empty but prefix/suffix are set, the **original workspace name** is kept as the base:

```
finalName = [prefix] + originalName + [suffix]
```

### 5.5 Preview

The preview section shows a scrollable list:

```
Current Name          →  New Name
─────────────────────────────────
My Workspace Alpha    →  Team-P01 Dev
My Workspace Beta     →  Team-P02 Dev
My Workspace Gamma    →  Team-P03 Dev
```

The preview updates live as the user types in template/prefix/suffix/start fields.

### 5.6 Ordering

Workspaces are renamed in the order they appear in the workspace list (which is the API response order, or sorted if sort is active). The sequence number is assigned based on this visual order.

---

## 6. Execution Flow

### 6.1 Sequential API calls

Rename requests are sent **one at a time**, waiting for each to succeed before sending the next. This avoids rate-limiting and ensures predictable behavior.

```
for each selected workspace (in order):
  1. PUT /user/workspaces/{id} { name: newName }
  2. Wait for 200 OK
  3. Update local state (fullName, name)
  4. Log success
  5. Update progress indicator
  
if any request fails:
  - Log error with workspace name and HTTP status
  - Continue to next workspace (don't abort entire batch)
  - Mark failed ones in the results summary
```

### 6.2 Progress indicator

During execution, the Apply button transforms into a progress display:

```
Renaming... 3/10 ✅ 2 ❌ 1
```

### 6.3 Post-completion

After all renames finish:
1. Call `fetchLoopCredits()` once to refresh all workspace data from API
2. Clear `loopWsCheckedIds`
3. Re-render workspace list
4. Show summary: `"Renamed 9/10 workspaces (1 failed)"`

---

## 7. Implementation Location

### 7.1 Where the code lives

All code goes into `standalone-scripts/macro-controller/macro-looping.js` (the single source of truth). The Chrome Extension seeds this file via `?raw` import — no separate extension code needed.

### 7.2 New functions

| Function | Purpose |
|----------|---------|
| `renameWorkspace(wsId, newName)` | Single PUT request, returns Promise |
| `bulkRenameWorkspaces(entries)` | Sequential rename loop with progress |
| `applyRenameTemplate(template, prefix, suffix, startNum, count, index)` | Generate name from template |
| `renderBulkRenameDialog()` | Create and show the dialog |
| `renderRenamePreview()` | Update preview list in real-time |
| `handleWsCheckboxClick(wsId, idx, isShift)` | Toggle checkbox, handle Shift range |
| `showWsContextMenu(wsId, x, y)` | Right-click context menu |
| `undoLastRename(onProgress)` | Revert the most recent bulk rename operation |
| `updateUndoBtnVisibility()` | Show/hide the ↩️ Undo button based on history |

### 7.3 New config keys (macro-controller-config.json)

```json
{
  "macroLoop": {
    "elementIds": {
      "renameDialog": "ahk-loop-rename-dialog",
      "renameProgress": "ahk-loop-rename-progress"
    }
  }
}
```

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No token available | Show warning: "No auth token — log in first" |
| 401/403 on rename | Retry without bearer (cookie only), then mark failed |
| 429 rate limited | Wait 2 seconds, retry once, then mark failed |
| Network error | Log error, mark failed, continue to next |
| Empty name | Prevent submission — validate before sending |
| All workspaces fail | Show error summary, suggest re-auth |

---

## 9. Undo / Rollback

### 9.1 History stack

Every successful bulk rename operation is pushed onto `loopRenameHistory`, a stack of up to 20 entries:

```javascript
loopRenameHistory = [
  {
    timestamp: 1710345600000,
    entries: [
      { wsId: "abc123", oldName: "My Workspace", newName: "Team-P01" },
      { wsId: "def456", oldName: "Other WS", newName: "Team-P02" }
    ]
  }
]
```

### 9.2 Persistence

History is persisted to `localStorage` under key `ml_rename_history` and restored on script injection.

### 9.3 Undo flow

1. User clicks **↩️ Undo** button (visible when history stack is non-empty)
2. The last operation is popped from the stack
3. For each entry, a `PUT /user/workspaces/{id}` call reverts `newName` → `oldName`
4. Calls execute sequentially (same as forward rename)
5. On completion, `fetchLoopCredits()` refreshes all data
6. The undo operation itself is **not** added to the history stack

### 9.4 UI

- **↩️ Undo** button appears in the workspace dropdown header next to ✏️ Rename
- Red-tinted styling (`rgba(239,68,68,0.2)`) to indicate destructive action
- Tooltip shows count of workspaces and timestamp of last operation
- During execution, shows progress: `↩️ 3/10`

### 9.5 Global API

```javascript
window.__loopUndoRename()       // Undo the most recent bulk rename
window.__loopRenameHistory()    // View the rename history stack
```

---

## 10. Logging

All rename operations use the existing `log()` / `logSub()` system:

```
[Rename] === BULK RENAME START === (10 workspaces)
[Rename] PUT /user/workspaces/abc123 → "Team-P01 Dev"
  Auth: Bearer eyJ...REDACTED
[Rename] ✅ 1/10 renamed: "Team-P01 Dev"
[Rename] PUT /user/workspaces/def456 → "Team-P02 Dev"
[Rename] ❌ 2/10 failed: HTTP 429
[Rename] === BULK RENAME COMPLETE === 9/10 success, 1 failed
[Rename] Saved to undo history (9 entries, stack depth=1)
```

---

## 11. Global API

Expose for console/programmatic use:

```javascript
window.__loopRenameWorkspace(workspaceId, newName)    // Single rename
window.__loopBulkRename(template, prefix, suffix, startNum)  // Rename all checked
window.__loopUndoRename()                              // Undo last bulk rename
window.__loopRenameHistory()                           // View undo history stack
```

---

## 11. Styling

Consistent with existing MacroLoop panel aesthetics:
- Background: `rgba(0,0,0,.4)` with `border: 1px solid #4f46e5`
- Inputs: dark background (`#1e1b4b`), light text, indigo borders
- Checkboxes: small (12×12px), indigo accent color
- Context menu: dark floating div with hover highlight
- All inline styles (no external CSS — matching existing pattern)

---

## 12. Acceptance Criteria

1. **Single rename**: Right-click → Rename → type new name → Enter → API call succeeds → name updates in list
2. **Multi-select**: Checkbox click toggles selection; Shift+Click selects range
3. **Bulk rename with template**: `TEXT$$$` starting at 5 with 3 selected → `TEXT005`, `TEXT006`, `TEXT007`
4. **Prefix only**: Checking prefix="Team-" with no template → `Team-OriginalName` for each
5. **Suffix only**: Checking suffix=" Dev" with no template → `OriginalName Dev` for each
6. **All three combined**: prefix + template + suffix applied correctly
7. **Sequential execution**: Requests fire one at a time, not in parallel
8. **Error resilience**: One failure doesn't abort remaining renames
9. **Post-completion refresh**: `fetchLoopCredits()` called once after all renames finish
10. **Preview accuracy**: Preview matches actual names applied
