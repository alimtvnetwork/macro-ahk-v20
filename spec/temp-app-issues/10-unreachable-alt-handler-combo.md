# Issue #10: Unreachable Alt+Up/Down Force-Move Handler in combo.js

**Version**: v7.9.32 → Fixed in v7.9.33
**Severity**: Medium — force-move keyboard shortcuts silently fail in combo controller
**Date**: 2026-02-23

---

## Summary

The Alt+Up/Down force-move shortcuts added in v7.9.32 never triggered in combo.js because the handler was placed **after** an early-return guard that rejected all non-Ctrl+Alt key events.

---

## Root Cause Analysis

The combo.js keyboard listener had this structure:

```javascript
document.addEventListener('keydown', function(e) {
  const isCtrlAlt = e.ctrlKey && e.altKey;
  if (!isCtrlAlt) return;  // ← GUARD: exits for anything that isn't Ctrl+Alt

  // ... Ctrl+Alt+Left/Right combo switch logic ...

  // v7.9.32: Alt+Up/Down force move (UNREACHABLE)
  if (e.altKey && !e.ctrlKey && e.key === 'ArrowUp') {
    moveToAdjacentWorkspaceCombo('up');  // ← never reached
  }
});
```

The `if (!isCtrlAlt) return;` guard on line ~3640 exited the handler for **any** keypress that wasn't `Ctrl+Alt`. Since `Alt+Up` is `Alt` without `Ctrl`, it was always rejected before reaching the force-move handler below.

This is a classic **dead code** bug — the handler existed but was structurally unreachable.

---

## Fix (v7.9.33)

Two changes:

1. **Moved force-move check BEFORE the Ctrl+Alt guard**:
```javascript
// v7.9.33: Force move check MUST come before Ctrl+Alt guard
const isCtrlOnly = e.ctrlKey && !e.altKey && !e.shiftKey;
if (isCtrlOnly && e.key === 'ArrowUp') {
  e.preventDefault();
  moveToAdjacentWorkspaceCombo('up');
  return;
}
if (isCtrlOnly && e.key === 'ArrowDown') {
  e.preventDefault();
  moveToAdjacentWorkspaceCombo('down');
  return;
}

const isCtrlAlt = e.ctrlKey && e.altKey;
if (!isCtrlAlt) return;
// Combo switch logic follows...
```

2. **Changed shortcuts from Alt+Up/Down to Ctrl+Up/Down** — `Alt+Up/Down` didn't register reliably in the browser regardless. Ctrl+Up/Down works consistently and doesn't conflict with Ctrl+Left/Right (combo switch).

---

## Prevention

- **Engineering Rule**: When adding new shortcut handlers to a `keydown` listener, verify they are reachable by checking all early-return guards above them. Any guard that filters by modifier keys can silently block handlers for different modifier combinations.
- **Code Review Checklist**: New keyboard handlers must be inserted at the correct position relative to guard clauses, not appended at the end of the listener.
