---
name: standards/error-message-format
description: Mandatory structured multi-line format for all namespace/runtime error messages
type: preference
---

All namespace-access and runtime-failure error messages MUST use the structured multi-line
format produced by `buildNamespaceDiagnostic()` in
`standalone-scripts/macro-controller/src/api-namespace.ts`. Never write a vague message
like "Failed to access X namespace" — that says nothing.

## Required fields (in this order)

```
❌ [<Project> v<VERSION>] <one-line headline>
Lookup:   <full window.* path that was attempted>
Missing:  <the specific key/branch that failed, with disambiguation>
CalledBy: <function() @ file.ts (and parent caller if relevant)>
Reason:   <root-cause diagnosis in plain English>
Cause:    <toErrorMessage(e) of the caught error>
Stack:
<filtered stack — strip chunk-*.js and /assets/*.js lines, keep top 6 frames>
```

## Why

- AI debugging tools and humans both need: WHAT was looked up, WHAT was missing,
  WHO invoked the lookup, WHY it failed, and the version.
- Stack traces from build chunks (`chunk-*.js`, `assets/*.js`) carry zero
  diagnostic value — strip them (matches existing `preferences/stack-trace-filtering`).
- No Lovable URLs, no project URLs, no marketing text in error messages.

## Toast vs log

- **Log** (via `logError`/`Logger.error`): full multi-line diagnostic.
- **Toast** (user-visible): single-line summary including version + location, and a
  hint that the full diagnostic is in the console. Never spam toasts in a loop —
  the underlying call site should dedupe before showing.

## Shared types

Per-project SDK namespaces are typed in
`standalone-scripts/types/riseup-namespace.d.ts`. Use `RiseupAsiaProjectBase<TApi, TInternal>`
when declaring a new project. Generic `<T>` escape hatches go ONLY at extensible leaves —
never at the root or on `meta`.
