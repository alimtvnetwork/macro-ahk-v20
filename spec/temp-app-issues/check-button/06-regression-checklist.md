# Regression Checklist: Check Button, Force Move & Auth Panel Controls

**Version:** v7.19+  
**Related Issue:** #32  
**Last Updated:** 2026-03-04

---

## Purpose

Prevent regressions on repeatedly-broken flows:
1. **Check button** availability and cooldown behavior
2. **Force Move buttons** (⏫/⏬) cooldown behavior
3. **Macro Auth panel** drag / minimize / close / reopen

Run this checklist after any change to:
- `macro-looping.js`
- `01-script-direct-copy-paste.js`
- `standalone-scripts/macro-controller/macro-controller.js`
- `chrome-extension/src/background/default-scripts-seeder.ts`

---

## A) Check Button

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| A1 | Click Check while loop is **stopped** | `runCheck()` executes, button shows "⏳ Checking…" then resets to "Check" | ☐ |
| A2 | Click Check while loop is **running** and `isDelegating === false` | Check executes normally (not blocked) | ☐ |
| A3 | Click Check while `isDelegating === true` | Button flashes 50% opacity, logs "Check blocked", does **not** run | ☐ |
| A4 | **Double-click** Check rapidly | Second click is ignored (cooldown guard: `checkInFlight` flag) | ☐ |
| A5 | Check button after `runCheck()` **rejects** (error) | Button resets to "Check" + opacity 1 + pointer-events auto | ☐ |
| A6 | Check button text during flight | Shows "⏳ Checking…", opacity 0.6, pointer-events none | ☐ |
| A7 | Verify `01-script-direct-copy-paste.js` has identical logic | Diff check — onclick handler matches `macro-looping.js` | ☐ |

### Anti-Patterns (must NOT be present)

- ❌ `countdown > N` as a blocking condition for Check
- ❌ Silent `runCheck()` call without `.catch()`
- ❌ No cooldown guard (missing `checkInFlight` flag)

---

## A2) Force Move Buttons (⏫ Move Up / ⏬ Move Down)

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| FM1 | Click ⏫ Move Up once | `moveToAdjacentWorkspace('up')` fires, button shows "⏳ Moving Up…" | ☐ |
| FM2 | Click ⏬ Move Down once | `moveToAdjacentWorkspace('down')` fires, button shows "⏳ Moving Down…" | ☐ |
| FM3 | **Double-click** ⏫ rapidly | Second click ignored (`forceMoveInFlight` guard) | ☐ |
| FM4 | Click ⏬ while ⏫ is in-flight | Click ignored — both buttons disabled simultaneously | ☐ |
| FM5 | Both buttons during flight | opacity 0.5, pointer-events none on **both** buttons | ☐ |
| FM6 | After 8s timeout | Both buttons reset: labels restore, opacity 1, pointer-events auto | ☐ |
| FM7 | Verify `01-script-direct-copy-paste.js` has identical logic | Diff check — onclick/cooldown matches `macro-looping.js` | ☐ |

### Anti-Patterns (must NOT be present)

- ❌ Individual button cooldowns (both must lock together)
- ❌ Missing `forceMoveInFlight` flag
- ❌ No timeout reset (buttons stuck disabled permanently)

---

## B) Macro Auth Panel — Controls

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| B1 | **Drag** panel by header | Panel moves with pointer; position switches from `right/bottom` to `left/top` | ☐ |
| B2 | **Minimize** (`[-]` button) | Content body hides, header stays visible, button toggles to `[+]` | ☐ |
| B3 | **Expand** (`[+]` button) | Content body reappears | ☐ |
| B4 | **Close** (`[x]` button) | Panel removed from DOM, log says "use showAuthPanel() to reopen" | ☐ |
| B5 | **Reopen** via `🔓 Auth` button in MacroLoop UI | `window.__MARCO__.showAuthPanel()` called, panel reappears | ☐ |
| B6 | **Reopen** via console `window.__MARCO__.showAuthPanel()` | Panel reappears | ☐ |
| B7 | Panel persists after SPA navigation (MutationObserver) | Panel re-created if React removes it | ☐ |

### Files to Verify

| File | Has drag? | Has minimize? | Has close? |
|------|-----------|---------------|------------|
| `macro-controller.js` | ☐ | ☐ | ☐ |
| `default-scripts-seeder.ts` | ☐ | ☐ | ☐ |

---

## C) Cross-File Sync

| # | Check | Pass? |
|---|-------|-------|
| C1 | `macro-looping.js` Check onclick === `01-script-direct-copy-paste.js` Check onclick | ☐ |
| C2 | `macro-looping.js` Force Move cooldown === `01-script-direct-copy-paste.js` Force Move cooldown | ☐ |
| C3 | `macro-controller.js` auth panel controls === `default-scripts-seeder.ts` auth panel controls | ☐ |
| C4 | `🔓 Auth` reopen button present in both `macro-looping.js` and `01-script-direct-copy-paste.js` | ☐ |

---

## When to Run

- Before any release touching the files listed above
- After refactoring UI builder functions
- After modifying `state.isDelegating`, `runCheck()`, or `moveToAdjacentWorkspace()` logic
