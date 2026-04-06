/**
 * Marco Extension — React Options: Scripts Library
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPlatform } from "../../platform";
import { Toast } from "../shared/Toast";

interface StoredScript {
    id: string;
    name: string;
    code: string;
    isEnabled: boolean;
    isIife: boolean;
    runAt?: string;
}

export function ScriptsLibrary() {
    const platform = getPlatform();
    const [scripts, setScripts] = useState<StoredScript[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadScripts = useCallback(async () => {
        try {
            const response = await platform.sendMessage<{ scripts: StoredScript[] }>({
                type: "GET_ALL_SCRIPTS",
            });
            setScripts(response.scripts ?? []);
        } catch {
            setScripts([]);
        } finally {
            setIsLoading(false);
        }
    }, [platform]);

    useEffect(() => { void loadScripts(); }, [loadScripts]);

    const handleUpload = useCallback(async (files: FileList) => {
        for (const file of Array.from(files)) {
            const code = await file.text();
            const isIife = code.trimStart().startsWith("(");
            await platform.sendMessage({
                type: "SAVE_SCRIPT",
                script: { id: "", name: file.name, code, isEnabled: true, isIife },
            });
        }
        await loadScripts();
        setToast({ message: `Uploaded ${files.length} script(s)`, variant: "success" });
    }, [platform, loadScripts]);

    const handleToggle = useCallback(async (scriptId: string) => {
        await platform.sendMessage({ type: "TOGGLE_SCRIPT", id: scriptId });
        await loadScripts();
    }, [platform, loadScripts]);

    const handleDelete = useCallback(async (scriptId: string) => {
        const isConfirmed = confirm("Delete this script?");
        if (!isConfirmed) return;
        await platform.sendMessage({ type: "DELETE_SCRIPT", id: scriptId });
        await loadScripts();
    }, [platform, loadScripts]);

    if (isLoading) {
        return <div className="empty-state"><div className="empty-state-title">Loading scripts…</div></div>;
    }

    return (
        <>
            {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}

            <div className="content-header">
                <h1 className="content-title">Scripts</h1>
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                    + Upload Script
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".js,.ts"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                        if (e.target.files?.length) {
                            void handleUpload(e.target.files);
                            e.target.value = "";
                        }
                    }}
                />
            </div>

            {scripts.length > 0 ? (
                scripts.map((script) => {
                    const statusLabel = script.isEnabled ? "enabled" : "disabled";
                    const toggleLabel = script.isEnabled ? "Disable" : "Enable";

                    return (
                        <div key={script.id} className="card">
                            <div className="card-header">
                                <span className="card-title">{script.name}</span>
                                <div className="card-actions">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => void handleToggle(script.id)}
                                    >
                                        {toggleLabel}
                                    </button>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => void handleDelete(script.id)}
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                            <div className="card-meta">
                                <span style={{ color: script.isEnabled ? "hsl(var(--success))" : "hsl(var(--foreground-muted))" }}>
                                    ● {statusLabel}
                                </span>
                                {" · "}{script.code?.length ?? 0} chars
                                {script.isIife ? " · IIFE" : ""}
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon">📜</div>
                    <div className="empty-state-title">No scripts uploaded</div>
                    <div className="empty-state-text">
                        Upload JavaScript files to inject into matching pages.
                    </div>
                </div>
            )}
        </>
    );
}
