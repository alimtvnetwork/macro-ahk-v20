/**
 * MacroLoop Controller — Database Raw JSON Schema Tab
 *
 * Orchestrator: builds the JSON tab UI with editor, action buttons,
 * and log output. Delegates to sub-modules for types, validation,
 * migration execution, and documentation.
 *
 * Sub-modules: database-json-types, database-json-migrate, database-json-docs.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { cInputBg, cInputBorder, cInputFg, cPanelBgAlt, cPrimary, cPrimaryBgAL, cPrimaryBgAS, cPrimaryLight, cSectionHeader } from '../shared-state';
import { SAMPLE_SCHEMA } from './database-json-types';
import { applySchema, validateSchema } from './database-json-migrate';
import { downloadSchemaDocs } from './database-json-docs';

const ID_MARCO_JSON_BTN = 'marco-json-btn';

const STYLE_ID = 'marco-db-json-styles';

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

function injectJsonStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .marco-json-wrap { padding: 12px 0; }
    .marco-json-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
      color: ${cSectionHeader}; font-weight: 700; margin-bottom: 6px;
    }
    .marco-json-editor {
      width: 100%; min-height: 260px; padding: 10px; font-size: 12px;
      font-family: 'Fira Code', 'Consolas', monospace;
      background: ${cInputBg}; border: 1px solid ${cInputBorder};
      color: ${cInputFg}; border-radius: 6px; outline: none;
      resize: vertical; box-sizing: border-box; tab-size: 2;
      line-height: 1.5;
    }
    .marco-json-editor:focus { border-color: ${cPrimary}; }
    .marco-json-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .marco-json-btn {
      padding: 6px 14px; font-size: 11px; border-radius: 4px; cursor: pointer;
      border: 1px solid ${cInputBorder}; background: ${cInputBg}; color: ${cInputFg};
      transition: all 0.12s;
    }
    .marco-json-btn:hover { background: ${cPrimaryBgAS}; border-color: ${cPrimaryBgAL}; }
    .marco-json-btn-primary { background: ${cPrimary}; color: #fff; border-color: ${cPrimary}; }
    .marco-json-btn-primary:hover { opacity: 0.9; }
    .marco-json-log {
      margin-top: 12px; max-height: 200px; overflow-y: auto;
      padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px;
      font-size: 11px; font-family: monospace; line-height: 1.6;
    }
    .marco-json-log-ok { color: #4ade80; }
    .marco-json-log-err { color: #f87171; }
    .marco-json-log-info { color: #94a3b8; }
    .marco-json-log-warn { color: #fbbf24; }
    .marco-json-sample {
      margin-top: 8px; padding: 8px 10px; background: ${cPanelBgAlt};
      border-radius: 4px; font-size: 10px; color: #64748b; cursor: pointer;
      transition: background 0.15s;
    }
    .marco-json-sample:hover { background: ${cPrimaryBgAS}; color: #94a3b8; }
    .marco-json-doc-link {
      font-size: 10px; color: ${cPrimaryLight}; cursor: pointer;
      text-decoration: underline; margin-left: auto;
    }
  `;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text) {
    e.textContent = text;
  }
  return e;
}

/** Append a styled log line to the log container. */
export function appendLog(logEl: HTMLElement, level: 'ok' | 'err' | 'info' | 'warn', text: string): void {
  const line = el('div', 'marco-json-log-' + level, text);
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/* ------------------------------------------------------------------ */
/*  Build JSON Tab                                                     */
/* ------------------------------------------------------------------ */

export function buildJsonTab(
  container: HTMLElement,
  statusBar: HTMLElement,
): void {
  injectJsonStyles();
  container.textContent = '';

  const wrap = el('div', 'marco-json-wrap');

  // Header row
  const headerRow = el('div');
  headerRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
  headerRow.appendChild(el('div', 'marco-json-label', 'JSON Schema Document'));

  const docLink = el('span', 'marco-json-doc-link', '📄 Download docs');
  docLink.onclick = () => downloadSchemaDocs();
  headerRow.appendChild(docLink);
  wrap.appendChild(headerRow);

  // Editor
  const editor = el('textarea', 'marco-json-editor') as HTMLTextAreaElement;
  editor.placeholder = 'Paste your JSON schema here…\n\nClick "Load Sample" below to see the format.';
  editor.spellcheck = false;
  wrap.appendChild(editor);

  // Actions
  const actions = el('div', 'marco-json-actions');

  const applyBtn = el('button', 'marco-json-btn marco-json-btn-primary', '⚡ Apply Schema');
  applyBtn.onclick = () => applySchema(editor.value, logEl, statusBar);
  actions.appendChild(applyBtn);

  const validateBtn = el('button', ID_MARCO_JSON_BTN, '✓ Validate');
  validateBtn.onclick = () => validateSchema(editor.value, logEl);
  actions.appendChild(validateBtn);

  const sampleBtn = el('button', ID_MARCO_JSON_BTN, '📋 Load Sample');
  sampleBtn.onclick = () => {
    editor.value = JSON.stringify(SAMPLE_SCHEMA, null, 2);
    appendLog(logEl, 'info', 'Loaded sample schema');
  };
  actions.appendChild(sampleBtn);

  const clearBtn = el('button', ID_MARCO_JSON_BTN, '🗑️ Clear');
  clearBtn.onclick = () => { editor.value = ''; logEl.textContent = ''; };
  actions.appendChild(clearBtn);

  wrap.appendChild(actions);

  // Log output
  const logEl = el('div', 'marco-json-log');
  logEl.innerHTML = '<span class="marco-json-log-info">Ready — paste a JSON schema and click Apply</span>';
  wrap.appendChild(logEl);

  container.appendChild(wrap);
}
