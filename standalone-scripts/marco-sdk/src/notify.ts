/**
 * Riseup Macro SDK — Notify Module
 *
 * Non-blocking, dismissible toast notification system available to all
 * injected scripts via `marco.notify`.
 *
 * Features:
 * - Stacking (max 3 visible), oldest auto-dismissed on overflow
 * - 5s deduplication window prevents toast storms
 * - Copy button with version + timestamp
 * - Error toasts: 30s; normal: 12s auto-dismiss
 * - Recent-errors store for diagnostic panels
 *
 * See: spec/17-app-issues/85-sdk-notifier-config-seeding-database-overhaul.md
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ToastLevel = "info" | "warn" | "error" | "success";

export interface RequestDetail {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
}

export interface ToastOpts {
    /** Stack trace string */
    stack?: string;
    /** If true, don't trigger the onError stop-loop callback */
    noStop?: boolean;
    /** HTTP request detail for copy payload */
    requestDetail?: RequestDetail;
    /** Override auto-dismiss duration (ms) */
    duration?: number;
}

export interface RecentError {
    timestamp: string;
    level: string;
    message: string;
    stack?: string;
    requestDetail?: RequestDetail;
}

type ErrorCallback = (error: RecentError) => void;
type StopLoopCallback = () => void;

export interface NotifyApi {
    toast(message: string, level?: ToastLevel, opts?: ToastOpts): void;
    /** Convenience: show info toast */
    info(message: string, opts?: ToastOpts): void;
    /** Convenience: show success toast */
    success(message: string, opts?: ToastOpts): void;
    /** Convenience: show warning toast */
    warning(message: string, opts?: ToastOpts): void;
    /** Convenience: show error toast */
    error(message: string, opts?: ToastOpts): void;
    dismissAll(): void;
    onError(callback: ErrorCallback): void;
    getRecentErrors(): RecentError[];
    /** Internal: allows macro-controller to register its stop-loop fn */
    _setStopLoopCallback(fn: StopLoopCallback): void;
    /** Internal: set version string shown in toasts */
    _setVersion(v: string): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CONTAINER_ID = "marco-toast-container";
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 12000;
const ERROR_DISMISS_MS = 30000;
const DEDUP_MS = 5000;
const RECENT_MAX = 50;

/* ------------------------------------------------------------------ */
/*  Module state                                                       */
/* ------------------------------------------------------------------ */

let _version = "2.02.0";
let _stopLoopFn: StopLoopCallback | null = null;
let _errorStopTriggered = false;

const _queue: Array<HTMLElement & { _dismissed?: boolean; _dismissTimer?: ReturnType<typeof setTimeout> }> = [];
const _recentErrors: RecentError[] = [];
const _errorListeners: ErrorCallback[] = [];
const _recentToasts = new Map<string, number>();
let _dedupTimer: ReturnType<typeof setInterval> | null = null;

/* ------------------------------------------------------------------ */
/*  Default theme colors (overridable via window.__MARCO_THEME__)      */
/* ------------------------------------------------------------------ */

interface ToastColors { bg: string; border: string; icon: string; text: string; }

function resolveColors(): Record<string, ToastColors> {
    let errorBg = "#3a1014", errorPale = "#fecaca";
    let warningBg = "#33260f", warningBorder = "#f59e0b", warningText = "#fde68a"; // eslint-disable-line prefer-const
    let infoBg = "#0f172a", infoBorder = "#38bdf8", infoText = "#dbeafe";
    let successBg = "#052e1a", successBorder = "#22c55e"; const successText = "#bbf7d0";
    let errorBorder = "#ef4444";

    try {
        interface ThemeStatusColors { errorBg?: string; errorPale?: string; warningBg?: string; successBg?: string }
        interface ThemeToastGroup { bg?: string; border?: string; text?: string }
        interface ThemeColors { warning?: string; success?: string; error?: string; status?: ThemeStatusColors; toast?: { info?: ThemeToastGroup } }
        interface ThemePreset { colors?: ThemeColors }
        interface ThemeRoot { presets?: Record<string, ThemePreset>; activePreset?: string; colors?: ThemeColors }

        const themeRoot = ((window as unknown as Record<string, unknown>).__MARCO_THEME__ || {}) as ThemeRoot;
        const presets = themeRoot.presets || {};
        const activeKey = themeRoot.activePreset || "dark";
        const theme: ThemePreset = presets.dark || presets[activeKey] || {};
        const TC = theme.colors || {};
        const TSt = TC.status || {};
        const TToast = TC.toast || {};
        if (TSt.errorBg) errorBg = TSt.errorBg;
        if (TSt.errorPale) errorPale = TSt.errorPale;
        if (TSt.warningBg) warningBg = TSt.warningBg;
        if (TC.warning) warningBorder = TC.warning;
        if (TSt.successBg) successBg = TSt.successBg;
        if (TC.success) successBorder = TC.success;
        if (TC.error) errorBorder = TC.error;
        if (TToast.info) {
            if (TToast.info.bg) infoBg = TToast.info.bg;
            if (TToast.info.border) infoBorder = TToast.info.border;
            if (TToast.info.text) infoText = TToast.info.text;
        }
    } catch { /* fallback defaults */ }

    return {
        error:   { bg: errorBg,   border: errorBorder,   icon: "\u274C", text: errorPale },
        warn:    { bg: warningBg,  border: warningBorder, icon: "\u26A0\uFE0F", text: warningText },
        info:    { bg: infoBg,     border: infoBorder,    icon: "\u2139\uFE0F", text: infoText },
        success: { bg: successBg,  border: successBorder, icon: "\u2705", text: successText },
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRequestDetail(rd: RequestDetail): string {
    const lines: string[] = [];
    if (rd.method || rd.url) lines.push("Request: " + (rd.method || "?") + " " + (rd.url || "?"));
    if (rd.headers) {
        for (const k of Object.keys(rd.headers)) {
            const val = k.toLowerCase() === "authorization"
                ? rd.headers[k].substring(0, 20) + "...REDACTED"
                : rd.headers[k];
            lines.push("  " + k + ": " + val);
        }
    }
    if (rd.body) lines.push("Body: " + rd.body.substring(0, 500));
    if (rd.status != null) lines.push("Response: HTTP " + rd.status + (rd.statusText ? " " + rd.statusText : ""));
    if (rd.responseBody) lines.push("Response Body: " + rd.responseBody.substring(0, 500));
    return lines.join("\n");
}

function nowTimeStr(): string {
    return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ensureDedupCleanup(): void {
    if (_dedupTimer) return;
    _dedupTimer = setInterval(() => {
        const now = Date.now();
        _recentToasts.forEach((ts, key) => { if (now - ts > DEDUP_MS * 2) _recentToasts.delete(key); });
        if (_recentToasts.size === 0 && _dedupTimer) { clearInterval(_dedupTimer); _dedupTimer = null; }
    }, 30000);
}

function pushRecentError(entry: RecentError): void {
    _recentErrors.unshift(entry);
    if (_recentErrors.length > RECENT_MAX) _recentErrors.pop();
    for (const cb of _errorListeners) { try { cb(entry); } catch { /* */ } }
}

function getOrCreateContainer(): HTMLElement {
    let el = document.getElementById(CONTAINER_ID);

    // Container may have been removed by SPA navigation — re-create if orphaned
    if (el && !el.isConnected) {
        el = null;
    }

    if (!el) {
        el = document.createElement("div");
        el.id = CONTAINER_ID;
        el.style.cssText = "position:fixed;top:12px;right:12px;z-index:99999;display:flex;flex-direction:column;gap:6px;max-width:400px;pointer-events:none;";

        // Defensive: wait for document.body if not yet available
        const target = document.body || document.documentElement;
        target.appendChild(el);
    }
    return el;
}

/* ------------------------------------------------------------------ */
/*  Dismiss                                                            */
/* ------------------------------------------------------------------ */

function dismissToast(toast: HTMLElement & { _dismissed?: boolean; _dismissTimer?: ReturnType<typeof setTimeout> }): void {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    if (toast._dismissTimer) clearTimeout(toast._dismissTimer);

    const idx = _queue.indexOf(toast);
    if (idx !== -1) _queue.splice(idx, 1);

    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
}

function dismissAll(): void {
    const snapshot = _queue.slice();
    for (const t of snapshot) dismissToast(t);
}

/* ------------------------------------------------------------------ */
/*  Show toast                                                         */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function showToast(message: string, level: ToastLevel = "error", opts: ToastOpts = {}): void {
    // Guard: defer if DOM not ready yet
    if (!document.body && !document.documentElement) {
        setTimeout(() => showToast(message, level, opts), 50);
        return;
    }
    // Dedup
    const dedupKey = level + ":" + message;
    const last = _recentToasts.get(dedupKey) || 0;
    if (Date.now() - last < DEDUP_MS) return;
    _recentToasts.set(dedupKey, Date.now());
    ensureDedupCleanup();

    const timeStr = nowTimeStr();
    const colors = resolveColors();
    const c = colors[level] || colors.error;

    const container = getOrCreateContainer();

    // Build toast element
    const toast = document.createElement("div") as HTMLDivElement & { _dismissed?: boolean; _dismissTimer?: ReturnType<typeof setTimeout> };
    toast.style.cssText = "display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;font-family:monospace;font-size:11px;color:" + c.text + ";background:" + c.bg + ";border:1px solid " + c.border + ";box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:auto;opacity:0;transform:translateX(20px);transition:all 0.3s ease;position:relative;";

    // Icon
    const iconSpan = document.createElement("span");
    iconSpan.style.cssText = "font-size:14px;flex-shrink:0;line-height:1;";
    iconSpan.textContent = c.icon;

    // Body
    const bodyDiv = document.createElement("div");
    bodyDiv.style.cssText = "flex:1;min-width:0;";

    const msgDiv = document.createElement("div");
    msgDiv.style.cssText = "word-break:break-word;padding-right:40px;";
    msgDiv.textContent = message;

    const timeDiv = document.createElement("div");
    timeDiv.style.cssText = "font-size:9px;opacity:0.6;margin-top:2px;";
    timeDiv.textContent = "v" + _version + " @ " + timeStr;

    bodyDiv.appendChild(msgDiv);
    bodyDiv.appendChild(timeDiv);

    // Actions (copy + close)
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = "position:absolute;top:6px;right:6px;display:flex;gap:4px;align-items:center;";

    const copyBtn = document.createElement("button");
    copyBtn.style.cssText = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:" + c.text + ";font-size:10px;padding:2px 6px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;line-height:1.2;";
    copyBtn.textContent = "\uD83D\uDCCB";
    copyBtn.title = "Copy details";
    copyBtn.onmouseenter = () => { copyBtn.style.opacity = "1"; };
    copyBtn.onmouseleave = () => { copyBtn.style.opacity = "0.7"; };
    copyBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        let copyText = "[v" + _version + " " + level.toUpperCase() + " @ " + timeStr + "]\n" + message;
        if (opts.requestDetail) copyText += "\n\n" + formatRequestDetail(opts.requestDetail);
        if (opts.stack) copyText += "\n\nStack:\n" + opts.stack;
        navigator.clipboard.writeText(copyText).then(
            () => { copyBtn.textContent = "\u2713"; setTimeout(() => { copyBtn.textContent = "\uD83D\uDCCB"; }, 1500); },
            () => { /* fallback */ const ta = document.createElement("textarea"); ta.value = copyText; ta.style.cssText = "position:fixed;opacity:0;"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); copyBtn.textContent = "\u2713"; } catch { /* */ } document.body.removeChild(ta); setTimeout(() => { copyBtn.textContent = "\uD83D\uDCCB"; }, 1500); },
        );
    };

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:" + c.text + ";font-size:12px;padding:1px 5px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;line-height:1.2;font-weight:bold;";
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Dismiss";
    closeBtn.onmouseenter = () => { closeBtn.style.opacity = "1"; };
    closeBtn.onmouseleave = () => { closeBtn.style.opacity = "0.7"; };
    closeBtn.onclick = (e: MouseEvent) => { e.stopPropagation(); dismissToast(toast); };

    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(closeBtn);

    toast.appendChild(iconSpan);
    toast.appendChild(bodyDiv);
    toast.appendChild(actionsDiv);

    container.appendChild(toast);
    _queue.push(toast);

    // Animate in
    requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(0)"; });

    // Overflow — dismiss oldest
    const overflow = _queue.length - MAX_VISIBLE;
    for (let i = 0; i < overflow; i++) { const oldest = _queue[0]; if (oldest) dismissToast(oldest); }

    // Auto-dismiss
    const ms = opts.duration ?? (level === "error" ? ERROR_DISMISS_MS : AUTO_DISMISS_MS);
    toast._dismissTimer = setTimeout(() => dismissToast(toast), ms);

    // Error-level: trigger stop-loop callback
    if (level === "error" && !_errorStopTriggered && !opts.noStop && _stopLoopFn) {
        _errorStopTriggered = true;
        try { _stopLoopFn(); } catch { /* */ }
        setTimeout(() => { _errorStopTriggered = false; }, 5000);
    }

    // Push to recent errors store
    if (level === "error" || level === "warn") {
        pushRecentError({ timestamp: timeStr, level, message, stack: opts.stack, requestDetail: opts.requestDetail });
    }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function createNotifyApi(): NotifyApi {
    return {
        toast: showToast,
        info(message: string, opts?: ToastOpts) { showToast(message, "info", opts); },
        success(message: string, opts?: ToastOpts) { showToast(message, "success", opts); },
        warning(message: string, opts?: ToastOpts) { showToast(message, "warn", opts); },
        error(message: string, opts?: ToastOpts) { showToast(message, "error", opts); },
        dismissAll,
        onError(callback: ErrorCallback) { _errorListeners.push(callback); },
        getRecentErrors() { return _recentErrors.slice(); },
        _setStopLoopCallback(fn: StopLoopCallback) { _stopLoopFn = fn; },
        _setVersion(v: string) { _version = v; },
    };
}
