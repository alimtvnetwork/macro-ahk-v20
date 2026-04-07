# Issue 16: ComboSwitch Completely Broken After v6.56 Fast-Path Optimization

**Version**: v7.0
**Date**: 2026-02-20
**Status**: Resolved

---

## Issue Summary

### What happened

Combo Up/Down was completely non-functional. Transfer button detection failed with all 5 methods (XPath, text scan, CSS, ARIA, proximity). combo.js never executed — no console output at all.

### Symptoms and impact

**Critical** — entire ComboSwitch feature broken. Only xpath-utils.js executed; combo.js paste went nowhere.

---

## Root Cause Analysis

### Two root causes working together

#### Root Cause #1: JsInject.ahk Fast-Path Lost Console Focus

The v6.56 "optimization" skipped the F12 close/reopen cycle:
```autohotkey
; v6.56 BROKEN fast path:
} else {
    SendKey("^+j", "Re-focus DevTools Console (fast path)")
    Sleep(500)
}
```

When DevTools was already open with console output from xpath-utils.js, `Ctrl+Shift+J` alone did NOT reliably focus the console input. Cursor could land on console output area, a different panel, or autocomplete overlay → `Ctrl+V` pasted into nowhere.

#### Root Cause #2: combo.js Config Placeholders Had No Fallbacks

Config-driven placeholders returned `null` when unreplaced, disabling all non-XPath detection methods.

### Why Both Were Needed

RC#1 alone would break ALL scripts. RC#2 alone would only break detection if XPath also failed. Together: combo.js was never injected AND if it had been, detection would fail.

---

## Fix Description

1. **Reverted to F12→Ctrl+Shift+J cycle** (guaranteed fresh console with input focused)
2. **Added `|| hardcodedDefault` fallbacks** to all ELEMENTS descriptor fields

---

## Prevention and Non-Regression

### Prevention rules

> **RULE 1**: NEVER optimize away the F12 close/reopen cycle in JsInject.ahk — Ctrl+Shift+J alone is NOT reliable for refocusing an already-open console.

> **RULE 2**: Config-driven values MUST always have hardcoded fallbacks via `|| defaultValue`.

> **RULE 3**: Always test multi-script injection sequences (xpath-utils.js + combo.js).

---

## Done Checklist

- [x] JsInject.ahk reverted to working cycle
- [x] combo.js fallbacks added
- [x] Issue write-up created
