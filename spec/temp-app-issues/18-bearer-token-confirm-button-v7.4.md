# Issue 18: Bearer Token Validation & Confirm Button False Positive

**Version**: v7.4
**Date**: 2026-02-21
**Status**: Resolved

---

## Issue Summary

### What happened

Four issues discovered in v7.4:

1. **ValidateEnums() did not halt on failure**: Logged error but automation continued → crash later with unhelpful "class not found"
2. **Bearer token input had no validation**: Empty or whitespace-only tokens could be saved, overriding cookie-session fallback
3. **Clear All Data didn't reset token input**: UI showed stale token after clearing (already fixed in code)
4. **Confirm button text scan matched "Save Token"**: The broad `"Save"` substring in `textMatch` list matched the bearer token UI's "Save Token" button instead of "Confirm transfer"

### Symptoms (Issue 4)

Combo switch silently failed — clicked "Save Token" button instead of "Confirm transfer" → triggered token validation rejection (`WARN: Rejected empty/whitespace-only token`) → transfer never confirmed.

---

## Root Cause Analysis (Issue 4)

`findElement` Method 2 (text scan) used `indexOf` substring matching against `['Confirm', 'Confirm transfer', 'Save']`. The `"Save"` entry was too broad and matched the bearer token UI's "Save Token" button.

---

## Fix Description

1. **ValidateEnums**: Now shows MsgBox on failure → OK exits, Cancel continues for debugging
2. **Token validation**: Rejects empty/whitespace-only and tokens < 10 chars with visual feedback
3. **Confirm button**: Removed `"Save"` from textMatch, reordered to `['Confirm transfer', 'Confirm']`, added `textMatchExact: true` flag for strict equality matching
4. **findElement**: Added `textMatchExact` flag support — any descriptor can opt into exact-match mode

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Text scan matchers for button detection MUST use the most specific text first and consider all buttons on the page. Use `textMatchExact: true` when substring matching would cause false positives.

---

## Done Checklist

- [x] All 4 issues fixed
- [x] Issue write-up created
