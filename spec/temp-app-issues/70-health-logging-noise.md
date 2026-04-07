# Issue 70 — Health Recovery Logs Flooding Console

**Date**: 2026-03-25  
**Status**: Fixed (recoverHealth() returns early when already HEALTHY)  
**Severity**: Low  
**Component**: Health Handler, Storage Auto-Pruner

---

## Issue Summary

The console output is flooded with repeated `[health] Recovered to HEALTHY` messages. The user reports seeing this message many times, cluttering the service worker console and making it harder to find meaningful logs.

## Root Cause

`recoverHealth()` in `src/background/health-handler.ts` (line 65-68) **always** logs `console.log("[health] Recovered to HEALTHY")` regardless of whether the state was already `HEALTHY`.

This function is called by `checkAndAutoPrune()` in `src/background/storage-auto-pruner.ts` (line 92) on every prune cycle when the row count is below the healthy threshold. Since the auto-pruner runs frequently, and the system is almost always healthy, this produces constant noise.

## Solution Direction

Only log recovery when actually transitioning **from a non-healthy state**:

```typescript
export function recoverHealth(): void {
    const currentState = getHealthState();
    if (currentState === "HEALTHY") return; // Already healthy — no-op
    setHealthState("HEALTHY");
    console.log(`[health] ${currentState} → HEALTHY (recovered)`);
}
```

This makes the function idempotent and silent when nothing changed.

## Done Checklist

- [ ] `recoverHealth()` checks current state before logging
- [ ] No console output when already HEALTHY
- [ ] Existing tests still pass (idempotent test should still work)
