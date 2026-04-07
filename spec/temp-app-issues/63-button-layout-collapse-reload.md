# Issue 63: Button Layout Breaks on Panel Collapse + Reload

**ID**: button-layout-collapse-reload  
**Status**: ✅ Fixed (panel state + geometry persistence implemented in panel-layout.ts)  
**Severity**: High  
**Date**: 2026-03-23  
**Version**: 1.61.0

---

## Problem

When the macro controller panel is minimized (collapsed via `[ - ]` toggle or title click) and the page is reloaded, the buttons (Check, ▶, Credits, Prompts, ☰) render with no spacing, padding, or gap — everything is crammed to the left.

## Screenshot

Buttons appear flush against each other with zero gap and no centering.

## Root Cause Analysis

### RCA-1: Panel Minimize State Not Persisted

The `panelState` field in `PanelLayoutCtx` is initialized as `'expanded'` on every construction (`createPanelLayoutCtx`). It is **never saved to localStorage**. Compare with `createCollapsibleSection()` which properly uses `localStorage.getItem(storageKey)` / `localStorage.setItem(storageKey, ...)`.

When the user minimizes the panel and reloads:
1. Panel reconstructs as `'expanded'` (correct)
2. All body elements get `display: ''` (correct)
3. BUT the panel may be inside a narrow Lovable sidebar container

This means the minimize state itself isn't the direct cause — the panel **does** expand. The actual issue is **RCA-2**.

### RCA-2: Panel Geometry Not Persisted

When the panel is in **floating mode** (attached to `document.body`), the user may have resized it. On reload:
- `enableFloating()` sets `width: ctx.floatW` (a hardcoded theme token, e.g., `'680px'`)
- But the **position** (`top`, `left`) is lost — panel defaults to `top: 80px; left: 20px`
- If the previous session had the panel resized to a narrow width and the Lovable page layout constrains the container, the button row's `flex-wrap: wrap` causes buttons to stack vertically with incorrect layout

### RCA-3: No Geometry Persistence on Drag/Resize End

The `pointerup` handler in `setupDragListeners` and `setupResizeListeners` releases the pointer capture but **does not save** the final position/size to localStorage. This is unlike the collapsible sections which persist their open/closed state.

### Root Cause (Container-Inline Mode)

When the panel is **not floating** (embedded in the Lovable page's DOM via XPath container), the panel width is determined by the parent container's CSS. If the parent has a narrow width or `overflow: hidden`, the button row's `flex-wrap: wrap` and `gap: 8px` can cause buttons to wrap incorrectly, and the `padding: 8px 4px` on the `btnRow` may be overridden by parent styles.

Key code:
```js
// panel-builder.ts line 306
btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;padding:8px 4px;';
```

The `flex-wrap: wrap` causes buttons to drop to next line when the container is narrow, but the `justify-content: center` is lost if the parent forces a different layout context.

## Fix

1. **Persist panel state to localStorage**:
   - Key `ml_panel_state`: `'expanded'` | `'minimized'`  
   - Key `ml_panel_geometry`: `{ top, left, width, height }`
   - Save on minimize toggle, drag end, resize end
   - Restore on `createUI()`

2. **Enforce minimum button row width**:
   - Add `min-width: 460px` to `btnRow` to prevent buttons from wrapping too aggressively
   - Consider `flex-wrap: nowrap` with `overflow-x: auto` as alternative

3. **Isolate panel styles from parent**:
   - Add CSS containment or explicit `box-sizing`, `overflow` to prevent parent style leakage

## Non-Regression Rules

1. Panel minimize state MUST survive page reload
2. Panel drag position MUST survive page reload (floating mode)
3. Panel resize dimensions MUST survive page reload (floating mode)
4. Button row MUST maintain gap and padding regardless of container width
5. Collapsible section states (already working) MUST NOT be affected

## Related Files

- `standalone-scripts/macro-controller/src/ui/panel-layout.ts` — `toggleMinimize()`, `enableFloating()`, `setupDragListeners()`, `setupResizeListeners()`
- `standalone-scripts/macro-controller/src/ui/panel-builder.ts` — `createUI()`, button row construction
- `standalone-scripts/macro-controller/src/ui/sections.ts` — `createCollapsibleSection()` (reference for proper localStorage persistence)
