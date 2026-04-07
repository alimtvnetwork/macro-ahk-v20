# Issue 01: Profile Picker Appears When Chrome Is Already Running

**Version**: v1.5.0
**Date**: 2026-03-13
**Resolved**: 2026-03-15
**Status**: Resolved

---

## Issue Summary

### What happened

When `run.ps1 -d` is executed while Chrome is already running, Chrome opens its profile selection window instead of silently reloading the extension. The user must manually pick a profile, which defeats the purpose of automated deployment.

### Where it happened

- **Feature**: Deployment / `run.ps1` deploy strategy
- **Files**: `run.ps1` lines 539–561
- **Functions**: Deploy-Extension (reload strategy branch)

### Symptoms and impact

1. User runs `.\run.ps1 -d` while Chrome is open.
2. Chrome opens a **profile picker window** — an unnecessary interruption.
3. User must click the correct profile to dismiss it.
4. The extension hot-reload works regardless (the profile picker is a side effect of the unnecessary `Start-Process` call).

**Severity**: Low (cosmetic annoyance), but impacts developer experience on every deploy cycle.

### How it was discovered

Manual observation during iterative development — noticed profile picker appearing on every deploy when Chrome was already open.

---

## Root Cause Analysis

### Direct cause

In the reload strategy branch (line 534+), when `$isBrowserRunning` is `true`, the script correctly skips launching Chrome. **However**, at line 559–561, there is a `$isFirstLoad` path that calls:

```powershell
Start-Process -FilePath $browserExe -ArgumentList @("chrome://extensions/")
```

This launches a new Chrome process **without `--profile-directory`**, which causes Chrome to show the profile picker. Even when Chrome is already running, the `Start-Process` call sends a message to the existing Chrome process, but without profile context it defaults to the chooser.

Additionally, line 544–547 handles `$isLoadExtDisabled -and -not $isBrowserRunning` by launching Chrome with only `--profile-directory` but no `--no-startup-window` flag. When Chrome for Testing is not used, this can trigger profile picker behavior on some configurations.

### Contributing factors

1. **Missing `--profile-directory` on first-load launch** (line 561): `chrome://extensions/` is opened without specifying which profile.
2. **No guard against redundant launches**: The script doesn't check whether the specific profile is already active before launching.
3. **Chrome's profile routing behavior**: When an existing Chrome process receives a new `Start-Process` call without a matching `--profile-directory`, it shows the profile chooser.

### Triggering conditions

- Chrome is already running with any profile.
- `run.ps1 -d` is executed (without `-k` kill flag).
- The extension dist path has not been previously loaded (first-time scenario), OR Chrome v137+ forces the reload strategy.

### Why the existing spec did not prevent it

The deployment spec documented the three-tier strategy but did not specify behavior for the "browser running + first load" edge case. The profile picker side effect was not anticipated.

---

## Fix Description

### What should be changed

Two fixes in `run.ps1`:

**Fix 1 — Line 561**: Add `--profile-directory` to the first-load `chrome://extensions/` launch:

```powershell
# BEFORE (broken):
Start-Process -FilePath $browserExe -ArgumentList @("chrome://extensions/")

# AFTER (fixed):
Start-Process -FilePath $browserExe -ArgumentList @(
    "--profile-directory=`"$ProfileFolder`""
    "chrome://extensions/"
)
```

**Fix 2 — Skip launch entirely when browser is already running**: When `$isBrowserRunning` is `true`, there is no need to call `Start-Process` at all — even for the first-load case. Instead, display the `chrome://extensions/` URL for the user to open manually in their already-running browser.

```powershell
if ($isFirstLoad -and $isBrowserRunning) {
    # Don't launch — just tell the user to navigate
    Write-Host "  ℹ Open chrome://extensions/ in your running browser" -ForegroundColor Yellow
    Write-Host "  ℹ Click 'Load unpacked' and select: $extDistAbsolute" -ForegroundColor White
} elseif ($isFirstLoad -and -not $isBrowserRunning) {
    # Safe to launch — no existing process to conflict with
    Start-Process -FilePath $browserExe -ArgumentList @(
        "--profile-directory=`"$ProfileFolder`""
        "chrome://extensions/"
    )
}
```

### The new rules or constraints added

> **RULE**: Never call `Start-Process` for Chrome without `--profile-directory` when deploying. When Chrome is already running, prefer instructing the user over launching a new process.

### Why the fix resolves the root cause

- Adding `--profile-directory` ensures Chrome routes to the correct profile instead of showing the chooser.
- Skipping the launch entirely when Chrome is running avoids the profile picker altogether — the hot-reload mechanism handles the update without any new window.

### Config changes or defaults affected

None.

### Logging or diagnostics required

The deploy output should indicate which strategy was used:
- `"ℹ Browser running — skipping launch (hot-reload active)"`
- `"ℹ First load — open chrome://extensions/ manually"`

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: All `Start-Process` calls for Chrome in `run.ps1` MUST include `--profile-directory`. When the browser is already running, `Start-Process` MUST NOT be called — use console instructions instead.

### Acceptance criteria / test scenarios

1. `run.ps1 -d` with Chrome **not running** → Chrome launches directly into the correct profile with extension loaded. No profile picker.
2. `run.ps1 -d` with Chrome **already running** (first time) → No new window. Console shows instructions to manually load unpacked.
3. `run.ps1 -d` with Chrome **already running** (subsequent) → No new window. Console shows "auto-reload in ~2s". Hot-reload works.
4. `run.ps1 -d -k` → Chrome is killed, then cold-launched with extension. No profile picker.

### Guardrails

- Search `run.ps1` for any `Start-Process.*chrome` calls missing `--profile-directory` before each release.

### References to spec sections updated

- `spec/17-app-issues/issue-01-profile-picker.md` — this document

---

## TODO and Follow-Ups

1. [x] Apply Fix 1 and Fix 2 to `run.ps1`
2. [x] Test all 4 acceptance scenarios
3. [x] Update memory with the prevention rule

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Fix applied to `run.ps1`
- [x] Memory updated with prevention rule
- [x] Acceptance criteria verified
