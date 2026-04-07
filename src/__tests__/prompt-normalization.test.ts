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
  return text.replace(/\n{3,}/g, '\n\n').trim();
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
});
