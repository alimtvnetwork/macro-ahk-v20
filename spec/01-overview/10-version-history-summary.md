# 10 — Version History Summary

**Version**: v7.17
**Last Updated**: 2026-02-25

For the detailed changelog, see `marco-script-ahk-v7.latest/specs/changelog.md`.

---

## Major Milestones

| Version | Date | Milestone |
|---------|------|-----------|
| v4.9 | 2026-02-17 | Foundation: logging, draggable UIs, multi-method XPath, keyboard shortcuts |
| v5.2 | 2026-02-18 | Three-tier fast path recovery, exponential backoff |
| v5.4 | 2026-02-18 | $-prefix hotkeys fix, F6 removal from injection |
| v6.1 | 2026-02-18 | DevTools collision fix, delegation stability |
| v6.45 | 2026-02-19 | Toggle-close fix, double-confirm, prompt guard |
| v6.55 | 2026-02-19 | Stable baseline (archived) |
| v7.0 | 2026-02-21 | Modular architecture, config constants, credit status API |
| v7.5 | 2026-02-21 | Bearer token sharing, unified layout, searchable workspace dropdown |
| v7.8 | 2026-02-21 | InjectJSQuick, domain guard, 3-call injection optimization |
| v7.9.1 | 2026-02-21 | ClickPageContent context anchoring |
| v7.9.2 | 2026-02-21 | Workspace state clobber fix |
| v7.9.7 | 2026-02-21 | AHK delegation deprecated → API-direct mode |
| v7.9.8 | 2026-02-22 | JS history, injection failure detection, double-click move |
| v7.9.15 | 2026-02-22 | Credit formula finalized, shared helpers |
| v7.9.24 | 2026-02-23 | Comprehensive fetch logging standard |
| v7.9.25 | 2026-02-23 | 3-tier workspace detection hierarchy |
| v7.9.34 | 2026-02-23 | Authoritative API guard (post-move state corruption fix) |
| v7.9.40 | 2026-02-23 | Smart workspace switching (skip depleted) |
| v7.9.41 | 2026-02-23 | DevTools two-branch injection restored |
| v7.9.45 | 2026-02-23 | F12 removed from injection; Ctrl+Shift+J only |
| v7.9.51 | 2026-02-24 | InjectJSQuick focus-steal fix (issue #13) |
| v7.9.52 | 2026-02-24 | CSV export, workspace count label |
| v7.9.53 | 2026-02-24 | Progress bar reorder: 🎁→💰→🔄→📅, rollover → gray |
| v7.16 | 2026-02-25 | Strict injection-first sequence (Step 0 verification) |
| **v7.17** | **2026-02-25** | **Mark-viewed API removed, token expiry UI, Check button resilience, verbose selector logging, 📥 Export Bundle, XPath self-healing (S-012)** |

---

## v7.17 Changes (Root Cause Analysis)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Controller injection failed | `LoopControlsXPath` had `div[2]`, DOM changed to `div[3]` | Updated XPath in config.ini |
| Tier 1 mark-viewed API still present | Code not removed despite request | Fully deleted from `autoDetectLoopCurrentWorkspace()` |
| Check button dead on 401 | `runCheck()` aborted when API failed | Falls through to XPath detection regardless |
| 401 not shown in UI | `fetchLoopCredits` never called `markBearerTokenExpired` | Added on 401/403 in both sync/async fetch |
| CSS selector logging opaque | Only logged count, not individual selectors | Per-selector verbose logging with ✅/❌ |

---

## Issue Write-Ups

| # | Slug | Version | Root Cause Summary |
|---|------|---------|-------------------|
| 01 | workspace-name-shows-project-name | v7.9.16 | DOM observer picked up project name instead of workspace name |
| 02 | status-bar-credit-display-mismatch | v7.9.17 | Top-level bar used different formula than workspace items |
| 03 | progress-bar-missing-granted-stale-workspace | v7.9.18 | Missing 🎁 segment + invalid fallback workspace name |
| 04 | workspace-detection-405-api-failure | v7.9.19 | GET /projects/{id} returns 405 |
| 05 | workspace-detection-mark-viewed | v7.9.20 | Replaced broken GET with POST mark-viewed |
| 06 | workspace-name-overwrite-by-dom-observer | v7.9.22 | Guard flag declared but never set to true |
| 07 | mark-viewed-empty-body-vague-logging | v7.9.24 | resp.json() crashes on empty body |
| 08 | post-move-workspace-name-reset | v7.9.32 | Stale DOM XPath overwrites authoritative name |
| 09 | post-move-credit-refresh-overwrites-workspace | v7.9.34 | Credit refresh triggers XPath detection post-move |
| 10 | unreachable-alt-handler-combo | v7.9.33 | Handler placed after early-return guard |
| 11 | devtools-toggle-close-bug | v7.9.38 | F12-first strategy caused wrong-panel injection |
| 12 | ctrl-shift-j-toggle-close | v7.9.45 | Ctrl+Shift+J toggles Console closed if already active |
| 13 | devtools-window-activation | v7.9.51 | InjectJSQuick stole focus from detached Console |
| 14 | probe-return-failure-v6.55 | v6.55 | Probe NO_RESULT failures, Force UI feedback |
| 15 | force-delegation-speed-v6.56 | v6.56 | Force Up/Down ~42s → ~6-10s (6-phase optimization) |
| 16 | comboswitch-broken-v7.0 | v7.0 | Fast-path broke console focus + no config fallbacks |
| 17 | handledelegate-crashes-v7.1 | v7.1–v7.2 | Missing globals, UUID tab matching, HandleDelegate rewrite |
| 18 | bearer-token-confirm-button-v7.4 | v7.4 | Token validation + Confirm button false positive |

---

## Pending Work

| Priority | Item | Description |
|----------|------|-------------|
| High | S-011: E2E Test Scenarios | Formal test plan for all major features |
| Medium | S-012: XPath Self-Healing | CSS selector fallback for workspace detection |
| Medium | S-013: Config Validation | Schema validation on config load |
| Low | S-007: Config Hot-Reload | Watch config.ini, reload without restart |

---

## Archived Versions

| Folder | Version | Notes |
|--------|---------|-------|
| `Archives/marco-script-ahk-v1/` | v1.0 | ⛔ READ-ONLY archive — original AHK v1 |
| `marco-script-ahk-v6.55/` | v6.55 | ⛔ READ-ONLY archive — stable baseline before v7.0 refactor |
| `marco-script-ahk-v7.latest/` | **v7.17** | ✅ **Active codebase — ONLY this folder may be edited** |
| `marco-script-ahk-v7.9.32/` | v7.9.32 | ⛔ READ-ONLY archive — snapshot with credit status module |
