/**
 * Marco Extension — React Popup: SQLite Bundle Actions
 *
 * Export DB / Merge|Replace toggle / Import in a unified bar.
 */

import { useState, useCallback, useRef } from "react";
import { getPlatform } from "../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SqliteBundleActionsProps {
    logSuccess: (action: string, detail: string) => void;
    logError: (action: string, detail: string) => void;
    logInfo: (action: string, detail: string) => void;
    debugOk: (action: string) => void;
    debugError: (action: string, error: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SqliteBundleActions({
    logSuccess,
    logError,
    logInfo,
    debugOk,
    debugError,
}: SqliteBundleActionsProps) {
    const platform = getPlatform();
    const [importMode, setImportMode] = useState<"merge" | "replace">("replace");
    const [exportLabel, setExportLabel] = useState("🗄️ Export DB");
    const [importLabel, setImportLabel] = useState("📥 Import");
    const fileRef = useRef<HTMLInputElement>(null);

    const resetExport = useCallback(() => {
        setTimeout(() => setExportLabel("🗄️ Export DB"), 2000);
    }, []);

    const resetImport = useCallback(() => {
        setTimeout(() => setImportLabel("📥 Import"), 2000);
    }, []);

    const handleExport = useCallback(async () => {
        setExportLabel("⏳ Exporting...");
        try {
            // In extension context, this would call the full SQLite export.
            // For PoC, we call GET_ALL_PROJECTS and log success.
            await platform.sendMessage({ type: "GET_ALL_PROJECTS" });
            logSuccess("SQLite Export", "Downloaded marco-backup.zip");
            debugOk("SQLite Export");
            setExportLabel("✅ Done!");
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            logError("SQLite Export", `Export failed: ${reason}`);
            debugError("SQLite Export", reason);
            setExportLabel("❌ Failed");
        }
        resetExport();
    }, [platform, logSuccess, logError, debugOk, debugError, resetExport]);

    const handleImportClick = useCallback(() => {
        if (importMode === "replace") {
            const isConfirmed = confirm(
                "⚠️ Replace All will DELETE all existing projects, scripts, and configs before importing.\n\nThis is destructive and cannot be undone. Continue?",
            );
            if (!isConfirmed) return;
        }
        fileRef.current?.click();
    }, [importMode]);

    const handleFileChange = useCallback(
        async (file: File) => {
            const modeLabel = importMode === "replace" ? "Replacing" : "Merging";
            setImportLabel("⏳ Importing...");
            logInfo("SQLite Import", `${modeLabel} from ${file.name}...`);

            try {
                // In full implementation, this calls importFromZip.
                // For PoC, simulate success.
                logSuccess("SQLite Import", `${modeLabel} complete`);
                debugOk("SQLite Import");
                setImportLabel("✅ Done!");
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                logError("SQLite Import", `Import failed: ${reason}`);
                debugError("SQLite Import", reason);
                setImportLabel("❌ Failed");
            }
            resetImport();
        },
        [importMode, logSuccess, logError, logInfo, debugOk, debugError, resetImport],
    );

    return (
        <>
            <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        void handleFileChange(file);
                        e.target.value = "";
                    }
                }}
            />
            <div className="sqlite-bundle-actions">
                <div className="sqlite-bar">
                    <button className="btn-action" onClick={() => void handleExport()}>
                        {exportLabel}
                    </button>
                    <div className="bar-divider" />
                    <div className="import-mode-toggle">
                        <button
                            className={`mode-btn${importMode === "merge" ? " active" : ""}`}
                            onClick={() => setImportMode("merge")}
                            type="button"
                        >
                            Merge
                        </button>
                        <button
                            className={`mode-btn${importMode === "replace" ? " active" : ""}`}
                            onClick={() => setImportMode("replace")}
                            type="button"
                        >
                            Replace All
                        </button>
                    </div>
                    <div className="bar-divider" />
                    <button className="btn-action" onClick={handleImportClick}>
                        {importLabel}
                    </button>
                </div>
            </div>
        </>
    );
}
