/**
 * Marco Extension — React Options: Diagnostics Panel
 *
 * Boot phase, DB mode, boot timings, runtime info, live event log.
 * Auto-refreshes every 10 seconds with change highlighting.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPlatform } from "../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BootTiming {
    step: string;
    durationMs: number;
}

interface StatusData {
    bootStep: string;
    persistenceMode: string;
    totalBootMs: number;
    version: string;
    connection: string;
    loggingMode: string;
    config: { status: string; source: string };
    token: { status: string; expiresIn: string | null };
    bootTimings: BootTiming[];
}

interface TrackedMessage {
    type: string;
    timestamp: string;
    durationMs: number;
    ok: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DiagnosticsPanel() {
    const platform = getPlatform();
    const [data, setData] = useState<StatusData | null>(null);
    const [messages, setMessages] = useState<TrackedMessage[]>([]);
    const [isAutoRefresh, setIsAutoRefresh] = useState(true);
    const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
    const [copyLabel, setCopyLabel] = useState("📋 Copy Diagnostics Report");
    const prevSnapshot = useRef<Record<string, string>>({});
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, msgRes] = await Promise.all([
                platform.sendMessage<StatusData>({ type: "GET_STATUS" }),
                platform.sendMessage<{ messages?: TrackedMessage[] }>({ type: "GET_RECENT_MESSAGES", limit: 10 }),
            ]);

            // Detect changes
            if (statusRes) {
                const snap: Record<string, string> = {
                    bootStep: statusRes.bootStep,
                    persistenceMode: statusRes.persistenceMode,
                    connection: statusRes.connection,
                    loggingMode: statusRes.loggingMode,
                    configStatus: `${statusRes.config.status}:${statusRes.config.source}`,
                    tokenStatus: statusRes.token.status,
                    totalBootMs: String(statusRes.totalBootMs),
                };

                const changed = new Set<string>();
                for (const [k, v] of Object.entries(snap)) {
                    if (prevSnapshot.current[k] !== undefined && prevSnapshot.current[k] !== v) {
                        changed.add(k);
                    }
                }
                prevSnapshot.current = snap;
                setChangedKeys(changed);
            }

            setData(statusRes);
            setMessages(msgRes.messages ?? []);
        } catch {
            setData(null);
        }
    }, [platform]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!isAutoRefresh) return;

        // EXT-02: fully pause/resume polling based on page visibility
        const startPolling = () => {
            if (timerRef.current) return;
            timerRef.current = setInterval(() => void fetchData(), 10_000);
        };
        const stopPolling = () => {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        };
        const onVisChange = () => { document.hidden ? stopPolling() : startPolling(); };

        if (!document.hidden) startPolling();
        document.addEventListener("visibilitychange", onVisChange);
        return () => {
            stopPolling();
            document.removeEventListener("visibilitychange", onVisChange);
        };
    }, [isAutoRefresh, fetchData]);

    const handleCopy = useCallback(async () => {
        if (!data) return;
        const report = buildReport(data, messages);
        await navigator.clipboard.writeText(report);
        setCopyLabel("✅ Copied!");
        setTimeout(() => setCopyLabel("📋 Copy Diagnostics Report"), 2000);
    }, [data, messages]);

    const highlightClass = (key: string): string =>
        changedKeys.has(key) ? " diag-changed" : "";

    if (!data) {
        return (
            <>
                <div className="section-header">
                    <h2>🩺 Diagnostics</h2>
                    <p className="section-description">Service worker boot status and runtime diagnostics.</p>
                </div>
                <div className="diag-error-card">
                    <span className="diag-error-icon">🔴</span>
                    <div>
                        <strong>Unable to reach service worker</strong>
                        <p>The background process may have crashed or is still starting.</p>
                    </div>
                </div>
                <button className="btn btn-secondary" onClick={() => void fetchData()}>↻ Retry</button>
            </>
        );
    }

    const isFailed = data.bootStep.startsWith("failed:");
    const failureReason = isFailed ? data.bootStep.replace("failed:", "") : null;
    const bootIcon = isFailed ? "🔴" : data.bootStep === "ready" ? "🟢" : "🟡";
    const bootLabel = isFailed ? "Failed" : data.bootStep === "ready" ? "Ready" : data.bootStep;
    const dbLabels: Record<string, string> = {
        opfs: "OPFS (persistent)",
        storage: "chrome.storage (persistent)",
        memory: "In-memory (volatile)",
    };
    const dbIcon = data.persistenceMode === "memory" ? "⚠️" : "💾";

    return (
        <>
            <div className="section-header">
                <h2>🩺 Diagnostics</h2>
                <p className="section-description">
                    Service worker boot status and runtime diagnostics.
                    <span className="diag-auto-indicator">
                        {isAutoRefresh ? "🔄 Auto-refresh: ON (10s)" : "⏸ Auto-refresh: OFF"}
                    </span>
                </p>
            </div>

            {/* Status Grid */}
            <div className="diag-grid">
                <div className={`diag-card${highlightClass("bootStep")}`}>
                    <div className="diag-card-label">Boot Phase</div>
                    <div className="diag-card-value">
                        <span className="diag-status-dot">{bootIcon}</span>{bootLabel}
                    </div>
                </div>
                <div className={`diag-card${highlightClass("persistenceMode")}`}>
                    <div className="diag-card-label">DB Mode</div>
                    <div className="diag-card-value">
                        <span className="diag-status-dot">{dbIcon}</span>
                        {dbLabels[data.persistenceMode] ?? data.persistenceMode}
                    </div>
                </div>
                <div className={`diag-card${highlightClass("totalBootMs")}`}>
                    <div className="diag-card-label">Total Boot Time</div>
                    <div className="diag-card-value">⏱️ {data.totalBootMs} ms</div>
                </div>
                <div className="diag-card">
                    <div className="diag-card-label">Version</div>
                    <div className="diag-card-value">📦 {data.version}</div>
                </div>
            </div>

            {/* Failure Alert */}
            {isFailed && (
                <div className="diag-error-card">
                    <span className="diag-error-icon">🔴</span>
                    <div>
                        <strong>Boot failure at step: {failureReason}</strong>
                        <p>The service worker failed during initialization. Check the browser console.</p>
                    </div>
                </div>
            )}

            {/* Memory Warning */}
            {data.persistenceMode === "memory" && (
                <div className="diag-warn-card">
                    <span className="diag-error-icon">⚠️</span>
                    <div>
                        <strong>In-memory database</strong>
                        <p>Data will be lost when the service worker restarts.</p>
                    </div>
                </div>
            )}

            {/* Boot Timings */}
            <div className="diag-timings-section">
                <h3>Boot Step Timings</h3>
                <table className="diag-timings-table">
                    <thead>
                        <tr><th>Step</th><th>Duration</th><th>Relative</th></tr>
                    </thead>
                    <tbody>
                        {data.bootTimings.length > 0 ? (
                            data.bootTimings.map((t) => {
                                const barWidth = data.totalBootMs > 0
                                    ? Math.round((t.durationMs / data.totalBootMs) * 100)
                                    : 0;
                                return (
                                    <tr key={t.step}>
                                        <td className="diag-step-name">{t.step}</td>
                                        <td className="diag-step-duration">{t.durationMs} ms</td>
                                        <td className="diag-step-bar-cell">
                                            <div className="diag-step-bar" style={{ width: `${barWidth}%` }} />
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr><td colSpan={3} className="diag-no-data">No timing data available</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Runtime Info */}
            <div className="diag-meta-section">
                <h3>Runtime Info</h3>
                <table className="diag-meta-table">
                    <tbody>
                        <tr className={highlightClass("connection")}><td>Connection</td><td>{data.connection}</td></tr>
                        <tr className={highlightClass("loggingMode")}><td>Logging Mode</td><td>{data.loggingMode}</td></tr>
                        <tr className={highlightClass("configStatus")}><td>Config Status</td><td>{data.config.status} ({data.config.source})</td></tr>
                        <tr className={highlightClass("tokenStatus")}><td>Token Status</td><td>{data.token.status}</td></tr>
                    </tbody>
                </table>
            </div>

            {/* Live Event Log */}
            <div className="diag-eventlog-section">
                <h3>📡 Live Event Log {messages.length > 0 && <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "hsl(var(--foreground-secondary))" }}>(last {messages.length})</span>}</h3>
                {messages.length > 0 ? (
                    <table className="diag-eventlog-table">
                        <thead>
                            <tr><th>Time</th><th>Message Type</th><th>Duration</th><th>OK</th></tr>
                        </thead>
                        <tbody>
                            {messages.map((m, i) => {
                                const time = new Date(m.timestamp);
                                const timeStr = time.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
                                return (
                                    <tr key={i}>
                                        <td className="diag-msg-time">{timeStr}</td>
                                        <td className="diag-msg-type">{m.type}</td>
                                        <td>{m.durationMs} ms</td>
                                        <td className={m.ok ? "diag-msg-ok" : "diag-msg-fail"}>{m.ok ? "✓" : "✗"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="diag-eventlog-empty">No messages yet — waiting for activity…</div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="diag-button-row">
                <button className="btn btn-secondary" onClick={() => void fetchData()}>↻ Refresh</button>
                <button className="btn btn-secondary" onClick={() => void handleCopy()}>{copyLabel}</button>
                <button className="btn btn-secondary" onClick={() => setIsAutoRefresh((v) => !v)}>
                    {isAutoRefresh ? "⏸ Pause" : "▶ Resume"}
                </button>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Report Builder                                                     */
/* ------------------------------------------------------------------ */

function buildReport(data: StatusData, messages: TrackedMessage[]): string {
    const lines = [
        "=== Marco Diagnostics Report ===",
        `Generated: ${new Date().toISOString()}`,
        "",
        "── Boot ──",
        `Phase:       ${data.bootStep}`,
        `DB Mode:     ${data.persistenceMode}`,
        `Total Boot:  ${data.totalBootMs} ms`,
        "",
        "── Boot Step Timings ──",
        ...data.bootTimings.map((t) => `  ${t.step.padEnd(20)} ${String(t.durationMs).padStart(6)} ms`),
        "",
        "── Runtime ──",
        `Version:     ${data.version}`,
        `Connection:  ${data.connection}`,
        `Logging:     ${data.loggingMode}`,
        `Config:      ${data.config.status} (${data.config.source})`,
        `Token:       ${data.token.status}`,
        "",
        "── Recent Messages ──",
        ...messages.map((m) => `  ${m.timestamp}  ${m.type.padEnd(24)} ${String(m.durationMs).padStart(4)} ms  ${m.ok ? "OK" : "FAIL"}`),
        "",
        "=== End Report ===",
    ];
    return lines.join("\n");
}
