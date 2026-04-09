# Chrome Extension Specification

This folder contains the specification for the **Marco Chrome Extension** — a replacement for the AHK v2 desktop automation layer.

## Documents

| # | File | Description | Status |
|---|------|-------------|--------|
| 01 | [01-overview.md](01-overview.md) | Architecture, goals, phased scope, file deliverables | ✅ Complete |
| 02 | [02-config-json-schema.md](02-config-json-schema.md) | Full `config.json` schema (INI → JSON mapping), config loading | ✅ Complete |
| 03 | [03-powershell-installer.md](03-powershell-installer.md) | `Install-Extension.ps1` deployment script | ✅ Complete |
| 04 | [04-cookie-and-auth.md](04-cookie-and-auth.md) | Cookie reading via `chrome.cookies`, token flow, caching, change listener | ✅ Complete |
| 05 | [05-content-script-adaptation.md](05-content-script-adaptation.md) | Changes to adapt combo.js / macro-looping.js (6 adaptation areas) | ✅ Complete |
| 06 | [06-logging-architecture.md](06-logging-architecture.md) | SQLite (sql.js WASM) logging — `logs.db` + `errors.db`, session-based, exportable | ✅ Complete |
| 07 | [07-advanced-features.md](07-advanced-features.md) | Remote config endpoint, conditional script injection, XPath recorder | ✅ Complete |
| 08 | [08-version-management.md](08-version-management.md) | Version numbering, bumping, display, migration, update detection | ✅ Complete |
| 09 | [09-error-recovery.md](09-error-recovery.md) | Error recovery flows for WASM, storage, network, injection, corruption | ✅ Complete |
| 10 | [10-popup-options-ui.md](10-popup-options-ui.md) | Popup & options page wireframes, components, interaction flows | ✅ Complete |
| 11 | [11-testing-strategy.md](11-testing-strategy.md) | Unit (~80), integration (~30), manual E2E (~15) test procedures | ✅ Complete |

## Status

**Draft** — All documents are v0.1 (Planning), pending review before development begins.

## Active Codebase

The Chrome extension will be developed in a new folder (e.g., `chrome-extension/`) at the repo root. The AHK codebase at `marco-script-ahk-v7.latest/` remains the active production version until the extension reaches feature parity.
