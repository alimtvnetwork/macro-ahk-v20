/**
 * Marco Extension — React Options: Injection Variables Editor
 *
 * Features:
 * - Tree view (collapsible JSON explorer)
 * - Raw JSON view with syntax highlighting + formatter (via MonacoCodeEditor)
 */

import type { JsonValue } from "@/background/handlers/handler-types";
import { useState, useCallback, useMemo } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MonacoCodeEditor } from "@/components/options/LazyMonacoCodeEditor";

interface VariablesEditorProps {
    json: string;
    onChange: (json: string) => void;
}

type ViewMode = "tree" | "raw";

/* ------------------------------------------------------------------ */
/*  Tree View                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function JsonTreeNode({ label, value, depth = 0 }: { label: string; value: JsonValue; depth?: number }) {
    const [expanded, setExpanded] = useState(depth < 2);
    const isObject = value !== null && typeof value === "object";
    const entries = isObject ? Object.entries(value as Record<string, unknown>) : [];
    const isArray = Array.isArray(value);
    const bracketOpen = isArray ? "[" : "{";
    const bracketClose = isArray ? "]" : "}";

    if (!isObject) {
        return (
            <div className="json-tree-leaf" style={{ paddingLeft: depth * 16 }}>
                <span className="json-tree-key">{label}</span>
                <span className="json-tree-colon">: </span>
                <span className={`json-tree-value json-tree-${typeof value}`}>
                    {typeof value === "string" ? `"${value}"` : String(value)}
                </span>
            </div>
        );
    }

    return (
        <div style={{ paddingLeft: depth * 16 }}>
            <button
                className="json-tree-toggle"
                onClick={() => setExpanded(!expanded)}
                type="button"
            >
                <span className="json-tree-arrow">{expanded ? "▼" : "▶"}</span>
                <span className="json-tree-key">{label}</span>
                <span className="json-tree-bracket">
                    {" "}{bracketOpen}{!expanded && <span className="json-tree-ellipsis">…{bracketClose}</span>}
                </span>
                {!expanded && (
                    <span className="json-tree-count"> {entries.length} items</span>
                )}
            </button>
            {expanded && (
                <>
                    {entries.map(([key, val]) => (
                        <JsonTreeNode
                            key={key}
                            label={isArray ? `[${key}]` : key}
                            value={val as JsonValue}
                            depth={depth + 1}
                        />
                    ))}
                    <div style={{ paddingLeft: 0 }}>
                        <span className="json-tree-bracket">{bracketClose}</span>
                    </div>
                </>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Editor Component                                              */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function VariablesEditor({ json, onChange }: VariablesEditorProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("raw");

    const parsedJson = useMemo(() => {
        try {
            return JSON.parse(json || "{}");
        } catch {
            return null;
        }
    }, [json]);

    const handleEditorChange = useCallback((value: string) => {
        onChange(value);
    }, [onChange]);

    return (
        <>
            <h2 className="section-heading">{"{}"} INJECTION VARIABLES</h2>
            <div className="variables-editor-wrap">
                {/* View mode toggle */}
                <div className="json-view-toggle">
                    <button
                        className={`json-view-btn${viewMode === "tree" ? " json-view-btn-active" : ""}`}
                        onClick={() => setViewMode("tree")}
                        type="button"
                    >
                        {"{}"} Tree
                    </button>
                    <button
                        className={`json-view-btn${viewMode === "raw" ? " json-view-btn-active" : ""}`}
                        onClick={() => setViewMode("raw")}
                        type="button"
                    >
                        {"<>"} Raw JSON
                    </button>
                </div>

                {viewMode === "raw" ? (
                    <ErrorBoundary section="Variables JSON Editor">
                        <MonacoCodeEditor
                            language="json"
                            value={json}
                            onChange={handleEditorChange}
                            height="240px"
                        />
                    </ErrorBoundary>
                ) : (
                    <div className="json-tree-container">
                        {parsedJson ? (
                            <JsonTreeNode label="root" value={parsedJson} />
                        ) : (
                            <div className="json-tree-error">
                                ⚠ Invalid JSON — switch to Raw JSON to fix
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
