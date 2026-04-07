# Generic Enforce — Rust

> This file covers **Rust-specific syntax and idioms only**.  
> For rules, rationale, and the canonical example, see [`readme.md`](./readme.md).

---

## Alias Mechanism

```rust
type AliasName = GenericType<ConcreteA, ConcreteB>;
```

Zero-cost — erased at compile time.

---

## Student-Teacher in Rust

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Student<TRights, TKey: Clone + PartialEq> {
    id: TKey,
    rights: TRights,
    name: String,
    enrolled_at: String,
}

// Named instantiations
type TeacherBasicRights = Student<BasicRights, i32>;
type TeacherBasicRightsV2 = Student<BasicRightsV2, i32>;
type StudentByUUID = Student<BasicRights, String>;

fn get_teacher(id: i32) -> TeacherBasicRights { ... }
```

---

## Replacing `serde_json::Value`

```rust
// ❌ Prohibited in domain structs
struct ApiError {
    context: Option<serde_json::Value>,
}

// ✅ Required
struct ErrorContext {
    endpoint: Option<String>,
    status_code: Option<u16>,
    plugin_id: Option<i32>,
    session_id: Option<String>,
}

struct ApiError {
    context: Option<ErrorContext>,
}
```

## Replacing `Box<dyn Any>` → Enum

```rust
// ❌ Prohibited
struct Event { payload: Box<dyn Any> }

// ✅ Use enum (Rust's discriminated union)
enum EventPayload {
    Publish(PublishMeta),
    Snapshot(SnapshotMeta),
    Plugin(PluginMeta),
}

struct Event { payload: EventPayload }
```

---

## Framework vs Business Logic

```rust
// ✅ FRAMEWORK — T stays open
fn retry<T, F: Fn() -> Result<T, Error>>(f: F, attempts: u32) -> Result<T, Error> { ... }
struct Cache<T: Clone> { ... }

// ✅ BUSINESS — T resolved, alias REQUIRED
type PluginResponse = ApiResponse<Plugin>;
type SiteCache = Cache<SiteSettings>;

fn get_plugin(id: i32) -> PluginResponse { ... }

// ❌ BAD — business code with raw generic
fn get_plugin(id: i32) -> ApiResponse<Plugin> { ... }  // alias it!
```

---

## Rust-Specific Notes

- `type` aliases are zero-cost — erased at compile time
- **Enums** (sum types) are the idiomatic replacement for `Box<dyn Any>` when variants are known
- `serde_json::Value` is acceptable ONLY at deserialization boundaries, never in domain structs
- Trait objects (`dyn Trait`) are for runtime polymorphism — prefer enums for known variant sets
- `T` in framework/utility functions is acceptable; `Box<dyn Any>` is never acceptable in business logic
