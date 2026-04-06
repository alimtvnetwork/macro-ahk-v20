# 05 — Engineering Standards

**Version**: v7.17
**Last Updated**: 2026-02-25

These rules were established through bug fixes and lessons learned. Every AI and developer working on this codebase MUST follow them.

---

## Standards

### 1. Root Cause Analysis First
No fix attempted without documented RCA. Every significant bug fix gets an issue write-up in `/spec/02-app-issues/NN-{slug}.md` with RCA, fix description, and prevention rules.

### 2. Known-Good State Wins
When a user action (API move, combo switch) deterministically sets state, no background poll or fallback may override it. The authoritative state from a successful operation always takes priority over subsequent DOM observations or refresh cycles.

### 3. UI Sync Completeness
After any state change (workspace switch, credit refresh, move), ALL UI sections must update: header, NOW label, workspace list CURRENT marker, credit display, progress bar.

### 4. Side Effect Awareness
Every code change must consider all downstream consumers. Modifying a credit refresh function? Check if it triggers workspace detection. Changing a keyboard handler? Verify it doesn't conflict with other shortcuts.

### 5. API-First, DOM-Fallback
Prefer API data (`fetch()` calls) over DOM scraping. Use DOM-based detection only when the API fails. The API result is always more reliable than XPath-scraped values.

### 6. DOM Validation Required
Any workspace name obtained from DOM scraping (MutationObserver, XPath, auto-discovery) MUST be validated against the known workspace list via `isKnownWorkspaceName()` before being set as `state.workspaceName`.

### 7. Guard Flags Must Be SET and CHECKED
If a guard flag is declared (e.g., `state.workspaceFromApi`), it MUST be both SET to `true` at the appropriate point AND CHECKED in all guard clauses. A declared-but-never-set flag is a latent bug.

### 8. Comprehensive Fetch Logging
Every `fetch()` call MUST log: full URL, auth method, sanitized bearer token (first 12 chars + `...REDACTED`), request headers, request body, response status, statusText, content-type, content-length, and body preview (first 200 chars).

### 9. No Direct resp.json()
Always use `resp.text()` + `JSON.parse()` instead of `resp.json()`. This prevents crashes on empty response bodies (HTTP 200 with no content) and enables logging the raw response text for debugging.

### 10. Issue Write-Up Mandatory
Every bug fix MUST get a dedicated issue file at `/spec/02-app-issues/NN-{slug}.md` following the template: Summary, Root Cause Analysis, Fix Description, Iterations, Prevention, Done Checklist.

### 11. Post-Mutation No DOM Re-Detect
After a successful API mutation (move-to-workspace, transfer), do NOT run DOM-based workspace detection. Trust the API response. The credit refresh that follows the mutation must respect the authoritative state set by the mutation, not re-trigger XPath detection.

### 12. Trace ALL Call Paths
When fixing a bug, trace ALL code paths that reach the problematic function, not just the direct caller. A function may be called from refresh timers, user clicks, post-move handlers, and startup flows — each path may need the fix.

### 13. Keyboard Handler Placement
New keyboard shortcut handlers must be inserted BEFORE any early-return guards that would filter them out. An `if (!condition) return;` at the top of a keydown handler will silently block any handler placed below it.

### 14. Credit Bar Rendering Consistency
All credit bar renderings across the UI (top-level status bar, workspace items, tooltips) MUST use the shared `calcTotalCredits()` and `calcAvailableCredits()` helper functions. No inline credit arithmetic is allowed.

### 15. InjectJSQuick Must Not Activate Windows
`InjectJSQuick()` assumes the DevTools Console is already focused from a preceding `InjectViaDevTools()` call. It MUST NOT call `ActivateBrowserPage()` or any window activation function, as this steals focus from detached DevTools back to the browser page, causing paste to target the address bar.

### 16. Progress Bar Color Specification
Segment order (left to right): 🎁 **Bonus** (purple `#7c3aed→#a78bfa`) → 💰 **Monthly** (green `#22c55e→#4ade80`) → 🔄 **Rollover** (gray `#6b7280→#9ca3af`) → 📅 **Free** (yellow `#d97706→#facc15`). All rendering sites (macro-looping workspace items, macro-looping top-level bar, combo.js workspace items) MUST use this exact order and these exact colors.

### 17. Always Use ActivateBrowserPage()
ALL browser window activations MUST use `ActivateBrowserPage()`, never generic `WinActivate("ahk_exe " browserExe)`. The generic call may activate a DevTools window, causing address bar shortcuts (`Ctrl+L`) to fail silently. The only exception is `ActivateBrowserPage()` itself.

### 18. ClipWait Must Check Return Value
Every `ClipWait()` call MUST check its return value. On timeout (false), log an explicit error to both activity.txt and error.txt with the probable cause (e.g., wrong window activated).

### 19. WinWaitActive Mandatory After Window Activation
After activating a window for keyboard input, ALWAYS use `WinWaitActive("ahk_id " hwnd, , 3)` + `Sleep(browserActivateDelayMs)` before sending keystrokes. A `WinActivate` without `WinWaitActive` is unreliable — the window may not be ready to receive input, causing `Ctrl+L`, `Ctrl+C`, or paste commands to silently fail. See Issue #19.

### 20. Guard Flags Must Reset on Cycle Boundaries
Time-based guard flags (like `workspaceFromApi`) that block detection or refresh MUST be reset at each cycle boundary (e.g., every 50s loop). Guards that persist indefinitely across cycles cause state desync — the controller shows stale data even though the DOM has updated. Guards should only protect the immediate post-mutation window (e.g., 2s after a move), not subsequent cycles. See Issue #20.

### 21. Every Cycle Must Force Fresh Detection
Every periodic cycle (50s loop) and every manual Check MUST force fresh workspace detection via Project Dialog XPath. No cached state (`workspaceFromApi`, `workspaceName`) should persist across cycle boundaries. If the workspace changed externally, only fresh XPath detection will catch it. See Issue #20.

---

## Code Style Standards

These are approximation guidelines — some files may exceed slightly, but the intent is clear, maintainable code.

### 22. Small Functions (~15 lines)
Functions should be approximately 15 lines or fewer. If a function grows beyond this, extract sub-functions with descriptive names. Each function should do ONE thing.

### 23. Small Files (~200–300 lines)
Files should be approximately 200–300 lines. Large files should be split into logical sub-modules (e.g., `MacroLoop.ahk` → `MacroLoop/Globals.ahk`, `MacroLoop/Routing.ahk`, etc.).

### 24. Positive Conditions Only
Use positive boolean conditions. Never use `not` or negation in `if` statements — invert to meaningful variable names with `is`/`has` prefix.

**Do**: `isReady := !!value` then `if isReady { ... }`  
**Don't**: `if !value { return }` or `if not found { ... }`

### 25. Reuse via Functions
Common logic MUST be extracted into reusable functions. No copy-pasting of code blocks. Examples: `ActivateBrowserPage()` for window activation, `PasteAndExecute()` for clipboard injection, `calcTotalCredits()` for credit math.

### 26. Every Function Must Log
Every function MUST have at least one `InfoLog()` at entry. Key decision points and outcomes MUST be logged. Sub-actions use `SubLog()` for indented output. Error paths MUST use `ErrorLog()` which writes to error.txt with full stack trace.

---

## Anti-Patterns (What NOT To Do)

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|--------------|------------------|
| `resp.json()` directly | Crashes on empty 200 responses | `resp.text()` + `JSON.parse()` |
| Inline credit math (`_total = df + ro + ba`) | Diverges from formula; causes display mismatches | Use `calcTotalCredits()` helper |
| Setting `workspaceName` from DOM without validation | Picks up project names, nav text, garbage | Validate via `isKnownWorkspaceName()` |
| Placing keyboard handler after `if (!x) return` guard | Handler becomes unreachable dead code | Place handler BEFORE the guard |
| Running XPath detection after successful API move | Reads stale DOM; overwrites correct state | Skip detection; trust API response |
| `ActivateBrowserPage()` in InjectJSQuick | Steals focus from detached Console | Remove; assume Console is focused |
| Declaring guard flag but never setting it | DOM observers run unchecked; state corruption | SET the flag in the success path |
| `WinActivate("ahk_exe " browserExe)` for URL reading | May activate DevTools window; Ctrl+L fails | Use `ActivateBrowserPage()` |
| `WinActivate` without `WinWaitActive` before keystrokes | Window not ready; Ctrl+L/Ctrl+C silently fail | Add `WinWaitActive` + `Sleep` |
| Negative conditions (`if !x`, `if not found`) | Hard to read; inverted logic causes bugs | Assign to `isX` variable, check positive |
| Large monolithic functions (50+ lines) | Untestable; hard to debug; log gaps | Extract into ~15-line sub-functions |
| Copy-pasted code blocks | Diverges over time; fixes miss copies | Extract shared function |
| Editing archived version folders | Wastes effort; changes never used | Only edit `marco-script-ahk-v7.latest/` (see `/spec/11-folder-policy.md`) |
| Making code changes without user discussion | Causes frustration; wrong assumptions | ALWAYS discuss changes with user first |
| Silently swallowing 401/403 errors | User doesn't know token expired | Call `markBearerTokenExpired()` on auth failures |
| Aborting detection when API fails | Check button becomes useless | Fall through to XPath detection regardless |
