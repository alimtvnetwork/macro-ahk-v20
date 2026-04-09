/**
 * MacroController — Singleton Orchestrator (V2 Phase 02, Step 1)
 *
 * Central class that owns all sub-managers and provides a single entry point.
 * Replaces 40+ window.__loop* globals with a structured API.
 *
 * Usage:
 *   const mc = MacroController.getInstance();
 *   mc.loop.start('down');
 *   mc.loop.stop();
 *   mc.credits.fetch();
 *
 * Window facade kept for backward compatibility:
 *   window.__loopStart('down')  →  MacroController.getInstance().loop.start('down')
 *
 * @see spec/04-macro-controller/ts-migration-v2/02-class-architecture.md — Class architecture
 * @see .lovable/memory/architecture/extension-controller-overview.md — Controller overview
 * @see .lovable/memory/architecture/macro-controller/manager-lifecycle-and-diagnostics.md — Manager lifecycle
 */

import { VERSION, state, loopCreditState } from '../shared-state';
import type { WorkspaceCredit, LoopCreditState } from '../types';
import { log } from '../logging';
import { domCache } from '../dom-cache';
import { nsReadTyped } from '../api-namespace';
import { wsRenderStats } from '../ws-selection-ui';
import { statusRenderStats } from '../ui/ui-updaters';
import { logError } from '../error-utils';

// ============================================
// Sub-manager interfaces (stubs for Step 1)
// ============================================

export interface AuthManagerInterface {
  getToken(): string;
  refreshToken(callback: (token: string, source: string) => void): void;
  getLastSource(): string;
  verifySession(context: string): void;
}

export interface CreditManagerInterface {
  fetch(isRetry?: boolean): void;
  fetchAsync(isRetry?: boolean): Promise<void>;
  fetchBalance(workspaceId?: string): Promise<import('../types').CreditBalanceResponse | null>;
  getState(): LoopCreditState;
  parse(data: Record<string, unknown>): boolean;
  sync(): void;
  calcTotal(granted: number, dailyLimit: number, billingLimit: number, topupLimit: number, rolloverLimit: number): number;
  calcAvailable(totalCredits: number, rolloverUsed: number, dailyUsed: number, billingUsed: number, freeUsed: number): number;
  calcFree(dailyLimit: number, dailyUsed: number): number;
}

export interface WorkspaceManagerInterface {
  detect(token: string): Promise<void>;
  moveTo(id: string, name: string): void;
  moveAdjacent(direction: string): void;
  moveAdjacentCached(direction: string): void;
  bulkRename(template: string, prefix: string, suffix: string, startNum?: number): void;
  getCurrentName(): string;
  startObserver(): void;
  detectViaDialog(callerFn?: string, perWs?: WorkspaceCredit[], keepDialogOpen?: boolean): Promise<Element | null>;
  fetchName(): void;
  fetchNameFromNav(): boolean;
  isKnown(name: string): boolean;
  extractProjectId(): string | null;
  addChangeEntry(fromName: string, toName: string): void;
  getHistory(): Array<Record<string, string>>;
  clearHistory(): void;
}

export interface LoopEngineInterface {
  start(direction?: string): void;
  stop(): void;
  check(): Promise<void> | undefined;
  setInterval(ms: number): boolean;
  isRunning(): boolean;
}

export interface UIManagerInterface {
  create(): void;
  destroy(): void;
  update(): void;
  updateLight(): void;
  populateDropdown(): void;
}

// ============================================
// MacroController singleton
// ============================================

export class MacroController {
  private static _instance: MacroController | null = null;

  readonly version = VERSION;

  // Sub-managers — set via registerXxx() methods during bootstrap
  private _auth: AuthManagerInterface | null = null;
  private _credits: CreditManagerInterface | null = null;
  private _workspaces: WorkspaceManagerInterface | null = null;
  private _loop: LoopEngineInterface | null = null;
  private _ui: UIManagerInterface | null = null;

  private _initialized = false;

  private constructor() {
    log('[MacroController] Singleton created (v' + VERSION + ')', 'success');
  }

  // ---- Singleton access ----

  static getInstance(): MacroController {
    if (!MacroController._instance) {
      MacroController._instance = new MacroController();
    }
    return MacroController._instance;
  }

  static hasInstance(): boolean {
    return MacroController._instance !== null;
  }

  // ---- Sub-manager registration (dependency injection) ----

  registerAuth(auth: AuthManagerInterface): void {
    this._auth = auth;
    log('[MacroController] AuthManager registered', 'sub');
  }

  registerCredits(credits: CreditManagerInterface): void {
    this._credits = credits;
    log('[MacroController] CreditManager registered', 'sub');
  }

  registerWorkspaces(workspaces: WorkspaceManagerInterface): void {
    this._workspaces = workspaces;
    log('[MacroController] WorkspaceManager registered', 'sub');
  }

  registerLoop(loop: LoopEngineInterface): void {
    this._loop = loop;
    log('[MacroController] LoopEngine registered', 'sub');
  }

  registerUI(ui: UIManagerInterface): void {
    this._ui = ui;
    log('[MacroController] UIManager registered', 'sub');
  }

  // ---- Public accessors with self-healing from persisted factories ----

  get auth(): AuthManagerInterface {
    if (!this._auth) {
      const factory = nsReadTyped('_internal.createAuthManager') as (() => AuthManagerInterface) | null;
      if (factory) {
        log('[MacroController] Self-healing: auto-registering AuthManager from persisted factory', 'warn');
        this._auth = factory();
      }
      if (!this._auth) throw this._notRegisteredError('AuthManager');
    }
    return this._auth;
  }

  get credits(): CreditManagerInterface {
    if (!this._credits) {
      const factory = nsReadTyped('_internal.createCreditManager') as (() => CreditManagerInterface) | null;
      if (factory) {
        log('[MacroController] Self-healing: auto-registering CreditManager from persisted factory', 'warn');
        this._credits = factory();
      }
      if (!this._credits) throw this._notRegisteredError('CreditManager');
    }
    return this._credits;
  }

  get workspaces(): WorkspaceManagerInterface {
    if (!this._workspaces) {
      const factory = nsReadTyped('_internal.createWorkspaceManager') as (() => WorkspaceManagerInterface) | null;
      if (factory) {
        log('[MacroController] Self-healing: auto-registering WorkspaceManager from persisted factory', 'warn');
        this._workspaces = factory();
      }
      if (!this._workspaces) throw this._notRegisteredError('WorkspaceManager');
    }
    return this._workspaces;
  }

  get loop(): LoopEngineInterface {
    if (!this._loop) {
      const factory = nsReadTyped('_internal.createLoopEngine') as (() => LoopEngineInterface) | null;
      if (factory) {
        log('[MacroController] Self-healing: auto-registering LoopEngine from persisted factory', 'warn');
        this._loop = factory();
      }
      if (!this._loop) throw this._notRegisteredError('LoopEngine');
    }
    return this._loop;
  }

  /**
   * UIManager getter — self-heals from persisted factory.
   * Returns null only if factory is also unavailable (early startup).
   */
  get ui(): UIManagerInterface | null {
    if (!this._ui) {
      const factory = nsReadTyped('_internal.createUIManager') as (() => UIManagerInterface) | null;
      if (factory) {
        log('[MacroController] Self-healing: auto-registering UIManager from persisted factory', 'warn');
        this._ui = factory();
      }
    }
    return this._ui;
  }

  /** True when the UIManager has been registered. */
  get hasUI(): boolean {
    return this._ui !== null;
  }

  /**
   * Build a detailed, copyable error for unregistered managers.
   * Includes registered status, namespace factory availability, stack trace, and diagnostics.
   */
  // eslint-disable-next-line max-lines-per-function
  private _notRegisteredError(managerName: string): Error {
    const registered = {
      auth: !!this._auth,
      credits: !!this._credits,
      workspaces: !!this._workspaces,
      loop: !!this._loop,
      ui: !!this._ui,
    };
    const registeredStr = Object.entries(registered)
      .map(([k, v]) => `  ${k}: ${v ? '✅' : '❌'}`)
      .join('\n');

    // Check namespace for persisted factories
    const factoryKeys: Array<[string, string]> = [
      ['_internal.createAuthManager', '__createAuthManager'],
      ['_internal.createCreditManager', '__createCreditManager'],
      ['_internal.createLoopEngine', '__createLoopEngine'],
      ['_internal.createWorkspaceManager', '__createWorkspaceManager'],
      ['_internal.createUIManager', '__createUIManager'],
    ];
    let factoryStatus = '';
    try {
      factoryStatus = factoryKeys.map(([nsPath]) => {
        const f = nsReadTyped(nsPath as keyof import('../api-namespace').NsPathMap);
        return `  ${nsPath}: ${f ? '✅ available' : '❌ missing'}`;
      }).join('\n');
    } catch (e) {
      logError('MacroController.selfCheck', 'Namespace not accessible during self-check', e);
      factoryStatus = '  (namespace not accessible)';
    }

    const nsKey = '_internal.create' + managerName;
    const factoryPresent = !!nsReadTyped(nsKey as keyof import('../api-namespace').NsPathMap);

    const msg =
      `MacroController: ${managerName} not registered\n` +
      `\n[Registered Managers]\n${registeredStr}\n` +
      `\n[Persisted Factories]\n${factoryStatus}\n` +
      `\n[State]\n` +
      `  initialized: ${this._initialized}\n` +
      `  version: ${VERSION}\n` +
      `  workspaceName: ${state.workspaceName || '(none)'}\n` +
      `  running: ${state.running}\n` +
      `  url: ${globalThis.location?.href ?? '(unknown)'}\n` +
      `  timestamp: ${new Date().toISOString()}\n` +
      `\n[Self-Healing Attempted]\n` +
      `  Tried persisted factory for ${managerName}: ${
        factoryPresent ? 'factory found but instantiation failed' : 'no factory available'
      }\n` +
      `\n[How to Fix]\n` +
      `  1. Hard-refresh the page (Ctrl+Shift+R) to re-bootstrap all managers\n` +
      `  2. If persisting: check that the injection pipeline completed Stage 5\n` +
      `  3. Check console for earlier errors that prevented bootstrap completion\n` +
      `\n[Copy This Error]\n` +
      `  Select all text above and share with the developer for debugging.`;
    const err = new Error(msg);
    err.name = 'ManagerNotRegistered';
    console.error('[MacroController] ❌ ' + managerName + ' not registered. Full diagnostic:\n' + msg + '\n\nStack trace:', err.stack);
    return err;
  }

  /** Safe UI update — no-op if UIManager not yet registered. */
  updateUI(): void {
    if (this._ui) this._ui.update();
  }

  /** Lightweight UI update — status/buttons only, no workspace list rebuild. */
  updateUILight(): void {
    if (this._ui) this._ui.updateLight();
  }

  // ---- Lifecycle ----

  get initialized(): boolean {
    return this._initialized;
  }

  markInitialized(): void {
    this._initialized = true;
    log('[MacroController] ✅ Fully initialized', 'success');
  }

  // ---- State accessors ----

  get state(): typeof state {
    return state;
  }

  get creditState(): typeof loopCreditState {
    return loopCreditState;
  }

  // ---- Diagnostics ----

  diagnostics(): Record<string, unknown> {
    return {
      version: this.version,
      initialized: this._initialized,
      managers: {
        auth: !!this._auth,
        credits: !!this._credits,
        workspaces: !!this._workspaces,
        loop: !!this._loop,
        ui: !!this._ui,
      },
      state: {
        running: state.running,
        direction: state.direction,
        cycleCount: state.cycleCount,
        workspaceName: state.workspaceName,
        workspaceFromApi: state.workspaceFromApi,
      },
      credits: {
        wsCount: (loopCreditState.perWorkspace || []).length,
        totalAvailable: loopCreditState.totalAvailable,
        lastCheckedAt: loopCreditState.lastCheckedAt,
        source: loopCreditState.source,
      },
      domCache: domCache.stats(),
      renderPerf: {
        wsDropdown: { ...wsRenderStats },
        statusBar: { ...statusRenderStats },
      },
    };
  }

  // ---- Destroy ----

  destroy(): void {
    log('[MacroController] Destroying...', 'warn');
    if (this._loop && this._loop.isRunning()) {
      this._loop.stop();
    }
    if (this._ui) {
      this._ui.destroy();
    }
    this._initialized = false;
    MacroController._instance = null;
    log('[MacroController] Destroyed', 'warn');
  }
}

// ============================================
// Window facade — backward compatibility
// ============================================

/**
 * Install thin window.__loop* facades that delegate to MacroController.
 * Called once during bootstrap after all managers are registered.
 *
 * This keeps AHK scripts and console users working during migration.
 * Each facade is a one-liner that forwards to the class method.
 */
export function installWindowFacade(): void {
  const mc = MacroController.getInstance();

  // Expose MacroController class on window (proper name — not a __* global)
  
  window.MacroController = MacroController as unknown as MacroControllerFacade;

  // Mark fully initialized
  mc.markInitialized();

  log('[MacroController] Window facade installed (window.MacroController)', 'sub');
}
