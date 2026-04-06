# 02 — Function Standards

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

## Purpose

Functions are the primary unit of code organization. Every function must be **small**, **focused**, and **easy to read**. These rules ensure functions remain testable, debuggable, and self-documenting.

---

## 1. Size Limits (Rule F1)

### 1.1 — Target: 15 Lines

Functions should be approximately **15 lines** of logic (excluding blank lines and closing braces). The hard maximum is **20 lines**.

```typescript
// ✅ GOOD — focused, ~12 lines
function buildInjectionPayload(script: StoredScript, config: StoredConfig): InjectionPayload {
    const wrappedCode = wrapInIsolation(script.code);
    const configData = serializeConfig(config);

    const payload: InjectionPayload = {
        scriptId: script.id,
        code: wrappedCode,
        config: configData,
        timestamp: Date.now(),
    };

    return payload;
}
```

### 1.2 — When to Extract

If a function approaches 20 lines, extract logical sub-sections into helper functions with descriptive names.

```typescript
// ❌ FORBIDDEN — 30+ lines doing multiple things
function processProject(project: Project): void {
    // ... validation logic (8 lines)
    // ... URL matching logic (10 lines)
    // ... script injection logic (12 lines)
}

// ✅ REQUIRED — extracted into focused functions
function processProject(project: Project): void {
    const isProjectValid = validateProject(project);

    if (isProjectValid) {
        const matchedUrls = findMatchingUrls(project);
        injectScriptsForUrls(project, matchedUrls);
    }
}
```

---

## 2. Parameter Limits (Rule F2)

### 2.1 — Maximum 3 Parameters

Functions **MUST NOT** have more than **3 parameters**. When more data is needed, use an **options object**.

```typescript
// ✅ GOOD — 2 parameters
function injectScript(
    tabId: number,
    script: StoredScript,
): Promise<void> { ... }

// ✅ GOOD — 3 parameters
function matchUrl(
    pattern: string,
    url: string,
    matchType: MatchType,
): boolean { ... }

// ❌ FORBIDDEN — 4+ parameters
function createProject(
    name: string,
    url: string,
    scripts: string[],
    configs: string[],
    isActive: boolean,
): Project { ... }

// ✅ REQUIRED — use options object
interface CreateProjectOptions {
    name: string;
    url: string;
    scripts: string[];
    configs: string[];
    isActive: boolean;
}

function createProject(options: CreateProjectOptions): Project { ... }
```

### 2.2 — Options Object Rules

- Define a **named interface** for the options object (not inline `{ ... }`)
- Each property must have a **descriptive name**
- Optional properties use `?` suffix
- Provide defaults using destructuring

```typescript
interface InjectOptions {
    tabId: number;
    scriptId: string;
    configId?: string;
    runAt?: chrome.scripting.RunAt;
    isolate?: boolean;
}

function injectWithOptions({
    tabId,
    scriptId,
    configId,
    runAt = "document_idle",
    isolate = true,
}: InjectOptions): Promise<void> { ... }
```

---

## 3. Single Responsibility (Rule F3)

Each function **MUST** do **one thing**. If you can describe a function with "and" (e.g., "validates input **and** saves to storage"), split it.

```typescript
// ❌ FORBIDDEN — does two things
function validateAndSave(project: Project): void {
    // validation logic...
    // storage logic...
}

// ✅ REQUIRED — separated concerns
function validateProject(project: Project): ValidationResult { ... }
function saveProject(project: Project): Promise<void> { ... }
```

---

## 4. Return Early (Rule F4)

Use early returns to handle edge cases at the top. This keeps the main logic at the base indentation level.

```typescript
// ✅ GOOD — early returns for edge cases
function getProjectById(projectId: string): Project | null {
    const isIdEmpty = projectId.length === 0;

    if (isIdEmpty) {
        return null;
    }

    const project = projectStore.get(projectId);
    const isProjectMissing = project === undefined;

    if (isProjectMissing) {
        return null;
    }

    return project;
}
```

---

## 5. Function Definition Formatting (Rule F5)

When a function has **more than 2 parameters**, each parameter **MUST** be on its own line.

```typescript
// ✅ GOOD — 2 parameters, single line OK
function matchUrl(pattern: string, url: string): boolean { ... }

// ✅ REQUIRED — 3+ parameters, one per line
function registerScript(
    scriptId: string,
    projectId: string,
    executionOrder: number,
): Promise<void> { ... }
```

---

## 6. Function Call Formatting (Rule F6)

When calling a function with **more than 2 arguments**, each argument **MUST** be on its own line.

```typescript
// ✅ GOOD — 2 arguments, single line OK
const isMatch = matchUrl(pattern, currentUrl);

// ✅ REQUIRED — 3+ arguments, one per line
const result = registerScript(
    script.id,
    activeProject.id,
    nextOrderIndex,
);
```

---

## 7. DRY — Don't Repeat Yourself (Rule F7)

If the same logic appears in **2 or more places**, extract it into a shared function.

```typescript
// ❌ FORBIDDEN — duplicated timestamp formatting
function logInjection(scriptId: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`[${timestamp}] Injected: ${scriptId}`);
}

function logError(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.error(`[${timestamp}] Error: ${message}`);
}

// ✅ REQUIRED — extracted shared logic
function formatTimestamp(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function logInjection(scriptId: string): void {
    console.log(`[${formatTimestamp()}] Injected: ${scriptId}`);
}

function logError(message: string): void {
    console.error(`[${formatTimestamp()}] Error: ${message}`);
}
```

---

## 8. Async/Await Rules (Rule F8)

### 8.1 — Always Use `async`/`await` Over `.then()` Chains

Promise chains obscure control flow. All asynchronous code **MUST** use `async`/`await`.

```typescript
// ❌ FORBIDDEN — .then() chain
function loadProjects(): Promise<Project[]> {
    return chrome.storage.local.get("marco_projects")
        .then(result => result.marco_projects || [])
        .then(projects => projects.filter(isProjectEnabled));
}

// ✅ REQUIRED — async/await
async function loadProjects(): Promise<Project[]> {
    const result = await chrome.storage.local.get("marco_projects");
    const storedProjects = result.marco_projects ?? [];
    const activeProjects = storedProjects.filter(isProjectEnabled);

    return activeProjects;
}
```

### 8.2 — No Fire-and-Forget Promises (Rule F9)

Every `async` call **MUST** be `await`ed, assigned, or explicitly handled with `void`. Unhandled promises silently swallow errors.

```typescript
// ❌ FORBIDDEN — fire-and-forget
saveProject(project);
chrome.storage.local.set({ key: value });

// ✅ REQUIRED — awaited
await saveProject(project);
await chrome.storage.local.set({ key: value });

// ✅ PERMITTED — explicit void when intentionally fire-and-forget
void logAnalyticsEvent("project_saved");
```

### 8.3 — Async Error Boundaries (Rule F10)

Every top-level `async` function (event handlers, listeners, entry points) **MUST** have a `try`/`catch` at the outermost level. Internal helper functions may propagate errors upward.

```typescript
// ✅ REQUIRED — top-level async has error boundary
async function handleTabNavigation(tabId: number): Promise<void> {
    try {
        const matchedRules = await findMatchingRules(tabId);
        await injectMatchedScripts(matchedRules);
    } catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : String(error);

        await logError("INJECTION", errorMessage);
    }
}

// ✅ OK — internal helper propagates
async function findMatchingRules(tabId: number): Promise<UrlRule[]> {
    const tab = await chrome.tabs.get(tabId);
    return matchUrlAgainstRules(tab.url);
}
```

---

## 9. Error Handling Patterns (Rule F11)

### 9.1 — Named Error Variables

Caught errors **MUST** be assigned to a descriptively named variable, never left as bare `e` or `err`.

```typescript
// ❌ FORBIDDEN
try { ... } catch (e) { console.error(e); }
try { ... } catch (err) { throw err; }

// ✅ REQUIRED
try {
    await injectScript(tabId, script);
} catch (injectionError) {
    const errorMessage = injectionError instanceof Error
        ? injectionError.message
        : String(injectionError);

    await logError("INJECTION_FAILED", errorMessage);
}
```

### 9.2 — Never Swallow Errors Silently (Rule F12)

Empty `catch` blocks are **FORBIDDEN**. Every caught error must be logged, re-thrown, or handled with a comment explaining why it's safe to ignore.

```typescript
// ❌ FORBIDDEN — silent swallow
try { await loadConfig(); } catch {}

// ✅ REQUIRED — log or handle
try {
    await loadConfig();
} catch (configLoadError) {
    await logWarn("CONFIG", "Failed to load config, using defaults");
}
```

### 9.3 — Result Types Over Exceptions for Expected Failures (Rule F13)

For operations that **commonly fail** (validation, parsing, matching), return a result type instead of throwing.

```typescript
// ✅ PREFERRED — result type for expected failures
interface ParseResult {
    isValid: boolean;
    data?: MarcoProjectConfig;
    errorMessage?: string;
}

function parseProjectConfig(jsonString: string): ParseResult {
    try {
        const data = JSON.parse(jsonString) as MarcoProjectConfig;
        return {
            isValid: true,
            data,
        };
    } catch (parseError) {
        const errorMessage = parseError instanceof Error
            ? parseError.message
            : "Unknown parse error";

        return {
            isValid: false,
            errorMessage,
        };
    }
}
```

---

## 10. JSDoc Requirements (Rule F14)

### 10.1 — Exported Functions Must Have JSDoc

Every `export function` **MUST** have a JSDoc block with at minimum a description line.

```typescript
// ❌ FORBIDDEN — no JSDoc on export
export function matchUrl(pattern: string, url: string): boolean { ... }

// ✅ REQUIRED
/** Checks if a URL matches the given pattern using the project's match mode. */
export function matchUrl(pattern: string, url: string): boolean { ... }
```

### 10.2 — `@param` and `@returns` for Complex Functions (Rule F15)

Functions with **3+ parameters** (options object) or non-obvious return types **MUST** include `@param` and `@returns`.

```typescript
/**
 * Injects a user script into the specified tab with error isolation.
 *
 * @param options - Injection configuration including tab, script, and timing
 * @returns Resolves when injection completes or rejects on Chrome API failure
 */
export async function injectWithOptions(
    options: InjectOptions,
): Promise<void> { ... }
```

### 10.3 — No Redundant JSDoc (Rule F16)

Don't restate what TypeScript types already communicate. JSDoc describes **intent** and **behavior**, not type signatures.

```typescript
// ❌ FORBIDDEN — restating the types
/** @param name string - The name */
export function createProject(name: string): Project { ... }

// ✅ REQUIRED — adds behavioral context
/** Creates a new project with default URL rules and activates it. */
export function createProject(name: string): Project { ... }
```

---

## Prohibited Patterns

| Pattern | Why | Fix |
|---------|-----|-----|
| Functions > 20 lines | Hard to test and debug | Extract sub-functions |
| 4+ parameters | Cognitive overload | Use options object with named interface |
| Functions doing 2+ things | Violates SRP | Split into separate functions |
| Duplicated logic blocks | Maintenance burden | Extract shared function |
| Deep nesting (3+ levels) | Hard to follow | Use early returns or extract |
| Anonymous inline functions > 5 lines | Unreadable | Extract to named function |
| `.then()` chains | Obscures control flow | Use `async`/`await` |
| Fire-and-forget promises | Silent error loss | `await` or explicit `void` |
| Empty `catch {}` blocks | Swallowed errors | Log, re-throw, or comment |
| Bare `e`/`err` in catch | Undescriptive | Use `injectionError`, `parseError`, etc. |
| Exported functions without JSDoc | Undocumented API | Add JSDoc description |

---

## ESLint Enforcement

| Rule | ESLint Rule / Plugin | Enforces |
|------|---------------------|----------|
| F1 | `max-lines-per-function: [warn, { max: 20, skipBlankLines: true, skipComments: true }]` | Function size limit |
| F2 | `max-params: [error, { max: 3 }]` | Parameter count limit |
| F7 | `no-dupe-else-if`, code review | DRY compliance |
| F8 | `@typescript-eslint/no-floating-promises: error` | No fire-and-forget promises |
| F8 | `@typescript-eslint/await-thenable: error` | Correct await usage |
| F9 | `@typescript-eslint/no-misused-promises: error` | Promises handled correctly |
| F10 | `no-empty: [error, { allowEmptyCatch: false }]` | No silent catch blocks |
| F11 | `@typescript-eslint/no-unsafe-assignment: warn` | Typed catch variables |
| F14 | `jsdoc/require-jsdoc: [warn, { require: { FunctionExpression: false }, publicOnly: true }]` | JSDoc on exports |
| F15 | `jsdoc/require-param: warn` | @param for complex functions |
| F16 | `jsdoc/no-types: error` | No type restating in JSDoc |
| — | `@typescript-eslint/explicit-function-return-type: [warn, { allowExpressions: true }]` | Explicit return types |
| — | `@typescript-eslint/promise-function-async: error` | Functions returning Promise must be async |

**Plugins required**: `@typescript-eslint/eslint-plugin` (with type-checked config), `eslint-plugin-jsdoc`

---

## Cross-References

- [Naming Conventions](01-naming-conventions.md) — Verb-led function names
- [Formatting Rules](04-formatting-rules.md) — Line-per-argument details
- [File Organization](05-file-organization.md) — 200-line file limits
- [Error Recovery (Spec 09)](../../07-chrome-extension/09-error-recovery.md) — Health state machine and recovery flows

*Function standards v1.2.0 — 2026-02-28*
