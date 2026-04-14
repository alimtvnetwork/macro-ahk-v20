/**
 * Global type declarations for MacroLoop Controller.
 * Extends the Window interface with runtime-injected globals.
 *
 * Phase 9D: All window.__* globals removed except __comboForceInject.
 * APIs live on RiseupAsiaMacroExt.Projects.MacroController.api.*
 *
 * Config/Theme types are imported from ./types.ts — no duplicate definitions.
 */

import type { MacroControllerConfig, MacroThemeRoot, PromptEntry } from './types';
import type { NamespaceValue } from './api-namespace';
import type { MarcoConfigOverrides } from './types/api-data-types';

interface XPathUtilsAPI {
  version: string;
  setLogger: (info: (fn: string, msg: string) => void, sub: (fn: string, msg: string) => void, warn: (fn: string, msg: string) => void) => void;
  reactClick: (el: Element, xpath?: string) => void;
}

declare global {
  interface MacroControllerFacade {
    getInstance?: () => MacroControllerFacade;
    hasInstance?: () => boolean;
    ui?: { create?: () => void; update?: () => void } | null;
    hasUI?: boolean;
    registerUI?: (ui: ManagerInstance) => void;
    registerAuth?: (a: ManagerInstance) => void;
    registerCredits?: (c: ManagerInstance) => void;
    registerLoop?: (l: ManagerInstance) => void;
    registerWorkspaces?: (ws: ManagerInstance) => void;
    auth?: ManagerInstance;
    credits?: ManagerInstance;
    loop?: ManagerInstance;
    workspaces?: ManagerInstance;
    [key: string]: ManagerInstance | ((...args: ManagerInstance[]) => ManagerInstance) | string | boolean | undefined;
  }

  /** Opaque manager type — typed enough to pass through register/factory calls. */
  type ManagerInstance = object | null | undefined;

  interface MarcoSDKPromptEntry {
    id?: string;
    name: string;
    text: string;
    category?: string;
    categories?: string;
    version?: string;
    order?: number;
    isDefault?: boolean;
    isFavorite?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  interface MarcoSDKPromptsApi {
    getAll(): Promise<MarcoSDKPromptEntry[]>;
    save(prompt: { name: string; text: string; category?: string; id?: string }): Promise<MarcoSDKPromptEntry>;
    delete(id: string): Promise<void>;
    reorder(ids: string[]): Promise<void>;
    inject(text: string, options?: { pasteTargetXPath?: string; pasteTargetSelector?: string }): boolean;
    getConfig(): Promise<{ entries: MarcoSDKPromptEntry[]; pasteTargetXPath: string; pasteTargetSelector: string }>;
    invalidateCache(): Promise<void>;
    preWarm(): Promise<MarcoSDKPromptEntry[]>;
  }

  interface MarcoSDKApiResponse<T = Record<string, string | number | boolean | null>> {
    readonly ok: boolean;
    readonly status: number;
    readonly data: T;
    readonly headers: Record<string, string>;
  }

  interface MarcoSDKApiCallOptions {
    params?: Record<string, string>;
    body?: Record<string, string | number | boolean | null | undefined>;
    headers?: Record<string, string>;
    baseUrl?: string;
    timeoutMs?: number;
  }

  interface MarcoSDKApiCredits {
    fetchWorkspaces(options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    fetchBalance(wsId: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    resolve(wsId: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
  }

  interface MarcoSDKApiWorkspace {
    move(projectId: string, targetWsId: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    rename(wsId: string, newName: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    markViewed(projectId: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    probe(options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
    resolveByProject(projectId: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse>;
  }

  interface MarcoSDKApiModule {
    call<T = Record<string, string | number | boolean | null>>(path: string, options?: MarcoSDKApiCallOptions): Promise<MarcoSDKApiResponse<T>>;
    credits: MarcoSDKApiCredits;
    workspace: MarcoSDKApiWorkspace;
  }

  interface MarcoSDKAuthResolutionDiag {
    source: 'bridge' | 'localStorage' | 'none';
    durationMs: number;
    bridgeOutcome: 'hit' | 'timeout' | 'error' | 'skipped';
  }

  interface MarcoSDKAuthTokenUtils {
    normalizeBearerToken(raw: string): string;
    isJwtToken(raw: string): boolean;
    isUsableToken(raw: string): boolean;
    extractBearerTokenFromRaw(raw: string): string;
  }

  interface MarcoSDK {
    auth?: {
      getToken(): Promise<string | null>;
      getSource(): Promise<string>;
      refresh(): Promise<string | null>;
      isExpired(): Promise<boolean>;
      getJwtPayload(): Promise<Record<string, string | number | boolean | null> | null>;
      getLastAuthDiag(): MarcoSDKAuthResolutionDiag | null;
    };
    authUtils?: MarcoSDKAuthTokenUtils;
    api?: MarcoSDKApiModule;
    notify?: {
      toast(message: string, level?: string, opts?: { duration?: number; position?: string }): void;
      dismissAll(): void;
      onError(callback: (error: Error | string) => void): void;
      getRecentErrors(): Array<Error | string>;
      _setStopLoopCallback(fn: () => void): void;
      _setVersion(v: string): void;
    };
    prompts?: MarcoSDKPromptsApi;
    utils?: {
      withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T>;
      withRetry<T>(fn: () => Promise<T>, options: { maxRetries?: number; backoffMs?: number }): Promise<T>;
      createConcurrencyLock<T>(): { acquire: () => Promise<void>; release: () => void };
      delay(ms: number): Promise<void>;
      pollUntil<T>(condition: () => T | null | undefined | false, options?: { intervalMs?: number; timeoutMs?: number }): Promise<T | null>;
      waitForElement(options: { selector?: string; xpath?: string; timeoutMs?: number }): Promise<Element | null>;
      debounce<A extends Array<string | number | boolean>>(fn: (...args: A) => void, ms: number): (...args: A) => void;
      throttle<A extends Array<string | number | boolean>>(fn: (...args: A) => void, ms: number): (...args: A) => void;
      safeJsonParse<T>(json: string, fallback: T): T;
      formatDuration(ms: number): string;
      uid(prefix?: string): string;
      deepClone<T>(value: T): T;
      isObject(value: string | number | boolean | object | null | undefined): value is Record<string, string | number | boolean | null>;
    };
  }

  interface Window {
    __MARCO_CONFIG__: MacroControllerConfig;
    __MARCO_THEME__: MacroThemeRoot;
    __MARCO_PROMPTS__?: PromptEntry[];
    XPathUtils: XPathUtilsAPI;

    /** Cached credit bar HTML to avoid re-rendering on every UI update */
    _creditBarCache?: { key: string; html: string };

    // Kept on window — must be set BEFORE script injection
    __comboForceInject?: boolean;

    /** Set by message-relay content script when active */
    __marcoRelayActive?: boolean;

    // MacroController class — proper name, not a __* global
    MacroController: MacroControllerFacade;

    // Marco SDK (injected by marco-sdk.js)
    marco?: MarcoSDK;

    /** Optional config overrides set by test harness or debug tools. */
    marco_config_overrides?: MarcoConfigOverrides;

    // SDK namespace
    RiseupAsiaMacroExt?: RiseupAsiaMacroExtNamespace;
  }

  interface RiseupAsiaCookieBinding {
    role?: string;
    cookieName?: string;
  }

  interface RiseupAsiaProject {
    meta?: { version?: string };
    api?: Record<string, NamespaceValue>;
    _internal?: Record<string, NamespaceValue>;
    cookies?: {
      bindings?: Array<RiseupAsiaCookieBinding>;
    };
  }

  interface RiseupAsiaMacroExtNamespace {
    Logger?: {
      error(fn: string, msg: string, error?: Error | string): void;
      warn(fn: string, msg: string): void;
      info(fn: string, msg: string): void;
      debug(fn: string, msg: string): void;
    };
    Projects?: Record<string, RiseupAsiaProject | undefined>;
  }

  /**
   * Bare global access — no `window.` prefix needed in consumer code.
   * The namespace is bootstrapped by the SDK before any scripts run.
   */
  const RiseupAsiaMacroExt: Window['RiseupAsiaMacroExt'];
}

export {};
