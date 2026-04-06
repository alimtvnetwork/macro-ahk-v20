# TypeScript Coding Standards

> **Version:** 3.0.0  
> **Updated:** 2026-02-13  
> **Applies to:** All frontend TypeScript/React code  
> **Priority:** CRITICAL — These rules override all other conventions

---

## 1. Generics First — The Cardinal Rule

**Generics are the ONLY acceptable approach for parameterized types.** Never use `any`, `unknown`, `Record<string, unknown>`, or loose interfaces where a generic can express the constraint.

### Rule 1.1: All reusable functions MUST be generic

```typescript
// ❌ FORBIDDEN — loose typing
function fetchData(endpoint: string): Promise<unknown> { ... }
function parseResponse(data: unknown): Record<string, unknown> { ... }

// ✅ REQUIRED — generic with constraints
function fetchData<T>(endpoint: string): Promise<T> { ... }
function parseResponse<T extends object>(data: string): T { ... }
```

### Rule 1.2: API response types MUST use generic envelope

```typescript
// ❌ FORBIDDEN
interface RawEnvelope {
  Results: unknown[];
}

// ✅ REQUIRED
interface RawEnvelope<T = never> {
  Status: EnvelopeStatus;
  Attributes: EnvelopeAttributes;
  Results: T[];
  Navigation?: EnvelopeNavigation;
  Errors?: EnvelopeErrors;
}
```

### Rule 1.3: Collection utilities MUST be generic

```typescript
// ❌ FORBIDDEN
function buildQuery(params: Record<string, string | number | undefined>): string { ... }

// ✅ REQUIRED
function buildQuery<T extends Record<string, string | number | undefined | null>>(params: T): string { ... }
```

### Rule 1.4: Hook factories MUST propagate generics

```typescript
// ❌ FORBIDDEN
function useApiQuery(key: string): { data: unknown } { ... }

// ✅ REQUIRED
function useApiQuery<T>(key: string[]): { data: T | undefined; isLoading: boolean } { ... }
```

---

## 2. Zero Tolerance for `any` and Untyped Patterns

### Rule 2.1: `any` is PROHIBITED everywhere

No exceptions. Not in catch blocks, not in type assertions, not in generic defaults.

```typescript
// ❌ FORBIDDEN — all of these
catch (err: any) { ... }
const x = value as any;
getQueryData<any>(key);
(result as any)?.deleted;
v as any;

// ✅ REQUIRED
catch (err) {
  const message = err instanceof Error ? err.message : String(err);
}
const x = value as SpecificType;
getQueryData<DashboardStats>(key);
```

### Rule 2.2: `unknown` is acceptable ONLY at parse boundaries

`unknown` may appear in:
- JSON parsing entry points (immediately narrowed via type guard)
- Error catch blocks (without `: any` annotation — bare `catch (err)`)
- Internal type narrowing functions (e.g., `isEnvelope(obj: unknown)`)

`unknown` MUST NOT appear in:
- Component props, hook return types, store state
- API method return types (use generics instead)
- Exported function signatures

### Rule 2.3: `Record<string, unknown>` is PROHIBITED in API signatures

```typescript
// ❌ FORBIDDEN
createRemoteSnapshot: (siteId: number, opts?: Record<string, unknown>) => ...
updateSettings: (settings: Record<string, unknown>) => ...

// ✅ REQUIRED — use specific interfaces
interface CreateSnapshotOptions {
  name?: string;
  scope?: SnapshotScope;
  snapshotType?: SnapshotType;
  parentId?: number;
  tables?: string[];
}
createRemoteSnapshot: (siteId: number, opts?: CreateSnapshotOptions) => ...
```

---

## 3. No Magic Strings, No Magic Numbers

### Rule 3.1: All string literals used as identifiers MUST come from constants or enums

```typescript
// ❌ FORBIDDEN — magic strings
if (status === "connected") { ... }
if (action === "self-update") { ... }
toast.success("Cleanup complete");

// ✅ REQUIRED — constants or enums
const enum ConnectionStatus {
  Connected = "connected",
  Disconnected = "disconnected",
  Unknown = "unknown",
}

const enum SnapshotAction {
  Create = "create",
  Restore = "restore",
  Delete = "delete",
  Export = "export",
  Import = "import",
  Cleanup = "cleanup",
}

if (status === ConnectionStatus.Connected) { ... }
if (action === SnapshotAction.Create) { ... }
```

### Rule 3.2: All numeric literals with semantic meaning MUST be named constants

```typescript
// ❌ FORBIDDEN — magic numbers
staleTime: 60_000,
const limit = 25;
setTimeout(fn, 5000);

// ✅ REQUIRED
const STALE_TIME_MS = 60_000 as const;
const DEFAULT_PAGE_SIZE = 25 as const;
const POLLING_INTERVAL_MS = 5_000 as const;

staleTime: STALE_TIME_MS,
const limit = DEFAULT_PAGE_SIZE;
setTimeout(fn, POLLING_INTERVAL_MS);
```

### Rule 3.3: String unions MUST be extracted as named types

```typescript
// ❌ FORBIDDEN — inline string unions
status: "success" | "failed" | "partial";
type: "publish" | "snapshot" | "plugin" | "config" | "connection";

// ✅ REQUIRED — named type aliases or enums
type PublishStatus = "success" | "failed" | "partial";
type ActivityType = "publish" | "snapshot" | "plugin" | "config" | "connection";
```

**Note:** `ActivityType` already exists as a named type — this pattern must be applied everywhere.

---

## 4. Specific Type Rules for Common Patterns

### 4.1: Error handling — structured catch blocks

```typescript
// ✅ The ONLY acceptable catch pattern
try {
  await apiCall();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  // OR for ApiClientError:
  if (isApiClientError(err)) {
    handleApiError(err.apiError);
  } else {
    handleGenericError(message);
  }
}
```

### 4.2: React Query — typed query data

```typescript
// ❌ FORBIDDEN
queryClient.getQueryData<any>(["dashboard-stats"]);
(data as any).entries;

// ✅ REQUIRED
queryClient.getQueryData<DashboardStats>(["dashboard-stats"]);
```

### 4.3: Component prop drilling — avoid `Record<string, unknown>`

```typescript
// ❌ FORBIDDEN
metadata: Record<string, unknown>;

// ✅ REQUIRED — specific metadata types per domain
interface PublishMetadata {
  pluginName: string;
  version: string;
  filesUpdated: number;
  sessionId?: string;
}

interface SnapshotMetadata {
  snapshotType: SnapshotType;
  tables?: number;
  size?: number;
}

type ActivityMetadata = PublishMetadata | SnapshotMetadata | PluginMetadata | ConfigMetadata | ConnectionMetadata;
```

---

## 5. Function Size — Max 15 Lines

> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rule 6

Every function/method body must be **15 lines or fewer**. Extract logic into small, well-named helper functions.

```typescript
// ❌ FORBIDDEN: 20+ line function
const handleSubmit = async (data: FormData) => {
    // validation, API call, state update, toast... all inline
};

// ✅ REQUIRED: Decomposed
const handleSubmit = async (data: FormData) => {
    const validated = validateFormData(data);
    const result = await submitToApi(validated);
    updateLocalState(result);
    showSuccessToast(result.message);
};
```

---

## 6. Zero Nested `if` — Absolute Ban

> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rule 2 & 7

Nested `if` blocks are **absolutely forbidden** — zero tolerance, no exceptions. Flatten with early returns or combined conditions.

```typescript
// ❌ FORBIDDEN: Nested if
if (response) {
    if (response.status >= 400) {
        handleError(response);
    }
}

// ✅ REQUIRED: Early return
if (!response) {
    return;
}

if (response.status >= 400) {
    handleError(response);
}
```

---

## 7. Enforcement

- **TypeScript strict mode:** Must be enabled (`strict: true` in tsconfig)
- **ESLint rules (REQUIRED):**
  - `@typescript-eslint/no-explicit-any`: `error`
  - `@typescript-eslint/no-unsafe-assignment`: `error`
  - `@typescript-eslint/no-unsafe-member-access`: `error`
  - `@typescript-eslint/no-unsafe-call`: `error`
  - `@typescript-eslint/no-unsafe-return`: `error`
- **Code review:** Any PR introducing `any`, bare `unknown` in public APIs, or magic strings/numbers must be rejected
- **Exceptions:** Must include a `// SAFETY:` comment explaining why and a `// TODO:` for removal with ticket reference

---

## 9. Generics Reference — When to Use What

| Scenario | Pattern |
|----------|---------|
| API response parsing | `parseEnvelope<T>(env: RawEnvelope<T>): ApiResponse<T>` |
| Data fetching hooks | `useApiQuery<T>(key: string[]): QueryResult<T>` |
| Form state | `useForm<TFormValues extends FieldValues>()` |
| List rendering | `function DataTable<T extends { id: string }>(props: { data: T[] })` |
| Store slices | `createSlice<TState>(initialState: TState)` |
| Utility functions | `function groupBy<T, K extends keyof T>(items: T[], key: K): Map<T[K], T[]>` |

---

## 8. No Raw Negations — Use Positive Guard Functions

> **Canonical source:** [No Raw Negations](../coding-guidelines/no-negatives.md)

**Never use `!` on a function call in a condition.** Wrap every negative check in a positively named guard function.

```typescript
// ❌ FORBIDDEN
if (!response.ok) { handleError(response); }
if (!array.includes(item)) { array.push(item); }
if (!fs.existsSync(path)) { throw new Error('Missing'); }

// ✅ REQUIRED
if (isResponseFailed(response)) { handleError(response); }
if (isItemMissing(array, item)) { array.push(item); }
if (isFileMissing(path)) { throw new Error('Missing'); }
```

**Utility location:** `src/utils/guards.ts` — see canonical spec for full guard function table.

---

## Cross-References

- [No Raw Negations](../coding-guidelines/no-negatives.md) — Positive guard functions (all languages)
- [Cross-Language Code Style](../coding-guidelines/code-style.md) — Braces, nesting & spacing rules (canonical)
- [Function Naming](../coding-guidelines/function-naming.md) — No boolean flag parameters (all languages)
- [Strict Typing](../coding-guidelines/strict-typing.md) — Type declarations & docblock rules (all languages)
- [DRY Principles](../coding-guidelines/dry-principles.md)
- [Golang Standards](../golang-standards/readme.md)
- [Response Envelope Spec](../../11-imported/error-management/05-response-envelope/envelope.schema.json)

---

*TypeScript standards v3.1.0 — generics-first, zero-any, no-magic-strings, max-15-lines, zero-nesting — 2026-02-14*
