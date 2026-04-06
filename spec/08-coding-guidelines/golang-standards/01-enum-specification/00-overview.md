# Enum Specification

**Version:** 2.0.0  
**Status:** Complete  
**Updated:** 2026-02-11  
**Error Range:** N/A (Cross-cutting standard)

---

## Purpose

This specification defines the **universal enum pattern** for all Go-based CLI applications in the ecosystem. All enums must follow this standard to ensure consistency, type safety, and maintainability.

---

## Index

| File | Purpose |
|------|---------|
| [01-enum-pattern.md](01-enum-pattern.md) | Core byte-based enum pattern |
| [02-required-methods.md](02-required-methods.md) | Mandatory methods for all enums |
| [03-folder-structure.md](03-folder-structure.md) | Directory layout standard |
| [04-validation-checklist.md](04-validation-checklist.md) | Compliance audit checklist |

---

## Quick Reference

### Enum Declaration

```go
package provider

type Variant byte

const (
    Invalid Variant = iota
    SerpAPI
    MapsScraper
    Colly
)
```

### Required Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `String` | `(v Variant) String() string` | String representation |
| `Label` | `(v Variant) Label() string` | Human-readable label |
| `Is{Value}` | `(v Variant) IsSerpAPI() bool` | Type check for each variant |
| `IsOther` | `(v Variant) IsOther(other Variant) bool` | Inverse check — true if NOT the given variant |
| `IsAnyOf` | `(v Variant) IsAnyOf(others ...Variant) bool` | True if receiver matches any in the list |
| `All` | `All() []Variant` | Returns all valid variants |
| `ByIndex` | `ByIndex(i int) Variant` | Get variant by index |
| `Parse` | `Parse(s string) (Variant, error)` | Parse string to variant |
| `IsValid` | `(v Variant) IsValid() bool` | Check if variant is valid |
| `MarshalJSON` | `(v Variant) MarshalJSON() ([]byte, error)` | JSON serialization |
| `UnmarshalJSON` | `(v *Variant) UnmarshalJSON([]byte) error` | JSON deserialization |

### Key Rules

| Rule | Description |
|------|-------------|
| Zero value | Always `Invalid Variant = iota` (never `Unknown`) |
| variantLabels | Single lookup table for serialization, parsing, and display |

### Folder Structure

```
internal/enums/
├── provider/
│   └── variant.go
├── platform/
│   └── variant.go
├── engine/
│   └── variant.go
└── search_mode/
    └── variant.go
```

---

## Applies To

| CLI / Project | Status | Score | Audit Report |
|---------------|--------|-------|--------------|
| GSearch CLI | ✅ Compliant | 50/50 | `.lovable/audits/gsearch-cli-enum-compliance-audit-2026-02-06.md` |
| BRun CLI | ✅ Compliant | 50/50 | `.lovable/audits/brun-cli-enum-compliance-audit-2026-02-06.md` |
| AI Bridge CLI | ✅ Compliant | 50/50 | `.lovable/audits/ai-bridge-cli-enum-compliance-audit-2026-02-06.md` |
| Nexus Flow CLI | ✅ Compliant | 50/50 | `.lovable/audits/nexus-flow-cli-enum-compliance-audit-2026-02-06.md` |
| Spec Reverse CLI | ✅ Compliant | 50/50 | `.lovable/audits/spec-reverse-cli-enum-compliance-audit-2026-02-06.md` |
| WP SEO Publish CLI | ✅ Compliant | 50/50 | `.lovable/audits/wp-seo-publish-cli-enum-compliance-audit-2026-02-06.md` |
| AI Transcribe CLI | ✅ Compliant | 50/50 | `.lovable/audits/ai-transcribe-cli-enum-compliance-audit-2026-02-06.md` |
| WP Plugin Builder | ✅ Compliant | 50/50 | `.lovable/audits/wp-plugin-builder-cli-enum-compliance-audit-2026-02-06.md` |
| Spec Management | ✅ Compliant | 50/50 | `.lovable/audits/spec-management-enum-compliance-audit-2026-02-06.md` |
| **WP Plugin Publish** | 🔄 Migration In Progress | — | 11/12 migrated, 1 int-based exempt |

> **Note:** All 9 CLIs have been migrated to `Invalid` as zero value per spec v2.0.0 (completed 2026-02-11).  
> **Note:** WP Plugin Publish backend — 11 of 12 string-based enums migrated to byte-based `internal/enums/` pattern (2026-02-21). `HttpStatusType` remains `int`-based (exempt).

### WP Plugin Publish — Enum Migration Tracker

| Old Type (`wordpress/`) | New Package (`enums/`) | Status |
|---|---|---|
| `StatusType` | `status.Variant` | ✅ Migrated |
| `PluginStatusType` | `pluginstatus.Variant` | ✅ Migrated |
| `PostStatusType` | `poststatus.Variant` | ✅ Migrated |
| `ActionType` | `action.Variant` | ✅ Migrated |
| `ContentTypeValue` | `contenttype.Variant` | ✅ Migrated |
| `EndpointType` | `endpoint.Variant` | ✅ Migrated |
| `HeaderType` | `header.Variant` | ✅ Migrated |
| `ResponseKeyType` | `responsekey.Variant` | ✅ Migrated |
| `ResponseMessageType` | `responsemessage.Variant` | ✅ Migrated |
| `SnapshotErrorType` | `snapshoterrror.Variant` | ✅ Migrated |
| `UploadSourceType` | `uploadsource.Variant` | ✅ Migrated |
| `HttpStatusType` | — | ⏭️ Exempt (`int`) |

> **Pending:** Consumer import updates across handlers and services.

---

## Cross-References

- [Error Code Registry](../../../11-imported/error-management/01-error-handling/readme.md)
- Split DB Architecture *(spec archived — no longer linked)*
- Coding Guidelines *(see project memory)*

---

*Universal enum standard for Go CLI ecosystem.*
