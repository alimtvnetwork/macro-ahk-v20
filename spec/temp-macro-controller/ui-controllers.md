# 09 — UI Controllers Specification

**Version**: v7.17
**Last Updated**: 2026-02-25

---

## Two Controllers

| Controller | File | Where It Runs | Primary Function |
|-----------|------|---------------|------------------|
| **ComboSwitch** | `combo.js` | Settings page (`/settings?tab=project`) | Transfer projects between positions in the same workspace |
| **MacroLoop** | `macro-looping.js` | Project page (`/projects/{id}`) | Auto-monitor credits, move to non-depleted workspaces |

Both controllers create **floating, draggable UI panels** injected into the DOM.

---

## Common Features (Both Controllers)

| Feature | Description |
|---------|-------------|
| **Floating panel** | `position: fixed`, draggable by header bar |
| **Hide/Minimize** | `[-]` minimizes, `[+]` expands, `[x]` hides, Ctrl+Alt+H restores |
| **Workspace dropdown** | Searchable list with emojis, credit bars, keyboard navigation |
| **Credit progress bars** | Segmented bars: 🎁 Purple → 💰 Green → 🔄 Gray → 📅 Yellow |
| **Move button** | 🚀 Move Project — API-based, no confirmation dialog |
| **Force move** | ⏫/⏬ buttons + Ctrl+Up/Down shortcuts |
| **Focus Current** | 📍 scrolls to current workspace in dropdown |
| **JS Executor** | Textbox for arbitrary JS with Ctrl+/, Ctrl+Enter, ArrowUp/Down history |
| **Bearer token UI** | Collapsible section, paste/save, 🍪 From Cookie, expiry indicator |
| **Credit refresh** | 💳 button fetches fresh data from API |
| **Domain guard** | Validates hostname before executing |
| **SPA persistence** | MutationObserver re-creates panel if removed by React |

---

## ComboSwitch-Specific Features

### 8-Step Transfer Process

| Step | Action | Error Code |
|------|--------|------------|
| 1 | Click Transfer button (5-method findElement fallback) | E002 |
| 2 | Wait for current project text in modal | E003 |
| 3 | Click project dropdown button | E004 |
| 4 | Wait for dropdown to open | E005 |
| 5 | Get options list from container | E006 |
| 6 | Find current project, calculate target index | E007 |
| 7 | Click target project + update status | — |
| 8 | Click Confirm button + flash + history entry | E008 |

### Shortcuts (ComboSwitch)

| Shortcut | Action |
|----------|--------|
| Ctrl+Left (AHK) | Combo switch up |
| Ctrl+Right (AHK) | Combo switch down |
| Ctrl+Alt+S | Check credit status |
| Ctrl+Alt+M | Move to selected workspace |
| Ctrl+/ | Focus JS executor |
| Ctrl+Enter | Execute JS in textbox |

---

## MacroLoop-Specific Features

### Loop Cycle

```
runCycle()
  ├── Guard: isUserTypingInPrompt() → skip if user is typing
  ├── Fetch credits via API (syncCreditStateFromApi)
  ├── Check dailyFree for current workspace
  ├── If dailyFree == 0 → performDirectMove(direction)
  │     └── moveToAdjacentWorkspace() with smart skip
  ├── Update status display with countdown timer
  └── Schedule next cycle after LoopIntervalMs
```

### Smart Workspace Switching
Fetches fresh data, walks in direction, skips workspaces with `dailyFree == 0`.

### CSV Export
📋 CSV button → `exportWorkspacesAsCsv()` → downloads sorted workspace credit data.

### Export Bundle (v7.17)
📥 Export button → reads `window.__exportBundle` (stored at injection time by AHK) → copies to clipboard + downloads as `.js` file. The bundle contains all 3 scripts (xpath-utils + macro-looping + combo) with all `__PLACEHOLDER__` tokens resolved. Anyone can paste it into any DevTools Console for a fully functional controller.

Also available from the **system tray menu**: `Export Full Bundle` → saves to `logs/compiled-bundle-all.js` + copies to clipboard.

### Workspace Count Label
`Workspaces (filtered/total)` updates dynamically on search/filter.

### Shortcuts (MacroLoop)

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+Up (AHK) | Toggle loop up |
| Ctrl+Shift+Down (AHK) | Toggle loop down |
| Ctrl+Up (browser) | Force move up |
| Ctrl+Down (browser) | Force move down |
| Ctrl+1 (browser) | Move panel to bottom-left |
| Ctrl+3 (browser) | Move panel to bottom-right |

---

## UI Layout (MacroLoop)

```
+---------------------------------------------+
| MacroLoop v7.17              [ - ] [ x ]      |  ← Header (draggable)
+---------------------------------------------+
| 🔗 Project: abc12345 | 🏠 WorkspaceName     |
| ⚡133/205  [progress bar segments]           |  ← Credit bar
|                                               |
| [▶ Start] [■ Stop] [💳] [📋CSV] [📥Export] [⏫] [⏬] |  ← Controls
| [Y] Free Credit | RUNNING ▶ 42s | Cycles: 7  |
|                                               |
| 🏢 Workspaces (5/42)    [📍 Focus Current]   |
| 🔍 Search... [🆓] [🔄] [💰]                  |
| +-------------------------------------------+|
| | 📍 WS-Name  [█████░] ⚡133/205            ||
| | 🟢 WS-Name  [███░░░] ⚡ 84/205            ||
| | 🔴 WS-Name  [█░░░░░] ⚡ 12/205            ||
| +-------------------------------------------+|
|                                               |
| ▶ Bearer Token 🔑                            |
| ▶ JS Executor                                 |
| ▶ Activity Log / History                       |
+---------------------------------------------+
```
