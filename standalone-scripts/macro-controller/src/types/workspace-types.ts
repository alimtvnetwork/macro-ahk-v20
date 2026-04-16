/**
 * Macro Controller — Workspace & Rename Type Definitions
 *
 * Phase 5E: Extracted from types.ts.
 * Contains bulk rename, rename history, workspace matching, and extension response types.
 */

import type { WorkspaceCredit } from './credit-types';

export interface BulkRenameEntry {
  wsId: string;
  oldName: string;
  newName: string;
}

export type RenameStrategy = 'normal' | 'no-limit' | 'auth-retry' | 'rate-retry';

export interface BulkRenameResults {
  success: number;
  failed: number;
  skipped: number;
  total: number;
  successEntries: Array<{ wsId: string; oldName: string; newName: string; success?: boolean; strategy?: RenameStrategy }>;
  cancelled: boolean;
  strategies: Partial<Record<RenameStrategy, number>>;
}

export interface RenameHistoryEntry {
  timestamp: number;
  entries: Array<{ wsId: string; oldName: string; newName: string; success?: boolean; strategy?: RenameStrategy }>;
}

export interface UndoRenameResults {
  success: number;
  failed: number;
  total: number;
}

export interface WorkspaceMatchCandidate {
  matched: WorkspaceCredit;
  rawName: string;
  selected: boolean;
}

export interface ExtensionResponse {
  entries?: Array<{ key: string; value: string }>;
  isOk?: boolean;
  errorMessage?: string;
  version?: string;
  scriptName?: string;
  scriptSource?: string;
  bundledVersion?: string;
  outputFile?: string;
  sizeBytes?: number | null;
  [key: string]: unknown;
}
