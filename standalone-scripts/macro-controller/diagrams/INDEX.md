# Diagram Index — Macro Controller Architecture

> All diagrams follow the [XMind-inspired dark-mode standard](../../../spec/05-design-diagram/mermaid-design-diagram-spec/01-diagram-spec/diagram-standards.md).  
> Source `.mmd` files live alongside this index; rendered PNGs are in `images/`.

## Table of Contents

1. [Master Architecture Overview](#1-master-architecture-overview) — High-level map of all subsystems and cross-system data flow
2. [Auth Bridge Waterfall](#2-auth-bridge-waterfall) — Token resolution via localStorage, cookie fallback, and TTL caching
3. [Script Injection Pipeline](#3-script-injection-pipeline) — 7-stage lifecycle from dependency resolution to dynamic loading
4. [Macro Controller Build](#4-macro-controller-build) — Vite IIFE compilation and Chrome extension deployment
5. [Prompts Pipeline](#5-prompts-pipeline) — Markdown source to SQLite seeding to runtime SWR loading
6. [Credit Monitoring Flow](#6-credit-monitoring-flow) — Auth pre-flight, API request, and UI display logic
7. [Data Storage Schema](#7-data-storage-schema) — SQLite, IndexedDB, localStorage, and chrome.storage layers
8. [Extension Lifecycle](#8-extension-lifecycle) — Install through page injection to runtime execution
9. [Message Relay Architecture](#9-message-relay-architecture) — PostMessage and Chrome.Runtime channels between page, CS, and background

---

## 1. Master Architecture Overview

**File:** [`master-architecture-overview.mmd`](master-architecture-overview.mmd)  
**Image:** [`images/master-architecture-overview.png`](images/master-architecture-overview.png)

Top-level map of every major subsystem — Auth Bridge, Build Pipeline, Script Injection, Prompts Pipeline, Credit Monitoring, and Dynamic Script Loading — with cross-system data-flow links showing how tokens, scripts, and prompts move between layers.

![Master Architecture Overview](images/master-architecture-overview.png)

---

## 2. Auth Bridge Waterfall

**File:** [`auth-bridge-waterfall.mmd`](auth-bridge-waterfall.mmd)  
**Image:** [`images/auth-bridge-waterfall.png`](images/auth-bridge-waterfall.png)

Details the `authBridge` service: public methods (`getBearerToken`, `getRawToken`, `getTokenAge`), TTL-based token resolution from localStorage, cookie fallback from the Lovable session, and how downstream consumers (Credits, Macro Controller) obtain bearer tokens.

![Auth Bridge Waterfall](images/auth-bridge-waterfall.png)

---

## 3. Script Injection Pipeline

**File:** [`script-injection-pipeline.mmd`](script-injection-pipeline.mmd)  
**Image:** [`images/script-injection-pipeline.png`](images/script-injection-pipeline.png)

The full 7-stage injection lifecycle: dependency resolution → script resolution → namespace bootstrap → relay & token seeding → IIFE wrap & CSP execute → namespace registration → dynamic loading at runtime via `RiseupAsiaMacroExt.require()`.

![Script Injection Pipeline](images/script-injection-pipeline.png)

---

## 4. Macro Controller Build

**File:** [`macro-controller-build.mmd`](macro-controller-build.mmd)  
**Image:** [`images/macro-controller-build.png`](images/macro-controller-build.png)

Build pipeline from TypeScript source and config files through Vite IIFE compilation, LESS stylesheets, and template compilation, producing `dist/` artifacts that are deployed into the Chrome extension via the `copyProjectScripts` plugin.

![Macro Controller Build](images/macro-controller-build.png)

---

## 5. Prompts Pipeline

**File:** [`prompts-pipeline.mmd`](prompts-pipeline.mmd)  
**Image:** [`images/prompts-pipeline.png`](images/prompts-pipeline.png)

End-to-end prompt flow: source markdown files → build aggregation into `MacroPrompts.json` → extension deploy via `ViteStaticCopy` → SQLite seeding with version hashing → runtime loading from IndexedDB dual cache (JsonCopy + HtmlCopy) on menu open, with a manual Load button to force-refresh from SQLite. MacroController uses the pre-rendered HtmlCopy to skip rendering loops; other consumers use JsonCopy.

![Prompts Pipeline](images/prompts-pipeline.png)

---

## 6. Credit Monitoring Flow

**File:** [`credit-monitoring-flow.mmd`](credit-monitoring-flow.mmd)  
**Image:** [`images/credit-monitoring-flow.png`](images/credit-monitoring-flow.png)

User-triggered credit check: obtain bearer token via `authBridge` → single API request to `/user/workspaces` → display results (find workspace, scroll, highlight credits) or show error toast with copy button. No retry logic.

![Credit Monitoring Flow](images/credit-monitoring-flow.png)

---

## 7. Data Storage Schema

**File:** [`data-storage-schema.mmd`](data-storage-schema.mmd)  
**Image:** [`images/data-storage-schema.png`](images/data-storage-schema.png)

Maps every storage layer: SQLite (Prompts, PromptsCategory, ProjectConfig, Deployments), IndexedDB client cache (prompts + UI snapshots), localStorage (tokens + settings), chrome.storage.local (extension scripts + settings), and cache invalidation flows between layers.

![Data Storage Schema](images/data-storage-schema.png)

---

## 8. Extension Lifecycle

**File:** [`extension-lifecycle.mmd`](extension-lifecycle.mmd)  
**Image:** [`images/extension-lifecycle.png`](images/extension-lifecycle.png)

Full extension lifecycle from Chrome install through page injection to runtime execution: service worker bootstrap → tab navigation URL matching → auth token seeding → 6-stage script injection → runtime SDK and dynamic loading → user interaction via popup, context menu, and options page.

![Extension Lifecycle](images/extension-lifecycle.png)

---

## 9. Message Relay Architecture

**File:** [`message-relay-architecture.mmd`](message-relay-architecture.mmd)  
**Image:** [`images/message-relay-architecture.png`](images/message-relay-architecture.png)

How page scripts (MAIN world), the relay content script (ISOLATED world), and the background service worker communicate: Window.PostMessage bridges the page↔CS gap, Chrome.Runtime.SendMessage bridges CS↔background, with CorrelationId-based response matching for async request/response patterns.

![Message Relay Architecture](images/message-relay-architecture.png)
