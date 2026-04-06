/**
 * Marco Extension — React Popup: Scripts List
 *
 * Renders the scripts section with toggle switches,
 * per-script reinject, JS/config edit links, and delete.
 */

import { useState, useCallback } from "react";
import { getPlatform } from "../../platform";
import type { ScriptEntry, ProjectData } from "../hooks/usePopupData";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TOGGLEABLE_SCRIPT_IDS = new Set(["default-macro-looping"]);
const TOGGLEABLE_SCRIPT_PATHS = new Set(["macro-looping.js"]);
const HIDDEN_SCRIPT_PATHS = new Set(["combo-switch.js", "macro-controller.js"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeScriptPath(path: string): string {
    const normalized = path.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

function isToggleableScript(script: ScriptEntry): boolean {
    const normalizedPath = normalizeScriptPath(script.path);
    const normalizedId = (script.id ?? "").trim().toLowerCase();
    return TOGGLEABLE_SCRIPT_PATHS.has(normalizedPath)
        || TOGGLEABLE_SCRIPT_IDS.has(normalizedId);
}

function isHiddenScript(script: ScriptEntry): boolean {
    return HIDDEN_SCRIPT_PATHS.has(normalizeScriptPath(script.path));
}

function resolveStatusIcon(status: string): string {
    if (status === "injected") return "✅";
    if (status === "failed") return "❌";
    return "⬚";
}

function resolveStatusClass(status: string): string {
    if (status === "injected") return "injected";
    if (status === "failed") return "failed";
    return "inactive";
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ScriptsListProps {
    project: ProjectData | null;
    onInjectSingle: (script: ScriptEntry) => Promise<void>;
    onToggleScript: (scriptId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScriptsList({
    project,
    onInjectSingle,
    onToggleScript,
}: ScriptsListProps) {
    const platform = getPlatform();
    const [hiddenScripts, setHiddenScripts] = useState<Set<string>>(new Set());
    const [reinjectingScript, setReinjectingScript] = useState<string | null>(null);

    const activeProject = project?.activeProject ?? null;
    const injected = project?.injectedScripts ?? {};
    const scriptStates = project?.scriptStates ?? {};

    const allScripts = activeProject?.scripts ?? [];
    const visibleScripts = allScripts.filter(
        (s) => !isHiddenScript(s) && !hiddenScripts.has(s.path),
    );

    const handleToggle = useCallback(
        (script: ScriptEntry) => {
            const scriptId = script.id
                ?? (scriptStates as any)[script.path]?.id
                ?? script.path;
            onToggleScript(scriptId);
        },
        [scriptStates, onToggleScript],
    );

    const handleReinject = useCallback(
        async (script: ScriptEntry) => {
            setReinjectingScript(script.path);
            try {
                await onInjectSingle(script);
            } finally {
                setTimeout(() => setReinjectingScript(null), 1500);
            }
        },
        [onInjectSingle],
    );

    const handleDelete = useCallback(
        (script: ScriptEntry) => {
            setHiddenScripts((prev) => new Set(prev).add(script.path));
            const scriptId = script.id ?? "";
            if (scriptId) {
                void platform.sendMessage({
                    type: "TOGGLE_SCRIPT",
                    id: scriptId,
                    forceDisable: true,
                });
            }
        },
        [platform],
    );

    const handleJsEdit = useCallback(
        (script: ScriptEntry) => {
            const url = platform.getExtensionUrl(
                `src/options/options.html#scripts?edit=${encodeURIComponent(script.path)}`,
            );
            platform.tabs.openUrl(url);
        },
        [platform],
    );

    const handleConfigEdit = useCallback(
        (configBinding: string) => {
            const url = platform.getExtensionUrl(
                `src/options/options.html#configs?edit=${encodeURIComponent(configBinding)}`,
            );
            platform.tabs.openUrl(url);
        },
        [platform],
    );

    const title = activeProject
        ? `Scripts — ${activeProject.name}`
        : "Scripts";

    return (
        <div className="section">
            <div className="section-title">📜 {title}</div>
            {visibleScripts.length === 0 ? (
                <div className="empty-state">
                    {activeProject ? "No scripts configured" : "No active project"}
                </div>
            ) : (
                <div>
                    {visibleScripts.map((script) => {
                        const scriptId = script.id
                            ?? (scriptStates as any)[script.path]?.id
                            ?? "";
                        const statusInfo = (injected as any)[script.path];
                        const statusLabel = statusInfo?.status ?? "not loaded";
                        const isEnabled = (scriptStates as any)[script.path]?.isEnabled
                            ?? (script.isEnabled !== false);
                        const isToggleable = isToggleableScript(script);
                        const isReinjectingThis = reinjectingScript === script.path;
                        const hasConfig = script.configBinding != null
                            && script.configBinding !== "";

                        return (
                            <div
                                key={script.path}
                                className={`script-row${!isEnabled ? " script-row-disabled" : ""}`}
                            >
                                {isToggleable && (
                                    <label className="script-toggle" title={isEnabled ? "Disable" : "Enable"}>
                                        <input
                                            type="checkbox"
                                            className="script-toggle-input"
                                            checked={isEnabled}
                                            onChange={() => handleToggle(script)}
                                        />
                                        <span className="script-toggle-slider" />
                                    </label>
                                )}
                                <span className="script-name">{script.path}</span>
                                <span className="script-world">MAIN</span>
                                <span className={`script-status ${resolveStatusClass(statusLabel)}`}>
                                    {resolveStatusIcon(statusLabel)} {statusLabel}
                                </span>
                                <button
                                    className="btn-link btn-js-edit"
                                    onClick={() => handleJsEdit(script)}
                                    title={`Edit JavaScript for ${script.path}`}
                                >
                                    JS Edit
                                </button>
                                {hasConfig && (
                                    <button
                                        className="btn-link btn-config-edit"
                                        onClick={() => handleConfigEdit(script.configBinding!)}
                                        title={`Edit config for ${script.path}`}
                                    >
                                        Config
                                    </button>
                                )}
                                <button
                                    className="btn-small"
                                    disabled={isReinjectingThis}
                                    onClick={() => void handleReinject(script)}
                                >
                                    {isReinjectingThis ? "⏳" : "Reinject"}
                                </button>
                                <button
                                    className="btn-small btn-delete"
                                    onClick={() => handleDelete(script)}
                                    title="Remove from list"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
