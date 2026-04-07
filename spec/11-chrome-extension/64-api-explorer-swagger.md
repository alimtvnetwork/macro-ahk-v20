# Spec 64 — API Explorer Swagger-Style Redesign

**Date**: 2026-03-23  
**Status**: Implemented  
**Spec**: `spec/11-chrome-extension/64-api-explorer-swagger.md`

---

## Overview

The API Explorer provides a Swagger-style interface for discovering, testing, and documenting extension message API endpoints. It replaces the original cramped list UI with expandable accordion sections per endpoint.

## Features

### Endpoint Catalog
- Grouped by category with expandable accordion items
- GET/POST method badges with high-contrast colors
- Full pseudo-REST path display: `chrome.runtime/message/<type-in-hyphen-case>`
- Search bar with category filter pills

### Per-Endpoint Details (expanded)
- Category badge + description
- Copyable endpoint path
- **Schema & Info** section with "Copy for AI / Postman" button
- **cURL / PowerShell** generated snippets with copy buttons
- **Request Body** editor (JSON textarea)
- **Response** viewer with copy button

### PascalCase Convention
All displayed field names use PascalCase (Type, DisplayName, Category, Description, IsMutating, ExampleRequest) via `normalizeEndpoint()` and `toPascalCaseKeys()`.

## File Structure

| File | Purpose |
|------|---------|
| `src/components/options/api-explorer/types.ts` | EndpointDoc type, normalizer, PascalCase helpers |
| `src/components/options/api-explorer/EndpointAccordionItem.tsx` | Expandable endpoint section |
| `src/components/options/api-explorer/ApiExplorerSwagger.tsx` | Main Swagger view with search/filter |
| `src/components/options/api-explorer/index.ts` | Public exports |
| `src/components/options/ApiExplorerView.tsx` | Page wrapper |

## Related Specs
- Spec 18: Message Protocol (`spec/11-chrome-extension/18-message-protocol.md`)
- Issue 62: Backend Menu Swagger (`spec/17-app-issues/62-backend-menu-swagger-storage-files-and-zip-workflow.md`)
