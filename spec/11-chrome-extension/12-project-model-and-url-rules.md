# Chrome Extension — Project Model & URL Rules

**Version**: v0.2 (Expanded)
**Date**: 2026-02-28

---

## Purpose

Define the data model for **Projects**, **URL Rules**, and the matching logic that determines which scripts and configs are injected into which pages. This replaces the simple `scriptInjection.rules` from `07-advanced-features.md` with a richer, project-centric model.

---

## Concepts

| Concept | Description |
|---------|-------------|
| **Project** | A named group of URL rules, scripts, and configs. E.g., "Lovable Automation" or "Internal Dashboard" |
| **URL Rule** | A matching condition within a project: exact URL, prefix, or regex pattern |
| **Script Binding** | A JavaScript file + optional JSON config attached to a URL rule or project-wide |
| **Config Binding** | A JSON config file providing runtime settings injected into scripts |

---

## Data Model

### Project

```typescript
interface Project {
  id: string;            // UUID v4
  name: string;          // User-defined label, e.g. "Lovable Automation"
  description: string;   // Optional notes
  enabled: boolean;      // Master toggle
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  urlRules: UrlRule[];   // Ordered list
  defaultScripts: ScriptBinding[];  // Applied to all URL rules in this project if no rule-specific scripts
  defaultConfig: ConfigBinding | null;  // Default config for all scripts in this project
}
```

### URL Rule

```typescript
interface UrlRule {
  id: string;            // UUID v4
  projectId: string;     // Parent project
  name: string;          // User label, e.g. "Project pages"
  enabled: boolean;
  priority: number;      // Lower = higher priority. Default 100. Used for ordering when multiple rules match.
  matchMode: 'exact' | 'prefix' | 'regex';
  matchValue: string;    // The URL, prefix, or regex pattern
  // For matchMode='exact':  "https://lovable.dev/projects/abc-123"
  // For matchMode='prefix': "https://lovable.dev/projects/"
  // For matchMode='regex':  "^https://lovable\\.dev/projects/[a-f0-9-]+"
  excludePattern: string | null;  // Optional regex to exclude sub-paths
  scripts: ScriptBinding[];       // Scripts specific to this rule (override project defaults)
  config: ConfigBinding | null;   // Config specific to this rule (override project default)
  conditions: InjectionConditions;
}
```

### Script Binding

```typescript
interface ScriptBinding {
  id: string;            // UUID v4
  scriptId: string;      // References a Script in the script store
  configId: string | null; // Optional: override config for this specific script
  order: number;         // Injection order (lower = first)
  world: 'ISOLATED' | 'MAIN';  // Execution world
  runAt: 'document_start' | 'document_end' | 'document_idle';
}
```

### Config Binding

```typescript
interface ConfigBinding {
  id: string;
  configId: string;      // References a Config in the config store
  injectionMethod: 'global' | 'message';
  // 'global': sets window.__marcoConfig = configData before script runs (MAIN world only)
  // 'message': script requests config via chrome.runtime.sendMessage({ type: 'GET_CONFIG' }) (both worlds)
  // NOTE: Method 3 ('parameter') was removed — see 20-user-script-error-isolation.md §Deprecated
  globalVariableName: string;  // Only used when injectionMethod='global'. Default: '__marcoConfig'
}
```

### Injection Conditions

```typescript
interface InjectionConditions {
  requireElement: string | null;   // CSS selector that must exist in DOM
  requireCookie: string | null;    // Cookie name that must be present
  minDelayMs: number;              // Delay after page load. Default: 0
  requireOnline: boolean;          // Require network connectivity. Default: false
}
```

---

## URL Matching Logic

### Precedence

When a page loads, the extension evaluates all enabled projects and their enabled URL rules:

```
1. Collect all matching rules across all enabled projects
2. Sort by priority (lower number = higher priority)
3. Inject ALL matching rules' scripts in priority order
4. For each rule:
   a. Resolve config: rule.config > rule.scripts[n].configId > project.defaultConfig > bundled defaults
   b. Check conditions (element, cookie, delay)
   c. Inject scripts in order within the rule
```

### Match Mode Details

| Mode | `matchValue` Example | Matches |
|------|---------------------|---------|
| `exact` | `https://lovable.dev/projects/abc-123` | Only this exact URL (query params ignored) |
| `prefix` | `https://lovable.dev/projects/` | Any URL starting with this prefix |
| `regex` | `^https://lovable\\.dev/projects/[a-f0-9-]+` | Full regex test against complete URL |

### ⚠️ Regex Safety (R-13 Resolution)

User-entered regex patterns are validated **before saving** to prevent catastrophic backtracking (ReDoS):

#### Validation Rules

1. **Syntax check**: `new RegExp(pattern)` — catch `SyntaxError` and display inline error
2. **Length limit**: Max 500 characters
3. **Backtracking protection**: Execute regex against a 10,000-character test string with a **100ms timeout** using a worker or `setTimeout` watchdog
4. **Banned patterns**: Warn (not block) on patterns with nested quantifiers known to cause ReDoS:
   - `(a+)+` — nested plus
   - `(a*)*` — nested star
   - `(a+)*` — mixed nested quantifiers
   - `(.*a){10,}` — quantified groups with greedy wildcards

#### Implementation

```typescript
function validateRegexPattern(pattern: string): { valid: boolean; error?: string; warning?: string } {
  // 1. Length check
  if (pattern.length > 500) {
    return { valid: false, error: 'Pattern too long (max 500 characters)' };
  }

  // 2. Syntax check
  try {
    new RegExp(pattern);
  } catch (e) {
    return { valid: false, error: `Invalid regex: ${(e as Error).message}` };
  }

  // 3. ReDoS warning (heuristic — flag but don't block)
  const redosPatterns = [
    /\([^)]*[+*][^)]*\)[+*]/,    // nested quantifiers
    /\([^)]*\.\*[^)]*\)\{/,       // quantified groups with .*
  ];
  for (const check of redosPatterns) {
    if (check.test(pattern)) {
      return { valid: true, warning: 'This pattern may be slow on long URLs. Consider simplifying.' };
    }
  }

  // 4. Execution timeout test
  // Run against a synthetic 10K char string with 100ms timeout
  // If it times out, reject with error
  return { valid: true };
}
```

#### UX for Regex Errors

```
┌─────────────────────────────────────────────────────┐
│  Match Pattern: [regex]                              │
│  ┌───────────────────────────────────────────────┐   │
│  │ (a+)+b                                        │   │
│  └───────────────────────────────────────────────┘   │
│  ⚠️ This pattern may be slow on long URLs.           │
│     Consider simplifying.                            │
│                                                      │
│  ── OR on hard error: ──                             │
│  ❌ Invalid regex: Unterminated group                 │
│     [Save] button disabled until fixed               │
└─────────────────────────────────────────────────────┘
```

### Exclude Pattern

Applied after the main match. If `excludePattern` regex matches the URL pathname, the rule is skipped. Exclude patterns are also subject to the same regex validation rules above.

Example:
- `matchValue` (prefix): `https://lovable.dev/projects/`
- `excludePattern`: `^.*/settings$`
- Result: Matches `/projects/abc` but NOT `/projects/abc/settings`

### Duplicate Prevention

If two rules from different projects both inject the same script file, the extension injects it only once (first occurrence wins). This is tracked via a `Set<scriptId>` per tab per page load.

---

## Config → Script Injection Methods

### Method 1: Global Variable (`world: 'MAIN'` only)

Before the script runs, the extension injects a small snippet that sets a global:

```javascript
// Injected before the user script
window.__marcoConfig = { /* config JSON */ };
```

The user script then reads `window.__marcoConfig` at initialization.

**Pros**: Simple, no async, works with any script.
**Cons**: Only works in MAIN world. Config visible to page.

### Method 2: Message Passing (Both worlds)

The script requests config from the background service worker:

```javascript
chrome.runtime.sendMessage({ type: 'GET_SCRIPT_CONFIG', scriptId: 'abc', configId: 'def' }, (config) => {
  initializeWithConfig(config);
});
```

**Pros**: Works in both worlds. Config not exposed to page.
**Cons**: Async. Script must handle callback.

### ~~Method 3: Parameter~~ — REMOVED

> **Deprecated and removed** (see `20-user-script-error-isolation.md`). Parameter wrapping (`(function(config) { ... })(configJson)`) broke scripts with top-level `return`, `await`, `import`, and conflicted with the error isolation wrapper. Only Methods 1 and 2 are supported.

### Default

New scripts default to **Method 2 (message passing)** as it works in both worlds and is the most secure.

---

## Config Validation

When a JSON config is loaded (uploaded or selected from folder):

1. **Parse validation**: Must be valid JSON
2. **Schema validation** (optional): If the config includes a `$schema` field, validate against it
3. **Size validation**: Max 1 MB per config file
4. **Key validation**: Warn on keys containing `__PLACEHOLDER__` (legacy AHK format detected)

Invalid configs are rejected with a clear error message in the UI. The user can fix and re-upload.

---

## Storage

Projects, URL rules, scripts, and configs are stored in `chrome.storage.local`:

```javascript
// Storage keys
{
  'marco_projects': Project[],           // All projects with inline URL rules
  'marco_scripts': { [id: string]: {     // Script store
    id: string,
    name: string,
    fileName: string,
    content: string,         // Full JS source
    size: number,
    uploadedAt: string,
    hash: string             // SHA-256 for integrity/dedup
  }},
  'marco_configs': { [id: string]: {     // Config store
    id: string,
    name: string,
    fileName: string,
    content: object,         // Parsed JSON
    size: number,
    uploadedAt: string,
    hash: string
  }}
}
```

---

## Default Project (Bundled)

The extension ships with a pre-configured "Lovable Automation" project:

```json
{
  "id": "default-lovable",
  "name": "Lovable Automation",
  "description": "Built-in controllers for lovable.dev workspace and credit management",
  "enabled": true,
  "urlRules": [
    {
      "name": "Project pages",
      "matchMode": "prefix",
      "matchValue": "https://lovable.dev/projects/",
      "excludePattern": null,
      "scripts": [
        { "scriptId": "builtin-macro-loop", "world": "MAIN", "runAt": "document_idle", "order": 1 },
        { "scriptId": "builtin-combo", "world": "MAIN", "runAt": "document_idle", "order": 2 }
      ],
      "conditions": { "requireCookie": "lovable-session-id.id", "minDelayMs": 500 }
    }
  ],
  "defaultConfig": { "configId": "builtin-config", "injectionMethod": "global", "globalVariableName": "__marcoConfig" }
}
```

Built-in scripts (`builtin-macro-loop`, `builtin-combo`, `builtin-xpath-utils`) ship with the extension and cannot be deleted (but can be disabled).

---

## Lessons Carried from AHK Issues

The following issues from `/spec/17-app-issues/` informed this design:

| AHK Issue | Chrome Extension Prevention |
|-----------|-----------------------------|
| #01 Workspace name shows project name | DOM validation still required; `isKnownWorkspaceName()` preserved |
| #04 405 API failure on workspace detection | API-first with XPath fallback; conditions prevent injection without cookie |
| #11-#13 DevTools toggle/focus bugs | Eliminated — no DevTools dependency |
| #18 Bearer token confirm button | Eliminated — auto cookie reading |
| #20 Guard flags block redetection | Guard reset on cycle boundaries preserved in macro-looping.js |
| #21 Missing WinWaitActive | Eliminated — no window activation needed |
| #22 XPath multi-match | `getAllByXPath` + iterate-and-validate preserved |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Storage system | `chrome.storage.local` (confirmed) |
| Script execution world | User chooses per script (ISOLATED or MAIN) |
| Multiple matching scripts | Inject all in priority order |
| Export format | Both JSON and ZIP |
