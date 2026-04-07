# RC-02: Missing Startup Toast / Notification Bar

**Parent:** [01-overview.md](./01-overview.md)
**Status:** 🔴 Open

---

## Symptom

When the macro controller starts loading, no toast or notification bar appears. The user sees no visual feedback for several seconds.

## Root Cause

### Direct Cause: Toast depends on SDK `window.marco.notify`

In `startup.ts` line 101:
```ts
showToast('MacroLoop v' + VERSION + ' loading workspace...', 'info', { noStop: true });
```

`showToast()` (in `toast.ts`) delegates to `getNotify()` which looks for `window.marco.notify`. If the SDK hasn't been injected yet (it's injected as a separate script), `getNotify()` returns `null` and the toast is **queued** via `enqueueToast()`.

The queue drain timer polls every 250ms (`TOAST_QUEUE_POLL_MS`) for the SDK. But:
- If SDK loads 1-2s later, the toast appears AFTER the loading phase
- If SDK never loads (CSP block, error), the toast is never shown
- Queue entries expire after 30s (`TOAST_QUEUE_TTL_MS`)

### Contributing Factor: No DOM-based fallback

The toast system has NO fallback that works without the SDK. Even a simple `div` appended to `document.body` would suffice as early feedback.

## Proposed Fix Path

1. **Add standalone DOM toast for startup** — before calling `showToast()`, inject a simple styled `<div>` directly into the DOM:
   ```ts
   const startupToast = document.createElement('div');
   startupToast.id = 'marco-startup-toast';
   startupToast.textContent = 'MacroLoop v' + VERSION + ' loading...';
   startupToast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;...';
   document.body.appendChild(startupToast);
   ```
2. **Dismiss DOM toast when SDK toast is ready** — once `getNotify()` returns non-null, remove the DOM fallback and show the real toast.
3. **Use the existing `toast.html` template** — the project already has `standalone-scripts/macro-controller/templates/toast.html` that could be used.

## Impact

Users report "nothing happens" when clicking scripts. This is the **first UX fix** in the task sequence.

## Acceptance Criteria

- [ ] A visible notification appears within 100ms of script injection
- [ ] The notification shows version number and "loading" status
- [ ] The notification is replaced by the SDK toast once SDK is available
- [ ] If SDK never loads, the DOM toast remains visible with a timeout dismiss
