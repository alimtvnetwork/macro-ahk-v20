/**
 * Marco Extension — React Options: Projects Section
 *
 * Project cards list with CRUD, import/export, and editor navigation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPlatform } from "../../platform";
import { ProjectEditor } from "./ProjectEditor";
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProjectsSection() {
    const platform = getPlatform();
    const [projects, setProjects] = useState<StoredProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingProject, setEditingProject] = useState<StoredProject | null | "new">(null);
    const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
    const [importMode, setImportMode] = useState<"merge" | "replace">("replace");
    const sqliteInputRef = useRef<HTMLInputElement>(null);

    const loadProjects = useCallback(async () => {
        try {
            const response = await platform.sendMessage<{ projects: StoredProject[] }>({
                type: "GET_ALL_PROJECTS",
            });
            setProjects(response.projects ?? []);
        } catch {
            setProjects([]);
        } finally {
            setIsLoading(false);
        }
    }, [platform]);

    useEffect(() => { void loadProjects(); }, [loadProjects]);

    const handleDelete = useCallback(async (projectId: string) => {
        const isConfirmed = confirm("Delete this project? This cannot be undone.");
        if (!isConfirmed) return;
        await platform.sendMessage({ type: "DELETE_PROJECT", projectId });
        await loadProjects();
    }, [platform, loadProjects]);

    const handleDuplicate = useCallback(async (projectId: string) => {
        await platform.sendMessage({ type: "DUPLICATE_PROJECT", projectId });
        await loadProjects();
    }, [platform, loadProjects]);

    const handleExportJson = useCallback(async (projectId: string) => {
        try {
            const response = await platform.sendMessage<{ json: string; filename: string }>({
                type: "EXPORT_PROJECT",
                projectId,
            });
            downloadFile(response.json, response.filename, "application/json");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setToast({ message: `Export failed: ${msg}`, variant: "error" });
        }
    }, [platform]);

    const handleImportJson = useCallback(() => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const json = await file.text();
                await platform.sendMessage({ type: "IMPORT_PROJECT", json });
                await loadProjects();
                setToast({ message: "Project imported successfully", variant: "success" });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setToast({ message: `Import failed: ${msg}`, variant: "error" });
            }
        });
        fileInput.click();
    }, [platform, loadProjects]);

    const handleExportSqlite = useCallback(async () => {
        try {
            await platform.sendMessage({ type: "EXPORT_SQLITE_BUNDLE" });
            setToast({ message: "SQLite bundle exported", variant: "success" });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setToast({ message: `Export failed: ${msg}`, variant: "error" });
        }
    }, [platform]);

    const handleImportSqlite = useCallback(() => {
        if (importMode === "replace") {
            const isConfirmed = confirm(
                "⚠️ Replace All will delete all existing projects, scripts, and configs before import. Continue?",
            );
            if (!isConfirmed) return;
        }
        sqliteInputRef.current?.click();
    }, [importMode]);

    const handleSqliteFileChange = useCallback(async (file: File) => {
        try {
            await platform.sendMessage({ type: "IMPORT_SQLITE_BUNDLE", mode: importMode });
            await loadProjects();
            setToast({ message: `SQLite bundle imported (${importMode})`, variant: "success" });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setToast({ message: `Import failed: ${msg}`, variant: "error" });
        }
    }, [platform, importMode, loadProjects]);

    const handleEditorBack = useCallback(() => {
        setEditingProject(null);
        void loadProjects();
    }, [loadProjects]);

    // Show editor if editing
    if (editingProject !== null) {
        const project = editingProject === "new" ? null : editingProject;
        return <ProjectEditor project={project} onBack={handleEditorBack} />;
    }

    if (isLoading) {
        return <div className="empty-state"><div className="empty-state-title">Loading projects…</div></div>;
    }

    const hasProjects = projects.length > 0;

    return (
        <>
            {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}

            <div className="content-header">
                <h1 className="content-title">Projects</h1>
                <button className="btn btn-primary" onClick={() => setEditingProject("new")}>
                    + New Project
                </button>
            </div>

            {hasProjects ? (
                projects.map((project) => (
                    <ProjectCard
                        key={project.id}
                        project={project}
                        onEdit={() => setEditingProject(project)}
                        onDuplicate={() => void handleDuplicate(project.id)}
                        onExportJson={() => void handleExportJson(project.id)}
                        onDelete={() => void handleDelete(project.id)}
                    />
                ))
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon">📁</div>
                    <div className="empty-state-title">No projects yet</div>
                    <div className="empty-state-text">
                        Create a project to group URL rules, scripts, and configs
                        for automatic injection on matching pages.
                    </div>
                    <button className="btn btn-primary" onClick={() => setEditingProject("new")}>
                        + Create First Project
                    </button>
                </div>
            )}

            {/* Import/Export Section */}
            <div className="projects-import-section">
                <button className="btn btn-secondary" onClick={handleImportJson}>📂 Import JSON</button>
                <button className="btn btn-secondary" onClick={() => void handleExportSqlite()}>🗄️ Export SQLite Bundle</button>
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
                <button className="btn btn-secondary" onClick={handleImportSqlite}>📥 Import SQLite Bundle</button>
                <input
                    ref={sqliteInputRef}
                    type="file"
                    accept=".zip"
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) { void handleSqliteFileChange(file); e.target.value = ""; }
                    }}
                />
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Project Card                                                       */
/* ------------------------------------------------------------------ */

function ProjectCard({
    project,
    onEdit,
    onDuplicate,
    onExportJson,
    onDelete,
}: {
    project: StoredProject;
    onEdit: () => void;
    onDuplicate: () => void;
    onExportJson: () => void;
    onDelete: () => void;
}) {
    const ruleCount = project.targetUrls?.length ?? 0;
    const scriptCount = project.scripts?.length ?? 0;
    const configCount = project.configs?.length ?? 0;
    const isDefault = project.id === "default-lovable";

    return (
        <div className="card">
            <div className="card-header">
                <div className="card-title">
                    <span>{project.name}</span>
                    {isDefault && <span className="badge badge-builtin">🔒 built-in</span>}
                </div>
                <div className="card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
                    <button className="btn btn-secondary btn-sm" onClick={onDuplicate}>Duplicate</button>
                    <button className="btn btn-secondary btn-sm" onClick={onExportJson}>Export JSON</button>
                    {!isDefault && (
                        <button className="btn btn-danger btn-sm" onClick={onDelete}>🗑</button>
                    )}
                </div>
            </div>
            <div className="card-meta">
                {ruleCount} URL rule{ruleCount !== 1 ? "s" : ""} · {scriptCount} script{scriptCount !== 1 ? "s" : ""} · {configCount} config{configCount !== 1 ? "s" : ""}
            </div>
            {project.description && (
                <div className="card-meta" style={{ marginTop: 4 }}>{project.description}</div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
