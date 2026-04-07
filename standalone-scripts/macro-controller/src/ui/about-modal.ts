/**
 * About Modal — Uses renderTemplate() for HTML structure
 *
 * Template source: standalone-scripts/macro-controller/templates/about-modal.html
 * Compiled to: standalone-scripts/macro-controller/dist/templates.json
 * Spec: spec/12-devtools-and-injection/standalone-script-assets.md §5
 */

import { log } from '../logging';
import { renderTemplate, hasTemplate, renderRawTemplate } from './template-renderer';

import { VERSION, cPanelText, cPrimaryBgAL, cPrimaryBgAS, cPrimaryLight, cPrimaryLighter, lAboutGradient, lModalRadius, lModalShadow, tFontSystem } from '../shared-state';

// ── Fallback inline template (used if templates.json not loaded) ──
const FALLBACK_TEMPLATE = `
<div class="marco-modal marco-about-modal">
  <div class="marco-about-header">
    <div class="marco-about-title">⚡ {{title}}</div>
    <span class="marco-about-close" data-action="close">✕</span>
  </div>
  <div class="marco-about-version-badge">v{{version}}</div>
  <p class="marco-about-description">{{description}}</p>
  <div class="marco-about-divider"></div>
  <div class="marco-about-author-label">Created by</div>
  <div class="marco-about-author-row">
    <div class="marco-about-avatar">{{authorInitials}}</div>
    <div class="marco-about-author-info">
      <div class="marco-about-author-name">{{authorName}}</div>
      <div class="marco-about-author-title">{{authorTitle}}</div>
    </div>
  </div>
  <p class="marco-about-author-bio">{{authorBio}}</p>
  <div class="marco-about-links">
    {{#each links}}
      <a class="marco-about-link" href="{{this.url}}" target="_blank" rel="noopener noreferrer">{{this.label}}</a>
    {{/each}}
  </div>
  <div class="marco-about-footer">© {{year}} {{authorName}}</div>
</div>
`.trim();

// ── Template Data ──

function getAboutData() {
  return {
    title: 'TS Macro Controller',
    version: VERSION,
    description: 'Browser automation & credit management tool for workspace orchestration. Automatically monitors credits, rotates projects across workspaces, and provides real-time diagnostics.',
    authorInitials: 'AK',
    authorName: 'Md. Alim Ul Karim',
    authorTitle: 'Chief Software Engineer — Riseup Asia',
    authorBio: '20+ years of software engineering experience. Former Software Architect at Crossover.com (Top 1% Developer worldwide). Known for inventing an automatic unit test generation tool in 2018 — before AI — capable of writing code and unit tests automatically. Built this tool to help developers work more effectively with automated credit management and workspace orchestration.',
    year: new Date().getFullYear(),
    links: [
      { label: '🔗 alimkarim.com', url: 'https://alimkarim.com' },
      { label: '🚀 Riseup Asia', url: 'https://riseup-asia.com' },
      { label: '💼 LinkedIn', url: 'https://linkedin.com/in/alimkarim' },
    ],
  };
}

// ── Inline styles (applied via CSS classes → style injection) ──

function injectAboutStyles(): void {
  if (document.getElementById('marco-about-styles')) return;

  const style = document.createElement('style');
  style.id = 'marco-about-styles';
  style.textContent = _aboutModalStyles() + _aboutHeaderStyles() + _aboutAuthorStyles() + _aboutFooterStyles();
  document.head.appendChild(style);
}

function _aboutModalStyles(): string {
  return `
    .marco-about-modal {
      background: ${lAboutGradient};
      border: 1px solid ${cPrimaryBgAL};
      border-radius: ${lModalRadius};
      padding: 32px;
      max-width: 420px;
      width: 90%;
      color: ${cPanelText};
      font-family: ${tFontSystem};
      box-shadow: ${lModalShadow};
    }
    .marco-about-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .marco-about-title {
      font-size: 18px;
      font-weight: 700;
      color: ${cPrimaryLighter};
      letter-spacing: -0.3px;
    }
    .marco-about-close {
      font-size: 18px;
      color: #64748b;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .marco-about-close:hover {
      color: #e2e8f0;
      background: rgba(255,255,255,0.1);
    }
  `;
}

function _aboutHeaderStyles(): string {
  return `
    .marco-about-version-badge {
      display: inline-block;
      background: ${cPrimaryBgAS};
      border: 1px solid ${cPrimaryBgAL};
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 11px;
      color: ${cPrimaryLight};
      font-weight: 600;
      margin-bottom: 16px;
      font-family: monospace;
    }
    .marco-about-description {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 20px 0;
    }
    .marco-about-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(167,139,250,0.3), transparent);
      margin: 16px 0;
    }
    .marco-about-author-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 10px;
    }
  `;
}

function _aboutAuthorStyles(): string {
  return `
    .marco-about-author-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .marco-about-avatar {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #8b5cf6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
    }
    .marco-about-author-name {
      font-size: 15px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .marco-about-author-title {
      font-size: 11px;
      color: ${cPrimaryLight};
      font-weight: 500;
      margin-top: 2px;
    }
    .marco-about-author-bio {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
      margin: 0 0 16px 0;
    }
  `;
}

function _aboutFooterStyles(): string {
  return `
    .marco-about-links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .marco-about-link {
      font-size: 11px;
      color: ${cPrimaryLight};
      text-decoration: none;
      padding: 5px 12px;
      border: 1px solid ${cPrimaryBgAS};
      border-radius: 8px;
      transition: all 0.15s;
      display: inline-block;
    }
    .marco-about-link:hover {
      background: rgba(167,139,250,0.1);
      border-color: rgba(167,139,250,0.5);
    }
    .marco-about-footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid rgba(100,116,139,0.2);
      font-size: 10px;
      color: #475569;
      text-align: center;
    }
  `;
}

/**
 * Toggle the About modal overlay.
 */
export function showAboutModal(): void {
  // Remove existing if open
  const existing = document.getElementById('macroloop-about-modal');
  if (existing) { existing.remove(); return; }

  // Inject scoped styles
  injectAboutStyles();

  // Render template
  const data = getAboutData();
  let html: string;
  if (hasTemplate('about-modal')) {
    html = renderTemplate('about-modal', data);
  } else {
    html = renderRawTemplate(FALLBACK_TEMPLATE, data);
    log('[AboutModal] Using fallback inline template (templates.json not loaded)', 'debug');
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'macroloop-about-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.onclick = function(e: Event) { if (e.target === overlay) overlay.remove(); };

  // Inject rendered HTML
  const container = document.createElement('div');
  container.innerHTML = html;
  const modal = container.firstElementChild as HTMLElement;
  if (modal) {
    modal.classList.add('marco-enter');

    // Bind close button
    const closeBtn = modal.querySelector('[data-action="close"]');
    if (closeBtn) {
      (closeBtn as HTMLElement).onclick = function() { overlay.remove(); };
    }

    overlay.appendChild(modal);
  }

  document.body.appendChild(overlay);
  log('About modal opened (template-rendered)', 'info');
}
