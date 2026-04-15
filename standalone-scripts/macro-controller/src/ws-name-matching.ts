/**
 * Workspace Name Matching — Pure utility functions for workspace name normalization,
 * matching, and candidate collection from DOM nodes.
 *
 * Extracted from workspace-detection.ts (module splitting).
 */

import type { WorkspaceCredit } from './types';

// ============================================
// Constants
// ============================================
export const SELECTED_WS_SELECTOR = '[aria-current="page"], [aria-selected="true"], [data-state="checked"], [data-state="active"], [data-selected="true"]';
const INVALID_WORKSPACE_NAME_CANDIDATES = new Set([
  'preview',
  'project',
  'projects',
  'workspace',
  'workspaces',
  'current workspace',
  'selected workspace',
  'unknown workspace',
  'unknown project',
]);

// ============================================
// Normalization and matching
// ============================================

export function normalizeWorkspaceName(name: string): string {
  return (name || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isInvalidWorkspaceCandidateName(name: string, projectName?: string): boolean {
  const normalizedName = normalizeWorkspaceName(name);
  const normalizedProjectName = normalizeWorkspaceName(projectName || '');

  if (!normalizedName) {
    return true;
  }

  if (INVALID_WORKSPACE_NAME_CANDIDATES.has(normalizedName)) {
    return true;
  }

  if (normalizedProjectName && normalizedName === normalizedProjectName) {
    return true;
  }

  return false;
}

export function matchWorkspaceByName(rawName: string, perWs: WorkspaceCredit[]): WorkspaceCredit | null {
  const normalizedRaw = normalizeWorkspaceName(rawName);
  if (!normalizedRaw || !perWs || perWs.length === 0) {

    return null;
  }

  for (const ws of perWs) {
    const fullName = (ws.fullName || ws.name || '') as string;
    if (normalizeWorkspaceName(fullName) === normalizedRaw) {

      return ws;
    }
  }

  return null;
}

// ============================================
// Candidate collection helpers
// ============================================

export function pushWorkspaceNameCandidate(target: Array<{ name: string; selected: boolean }>, name: string, selected: boolean): void {
  const cleaned = (name || '').replace(/\u00a0/g, ' ').trim();
  if (!cleaned) {

    return;
  }
  const normalized = normalizeWorkspaceName(cleaned);
  if (!normalized) {

    return;
  }

  for (const entry of target) {
    if (normalizeWorkspaceName(entry.name) === normalized) {
      if (selected) {
        entry.selected = true;
      }

      return;
    }
  }
  target.push({ name: cleaned, selected: selected });
}

export function expandWorkspaceNameCandidates(rawText: string, selected: boolean, target: Array<{ name: string; selected: boolean }>): void {
  const base = (rawText || '').replace(/\u00a0/g, ' ').trim();
  if (!base) {

    return;
  }

  pushWorkspaceNameCandidate(target, base, selected);

  const lines = base.split(/\r?\n+/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }
    pushWorkspaceNameCandidate(target, trimmedLine, selected);

    const stripped = trimmedLine.replace(/^(workspace|current workspace|selected workspace|project)\s*[:\u002D]\s*/i, '').trim();
    if (stripped && stripped !== trimmedLine) {
      pushWorkspaceNameCandidate(target, stripped, selected);
    }

    const tokens = trimmedLine.split(/\s*[|•·→]\s*/);
    for (const token of tokens) {
      const trimmedToken = token.trim();
      if (!trimmedToken) {
        continue;
      }
      pushWorkspaceNameCandidate(target, trimmedToken, selected);
    }
  }
}

// ============================================
// DOM node selection detection
// ============================================

export function isLikelySelectedWorkspaceNode(node: Node): boolean {
  if (!(node instanceof Element)) {

    return false;
  }

  if (
    node.matches(SELECTED_WS_SELECTOR) ||
    !!node.closest(SELECTED_WS_SELECTOR) ||
    !!node.querySelector(SELECTED_WS_SELECTOR)
  ) {

    return true;
  }

  let el: Element | null = node;
  for (let i = 0; i < 4 && el; i++) {
    const className = ((el.className as string) || '').toLowerCase();
    if (/(^|\s)(selected|active|current|checked)(\s|$)/.test(className) || /\bis-(selected|active|current|checked)\b/.test(className)) {

      return true;
    }
    el = el.parentElement;
  }

  return false;
}

// ============================================
// Collect all workspace name candidates from a DOM node
// ============================================

/** Collect candidates from a single Element's attributes and text content. */
function collectFromElement(
  el: Element, selected: boolean, attrKeys: string[],
  candidates: Array<{ name: string; selected: boolean }>,
): void {
  expandWorkspaceNameCandidates((el.textContent || '').trim(), selected, candidates);
  for (const key of attrKeys) {
    const val = el.getAttribute(key);
    if (val) expandWorkspaceNameCandidates(val, selected, candidates);
  }
}

export function collectWorkspaceNameCandidatesFromNode(node: Node): Array<{ name: string; selected: boolean }> {
  const candidates: Array<{ name: string; selected: boolean }> = [];
  const nodeSelected = isLikelySelectedWorkspaceNode(node);
  const attrKeys = ['aria-label', 'title', 'data-name', 'data-value'];

  if (node instanceof Element) {
    // Selected children first
    for (const selectedNode of Array.from(node.querySelectorAll(SELECTED_WS_SELECTOR))) {
      collectFromElement(selectedNode, true, attrKeys, candidates);
    }

    // The node itself
    collectFromElement(node, nodeSelected, attrKeys, candidates);

    // Child text elements
    const childTexts = Array.from(node.querySelectorAll('span, p, a, button, div')).slice(0, 24);
    for (const child of childTexts) {
      collectFromElement(child, nodeSelected, attrKeys, candidates);
    }
  } else {
    expandWorkspaceNameCandidates((node.textContent || '').trim(), false, candidates);
  }

  return candidates;
}
