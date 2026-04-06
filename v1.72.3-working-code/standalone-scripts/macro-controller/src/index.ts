/**
 * Marco Controller — Entry Point (TypeScript)
 *
 * Step 1: Re-exports the monolithic macro-looping.ts as-is.
 * The Vite build compiles this to dist/macro-looping.js (IIFE).
 *
 * Future steps:
 *   Step 2 — Split functions into individual files
 *   Step 3 — Extract UI logic into ui/ folder
 */

// Step 1: The entire controller is in a single file with @ts-nocheck.
// This import pulls it into the IIFE bundle.
import './macro-looping';

// Type re-exports for consumers (Chrome extension, tests)
export type {
  MacroControllerConfig,
  MacroThemeRoot,
  ControllerState,
  PromptEntry,
  WorkspaceInfo,
  CreditInfo,
  ProjectInfo,
} from './types';
