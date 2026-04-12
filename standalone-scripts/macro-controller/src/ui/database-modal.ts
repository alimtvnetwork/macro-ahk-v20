/**
 * MacroLoop Controller — Database Browser Modal
 *
 * Orchestrates the database browser modal with Data, Schema, and Raw JSON tabs.
 * Sub-modules handle styles (database-modal-styles.ts) and data browsing (database-modal-data.ts).
 *
 * See: spec/17-app-issues/85-sdk-notifier-config-seeding-database-overhaul.md
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { buildSchemaTab } from './database-schema-tab';
import { buildJsonTab } from './database-json-tab';
import { log } from '../logging';
import { injectDatabaseStyles } from './database-modal-styles';
import { loadTables } from './database-modal-data';

const MODAL_ID = 'macroloop-database-modal';

/** Open (or toggle) the database browser modal. */
// eslint-disable-next-line max-lines-per-function
export function showDatabaseModal(): void {
  const existing = document.getElementById(MODAL_ID);
  const isAlreadyOpen = existing !== null;

  if (isAlreadyOpen) {
    existing.remove();
    return;
  }

  injectDatabaseStyles();

  const overlay = createOverlay();
  const modal = document.createElement('div');
  modal.className = 'marco-db-modal';

  const header = buildHeader(overlay);
  modal.appendChild(header);

  const tabBar = buildTabBar();
  modal.appendChild(tabBar);

  const dataBody = buildTabBody(true);
  const sidebar = buildSidebar();
  const content = buildContentArea('Select a table to browse rows');
  dataBody.appendChild(sidebar.element);
  dataBody.appendChild(content);
  modal.appendChild(dataBody);

  const schemaBody = buildTabBody(false);
  const schemaContent = buildContentArea();
  schemaBody.appendChild(schemaContent);
  modal.appendChild(schemaBody);

  const jsonBody = buildTabBody(false);
  const jsonContent = buildContentArea();
  jsonBody.appendChild(jsonContent);
  modal.appendChild(jsonBody);

  const statusBar = document.createElement('div');
  statusBar.className = 'marco-db-status-bar';
  statusBar.textContent = 'Loading tables…';
  modal.appendChild(statusBar);

  const existingTables: Array<{ name: string }> = [];
  let isSchemaLoaded = false;
  let isJsonLoaded = false;

  wireTabSwitching(
    tabBar, [dataBody, schemaBody, jsonBody],
    () => {
      if (!isSchemaLoaded) {
        isSchemaLoaded = true;
        buildSchemaTab(schemaContent, statusBar, existingTables);
      }
    },
    () => {
      if (!isJsonLoaded) {
        isJsonLoaded = true;
        buildJsonTab(jsonContent, statusBar);
      }
    },
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  loadTables(sidebar.tableList, content, statusBar, existingTables);
  log('Database browser modal opened', 'info');
}

// ── Builders ──

function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.onclick = (event) => {
    const isBackdropClick = event.target === overlay;
    if (isBackdropClick) {
      overlay.remove();
    }
  };
  return overlay;
}

function buildHeader(overlay: HTMLElement): HTMLElement {
  const header = document.createElement('div');
  header.className = 'marco-db-header';
  header.innerHTML = `<span class="marco-db-title">🗄️ Database Browser</span>`;

  const closeButton = document.createElement('button');
  closeButton.className = 'marco-db-close';
  closeButton.textContent = '✕';
  closeButton.onclick = () => overlay.remove();
  header.appendChild(closeButton);

  return header;
}

function buildTabBar(): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.className = 'marco-db-tab-bar';

  const dataTab = document.createElement('div');
  dataTab.className = 'marco-db-tab active';
  dataTab.textContent = '📊 Data';
  dataTab.dataset.tabIndex = '0';

  const schemaTab = document.createElement('div');
  schemaTab.className = 'marco-db-tab';
  schemaTab.textContent = '🏗️ Schema';
  schemaTab.dataset.tabIndex = '1';

  const jsonTab = document.createElement('div');
  jsonTab.className = 'marco-db-tab';
  jsonTab.textContent = '📝 Raw JSON';
  jsonTab.dataset.tabIndex = '2';

  tabBar.appendChild(dataTab);
  tabBar.appendChild(schemaTab);
  tabBar.appendChild(jsonTab);

  return tabBar;
}

// CQ16: Extracted from wireTabSwitching closure
function switchDbTab(tabs: HTMLElement[], bodies: HTMLElement[], index: number): void {
  tabs.forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index));
  bodies.forEach((body, bodyIndex) => { body.style.display = bodyIndex === index ? 'flex' : 'none'; });
}

function wireTabSwitching(
  tabBar: HTMLElement,
  bodies: HTMLElement[],
  onSchemaActivate: () => void,
  onJsonActivate: () => void,
): void {
  const tabs = Array.from(tabBar.children) as HTMLElement[];

  tabs[0].onclick = () => switchDbTab(tabs, bodies, 0);

  tabs[1].onclick = () => {
    switchDbTab(tabs, bodies, 1);
    onSchemaActivate();
  };

  tabs[2].onclick = () => {
    switchDbTab(tabs, bodies, 2);
    onJsonActivate();
  };
}

function buildTabBody(isVisible: boolean): HTMLElement {
  const body = document.createElement('div');
  body.className = 'marco-db-body';
  body.style.display = isVisible ? 'flex' : 'none';
  return body;
}

function buildSidebar(): { element: HTMLElement; tableList: HTMLElement } {
  const sidebar = document.createElement('div');
  sidebar.className = 'marco-db-sidebar';

  const title = document.createElement('div');
  title.className = 'marco-db-sidebar-title';
  title.textContent = 'Tables';
  sidebar.appendChild(title);

  const tableList = document.createElement('div');
  sidebar.appendChild(tableList);

  return { element: sidebar, tableList };
}

function buildContentArea(placeholderText?: string): HTMLElement {
  const content = document.createElement('div');
  content.className = 'marco-db-content';

  const hasPlaceholder = placeholderText !== undefined;

  if (hasPlaceholder) {
    const placeholder = document.createElement('div');
    placeholder.className = 'marco-db-empty';
    placeholder.textContent = placeholderText;
    content.appendChild(placeholder);
  }

  return content;
}
