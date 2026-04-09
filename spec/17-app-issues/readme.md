# App Issues — Index

> Complete index of all tracked issues in `spec/17-app-issues/`.
> Status legend: ✅ Fixed · 🔧 In Progress · 📋 Open
> Severity: P0 = blocking/data-loss · P1 = major functionality broken · P2 = UX/polish · P3 = enhancement/feature

---

## Summary

| Status | Count |
|---|---|
| ✅ Fixed / Resolved / Done | 80 |
| 🔧 In Progress | 1 |
| 📋 Open | 0 |

---

## All Issues

| # | Status | Sev | Title | One-Line Summary | File |
|---|---|---|---|---|---|
| 01 | ✅ | P1 | Workspace Name Shows Project Name | Nav observer scraped project name instead of workspace name | [01](01-workspace-name-shows-project-name.md) |
| 02 | ✅ | P2 | Status Bar Credit Display Mismatch | Top bar used different formula/style than workspace items | [02](02-status-bar-credit-display-mismatch.md) |
| 03 | ✅ | P1 | Progress Bar Missing Granted Credits | Bar omitted granted credits; workspace name stale on load | [03](03-progress-bar-missing-granted-stale-workspace.md) |
| 04 | ✅ | P0 | Workspace Detection 405 | GET /projects/{id} returned 405, breaking workspace detection | [04](04-workspace-detection-405-api-failure.md) |
| 05 | ✅ | P1 | Replace GET with POST mark-viewed | Switched to POST mark-viewed + O(1) workspace dictionary lookup | [05](05-workspace-detection-mark-viewed.md) |
| 06 | ✅ | P1 | DOM Observer Overwrites Workspace | MutationObserver race clobbered API-detected workspace name | [06](06-workspace-name-overwrite-by-dom-observer.md) |
| 07 | ✅ | P2 | mark-viewed Empty Body | API returned empty body; fetch logging was too vague | [07](07-mark-viewed-empty-body-vague-logging.md) |
| 08 | ✅ | P1 | Post-Move Name Resets to perWs[0] | XPath read stale DOM after move, reverting to first workspace | [08](08-post-move-workspace-name-reset.md) |
| 09 | ✅ | P1 | Credit Refresh Overwrites Name | fetchLoopCredits() pipeline re-triggered stale XPath detection | [09](09-post-move-credit-refresh-overwrites-workspace.md) |
| 10 | ✅ | P2 | Unreachable Alt+Up/Down Handler | Force-move handler placed after early-return guard in combo.js | [10](10-unreachable-alt-handler-combo.md) |
| 11a | ✅ | P0 | DevTools Toggle-Close Bug | Ctrl+Shift+J toggled DevTools closed, breaking injection | [11a](11-devtools-toggle-close-bug.md) |
| 11b | ✅ | P1 | Startup Workspace Name Missing | Controller loaded before workspace name was resolved | [11b](11-startup-workspace-name-missing.md) |
| 12 | ✅ | P0 | Ctrl+Shift+J Injection Failure | Toggle-close when Console already open prevented script injection | [12](12-ctrl-shift-j-toggle-close.md) |
| 13 | ✅ | P0 | DevTools/Address Bar Injection | WinActivate targeted detached DevTools; probe pasted into URL bar | [13](13-devtools-window-activation.md) |
| 14a | ✅ | P0 | Silent Injection Failure | Zero logs exported; scripts appeared ON but never loaded | [14a](14-empty-session-logs-and-silent-injection.md) |
| 14b | ✅ | P1 | Probe-On-Return Failure | Probe failed after tab switch; force up/down lacked UI feedback | [14b](14-probe-return-failure-v6.55.md) |
| 15a | ✅ | P1 | Deploy No Auto-Reload | run.ps1 -d didn't reload extension when browser was running | [15a](15-deploy-no-auto-reload.md) |
| 15b | ✅ | P2 | Force Delegation Slow (~42s) | Each force up/down took ~42s due to serial dialog waits | [15b](15-force-delegation-speed-v6.56.md) |
| 16 | ✅ | P0 | ComboSwitch Broken | v6.56 fast-path optimization broke combo controller entirely | [16](16-comboswitch-broken-v7.0.md) |
| 17 | ✅ | P0 | HandleDelegate Crashes | Tab detection failures caused unhandled exceptions in delegation | [17](17-handledelegate-crashes-v7.1.md) |
| 18 | ✅ | P1 | Bearer Token False Positive | Confirm button showed success even when token validation failed | [18](18-bearer-token-confirm-button-v7.4.md) |
| 19 | ✅ | P1 | GetCurrentUrl First Fail | First Ctrl+Shift+Down always failed due to DevTools window focus | [19](19-getcurrenturl-activates-devtools-window.md) |
| 20 | ✅ | P1 | Guard Blocks Re-Detection | workspaceFromApi guard permanently prevented workspace updates | [20](20-workspace-guard-blocks-redetection.md) |
| 21 | ✅ | P1 | Missing WinWaitActive | Ctrl+Shift+J sent before window was ready to receive input | [21](21-injectdevtools-missing-winwaitactive.md) |
| 22 | ✅ | P1 | XPath Multi-Match | FIRST_ORDERED_NODE_TYPE returned wrong element from dialog | [22](22-xpath-multi-match-workspace-detection.md) |
| 23 | ✅ | P1 | Wrong Workspace on Load | Tier 1 API removed, fragile DOM fallback picked wrong workspace | [23](23-workspace-name-wrong-initial-load.md) |
| 24 | ✅ | P1 | Name Clobbers to P01 | Fallbacks unconditionally defaulted to perWs[0] on every cycle | [24](24-macro-loop-workspace-name-clobber-on-cycle.md) |
| 27 | ✅ | P1 | Credits Formula Wrong | calcAvailableCredits() omitted freeUsed; workspace defaulted wrong | [27](27-available-credits-wrong-and-workspace-default.md) |
| 29 | ✅ | P0 | Wrong Dependency Context | pnpm resolved in parent workspace instead of chrome-extension/ | [29](29-extension-build-resolves-wrong-dependency-context.md) |
| 30 | ✅ | P0 | ESM require() Build Failure | Dynamic require('fs') in vite.config.ts broke ESM production build | [30](30-esm-dynamic-require-build-failure.md) |
| 31 | ✅ | P0 | HTML Path Mismatch | Vite output HTML under src/ but manifest expected different paths | [31](31-html-path-mismatch-and-deploy-method.md) |
| 34 | ✅ | P2 | Version Mismatch + Toggle | Popup showed stale version; macro_controller.js missing toggle | [34](34-version-mismatch-and-missing-toggle.md) |
| 35a | ✅ | P2 | Popup Buttons Explained | Documented popup button behavior and known edge cases | [35a](35-popup-buttons-explained-and-issues.md) |
| 35b | ✅ | P2 | Single Script Architecture | Removed combo-switch.js; unified into single injection script | [35b](35-single-script-architecture.md) |
| 36 | ✅ | P0 | Bearer Removal Broke Credits | Removing bearer token UI broke auth → credits → progress bar chain | [36](36-bearer-token-removal-broke-credit-bar.md) |
| 37 | ✅ | P2 | Compact Mode Bar Missing | Compact progress bar rendered single color instead of segments | [37](37-compact-mode-bar-missing-segments.md) |
| 38 | ✅ | P2 | Bar Not Relative Scaled | All workspace bars filled to 100% regardless of different totals | [38](38-progress-bar-relative-scaling.md) |
| 39 | ✅ | P0 | SQLite Schema Data Loss | Column name mismatch (data vs json) caused silent import data loss | [39](39-sqlite-schema-mismatch-import-data-loss.md) |
| 40 | ✅ | P1 | ResolutionResult Type Mismatch | Shared function return type changed; caller not updated | [40](40-auto-injector-resolution-result-type-mismatch.md) |
| 41 | ✅ | P1 | Options UI & Prompts | Scripts/Projects/Config/Prompts/Markdown editor fixes (7 items) | [41](41-options-ui-and-prompts-critical-issues.md) |
| 42 | ✅ | P2 | Button Bar & Cookie Auth | Standardized button heights, added cookie read + About modal | [42](42-macro-controller-button-bar-and-cookie-auth.md) |
| 43 | ✅ | P2 | Scripts/Projects UX Overhaul | Bundle model, card UI, RunAt labels, markdown preview, save buttons all done; AHK deferred | [43](43-scripts-projects-markdown-ux-overhaul.md) |
| 44 | ✅ | P2 | UX Fixes & Auto-Attach | Closed; remaining scope merged into #43 | [44](44-comprehensive-ux-fixes-and-auto-attach.md) |
| 45 | ✅ | P0 | First Prompt Empty | ProseMirror state corrupted by textContent; first prompt blank | [45](45-first-prompt-injection-empty.md) |
| 47 | ✅ | P3 | VS Code Theme + Dual Mode | ThemeProvider + ThemeToggle with full dark/light CSS variable system | [47](47-vscode-theme-and-dual-mode.md) |
| 48 | ✅ | P1 | TypeScript Migration | Macro controller rewritten from JS to TypeScript with build pipeline | [48](48-typescript-migration-standalone-scripts.md) |
| 49 | ✅ | P1 | SQLite-First Storage | Prompts, configs, KV, files migrated from chrome.storage to SQLite | [49](49-sqlite-first-storage-migration.md) |
| 50a | ✅ | P2 | Project KV API + File Drops | ProjectKv + ProjectFiles tables with CRUD message handlers | [50a](50-project-key-value-api-and-file-drops.md) |
| 50b | ✅ | P1 | Prompt Loading Failures | Historical analysis of 4 prompt loading root causes and fixes | [50b](50-prompt-loading-breaking-issues.md) |
| 51 | ✅ | P3 | Activity Log Download | Download button added to General tab; exports timestamped .txt | [51](51-activity-log-download-button.md) |
| 52 | ✅ | P0 | Prompt Click No-Op | Overly restrictive click whitelist + missing postMessage relay | [52](52-prompt-click-does-nothing.md) |
| 53 | ✅ | P0 | Prompt Click 2nd Only | First item skipped due to DOM append timing; simplified to direct append | [53](53-prompt-click-simplified-dom-append.md) |
| 54 | ✅ | P1 | Startup Auto-Load Regression | Workspace auto-load broken; loop button disappeared after stop | [54](54-startup-workspace-load-and-loop-button-regression.md) |
| 55 | ✅ | P1 | API Missing Bearer Token | Workspace rename/move sent without Authorization header | [55](55-workspace-api-missing-bearer-token.md) |
| 60 | ✅ | P2 | GroupedKv + Forbidden Cache | Generic grouped KV table; caches 403 workspace IDs for rename | [60](60-grouped-kv-forbidden-rename.md) |
| 61 | ✅ | P1 | Save Stuck on "Saving…" | Relay timeout caused save button to hang indefinitely | [61](61-add-prompt-save-stuck-relay-timeout.md) |
| 62 | ✅ | P2 | Backend Menu & ZIP Workflow | All 6 tasks done: API Explorer, storage surfaces, prompts, overflow menu, file manager, ZIP import/export | [62](62-backend-menu-swagger-storage-files-and-zip-workflow.md) |
| 63 | ✅ | P2 | Button Layout on Collapse | Panel state + geometry now persisted to localStorage | [63](63-button-layout-collapse-reload.md) |
| 64 | ✅ | P2 | Loading When Cached | Prompts loading spinner shown even when data was already cached | [64](64-prompts-loading-when-cached.md) |
| 65 | ✅ | P2 | Project Naming Convention | Name fixed; slug/codeName UI merged into #67 | [65](65-project-naming-and-structure.md) |
| 66 | ✅ | P0 | SDK Global Object Missing | window.RiseupAsiaMacroExt never created; all SDK snippets failed | [66](66-sdk-global-object-missing.md) |
| 67 | ✅ | P2 | Dependency Not Visible in UI | General tab with Project Info, Dependencies, Flags, Settings | [67](67-macro-controller-dependency-missing-in-ui.md) |
| 68 | ✅ | P2 | Config JSON Not Displayed | Fixed ID-vs-path config resolution; collapsible JSON viewer already existed | [68](68-script-config-json-not-displayed.md) |
| 69 | ✅ | P1 | SDK Cookie Bindings Missing | SDK project seeded with empty cookies[]; auth couldn't resolve names | [69](69-auth-cookie-bindings-missing.md) |
| 70 | ✅ | P3 | Health Logging Noise | recoverHealth() logged on every prune cycle even when healthy | [70](70-health-logging-noise.md) |
| 71 | ✅ | P2 | Updater UI Incomplete | All 20+ fields, endpoints, steps, categories fully implemented | [71](71-updater-ui-incomplete.md) |
| 72 | ✅ | P3 | UI Alignment Issues | Header styling normalized; slug/codeName in own row | [72](72-ui-alignment-and-layout.md) |
| 75 | ✅ | P2 | SDK Namespace Enrichment | Per-project namespace with vars/urls/xpath/cookies/kv/files/meta/log | [75](75-sdk-namespace-enrichment-and-developer-tooling.md) |
| 76 | ✅ | P1 | Cookie Namespace Binding Gap | Cookie bindings not registered on SDK namespace; getByRole() failed | [76](76-cookie-namespace-binding-gap.md) |
| 77 | ✅ | P2 | Script Hot Reload | Full hot-reload: GET_SCRIPT_INFO + HOT_RELOAD_SCRIPT + UI section | [77](77-live-script-hot-reload.md) |
| 78 | ✅ | P1 | Use Namespace Not Globals | Migrated public API from window.marco to RiseupAsiaMacroExt | [78](78-use-riseup-namespace-not-window-globals.md) |
| 79 | ✅ | P1 | Migrate window.__ Globals | Removed ~33 window.__* globals; moved to SDK namespace | [79](79-migrate-window-globals-to-namespace.md) |
| 80 | ✅ | P0 | Auth Bridge Null on Preview | JWT recovery failed on *.lovable.app; no tab-scan fallback | [80](80-auth-token-bridge-null-on-preview.md) |
| 81 | ✅ | P0 | Stale Runtime Bundle | Compiled bundle was v1.70.0 while source was v1.71.0; auth fix missing | [81](81-auth-no-token-stale-macro-bundle.md) |
| 82 | ✅ | P1 | Dialog Auto-Click When Stopped | Project dialog opened every 30s even when loop was not running | [82](82-project-dialog-auto-click-when-stopped.md) |
| 83 | ✅ | P0 | Globals, Dependencies & Auth | Global projects not injected; auth fetch() had forbidden Cookie header | [83](83-dependency-globals-auth-fixes.md) |
| 84 | ✅ | P1 | Check Button & Workspace Load | Check button unreliable + workspace name missing on load | [84](84-check-button-and-workspace-load-fixes.md) |
| 85 | ✅ | P1 | SDK Notifier, Config Seeding & DB Overhaul | JSON-driven schema meta engine with MetaTables/MetaColumns/MetaRelations | [85](85-sdk-notifier-config-seeding-database-overhaul.md) |
| 86 | 🔧 | P1 | SDK Notifier Consolidation & Project DB Overhaul | Fix notify regression, config seeding pipeline, database panel 3-tab redesign | [86](86-sdk-notifier-config-db-overhaul.md) |

---

## Check Button Bundle

All Check-button issues are consolidated in [`check-button/`](./check-button/) with sequential numbering.
Start with [`check-button/01-overview.md`](./check-button/01-overview.md) for the master timeline, root causes, and non-regression rules.

| # | Slug | Version | Summary |
|---|------|---------|---------|
| 25 | `02-no-search-feedback` | v7.11 | Check button skips detection + no UI feedback |
| 26 | `03-no-workspace-update` | v7.11.3 | Check button doesn't update workspace name |
| 28 | `04-wrong-detection-path` | v7.12–v7.14 | Check button uses wrong detection path |
| 32 | `05-guard-regression` | v7.19.x | Check button blocked by countdown guard |
| 33 | `06-regression-checklist` | v7.19+ | Regression checklist for Check/Force/Auth |
| 46 | `07-auth-bridge-stall` | v1.47.0 | Auth bridge gaps + Check stall |

---

## Unnumbered Issues

| Status | Title | File |
|---|---|---|
| ✅ | Authentication Freeze and Retry Loop | [link](authentication-freeze-and-retry-loop.md) |
| ✅ | Auth Cookie Read Lovable Issue | [link](auth-cookie-read-lovable-issue.md) |
| ✅ | Profile Picker | [link](issue-01-profile-picker.md) |
| ✅ | Workspace Name Binding Bug | [link](workspace-name-binding-bug.md) |

---

## Required Sections for New Issues

1. Issue Summary (what, where, symptoms, discovery)
2. Root Cause Analysis (direct cause, contributing factors, triggers, spec gap)
3. Fix Description (spec changes, new rules, why it works)
4. Failure Chain (step-by-step sequence leading to the bug)
5. Files Changed (table format)
6. Validation Checklist
7. Cross-References

See [template.md](template.md) for the standard format.

## File Naming

`NN-{issue-slug-name}.md` — where NN is a sequential zero-padded number.
Slug rules: lowercase, hyphen-separated, short, descriptive, no spaces or special characters.
