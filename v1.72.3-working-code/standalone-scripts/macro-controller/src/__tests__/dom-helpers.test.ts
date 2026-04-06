import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../shared-state', () => ({
  CONFIG: {
    REQUIRED_DOMAIN: 'lovable.dev',
    PROMPT_ACTIVE_XPATH: '//div[@class="prompt"]',
    MAIN_PROGRESS_XPATH: '//div[@class="progress"]',
    PROJECT_BUTTON_XPATH: '//button[@class="project"]',
  },
  TIMING: {
    DIALOG_WAIT: 2000,
  },
}));

vi.mock('../xpath-utils', () => ({
  getByXPath: vi.fn(() => null),
  getAllByXPath: vi.fn(() => []),
  findElement: vi.fn(() => null),
  reactClick: vi.fn(),
  ML_ELEMENTS: { PROGRESS: 'progress', PROJECT_BUTTON: 'project-btn' },
}));

vi.mock('../logging', () => ({
  log: vi.fn(),
  logSub: vi.fn(),
}));

import { isOnProjectPage, isUserTypingInPrompt, checkSystemBusy, highlightElement } from '../dom-helpers';
import { findElement, getByXPath } from '../xpath-utils';

describe('dom-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isOnProjectPage', () => {
    it('returns true for project URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://lovable.dev/projects/abc123' },
        writable: true,
      });
      expect(isOnProjectPage()).toBe(true);
    });

    it('returns false for settings URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://lovable.dev/projects/abc123/settings' },
        writable: true,
      });
      expect(isOnProjectPage()).toBe(false);
    });

    it('returns false for non-project URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://lovable.dev/dashboard' },
        writable: true,
      });
      expect(isOnProjectPage()).toBe(false);
    });

    it('returns true for lovableproject preview URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://584600b3-0bba-43a0-a09d-ab632bf4b5ac.lovableproject.com/' },
        writable: true,
      });
      expect(isOnProjectPage()).toBe(true);
    });

    it('returns false for different domain', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/projects/abc123' },
        writable: true,
      });
      expect(isOnProjectPage()).toBe(false);
    });
  });

  describe('isUserTypingInPrompt', () => {
    it('returns false when no prompt element found', () => {
      vi.mocked(getByXPath).mockReturnValue(null);
      expect(isUserTypingInPrompt()).toBe(false);
    });

    it('returns false when activeElement is not in prompt', () => {
      const promptEl = document.createElement('div');
      const otherEl = document.createElement('input');
      document.body.appendChild(otherEl);
      vi.mocked(getByXPath).mockReturnValue(promptEl);
      otherEl.focus();
      expect(isUserTypingInPrompt()).toBe(false);
      document.body.removeChild(otherEl);
    });

    it('returns true when activeElement is inside prompt', () => {
      const promptEl = document.createElement('div');
      const input = document.createElement('textarea');
      promptEl.appendChild(input);
      document.body.appendChild(promptEl);
      vi.mocked(getByXPath).mockReturnValue(promptEl);
      input.focus();
      expect(isUserTypingInPrompt()).toBe(true);
      document.body.removeChild(promptEl);
    });
  });

  describe('checkSystemBusy', () => {
    it('returns false when progress element not found', () => {
      vi.mocked(findElement).mockReturnValue(null);
      expect(checkSystemBusy()).toBe(false);
    });

    it('returns false when progress element is hidden', () => {
      const el = document.createElement('div');
      el.style.display = 'none';
      document.body.appendChild(el);
      vi.mocked(findElement).mockReturnValue(el);
      // getBoundingClientRect returns 0x0 in jsdom
      expect(checkSystemBusy()).toBe(false);
      document.body.removeChild(el);
    });
  });

  describe('highlightElement', () => {
    it('sets outline styles on element', () => {
      vi.useFakeTimers();
      const el = document.createElement('div');
      highlightElement(el, '#ff0000');
      expect(el.style.outline).toBe('3px solid #ff0000');
      expect(el.style.outlineOffset).toBe('2px');
    });

    it('clears styles after 3 seconds', () => {
      vi.useFakeTimers();
      const el = document.createElement('div');
      highlightElement(el, '#ff0000');
      vi.advanceTimersByTime(3000);
      expect(el.style.outline).toBe('');
      vi.useRealTimers();
    });

    it('does not throw for null element', () => {
      expect(() => highlightElement(null as any, '#fff')).not.toThrow();
    });
  });
});
