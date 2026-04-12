
const ATTR_DATA_SKELETON = 'data-skeleton';
/**
 * Skeleton UI — Shimmer loading placeholders for macro controller panel.
 *
 * Renders animated placeholder bars that mimic the shape of real content
 * while data loads in the background. Replaced with real content when
 * updateUI() hydrates the panel.
 *
 * Ref: .lovable/fixes/macro-controller-toast-crash-and-slow-startup.md
 * Ref: .lovable/memory/features/macro-controller/startup-initialization.md
 */


// ============================================
// CSS Keyframes (injected once)
// ============================================

// CQ11: Singleton for shimmer injection guard
class ShimmerState {
  private _injected = false;

  get injected(): boolean {
    return this._injected;
  }

  set injected(v: boolean) {
    this._injected = v;
  }
}

const shimmerState = new ShimmerState();

/** Inject the shimmer keyframe animation into <head> (idempotent). */
export function injectSkeletonStyles(): void {
  if (shimmerState.injected) {
    return;
  }
  shimmerState.injected = true;

  const style = document.createElement('style');
  style.id = 'marco-skeleton-styles';
  style.textContent = [
    '@keyframes marcoShimmer{',
    '  0%{background-position:-200px 0}',
    '  100%{background-position:calc(200px + 100%) 0}',
    '}',
    '.marco-skeleton{',
    '  background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);',
    '  background-size:200px 100%;',
    '  animation:marcoShimmer 1.5s ease-in-out infinite;',
    '  border-radius:4px;',
    '}',
  ].join('');
  document.head.appendChild(style);
}

// ============================================
// Skeleton element factory
// ============================================

interface SkeletonBarOpts {
  width?: string;
  height?: string;
  marginTop?: string;
  marginBottom?: string;
  borderRadius?: string;
  display?: string;
}

/** Create a single shimmer bar element. */
export function createSkeletonBar(opts?: SkeletonBarOpts): HTMLElement {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'marco-skeleton';
  el.style.cssText = [
    'width:' + (opts.width || '100%'),
    'height:' + (opts.height || '12px'),
    'border-radius:' + (opts.borderRadius || '4px'),
    opts.marginTop ? 'margin-top:' + opts.marginTop : '',
    opts.marginBottom ? 'margin-bottom:' + opts.marginBottom : '',
    opts.display ? 'display:' + opts.display : '',
  ].filter(Boolean).join(';') + ';';
  return el;
}

// ============================================
// Composite skeleton layouts
// ============================================

/**
 * Status bar skeleton — mimics the stopped status layout:
 * [workspace name bar] [status text bar]
 * [credit bar placeholder]
 */
export function createStatusSkeleton(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute(ATTR_DATA_SKELETON, 'status');
  wrap.style.cssText = 'padding:2px 0;';

  // Line 1: workspace + status text
  const row1 = document.createElement('div');
  row1.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
  row1.appendChild(createSkeletonBar({ width: '90px', height: '10px' }));
  row1.appendChild(createSkeletonBar({ width: '140px', height: '10px' }));
  row1.appendChild(createSkeletonBar({ width: '60px', height: '10px' }));
  wrap.appendChild(row1);

  // Line 2: credit bar (segmented — mimics the real stacked bar)
  const creditRow = document.createElement('div');
  creditRow.style.cssText = 'display:flex;gap:2px;margin-bottom:4px;';
  creditRow.appendChild(createSkeletonBar({ width: '35%', height: '8px', borderRadius: '4px 0 0 4px' }));
  creditRow.appendChild(createSkeletonBar({ width: '25%', height: '8px', borderRadius: '0' }));
  creditRow.appendChild(createSkeletonBar({ width: '20%', height: '8px', borderRadius: '0' }));
  creditRow.appendChild(createSkeletonBar({ width: '20%', height: '8px', borderRadius: '0 4px 4px 0' }));
  wrap.appendChild(creditRow);

  // Line 3: credit label row
  const row3 = document.createElement('div');
  row3.style.cssText = 'display:flex;align-items:center;gap:12px;';
  row3.appendChild(createSkeletonBar({ width: '50px', height: '8px' }));
  row3.appendChild(createSkeletonBar({ width: '70px', height: '8px' }));
  row3.appendChild(createSkeletonBar({ width: '45px', height: '8px' }));
  wrap.appendChild(row3);

  return wrap;
}

/**
 * Workspace dropdown skeleton — mimics 3 workspace rows.
 */
export function createWorkspaceListSkeleton(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute(ATTR_DATA_SKELETON, 'ws-list');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px;';

  for (let i = 0; i < 3; i++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.appendChild(createSkeletonBar({ width: '120px', height: '10px' }));
    row.appendChild(createSkeletonBar({ width: '60px', height: '8px' }));
    row.appendChild(createSkeletonBar({ width: '40px', height: '8px' }));
    wrap.appendChild(row);
  }

  return wrap;
}

/**
 * Prompts dropdown skeleton — mimics 4 prompt items with category + title.
 */
export function createPromptsListSkeleton(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute(ATTR_DATA_SKELETON, 'prompts-list');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px 12px;';

  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
    // Category tag
    row.appendChild(createSkeletonBar({ width: '48px', height: '14px', borderRadius: '8px' }));
    // Prompt title
    const titleW = [140, 110, 160, 90][i] + 'px';
    row.appendChild(createSkeletonBar({ width: titleW, height: '10px' }));
    wrap.appendChild(row);
  }

  return wrap;
}

/**
 * Remove all skeleton placeholders from a parent element.
 */
export function clearSkeletons(parent: HTMLElement): void {
  const skeletons = parent.querySelectorAll('[data-skeleton]');

  for (const skeleton of skeletons) {
    skeleton.remove();
  }
}
