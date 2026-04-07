# Generic Enforce — TypeScript

> This file covers **TypeScript-specific syntax and idioms only**.  
> For rules, rationale, and the canonical example, see [`readme.md`](./readme.md).

---

## Alias Mechanism

```typescript
type AliasName = GenericType<ConcreteA, ConcreteB>;
```

Zero runtime cost — erased at compile time.

---

## Student-Teacher in TypeScript

```typescript
interface Student<TRights, TKey extends string | number> {
  id: TKey;
  rights: TRights;
  name: string;
  enrolledAt: string;
}

// Named instantiations
type TeacherBasicRights = Student<BasicRights, number>;
type TeacherBasicRightsV2 = Student<BasicRightsV2, number>;
type StudentByUUID = Student<BasicRights, string>;

function getTeacher(id: number): TeacherBasicRights { ... }
```

---

## Replacing `Record<string, unknown>`

```typescript
// ❌ Prohibited
interface ApiError {
  context?: Record<string, unknown>;
}

// ✅ Required — define what context actually is
interface ErrorContext {
  endpoint?: string;
  statusCode?: number;
  requestId?: string;
  pluginId?: number;
  sessionId?: string;
}

interface ApiError {
  context?: ErrorContext;
}
```

---

## Catch Blocks

```typescript
// ❌ Prohibited
catch (err: any) { console.error(err.message); }

// ✅ Required
catch (err) {
  if (err instanceof Error) {
    console.error(err.message);
  }
  throw err;
}
```

---

## Framework vs Business Logic

```typescript
// ✅ FRAMEWORK — T stays open (defining a reusable tool)
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> { ... }
class ResponseCache<T> { get(key: string): T | null { ... } }
interface ApiResponse<T> { data: T; status: number; }

// ✅ BUSINESS — T resolved, alias REQUIRED
type PluginResponse = ApiResponse<Plugin>;
type SiteSettingsCache = ResponseCache<SiteSettings>;

function getPlugin(id: number): PluginResponse { ... }

// ❌ BAD — business code with raw generic
function getPlugin(id: number): ApiResponse<Plugin> { ... }  // alias it!

// ✅ OK — retry is plumbing, T is pass-through
const plugin = await retry<Plugin>(() => fetchPlugin(id));
```

---

## Placement Rules

1. **Co-locate** aliases with their base generic (same `types.ts` file)
2. **Export** all aliases — they are part of the public API
3. **JSDoc** each alias with a one-line description

```typescript
/** API response containing a single Plugin entity. */
export type PluginResponse = ApiResponse<Plugin>;
```

---

## TS-Specific Notes

- `type` aliases are the primary mechanism — no inheritance needed
- `interface extends` works for adding fields but NOT for generic instantiation aliases
- `as const` assertions complement GE by eliminating magic strings/numbers
- Template literal types can generate alias families: `type ${Name}Response = ApiResponse<${Name}>`
