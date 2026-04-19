---
name: architecture/shared-sdk-namespace-types
description: Global types for window.RiseupAsiaMacroExt.* live in a single shared .d.ts file
type: feature
---

The single source of truth for the SDK global namespace
(`window.RiseupAsiaMacroExt.Projects.<CodeName>.*`) is:

```
standalone-scripts/types/riseup-namespace.d.ts
```

This file is included by:
- `tsconfig.macro.json`
- `tsconfig.macro.build.json`
- `tsconfig.sdk.json`
- `tsconfig.xpath.json`

## Rules

1. **No `any`.** No bare `unknown` index signatures in the public surface.
2. Per-project namespaces extend `RiseupAsiaProjectBase<TApi, TInternal>` so each
   project declares its own typed `api` / `_internal` shape.
3. Generic `<T>` escape hatches go ONLY at extensible leaves
   (e.g. KV value types, project meta extension fields). Never at the root.
4. Per-project `globals.d.ts` files MUST NOT re-declare
   `RiseupAsiaMacroExtNamespace`, `RiseupAsiaProject`, `RiseupAsiaCookieBinding`,
   or the bare `RiseupAsiaMacroExt` const. Reference the shared file instead.
5. The bare global `RiseupAsiaMacroExt` is declared once in the shared file —
   duplicate `const` declarations are a TS error.

## Why

- One declaration → no drift between projects.
- Hand-off to other AI models stays clean: a single file describes the entire
  per-project SDK contract.
- Concrete `TApi` / `TInternal` generics give compile-time safety inside each
  project (e.g. `MacroControllerNamespace` extends the base with its real shapes).
