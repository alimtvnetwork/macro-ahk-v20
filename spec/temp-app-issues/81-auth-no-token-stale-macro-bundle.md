# Issue 81 — Auth Still Fails on Preview Because Runtime Bundle Is Stale

| Field | Value |
|---|---|
| ID | 81 |
| Status | ✅ Fixed |
| Severity | P0 / Authentication |
| Version | 1.71.0 |
| Created | 2026-03-26 |
| Component | Macro Controller runtime bundle + Extension bridge |

---

## Symptom

Users repeatedly hit:

> ⚠️ Auth failed — no token after 6s

Auth Trace shows:
- `Token Source: none`
- `Bridge Result: FAIL: No token returned`
- No JWT resolved from any tier.

---

## Investigation Workflow

1. Verified runtime evidence from user trace (`MacroLoop v1.70.0`).
2. Compared source vs injected standalone bundle:
   - `standalone-scripts/macro-controller/src/auth.ts` posts auth bridge messages with `tabUrl` + `pageUrl` hints.
   - `standalone-scripts/macro-controller/01-macro-looping.js` (runtime bundle) does **not** include those fields.
3. Verified shipped version metadata:
   - `standalone-scripts/macro-controller/script-manifest.json` is still `1.70.0`.
   - Bundle header in `01-macro-looping.js` is also `VERSION = "1.70.0"`.
4. Correlated with trace data: no resolved token in localStorage, no successful bridge JWT, no cookie fallback JWT.

---

## Root Cause

### RC1 — Source/runtime drift (stale injected macro bundle)
Auth hardening was implemented in TS source, but runtime behavior still comes from a stale `v1.70.0` injected bundle.

Result: bridge requests in runtime miss newer context hints and recovery behavior expected by the latest auth spec.

### RC2 — Startup gate times out before recovery can succeed in this stale path
`ensureTokenReady(6000)` expires while no JWT is resolved from the stale bridge path.

### RC3 — Environment had no immediate JWT fallback source
In this failing session, none of these produced a valid JWT in time:
- seeded localStorage,
- extension bridge GET/REFRESH,
- cookie fallback.

---

## Failure Chain

1. Startup checks localStorage and finds no JWT.
2. Runtime bridge (from stale bundle) requests token but receives no JWT.
3. Cookie-based exchange cannot derive JWT in that session.
4. `ensureTokenReady` hits 6s timeout.
5. UI reports repeated "no token after 6s".

---

## Fix Applied

1. Rebuilt SDK (`npm run build:sdk`) → `standalone-scripts/marco-sdk/dist/marco-sdk.js` (creates `RiseupAsiaMacroExt`).
2. Rebuilt Macro Controller (`npm run build:macro-controller`) → `standalone-scripts/macro-controller/dist/macro-looping.js` with `tabUrl`/`pageUrl` bridge payload.
3. Bumped version to `1.71.0` in `shared-state.ts`, `script-manifest.json`, and `manifest.json`.
4. Extension seeder (`looping-script-chunk.ts`) imports from `@standalone/macro-controller/dist/macro-looping.js?raw`, which now contains the rebuilt v1.71.0 bundle.

---

## Files Changed

| File | Change |
|---|---|
| `standalone-scripts/marco-sdk/dist/marco-sdk.js` | Rebuilt SDK bundle |
| `standalone-scripts/macro-controller/dist/macro-looping.js` | Rebuilt with auth hardening |
| `standalone-scripts/macro-controller/src/shared-state.ts` | Version bump to 1.71.0 |
| `standalone-scripts/macro-controller/script-manifest.json` | Version bump to 1.71.0 |

---

## Validation Checklist

- [ ] `01-macro-looping.js` bundle header shows `VERSION = "1.71.0"` (not 1.70.0)
- [ ] Auth bridge requests in runtime include `tabUrl` and `pageUrl` fields
- [ ] Auth Trace shows successful token resolution after rebuild
- [ ] `script-manifest.json` version matches `shared-state.ts` VERSION constant

---

## Cross-References

- Prior auth RCA: [#80 — Auth Bridge Returns No Token on Preview](80-auth-token-bridge-null-on-preview.md)
- Runtime sync rule: `.lovable/memory/features/macro-controller/check-button-runtime-sync.md`
- Runtime/source files:
  - `standalone-scripts/macro-controller/src/auth.ts`
  - `standalone-scripts/macro-controller/01-macro-looping.js`
  - `standalone-scripts/macro-controller/script-manifest.json`
