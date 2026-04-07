# Generic Enforce — Golang

> This file covers **Go-specific syntax and idioms only**.  
> For rules, rationale, and the canonical example, see [`readme.md`](./readme.md).

---

## Core Principle: Zero `any`, Zero `interface{}`

In Go, `any` is syntactic sugar for `interface{}`. **Both are equally prohibited** in:

- Struct fields
- Function parameters and return types
- Type aliases (`type X = map[string]any` is still a violation)
- Map value types in business logic (`map[string]any`)

The **only** acceptable replacement is:

1. **Concrete types** — when the type is known
2. **Generic type parameters `T`** — when the type varies but is constrained
3. **Constraint interfaces** — to bound `T` in generic definitions

---

## Alias Mechanism (Go 1.18+)

```go
// Type alias — preserves method set
type AliasName = GenericType[ConcreteA, ConcreteB]

// Type definition — creates new type, can add methods
type NewType GenericType[ConcreteA, ConcreteB]
```

Use **alias** (`=`) to preserve methods. Use **definition** (no `=`) when adding methods.

---

## Student-Teacher in Go

```go
type Student[TRights any, TKey comparable] struct {
    Id        TKey    `json:"id"`
    Rights    TRights `json:"rights"`
    Name      string  `json:"name"`
    EnrolledAt string `json:"enrolledAt"`
}

// Named instantiations
type TeacherBasicRights = Student[BasicRights, int]
type TeacherBasicRightsV2 = Student[BasicRightsV2, int]
type StudentByUUID = Student[BasicRights, string]

func GetTeacher(id int) TeacherBasicRights { ... }
```

---

## Replacing `map[string]any` / `map[string]interface{}`

Every `map[string]any` in business logic MUST become a **typed struct**.

```go
// ❌ PROHIBITED — type erasure, zero domain meaning
type ApiError struct {
    Context map[string]any `json:"context"`
}

func BroadcastLog(level, message string, context map[string]any) { ... }

details := map[string]any{
    "error":  err.Error(),
    "siteId": id,
}

// ✅ REQUIRED — concrete struct with named fields
type ErrorContext struct {
    Endpoint   string `json:"endpoint,omitempty"`
    StatusCode int    `json:"statusCode,omitempty"`
    PluginId   int    `json:"pluginId,omitempty"`
    SessionId  string `json:"sessionId,omitempty"`
}

type ApiError struct {
    Context *ErrorContext `json:"context,omitempty"`
}

type LogContext struct {
    SiteId   int64  `json:"siteId,omitempty"`
    PluginId int64  `json:"pluginId,omitempty"`
    Error    string `json:"error,omitempty"`
}

func BroadcastLog(level, message string, context LogContext) { ... }
```

### When multiple shapes share the same field

Use **embedded structs** or **composition**, not `map[string]any`:

```go
// Base fields shared by all operation details
type OperationContext struct {
    SiteId   int64  `json:"siteId,omitempty"`
    PluginId int64  `json:"pluginId,omitempty"`
    Error    string `json:"error,omitempty"`
}

// Specialized contexts embed the base
type PublishDetails struct {
    OperationContext
    Version       string `json:"version,omitempty"`
    TargetVersion string `json:"targetVersion,omitempty"`
}

type BackupDetails struct {
    OperationContext
    Path     string `json:"path,omitempty"`
    FileSize int64  `json:"fileSize,omitempty"`
}
```

---

## Framework vs Business Logic

```go
// ✅ FRAMEWORK — T stays open (defining a reusable tool)
func Retry[T any](fn func() (T, error), attempts int) (T, error) { ... }
type Cache[T any] struct { ... }

// ✅ BUSINESS — T resolved, alias REQUIRED
type PluginResponse = ApiResponse[Plugin]
type SiteCache = Cache[SiteSettings]

func GetPlugin(id int) PluginResponse { ... }

// ❌ BAD — business code with raw generic
func GetPlugin(id int) ApiResponse[Plugin] { ... }  // alias it!
```

### Framework generics replacing `any` params

Functions that accept "anything" MUST use `T` instead of `any`:

```go
// ❌ PROHIBITED — even in framework/utility code
func respondSuccess(w http.ResponseWriter, data any) { ... }
func Broadcast(eventType string, data any) { ... }
func Success(data any) Response { ... }

// ✅ REQUIRED — generic type parameter
func respondSuccess[T any](w http.ResponseWriter, data T) { ... }
func Broadcast[T any](eventType string, data T) { ... }
func Success[T any](data T) Response { ... }
```

The difference: `T` is compiler-checked at each call site. `any` discards all type info.

### Generic struct fields

```go
// ❌ PROHIBITED — any in struct fields
type Message struct {
    Data any `json:"data"`
}

type PaginatedSessions struct {
    Sessions any `json:"sessions"`
}

// ✅ REQUIRED — generic or concrete
type Message[T any] struct {
    Data T `json:"data"`
}

type PaginatedSessions struct {
    Sessions []*SessionSummary `json:"sessions"`
}
```

---

## Replacing `any` in function signatures

### Option A: Generic type parameter (preferred for framework code)

```go
// ❌ PROHIBITED
func requireService(w http.ResponseWriter, service any, name string) bool
func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool

// ✅ Generic
func requireService[T any](w http.ResponseWriter, service T, name string) bool
func decodeJSON[T any](w http.ResponseWriter, r *http.Request, target *T) bool
```

### Option B: Concrete type (preferred for business code)

```go
// ❌ PROHIBITED
func (e *AppError) WithContext(key string, value any) *AppError

// ✅ Typed struct replaces the entire map
type AppErrorContext struct {
    SessionId string `json:"sessionId,omitempty"`
    PluginId  int64  `json:"pluginId,omitempty"`
    SiteId    int64  `json:"siteId,omitempty"`
    Endpoint  string `json:"endpoint,omitempty"`
}

func (e *AppError) WithContext(ctx AppErrorContext) *AppError
```

### Option C: Constraint interface (when T must satisfy behavior)

```go
// ✅ Constrained generic
type Processable interface {
    Plugin | Site | Settings
}

func Process[T Processable](data T) error { ... }
```

---

## Variadic `...any` in loggers

Structured loggers using `keyvals ...any` are a **known exception** at the framework level ONLY if:

1. The logger is a **pure infrastructure utility** (not business logic)
2. There is no practical way to type the variadic args (key-value alternation pattern)
3. It is confined to the `logger` package definition — callers in business code SHOULD prefer typed context structs

```go
// ✅ ACCEPTABLE — logger framework definition only
func (l *Logger) Info(msg string, keyvals ...any) { ... }

// ✅ PREFERRED at call sites — typed context passed to typed methods
type LogFields struct {
    SiteId   int64  `json:"siteId,omitempty"`
    PluginId int64  `json:"pluginId,omitempty"`
}
func (l *Logger) InfoCtx(msg string, fields LogFields) { ... }
```

---

## Database layer (`database/sql`)

The `database/sql` standard library uses `any` in its API (`Exec(string, ...any)`, `Scan(...any)`). Wrapping these calls is acceptable at the **framework boundary** (`dbops` package). But:

- `ContextFields = map[string]any` type alias is **PROHIBITED** — use a typed struct
- Wrapper functions SHOULD use generics where possible

```go
// ❌ PROHIBITED
type ContextFields = map[string]any

// ✅ REQUIRED
type OperationLogFields struct {
    Table        string `json:"table"`
    Operation    string `json:"operation"`
    AffectedRows int64  `json:"affectedRows,omitempty"`
    Error        string `json:"error,omitempty"`
    Caller       string `json:"caller,omitempty"`
    StackTrace   string `json:"stackTrace,omitempty"`
}
```

---

## JSON deserialization (parse boundary exception)

`map[string]any` is acceptable ONLY at JSON parse boundaries where the shape is truly unknown (e.g., incoming WebSocket messages from external clients), and MUST be immediately narrowed:

```go
// ✅ ACCEPTABLE — parse boundary, immediately narrowed
var raw map[string]any
json.Unmarshal(data, &raw)
// Immediately convert to typed struct
typed := parseIncomingCommand(raw)  // returns concrete type

// ❌ PROHIBITED — storing/passing parsed map[string]any beyond the parse site
func handleCommand(data map[string]any) { ... }  // Should be typed
```

---

## Go-Specific Notes

- `any` (Go 1.18+) is syntactic sugar for `interface{}` — **equally prohibited** in struct fields and function params
- Constraint interfaces are the idiomatic replacement for `any` in generic type params
- `T` in framework/utility function **definitions** is acceptable; `any` in params is never acceptable
- Go has no `unknown` — the closest equivalent is `interface{}`, which is always prohibited
- Go generics cannot be used on **methods** (only functions and types) — use concrete types for method receivers
- When a Go method cannot use generics, extract the operation into a **generic function** that calls the method

---

## Severity Hierarchy

```
WORST:  any / interface{}                        → Zero type info, zero safety
BAD:    map[string]any                           → Container with no domain meaning
BAD:    type X = map[string]any                  → Alias of type erasure is still erasure
OK:     func F[T any](x T) T                    → Framework definition, T is open
BETTER: func F[T Constraint](x T) T             → Constrained generic
BEST:   type SpecificName = Generic[DomainType]  → Fully resolved, self-documenting
```
