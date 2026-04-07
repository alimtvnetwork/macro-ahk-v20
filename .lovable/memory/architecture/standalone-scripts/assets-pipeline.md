# Memory: architecture/standalone-scripts/assets-pipeline
Updated: 2026-03-22

## Planned Architecture: Per-Script Assets (CSS, LESS, HTML Templates)

Each standalone script folder can optionally contain:
- `less/` — LESS source files compiled to CSS at build time
- `templates/` — HTML template files with `{{variable}}` syntax compiled to a JSON registry
- `dist/` — **sole deployment target** for all build artifacts (JS, CSS, templates)

### Key Design Decisions

1. **Dist-centric**: Chrome extension picks up ALL artifacts from `dist/` only. Root-level legacy files (01-macro-looping.js, 02-*.json, etc.) remain untouched for backward compatibility.
2. **LESS variables map to CSS custom properties** which map to `window.__MARCO_THEME__` tokens — maintaining the existing theme injection pipeline.
3. **CSS injected via `chrome.scripting.insertCSS()`** before JS injection, declared in `script-manifest.json` under `assets.css`.
4. **HTML templates** use Handlebars-like syntax (`{{var}}`, `{{#if}}`, `{{#each}}`, `{{> partial}}`), compiled at build time to a JSON registry consumed by a runtime `renderTemplate()` function.
5. **Dynamic prompts** loaded from Chrome extension SQLite via `GET_PROMPTS` bridge message, with fallback to `window.__MARCO_PROMPTS__` preamble, then hardcoded defaults.

### Hover Effects

All vibrant gradient buttons use **glow intensification** on hover (brightness + expanded box-shadow), NOT scale/zoom. This is a firm design constraint.

### Related Docs

- `spec/12-devtools-and-injection/standalone-script-assets.md` — Full specification
- `.lovable/plan.md` — Task breakdown and roadmap
