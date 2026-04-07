# Chrome Extension — Cross-Spec Consistency Audit

**Version**: v1.3.0  
**Date**: 2026-02-28  
**Scope**: All 23 spec files audited for interface types, message types, storage keys, host permissions, file paths, event listeners, and coding guideline alignment.

---

## Summary

| Category | Issues Found | Critical | Needs Fix | Informational |
|----------|-------------|----------|-----------|---------------|
| Message Types | 3 | 1 | 2 | 0 |
| GET_STATUS Response Shape | 1 | 1 | 0 | 0 |
| Storage Keys | 1 | 0 | 1 | 0 |
| Host Permissions | 1 | 0 | 1 | 0 |
| File Paths | 1 | 1 | 0 | 0 |
| Superseded Code | 2 | 0 | 2 | 0 |
| Event Listener | 1 | 0 | 1 | 0 |
| Injection Rule Format | 1 | 0 | 0 | 1 |
| **Total** | **11** | **3** | **7** | **1** |

---

## 🔴 CRITICAL — Must Fix Before Implementation

### C-1: `GET_STATUS` Response Shape Mismatch (Spec 10 vs Spec 18)

**Spec 10** (`10-popup-options-ui.md`, lines 304-329) defines `GET_STATUS` response as:

```javascript
{
  connection: 'online',
  token: { status: 'valid', expiresIn: '23h' },
  config: { status: 'loaded', source: 'local', lastRemoteFetch: '...' },
  workspace: { name, id, credits, freeCredits },
  injectedScripts: { 'combo.js': { status, tabId } },
  loggingMode: 'sqlite'
}
```

**Spec 18** (`18-message-protocol.md`, line 401) defines it as:

```typescript
{ health: HealthState, token: string | null, config: 'loaded' | 'error', online: boolean, version: string }
```

These are completely different shapes. The popup code in spec 10 renders based on the richer format.

**Fix**: Adopt spec 10's richer shape as canonical. Update spec 18's `GET_STATUS` response to match. The spec 18 shape is too minimal for the popup's rendering needs.

---

### C-2: Missing Message Types — `TOKEN_EXPIRED` and `TOKEN_UPDATED` (Spec 04)

**Spec 04** (`04-cookie-and-auth.md`, lines 127-152) defines two broadcast message types:

```javascript
chrome.tabs.sendMessage(tab.id, { type: 'TOKEN_EXPIRED' });
chrome.tabs.sendMessage(tab.id, { type: 'TOKEN_UPDATED', token: cachedToken });
```

These are **NOT** in the `MessageType` enum in spec 18. Content scripts listening for these will receive untyped messages.

**Fix**: Add `TOKEN_EXPIRED` and `TOKEN_UPDATED` to the `MessageType` enum in spec 18, with broadcast protocol entries.

---

### C-3: `injector.ts` File Path Conflict (Spec 17 vs Spec 20)

**Spec 17** (`17-build-system.md`, line 37-38) places the injector in content-scripts:

```
src/content-scripts/injector.ts  ← Programmatic injection coordinator
```

**Spec 20** (`20-user-script-error-isolation.md`, line 103) references it from background:

```typescript
// src/background/injector.ts
import { wrapUserScript } from '@/content-scripts/error-wrapper';
```

The injector runs `chrome.scripting.executeScript` which is a **background API** — it MUST be in `src/background/`.

**Fix**: Update spec 17's project structure to move `injector.ts` from `src/content-scripts/` to `src/background/`. Spec 20 has the correct path.

---

## 🟡 NEEDS FIX — Will Cause Bugs

### N-1: `GET_STORAGE_USAGE` vs `GET_STORAGE_STATS` (Spec 10 vs Spec 18)

**Spec 10** (`10-popup-options-ui.md`, line 290) uses:

```javascript
chrome.runtime.sendMessage({ type: 'GET_STORAGE_USAGE' })
```

**Spec 18** defines the type as `GET_STORAGE_STATS`.

**Fix**: Update spec 10 to use `GET_STORAGE_STATS`.

---

### N-2: `SCHEMA_VERSION_KEY` Undefined (Spec 06)

**Spec 06** references `SCHEMA_VERSION_KEY` in the migration runner but never defines its string value.

**Fix**: Add to spec 06: `const SCHEMA_VERSION_KEY = 'marco_schema_version';` and add this to the consolidated storage keys list.

---

### N-3: Host Permissions Inconsistency (Spec 04 vs Spec 01/17)

**Spec 01 and 17** (manifest):

```json
"host_permissions": [
  "https://lovable.dev/*",
  "https://api.lovable.dev/*",
  "https://*.lovable.app/*"
]
```

**Spec 04** (`04-cookie-and-auth.md`, line 55):

```json
"host_permissions": [
  "https://lovable.dev/*",
  "https://*.lovable.dev/*",
  "https://api.lovable.dev/*"
]
```

Spec 04 includes `https://*.lovable.dev/*` (wildcard subdomain) but omits `https://*.lovable.app/*`. Spec 01/17 omit the wildcard `*.lovable.dev`. The cookie reader needs `*.lovable.dev` to access cookies set on subdomains.

**Fix**: The canonical manifest (spec 17) should include BOTH:

```json
"host_permissions": [
  "https://lovable.dev/*",
  "https://*.lovable.dev/*",
  "https://api.lovable.dev/*",
  "https://*.lovable.app/*"
]
```

---

### N-4: Navigation Event Inconsistency (Spec 05 vs Spec 07)

**Spec 05** (`05-content-script-adaptation.md`, line 33) uses:

```
chrome.webNavigation.onCompleted
```

**Spec 07** (`07-advanced-features.md`, lines 302-303) uses:

```javascript
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') ...
```

These are functionally similar but have edge-case differences (webNavigation fires per-frame, tabs.onUpdated fires per-tab). Using both creates duplicate injection attempts.

**Fix**: Standardize on `chrome.webNavigation.onCompleted` (spec 05) as the canonical trigger. Update spec 07's example code.

---

### N-5: Spec 13 Still Contains Superseded Error Handling Code

**Spec 13** (`13-script-and-config-management.md`, lines 303-327) still contains the old `window.addEventListener('error')` approach with `isUserScript()`. Spec 20 explicitly states this section is superseded (line 282).

**Fix**: Replace the §Error Handling section in spec 13 with a cross-reference to spec 20:

> **Error Handling**: See `20-user-script-error-isolation.md` for the canonical error capture strategy using try/catch wrappers. The previous `window.addEventListener('error')` approach has been removed.

---

### N-6: Spec 06 Persistence Layer Not Cross-Referenced to Spec 19

**Spec 06** (`06-logging-architecture.md`, lines 218-268) still contains the old `setInterval(flushToStorage, 30000)` code. Spec 19 explicitly supersedes this (line 386-390) but spec 06 doesn't have a cross-reference note.

**Fix**: Add a note to spec 06 §Persistence Layer: "⚠️ SUPERSEDED: See `19-opfs-persistence-strategy.md` for the canonical persistence implementation."

---

## 🟢 INFORMATIONAL — No Fix Required

### I-1: Spec 07 `scriptInjection.rules` Format vs Spec 12 `Project.urlRules`

**Spec 07** defines rules with `urlPatterns[]` (Chrome match patterns) + `pathRegex` + `excludePathRegex`.

**Spec 12** defines rules with `matchMode` (`exact`/`prefix`/`regex`) + `matchValue` + `excludePattern`.

These are not contradictions — spec 07 was v0.1, spec 12 is v0.2 and is the canonical model. Spec 07's injection examples should be treated as illustrative only; the actual data model is spec 12.

**No fix required** but implementers should use spec 12's `UrlRule` interface exclusively.

---

## Consolidated Storage Keys Registry

For reference, all `chrome.storage.local` and `chrome.storage.session` keys used across specs:

### `chrome.storage.local`

| Key | Type | Source Spec | Purpose |
|-----|------|-------------|---------|
| `sqlite_logs_db` | `number[]` (Uint8Array) | 06, 19 | Serialized logs.db (fallback mode) |
| `sqlite_errors_db` | `number[]` (Uint8Array) | 06, 19 | Serialized errors.db (fallback mode) |
| `marco_projects` | `Project[]` | 12 | All projects with inline URL rules |
| `marco_scripts` | `Record<string, StoredScript>` | 12, 13 | Script store |
| `marco_configs` | `Record<string, StoredConfig>` | 12, 13 | Config store |
| `marco_schema_version` | `number` | 06 | Current DB schema version |
| `marco_fallback_logs` | `FallbackLogEntry[]` | 09 | JSON fallback when SQLite unavailable |
| `config` | `ConfigJson` | 07 | Merged runtime config |

### `chrome.storage.session`

| Key | Type | Source Spec | Purpose |
|-----|------|-------------|---------|
| `marco_transient_state` | `TransientState` | 19 | Service worker state for rehydration |

---

## Consolidated Interface Registry

All TypeScript interfaces and their canonical source spec:

| Interface | Canonical Spec | Also Referenced In |
|-----------|---------------|-------------------|
| `Project` | 12 | 15, 18 |
| `UrlRule` | 12 | 15, 18 |
| `ScriptBinding` | 12 | 13, 15, 18, 20 |
| `ConfigBinding` | 12, 20 | 15, 18 |
| `InjectionConditions` | 12 | 07, 15 |
| `StoredScript` | 13 | 12, 15, 18 |
| `StoredConfig` | 13 | 12, 15, 18 |
| `ConfigJson` | 02 | 07, 18 |
| `TransientState` | 19 | 09 |
| `MessageType` (enum) | 18 | All specs |
| `Message` | 18 | All specs |

---

## Resolution Status

All 11 original issues have been verified as **RESOLVED** on 2026-02-28.

| # | Fix | Status | Verified In |
|---|-----|--------|-------------|
| 1 | C-1: Unify GET_STATUS response | ✅ RESOLVED | Spec 18 — rich response shape with connection, token, workspace, injectedScripts, loggingMode |
| 2 | C-2: Add TOKEN_EXPIRED/UPDATED to enum | ✅ RESOLVED | Spec 18 — lines 113-114, enum entries + broadcast definitions |
| 3 | C-3: Fix injector.ts path | ✅ RESOLVED | Spec 17 — `src/background/injector.ts` (line 35) |
| 4 | N-1: GET_STORAGE_USAGE → GET_STORAGE_STATS | ✅ RESOLVED | Spec 10 — line 290 uses `GET_STORAGE_STATS` |
| 5 | N-2: Define SCHEMA_VERSION_KEY | ✅ RESOLVED | Spec 06 — `const SCHEMA_VERSION_KEY = 'marco_schema_version'` (line 838) |
| 6 | N-3: Merge host_permissions | ✅ RESOLVED | Spec 17 — includes all 4 patterns: `lovable.dev`, `*.lovable.dev`, `api.lovable.dev`, `*.lovable.app` |
| 7 | N-4: Standardize nav event | ✅ RESOLVED | Spec 07 — uses `chrome.webNavigation.onCompleted` with `frameId === 0` guard |
| 8 | N-5: Remove superseded error handling | ✅ RESOLVED | Spec 13 — §Error Handling replaced with cross-reference to spec 20 |
| 9 | N-6: Add superseded note to spec 06 | ✅ RESOLVED | Spec 06 — §Persistence Layer has SUPERSEDED note pointing to spec 19 |

---

## Post-Guideline Audit (v1.2.0)

Re-audit conducted after adding Spec 23 (Coding Guidelines v1.1.0) with 17 new rules across 6 sub-files.

### Issues Found: 3 (all fixed)

| # | Issue | Severity | Fix Applied |
|---|-------|----------|-------------|
| 10 | Spec 18 footer says "v1.0.0" but header says "v1.1.0" | Needs Fix | Updated footer to v1.1.0 |
| 11 | Spec 04 host_permissions missing `*.lovable.app/*` and no canonical ref | Needs Fix | Added 4th pattern + note pointing to canonical manifest in spec 17 |
| 12 | Code examples in specs 04, 05, 06, 07, 09, 19, 20 pre-date coding guidelines | Informational | Added project-wide disclaimer to spec 23 master index |

---

## Post-ESLint Audit (v1.3.0)

Re-audit conducted after adding ESLint Enforcement sections to all 6 coding guideline sub-files.

### Issues Found: 3 (all fixed)

| # | Issue | Severity | Fix Applied |
|---|-------|----------|-------------|
| 13 | Spec 01 deliverables table shows spec 22 as "v1.0" (now v1.2) | Needs Fix | Updated to v1.2 |
| 14 | Spec 01 deliverables table shows spec 23 as "v1.0" (now v1.2) | Needs Fix | Updated to v1.2 |
| 15 | Spec 23 §Enforcement doesn't mention ESLint sections or required plugins | Needs Fix | Added plugin list and reference to per-file ESLint sections |

### Verified Consistent

| Check | Result |
|-------|--------|
| Deliverables table (spec 01) lists all 23 specs with current versions | ✅ |
| Spec 22 scope says "23 spec files" | ✅ |
| Spec 21 Pre-Read table includes spec 23 as 🔴 Read first | ✅ |
| Spec 21 has code example disclaimer | ✅ |
| Spec 23 master index references all 6 guideline sub-files | ✅ |
| Spec 23 §Enforcement lists required ESLint plugins | ✅ |
| All 6 guideline files have ESLint Enforcement sections | ✅ |
| Guideline file versions: 01=v1.1, 02=v1.2, 03=v1.2, 04=v1.1, 05=v1.2, 06=v1.2 | ✅ |
| Spec 18 header/footer both say v1.1.0 | ✅ |
| Spec 04 host_permissions has all 4 patterns + canonical ref | ✅ |
| All host_permissions include all 4 patterns in canonical manifests | ✅ |
| Circular dependency rules + zone config documented in spec 05 | ✅ |
| Chrome API isolation rules documented in spec 06 with ESLint overrides | ✅ |
| `strict-boolean-expressions` mapped to Rule B7 in spec 03 | ✅ |
| `no-floating-promises` mapped to Rule F8 in spec 02 | ✅ |
| `max-lines` (200) mapped to Rule ORG1 in spec 05 | ✅ |
| `max-lines-per-function` (20) mapped to Rule F1 in spec 02 | ✅ |
| `max-params` (3) mapped to Rule F2 in spec 02 | ✅ |
| Pre-guideline code disclaimer in spec 23 covers specs 04,05,06,07,09,19,20 | ✅ |

---

*Cross-spec consistency audit v1.3.0 — 2026-02-28 — All 15 issues resolved, 19 consistency checks passed*
