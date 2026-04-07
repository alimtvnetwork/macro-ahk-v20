# Reliability & Failure-Chance Report — Automator v7.23 + Extension v1.17

**Date**: 2026-03-16
**Purpose**: Assess spec quality and AI-handoff readiness for the active codebase.
**Active Codebase**: `marco-script-ahk-v7.latest/` (see `/spec/11-folder-policy.md`)
**Chrome Extension**: `chrome-extension/` v1.17.0

---

## 1. Success Probability Estimates

### By Module Complexity Tier

| Tier | Module | Success % | Assumptions |
|------|--------|-----------|-------------|
| **Simple** | Config loading (`Config/*.ahk`) | 99% | Schema validation on load (S-013); deterministic INI parsing |
| **Simple** | CSV export (`exportWorkspacesAsCsv`) | 99% | Pure data transform, no side effects |
| **Simple** | Progress bar rendering | 96% | Relative scaling (v7.23), segmented colors (v7.22); risk: new pool type from API |
| **Simple** | SQLite bundle import/export | 98% | Schema standardized to `json` column (v1.16); risk: schema evolution |
| **Medium** | Credit formula calculation | 95% | Shared helpers enforce consistency; risk: new credit pool type |
| **Medium** | Workspace dropdown UI | 92% | Search, filter, keyboard nav well-specified; risk: Radix UI version changes |
| **Medium** | Bearer token / session-bridge | 95% | Session-bridge auth replaces manual paste (v1.1); risk: Lovable auth flow changes |
| **Medium** | Extension popup UI (React) | 95% | PlatformAdapter pattern, preview-testable; risk: mock data drift |
| **Medium** | Extension options UI (React) | 93% | Full port with 14 components, Framer Motion; risk: state management complexity |
| **Complex** | DevTools injection pipeline | 80% | Two-branch strategy; risk: Chrome updates change keyboard shortcut behavior |
| **Complex** | Workspace detection (XPath + CSS) | 92% | XPath + CSS self-healing (S-012); risk: Lovable UI restructures DOM |
| **Complex** | Smart workspace switching | 88% | Fresh-fetch + skip-depleted logic; risk: race conditions on rapid switches |
| **Complex** | Controller injection (Step 0) | 92% | Strict CONTROLS_XPATH verification; risk: DOM structure changes |
| **Complex** | Extension service worker boot | 91% | manualChunks fix; background at `src/background/` with shims |
| **Complex** | React UI unification build pipeline | 90% | MPA Vite config, legacy deleted; risk: Vite version or plugin incompatibilities |
| **E2E** | Full macro loop cycle | 84% | Step 0 verification + token expiry UI; risk: multi-step timing dependencies |
| **E2E** | ComboSwitch 8-step transfer | 75% | Timing-sensitive; modal state fragile; risk: Lovable Transfer dialog DOM changes |
| **E2E** | Extension inject→detect→credit | 88% | Session-bridge + SQLite logging; risk: auth token lifecycle changes |

### Overall AI Handoff Success: **89%**

**Key factors**: Exceptional documentation (44 issue write-ups, 26 engineering standards), well-structured spec hierarchy, clear folder policy, comprehensive suggestions tracker.

---

## 2. Failure Map

### 2.1 High-Risk Failures (Still Open)

| # | Module / Workflow | Why It Fails | Symptoms | Likelihood |
|---|-------------------|-------------|----------|------------|
| F-001 | DevTools injection | Chrome keyboard shortcut behavior changes across versions; `Ctrl+Shift+J` may not open Console tab | JS not injected; no error visible to user; automation silently fails | 15% per Chrome major update |
| F-005 | Credit formula divergence | Lovable introduces a new credit pool type not in current formula | Progress bars show incorrect totals; auto-move logic makes wrong decisions | 10% per quarter |
| F-020 | ComboSwitch modal DOM changes | Lovable updates Transfer dialog (Radix UI version, layout restructure) | 8-step combo fails at step 2-5; XPath returns null; user sees alert | 20% per Lovable major release |

### 2.2 Medium-Risk Failures (Open)

| # | Module / Workflow | Why It Fails | Symptoms |
|---|-------------------|-------------|----------|
| F-007 | Keyboard shortcut conflicts | New browser or OS shortcuts collide | Hotkey silently captured by browser, AHK never receives it |
| F-008 | MutationObserver SPA persistence | React re-renders unmount injected UI panel | UI panel disappears; MutationObserver disconnected |
| F-009 | Cross-controller state sharing | Both combo.js and macro-looping.js share localStorage keys | State corruption when both controllers active simultaneously |
| F-021 | React UI unification incomplete | Steps 6, 10-11 not done; content scripts still in old location | Build may work but content script injection untested in unified path |

### 2.3 Low-Risk Failures

| # | Module / Workflow | Why It Fails |
|---|-------------------|-------------|
| F-011 | Clipboard race condition | User copies during injection window (~200ms) |
| F-012 | Project dialog timing | Wait insufficient on slow connections |

### 2.4 Resolved Failures ✅ (19 items)

All previously high-risk failures (F-002 through F-019) resolved. See previous report version for details.

---

## 3. Corrective Actions (Prioritized)

| Priority | Action | Where to Change | Expected Reliability Gain | Status |
|----------|--------|----------------|--------------------------|--------|
| ~~P1~~ | ~~E2E test plan (S-011)~~ | — | — | ✅ Done |
| ~~P2~~ | ~~XPath self-healing (S-012)~~ | — | — | ✅ Done |
| ~~P3~~ | ~~Config.ini schema validation (S-013)~~ | — | — | ✅ Done |
| ~~P4~~ | ~~Last known good state snapshot~~ | — | — | ✅ Done |
| ~~P5~~ | ~~Chrome version compatibility matrix~~ | — | — | ✅ Done |
| ~~P6~~ | ~~Profile picker fix~~ | — | — | ✅ Done |
| **P7** | Complete React UI unification (Steps 6, 10-11) | `src/content-scripts/`, build configs | +2% overall (eliminates F-021) | 🔄 In Progress |
| **P8** | Extension build verification (S-027) | `vite.config.extension.ts` | +1% overall (confirms build pipeline) | ⬜ Open |
| **P9** | Add React component tests for Options/Popup | `tests/` | +1% overall (catches regression in 14 React components) | ⬜ Open |
| **P10** | Document DevTools injection alternatives | `spec/12-devtools-and-injection/devtools-injection.md` | +3% for F-001 (CDP protocol fallback path) | ⬜ Open |

---

## 4. Readiness Decision

### Verdict: **READY — with caveats**

The spec set is comprehensive and well-structured enough for AI handoff. The 89% success estimate is high for a project of this complexity.

### What's Excellent ✅

1. **44 issue write-ups with RCA** — Every major bug documented with root cause and prevention rules
2. **26 engineering standards** — Derived from real failures, not theoretical
3. **Comprehensive spec hierarchy** — 10 numbered spec files + extension specs + imported specs
4. **Version history** — Full changelog from v1 to v7.23, 17 extension releases
5. **Session-bridge auth** — Modern pattern eliminating manual bearer token management
6. **150+ AHK test cases + 822 unit tests** — Extensive coverage
7. **React UI unification** — 9/12 steps complete with detailed checklist
8. **Suggestions tracker** — Structured workflow for capturing and completing improvements
9. **12 completed workflow plans** — Full history of major work efforts

### What Reduces AI Success ⚠️

1. **DevTools injection fragility (F-001)** — No fallback to CDP; entire system depends on keyboard shortcut injection
2. **ComboSwitch DOM coupling (F-020)** — Hardcoded XPaths to Lovable's Transfer dialog; any UI change breaks it
3. **Incomplete React unification** — Steps 6, 10-11 pending; an AI might not realize content scripts haven't been migrated
4. **No integration tests** — 822 unit tests exist but no automated E2E test runner
5. **Cross-controller state sharing (F-009)** — Documented but unfixed; could cause subtle bugs

### Specific AI Failure Scenarios

| Scenario | Probability | Cause |
|----------|------------|-------|
| AI edits wrong version folder | 5% | Folder policy clearly documented; AI usually follows it |
| AI breaks credit formula | 8% | Shared helpers reduce risk; but new pool types could confuse |
| AI breaks injection pipeline | 15% | Complex multi-step keyboard automation is hard to reason about |
| AI introduces state race condition | 12% | Two controllers sharing localStorage requires careful coordination |
| AI doesn't run build verification | 20% | No CI/CD; relies on manual `npx vite build` |

---

## 5. Spec Quality Scorecard

| Aspect | Rating | Notes |
|--------|--------|-------|
| Architecture documentation | ⭐⭐⭐⭐⭐ | AHK + JS + Extension + React unification |
| Code conventions & standards | ⭐⭐⭐⭐⭐ | 26 standards + anti-patterns |
| Error handling documentation | ⭐⭐⭐⭐⭐ | E001-E011 codes + 44 RCA write-ups |
| Root cause analysis docs | ⭐⭐⭐⭐⭐ | Comprehensive, prevention rules included |
| UI sync patterns | ⭐⭐⭐⭐⭐ | All state changes verified |
| Config documentation | ⭐⭐⭐⭐⭐ | Schema validation on load |
| Testing guidance | ⭐⭐⭐⭐ | 150+ test cases + 822 unit tests; missing E2E runner |
| Version clarity | ⭐⭐⭐⭐⭐ | Active folder marked; versions synchronized |
| Fetch logging standard | ⭐⭐⭐⭐⭐ | Every API call logged |
| SQLite schema consistency | ⭐⭐⭐⭐⭐ | Standardized `json` column (v1.16) |
| Cross-reference consistency | ⭐⭐⭐⭐⭐ | All refs point to `v7.latest/` |
| Extension documentation | ⭐⭐⭐⭐⭐ | 17 releases, full changelog, RCA for build issues |
| React migration tracking | ⭐⭐⭐⭐⭐ | 12-step checklist, 9/12 complete |
| AI onboarding guide | ⭐⭐⭐⭐ | Master overview exists; could add a "start here" checklist |
| Integration test coverage | ⭐⭐⭐ | No automated E2E runner |
