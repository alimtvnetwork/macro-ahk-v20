# Issue 35: Single Script Architecture — Remove combo-switch.js and macro-controller.js

**Version**: v1.0.5  
**Date**: 2026-03-12  
**Status**: Resolved

---

## Summary

Consolidated the Chrome Extension from a 3-script architecture (combo-switch.js, macro-controller.js, macro-looping.js) to a single-script architecture (macro-looping.js only). The unified script reads all config from `window.__MARCO_CONFIG__` via JSON.

### Changes Made

1. **Seeder** (`default-scripts-seeder.ts`): Removed combo-switch and macro-controller seeding. Only `macro-looping.js` is now seeded with `isEnabled: true` and `order: 1`.

2. **Config** (`looping-config-chunk.ts`): Updated to use the full unified config structure (comboSwitch + macroLoop + creditStatus + general), matching `standalone-scripts/macro-controller/macro-controller-config.json`.

3. **Seed IDs** (`seed-ids.ts`): Removed combo/controller IDs. Only looping IDs remain.

4. **Deleted files**: `combo-config-chunk.ts`, `combo-script-chunk.ts`, `controller-config-chunk.ts`, `controller-script-chunk.ts`, `controller-js/` directory.

5. **Popup HTML** (`popup.html`):
   - Removed duplicate Run button from quick-actions (was in both project controls and quick-actions)
   - Moved Re-inject into project controls alongside Run
   - Removed action-help-grid (moved to Help overlay)
   - Added green Help button (?) next to version in header
   - Quick-actions now shows only: Logs, Export, Refresh (3-column grid)
   - Added `Ctrl+Shift+R` shortcut badge on Run button

6. **Popup CSS** (`popup.css`):
   - Fixed tooltip clipping with `tooltip-safe` class (left-aligned instead of center-transformed)
   - Tooltips on script rows now right-aligned to prevent edge clipping
   - Added Help button styles (green circle)
   - Added Help overlay styles
   - Added primary button variant for Run
   - Quick-actions grid changed from 4 to 3 columns

7. **Popup Actions** (`popup-actions.ts`):
   - Consolidated injection button bindings
   - Added Help button binding with overlay
   - Improved log copy to include extension version and char count

8. **Popup Scripts** (`popup-scripts.ts`):
   - Updated toggleable scripts set to only include `macro-looping.js`

9. **Manifest** (`manifest.json`):
   - Added `commands` section with `Ctrl+Shift+R` for "Run scripts"

10. **Spec**: Created `spec/11-chrome-extension/35-single-script-architecture.md`

---

## Done Checklist

- [x] Seeder only seeds macro-looping.js
- [x] Config uses unified structure
- [x] Combo/controller seed files deleted
- [x] Popup has single Run + Re-inject buttons (no duplicates)
- [x] Help button added next to version
- [x] Tooltip clipping fixed
- [x] Log copy includes version and char count
- [x] Keyboard shortcut added to manifest
- [x] Spec written
