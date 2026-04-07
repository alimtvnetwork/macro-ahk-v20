# Future Spec: Theme Creation, Font Selection & Project-Level Variables

**Version**: v1.0.0-draft
**Date**: 2026-03-20
**Status**: Future / Planned

---

## Purpose

Enable users to create, customize, and manage visual themes (colors + fonts) within the extension settings, so that injected scripts can dynamically pick colors and font variables from a centralized, project-scoped configuration.

---

## Planned Features

### 1. Theme Creator UI (Options Page)

- Color picker for each semantic token (background, foreground, accent, border, etc.).
- Font family selector (from a curated list or custom input).
- Font size / weight overrides.
- Live preview panel showing how the macro controller would look.
- Export / import theme as JSON.

### 2. Built-in Theme Presets

- VS Code Dark+, VS Code Light+, Monokai, Solarized Dark, Solarized Light, GitHub Light.
- Users can fork a preset and customize.

### 3. Project-Level Theme Binding

- Each project can have its own theme override.
- Falls back to the global/default theme if no project override exists.
- Theme data stored in SQLite (not localStorage) via the key-value API.

### 4. Script Integration

- Theme injected as `window.__MARCO_THEME__` before script execution.
- Scripts read tokens like `theme.colors.background`, `theme.fonts.body`, etc.
- No hardcoded colors allowed in scripts — enforced by coding guidelines.

### 5. Font System

- Support Google Fonts loading via `@import` or `<link>` injection.
- Font variables: `--marco-font-body`, `--marco-font-heading`, `--marco-font-mono`.

---

## Dependencies

- SQLite-first storage migration (Issue 49).
- Project-scoped key-value API (Issue 50).

---

*Future theme creation spec v1.0.0-draft — 2026-03-20*
