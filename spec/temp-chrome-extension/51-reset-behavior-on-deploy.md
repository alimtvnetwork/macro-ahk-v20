# Spec: Default Reset Behavior on `-d` Run

**Status**: Implemented  
**Date**: 2026-03-21

## What Happens When `run.ps1 -d` Deploys

### Build Phase (Steps 1-3)

1. **Standalone scripts compiled**: `build:xpath` → `xpath/dist/xpath.js`, `build:macro-controller` → `macro-controller/dist/macro-looping.js`
2. **Post-build sync**: `macro-looping.js` copied to `01-macro-looping.js`
3. **Extension Vite build**:
   - `looping-script-chunk.ts` imports `01-macro-looping.js?raw` → embeds as string
   - `xpath-script-chunk.ts` imports `xpath/dist/xpath.js?raw` → embeds as string
   - `copyProjectScripts()` copies both to `dist/projects/scripts/`
4. **Deploy**: dist/ loaded into Chrome profile

### Runtime Reset (Extension Boot)

When the extension service worker starts (or Chrome restarts), `seedDefaultScripts()` runs automatically:

| Action | Behavior |
|--------|----------|
| **xpath.js** | Seeded if missing. If present, code/isGlobal/loadOrder compared — refreshed if stale. |
| **macro-looping.js** | Seeded if missing. If present, code/configBinding/cookieBinding/dependencies compared — refreshed if stale. |
| **Configs** | Default config and theme config seeded/refreshed similarly. |
| **Legacy scripts** | Old `macro-controller.js` and `combo-switch.js` entries are pruned from storage. |

### What Is NOT Reset

| Data | Preserved? | Reason |
|------|-----------|--------|
| User-uploaded scripts | ✅ Yes | Only default-seeded scripts are touched |
| User script bindings | ✅ Yes | Project → script associations preserved |
| User settings (ProjectKv) | ✅ Yes | Persisted in SQLite, untouched by seeder |
| Activity logs | ✅ Yes | Stored in SQLite |
| Workspace history | ✅ Yes | Stored in chrome.storage.local, not overwritten |

### Force Reset

To force a complete reset of seeded scripts, the user can:
1. Delete the extension from `chrome://extensions/`
2. Run `run.ps1 -d` to reload fresh
3. Or manually clear `chrome.storage.local` via DevTools

### Summary

**`-d` is safe**: it only refreshes built-in default scripts to their latest versions. User data, settings, and custom scripts are never overwritten.
