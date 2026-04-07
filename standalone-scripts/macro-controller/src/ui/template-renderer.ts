/**
 * renderTemplate() — Runtime Template Renderer
 *
 * Hydrates compiled HTML templates (from templates.json) with data.
 * Supports: {{var}}, {{#if cond}}...{{/if}}, {{#each items}}...{{/each}}
 *
 * Spec: spec/12-devtools-and-injection/standalone-script-assets.md §5
 * Compiler: scripts/compile-templates.mjs
 */

// ── Types ──

export interface CompiledTemplate {
  html: string;
  variables: string[];
}

export interface TemplateRegistry {
  [name: string]: CompiledTemplate;
}

// ── Registry (loaded at boot from templates.json or injected preamble) ──

// CQ11: Singleton for template registry
class TemplateRegistryState {
  private _registry: TemplateRegistry = {};

  get registry(): TemplateRegistry {
    return this._registry;
  }

  merge(incoming: TemplateRegistry): void {
    this._registry = { ...this._registry, ...incoming };
  }

  reset(): void {
    this._registry = {};
  }
}

const templateState = new TemplateRegistryState();

/**
 * Load a compiled template registry (typically from dist/templates.json).
 * Can be called multiple times — later calls merge into existing registry.
 */
export function loadTemplateRegistry(registry: TemplateRegistry): void {
  templateState.merge(registry);
}

/**
 * Get a list of all registered template names.
 */
export function getTemplateNames(): string[] {
  return Object.keys(templateState.registry);
}

/**
 * Check if a template is registered.
 */
export function hasTemplate(name: string): boolean {
  return name in templateState.registry;
}

// ── Rendering Engine ──

/**
 * Render a named template with the given data context.
 *
 * @param name - Template name (matches key in templates.json, e.g. "about-modal")
 * @param data - Key-value pairs to substitute into {{variables}}
 * @returns Rendered HTML string
 * @throws Error if template not found
 */
export function renderTemplate(name: string, data: Record<string, unknown> = {}): string {
  const entry = templateState.registry[name];
  if (!entry) {
    throw new Error(`[renderTemplate] Template "${name}" not found. Available: ${Object.keys(templateState.registry).join(', ')}`);
  }
  return hydrate(entry.html, data);
}

/**
 * Render a raw HTML string (not from registry) with data.
 * Useful for inline templates or testing.
 */
export function renderRawTemplate(html: string, data: Record<string, unknown> = {}): string {
  return hydrate(html, data);
}

// ── Hydration Logic ──

function hydrate(html: string, data: Record<string, unknown>): string {
  let result = html;

  // 1. Process {{#each items}}...{{/each}} blocks
  result = processEachBlocks(result, data);

  // 2. Process {{#if condition}}...{{else}}...{{/if}} blocks
  result = processIfBlocks(result, data);

  // 3. Replace {{variable}} placeholders
  result = replaceVariables(result, data);

  return result;
}

/** Process {{#each items}}...{{/each}} — supports nested {{this.prop}} and {{@index}} */
function processEachBlocks(html: string, data: Record<string, unknown>): string {
  const eachPattern = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return html.replace(eachPattern, (_, key, body) => {
    const items = data[key];
    if (!Array.isArray(items) || items.length === 0) return '';

    return items.map((item, index) => {
      let rendered = body;

      // Replace {{@index}}
      rendered = rendered.replace(/\{\{@index\}\}/g, String(index));

      if (typeof item === 'object' && item !== null) {
        // Replace {{this.prop}} for object items
        rendered = rendered.replace(/\{\{this\.(\w+)\}\}/g, (_: string, prop: string) => {
          return String((item as Record<string, unknown>)[prop] ?? '');
        });
        // Also replace {{prop}} directly within each context
        rendered = rendered.replace(/\{\{(?!#|\/|>|@|this\.)(\w+)\}\}/g, (_: string, prop: string) => {
          return prop in (item as Record<string, unknown>)
            ? String((item as Record<string, unknown>)[prop] ?? '')
            : `{{${prop}}}`;  // Leave unresolved for outer context
        });
      } else {
        // Replace {{this}} for primitive items
        rendered = rendered.replace(/\{\{this\}\}/g, String(item));
      }

      return rendered;
    }).join('');
  });
}

/** Process {{#if cond}}...{{else}}...{{/if}} blocks (non-nested) */
function processIfBlocks(html: string, data: Record<string, unknown>): string {
  const ifElsePattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let result = html.replace(ifElsePattern, (_, key, truthy, falsy) => {
    return isTruthy(data[key]) ? truthy : falsy;
  });

  const ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifPattern, (_, key, body) => {
    return isTruthy(data[key]) ? body : '';
  });

  return result;
}

/** Replace simple {{variable}} placeholders */
function replaceVariables(html: string, data: Record<string, unknown>): string {
  return html.replace(/\{\{(?!#|\/|>|@)(\w+)\}\}/g, (match, key) => {
    return key in data ? String(data[key] ?? '') : match;
  });
}

/** Truthiness check matching Handlebars conventions */
function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0 || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}
