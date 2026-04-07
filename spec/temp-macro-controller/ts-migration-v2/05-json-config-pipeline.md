# Phase 05 — JSON Config Injection Pipeline

**Priority**: Medium
**Status**: ✅ Complete

---

## Question

How is the JSON configuration injected into the TypeScript macro controller, and what is the processing pipeline?

---

## Current Flow

### Injection Chain

```
1. Chrome Extension stores config in chrome.storage.local
   └── Key: "marco_all_configs" → array of ConfigEntry objects
   
2. Extension background prepares injection payload
   └── src/background/handlers/script-injection-handler.ts
   
3. Content script injects into MAIN world:
   └── window.__MARCO_CONFIG__ = { ...configJSON };
   └── window.__MARCO_THEME__  = { ...themeJSON };
   └── window.__MARCO_PROMPTS__ = [ ...promptEntries ];
   
4. macro-looping.ts reads at module load time:
   └── shared-state.ts line 13: const cfg = window.__MARCO_CONFIG__ || {};
   └── shared-state.ts line 24: const themeRoot = window.__MARCO_THEME__ || {};
```

### Source Files

| File | Role |
|------|------|
| `standalone-scripts/macro-controller/02-macro-controller-config.json` | Default config (source of truth) |
| `standalone-scripts/macro-controller/04-macro-theme.json` | Default theme |
| `standalone-scripts/prompts/` | Folder-based prompts |
| `src/background/handlers/script-injection-handler.ts` | Reads config from storage, injects as globals |
| `standalone-scripts/macro-controller/src/shared-state.ts` | Parses `window.__MARCO_CONFIG__` at load |
| `standalone-scripts/macro-controller/src/types.ts` | TypeScript interfaces for config/theme |

### Config Schema

Defined in `types.ts` as `MacroControllerConfig`:
```typescript
interface MacroControllerConfig {
  schemaVersion?: number;
  description?: string;
  comboSwitch?: ComboSwitchConfig;
  macroLoop?: MacroLoopConfig;         // timing, xpaths, elementIds, urls
  creditStatus?: CreditStatusConfig;   // API base, endpoints, refresh interval
  general?: GeneralConfig;             // logLevel, maxRetries
  autoAttach?: AutoAttachConfig;       // URL patterns → script groups
}
```

---

## Pipeline Diagram

```
[02-macro-controller-config.json]     [04-macro-theme.json]     [prompts/*/info.json]
          │                                    │                         │
          ▼                                    ▼                         ▼
  [Chrome Extension Storage]          [Chrome Extension Storage]  [aggregate-prompts.mjs]
  (chrome.storage.local)              (chrome.storage.local)      → bundled JSON
          │                                    │                         │
          ▼                                    ▼                         ▼
  [script-injection-handler.ts]       [script-injection-handler]  [Seeder → SQLite]
          │                                    │                         │
          ▼                                    ▼                         ▼
  window.__MARCO_CONFIG__             window.__MARCO_THEME__      window.__MARCO_PROMPTS__
          │                                    │                         │
          ▼                                    ▼                         ▼
  shared-state.ts (parse)             shared-state.ts (resolve)   macro-looping.ts (read)
          │                                    │
          ▼                                    ▼
  Exported constants:                 Exported color/layout vars:
  IDS, TIMING, CONFIG                 cPrimary, lPanelRadius, etc.
```

---

## Validation

Currently there is **no runtime validation** of the injected JSON. If the config has wrong types or missing fields, `shared-state.ts` uses fallback defaults via `||` operators.

### Proposed: Schema Validation Layer

```typescript
import { MacroControllerConfig } from './types';

export function validateConfig(raw: unknown): MacroControllerConfig {
  const cfg = (raw || {}) as Partial<MacroControllerConfig>;
  
  // Validate schema version
  if (cfg.schemaVersion && cfg.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    console.warn('[Config] Schema version ' + cfg.schemaVersion + ' is newer than supported');
  }
  
  // Deep-merge with defaults
  return deepMerge(DEFAULT_CONFIG, cfg);
}
```

---

## Tasks

| # | Task | Effort | Status |
|---|------|--------|--------|
| 05.1 | Document current injection flow (this spec) | Done | ✅ |
| 05.2 | Add `validateConfig()` with deep-merge defaults | 2h | ✅ |
| 05.3 | Add `validateTheme()` with preset fallback | 1h | ✅ |
| 05.4 | Log validation warnings for missing/invalid fields | 1h | ✅ |

---

## Acceptance Criteria

1. [x] Config injection pipeline fully documented (this file)
2. [x] Runtime validation catches invalid schema versions
3. [x] Missing config fields fall back to documented defaults
4. [x] Validation warnings appear in activity log (not console spam)
