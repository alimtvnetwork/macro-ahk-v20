# Chrome Extension — Pre-Release Regression Checklist

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28  
> **Source**: [E2E Test Specification](01-e2e-test-specification.md)  
> **Estimated time**: ~90 minutes

---

## Instructions

1. Copy this file into your release branch as `checklist-vX.Y.Z.md`
2. Fill in the **Release** and **Tester** fields below
3. Work through each section; tick the box when the test passes
4. Record any failures in the **Notes** column
5. All P0 tests must pass before release; P1 tests must pass or have documented waivers

| Field | Value |
|-------|-------|
| **Release** | `v___` |
| **Tester** | |
| **Date** | |
| **Environment** | Chrome ___ / OS ___ |
| **Extension Build** | `commit:` |

---

## Sign-Off Summary

| Priority | Total | Passed | Failed | Waived |
|----------|-------|--------|--------|--------|
| P0 | 8 | | | |
| P1 | 7 | | | |
| P2 | 3 | | | |
| **All** | **20** | | | |

**Release decision**: ☐ GO &nbsp; ☐ NO-GO

**Approved by**: _________________________ **Date**: _________

---

## P0 — Must Pass

### Core User Flows

- [ ] **E2E-01 — First-Run Onboarding**
  Welcome page renders; default project created; `onboarding_complete` persisted.
  _Notes:_

- [ ] **E2E-02 — Project CRUD Lifecycle**
  Create, read, update, delete project via Options page; storage clean after delete.
  _Notes:_

- [ ] **E2E-03 — URL Matching Rules**
  Exact, prefix, and regex rules resolve correctly; deletions take immediate effect.
  _Notes:_

- [ ] **E2E-04 — Script Injection (Isolated World)**
  Script runs in isolation; `window.__pageVar` undefined; log entry created.
  _Notes:_

- [ ] **E2E-05 — Script Injection (Main World)**
  Main world script accesses page globals; errors route to `errors.db`.
  _Notes:_

- [ ] **E2E-07 — Authentication Flow**
  Bearer token works; cookie fallback recovers session; cleared state shows unauthenticated.
  _Notes:_

- [ ] **E2E-08 — Popup Project Selection & Match Status**
  Popup reflects real-time tab state; project switching triggers re-evaluation.
  _Notes:_

### Error Recovery

- [ ] **E2E-09 — Service Worker Termination + Rehydration**
  Zero data loss after termination; injection resumes automatically.
  _Notes:_

- [ ] **E2E-14 — Error State Transitions (HEALTHY→FATAL)**
  State machine transitions follow spec; badges update in real-time.
  _Notes:_

### UI Verification

- [ ] **E2E-19 — Options Page CRUD + Library Management**
  Full project/script/config CRUD; library management; bulk operations.
  _Notes:_

---

## P1 — Should Pass

- [ ] **E2E-06 — Config Cascade (Remote > Local > Bundled)**
  Each tier falls through correctly; merge strategy produces expected keys.
  _Notes:_

- [ ] **E2E-10 — WASM/SQLite Integrity Fallback**
  Extension functional in degraded mode; recovery restores full capability.
  _Notes:_

- [ ] **E2E-11 — 3-Tier Config Recovery**
  Fallback tiers activate in order; recovery is automatic.
  _Notes:_

- [ ] **E2E-12 — CSP Detection + Fallback Injection**
  CSP doesn't crash injection; fallback activates transparently.
  _Notes:_

- [ ] **E2E-15 — Multi-Tab Tracking + Independent Injection**
  Each tab injects independently; tab close cleans up state.
  _Notes:_

- [ ] **E2E-16 — Extension Install via PowerShell Toolchain**
  Install script completes; extension loads and passes health check.
  _Notes:_

- [ ] **E2E-17 — Watch Mode (File Change → Reload)**
  File change triggers reload; injected scripts update without manual refresh.
  _Notes:_

---

## P2 — Nice to Have

- [ ] **E2E-13 — Network Failure & Exponential Backoff**
  Backoff doubles each attempt; cap respected; recovery resets timer.
  _Notes:_

- [ ] **E2E-18 — ZIP Export (Diagnostic Bundle)**
  Bundle contains logs.db, errors.db, config snapshot; file opens in explorer.
  _Notes:_

- [ ] **E2E-20 — XPath Recorder Toggle + Capture Flow**
  Recorder activates; hover highlights elements; click captures XPath; overlay dismisses.
  _Notes:_

---

## Browser Compatibility Matrix

Run the full P0 suite on each channel. Record the Chrome version and note any channel-specific failures.

| Channel | Chrome Version | OS | P0 Pass | P1 Pass | Issues | Notes |
|---------|---------------|----|---------|---------|--------|-------|
| ☐ Stable | ___.0.___.__ | | /8 | /7 | | |
| ☐ Beta | ___.0.___.__ | | /8 | /7 | | |
| ☐ Canary | ___.0.___.__ | | /8 | /7 | | |

**Minimum required**: Stable must fully pass. Beta and Canary failures require a ticket but do not block release.

---

## Failure Log

| E2E ID | Failure Description | Severity | Channel | Ticket | Waiver? |
|--------|---------------------|----------|---------|--------|---------|
| | | | | | |

---

## Related Documentation

- [E2E Test Specification](01-e2e-test-specification.md) — Full test steps, wireframes, and pass/fail criteria
- [Overview](00-overview.md) — Architecture references and memory entries

---

*Pre-release regression checklist v1.0.0 — 2026-02-28*
