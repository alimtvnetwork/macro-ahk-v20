# Marco Chrome Extension

Browser automation for workspace and credit management.

## Development

```bash
npm install
npm run dev
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions` (Developer mode).

## Production Build

```bash
npm run build
```

## Type Check

```bash
npm run typecheck
```

---

## Popup Button Reference

### Top Row — Project Controls

| Button | What it does |
|--------|--------------|
| **▶ Run** | Clears DOM markers, then injects all **enabled** scripts from the active project into the current tab. Shows injection results. |
| **⏹ Stop** | Placeholder — not yet implemented. |
| **🔄 Toggle** | Toggles the active project on/off (visual state). Reloads popup. |
| **⌨ Keys** | Opens `chrome://extensions/shortcuts` to configure keyboard shortcuts for the extension. |

### Actions & Status Panel

| Button | What it does |
|--------|--------------|
| **🔁 Re-inject** | Same as Run — clears existing script markers from the DOM, then re-injects all enabled scripts fresh. |
| **📋 Logs** | Copies session logs + errors as JSON to your **clipboard** (not displayed in popup). Paste into a text editor to review. |
| **💾 Export** | Downloads a ZIP file containing logs, errors, and the SQLite database (`marco-export-YYYY-MM-DD.zip`). |
| **🔄 Refresh** | Reloads the popup state from the background service worker. |

### Per-Script Row

| Element | What it does |
|---------|--------------|
| **Toggle switch** | Enables/disables the script. Disabled scripts are dimmed, struck-through, and skipped during injection. |
| **Reinject** | Re-injects only this single script (per-script, not all). |

### Debug Panel

| Button | What it does |
|--------|--------------|
| **📋 Copy** | Copies all debug panel entries to clipboard for troubleshooting. |
| **🗑️ Clear** | Clears debug log history and hides the panel. |

### Script Toggle Behavior

All three default scripts support inline toggling from the popup:

- **macro-controller.js** — Core controller (XPath utils, auth panel, token resolution). Enabled by default.
- **combo-switch.js** — Workspace transfer dialog automation. Disabled by default.
- **macro-looping.js** — Credit checking, workspace moves, loop engine. Disabled by default.

When you toggle a script **off**, it persists across sessions — re-opening the popup or restarting the extension remembers your preference.
