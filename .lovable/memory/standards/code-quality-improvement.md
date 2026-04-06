# Memory: standards/code-quality-improvement
Updated: now

**Process Name**: Code Quality Improvement  
**Spec file**: `spec/08-coding-guidelines/01-code-quality-improvement.md`

## Rules (apply to ALL languages)

1. **CQ1 — PascalCase for exported object constants** (scalars remain UPPER_SNAKE_CASE)
2. **CQ2 — No inline type definitions** — extract into named type/interface, reuse everywhere
3. **CQ3 — No magic strings** — use `enum` for grouped values, named `const` for standalone values
4. **CQ4 — Function size** — target ≤8 lines, hard max 25 lines; decompose via well-named helpers; never compress lines
5. **CQ5 — Simple conditions** — no complex `&&`/`||` in `if`; extract to named booleans or boolean-returning functions
6. **CQ6 — No negation in conditions** — create positive counterpart variable instead of `!`
7. **CQ7 — Boolean naming** — all booleans must use `is` or `has` prefix (variables, constants, functions)
8. **CQ8 — Meaningful variable names** — no single-letter or abbreviated names (except loop indices)
9. **CQ9 — Self-documenting code** — refactor commented blocks into well-named functions
10. **CQ10 — Conversion documentation** — include before/after examples when refactoring, link to spec via `@see`
11. **CQ11 — No mutable module-level state** — `let` at module/file scope is a **serious violation**; all mutable state must live inside a class or be passed through function parameters using immutable data flow (pass in → return out). Module-level `const` for scalars/frozen objects only.
12. **CQ12 — Immutable data flow** — never mutate arrays/maps via `.push()`, `.splice()`, `.pop()` on shared/global references; instead, pass data into functions and return new copies. If mutation is necessary, encapsulate in a class with controlled access.
13. **CQ13 — for-of over C-style for loops** — always use `for (const item of array)` instead of `for (let i = 0; i < arr.length; i++)`. Exception: performance-critical hot paths with proven benchmarks.
14. **CQ14 — Curly braces on all if/else** — every `if`, `else if`, `else` must use `{ }` even for single statements. Newline between consecutive `if` blocks.
15. **CQ15 — Newline before return** — every `return` statement must be preceded by a blank line (unless it's the only statement in the block).
16. **CQ16 — No nested function definitions** — define helper functions at module scope or as class methods, never inside another function body. Exception: simple arrow callbacks passed inline to `.map()`, `.filter()`, etc.
17. **CQ17 — Class encapsulation for stateful modules** — when a module needs mutable state (flags, arrays, maps, timers), wrap it in a class with private fields and public methods. No free-floating `let` variables with setter functions.
18. **CQ18 — Retry/timeout as SDK utilities** — never implement retry logic, setTimeout-based polling, or concurrency locks inline in business code. Use a shared `retry()` / `withTimeout()` utility from the SDK or a common utilities module.

## Severity

- CQ11 (mutable module-level state) and CQ12 (global mutation) are **critical/blocking** — equivalent to a security violation. Code with these patterns must not be merged.
- CQ13–CQ18 are **high priority** — fix on sight during any file touch.

## Enforcement
- Every code change must be checked against CQ1–CQ18
- Conversions must include before/after in JSDoc `@see` pointing to spec file
- Magic strings flagged → replaced with enum or const immediately
- Mutable `let` at module scope flagged → refactored to class or immutable flow immediately
- C-style `for` loops flagged → converted to `for-of` immediately
