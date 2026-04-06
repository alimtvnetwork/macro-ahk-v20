/**
 * Marco Extension — React Options: Scripts & Configs Editor
 *
 * Grouped rows: [JSON Config (optional)] → [Script.js]
 */

import { useState, useEffect, useCallback } from "react";
import { getPlatform } from "../../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScriptRow {
    scriptId: string;
    scriptName: string;
    scriptCode: string;
    order: number;
    runAt: "document_start" | "document_idle" | "document_end";
    isEnabled: boolean;
    configId: string;
    configName: string;
    configJson: string;
}

interface ScriptsConfigEditorProps {
    projectScripts: { path: string; order: number; configBinding?: string }[];
    onChange: (rows: ScriptRow[]) => void;
}

/* ------------------------------------------------------------------ */
/*  RunAt helpers                                                       */
/* ------------------------------------------------------------------ */

const RUN_AT_OPTIONS = [
    {
        value: "document_start",
        label: "Start",
        description: "Runs before the DOM is parsed. Use for blocking scripts, early overrides, or intercepting network requests.",
    },
    {
        value: "document_idle",
        label: "Idle",
        description: "Runs after the DOM is fully parsed and initial scripts have executed. Best default for most scripts.",
    },
    {
        value: "document_end",
        label: "End",
        description: "Runs after the page and all resources are fully loaded. Use for post-load cleanup or analytics.",
    },
];

function getRunAtLabel(value: string): string {
    return RUN_AT_OPTIONS.find((o) => o.value === value)?.label ?? "Idle";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScriptsConfigEditor({ projectScripts, onChange }: ScriptsConfigEditorProps) {
    const platform = getPlatform();
    const [rows, setRows] = useState<ScriptRow[]>([]);
    const [allScripts, setAllScripts] = useState<Array<{ id: string; name: string; code: string; runAt?: string; isEnabled?: boolean; configBinding?: string }>>([]);
    const [allConfigs, setAllConfigs] = useState<Array<{ id: string; name: string; json: string }>>([]);

    // Load scripts and configs
    useEffect(() => {
        void (async () => {
            const [scriptsRes, configsRes] = await Promise.all([
                platform.sendMessage<{ scripts: Array<{ id: string; name: string; code: string; runAt?: string; isEnabled?: boolean; configBinding?: string }> }>({ type: "GET_ALL_SCRIPTS" }),
                platform.sendMessage<{ configs: Array<{ id: string; name: string; json: string }> }>({ type: "GET_ALL_CONFIGS" }),
            ]);
            const scripts = scriptsRes.scripts ?? [];
            const configs = configsRes.configs ?? [];
            setAllScripts(scripts);
            setAllConfigs(configs);

            // Build rows from project scripts
            const built = projectScripts.map((entry, index) => {
                const script = scripts.find((s) => s.name === entry.path);
                const config = entry.configBinding
                    ? configs.find((c) => c.id === entry.configBinding || c.name === entry.configBinding)
                    : undefined;

                return {
                    scriptId: script?.id ?? "",
                    scriptName: entry.path,
                    scriptCode: script?.code ?? "",
                    order: entry.order ?? index,
                    runAt: script?.runAt ?? "document_idle",
                    isEnabled: script?.isEnabled ?? true,
                    configId: config?.id ?? "",
                    configName: config?.name ?? "",
                    configJson: config?.json ?? "",
                } as ScriptRow;
            });

            setRows(built);
            onChange(built);
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const updateRow = useCallback((index: number, patch: Partial<ScriptRow>) => {
        setRows((prev) => {
            const updated = prev.map((r, i) => i === index ? { ...r, ...patch } : r);
            onChange(updated);
            return updated;
        });
    }, [onChange]);

    const removeRow = useCallback((index: number) => {
        setRows((prev) => {
            const updated = prev.filter((_, i) => i !== index);
            onChange(updated);
            return updated;
        });
    }, [onChange]);

    const addBlankRow = useCallback(() => {
        const newRow: ScriptRow = {
            scriptId: "",
            scriptName: "",
            scriptCode: "",
            order: rows.length,
            runAt: "document_idle",
            isEnabled: true,
            configId: "",
            configName: "",
            configJson: "",
        };
        setRows((prev) => {
            const updated = [...prev, newRow];
            onChange(updated);
            return updated;
        });
    }, [rows.length, onChange]);

    const addFromLibrary = useCallback((scriptId: string) => {
        const script = allScripts.find((s) => s.id === scriptId);
        if (!script) return;

        const config = script.configBinding
            ? allConfigs.find((c) => c.id === script.configBinding)
            : undefined;

        const newRow: ScriptRow = {
            scriptId: script.id,
            scriptName: script.name,
            scriptCode: script.code,
            order: rows.length,
            runAt: (script.runAt as ScriptRow["runAt"]) ?? "document_idle",
            isEnabled: script.isEnabled ?? true,
            configId: config?.id ?? "",
            configName: config?.name ?? "",
            configJson: config?.json ?? "",
        };

        setRows((prev) => {
            const updated = [...prev, newRow];
            onChange(updated);
            return updated;
        });
    }, [allScripts, allConfigs, rows.length, onChange]);

    return (
        <>
            <h2 style={{ fontSize: 16, margin: "24px 0 12px" }}>Scripts & Configs</h2>
            <div className="scripts-section-help" style={{ color: "hsl(var(--foreground-secondary))", fontSize: 12, marginBottom: 12 }}>
                Each row pairs an optional JSON config with a JavaScript file.
            </div>

            <div className="script-rows-container">
                {rows.length === 0 ? (
                    <div className="empty-state" style={{ padding: 16 }}>No scripts added yet.</div>
                ) : (
                    rows.map((row, index) => (
                        <ScriptRowCard
                            key={index}
                            row={row}
                            index={index}
                            allConfigs={allConfigs}
                            onUpdate={(patch) => updateRow(index, patch)}
                            onRemove={() => removeRow(index)}
                        />
                    ))
                )}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-secondary btn-sm" onClick={addBlankRow}>+ New Script</button>
                <select
                    className="form-select"
                    style={{ fontSize: 12, padding: "4px 8px", maxWidth: 200 }}
                    onChange={(e) => { if (e.target.value) { addFromLibrary(e.target.value); e.target.value = ""; } }}
                    defaultValue=""
                >
                    <option value="">+ From Library…</option>
                    {allScripts.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({getRunAtLabel(s.runAt ?? "document_idle")})</option>
                    ))}
                </select>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Script Row Card                                                    */
/* ------------------------------------------------------------------ */

function ScriptRowCard({
    row,
    index,
    allConfigs,
    onUpdate,
    onRemove,
}: {
    row: ScriptRow;
    index: number;
    allConfigs: any[];
    onUpdate: (patch: Partial<ScriptRow>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="script-row-card">
            <div className="script-row-header">
                <span className="script-row-order">#{index + 1}</span>
                <label className="script-row-toggle">
                    <input
                        type="checkbox"
                        checked={row.isEnabled}
                        onChange={(e) => onUpdate({ isEnabled: e.target.checked })}
                    />
                    <span style={{ fontSize: 11, color: "hsl(var(--foreground-secondary))" }}>Enabled</span>
                </label>
                <button className="btn btn-danger btn-sm" onClick={onRemove} title="Remove">✕</button>
            </div>
            <div className="script-row-body">
                {/* Config Column */}
                <div className="script-row-config-col">
                    <label className="form-label" style={{ fontSize: 11 }}>
                        JSON Config <span style={{ color: "hsl(var(--foreground-muted))" }}>(optional)</span>
                    </label>
                    <select
                        className="form-select"
                        value={row.configId}
                        onChange={(e) => {
                            const config = allConfigs.find((c: any) => c.id === e.target.value);
                            onUpdate({
                                configId: e.target.value,
                                configName: config?.name ?? "",
                                configJson: config?.json ?? "",
                            });
                        }}
                    >
                        <option value="">— None —</option>
                        {allConfigs.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <input
                        className="form-input"
                        value={row.configName}
                        onChange={(e) => onUpdate({ configName: e.target.value })}
                        placeholder="config.json"
                    />
                    <div className="code-editor-container">
                        <div className="code-editor-toolbar">
                            <span className="code-editor-lang">JSON</span>
                        </div>
                        <textarea
                            className="form-textarea code-highlighted"
                            rows={3}
                            value={row.configJson}
                            onChange={(e) => onUpdate({ configJson: e.target.value })}
                            placeholder='{"key": "value"}'
                        />
                    </div>
                </div>
                <div className="script-row-arrow">→</div>
                {/* Script Column */}
                <div className="script-row-script-col">
                    <label className="form-label" style={{ fontSize: 11 }}>Script</label>
                    <input
                        className="form-input"
                        value={row.scriptName}
                        onChange={(e) => onUpdate({ scriptName: e.target.value })}
                        placeholder="script-name.js"
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <select
                            className="form-select"
                            value={row.runAt}
                            onChange={(e) => onUpdate({ runAt: e.target.value as ScriptRow["runAt"] })}
                        >
                            {RUN_AT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <span
                            className="run-at-help"
                            title={RUN_AT_OPTIONS.map((o) => `${o.label}: ${o.description}`).join("\n\n")}
                            style={{ cursor: "help", fontSize: 13, color: "hsl(var(--foreground-muted))" }}
                        >
                            ❓
                        </span>
                    </div>
                    <div className="code-editor-container">
                        <div className="code-editor-toolbar">
                            <span className="code-editor-lang">JS</span>
                        </div>
                        <textarea
                            className="form-textarea code-highlighted"
                            rows={4}
                            value={row.scriptCode}
                            onChange={(e) => onUpdate({ scriptCode: e.target.value })}
                            placeholder="// JavaScript code here..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
