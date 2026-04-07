# Spec 65 — Developer Docs & Project Slug System

**Date**: 2026-03-23  
**Status**: Implemented  
**Spec**: `spec/11-chrome-extension/65-developer-docs-and-project-slug.md`

---

## Overview

Provides inline developer documentation within each project tab (Scripts, URL Rules, Variables, XPath, Cookies, Files) and a unified Docs tab showing the complete SDK reference. Projects have auto-generated slugs and codeNames for SDK namespace scoping.

## Project Identifiers

### Slug (hyphen-case)
- Auto-derived from project name: `slugify(name)` → lowercase, hyphens, max 64 chars
- Example: "Marco Dashboard" → `marco-dashboard`
- Stored as optional `slug` field on `StoredProject`

### CodeName (PascalCase)
- Derived from slug: `toCodeName(slug)` → PascalCase
- Example: `marco-dashboard` → `MarcoDashboard`
- Stored as optional `codeName` field on `StoredProject`

### SDK Namespace Derivation
```
slug: "marco-dashboard"
codeName: "MarcoDashboard"
namespace: RiseupAsiaMacroExt.Projects.MarcoDashboard
```
Functions: `slugify()`, `toCodeName()`, `toSdkNamespace()` in `src/lib/slug-utils.ts`.

## Developer Guide Sections

### Inline (per tab)
Collapsible "Developer Guide" section at the bottom of each tab:
- Shows the SDK namespace
- Provides copyable code snippets specific to that section
- Sections: `urls`, `variables`, `xpath`, `cookies`, `scripts`, `kv`, `files`

### Unified Docs Tab
A dedicated "Docs" tab in the project detail view containing:
- Project slug, codeName, and full SDK namespace
- Sub-namespace listing (vars, urls, xpath, cookies, kv, files, meta, log)
- Complete developer guide with all sections expanded

## Component

`src/components/options/DevGuideSection.tsx` — Reusable collapsible component accepting `namespace` and `section` props.

## UI Changes

| Location | Change |
|----------|--------|
| Project header | Shows `slug: <value>` and `codeName: <value>` next to description |
| Tab bar | Added "Docs" tab with BookOpen icon |
| Scripts tab | Added DevGuideSection (scripts) |
| URL Rules tab | Added DevGuideSection (urls) |
| Variables tab | Added DevGuideSection (variables) |
| XPath tab | Added DevGuideSection (xpath) |
| Cookies tab | Added DevGuideSection (cookies) |
| Files tab | Added DevGuideSection (files) |

## Related Specs
- Spec 63: Rise Up Macro SDK (`spec/11-chrome-extension/63-rise-up-macro-sdk.md`)
- Spec 12: Project Model (`spec/11-chrome-extension/12-project-model-and-url-rules.md`)
- Spec 67: Project-Scoped DB & REST API (`spec/11-chrome-extension/67-project-scoped-database-and-rest-api.md`)
