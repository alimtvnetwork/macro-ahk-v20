# Issue 40: Auto-Injector ResolutionResult Type Mismatch

**Version**: v1.16.1
**Date**: 2026-03-15
**Status**: Resolved

---

## Issue Summary

### What happened

`resolveScriptBindings()` was updated to return a `ResolutionResult` object (`{ resolved, skipped }`) but `auto-injector.ts` still destructured the return value as a flat array, causing a `TypeError` at runtime.

### Where it happened

- **Feature**: Auto-injection pipeline
- **Files**: `chrome-extension/src/background/auto-injector.ts`
- **Functions**: `processPageNavigation()`

### Symptoms and impact

Auto-injection silently failed on every page navigation. No scripts were injected into matching tabs. No visible error in the popup since the failure occurred in the background service worker.

### How it was discovered

Code audit comparing `script-resolver.ts` return type against all call sites.

---

## Root Cause Analysis

### Direct cause

`processPageNavigation()` assigned the `ResolutionResult` object directly to a variable and passed it to `injectResolvedScripts()` which expected `ResolvedScript[]`. The `.resolved` property was never accessed.

### Contributing factors

1. No TypeScript strict return-type annotation on `resolveScriptBindings` at the time of the interface change
2. The `injection-request-resolver.ts` handler was updated correctly but `auto-injector.ts` was missed

### Triggering conditions

Any page navigation matching a project URL rule.

### Why the existing spec did not prevent it

The spec defined the resolution interface but did not mandate a call-site audit checklist when changing shared function signatures.

---

## Fix Description

### What was changed in the spec

Added call-site audit requirement when modifying shared function return types.

### The new rules or constraints added

> When changing a shared function's return type, all call sites must be verified in the same commit.

### Why the fix resolves the root cause

Changed `auto-injector.ts` line 70 from:
```ts
const resolution = await resolveScriptBindings(bindings);
await injectResolvedScripts(tabId, resolution.resolved);
```
Previously it treated the result as a flat array. Now it correctly destructures `.resolved`.

### Config changes or defaults affected

None.

### Logging or diagnostics required

Existing `[auto-injector]` log lines already cover injection counts.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: When changing a shared function's return type, grep all call sites and update them in the same change.

### Acceptance criteria / test scenarios

1. `auto-injector` calls `resolveScriptBindings()` and accesses `.resolved` property
2. `injection-pipeline-integration.test.ts` verifies end-to-end injection with `ResolutionResult` shape
3. `script-resolver.test.ts` asserts return type is `{ resolved, skipped }`

### Guardrails

TypeScript strict mode catches this if return types are explicitly annotated.

### References to spec sections updated

- `spec/17-app-issues/readme.md` — index entry added

---

## Done Checklist

- [x] Spec updated under `/spec/10-macro-controller/`
- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Memory updated with summary and prevention rule
- [x] Acceptance criteria updated or added
- [x] Iterations recorded if applicable
