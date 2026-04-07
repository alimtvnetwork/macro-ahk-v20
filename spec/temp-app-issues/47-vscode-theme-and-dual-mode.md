# Issue 47: VS Code-Inspired Theme + Dual Dark/Light Mode

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: ✅ Fixed

---

## Issue Summary

### What happened

The macro controller UI uses overly dark, low-contrast colors where elements are hard to distinguish from one another. Users cannot differentiate between sections, buttons, and backgrounds.

### Where it happens

- **Feature**: Macro controller injected UI (`01-macro-looping.js`)
- **Files**: `standalone-scripts/macro-controller/01-macro-looping.js`, `04-macro-theme.json`

### Symptoms and impact

- Poor readability: dark-on-dark sections blend together.
- No theme switching: users cannot choose a lighter alternative.
- Buttons and controls lack visual hierarchy.

---

## Fix Description

### What should change

1. **VS Code Dark+ inspired palette**: Replace current theme tokens in `04-macro-theme.json` with colors drawn from VS Code's Dark+ theme (e.g., `#1e1e2e` editor bg, `#252526` sidebar, `#007acc` accent, `#d4d4d4` foreground).
2. **VS Code Light+ mode**: Add a second theme preset using Light+ colors (`#ffffff` bg, `#f3f3f3` sidebar, `#0066b8` accent, `#333333` foreground).
3. **Theme toggle**: Add a simple Dark/Light toggle control in the macro controller UI (☰ menu or top bar).
4. **CSS variable mapping**: All UI elements must read colors from `window.__MARCO_THEME__` tokens — no hardcoded hex in the script.

### Constraints

- **Progress bar segment colors and order MUST NOT change** (per Spec 06).
- Theme tokens are injected via the JSON preamble system (`window.__MARCO_THEME__`).

---

## Acceptance Criteria

1. Dark mode uses VS Code Dark+ inspired colors with clear contrast between sections.
2. Light mode uses VS Code Light+ inspired colors.
3. User can toggle between modes; preference persists in `chrome.storage.local`.
4. Progress bar colors remain unchanged.
5. All hardcoded color values in the controller script are replaced with theme variable references.

---

*Theme spec v1.48.0 — 2026-03-20*
