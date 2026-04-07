import { describe, it, expect } from 'vitest';

/**
 * Regression tests for prompt normalization.
 *
 * These functions mirror the production implementations in
 * standalone-scripts/macro-controller/src/ui/prompt-utils.ts.
 * If the production code changes, these tests MUST still pass
 * against the same contract — slug/id/isDefault must never be stripped.
 */

interface PromptEntry {
  name: string;
  text: string;
  id?: string;
  slug?: string;
  category?: string;
  isFavorite?: boolean;
  isDefault?: boolean;
}

function normalizePromptEntries(entries: Partial<PromptEntry & { order?: number }>[]): PromptEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: PromptEntry[] = [];
  for (const p of entries) {
    const raw = p || {};
    const name = typeof raw.name === 'string' ? raw.name : '';
    const text = typeof raw.text === 'string' ? raw.text : '';
    if (name && text) {
      const entry: PromptEntry = { name, text };
      if (raw.id) { entry.id = raw.id; }
      if (raw.slug) { entry.slug = raw.slug; }
      if (raw.category) { entry.category = raw.category; }
      if (raw.isFavorite) { entry.isFavorite = true; }
      if (raw.isDefault !== undefined) { entry.isDefault = raw.isDefault; }
      out.push(entry);
    }
  }
  return out;
}

function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mirrors findNextTasksPrompt from task-next-ui.ts.
 * Must NEVER fall back to entries[0] — that caused the regression.
 */
function findNextTasksPrompt(entries: PromptEntry[], targetSlug = 'next-tasks'): PromptEntry | null {
  // Priority 1: Exact slug match
  for (const entry of entries) {
    if ((entry.slug || '').toLowerCase() === targetSlug) return entry;
  }
  // Priority 2: id match
  for (const entry of entries) {
    const id = (entry.id || '').toLowerCase();
    if (id === targetSlug || id === 'default-' + targetSlug || id.indexOf(targetSlug) !== -1) return entry;
  }
  // Priority 3: Derived slug from name
  for (const entry of entries) {
    const derived = (entry.name || '').toLowerCase().replace(/\s+/g, '-');
    if (derived === targetSlug) return entry;
  }
  // Priority 4: Name contains both 'next' and 'task'
  for (const entry of entries) {
    const name = (entry.name || '').toLowerCase();
    if (name.indexOf('next') !== -1 && name.indexOf('task') !== -1) return entry;
  }
  // NO FALLBACK to entries[0] — return null
  return null;
}

// ─── Regression: slug/id/isDefault must survive normalization ───

describe('normalizePromptEntries — field preservation', () => {
  it('preserves slug field', () => {
    const result = normalizePromptEntries([{ name: 'Next Tasks', text: 'Do next', slug: 'next-tasks' }]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('next-tasks');
  });

  it('preserves id field', () => {
    const result = normalizePromptEntries([{ name: 'Next Tasks', text: 'Do next', id: 'default-next-tasks' }]);
    expect(result[0].id).toBe('default-next-tasks');
  });

  it('preserves isDefault field', () => {
    const result = normalizePromptEntries([{ name: 'Start', text: 'Go', isDefault: true }]);
    expect(result[0].isDefault).toBe(true);
  });

  it('preserves category and isFavorite', () => {
    const result = normalizePromptEntries([{ name: 'Test', text: 'Hello', category: 'automation', isFavorite: true }]);
    expect(result[0].category).toBe('automation');
    expect(result[0].isFavorite).toBe(true);
  });

  it('preserves all fields in a full entry', () => {
    const result = normalizePromptEntries([{
      name: 'Next Tasks', text: 'List remaining tasks',
      id: 'default-next-tasks', slug: 'next-tasks',
      category: 'automation', isFavorite: true, isDefault: true,
    }]);
    expect(result[0]).toEqual({
      name: 'Next Tasks', text: 'List remaining tasks',
      id: 'default-next-tasks', slug: 'next-tasks',
      category: 'automation', isFavorite: true, isDefault: true,
    });
  });

  it('filters entries without name or text', () => {
    const result = normalizePromptEntries([
      { name: '', text: 'no name' },
      { name: 'no text', text: '' },
      { name: 'Valid', text: 'OK' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });

  it('handles non-array input gracefully', () => {
    expect(normalizePromptEntries(null as unknown as [])).toEqual([]);
    expect(normalizePromptEntries(undefined as unknown as [])).toEqual([]);
  });
});

// ─── Regression: newline normalization ───

describe('normalizeNewlines', () => {
  it('collapses 3+ newlines to 2', () => {
    expect(normalizeNewlines('a\n\n\nb')).toBe('a\n\nb');
    expect(normalizeNewlines('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('preserves double newlines (paragraph spacing)', () => {
    expect(normalizeNewlines('a\n\nb')).toBe('a\n\nb');
  });

  it('preserves single newlines', () => {
    expect(normalizeNewlines('a\nb')).toBe('a\nb');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeNewlines('\n\n\nHello\n\n\n')).toBe('Hello');
  });

  it('normalizes Windows \\r\\n line endings', () => {
    expect(normalizeNewlines('a\r\n\r\n\r\nb')).toBe('a\n\nb');
  });

  it('collapses blank-ish lines with whitespace between newlines', () => {
    expect(normalizeNewlines('a\n \n \nb')).toBe('a\n\nb');
    expect(normalizeNewlines('a\n\t\n\nb')).toBe('a\n\nb');
  });

  it('handles large prompts with multiple excessive gaps', () => {
    const input = 'Step 1\n\n\n\nStep 2\n\n\n\n\nStep 3\n\nStep 4';
    expect(normalizeNewlines(input)).toBe('Step 1\n\nStep 2\n\nStep 3\n\nStep 4');
  });
});

// ─── Regression: findNextTasksPrompt must NEVER return Start Prompt ───

describe('findNextTasksPrompt — next task selection', () => {
  const fullEntries: PromptEntry[] = [
    { name: 'Start Prompt', text: 'Write a readme...', slug: 'start-prompt', id: 'default-start' },
    { name: 'Start Prompt v2', text: 'Write a readme v2...', slug: 'start-prompt-v2', id: 'default-start-v2' },
    { name: 'Next Tasks', text: 'List remaining tasks', slug: 'next-tasks', id: 'default-next-tasks', category: 'automation' },
  ];

  it('finds Next Tasks by slug (priority 1)', () => {
    const result = findNextTasksPrompt(fullEntries);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Next Tasks');
  });

  it('finds Next Tasks by id when slug is missing (priority 2)', () => {
    const entries = fullEntries.map(e => ({ ...e, slug: undefined }));
    const result = findNextTasksPrompt(entries);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Next Tasks');
  });

  it('finds Next Tasks by derived name slug (priority 3)', () => {
    const entries = fullEntries.map(e => ({ ...e, slug: undefined, id: undefined }));
    const result = findNextTasksPrompt(entries);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Next Tasks');
  });

  it('finds by name keywords (priority 4)', () => {
    const entries = [
      { name: 'Start Prompt', text: 'Write...' },
      { name: 'My Next Awesome Task List', text: 'Do things' },
    ];
    const result = findNextTasksPrompt(entries);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('My Next Awesome Task List');
  });

  it('NEVER falls back to entries[0] — returns null instead', () => {
    const entries = [
      { name: 'Start Prompt', text: 'Write a readme...' },
      { name: 'Rejog Memory', text: 'Read context...' },
    ];
    const result = findNextTasksPrompt(entries);
    expect(result).toBeNull();
  });

  it('returns null for empty entries', () => {
    expect(findNextTasksPrompt([])).toBeNull();
  });
});
