/**
 * Marco Extension — React Options: Project Editor
 *
 * Full project editor with URL rules, scripts, cookies, variables.
 */

import { useState, useCallback } from "react";
import { getPlatform } from "../../platform";
import { UrlRulesEditor } from "./editor/UrlRulesEditor";
import { ScriptsConfigEditor } from "./editor/ScriptsConfigEditor";
import { CookieBindingsEditor } from "./editor/CookieBindingsEditor";
import { VariablesEditor } from "./editor/VariablesEditor";
import { Toast } from "../shared/Toast";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StoredProject {
    id: string;
    schemaVersion: number;
    name: string;
    version: string;
    description?: string;
    targetUrls: { pattern: string; matchType: string }[];
    scripts: { path: string; order: number; configBinding?: string; code?: string }[];
    configs?: { id: string; name: string }[];
    cookies?: Array<{ cookieName: string; url: string; role: "session" | "refresh" | "custom"; description?: string }>;
    settings?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface ProjectEditorProps {
    project: StoredProject | null;
    onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProjectEditor({ project, onBack }: ProjectEditorProps) {
    const platform = getPlatform();
    const isEditing = project !== null;
    const title = isEditing ? project.name : "New Project";

    const [name, setName] = useState(project?.name ?? "");
    const [description, setDescription] = useState(project?.description ?? "");
    const [rules, setRules] = useState(project?.targetUrls ?? []);
    const [cookies, setCookies] = useState<Array<{ cookieName: string; url: string; role: "session" | "refresh" | "custom"; description?: string }>>(project?.cookies ?? []);
    const [variablesJson, setVariablesJson] = useState(() => {
        if (!project?.settings) return "{}";
        const vars = (project.settings as Record<string, unknown>).variables;
        if (vars === undefined) return "{}";
        try { return JSON.stringify(vars, null, 2); } catch { return "{}"; }
    });
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

    // Script rows are managed by ScriptsConfigEditor via ref
    const [scriptRows, setScriptRows] = useState<Array<{ scriptName: string; runAt: string; configId?: string }>>([]);

    const handleSave = useCallback(async () => {
        if (name.trim() === "") {
            setToast({ message: "Project name is required.", variant: "error" });
            return;
        }

        setIsSaving(true);
        try {
            // Build scripts from rows
            const scripts = scriptRows.map((row, i: number) => ({
                path: row.scriptName,
                order: i,
                runAt: row.runAt,
                configBinding: row.configId || undefined,
            }));

            // Parse variables
            let settings: Record<string, unknown> = { ...(project?.settings ?? { logLevel: "info" }) };
            try {
                settings.variables = JSON.parse(variablesJson);
            } catch { /* keep existing */ }

            const payload: StoredProject = {
                id: project?.id ?? crypto.randomUUID(),
                schemaVersion: 1,
                name: name.trim(),
                version: project?.version ?? "1.0.1",
                description: description.trim() || undefined,
                targetUrls: rules,
                scripts,
                configs: [],
                cookies: cookies.length > 0 ? cookies : undefined,
                settings,
                createdAt: project?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await platform.sendMessage({ type: "SAVE_PROJECT", project: payload });
            setToast({ message: "Project saved and persisted.", variant: "success" });
            setTimeout(onBack, 800);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setToast({ message: `Save failed: ${msg}`, variant: "error" });
        } finally {
            setIsSaving(false);
        }
    }, [name, description, rules, scriptRows, cookies, variablesJson, project, platform, onBack]);

    return (
        <>
            {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}

            <div className="anim-fade-in-right">
                <div className="content-header">
                    <h1 className="content-title">
                        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Projects</button>
                        {" / "}{title}
                    </h1>
                </div>

                {/* Name & Description */}
                <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                        className="form-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Project"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Description</label>
                    <input
                        className="form-input"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description"
                    />
                </div>
            </div>

            {/* Staggered editor sections */}
            {[
                { key: "urls", delay: 0.05, content: (
                    <>
                        <h2 style={{ fontSize: 16, margin: "24px 0 12px" }}>URL Rules</h2>
                        <UrlRulesEditor rules={rules} onChange={setRules} />
                    </>
                )},
                { key: "scripts", delay: 0.1, content: (
                    <ScriptsConfigEditor
                        projectScripts={project?.scripts ?? []}
                        onChange={setScriptRows}
                    />
                )},
                { key: "cookies", delay: 0.15, content: (
                    <CookieBindingsEditor bindings={cookies} onChange={setCookies} />
                )},
                { key: "vars", delay: 0.2, content: (
                    <VariablesEditor json={variablesJson} onChange={setVariablesJson} />
                )},
            ].map(({ key, delay, content }) => (
                <div
                    key={key}
                    className="anim-fade-in-up"
                    style={{ animationDelay: `${delay}s` }}
                >
                    {content}
                </div>
            ))}

            {/* Save Actions */}
            <div
                className="anim-fade-in-up anim-delay-5"
                style={{ marginTop: 12, display: "flex", gap: 12 }}
            >
                <button
                    className="btn btn-primary"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                >
                    {isSaving ? "Saving…" : "Save Project"}
                </button>
                <button className="btn btn-secondary" onClick={onBack}>Cancel</button>
            </div>
        </>
    );
}
