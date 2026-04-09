import { describe, it, expect, vi, beforeEach } from 'vitest';

const ID_LOOP_JS_EXECUTOR = 'loop-js-executor';
const ID_LOOP_JS_HISTORY = 'loop-js-history';
const SEL_LOOP_JS_HIST_ITEM = '.loop-js-hist-item';

// Mock all transitive deps of js-executor
vi.mock('../shared-state', () => ({
  VERSION: '1.0.0-test',
  IDS: { JS_EXECUTOR: 'loop-js-executor' },
  cPanelFg: '#fff',
  cPanelFgDim: '#999',
  cLogDefault: '#ccc', cLogSuccess: '#0f0', cLogError: '#f00',
  cLogWarn: '#ff0', cLogCheck: '#0ff', cLogSkip: '#888',
  cLogDelegate: '#a0f', cLogInfo: '#aaa',
}));
vi.mock('../logging', () => ({
  log: vi.fn(),
  logSub: vi.fn(),
}));
vi.mock('../error-utils', () => ({
  logError: vi.fn(),
}));
vi.mock('../constants', () => ({
  LOOP_JS_HISTORY_MAX: 50,
}));

import { addLoopJsHistoryEntry, navigateLoopJsHistory, executeJs } from '../ui/js-executor';
import { log } from '../logging';
import { logError } from '../error-utils';

 
describe('js-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('addLoopJsHistoryEntry', () => {
    it('adds entry to history display', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      addLoopJsHistoryEntry('console.log(1)', true, '1');
      expect(histEl.innerHTML).toContain('console.log(1)');
      expect(histEl.innerHTML).toContain('✓');
    });

    it('shows failure icon for errors', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      addLoopJsHistoryEntry('bad()', false, 'ReferenceError');
      expect(histEl.innerHTML).toContain('✗');
    });

    it('deduplicates consecutive identical commands', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      const countBefore = histEl.querySelectorAll(SEL_LOOP_JS_HIST_ITEM).length;
      addLoopJsHistoryEntry('dedup_unique_test()', true, 'ok');
      const countAfterFirst = histEl.querySelectorAll(SEL_LOOP_JS_HIST_ITEM).length;
      addLoopJsHistoryEntry('dedup_unique_test()', true, 'ok');
      const countAfterSecond = histEl.querySelectorAll(SEL_LOOP_JS_HIST_ITEM).length;
      // Second identical call should not add another entry
      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });

  describe('navigateLoopJsHistory', () => {
    it('does nothing when no textarea exists', () => {
      expect(() => navigateLoopJsHistory('up')).not.toThrow();
    });

    it('navigates up through history', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      const ta = document.createElement('textarea');
      ta.id = ID_LOOP_JS_EXECUTOR;
      document.body.appendChild(ta);

      addLoopJsHistoryEntry('first()', true, 'ok');
      addLoopJsHistoryEntry('second()', true, 'ok');

      navigateLoopJsHistory('up');
      expect(ta.value).toBe('second()');

      navigateLoopJsHistory('up');
      expect(ta.value).toBe('first()');
    });

    it('navigates down clears value', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      const ta = document.createElement('textarea');
      ta.id = ID_LOOP_JS_EXECUTOR;
      document.body.appendChild(ta);

      addLoopJsHistoryEntry('cmd()', true, 'ok');
      navigateLoopJsHistory('up');
      expect(ta.value).toBe('cmd()');

      navigateLoopJsHistory('down');
      expect(ta.value).toBe('');
    });
  });

  describe('executeJs', () => {
    it('warns when textbox not found', () => {
      executeJs();
      expect(log).toHaveBeenCalledWith('JS textbox element not found', 'error');
    });

    it('warns for empty code', () => {
      const ta = document.createElement('textarea');
      ta.id = ID_LOOP_JS_EXECUTOR;
      ta.value = '   ';
      document.body.appendChild(ta);

      executeJs();
      expect(log).toHaveBeenCalledWith('No code to execute', 'warn');
    });

    it('executes valid code', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      const ta = document.createElement('textarea');
      ta.id = ID_LOOP_JS_EXECUTOR;
      ta.value = '1 + 2';
      document.body.appendChild(ta);

      executeJs();
      expect(histEl.innerHTML).toContain('1 + 2');
      expect(histEl.innerHTML).toContain('✓');
    });

    it('logs error for invalid code', () => {
      const histEl = document.createElement('div');
      histEl.id = ID_LOOP_JS_HISTORY;
      document.body.appendChild(histEl);

      const ta = document.createElement('textarea');
      ta.id = ID_LOOP_JS_EXECUTOR;
      ta.value = 'throw new Error("test error")';
      document.body.appendChild(ta);

      executeJs();
      expect(histEl.innerHTML).toContain('✗');
    });
  });
});
