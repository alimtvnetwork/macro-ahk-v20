# Seeding Default Values — Reference

**Date**: 2026-03-25  
**Referenced from**: `spec/16-tasks/master-task-breakdown.md`

---

## Overview

This document lists all default values that should be seeded by `src/background/default-project-seeder.ts` for both the SDK and Macro Controller projects.

---

## Riseup Macro SDK (Global Project)

### Identity
| Field | Value |
|-------|-------|
| `id` | `"marco-sdk"` |
| `name` | `"Riseup Macro SDK"` |
| `version` | `"1.0.0"` |
| `description` | `"Core SDK providing marco.* namespace and RiseupAsiaMacroExt.Projects.* per-project APIs"` |
| `slug` | `"riseup-macro-sdk"` (auto-derived) |
| `codeName` | `"RiseupMacroSdk"` (auto-derived) |
| `isGlobal` | `true` |
| `isRemovable` | `false` |

### URL Rules
| Pattern | Match Type | Notes |
|---------|------------|-------|
| `https://lovable.dev/projects/*` | glob | Editor pages |
| `https://*.lovable.app/*` | glob | Preview/deployed apps |
| `https://*.lovableproject.com/*` | glob | Legacy preview domain |

> **Future expansion**: When the SDK is used for additional platforms, new URL rules should be added here. Each new platform requires a glob pattern for its primary domain. See spec for URL rule management guidelines.

### Cookie Bindings
| Cookie Name | URL | Role | Description |
|-------------|-----|------|-------------|
| `lovable-session-id.id` | `https://lovable.dev` | session | Primary JWT bearer token |
| `lovable-session-id.refresh` | `https://lovable.dev` | refresh | Refresh token for session renewal |
| `__Secure-lovable-session-id.id` | `https://lovable.dev` | session | Secure-prefixed alias |
| `__Host-lovable-session-id.id` | `https://lovable.dev` | session | Host-prefixed alias |

### Scripts
| Path | Order | RunAt | Description |
|------|-------|-------|-------------|
| `marco-sdk.js` | -1 | `document_start` | SDK IIFE bundle — creates `window.marco` and `window.RiseupAsiaMacroExt` |

---

## Macro Controller (Default Project)

### Identity
| Field | Value |
|-------|-------|
| `id` | `"default-lovable"` |
| `name` | `"Macro Controller"` |
| `version` | `"1.1.0"` |
| `description` | `"Built-in MacroLoop controller for workspace and credit management"` |
| `slug` | `"macro-controller"` (auto-derived) |
| `codeName` | `"MacroController"` (auto-derived) |

### Dependencies
| Project ID | Version | Notes |
|------------|---------|-------|
| `marco-sdk` | `^1.0.0` | SDK must be injected first |

### URL Rules
Same as SDK (lovable.dev, *.lovable.app, *.lovableproject.com)

### Cookie Bindings
| Cookie Name | URL | Role | Description |
|-------------|-----|------|-------------|
| `lovable-session-id.id` | `https://lovable.dev` | session | Session ID — primary bearer token |
| `lovable-session-id.refresh` | `https://lovable.dev` | refresh | Refresh token |

### Scripts
| Path | Order | RunAt | Config Binding | Description |
|------|-------|-------|----------------|-------------|
| `macro-looping.js` | 0 | `document_idle` | `macro-looping-config.json` | MacroLoop controller |

### Settings
| Setting | Value |
|---------|-------|
| `isolateScripts` | `true` |
| `logLevel` | `"info"` |
| `retryOnNavigate` | `true` |
| `chatBoxXPath` | `/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[1]/div/div/div/div/p/br` |

---

## SDK Updater Entry

| Field | Value |
|-------|-------|
| `Name` | `"Riseup Macro SDK"` |
| `ScriptUrl` | `https://cdn.example.com/marco-sdk/latest/marco-sdk.iife.js` |
| `VersionInfoUrl` | `https://cdn.example.com/marco-sdk/version.json` |
| `IsGit` | `false` |
| `IsRedirectable` | `true` |
| `MaxRedirectDepth` | `2` |
| `HasChangelogFromVersionInfo` | `true` |
| `HasUserConfirmBeforeUpdate` | `false` |
| `AutoCheckIntervalMinutes` | `1440` (daily) |
| `CacheExpiryMinutes` | `10080` (7 days) |
| `Categories` | Script, Core |

---

## URL Rule Expansion Guidelines

When adding support for a new platform:

1. **Add glob patterns** to both the SDK and dependent projects' `targetUrls`
2. **Pattern format**: `https://<domain>/relevant-path/*` with `matchType: "glob"`
3. **Cookie bindings**: Add session/refresh cookies for the new domain if authentication is needed
4. **Test**: Verify the SDK and dependent scripts activate on the new domain
5. **Update this document** with the new platform's seeding values
