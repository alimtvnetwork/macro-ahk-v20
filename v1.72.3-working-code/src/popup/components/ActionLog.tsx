/**
 * Marco Extension — React Popup: Action Log Panel
 *
 * Shows timestamped, color-coded action entries (last 8).
 */

import type { ActionLogEntry } from "../hooks/useActionLog";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStatusIcon(status: ActionLogEntry["status"]): string {
    if (status === "success") return "✅";
    if (status === "error") return "❌";
    return "ℹ️";
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ActionLogProps {
    entries: ActionLogEntry[];
}

export function ActionLog({ entries }: ActionLogProps) {
    const hasEntries = entries.length > 0;

    return (
        <div className="section action-status-panel">
            <div className="section-title">🎯 Action Log</div>
            <div className="action-log">
                {hasEntries ? (
                    entries.map((entry, i) => (
                        <div key={i} className={`action-log-entry action-log-${entry.status}`}>
                            <span className="action-log-icon">{getStatusIcon(entry.status)}</span>
                            <span className="action-log-action">{entry.action}</span>
                            <span className="action-log-detail">{entry.detail}</span>
                            <span className="action-log-time">{formatTime(entry.timestamp)}</span>
                        </div>
                    ))
                ) : (
                    <div className="action-log-empty">No actions performed yet</div>
                )}
            </div>
        </div>
    );
}
