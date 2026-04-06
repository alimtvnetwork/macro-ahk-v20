/**
 * Marco Extension — React Popup: Debug Panel
 *
 * Shows last background response state per action.
 * Copy/clear buttons in the header.
 */

import { useCallback, useState } from "react";
import type { DebugEntry } from "../hooks/useDebugPanel";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEBUG_ACTIONS = ["Run", "Re-inject", "Logs", "Export"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

interface DebugPanelProps {
    entries: Map<string, DebugEntry>;
    isVisible: boolean;
    onClear: () => void;
}

export function DebugPanel({ entries, isVisible, onClear }: DebugPanelProps) {
    const [copyFlash, setCopyFlash] = useState(false);
    const [clearFlash, setClearFlash] = useState(false);

    const handleCopy = useCallback(async () => {
        const lines = DEBUG_ACTIONS.map((a) => {
            const entry = entries.get(a);
            if (!entry) return `${a}: —`;
            if (entry.error === null) return `${a}: OK (${formatTime(entry.timestamp)})`;
            return `${a}: ERROR "${entry.error}" (${formatTime(entry.timestamp)})`;
        });
        const text = `Marco Debug Panel — ${new Date().toISOString()}\n${lines.join("\n")}`;
        await navigator.clipboard.writeText(text);
        setCopyFlash(true);
        setTimeout(() => setCopyFlash(false), 1500);
    }, [entries]);

    const handleClear = useCallback(() => {
        onClear();
        setClearFlash(true);
        setTimeout(() => setClearFlash(false), 1500);
    }, [onClear]);

    if (!isVisible) {
        return null;
    }

    return (
        <div className="section debug-panel">
            <div className="section-title">
                🐛 Debug — Last Background Response{" "}
                <button
                    className="debug-copy-btn"
                    onClick={handleClear}
                    title="Clear debug entries"
                >
                    {clearFlash ? "✅" : "🗑️"}
                </button>
                <button
                    className="debug-copy-btn"
                    onClick={() => void handleCopy()}
                    title="Copy debug entries"
                >
                    {copyFlash ? "✅" : "📋"}
                </button>
            </div>
            {DEBUG_ACTIONS.map((action) => {
                const entry = entries.get(action);

                if (!entry) {
                    return (
                        <div key={action} className="debug-entry debug-pending">
                            <span className="debug-action">{action}</span>
                            <span className="debug-msg">—</span>
                        </div>
                    );
                }

                if (entry.error === null) {
                    return (
                        <div key={action} className="debug-entry debug-ok">
                            <span className="debug-action">{action}</span>
                            <span className="debug-msg">✅ OK</span>
                            <span className="debug-time">{formatTime(entry.timestamp)}</span>
                        </div>
                    );
                }

                return (
                    <div key={action} className="debug-entry debug-err">
                        <span className="debug-action">{action}</span>
                        <span className="debug-msg">{entry.error}</span>
                        <span className="debug-time">{formatTime(entry.timestamp)}</span>
                    </div>
                );
            })}
        </div>
    );
}
