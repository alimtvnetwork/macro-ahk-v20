import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../logging', () => ({
  log: vi.fn(),
  logSub: vi.fn(),
}));
vi.mock('../auth', () => ({
  resolveToken: vi.fn(() => 'test-token'),
  invalidateSessionBridgeKey: vi.fn(() => 'invalidated-key'),
}));
vi.mock('../toast', () => ({
  showToast: vi.fn(),
}));
vi.mock('../shared-state', () => ({
  CREDIT_API_BASE: 'https://api.test.com',
  CONFIG: {
    CONTROLS_XPATH: '//div[@id="controls"]',
  },
  loopCreditState: { perWorkspace: [] },
  setLoopWsCheckedIds: vi.fn(),
  setLoopWsLastCheckedIdx: vi.fn(),
}));

// Prevent localStorage.getItem from triggering module-level restore
const mockLocalStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

import {
  applyRenameTemplate,
  getRenameDelayMs,
  setRenameDelayMs,
  cancelRename,
  isRenameCancelled,
  getRenameHistory,
  getRenameAvgOpMs,
} from '../workspace-rename';

describe('workspace-rename', () => {
  describe('applyRenameTemplate', () => {
    it('applies $ numbering with index', () => {
      const result = applyRenameTemplate('WS-$', '', '', 1, 0, 'Original');
      expect(result).toBe('WS-1');
    });

    it('pads $ numbering to match placeholder length', () => {
      const result = applyRenameTemplate('WS-$$$', '', '', 1, 0, 'Original');
      expect(result).toBe('WS-001');
    });

    it('applies # numbering', () => {
      const result = applyRenameTemplate('WS-##', '', '', 1, 5, 'Original');
      expect(result).toBe('WS-06');
    });

    it('applies ** numbering', () => {
      const result = applyRenameTemplate('WS-**', '', '', 1, 2, 'Original');
      expect(result).toBe('WS-03');
    });

    it('uses originalName when template is empty', () => {
      const result = applyRenameTemplate('', '', '', 1, 0, 'MyWorkspace');
      expect(result).toBe('MyWorkspace');
    });

    it('applies prefix and suffix', () => {
      const result = applyRenameTemplate('Base', 'Pre-', '-Suf', 1, 0, 'Original');
      expect(result).toBe('Pre-Base-Suf');
    });

    it('applies numbering in prefix/suffix', () => {
      const result = applyRenameTemplate('WS', '$-', '-$', 1, 2, 'Original');
      expect(result).toBe('3-WS-3');
    });

    it('accepts per-placeholder start numbers', () => {
      const starts = { dollar: 10, hash: 20, star: 30 };
      const result = applyRenameTemplate('$-#-**', '', '', starts, 0, 'Original');
      expect(result).toBe('10-20-30');
    });

    it('increments by index', () => {
      const result = applyRenameTemplate('WS-$$', '', '', 1, 9, 'Original');
      expect(result).toBe('WS-10');
    });
  });

  describe('rename delay', () => {
    beforeEach(() => {
      setRenameDelayMs(750); // reset
    });

    it('defaults to 750ms', () => {
      expect(getRenameDelayMs()).toBe(750);
    });

    it('sets delay', () => {
      setRenameDelayMs(1500);
      expect(getRenameDelayMs()).toBe(1500);
    });

    it('clamps to min 100', () => {
      setRenameDelayMs(10);
      expect(getRenameDelayMs()).toBe(100);
    });

    it('clamps to max 10000', () => {
      setRenameDelayMs(99999);
      expect(getRenameDelayMs()).toBe(10000);
    });

    it('handles NaN gracefully', () => {
      setRenameDelayMs(NaN);
      expect(getRenameDelayMs()).toBe(750);
    });
  });

  describe('cancelRename', () => {
    it('sets cancelled flag', () => {
      cancelRename();
      expect(isRenameCancelled()).toBe(true);
    });
  });

  describe('state getters', () => {
    it('getRenameHistory returns array', () => {
      expect(Array.isArray(getRenameHistory())).toBe(true);
    });

    it('getRenameAvgOpMs returns number', () => {
      expect(typeof getRenameAvgOpMs()).toBe('number');
    });
  });
});
