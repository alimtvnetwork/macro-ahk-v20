# Generic Enforce Specification

**Version**: 1.1.1  
**Status**: Active  
**Applies to**: Any language with generics / parametric polymorphism

---

## 1. Principle

> **Every concrete instantiation of a generic type whose parameters carry domain meaning MUST produce a named type alias.**

Raw generic instantiations (e.g., `Record<string, unknown>`, `map[string]interface{}`, `Dictionary<string, object>`, `serde_json::Value`) are **PROHIBITED** in public APIs, function signatures, props, struct/interface fields, and store state.

---

## 2. Motivation

| Benefit | Explanation |
|---------|-------------|
| **DRY** | Generic parameters defined once; refactoring touches one line |
| **Self-documenting** | `ErrorContext` conveys domain intent; `Record<string, unknown>` conveys nothing |
| **Grep-friendly** | Search by alias name to find all usages of a specific instantiation |
| **Prevents drift** | Without a named alias, teams use the same raw generic in subtly different ways |
| **Compiler as documentation** | The alias name encodes what the data *means*, not just its shape |
| **IDE discoverability** | Named aliases appear in autocomplete; raw generics don't |

---

## 3. Core Rules

### GE-1: Named Alias Required

Every use of a generic with concrete type parameters MUST have a named alias **when the parameters encode domain meaning**.

```
❌ BAD:  field: Generic<DomainTypeA, number>    // raw instantiation scattered in code
✅ GOOD: alias SpecificName = Generic<DomainTypeA, number>
         field: SpecificName
```

### GE-2: Zero Loose Types (Cross-Language)

The following are **PROHIBITED** in all languages — no exceptions outside parse boundaries:

| Category | Prohibited Types (by language) |
|----------|-------------------------------|
| **Untyped containers** | `Record<string, unknown>` (TS), `map[string]interface{}` (Go), `Dictionary<string, object>` (C#), `serde_json::Value` in domain structs (Rust) |
| **Top types** | `any` (TS/Go), `unknown` except parse boundaries (TS), `object` / `dynamic` (C#), `Box<dyn Any>` (Rust) |
| **Escape hatches** | `as any` casts (TS), `interface{}` params (Go), `dynamic` (C#) |

**Parse boundary exception**: `unknown` (TS) and `serde_json::Value` (Rust) are acceptable ONLY at JSON deserialization entry points where they are **immediately narrowed** via type guards or `serde` deserialization. Never in public APIs, props, hooks, or store state.

### GE-3: Hierarchy via Composition

When a generic has multiple concrete instantiations, create a **family of named aliases** — not repetition of raw params.

```
// Base generic
Generic<T, TKey>

// Named family (REQUIRED)
alias SpecificA = Generic<DomainTypeA, number>
alias SpecificB = Generic<DomainTypeB, string>
alias SpecificC = Generic<DomainTypeC, number>
```

### GE-4: Trivial Generics Exception

Simple collections with **primitive-only** parameters do NOT require aliases unless:
- They carry domain meaning, OR
- They appear in **3+ places**

```
✅ OK:     names: string[]                        // trivial, primitive
✅ OK:     headers: Record<string, string>         // known value type, used once
✅ BETTER: alias HttpHeaders = Record<string, string>  // if used 3+ times
❌ BAD:    context: Record<string, unknown>         // unknown = zero domain meaning → ALWAYS alias
```

### GE-5: Framework vs Business Logic Boundary

This is the most important nuance. `T` is acceptable — but **only at the framework layer**.

**Framework code** (libraries, utilities, infrastructure plumbing) **defines** generics. The type parameter `T` stays open because the framework doesn't know what domain type will fill it. This is correct and expected:

```
// ✅ FRAMEWORK LAYER — T stays open (this is the definition)
function retry<T>(fn: () => T, attempts: number): T { ... }
class Cache<T> { get(key: string): T | null { ... } }
struct ApiResponse<T> { data: T, status: number }
```

**Business logic** (your application, domain layer, features) **uses** those generics with concrete domain types. At this point, `T` is resolved and **MUST be aliased**:

```
// ✅ BUSINESS LAYER — T is resolved, alias required
alias PluginResponse = ApiResponse<Plugin>
alias SiteCache = Cache<SiteSettings>

function getPlugin(): PluginResponse { ... }

// ❌ BAD — business code using raw generic with concrete types
function getPlugin(): ApiResponse<Plugin> { ... }    // alias it!
result = retry<Plugin>(() => fetchPlugin(id))         // ✅ OK — retry is pure plumbing, T is pass-through
```

**The critical rule**: If you are at a **call site** in business code and the generic parameters encode **domain meaning** (not just pass-through plumbing), you MUST alias. The `T` exception exists ONLY at the **definition site** of framework/utility code.

**What is NEVER acceptable — even in framework code:**

```
❌ interface{} / any / unknown / object / dynamic / Box<dyn Any>
```

These are not generics — they are type erasure. `T` is constrained and compiler-checked. `any` is a surrender. Even framework code must use `T` (or a constrained type parameter), never `any` or its equivalents. The hierarchy from worst to best:

```
WORST:  any / interface{} / unknown / object     → Zero type info, zero safety
BAD:    Record<string, unknown> / map[string]any  → Container with no domain meaning  
OK:     Generic<T>                                → Framework definition, T is open
BEST:   alias SpecificName = Generic<DomainType>  → Fully resolved, self-documenting
```

---

## 4. The Canonical Example: Student → Teacher

This example is **language-agnostic**. See language files for exact syntax.

### Problem: Raw Generics Everywhere

```
// Base generic
struct Student<TRights, TKey> {
  id:     TKey
  rights: TRights
  name:   string
}

// ❌ BAD: Raw instantiation repeated across codebase
function getTeacher()   → Student<BasicRights, number>
function getTeacherV2() → Student<BasicRightsV2, number>
function getStudent()   → Student<BasicRights, string>
```

**Problems**: If `TKey` changes from `number` to `string`, you hunt through every file. No IDE autocomplete for the specific combination. No grep target.

### Solution: Named Instantiations

```
// Define rights
struct BasicRights   { canRead, canWrite }
struct BasicRightsV2 { canRead, canWrite, canAdmin, canExport }

// ✅ Named aliases — defined ONCE, co-located with the base generic
alias TeacherBasicRights   = Student<BasicRights, number>
alias TeacherBasicRightsV2 = Student<BasicRightsV2, number>
alias StudentByUUID        = Student<BasicRights, string>

// ✅ Clean usage — DRY, discoverable, refactor-safe
function getTeacher()   → TeacherBasicRights
function getTeacherV2() → TeacherBasicRightsV2
function getStudent()   → StudentByUUID
```

### Why This Works

1. **Single source of truth** — Change `TKey` from `number` to `string`? Update ONE alias.
2. **IDE discoverability** — `TeacherBasicRights` appears in autocomplete; `Student<BasicRights, number>` does not.
3. **Refactor-safe** — Rename the alias → compiler catches every usage.
4. **Domain language** — Code reads like the business, not like a type system puzzle.

---

## 5. Real-World Application: Eliminating `Record<string, unknown>`

### Before (Prohibited)

```
struct ApiError {
  context: Record<string, unknown>   // What IS this? Nobody knows.
}

struct SessionInfo {
  metadata: Record<string, unknown>  // Could be anything. Useless.
}
```

### After (Required)

```
// Define what context ACTUALLY contains
struct ErrorContext {
  endpoint?:   string
  statusCode?: number
  requestId?:  string
  pluginId?:   number
  sessionId?:  string
}

struct ApiError {
  context?: ErrorContext   // Self-documenting, type-safe, grep-friendly
}

// Use discriminated unions when metadata varies by type
union SessionMetadata =
  | PublishSessionMeta   { version, targetVersion, siteUrl }
  | SnapshotSessionMeta  { scope, snapshotType, tableCount }
  | PluginSessionMeta    { action, pluginSlug, siteName }

struct SessionInfo {
  metadata?: SessionMetadata
}
```

---

## 6. Enforcement Checklist

- [ ] Every `Record<string, unknown>` (or equivalent) replaced with a named domain type
- [ ] Every `interface{}` / `any` / `object` / `dynamic` replaced with a concrete or constrained type
- [ ] All named aliases co-located with their base generic or in a shared `types` module
- [ ] No raw generic instantiation with 2+ domain-meaningful type params in function signatures
- [ ] Discriminated unions used where metadata varies by category/type

---

## 7. Language-Specific Guides

Each guide covers ONLY the language-specific **mechanism** (syntax, idioms, limitations) — not the rules above, which are universal.

| Language | File | Alias Mechanism |
|----------|------|----------------|
| TypeScript | [`typescript.md`](./typescript.md) | `type X = Y<A, B>` |
| Go 1.18+ | [`golang.md`](./golang.md) | `type X = Y[A, B]` |
| C# | [`csharp.md`](./csharp.md) | Inheritance or `global using` (C# 12+) |
| Rust | [`rust.md`](./rust.md) | `type X = Y<A, B>;` |

---

## 8. Architect's Notes

1. **GE-5 is the heart of the spec** — The framework/business boundary is what makes this practical. Framework code (`retry<T>`, `cache<T>`) keeps `T` open because it's a tool definition. Business code resolves `T` to real domain types and MUST alias them. Without this distinction, teams either over-alias utility calls (ceremony without value) or under-alias domain types (the actual problem).
2. **`T` ≠ `any`** — `T` is a constrained, compiler-checked type parameter. `any`/`interface{}`/`unknown`/`object` are type erasure. Even in framework code, `T` is the worst acceptable case — never `any`. The difference: `T` says "I don't know yet but the compiler will check"; `any` says "I gave up."
3. **C# is the weakest link** — it requires inheritance (runtime cost) or file-scoped `using` (C# 12+, not truly global before that). GE-1 is a *convention* in C#, not compiler-enforced like TS/Go/Rust.
4. **`Record<string, unknown>` is ALWAYS a violation** — it's never trivial because `unknown` carries zero domain meaning. There is no exception.
5. **The boundary test**: Ask "am I defining a reusable tool, or am I using a tool with a specific domain type?" If defining → `T` stays. If using → alias it.

---

## 9. Related Specifications

- [Type Safety Rules](../../08-coding-guidelines/typescript-standards/readme.md)
- [DRY Principles](../../08-coding-guidelines/coding-guidelines/dry-principles.md)
- [Golang Standards](../../08-coding-guidelines/golang-standards/readme.md)
