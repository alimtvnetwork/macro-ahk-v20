# Generic Enforce — C#

> This file covers **C#-specific syntax and idioms only**.  
> For rules, rationale, and the canonical example, see [`readme.md`](./readme.md).

---

## Alias Mechanisms

C# has **two** approaches (neither is as clean as TS/Go/Rust):

### Inheritance (works in all C# versions)

```csharp
public class TeacherBasicRights : Student<BasicRights, int> { }
public record TeacherBasicRightsV2 : Student<BasicRightsV2, int>;
```

**Trade-off**: Creates a new runtime type (slight overhead), but fully discoverable.

### `global using` alias (C# 12+, preferred)

```csharp
global using TeacherBasicRights = Student<BasicRights, int>;
global using TeacherBasicRightsV2 = Student<BasicRightsV2, int>;
```

**Trade-off**: True zero-cost alias, but requires C# 12+ and a central `GlobalUsings.cs` file.

---

## Student-Teacher in C#

```csharp
public record Student<TRights, TKey>(
    TKey Id, TRights Rights, string Name, DateTime EnrolledAt
) where TKey : notnull;

// Named instantiations
public record TeacherBasicRights(
    int Id, BasicRights Rights, string Name, DateTime EnrolledAt
) : Student<BasicRights, int>(Id, Rights, Name, EnrolledAt);

public TeacherBasicRights GetTeacher(int id) { ... }
```

---

## Replacing `Dictionary<string, object>`

```csharp
// ❌ Prohibited
public Dictionary<string, object> Context { get; set; }

// ✅ Required
public class ErrorContext {
    public string? Endpoint { get; set; }
    public int? StatusCode { get; set; }
    public string? SessionId { get; set; }
}
```

---

## Framework vs Business Logic

```csharp
// ✅ FRAMEWORK — T stays open
public async Task<T> RetryAsync<T>(Func<Task<T>> fn, int attempts = 3) { ... }
public class ResponseCache<T> where T : class { ... }

// ✅ BUSINESS — T resolved, alias REQUIRED (via inheritance or global using)
public record PluginResponse : ApiResponse<Plugin>;
// or: global using PluginResponse = ApiResponse<Plugin>;  // C# 12+

public PluginResponse GetPlugin(int id) { ... }

// ❌ BAD — business code with raw generic
public ApiResponse<Plugin> GetPlugin(int id) { ... }  // alias it!
```

---

## C#-Specific Notes

- **`object` and `dynamic`** are C#'s equivalents of `any` — equally prohibited, even in framework code use `T` instead
- **Records** preferred over classes for data types (immutability, value equality)
- GE-1 is a **convention** in pre-C# 12 — the compiler doesn't enforce alias usage over raw generics
- Use **`global using`** (C# 12+) in a `GlobalUsings.cs` for project-wide aliases
- `T` in framework definitions is fine; `object`/`dynamic` is never fine
