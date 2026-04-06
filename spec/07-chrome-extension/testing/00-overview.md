# Chrome Extension — Specification Directory

> **Version**: 1.0.0
> **Last updated**: 2026-02-28

---

## Contents

| # | Document | Purpose |
|---|----------|---------|
| 00 | [Unified Testing Index](../../11-imported/00-testing-index.md) | Cross-reference of all E2E tests across Chrome Extension and WP Plugin Publish |
| 01 | [E2E Test Specification](01-e2e-test-specification.md) | Comprehensive end-to-end test plan with summary matrix, detailed flows, UI wireframes, and pass/fail criteria |
| 02 | [Pre-Release Regression Checklist](02-pre-release-regression-checklist.md) | Manual QA sign-off checklist mapping all 20 E2E tests by priority (P0/P1/P2) |
| 03 | [Context Menu Specification](03-context-menu-spec.md) | Right-click context menu with project selection, script execution, and log actions |

---

## Architecture References

This specification directory consolidates all Chrome Extension documentation. For architectural context, see the project memory entries covering:

- **Authentication** — `chrome.cookies` API with bearer token fallback
- **Config Cascade** — 3-tier loading (Remote > Local > Bundled)
- **Project Model** — URL-based project grouping with script/config bindings
- **Recovery Flows** — Error state machine (HEALTHY → DEGRADED → ERROR → FATAL)
- **Script Execution** — Isolated vs Main world injection with diagnostic logging
- **UI Structure** — Popup + Options Page with onboarding flow
- **Logging** — Dual SQLite databases (logs.db + errors.db)
- **Export System** — JSON/ZIP diagnostic bundles
- **Deployment** — PowerShell toolchain with Watch Mode

---

*Chrome Extension specification directory v1.0.0 — 2026-02-28*
