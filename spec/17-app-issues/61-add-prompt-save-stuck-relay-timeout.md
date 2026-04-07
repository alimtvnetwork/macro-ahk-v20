# Issue 61: Add Prompt Save Button Stuck on "Saving…"

**Version**: v1.62.0  
**Date**: 2026-03-22  
**Status**: Fixed

---

## Symptom

When users open **Add New Prompt** and click **Save**, the button sometimes stays in `⏳ Saving…` indefinitely and the modal never closes.

---

## Root Cause

The macro controller's relay messaging helper (`sendToExtension`) had two reliability gaps:

1. **No timeout callback path** in postMessage relay mode:
   - If no response arrived from the extension bridge, the listener was removed after 5s but callback was **not invoked**.
   - Save flow depended on callback to restore button state (`disabled=false`, text reset), so UI remained stuck.

2. **Narrow relay payload forwarding**:
   - Relay posted only `prompt` and `promptId` fields instead of forwarding generic payload keys.
   - This made the helper brittle for non-prompt endpoints and harder to debug.

Additionally, content relay blocked/rate-limited paths returned early without posting an explicit error response, which could also leave caller state unresolved.

---

## Fix

### A) `standalone-scripts/macro-controller/src/ui/prompt-manager.ts`
- Updated `sendToExtension(...)` to:
  - always call callback on relay timeout with `{ isOk:false, errorMessage:'Extension relay timeout' }`
  - forward full payload (`...(payload || {})`) in relay mode
  - guard callback settlement to avoid duplicate invocations

### B) `src/content-scripts/message-relay.ts`
- Updated page message handling to always respond with an error payload for:
  - disallowed message types
  - relay rate-limit drops

This guarantees the caller always receives a terminal response and can unfreeze UI state.

---

## Validation

- Click **Add New Prompt → Save** under normal conditions: success toast + modal closes.
- Simulate missing relay response / blocked type: Save path receives error response and button resets from `Saving…`.

---

## File References

- `standalone-scripts/macro-controller/src/ui/prompt-manager.ts`
- `src/content-scripts/message-relay.ts`
- `spec/17-app-issues/61-add-prompt-save-stuck-relay-timeout.md`
