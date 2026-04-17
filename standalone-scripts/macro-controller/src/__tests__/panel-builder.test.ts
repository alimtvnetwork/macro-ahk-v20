import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all dependencies (paths relative to __tests__/) ──

vi.mock('../shared-state', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    state: { running: false, direction: 'up' },
    loopCreditState: {},
    loopWsCheckedIds: new Set(),
  };
});

vi.mock('../logging', () => ({
  log: vi.fn(),
  getDisplayProjectName: vi.fn(() => 'test-project'),
  getWsHistoryKey: vi.fn(() => 'ws-history-key'),
}));

// Return document.body so createUI skips retry logic
vi.mock('../xpath-utils', () => ({
  getByXPath: vi.fn(() => document.body),
}));

vi.mock('../auth', () => ({
  resolveToken: vi.fn(() => 'mock-token'),
  refreshBearerTokenFromBestSource: vi.fn(),
  updateAuthBadge: vi.fn(),
  recoverAuthOnce: vi.fn(),
  getSessionCookieNames: vi.fn(() => []),
  getLastBridgeOutcome: vi.fn(() => null),
  setRecordRefreshOutcome: vi.fn(),
  getLastTokenSource: vi.fn(() => 'test'),
  wakeBridge: vi.fn(() => Promise.resolve(false)),
  LAST_TOKEN_SOURCE: 'test',
}));

vi.mock('../toast', () => ({
  showToast: vi.fn(),
  setStopLoopCallback: vi.fn(),
}));

vi.mock('../ui/panel-layout', () => ({
  createPanelLayoutCtx: vi.fn(() => ({
    bodyElements: [],
    dragStartPos: { x: 0, y: 0 },
    panelToggleSpan: null,
  })),
  enableFloating: vi.fn(),
  setupDragListeners: vi.fn(),
  startDragHandler: vi.fn(),
  createResizeHandle: vi.fn(() => document.createElement('div')),
  setupResizeListeners: vi.fn(),
  toggleMinimize: vi.fn(),
  restorePanel: vi.fn(),
}));

vi.mock('../ui/menu-builder', () => ({
  buildHamburgerMenu: vi.fn(() => ({
    menuContainer: document.createElement('div'),
    menuBtn: document.createElement('button'),
  })),
}));

vi.mock('../ui/keyboard-handlers', () => ({
  registerKeyboardHandlers: vi.fn(),
}));

vi.mock('../ui/check-button', () => ({
  createCheckButton: vi.fn(() => ({
    checkBtn: document.createElement('button'),
  })),
}));

vi.mock('../ui/ws-dropdown-builder', () => ({
  buildWsDropdownSection: vi.fn(() => ({
    wsDropSection: document.createElement('div'),
  })),
}));

vi.mock('../ui/tools-sections-builder', () => ({
  buildToolsSections: vi.fn(() => ({
    jsBody: document.createElement('div'),
    xpathSection: document.createElement('div'),
    activitySection: document.createElement('div'),
    logSection: document.createElement('div'),
    jsSection: document.createElement('div'),
    recentErrorsSection: document.createElement('div'),
  })),
}));

vi.mock('../ui/countdown', () => ({
  createCountdownCtx: vi.fn(() => ({})),
  updateStartStopBtn: vi.fn(),
}));

vi.mock('../ui/prompt-manager', () => ({
  PromptContext: {},
  sendToExtension: vi.fn(),
  loadPromptsFromJson: vi.fn(() => Promise.resolve()),
  getPromptsConfig: vi.fn(() => ({})),
  renderPromptsDropdown: vi.fn(),
  openPromptCreationModal: vi.fn(),
  setRevalidateContext: vi.fn(),
}));

vi.mock('../ui/task-next-ui', () => ({
  taskNextState: {},
  loadTaskNextSettings: vi.fn(),
  saveTaskNextSettings: vi.fn(),
  setupTaskNextCancelHandler: vi.fn(),
}));

vi.mock('../ui/save-prompt', () => ({
  injectSavePromptButton: vi.fn(),
}));

vi.mock('../ui/sections', () => ({
  createCollapsibleSection: vi.fn(() => ({
    section: document.createElement('div'),
    header: document.createElement('div'),
    body: document.createElement('div'),
    toggle: document.createElement('span'),
  })),
  createWsHistorySection: vi.fn(() => ({
    section: document.createElement('div'),
  })),
  createAuthDiagRow: vi.fn(() => ({
    row: document.createElement('div'),
    updateAuthDiagRow: vi.fn(),
  })),
  recordRefreshOutcome: vi.fn(),
}));

vi.mock('../ui/settings-ui', () => ({
  showSettingsDialog: vi.fn(),
}));

vi.mock('../ui/about-modal', () => ({
  showAboutModal: vi.fn(),
}));

vi.mock('../ui/ui-updaters', () => ({
  updateUI: vi.fn(),
  attachButtonHoverFx: vi.fn(),
  destroyPanel: vi.fn(),
}));

vi.mock('../workspace-observer', () => ({
  getWorkspaceHistory: vi.fn(() => []),
}));

// Also mock transitive deps that check-button / loop-engine pull in
vi.mock('../loop-engine', () => ({
  startLoop: vi.fn(),
  stopLoop: vi.fn(),
  loopCheck: vi.fn(),
}));

vi.mock('../credit-fetch', () => ({
  fetchLoopCredits: vi.fn(),
}));

vi.mock('../credit-api', () => ({
  calcTotalCredits: vi.fn(() => 0),
  calcAvailableCredits: vi.fn(() => 0),
  calcFreeCredits: vi.fn(() => 0),
}));

import { createUI, PanelBuilderDeps } from '../ui/panel-builder';
import { IDS } from '../shared-state';

function makeMockDeps(): PanelBuilderDeps {
  return {
    startLoop: vi.fn(),
    stopLoop: vi.fn(),
    forceSwitch: vi.fn(),
    fetchLoopCreditsWithDetect: vi.fn(),
    autoDetectLoopCurrentWorkspace: vi.fn(),
    updateProjectButtonXPath: vi.fn(),
    updateProgressXPath: vi.fn(),
    updateWorkspaceXPath: vi.fn(),
    executeJs: vi.fn(),
    navigateLoopJsHistory: vi.fn(),
    populateLoopWorkspaceDropdown: vi.fn(),
    updateWsSelectionUI: vi.fn(),
    renderBulkRenameDialog: vi.fn(),
    getRenameHistory: vi.fn(() => []),
    undoLastRename: vi.fn(),
    updateUndoBtnVisibility: vi.fn(),
    getLoopWsFreeOnly: vi.fn(() => false),
    setLoopWsFreeOnly: vi.fn(),
    getLoopWsCompactMode: vi.fn(() => false),
    setLoopWsCompactMode: vi.fn(),
    getLoopWsExpiredWithCredits: vi.fn(() => false),
    setLoopWsExpiredWithCredits: vi.fn(),
    getLoopWsNavIndex: vi.fn(() => 0),
    setLoopWsNavIndex: vi.fn(),
    triggerLoopMoveFromSelection: vi.fn(),
  };
}

 
describe('panel-builder', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as any).__loopUpdateStartStopBtn = undefined;
    (window as any).__loopUpdateAuthDiag = undefined;
  });

  it('creates the main UI container in document.body', () => {
    createUI(makeMockDeps());

    const container = document.getElementById(IDS.CONTAINER);
    expect(container).not.toBeNull();
    expect(container!.parentElement).toBe(document.body);
  });

  it('does not duplicate UI if already exists', () => {
    const existing = document.createElement('div');
    existing.id = IDS.CONTAINER;
    document.body.appendChild(existing);

    createUI(makeMockDeps());

    expect(document.querySelectorAll('#' + IDS.CONTAINER).length).toBe(1);
  });

  it('creates the record indicator element', () => {
    createUI(makeMockDeps());

    const record = document.getElementById(IDS.RECORD_INDICATOR);
    expect(record).not.toBeNull();
    expect(record!.className).toContain('loop-pulse');
  });

  it('injects keyframe animation styles into head', () => {
    createUI(makeMockDeps());

    const styles = document.head.querySelectorAll('style');
    const hasKeyframes = Array.from(styles).some(s => s.textContent?.includes('@keyframes pulse'));
    expect(hasKeyframes).toBe(true);
  });

  it('creates status bar element', () => {
    createUI(makeMockDeps());

    const status = document.getElementById(IDS.STATUS);
    expect(status).not.toBeNull();
    // Status bar now uses a skeleton shimmer placeholder instead of "Initializing..." text
    // See: .lovable/memory/features/macro-controller/startup-initialization.md (UI-first strategy)
    expect(status!.querySelector('.marco-skeleton') || status!.textContent).toBeTruthy();
  });

  it('completes UI setup without throwing', () => {
    expect(() => createUI(makeMockDeps())).not.toThrow();
  });

  it('calls registerKeyboardHandlers', async () => {
    const mod = await import('../ui/keyboard-handlers');
    createUI(makeMockDeps());
    expect(mod.registerKeyboardHandlers).toHaveBeenCalled();
  });

  it('wires start/stop button click to deps.startLoop', () => {
    const deps = makeMockDeps();
    createUI(deps);

    const startBtn = document.getElementById(IDS.START_BTN);
    expect(startBtn).not.toBeNull();
    startBtn!.click();
    expect(deps.startLoop).toHaveBeenCalled();
  });
});
