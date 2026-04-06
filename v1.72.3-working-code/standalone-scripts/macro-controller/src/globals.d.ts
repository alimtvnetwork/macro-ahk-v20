/**
 * Global type declarations for MacroLoop Controller.
 * Extends the Window interface with runtime-injected globals.
 *
 * Phase 9D: All window.__* globals removed except __comboForceInject.
 * APIs live on RiseupAsiaMacroExt.Projects.MacroController.api.*
 */

interface MacroConfig {
  macroLoop?: {
    elementIds?: Record<string, string>;
    timing?: Record<string, number>;
    xpaths?: Record<string, string>;
    urls?: Record<string, string>;
    creditBarWidthPx?: number;
    retry?: { maxRetries?: number; backoffMs?: number };
  };
  autoAttach?: {
    timing?: Record<string, number>;
    groups?: any[];
    plusButtonXPath?: string;
    attachButtonXPath?: string;
    chatBoxXPath?: string;
  };
  prompts?: any;
  [key: string]: any;
}

interface MacroTheme {
  activePreset?: string;
  presets?: Record<string, any>;
  colors?: Record<string, any>;
  animations?: Record<string, any>;
  transitions?: Record<string, any>;
  layout?: Record<string, any>;
  typography?: Record<string, any>;
  [key: string]: any;
}

interface XPathUtilsAPI {
  version: string;
  setLogger: (info: Function, sub: Function, warn: Function) => void;
  reactClick: (el: Element, xpath?: string) => void;
}

interface Window {
  __MARCO_CONFIG__: any;
  __MARCO_THEME__: any;
  XPathUtils: XPathUtilsAPI;

  // Kept on window — must be set BEFORE script injection
  __comboForceInject?: boolean;

  // MacroController class — proper name, not a __* global
  MacroController: any;

  [key: string]: any; // Allow dynamic property access
}
