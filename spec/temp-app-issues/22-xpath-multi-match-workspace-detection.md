# Issue #22: XPath Multi-Match — Wrong Workspace Detected

**Status**: FIXED  
**Version**: v7.10.2  
**Severity**: High — controller shows wrong workspace, credits misaligned  
**Category**: Workspace Detection / XPath  

## Symptom

Workspace detection via Project Dialog returns the wrong workspace name. The controller header shows a different workspace than the one actually active in the UI. Credits and progress bar are misaligned as a result.

## Root Cause

`detectWorkspaceViaProjectDialog()` used `getByXPath(CONFIG.WORKSPACE_XPATH)` which calls `document.evaluate()` with `FIRST_ORDERED_NODE_TYPE` — it returns only the **first** matching DOM node.

The configured XPath can match **multiple elements** in the dialog (e.g., same CSS structure repeated across different sections of the Radix popover). The first matching node may contain text that is NOT a workspace name (e.g., a project name, a label, or other UI text). The code then failed the validation check against known workspaces and defaulted to the first workspace in the list — which was also wrong.

## Evidence

The dialog contains multiple nodes matching `CONFIG.WORKSPACE_XPATH`. Node[0] contained non-workspace text, while Node[1] or later contained the actual workspace name. Since `getByXPath` only returned Node[0], the correct workspace was never checked.

## Fix

Replaced `getByXPath()` with `getAllByXPath()` which uses `ORDERED_NODE_SNAPSHOT_TYPE` to return **all** matching nodes. The code now iterates through every match:

1. For each node, read `textContent.trim()`
2. Check exact match against `perWs[].fullName` and `perWs[].name`
3. If no exact match, check partial match (case-insensitive)
4. First node that matches a known workspace wins
5. Log every node checked: `Node[0]: "...", Node[1]: "..."` for diagnostics

If no node matches any known workspace, falls back to first workspace with a warning (same as before).

### Key code change

```javascript
// Before (v7.10.1) — only first match
var wsEl = getByXPath(CONFIG.WORKSPACE_XPATH);
var rawName = (wsEl.textContent || '').trim();
// rawName might be "Some Project Name" — not a workspace

// After (v7.10.2) — iterate all matches
var allNodes = getAllByXPath(CONFIG.WORKSPACE_XPATH);
for (var ni = 0; ni < allNodes.length; ni++) {
  var rawName = (allNodes[ni].textContent || '').trim();
  // Validate against known workspaces, pick first valid match
}
```

## Prevention

- **Standard #6 (DOM Validation Required)**: Already requires validation via `isKnownWorkspaceName()`. This fix extends the principle: when an XPath matches multiple nodes, validate ALL of them, not just the first.
- **New pattern**: When using XPath for critical state detection, prefer `getAllByXPath()` over `getByXPath()` and iterate with validation. A single-match XPath assumption is fragile in dynamic SPAs where DOM structure repeats.

## Files Changed

- `macro-looping.js` (v7.0) — `detectWorkspaceViaProjectDialog()`: replaced `getByXPath` with `getAllByXPath` + iterate-and-validate loop
