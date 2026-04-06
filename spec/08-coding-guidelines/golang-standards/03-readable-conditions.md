# Go Readable Conditions — Named Booleans & Whitespace

> **Version**: 1.0.0
> **Last updated**: 2026-02-28

---

## Purpose

Conditional expressions must read like **plain English statements**. Every comparison, flag check, and compound condition must be decomposed into descriptively named boolean variables before use in `if` statements.

---

## 1. Positive Flag Names (Rule RC1)

Never compare a boolean to `false` or negate a flag inline. Instead, create a **positive counterpart variable**.

```go
// ❌ FORBIDDEN — comparing to false
if isDryRun == false {
    s.executeLive()
}

// ❌ FORBIDDEN — inline negation of flag
if !isDryRun {
    s.executeLive()
}

// ✅ REQUIRED — positive flag
isLiveRun := !isDryRun

if isLiveRun {
    s.executeLive()
}
```

**Rule:** If you need the inverse of a boolean, assign it to a new variable with a positive name — never use `== false` or inline `!` at the `if` site.

---

## 2. Decomposed Comparisons (Rule RC2)

Numeric comparisons (`> 0`, `== ""`, `!= nil`, etc.) must be extracted into named booleans that describe the **business meaning**, not the technical check.

```go
// ❌ FORBIDDEN — raw comparison in condition
if totalDeleted > 0 {
    s.logCleanupAudit(results)
}

// ✅ REQUIRED — named boolean with business meaning
hasDeletedItems := totalDeleted > 0

if hasDeletedItems {
    s.logCleanupAudit(results)
}
```

```go
// ❌ FORBIDDEN — raw string comparison
if config.BuildCommand == "" {
    return ErrBuildNotConfigured
}

// ✅ REQUIRED — named boolean
hasEmptyBuildCommand := config.BuildCommand == ""

if hasEmptyBuildCommand {
    return ErrBuildNotConfigured
}
```

```go
// ❌ FORBIDDEN — raw length check
if len(results) == 0 {
    return ErrNoResults
}

// ✅ REQUIRED — named boolean
isResultsEmpty := len(results) == 0

if isResultsEmpty {
    return ErrNoResults
}
```

**Exception:** Simple early-return guards on `err != nil` are exempt (idiomatic Go):

```go
// ✅ EXEMPT — idiomatic error check
if err != nil {
    return err
}
```

---

## 3. Compound Conditions (Rule RC3)

When a condition combines multiple checks, **each check** must be a named boolean, and the compound must also be named.

```go
// ❌ FORBIDDEN — inline compound with mixed concerns
if !isDryRun && totalDeleted > 0 {
    s.logCleanupAudit(results)
}

// ✅ REQUIRED — fully decomposed
isLiveRun := !isDryRun
hasDeletedItems := totalDeleted > 0
isLiveRunWithDeletions := isLiveRun && hasDeletedItems

if isLiveRunWithDeletions {
    s.logCleanupAudit(results)
}
```

```go
// ❌ FORBIDDEN — inline negated compound
if !config.BuildEnabled || config.BuildCommand == "" {
    return apperror.FailNew[BuildResult](apperror.ErrBuildNotConfigured, "build not configured")
}

// ✅ REQUIRED — decomposed with positive names
isBuildDisabled := !config.BuildEnabled
hasEmptyBuildCommand := config.BuildCommand == ""
isBuildMissing := isBuildDisabled || hasEmptyBuildCommand

if isBuildMissing {
    return apperror.FailNew[BuildResult](apperror.ErrBuildNotConfigured, "build not configured")
}
```

---

## 4. Whitespace Before Conditions (Rule RC4)

A **blank line** must appear before every `if` block that uses a named boolean variable. This visually separates the declaration from the control flow.

```go
// ❌ FORBIDDEN — no blank line before if
hasDeletedItems := totalDeleted > 0
if hasDeletedItems {
    s.logCleanupAudit(results)
}

// ✅ REQUIRED — blank line before if
hasDeletedItems := totalDeleted > 0

if hasDeletedItems {
    s.logCleanupAudit(results)
}
```

When multiple named booleans compose into a compound, the blank line goes before the `if`, not between declarations:

```go
// ✅ REQUIRED — declarations grouped, blank line before if
isLiveRun := !isDryRun
hasDeletedItems := totalDeleted > 0
isLiveRunWithDeletions := isLiveRun && hasDeletedItems

if isLiveRunWithDeletions {
    s.logCleanupAudit(results)
}
```

---

## 5. Variable Naming Patterns

| Pattern | Use When | Example |
|---------|----------|---------|
| `is` + PositiveState | Flag or state check | `isLiveRun`, `isBuildDisabled` |
| `has` + Noun | Existence/count check | `hasDeletedItems`, `hasResults` |
| `is` + CompoundDesc | Combining multiple checks | `isLiveRunWithDeletions` |
| `is` + Noun + Empty | Empty string/slice check | `isResultsEmpty`, `isBuildCommandEmpty` |
| `hasEmpty` + Field | Empty field check | `hasEmptyBuildCommand` |

**Prohibited patterns:**

| Pattern | Why | Fix |
|---------|-----|-----|
| `== false` | Unreadable | Assign inverse to positive-named variable |
| `!flag` at `if` site | Easy to miss | Assign `isOpposite := !flag` above |
| `> 0` / `== ""` in `if` | Technical, not semantic | Extract to `has*` / `isEmpty*` variable |
| Compound without names | Cognitive overload | Decompose into intermediate booleans |

---

## 6. Exemptions

The following are **exempt** from decomposition:

### 6.1 — Idiomatic Error Check

```go
// ✅ EXEMPT
if err != nil {
    return err
}
```

### 6.2 — Comma-ok Pattern

```go
// ✅ EXEMPT
value, ok := someMap[key]
if !ok {
    return ErrNotFound
}
```

### 6.3 — Single Simple Boolean Variable

When the variable is already a well-named `is*`/`has*` boolean and used alone (no compound):

```go
// ✅ EXEMPT — already semantic, single check
if isEnabled {
    s.start()
}
```

### 6.4 — Handler Guard Returns

```go
// ✅ EXEMPT — handler guard pattern
if !requireService(w, Services.SyncService, "Sync service") {
    return
}
```

---

## 7. Enforcement

- **Code review:** Every `if` with `>`, `<`, `==`, `!=`, or `!` (except exemptions) must use a named boolean
- **Whitespace:** Every named-boolean `if` must have a preceding blank line
- **Naming:** All boolean variables must follow Section 5 naming patterns

---

## Cross-References

- [Boolean Standards](02-boolean-standards.md) — Positive logic & `Is`/`Has` naming rules
- [RC1–RC4 Compliance Report](04-rc-compliance-report.md) — Audit of all spec files for readable conditions compliance
- [No Raw Negations](../coding-guidelines/no-negatives.md) — Cross-language positive guard functions
- [Boolean Principles](../coding-guidelines/boolean-principles.md) — P1–P6 boolean logic rules
- [Cross-Language Code Style](../coding-guidelines/code-style.md) — Braces, nesting & spacing rules
- [RC1–RC4 + P1–P2 Lint Script](scripts/lint-readable-conditions.sh) — Automated pre-commit/CI linter

---

*Readable conditions specification v1.0.0 — 2026-02-28*
