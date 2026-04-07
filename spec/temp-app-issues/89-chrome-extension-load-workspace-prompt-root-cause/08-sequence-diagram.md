# Sequence Diagrams — Issue #89

## Current Flow (with delays highlighted)

```
User                  Popup           Background SW        Content Script       Macro Controller
 │                     │                   │                    │                     │
 ├─ Click script ─────►│                   │                    │                     │
 │                     ├─ INJECT_SCRIPTS ──►│                   │                     │
 │                     │                   ├─ readAllProjects() │                     │
 │                     │                   │  [~200-500ms]      │                     │
 │                     │                   ├─ resolveScriptBindings()                 │
 │                     │                   │  ├─ readScriptStore() [~100ms]           │
 │                     │                   │  ├─ readConfigStore() [~100ms]           │
 │                     │                   │  └─ per script:                          │
 │                     │                   │     ├─ getCachedScriptCode() [~5ms]      │
 │                     │                   │     └─ fetch() on miss [~200-500ms each] │
 │                     │                   │  [TOTAL: ~1-5s]    │                     │
 │                     │                   ├─ bootstrapNamespaceRoot() [~200ms]       │
 │                     │                   ├─ ensureRelay() [~200ms]                  │
 │                     │                   ├─ seedTokens() [~100ms]                   │
 │                     │                   │  [SERIAL: ~500ms]  │                     │
 │                     │                   ├─ executeScript(sdk) [~150ms]             │
 │                     │                   ├─ executeScript(xpath) [~150ms]           │
 │                     │                   ├─ executeScript(macro) [~150ms]           │
 │                     │                   │  [SERIAL: ~450ms]  │                     │
 │                     │                   ├─ inject namespaces  │                     │
 │                     │                   │                    │  ┌─ bootstrap()      │
 │  [NO FEEDBACK]      │                   │                    │  │                   │
 │  [~3-8s gap]        │                   │                    │  ├─ showToast() ─────► QUEUED (no SDK)
 │                     │                   │                    │  ├─ ensureTokenReady(2s)
 │                     │                   │                    │  │  [0-2s wait]      │
 │                     │                   │                    │  ├─ fetchCredits + tier1
 │                     │                   │                    │  │  [500-2000ms]     │
 │                     │                   │                    │  ├─ createUI()       │
 │  UI appears ◄───────┼───────────────────┼────────────────────┼──┤                   │
 │  [7-8s total]       │                   │                    │  └─ workspace retry  │
```

## Expected Flow (Optimized)

```
User                  Popup           Background SW        Content Script       Macro Controller
 │                     │                   │                    │                     │
 ├─ Click script ─────►│                   │                    │                     │
 │                     ├─ INJECT_SCRIPTS ──►│                   │                     │
 │                     │                   ├─ BATCH read (scripts+configs) [~100ms]   │
 │                     │                   ├─ resolveScripts (all cache HIT) [~20ms]  │
 │                     │                   ├─ PARALLEL: namespace+relay+tokens [~200ms]
 │                     │                   ├─ SINGLE executeScript (concatenated) [~150ms]
 │                     │                   │                    │  ┌─ bootstrap()      │
 │  DOM toast ◄────────┼───────────────────┼────────────────────┼──┤ IMMEDIATE         │
 │  [~500ms]           │                   │                    │  ├─ token (instant)  │
 │                     │                   │                    │  ├─ PARALLEL: credits+prompts+workspace
 │  UI ready ◄─────────┼───────────────────┼────────────────────┼──┤ [~500ms]          │
 │  [≤1s total]        │                   │                    │  └─ done             │
```
