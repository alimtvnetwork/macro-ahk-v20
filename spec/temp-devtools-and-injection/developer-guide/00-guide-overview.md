# Rise Up Macro — Developer Guide Overview

> **Audience**: AI agents and human developers building standalone script projects for the Rise Up Macro Chrome extension.

---

## What This Guide Covers

This guide provides **everything** needed to create, build, and deploy a new standalone script project that integrates with the Rise Up Macro extension. After reading these documents, you will be able to:

1. Create a new project folder with the correct structure
2. Write an `instruction.ts` manifest that declares assets and seeding metadata
3. Use the `marco.*` SDK namespace to access extension services
4. Build the project using the TypeScript + LESS + Vite pipeline
5. Understand how scripts are injected into web pages
6. Test and debug your scripts in Chrome DevTools

## System Architecture (One Paragraph)

The Rise Up Macro extension injects standalone scripts into web pages via Chrome's `chrome.scripting.executeScript` API in the **MAIN** world. Each script project is a self-contained folder under `standalone-scripts/` with TypeScript source, an `instruction.ts` manifest, and compiled output in `dist/`. At build time, Vite compiles each project into an IIFE bundle and copies artifacts into the Chrome extension's `dist/projects/scripts/{name}/`. At runtime, a seeder reads `instruction.json` manifests and stores script metadata in `chrome.storage.local`. The injection pipeline resolves dependencies, loads assets in order (CSS → configs → templates → JavaScript), and exposes the frozen `window.marco` SDK namespace for inter-script communication via a postMessage bridge.

## Reading Order

| # | File | What You'll Learn |
|---|------|------------------|
| 00 | `00-guide-overview.md` | This file — orientation and architecture |
| 01 | `01-project-structure.md` | Folder layout, required files, naming conventions |
| 02 | `02-instruction-schema.md` | Full `instruction.ts` schema with examples |
| 03 | `03-build-pipeline.md` | How projects are compiled and deployed |
| 04 | `04-sdk-namespace.md` | Complete `marco.*` API reference |
| 05 | `05-injection-lifecycle.md` | How scripts are loaded and executed in the browser |
| 06 | `06-seeding-system.md` | How `instruction.json` drives seeding into storage |
| 07 | `07-xpath-and-dom.md` | XPath utilities and DOM interaction patterns |
| 08 | `08-config-and-theme.md` | Runtime config injection, theme system, LESS pipeline |
| 09 | `09-testing-and-debugging.md` | Testing scripts, debugging, common errors |
| 10 | `10-examples.md` | Complete examples: minimal and full-featured projects |

## System Paths

> **Dynamic placeholders** (resolved at export time):
> - Chrome extension root: `chrome-extension://{EXTENSION_ID}/`
> - Project scripts in extension: `projects/scripts/`
> - Build script: `scripts/compile-instruction.mjs`
> - Project root: `{PROJECT_ROOT}`
> - Standalone scripts: `{PROJECT_ROOT}/standalone-scripts/`

## Key Terminology

| Term | Meaning |
|------|---------|
| **Project** | A self-contained script unit under `standalone-scripts/{name}/` |
| **Instruction** | The `instruction.ts` manifest declaring assets and load order |
| **IIFE** | Immediately Invoked Function Expression — the compiled script format |
| **MAIN world** | Chrome's page execution context (shares DOM with the website) |
| **ISOLATED world** | Chrome's content script context (separate JS environment) |
| **Bridge** | The `postMessage` relay between MAIN and ISOLATED worlds |
| **Seeder** | The background process that stores script metadata on install |
| **SDK** | The `window.marco` namespace providing extension services |
| **slug** | Hyphen-case project ID (e.g., `macro-controller`) |
| **codeName** | PascalCase project key (e.g., `MacroController`) |
