# 00 — Master Overview: Automator Project Specification

**Version**: v9.0
**Last Updated**: 2026-03-21
**Active Codebase**: `chrome-extension/`, `src/`, `standalone-scripts/`
**Chrome Extension**: v1.53.0
**AHK Legacy**: Archived in `skipped/` (do not touch)
**Purpose**: This document is the entry point for any AI or developer to understand the entire Automator project. Read this first, then dive into specific spec files as needed.

---

## What Is This Project?

The **Automator** is a **Chrome Extension + JavaScript** automation tool that controls the [Lovable.dev](https://lovable.dev) web IDE. It automates:

1. **MacroLoop** (`macro-looping.js`): Continuously monitors credit usage across workspaces, automatically moving the project to a workspace with available free credits when the current one is depleted
2. **Credit Monitoring**: Fetches workspace credit data via the Lovable API and displays it in real-time progress bars
3. **Workspace Management**: Detects current workspace, moves projects between workspaces, tracks workspace history
4. **Structured Logging & Data Bridge**: Extension-hosted services for persistent storage, logging, and cross-origin data sharing

### How It Works (High Level)

```
┌─────────────────────────────┐     ┌────────────────────────────────────┐
│  Chrome Extension            │     │  Browser Page (lovable.dev)         │
│                              │     │                                     │
│  Background Service Worker   │◄───▶│  macro-looping.js (injected)        │
│  ├── message-router.ts       │     │  ├── window.marco SDK               │
│  ├── data-bridge-handler.ts  │     │  ├── Floating UI panel              │
│  ├── cookie-watcher.ts       │     │  └── Credit monitoring + auto-move  │
│  └── chrome.storage.local    │     │                                     │
│                              │     │  Content Scripts (message relay)     │
│  Popup (React)               │     │  ├── message-relay.ts               │
│  Options Page (React)        │     │  ├── network-reporter.ts            │
│  ├── Monaco editor           │     │  └── xpath-recorder.ts              │
│  ├── Project/Script manager  │     │                                     │
│  └── Data browser            │     └────────────────────────────────────┘
└─────────────────────────────┘                    │
                                             fetch() calls
                                                   ▼
                                     ┌─────────────────────┐
                                     │  Lovable API         │
                                     │  GET /user/workspaces│
                                     │  PUT /move-to-ws     │
                                     └─────────────────────┘
```

---

## Spec File Index

| # | File | Description |
|---|------|-------------|
| **00** | `00-master-overview.md` | **This file** — project overview, architecture, and spec index |
| **01** | `03-data-and-api/` | API schemas, data models, DB join specs, axios policy |
| **02** | `02-app-issues/` | Issue write-ups with RCA for every major bug fix |
| **03** | `03-architecture.md` | System architecture (AHK legacy + extension) |
| **04** | `03-data-and-api/data-schema.md` | API response schema, internal data models, credit formulas |
| **05** | `08-coding-guidelines/engineering-standards.md` | All engineering rules and principles (27 rules) |
| **06** | `06-macro-controller/credit-system.md` | Credit calculation, progress bar spec, segment colors and order |
| **07** | `06-macro-controller/workspace-management.md` | Workspace detection hierarchy, switching, history, move API |
| **08** | `09-devtools-and-injection/devtools-injection.md` | DevTools console injection (AHK legacy) |
| **09** | `06-macro-controller/ui-controllers.md` | ComboSwitch and MacroLoop UI features, shortcuts, layout |
| **10** | `10-version-history-summary.md` | Condensed version history with key milestones |
| **11** | `11-folder-policy.md` | Folder policy: active vs skipped folders |
| **12** | `07-chrome-extension/` | Chrome extension specs (43 documents) |

### Key Chrome Extension Specs

| # | File | Description |
|---|------|-------------|
| **18** | `18-message-protocol.md` | Unified message protocol (single source of truth) |
| **40** | `40-macro-looping-script-complete-reference.md` | Macro controller complete reference |
| **42** | `42-user-script-logging-and-data-bridge.md` | `window.marco` SDK for logging & data bridge |
| **43** | `43-macro-controller-extension-bridge.md` | Macro controller ↔ extension communication |

### Related Files

| Location | Description |
|----------|-------------|
| `.lovable/plan.md` | Current plan and pending work |
| `.lovable/memory/suggestions/01-suggestions-tracker.md` | Feature suggestions tracker |
| `.lovable/memory/workflow/` | Completed and active workflow plans |
| `.lovable/memory/architecture/` | Architecture decisions and policies |

---

## Current Status

- **Chrome Extension**: v1.53.0 — Primary active codebase
- **Macro Controller**: TypeScript migration complete (Phase 4 — 0 tsc errors, 83% `any` reduction)
- **Build Pipeline**: `run.ps1 -d` auto-discovers `standalone-scripts/*/src/` and runs `build:<folder-name>` (e.g., `build:xpath`, `build:macro-controller`) before extension build
- **AHK Legacy**: v7.23 — Archived in `skipped/` (stable, no longer developed)
- **44 issue write-ups** documented with RCA and prevention rules
- **26 engineering standards** established from lessons learned
- **822 unit tests** across 72 files
- **React UI**: Popup + Options fully ported, PlatformAdapter, Dark+ theme
- **Message Relay**: Content script bridge for macro controller ↔ extension communication

---

## ⚠️ AI Onboarding Checklist (S-029)

**Follow this checklist before making ANY changes.** Skipping steps causes the most common AI failures.

### Step 1: Understand the Folder Policy (CRITICAL)

- [ ] Read `/spec/01-overview/11-folder-policy.md`
- [ ] **ONLY edit files in** `chrome-extension/`, `src/`, `standalone-scripts/`, `spec/`
- [ ] **NEVER touch** `skipped/` — all AHK folders are archived there
- [ ] **Failure risk if skipped**: AI edits archived folder → changes silently ignored or break stable code

### Step 2: Read the Engineering Standards

- [ ] Read `/spec/08-coding-guidelines/engineering-standards.md` (all 26 rules)
- [ ] Key rules to internalize:
  - **Rule 1**: Root Cause Analysis First — no fix without documented RCA
  - **Rule 2**: Known-Good State Wins — user-action state > background poll
  - **Rule 9**: No Direct `resp.json()` — always `resp.text()` + `JSON.parse()`
  - **Rule 10**: Issue Write-Up Mandatory — every bug fix gets an issue file
- [ ] **Failure risk if skipped**: AI introduces patterns that have already caused documented bugs

### Step 3: Read the Architecture

- [ ] Read this file (`spec/01-overview/00-master-overview.md`) — you're here
- [ ] Read `/spec/11-chrome-extension/01-overview.md` — extension architecture
- [ ] Read `/spec/11-chrome-extension/18-message-protocol.md` — message types
- [ ] Read `/spec/07-data-and-api/data-schema.md` — API response shapes and credit formulas
- [ ] **Failure risk if skipped**: AI misunderstands data flow → breaks credit calculations or messaging

### Step 4: Read the Domain-Specific Specs (as needed)

| If you're working on... | Read these |
|------------------------|-----------|
| Credit display / progress bars | `06-macro-controller/credit-system.md` |
| Workspace detection / switching | `06-macro-controller/workspace-management.md`, `06-macro-controller/workspace-detection.md` |
| Controller UI (macro panel) | `06-macro-controller/ui-controllers.md` |
| Chrome extension architecture | `spec/11-chrome-extension/01-overview.md` through `23-coding-guidelines.md` |
| Macro ↔ extension bridge | `spec/11-chrome-extension/43-macro-controller-extension-bridge.md` |
| Message protocol | `spec/11-chrome-extension/18-message-protocol.md` |
| Logging & data bridge | `spec/11-chrome-extension/42-user-script-logging-and-data-bridge.md` |

### Step 5: Check Current State

- [ ] Read `.lovable/plan.md` — current plan with completed and pending work
- [ ] Read `plan.md` (root) — future work roadmap with prioritized backlog
- [ ] Read `.lovable/memory/suggestions/01-suggestions-tracker.md` — active suggestions
- [ ] **Failure risk if skipped**: AI re-implements completed work or misses known risks

### Step 6: Verify Before Changing

- [ ] Confirm the file you're editing is in the active codebase (`chrome-extension/`, `src/`, or `standalone-scripts/`)
- [ ] Check if an issue write-up already exists for the problem at `/spec/17-app-issues/`
- [ ] If modifying credit formulas, verify against shared helper functions
- [ ] **NEVER change code without discussing with the user first** (Engineering Standard)

### Step 7: After Making Changes

- [ ] If fixing a bug: create issue write-up at `/spec/17-app-issues/NN-{slug}.md` using `template.md`
- [ ] Update `.lovable/memory/suggestions/01-suggestions-tracker.md` if completing a suggestion
- [ ] Update `.lovable/plan.md` if completing a planned task
- [ ] Run build verification: `run.ps1 -d` (auto-builds standalone scripts + extension)

### Common AI Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| Editing files in `skipped/` | Always check folder policy first — `skipped/` is off-limits |
| Using `resp.json()` directly | Use `resp.text()` + `JSON.parse()` (Rule 9) |
| Inline credit arithmetic | Use shared helper functions only (Rule 14) |
| Overriding known-good state with DOM observation | Check Rule 2 and Rule 11 |
| Missing UI sync after state change | Update ALL UI sections: header, NOW label, workspace list, credit display, progress bar |
| Adding `chrome.*` calls outside PlatformAdapter | Use `getPlatform()` factory — see `src/platform/` |
| Editing `01-macro-looping.js` instead of TS source | Edit `standalone-scripts/macro-controller/src/` — JS file is legacy reference only |
| Running `build:extension` without standalone scripts | Use `run.ps1 -d` which auto-discovers and builds all standalone scripts first |

---

## Key Concepts for AI Onboarding

### 1. Extension Architecture
The Chrome extension (Manifest V3) replaces the AHK desktop layer. Scripts are injected programmatically via `chrome.scripting.executeScript`. The macro controller communicates with the extension via a content script message relay (`window.postMessage` → `chrome.runtime.sendMessage`).

### 2. Credit System
Credits have 5 pools: **Granted** (🎁 bonus), **Monthly** (💰 billing period), **Rollover** (🔄 carried over), **Daily Free** (📅), and **Topup**. Progress bars show segments in order: 🎁 Purple → 💰 Green → 🔄 Gray → 📅 Yellow.

### 3. Workspace Detection
XPath-only detection: **Project Dialog DOM** (click Project Button → read XPath) → **Default** (first workspace). Check button works even when credit API returns 401.

### 3a. Token Expiry Handling
When credit API returns 401/403, the UI immediately shows "Bearer Token 🔴 EXPIRED — replace token!" with recovery buttons. The extension can auto-refresh tokens via cookie watcher.

### 4. Macro Controller
- **MacroLoop** (`macro-looping.js`): Runs on Project page. Timed loop that checks credits and auto-moves to non-depleted workspaces.
- Uses `window.marco` SDK for structured logging and persistent storage via the extension bridge.

### 5. Engineering Standards
The most important rules (see `08-coding-guidelines/engineering-standards.md` for all):
- **Known-Good State Wins**: User-action state > background poll state
- **API-First, DOM-Fallback**: Prefer API data; DOM only when API fails
- **Issue Write-Up Mandatory**: Every fix needs RCA documentation
- **No Direct resp.json()**: Always `resp.text()` + `JSON.parse()`
- **Post-Mutation No DOM Re-Detect**: Trust API response after successful moves

---

## Quick Reference: File Layout

```
chrome-extension/               # Chrome extension (Manifest V3)
├── manifest.json               # Extension manifest
├── src/
│   ├── background/             # Re-export shims → src/background/
│   ├── content-scripts/        # Re-export shims → src/content-scripts/
│   └── assets/                 # Extension icons
│
src/                            # Shared source (canonical)
├── background/                 # Service worker: message router, handlers
│   ├── index.ts                # SW entry point
│   ├── message-router.ts       # Message routing + handler registry
│   ├── handlers/               # Handler implementations
│   │   ├── data-bridge-handler.ts  # marco.store persistence
│   │   ├── prompt-chain-handler.ts # Prompt chain execution
│   │   └── ...
│   ├── cookie-watcher.ts       # Token auto-refresh
│   └── auto-injector.ts        # Script injection engine
├── content-scripts/            # Content scripts (injected into pages)
│   ├── message-relay.ts        # Macro ↔ extension bridge
│   ├── network-reporter.ts     # XHR/fetch capture
│   └── xpath-recorder.ts       # XPath recording
├── shared/                     # Shared types and constants
│   └── messages.ts             # MessageType enum (single source of truth)
├── platform/                   # PlatformAdapter (web vs extension)
├── components/                 # Shared React UI components
├── popup/                      # Extension popup (React)
└── options/                    # Extension options page (React)
│
standalone-scripts/             # Standalone JS scripts
└── macro-controller/           # Macro controller source + config
│
spec/                           # Project specifications
├── 00-master-overview.md       # This file
├── 11-folder-policy.md         # Folder policy
└── 07-chrome-extension/        # Extension specs (43 documents)
│
skipped/                        # ⛔ ARCHIVED — DO NOT TOUCH
├── marco-script-ahk-v7.latest/ # Former AHK codebase
├── marco-script-ahk-v7.9.32/  # Archived snapshot
├── marco-script-ahk-v6.55/    # Archived baseline
└── Archives/                   # Original AHK v1
```
