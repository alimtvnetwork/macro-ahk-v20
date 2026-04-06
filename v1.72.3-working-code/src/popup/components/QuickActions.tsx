/**
 * Marco Extension — React Popup: Quick Actions
 *
 * Row 1: Logs, Export Logs, Export Project, Import Project, Refresh
 * Plus project controls: Run, Re-inject, Toggle, Keys
 */

import { useState, useCallback, useRef } from "react";
import { getPlatform } from "../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QuickActionsProps {
    onReload: () => Promise<void>;
    onRun: () => Promise<void>;
    onReinject: () => Promise<void>;
    logSuccess: (action: string, detail: string) => void;
    logError: (action: string, detail: string) => void;
    logInfo: (action: string, detail: string) => void;
    debugOk: (action: string) => void;
    debugError: (action: string, error: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function useButtonFlash(resetLabel: string) {
    const [label, setLabel] = useState(resetLabel);
    const [isSuccess, setIsSuccess] = useState(false);

    const flash = useCallback(
        (text: string, isOk: boolean) => {
            setLabel(text);
            setIsSuccess(isOk);
            setTimeout(() => {
                setLabel(resetLabel);
                setIsSuccess(false);
            }, 2000);
        },
        [resetLabel],
    );

    return { label, isSuccess, flash, setLabel };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function QuickActions({
    onReload,
    onRun,
    onReinject,
    logSuccess,
    logError,
    logInfo,
    debugOk,
    debugError,
}: QuickActionsProps) {
    const platform = getPlatform();
    const importRef = useRef<HTMLInputElement>(null);

    /* Logs */
    const handleCopyLogs = useCallback(async () => {
        try {
            const response = await platform.sendMessage<{
                sessionId: string;
                logs: unknown[];
                errors: unknown[];
            }>({ type: "GET_SESSION_LOGS" });

            const report = {
                sessionId: response.sessionId,
                exportedAt: new Date().toISOString(),
                logCount: response.logs.length,
                errorCount: response.errors.length,
                logs: response.logs,
                errors: response.errors,
            };
            const jsonText = JSON.stringify(report, null, 2);
            await navigator.clipboard.writeText(jsonText);
            logSuccess("Logs", `Copied ${response.logs.length} logs + ${response.errors.length} errors`);
            debugOk("Logs");
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            logError("Logs", `Copy failed: ${reason}`);
            debugError("Logs", reason);
        }
    }, [platform, logSuccess, logError, debugOk, debugError]);

    /* Export ZIP */
    const handleExportZip = useCallback(async () => {
        try {
            const response = await platform.sendMessage<{
                dataUrl: string | null;
                filename: string;
            }>({ type: "EXPORT_LOGS_ZIP" });

            if (response.dataUrl) {
                const link = document.createElement("a");
                link.href = response.dataUrl;
                link.download = response.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                logSuccess("Export", `Downloaded ${response.filename}`);
                debugOk("Export");
            } else {
                logError("Export", "No data returned");
                debugError("Export", "No data returned");
            }
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            logError("Export", `Failed: ${reason}`);
            debugError("Export", reason);
        }
    }, [platform, logSuccess, logError, debugOk, debugError]);

    /* Export Project */
    const handleExportProject = useCallback(async () => {
        try {
            const projectData = await platform.sendMessage<{
                activeProject?: { id: string; name: string };
            }>({ type: "GET_ACTIVE_PROJECT" });

            if (!projectData?.activeProject?.id) {
                logError("Export Project", "No active project");
                return;
            }

            const response = await platform.sendMessage<{
                json: string;
                filename: string;
            }>({
                type: "EXPORT_PROJECT",
                projectId: projectData.activeProject.id,
            });

            const blob = new Blob([response.json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = response.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            logSuccess("Export Project", `Downloaded ${response.filename}`);
            debugOk("Export Project");
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            logError("Export Project", `Failed: ${reason}`);
            debugError("Export Project", reason);
        }
    }, [platform, logSuccess, logError, debugOk, debugError]);

    /* Import Project */
    const handleImportFile = useCallback(
        async (file: File) => {
            try {
                const json = await file.text();
                logInfo("Import", `Reading ${file.name}...`);

                const response = await platform.sendMessage<{
                    isOk: boolean;
                    project: { name: string };
                }>({ type: "IMPORT_PROJECT", json });

                logSuccess("Import", `Imported "${response.project.name}"`);
                debugOk("Import Project");
                await onReload();
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                logError("Import", `Failed: ${reason}`);
                debugError("Import Project", reason);
            }
        },
        [platform, logSuccess, logError, logInfo, debugOk, debugError, onReload],
    );

    return (
        <>
            {/* Project Controls */}
            <div className="project-controls">
                <button className="btn-ctrl btn-ctrl-primary has-tooltip" onClick={() => void onRun()}>
                    <span className="ctrl-icon">▶️</span> Run
                    <span className="shortcut-badge">Ctrl+Shift+↓</span>
                </button>
                <button className="btn-ctrl has-tooltip" onClick={() => void onReinject()}>
                    <span className="ctrl-icon">🔁</span> Re-inject
                </button>
                <button className="btn-ctrl" onClick={() => platform.tabs.openUrl("chrome://extensions/shortcuts")}>
                    <span className="ctrl-icon">⌨️</span> Keys
                </button>
            </div>

            {/* Quick Actions Grid */}
            <div className="quick-actions">
                <button className="btn-action" onClick={() => void handleCopyLogs()}>
                    <span className="action-icon">📋</span> Logs
                </button>
                <button className="btn-action" onClick={() => void handleExportZip()}>
                    <span className="action-icon">📦</span> Export Logs
                </button>
                <button className="btn-action" onClick={() => void handleExportProject()}>
                    <span className="action-icon">💾</span> Export Project
                </button>
                <button className="btn-action" onClick={() => importRef.current?.click()}>
                    <span className="action-icon">📥</span> Import Project
                </button>
                <button className="btn-action" onClick={() => void onReload()}>
                    <span className="action-icon">🔄</span> Refresh
                </button>
            </div>

            <input
                ref={importRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        void handleImportFile(file);
                        e.target.value = "";
                    }
                }}
            />
        </>
    );
}
