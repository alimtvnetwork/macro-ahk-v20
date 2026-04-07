# Generic Enforce Specification — Changelog

All notable changes to the Generic Enforce specification are documented here.

---

## v1.1.1 — 2026-02-12

### Added
- **`scripts/lint-ge.sh`** — Grep-based CI enforcement script that flags `any`, `Record<string, unknown>`, `interface{}`, `Dictionary<string, object>`, `serde_json::Value`, and `Box<dyn Any>` across TS/Go/C#/Rust with GE-5 framework exemptions.
- `--fix-guide` flag for remediation guidance output.

---

## v1.1.0 — 2026-02-12

### Added
- **GE-5: Framework vs Business Logic Boundary** — Generic type parameters (`T`) are permitted at the definition site in framework/utility code; business logic must alias all resolved generics.
- **Type Erasure Hierarchy** — WORST (`any`) → BAD (`Record<string, unknown>`) → OK (`Generic<T>`) → BEST (`type Alias = Generic<DomainType>`).
- **Architect's Notes** (§8) — Five design rationale entries covering GE-5 centrality, `T ≠ any`, C# limitations, `Record<string, unknown>` policy, and the boundary test.
- **Enforcement script** — `scripts/lint-ge.sh` for grep-based CI checks across TS/Go/C#/Rust.

### Changed
- README restructured as single source of truth; language files (`typescript.md`, `golang.md`, `csharp.md`, `rust.md`) now cover syntax only.
- Each language file updated with framework vs business logic examples.

### Audit
- Full codebase audit completed — **zero violations** across 23 remediated files.
- Named domain types created: `HttpHeaders`, `ErrorDiagnosticContext`, `RequestPayload`, `LogEntryDetails`, `SessionOperationMetadata`, `ErrorCountMap`.

---

## v1.0.0 — 2026-02-11

### Added
- **GE-1: Named Alias Required** — Every concrete generic instantiation with domain-meaningful parameters must produce a named type alias.
- **GE-2: Zero Loose Types** — Cross-language ban on `Record<string, unknown>`, `map[string]interface{}`, `Dictionary<string, object>`, `serde_json::Value`, `any`, `unknown`, `object`, `dynamic`, `Box<dyn Any>`.
- **GE-3: Hierarchy via Composition** — Named alias families for multiple instantiations of the same generic.
- **GE-4: Trivial Generics Exception** — Primitive-only collections exempt unless used 3+ times.
- **Canonical Student-Teacher example** — Language-agnostic in README with per-language implementations.
- **Real-world `Record<string, unknown>` elimination** — Before/after with discriminated unions.
- Language-specific guides: `typescript.md`, `golang.md`, `csharp.md`, `rust.md`.
