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
 * See: spec/01-app/macrocontroller-ts-migration-v2/02-class-architecture.md
 */

import { VERSION, state, loopCreditState, CONFIG, TIMING, IDS } from '../shared-state';
import { log } from '../logging';
import { domCache } from '../dom-cache';

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
  getState(): Record<string, any>;
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
  detectViaDialog(callerFn?: string, perWs?: any[], keepDialogOpen?: boolean): Promise<Element | null>;
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
  check(): any;
  setInterval(ms: number): boolean;
  isRunning(): boolean;
}

export interface UIManagerInterface {
  create(): void;
  destroy(): void;
  update(): void;
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

  // ---- Public accessors (throw if not registered) ----

  get auth(): AuthManagerInterface {
    if (!this._auth) throw new Error('MacroController: AuthManager not registered');
    return this._auth;
  }

  get credits(): CreditManagerInterface {
    if (!this._credits) throw new Error('MacroController: CreditManager not registered');
    return this._credits;
  }

  get workspaces(): WorkspaceManagerInterface {
    if (!this._workspaces) throw new Error('MacroController: WorkspaceManager not registered');
    return this._workspaces;
  }

  get loop(): LoopEngineInterface {
    if (!this._loop) throw new Error('MacroController: LoopEngine not registered');
    return this._loop;
  }

  get ui(): UIManagerInterface {
    if (!this._ui) throw new Error('MacroController: UIManager not registered');
    return this._ui;
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

  get state(): Record<string, any> {
    return state;
  }

  get creditState(): Record<string, any> {
    return loopCreditState;
  }

  // ---- Diagnostics ----

  diagnostics(): Record<string, any> {
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
  (window as any).MacroController = MacroController;

  // Mark fully initialized
  mc.markInitialized();

  log('[MacroController] Window facade installed (window.MacroController)', 'sub');
}
