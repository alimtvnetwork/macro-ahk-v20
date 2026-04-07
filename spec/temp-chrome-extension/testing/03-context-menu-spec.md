# Chrome Extension — Context Menu Specification

> **Version**: 1.0.0
> **Last updated**: 2026-03-13
> **Extension version**: 1.5.0+

---

## Overview

The Marco Chrome Extension provides a browser-native right-click context menu that allows quick access to core extension actions without opening the popup. The menu appears on **all pages** (not restricted to Lovable domains) and provides project selection, script execution, and log management.

---

## Menu Structure

```
Marco (root)
├── Select Project (submenu)
│   ├── ● Project A       (radio, checked if active)
│   ├── ○ Project B       (radio)
│   └── ○ Project C       (radio)
├── ─────────────────
├── ▶ Run Scripts
├── 🔄 Re-inject Scripts
├── ─────────────────
├── 📋 Copy Recent Logs
├── 📦 Export Logs (JSON)
├── ─────────────────
└── ℹ Status
```

---

## Menu Items

### Select Project

- **Type**: Submenu with radio items
- **Behavior**: Lists all projects from the project store. The currently active project is shown as `checked`. Clicking a different project calls `SET_ACTIVE_PROJECT` and updates the radio selection.
- **Empty state**: If no projects exist, a disabled `(no projects)` item is shown.
- **Dynamic refresh**: The submenu is rebuilt whenever `SET_ACTIVE_PROJECT`, `SAVE_PROJECT`, or `DELETE_PROJECT` messages are detected.

### Run Scripts

- **Type**: Normal menu item
- **Behavior**: Retrieves all enabled scripts via `GET_ALL_SCRIPTS`, filters to `isEnabled !== false`, and calls `INJECT_SCRIPTS` for the active tab. No-op if no tab or no enabled scripts.
- **Equivalent to**: Clicking "Run" in the popup.

### Re-inject Scripts

- **Type**: Normal menu item
- **Behavior**: First removes DOM marker elements (`ahk-loop-script`, `ahk-combo-script`, `marco-auth-panel`, `marco-controller-marker`) via `chrome.scripting.executeScript`, then performs a full Run. This ensures a clean slate before injection.
- **Equivalent to**: Clicking "Re-inject" in the popup.

### Copy Recent Logs

- **Type**: Normal menu item
- **Behavior**: Fetches the 50 most recent log entries via `GET_RECENT_LOGS`, serializes as formatted JSON, and copies to clipboard via `navigator.clipboard.writeText` injected into the active tab.
- **Fallback**: If clipboard injection fails (e.g., restricted page), a console warning is logged.

### Export Logs (JSON)

- **Type**: Normal menu item
- **Behavior**: Triggers `EXPORT_LOGS_JSON` which initiates a file download of the complete log database as JSON.

### Status

- **Type**: Normal menu item
- **Behavior**: Calls `GET_STATUS` and displays the result as both a `console.log` and an `alert()` dialog in the active tab. Useful for quick diagnostics without opening the popup or options page.

---

## Permissions

| Permission | Purpose |
|---|---|
| `contextMenus` | Required to create and manage the right-click menu |
| `scripting` | Already present; used for clipboard injection and marker removal |
| `tabs` | Already present; used to get the active tab ID |

Only `contextMenus` is newly added in v1.5.0.

---

## Architecture

### File Location

```
chrome-extension/src/background/context-menu-handler.ts
```

### Registration

The `registerContextMenu()` function is called once during service worker boot in `service-worker-main.ts`, after all handlers are bound and the message buffer is drained.

### Internal Message Dispatch

The context menu handler communicates with the extension backend via direct function calls to `handleMessage()` from `message-router.ts`, bypassing `chrome.runtime.sendMessage`. This avoids message serialization overhead and keeps everything within the service worker scope.

### Project Sync

A secondary `chrome.runtime.onMessage` listener watches for project-mutation messages (`SET_ACTIVE_PROJECT`, `SAVE_PROJECT`, `DELETE_PROJECT`). When detected, it triggers `rebuildProjectSubmenu()` to keep the radio items in sync.

---

## Menu IDs

All menu IDs use the `marco-` prefix to avoid collisions:

| Constant | ID Value |
|---|---|
| `ROOT` | `marco-root` |
| `PROJECT_PARENT` | `marco-projects` |
| `RUN` | `marco-run` |
| `REINJECT` | `marco-reinject` |
| `COPY_LOGS` | `marco-copy-logs` |
| `EXPORT_LOGS` | `marco-export-logs` |
| `STATUS` | `marco-status` |
| Project items | `marco-project-{projectId}` |

---

## Error Handling

- **No active tab**: Actions that require a tab (Run, Re-inject, Copy Logs, Status) silently no-op when `tabId` is 0 or undefined.
- **Non-injectable tabs**: `chrome.scripting.executeScript` failures (e.g., `chrome://` pages) are caught and logged as warnings.
- **Empty projects**: The project submenu shows a disabled placeholder.
- **Empty scripts**: Run/Re-inject silently no-op when no enabled scripts exist.

---

## Testing

Covered in the E2E test specification under:
- **E2E-CTX-01**: Context menu appears on right-click on any page
- **E2E-CTX-02**: Project selection changes active project
- **E2E-CTX-03**: Run Scripts injects into active tab
- **E2E-CTX-04**: Re-inject cleans markers then injects
- **E2E-CTX-05**: Copy Logs populates clipboard
- **E2E-CTX-06**: Export Logs triggers download
- **E2E-CTX-07**: Status shows alert with extension state

---

*Context Menu specification v1.0.0 — 2026-03-13*
