# Memory: standards/code-quality-enforcement
Updated: 2026-04-01

Code quality is enforced via `eslint-plugin-sonarjs`, integrated into both the root and chrome-extension ESLint configurations.

## Configuration

### Root project (`eslint.config.js` — flat config)
- Plugin: `eslint-plugin-sonarjs` recommended rules
- `max-lines-per-function`: 25 lines (warning)
- `sonarjs/cognitive-complexity`: 15 (warning)

### Chrome extension (`chrome-extension/.eslintrc.json` — legacy config)
- Plugin: `eslint-plugin-sonarjs` recommended rules
- `max-lines-per-function`: 25 lines (warning)
- `sonarjs/cognitive-complexity`: 10 (warning — stricter for extension code)

## Disabled Rules (both configs)
The following rules are turned **off** to avoid false positives from the project's dynamic script injection, SDK-export, and cross-project architecture:

| Rule | Reason |
|------|--------|
| `sonarjs/no-unused-collection` | Collections may be populated/read by injected scripts |
| `sonarjs/no-dead-store` | Values stored for external consumers (SDK, AHK) |
| `sonarjs/no-unused-function-argument` | Arguments used by runtime callers or registry pattern |
| `sonarjs/no-unused-vars` | Exports consumed by injected scripts or other projects |

## What It Catches
- Bugs: duplicate conditions, identical catch/finally, empty collections
- Code smells: redundant booleans, duplicate strings, nested ternaries, collapsible if-else
- Security: weak crypto, hardcoded credentials, unsafe regexp
- Complexity: cognitive complexity over threshold, functions over 25 lines

## Related
- Code quality rules: `spec/08-coding-guidelines/01-code-quality-improvement.md`
- Memory: `.lovable/memory/standards/code-quality-improvement.md`
