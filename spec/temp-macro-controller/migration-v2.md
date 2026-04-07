# Spec 15 — Macro Controller v2 Improvements

**Status**: In Progress
**Version**: 1.0  
**Date**: 2026-03-17

---

## Summary

Four focus areas for the next phase of macro controller development, building on the completed Spec 13 UI overhaul.

| # | Task | Area | Priority | Complexity |
|---|------|------|----------|------------|
| T-1 | Auto-retry on loop failure with backoff | Error Handling | High | Medium | ✅ Done |
| T-2 | Error notification toast in overlay | Error Handling | High | Low | ✅ Done |
| T-2 | Error notification toast in overlay | Error Handling | High | Low | ✅ Done |
| T-3 | Graceful recovery from stale XPath selectors | Error Handling | Medium | Medium | ✅ Done |
| T-4 | Dark mode support for overlay | UI Polish | Medium | Medium | ✅ Done |
| T-5 | Draggable + resizable overlay panel | UI Polish | Medium | Medium | ✅ Done |
| T-6 | Minimize-to-badge mode | UI Polish | Low | Low | ✅ Done |
| T-7 | Run statistics dashboard (success/fail rates) | Logging | High | Medium | ✅ Done |
| T-8 | Log viewer with filtering inside overlay | Logging | Medium | Medium | ✅ Done |
| T-9 | Session summary export (Markdown report) | Logging | Low | Low | ✅ Done |
| T-10 | In-overlay prompt CRUD (add/edit/delete) | Prompts | High | Medium | ✅ Done |
| T-11 | Prompt categories and favorites | Prompts | Medium | Low | ✅ Done |
| T-12 | Prompt chaining (sequential multi-prompt) | Prompts | Low | High | ✅ Done |

---

## Area 1: Error Handling & Recovery

### T-1: Auto-Retry on Loop Failure with Backoff

**Problem**: When a macro loop cycle fails (XPath not found, page not loaded, dialog blocking), the loop stops entirely and requires manual restart.

**Design**:
- On cycle failure, retry up to 3 times with exponential backoff (2s → 4s → 8s).
- After max retries, stop the loop and show an error notification (T-2).
- Log each retry attempt with failure reason.
- Add a `maxRetries` and `retryBackoffMs` config option to `macro-controller-config.json`.

**Acceptance Criteria**:
- Transient failures (slow page load) auto-recover without user intervention.
- Persistent failures stop gracefully with a clear error message.
- Retry count and reasons visible in the activity log.

---

### T-2: Error Notification Toast in Overlay

**Problem**: Errors during macro execution are only visible in the JS console or activity log — easy to miss.

**Design**:
- Show a small toast/banner at the top of the overlay when an error occurs.
- Toast auto-dismisses after 10 seconds, or user can click to dismiss.
- Color-coded: red for fatal errors, yellow for warnings/retries.
- Toast shows: error type, short message, timestamp.

**Acceptance Criteria**:
- Errors during loop execution produce a visible toast in the overlay.
- Toast does not block other UI controls.
- Multiple toasts stack (max 3 visible, oldest auto-dismissed).

---

### T-3: Graceful Recovery from Stale XPath Selectors

**Problem**: When Lovable updates its UI, XPath selectors in the config become stale, causing silent failures or crashes.

**Design**:
- Before using an XPath, validate it resolves to an element.
- If an XPath fails, log a structured error with the XPath name, expected target, and suggestion to update config.
- Add a "Validate XPaths" button to the XPath Configuration section that tests all configured selectors and shows a pass/fail report.
- Optionally: try CSS selector fallback if XPath fails (config supports both).

**Acceptance Criteria**:
- Stale XPaths produce actionable error messages instead of silent failures.
- "Validate XPaths" button shows green/red status for each selector.
- Config supports optional `selector` fallback alongside `xpath`.

---

## Area 2: UI Polish & Theming

### T-4: Dark Mode Support for Overlay

**Problem**: The macro controller overlay uses hardcoded light colors that clash with Lovable's dark UI.

**Design**:
- Detect page theme via `document.documentElement` class or `prefers-color-scheme`.
- Apply dark mode styles: dark background, light text, adjusted borders.
- Store theme preference in `localStorage` with key `marco-overlay-theme`.
- Add a theme toggle (☀/🌙) in the overlay header bar.

**Acceptance Criteria**:
- Overlay auto-detects Lovable's dark mode and matches it.
- Manual toggle overrides auto-detection.
- All UI elements readable in both themes (buttons, text, status indicators, toasts).

---

### T-5: Draggable + Resizable Overlay Panel

**Problem**: The overlay is fixed in one position and size, sometimes covering important page content.

**Design**:
- Overlay header bar acts as drag handle (cursor: grab).
- Bottom-right corner has a resize handle.
- Position and size persist in `localStorage` (key: `marco-overlay-geometry`).
- Double-click header to reset to default position/size.
- Constrain to viewport bounds.

**Acceptance Criteria**:
- User can drag overlay to any position within the viewport.
- User can resize overlay (min: 300×200, max: viewport bounds).
- Position and size survive page reload.
- Double-click header resets geometry.

---

### T-6: Minimize-to-Badge Mode

**Problem**: Even when collapsed, the overlay takes up visual space.

**Design**:
- Add a minimize button (▬) to the header bar.
- Minimized state: overlay collapses to a small floating badge showing only the status icon (▶/⏹/⚠).
- Click badge to restore full overlay.
- Badge position: bottom-right corner (or last dragged position if T-5 is implemented).

**Acceptance Criteria**:
- Minimize button reduces overlay to a small badge.
- Badge shows current loop status at a glance.
- Click badge restores full overlay with previous state preserved.

---

## Area 3: Logging & Analytics

### T-7: Run Statistics Dashboard

**Problem**: No way to see macro loop performance over time — users don't know success/failure rates.

**Design**:
- Track per-cycle metrics: `{ cycleNumber, startTime, endTime, status: 'success'|'error'|'skipped', errorMessage? }`.
- Store via `chrome.storage.local` (persists across reloads and syncs within device). Cap at 500 entries, FIFO.
- Add a "Stats" section (collapsible, per T-5 from Spec 13) showing:
  - Total cycles run / success / error / skipped
  - Success rate percentage
  - Average cycle duration
  - Last error message
- Optionally: simple ASCII bar chart of last 20 cycles (green=success, red=error).

**Acceptance Criteria**:
- Stats section shows accurate counts after running macro loops.
- Stats reset on page reload (ephemeral, not persisted).
- Stats exportable as part of "Copy Logs" action.

---

### T-8: Log Viewer with Filtering Inside Overlay

**Problem**: The current "Show Activity" section is a raw text dump with no filtering.

**Design**:
- Replace raw text with a scrollable log list.
- Each entry: timestamp, level icon (ℹ/⚠/❌), message.
- Filter buttons: All | Info | Warn | Error.
- Search box for text filtering.
- "Clear" button to reset log view (not underlying data).
- Max visible entries: 200 (virtual scroll not required at this scale).

**Acceptance Criteria**:
- Log entries are individually styled by level.
- Filters work in real-time (no re-render delay).
- Search filters by message text substring.
- Clear resets view without losing underlying log data.

---

### T-9: Session Summary Export (Markdown Report)

**Problem**: When sharing macro session results, users have to manually compile information.

**Design**:
- "Export Report" button generates a Markdown summary:
  ```markdown
  # Marco Session Report
  - **Date**: 2026-03-17 14:30
  - **Duration**: 45 minutes
  - **Cycles**: 27 total (25 success, 2 errors)
  - **Success Rate**: 92.6%
  
  ## Errors
  | Cycle | Time | Error |
  |-------|------|-------|
  | 12 | 14:42 | XPath not found: projectButton |
  | 19 | 14:51 | Page load timeout |
  
  ## Configuration
  - Loop interval: 100s
  - Direction: up
  ```
- Copies to clipboard and optionally downloads as `.md` file.

**Acceptance Criteria**:
- Report includes session stats, error details, and active config.
- Both clipboard copy and file download work.
- Report is valid Markdown.

---

## Area 4: Prompt Management

### T-10: In-Overlay Prompt CRUD

**Problem**: Prompts can only be edited by modifying `macro-prompts.json` — no in-UI management.

**Design**:
- Expand the Prompts dropdown into a management panel (accessible via a "Manage" link at the bottom of the dropdown).
- Panel supports:
  - **Add**: Name + text textarea, save button.
  - **Edit**: Click prompt name to edit inline.
  - **Delete**: Trash icon with confirmation.
  - **Reorder**: Up/down arrows to change prompt order.
- Changes persist to `chrome.storage.sync` (syncs across all Chrome instances via Google account, max 100KB).
- Custom prompts merge with JSON config prompts (custom take precedence by name).

**Acceptance Criteria**:
- Users can add, edit, delete, and reorder prompts without editing JSON.
- Custom prompts survive page reload.
- JSON config prompts still load as defaults (not editable in-UI, but can be overridden).

---

### T-11: Prompt Categories and Favorites

**Problem**: As the prompt list grows, finding the right prompt becomes slow.

**Design**:
- Add optional `category` field to prompt entries (e.g., "Debug", "Memory", "Testing").
- Category filter dropdown in the prompt panel.
- Star icon to mark favorites — favorites appear at the top of the list.
- Categories and favorites stored in `localStorage`.

**Acceptance Criteria**:
- Prompts can be assigned to categories.
- Category filter shows only matching prompts.
- Favorites are pinned to the top of the list.
- Works with both JSON config and custom prompts.

---

### T-12: Prompt Chaining (Sequential Multi-Prompt)

**Problem**: Some workflows require sending multiple prompts in sequence (e.g., "read context" → "produce report" → "implement fix").

**Design**:
- New "Chain" feature: select multiple prompts, define execution order.
- Chain execution: paste prompt 1, wait for Lovable to finish (detect idle state), then paste prompt 2, etc.
- Idle detection: **DOM MutationObserver** — watch for loading indicators (spinners, progress bars) disappearing. When DOM mutations stop and no spinner is visible for 5s, consider idle.
- Chain UI: a simple list with checkboxes to select prompts, drag to reorder, "Run Chain" button.
- Chain definitions saved in `chrome.storage.sync`.
- Max chain length: 10 prompts. Timeout between prompts: 5 minutes (configurable).

**Resolved Items**:
- [x] Idle detection: DOM MutationObserver on spinner/progress elements.
- [x] Max chain length: 10, timeout: 5 min.

**Acceptance Criteria**:
- Users can create and save prompt chains.
- Chain execution sends prompts sequentially, waiting for idle between each.
- Chain stops on error with notification (T-2).
- Progress indicator shows current step in chain.

---

## Implementation Order (Suggested)

| Phase | Tasks | Rationale |
|-------|-------|-----------|
| 1 | T-1, T-2 | Core reliability — retry + visibility |
| 2 | T-4, T-6 | Quick UI wins — dark mode + minimize |
| 3 | T-7, T-8 | Analytics foundation — stats + log viewer |
| 4 | T-10 | Prompt CRUD — most requested prompt feature |
| 5 | T-3, T-5 | Resilience + UX polish |
| 6 | T-9, T-11 | Export + organization |
| 7 | T-12 | Advanced feature — prompt chaining |

---

## Open Questions — Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **T-4**: Theme matching | **Always dark (independent)** | Keep the current dark overlay regardless of Lovable's theme. No detection logic needed. |
| 2 | **T-7**: Stats persistence | **chrome.storage** | Stats survive reloads AND sync across devices via Chrome Extension storage API. Cleared manually or on loop reset. |
| 3 | **T-10**: Prompt sync | **chrome.storage.sync** | Custom prompts sync across all Chrome instances via Google account. Max 100KB limit — sufficient for prompt text. |
| 4 | **T-12**: Idle detection | **DOM mutation observer** | Watch for loading indicators (spinners, progress bars) disappearing. When DOM mutations stop and no spinner is visible, consider Lovable idle for prompt chaining. |
