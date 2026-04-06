# Go Boolean Standards — Positive Logic & Naming

> **Version**: 1.0.0
> **Last updated**: 2026-02-23

## 1. Positive Boolean Naming (Rule P1)

All boolean-returning functions and variables **must** use positive semantic names with `Is` or `Has` prefixes.

```go
// ✅ Positive naming
func IsValid() bool
func HasPermission() bool
func IsActive() bool

// ❌ Negative naming — PROHIBITED
func IsNotValid() bool
func HasNoPermission() bool
func IsDisabled() bool
```

**Exception — Enum Variant Checkers**: Functions that match an enum variant's own name are permitted, even if the name sounds negative. The following are exempt (enforced by [lint script](scripts/lint-readable-conditions.sh)):

| Exempt Function | Enum Variant | Rationale |
|-----------------|--------------|-----------|
| `IsNotFound()` | `NotFound` | HTTP 404 / lookup miss |
| `IsNotSet()` | `NotSet` | Zero-value sentinel |
| `IsNotApplicable()` | `NotApplicable` | N/A state |
| `IsUnknown()` | `Unknown` | Unrecognized input |
| `IsUndefined()` | `Undefined` | Uninitialized state |
| `IsUnspecified()` | `Unspecified` | Protobuf-style default |
| `IsNone()` | `None` | Absence sentinel |
| `IsInvalid()` | `Invalid` | Failed validation |
| `IsInactive()` | `Inactive` | Disabled state |
| `IsIncomplete()` | `Incomplete` | Partial data |
| `IsDisconnected()` | `Disconnected` | Connection lost |
| `IsUnavailable()` | `Unavailable` | Service down |
| `IsUnsupported()` | `Unsupported` | Feature not available |
| `IsUninitialized()` | `Uninitialized` | Pre-setup state |
| `IsUnresolved()` | `Unresolved` | Pending resolution |

Any `IsNot*` or `IsUn*` function **not** in this list is flagged as a P1 violation.

## 2. Negation Elimination (Rule P2)

### 2.1 — Named Boolean Variables

Replace inline `!` negation with named positive-logic variables:

```go
// ❌ Inline negation
if !user.IsAdmin() && !request.IsInternal() {
    return ErrForbidden
}

// ✅ Named positive logic
isExternalNonAdmin := user.IsRegular() && request.IsExternal()

if isExternalNonAdmin {
    return ErrForbidden
}
```

### 2.2 — Positive Counterpart Methods

When a type has an `IsX()` method and code frequently uses `!IsX()`, add a positive counterpart:

```go
// pathutil package
func IsDirMissing(path string) bool { return !IsDir(path) }

// dbutil.Result[T]
func (r Result[T]) IsEmpty() bool { return !r.defined }  // already exists ✅
```

### 2.3 — Enum Comparisons

Use `IsOther(val)` or `IsInvalid()` instead of `!=` or `!IsValid()`:

```go
// ❌ Negated comparison
if !v.IsValid() {
    return variantLabels[Invalid]
}

// ✅ Positive counterpart
if v.IsInvalid() {
    return variantLabels[Invalid]
}
```

## 3. Idiomatic Go Exemptions

The following patterns are **exempt** from negation elimination:

### 3.1 — Comma-ok Pattern

```go
// ✅ Exempt — idiomatic Go
value, ok := someMap[key]
if !ok {
    return ErrNotFound
}
```

### 3.2 — Handler Guard Returns

Early-return guards in HTTP handlers that return false on failure:

```go
// ✅ Exempt — handler guard pattern
if !requireService(w, Services.SyncService, "Sync service") {
    return
}
if !decodeJSON(w, r, &input) {
    return
}
```

### 3.3 — Error-nil Check

```go
// ✅ Exempt — idiomatic Go
if err != nil {
    return err
}
```

### 3.4 — Standard Library Returns

Direct `!` on stdlib function returns where no wrapper exists:

```go
// ✅ Exempt — stdlib call
if !strings.HasPrefix(path, "/api/") {
    return
}
```

However, if the same stdlib negation appears 3+ times, extract a named boolean or helper:

```go
// When repeated, extract:
isNonApiRoute := !strings.HasPrefix(r.URL.Path, "/api/")
if isNonApiRoute {
    next.ServeHTTP(w, r)
    return
}
```

## 4. Variable Naming Rules

| Pattern | Example | Status |
|---------|---------|--------|
| `is` + PositiveAdjective | `isValid`, `isActive`, `isReady` | ✅ Required |
| `has` + PositiveNoun | `hasPermission`, `hasRows`, `hasError` | ✅ Required |
| `is` + NegativeResult | `isDirMissing`, `isMkdirFailed` | ✅ Permitted |
| `not` prefix | `notFound`, `notReady` | ❌ Prohibited |
| `no` prefix | `noResults`, `noPermission` | ❌ Prohibited |

## 5. Enforcement

- **Automated**: `scripts/lint-negative.sh` flags `IsNot*`, `HasNo*` function declarations
- **Manual review**: Inline `!` negation in compound boolean expressions
- **Enum exemption**: Variant checkers matching their constant name (e.g., `IsNotFound` for `NotFound` variant) are auto-excluded

## 6. Cross-References

- [Readable Conditions (RC1–RC4)](03-readable-conditions.md) — Named booleans, decomposed comparisons, compound conditions & whitespace rules
- [RC1–RC4 Compliance Report](04-rc-compliance-report.md) — Audit of all spec files for readable conditions compliance
- [RC1–RC4 + P1–P2 Lint Script](scripts/lint-readable-conditions.sh) — Automated pre-commit/CI linter
- [No Raw Negations](../coding-guidelines/no-negatives.md) — Cross-language positive guard functions
- [Boolean Principles (P1–P6)](../coding-guidelines/boolean-principles.md) — Cross-language boolean logic rules

## 7. Cross-Language Alignment

This standard mirrors the PHP Boolean Guard System (P1–P6) with Go-specific exemptions for idiomatic patterns (comma-ok, handler guards, error-nil checks). See `spec/06-php-standards/naming-conventions.md` for the PHP counterpart.
