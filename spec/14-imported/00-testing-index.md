# Unified Testing Index

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

---

## Overview

This document cross-references all E2E test specifications, regression checklists, and Playwright test stubs across both product areas: **Chrome Extension** and **WP Plugin Publish**.

---

## Chrome Extension

### Specifications

| Document | Path |
|----------|------|
| E2E Test Specification | [`spec/11-chrome-extension/testing/01-e2e-test-specification.md`](../07-chrome-extension/testing/01-e2e-test-specification.md) |
| Pre-Release Regression Checklist | [`spec/11-chrome-extension/testing/02-pre-release-regression-checklist.md`](../07-chrome-extension/testing/02-pre-release-regression-checklist.md) |

### Playwright Config

| File | Purpose |
|------|---------|
| [`playwright.config.ts`](playwright.config.ts) | Chrome extension launch args, CI reporters (HTML, JUnit, GitHub), sequential execution |

### Test Stubs (20 tests)

| ID | Priority | Area | Stub File |
|----|----------|------|-----------|
| E2E-01 | P0 | Onboarding | [`tests/e2e/e2e-01-onboarding.spec.ts`](tests/e2e/e2e-01-onboarding.spec.ts) |
| E2E-02 | P0 | Projects | [`tests/e2e/e2e-02-project-crud.spec.ts`](tests/e2e/e2e-02-project-crud.spec.ts) |
| E2E-03 | P0 | URL Rules | [`tests/e2e/e2e-03-url-matching.spec.ts`](tests/e2e/e2e-03-url-matching.spec.ts) |
| E2E-04 | P0 | Injection | [`tests/e2e/e2e-04-injection-isolated.spec.ts`](tests/e2e/e2e-04-injection-isolated.spec.ts) |
| E2E-05 | P0 | Injection | [`tests/e2e/e2e-05-injection-main.spec.ts`](tests/e2e/e2e-05-injection-main.spec.ts) |
| E2E-06 | P1 | Config | [`tests/e2e/e2e-06-config-cascade.spec.ts`](tests/e2e/e2e-06-config-cascade.spec.ts) |
| E2E-07 | P0 | Auth | [`tests/e2e/e2e-07-auth-flow.spec.ts`](tests/e2e/e2e-07-auth-flow.spec.ts) |
| E2E-08 | P0 | Popup | [`tests/e2e/e2e-08-popup-match.spec.ts`](tests/e2e/e2e-08-popup-match.spec.ts) |
| E2E-09 | P0 | Recovery | [`tests/e2e/e2e-09-sw-rehydration.spec.ts`](tests/e2e/e2e-09-sw-rehydration.spec.ts) |
| E2E-10 | P1 | Recovery | [`tests/e2e/e2e-10-wasm-fallback.spec.ts`](tests/e2e/e2e-10-wasm-fallback.spec.ts) |
| E2E-11 | P1 | Recovery | [`tests/e2e/e2e-11-config-recovery.spec.ts`](tests/e2e/e2e-11-config-recovery.spec.ts) |
| E2E-12 | P1 | Recovery | [`tests/e2e/e2e-12-csp-fallback.spec.ts`](tests/e2e/e2e-12-csp-fallback.spec.ts) |
| E2E-13 | P2 | Recovery | [`tests/e2e/e2e-13-backoff.spec.ts`](tests/e2e/e2e-13-backoff.spec.ts) |
| E2E-14 | P0 | Recovery | [`tests/e2e/e2e-14-state-transitions.spec.ts`](tests/e2e/e2e-14-state-transitions.spec.ts) |
| E2E-15 | P1 | Edge | [`tests/e2e/e2e-15-multi-tab.spec.ts`](tests/e2e/e2e-15-multi-tab.spec.ts) |
| E2E-16 | P1 | Deploy | [`tests/e2e/e2e-16-ps-install.spec.ts`](tests/e2e/e2e-16-ps-install.spec.ts) |
| E2E-17 | P1 | Deploy | [`tests/e2e/e2e-17-watch-mode.spec.ts`](tests/e2e/e2e-17-watch-mode.spec.ts) |
| E2E-18 | P2 | Deploy | [`tests/e2e/e2e-18-zip-export.spec.ts`](tests/e2e/e2e-18-zip-export.spec.ts) |
| E2E-19 | P0 | UI | [`tests/e2e/e2e-19-options-crud.spec.ts`](tests/e2e/e2e-19-options-crud.spec.ts) |
| E2E-20 | P2 | UI | [`tests/e2e/e2e-20-xpath-recorder.spec.ts`](tests/e2e/e2e-20-xpath-recorder.spec.ts) |

### Shared Fixtures

| File | Exports |
|------|---------|
| [`tests/e2e/fixtures.ts`](tests/e2e/fixtures.ts) | `launchExtension`, `getExtensionId`, `openPopup`, `openOptions` |

---

## WP Plugin Publish

### Specifications

| Document | Path |
|----------|------|
| E2E Test Specification | [`spec/14-imported/wp-plugin-publish/04-testing/40-e2e-test-spec.md`](wp-plugin-publish/04-testing/40-e2e-test-spec.md) |
| Pre-Release Regression Checklist | [`spec/14-imported/wp-plugin-publish/04-testing/41-pre-release-regression-checklist.md`](wp-plugin-publish/04-testing/41-pre-release-regression-checklist.md) |

### Test Matrix (20 tests)

| Suite | ID | Test Name |
|-------|----|-----------|
| Plugin CRUD | TC-PLUGIN-001 | Register Plugin |
| Plugin CRUD | TC-PLUGIN-002 | Register Invalid Path |
| Plugin CRUD | TC-PLUGIN-003 | Update Plugin |
| Plugin CRUD | TC-PLUGIN-004 | Delete Plugin |
| Plugin CRUD | TC-PLUGIN-005 | Scan Plugin Files |
| Site Connections | TC-SITE-001 | Register Site |
| Site Connections | TC-SITE-002 | Test Connection |
| Site Connections | TC-SITE-003 | Invalid Credentials |
| Site Connections | TC-SITE-004 | Create Plugin Mapping |
| Sync Operations | TC-SYNC-001 | Detect New Files |
| Sync Operations | TC-SYNC-002 | Detect Modified Files |
| Sync Operations | TC-SYNC-003 | Detect Deleted Files |
| Sync Operations | TC-SYNC-004 | Compare Local/Remote |
| Sync Operations | TC-SYNC-005 | Git Pull Detection |
| Sync Operations | TC-SYNC-006 | Batch Scan All |
| Publish Flow | TC-PUBLISH-001 | Full ZIP Upload |
| Publish Flow | TC-PUBLISH-002 | Selected Files Patch |
| Publish Flow | TC-PUBLISH-003 | Backup Before Publish |
| Publish Flow | TC-PUBLISH-004 | Restore From Backup |
| Publish Flow | TC-PUBLISH-005 | Publish All Sites |

> **Note**: WP Plugin Publish E2E tests are implemented as a Go test service (`backend/internal/services/e2e/`), not Playwright. See the [E2E Test Spec](wp-plugin-publish/04-testing/40-e2e-test-spec.md) for API endpoints and schemas.

---

## Summary

| Product | Tests | Checklist | Automation |
|---------|-------|-----------|------------|
| Chrome Extension | 20 | ✅ with browser matrix | Playwright (stubs scaffolded) |
| WP Plugin Publish | 20 | ✅ | Go test service (spec defined) |
| **Total** | **40** | | |

---

*Unified testing index v1.0.0 — 2026-02-28*
