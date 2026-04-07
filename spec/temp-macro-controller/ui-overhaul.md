# Spec 13 — Macro Controller UI Overhaul

**Status**: ✅ Complete  
**Version**: 1.0  
**Date**: 2026-03-16

---

## Summary of Tasks

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| T-1 | Fix script-expand text glitch in Popup | High | Low |
| T-2 | Consolidate buttons into a menu button | High | Medium |
| T-3 | Prompt selector with JSON config | Medium | Medium |
| T-4 | Manual-only injection (no auto-inject) | High | Low |
| T-5 | Collapsible sections (+/− toggles) | Medium | Low |
| T-6 | Always show credit icons (even when zero) | Medium | Low |

---

## T-1: Fix Script-Expand Text Glitch in Popup

### Problem
When expanding a script entry in the Chrome Extension **Popup** to view its code, the text renders with a visual glitch (flickering, overlapping, or layout jump).

### Root Cause (Investigate)
Likely a CSS transition/animation conflict on the collapsible component, or a monospace font rendering issue when content height changes dynamically.

### Acceptance Criteria
- Expanding a script in the Popup shows code text smoothly with no visual artifacts.
- No layout shift or text overlap during expand/collapse animation.

### Approach
1. Inspect `PopupApp.tsx` and any collapsible/accordion component used for script display.
2. Check for CSS `overflow`, `transition`, `max-height` conflicts.
3. Fix by stabilizing the container height calculation or disabling problematic transitions.

---

## T-2: Consolidate Buttons into a Menu Button

### Problem
The macro controller overlay has too many buttons visible at once, creating clutter.

### Design
**Always visible (top bar):**
- ☑ **Check** button — one-shot credit check
- ▶/⏹ **Start/Stop toggle** — uses a logo/icon instead of text
- 💰 **Credits** button — opens credit status
- 📋 **Prompts** dropdown — prompt selector (see T-3)

**Inside the menu button (☰):**
- Loop Up / Loop Down
- Diagnostic dump
- Copy logs
- Download logs
- Export CSV
- Any other secondary actions

### Acceptance Criteria
- Only 4-5 buttons visible by default.
- Menu button opens a dropdown/popover with all secondary actions.
- Each menu item has a label and optional icon.

### Affected Files
- `standalone-scripts/macro-controller/macro-looping.js` — the injected script that builds the UI.

---

## T-3: Prompt Selector with JSON Config

### Problem
Users need a way to quickly paste predefined prompts into the Lovable editor text area.

### Design

**New config file:** `standalone-scripts/macro-controller/macro-prompts.json`
```json
{
  "prompts": [
    {
      "name": "Fix TypeScript errors",
      "text": "Please fix all TypeScript compilation errors in the project."
    },
    {
      "name": "Run tests",
      "text": "Run all tests and fix any failures."
    }
  ]
}
```

**UI (inside macro controller overlay):**
- A **Prompts** dropdown button (always visible in top bar).
- Clicking opens a list of prompt names from the JSON config.
- Each prompt entry has:
  - **Click** → pastes the prompt text into the Lovable editor text area (target XPath — to be provided by user).
  - **Copy icon** → copies prompt text to clipboard.

**Config delivery:**
- The prompts JSON is loaded via `window.__MARCO_CONFIG__.prompts` (same pattern as existing config).
- The Chrome Extension seeds this alongside `macro-controller-config.json`.

### Open Items
- [ ] **User to provide**: XPath of the Lovable editor text area for paste target.
- [ ] **User to provide**: Initial list of prompts (names + text).

### Acceptance Criteria
- Prompts load from JSON config (not hardcoded).
- Dropdown shows all prompt names.
- Click pastes into Lovable editor; copy button copies to clipboard.
- Works when injected by extension or manually via console.

---

## T-4: Manual-Only Injection (No Auto-Inject)

### Problem
The macro controller script currently auto-injects on every `lovable.dev` navigation, including login/signup pages where it's not needed and intrusive.

### Design
- **Remove** the `webNavigation.onCompleted` auto-injection for the macro controller script.
- **Add** a manual trigger: user clicks a button in the Popup or presses a hotkey to inject.
- **URL guard**: Even on manual trigger, only inject on project pages (`lovable.dev/projects/*`), never on:
  - `/login`
  - `/signup`
  - `/` (homepage)
  - `/settings` (unless explicitly on a project settings page)

### Approach
1. In `src/background/auto-injector.ts`: add URL pattern exclusion for non-project pages.
2. Change the default injection mode from "auto" to "manual" for the macro-looping script.
3. Add a "Run Script" button in the Popup that triggers `chrome.scripting.executeScript` on demand.
4. Optionally: keep auto-inject as a toggle in Options (default OFF).

### Acceptance Criteria
- Navigating to `lovable.dev/login` does NOT inject the script.
- Script only injects when user explicitly triggers it.
- Project page URL pattern: `https://lovable.dev/projects/*`

---

## T-5: Collapsible Sections with +/− Toggles

### Problem
Sections like Work History, XPath Configuration, Show Activity, JS Log, and JS Executor take up too much vertical space in the macro controller overlay.

### Design
Each section gets a **header bar** with:
- Section title (e.g., "Work History")
- `[+]` / `[−]` toggle button on the right
- Default state: **collapsed** (minimized)
- Click toggles between expanded and collapsed
- State persists in `localStorage` key per section

### Sections to make collapsible:
1. Work History
2. XPath Configuration
3. Show Activity
4. JS Log
5. JS Executor

### Acceptance Criteria
- All 5 sections are collapsed by default.
- Clicking `[+]` expands, clicking `[−]` collapses.
- Collapse state survives page reload (localStorage).
- No layout shift or glitch on toggle.

---

## T-6: Always Show Credit Icons (Even When Zero)

### Problem
When a credit category (total, rollover, daily, trial) has a value of zero, its icon gets hidden, causing the progress bar layout to shift and break visually.

### Design
- **Never hide** credit category icons based on their value.
- When value is zero, show the icon + "0" (or "0%") — same layout as non-zero.
- Icons for ALL categories must always be rendered:
  - Total credits
  - Rollover credits
  - Daily credits
  - Trial credits

### Acceptance Criteria
- All 4 credit icons are visible regardless of value.
- Progress bar layout is identical whether values are zero or non-zero.
- No CSS `display:none` or `visibility:hidden` based on zero values.

---

## Implementation Order (Suggested)

1. **T-4** (Manual-only injection) — prevents the script from injecting where it shouldn't; foundational change.
2. **T-6** (Credit icons always visible) — quick fix, improves stability.
3. **T-1** (Popup text glitch) — bug fix, independent of other tasks.
4. **T-5** (Collapsible sections) — UI improvement, prepares layout for T-2.
5. **T-2** (Menu button consolidation) — major UI restructure.
6. **T-3** (Prompt selector) — new feature, depends on T-2 menu structure + user-provided XPath.

---

## Open Questions for User

1. **T-3**: What is the XPath of the Lovable editor text area where prompts should be pasted?
2. **T-3**: Can you provide the initial list of prompts (name + text) for the JSON config?
3. **T-2**: Should the Start/Stop toggle use the Marco logo specifically, or a generic play/stop icon?
4. **T-4**: Do you want a keyboard shortcut for manual injection, or just the Popup button?
