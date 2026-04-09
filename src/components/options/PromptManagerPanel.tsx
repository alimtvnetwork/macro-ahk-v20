/**
 * Prompt Manager Panel — Spec 15 T-10 + T-11
 *
 * Full CRUD for prompts with categories, favorites, Monaco editor, and full-view mode.
 */

import { useState, useRef } from "react";
import { usePrompts, type PromptEntry } from "@/hooks/use-prompts";
import { useLibraryLinkMap, type LibraryAssetSet } from "@/hooks/use-library-link-map";
import { SyncBadge } from "./LibraryView";
import { exportPromptsAsSqliteZip, importPromptsFromSqliteZip, mergePromptsFromSqliteZip } from "@/lib/sqlite-bundle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    RefreshCw,
    Plus,
    Trash2,
    Pencil,
    ChevronUp,
    ChevronDown,
    MessageSquare,
    Save,
    X,
    Lock,
    Copy,
    Star,
    Tag,
    Maximize2,
    Eye,
    Download,
    Upload as UploadIcon,
    Loader2,
    FileUp,
    RotateCcw,
} from "lucide-react";
import { MonacoCodeEditor } from "./LazyMonacoCodeEditor";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_SUGGESTIONS = ["Debug", "Memory", "Testing", "Deploy", "General"];

/* ------------------------------------------------------------------ */
/*  Edit Form with Monaco                                              */
/* ------------------------------------------------------------------ */

interface EditFormProps {
    initial?: Partial<PromptEntry>;
    categories: string[];
    onSave: (data: Partial<PromptEntry>) => Promise<void>;
    onCancel: () => void;
}

// eslint-disable-next-line max-lines-per-function
function PromptEditForm({ initial, categories, onSave, onCancel }: EditFormProps) {
    const [name, setName] = useState(initial?.name ?? "");
    const [text, setText] = useState(initial?.text ?? "");
    const [category, setCategory] = useState(initial?.category ?? "__none__");
    const [saving, setSaving] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    const allCategories = Array.from(new Set([...categories, ...CATEGORY_SUGGESTIONS])).sort();

    const handleSubmit = async () => {
        if (!name.trim() || !text.trim()) return;
        setSaving(true);

        try {
            await onSave({
                ...initial,
                name: name.trim(),
                text: text.trim(),
                category: category === "__none__" ? undefined : category.trim() || undefined,
            });
        } catch (saveError) {
            const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save prompt";
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const editorContent = (height: string) => (
        <MonacoCodeEditor
            language="markdown"
            value={text}
            onChange={(v) => setText(v)}
            height={height}
        />
    );

    return (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex gap-2">
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Prompt name..."
                    className="h-8 text-sm flex-1"
                    autoFocus
                />
                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                        <Tag className="h-3 w-3 mr-1 shrink-0" />
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {allCategories.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Monaco editor for prompt text */}
            <div className="relative">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                        Prompt Text (Markdown)
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setFullscreen(true)}
                        title="Fullscreen editor"
                    >
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                </div>
                {editorContent("200px")}
            </div>

            {/* Fullscreen dialog */}
            <Dialog open={fullscreen} onOpenChange={setFullscreen}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Edit Prompt: {name || "Untitled"}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0">
                        {editorContent("100%")}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim() || !text.trim()}>
                    <Save className="h-3 w-3 mr-1" /> {initial?.id ? "Update" : "Add"}
                </Button>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Full View Dialog                                                   */
/* ------------------------------------------------------------------ */

function PromptFullView({ prompt, open, onClose }: { prompt: PromptEntry; open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        {prompt.name}
                        {prompt.category && (
                            <Badge variant="secondary" className="text-[10px]">{prompt.category}</Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-auto">
                    <MonacoCodeEditor
                        language="markdown"
                        value={prompt.text}
                        onChange={() => {}}
                        height="500px"
                        readOnly
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Prompt Row                                                         */
/* ------------------------------------------------------------------ */

interface PromptRowProps {
    prompt: PromptEntry;
    index: number;
    total: number;
    onEdit: (p: PromptEntry) => void;
    onDelete: (id: string) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onView: (p: PromptEntry) => void;
    libraryAssets?: LibraryAssetSet;
}

// eslint-disable-next-line max-lines-per-function
function PromptRow({ prompt, index, total, onEdit, onDelete, onMoveUp, onMoveDown, onToggleFavorite, onView, libraryAssets }: PromptRowProps) {
    const isDefault = prompt.isDefault === true;
    const isFav = prompt.isFavorite === true;

    const handleCopy = () => {
        navigator.clipboard.writeText(prompt.text);
        toast.success("Prompt copied to clipboard");
    };

    return (
        <div className="flex items-start gap-2 py-2 px-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group">
            {/* Favorite star */}
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 mt-0.5"
                onClick={() => onToggleFavorite(prompt.id)}
                title={isFav ? "Remove from favorites" : "Add to favorites"}
            >
                <Star className={`h-3.5 w-3.5 transition-colors ${isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            </Button>

            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onMoveUp(prompt.id)}
                    disabled={index === 0 || isDefault}
                >
                    <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onMoveDown(prompt.id)}
                    disabled={index === total - 1 || isDefault}
                >
                    <ChevronDown className="h-3 w-3" />
                </Button>
            </div>

            {/* Content — clickable for full view */}
            <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onView(prompt)}
                title="Click to view full prompt"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{prompt.name}</span>
                    {isDefault && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> Default
                        </Badge>
                    )}
                    {prompt.category && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {prompt.category}
                        </Badge>
                    )}
                    {prompt.slug && libraryAssets?.has(prompt.slug) && (
                        <SyncBadge state="synced" />
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{prompt.text}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(prompt)} title="View full">
                    <Eye className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy text">
                    <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(prompt)} title="Edit">
                    <Pencil className="h-3 w-3" />
                </Button>
                {!isDefault && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete">
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete "{prompt.name}".
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(prompt.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function PromptManagerPanel() {
    const {
        prompts, categories, categoryFilter, setCategoryFilter,
        loading, fatalError, refresh, save, remove, reorder, toggleFavorite, reseedDefaults,
    } = usePrompts();
    const { assetSlugs: libraryAssets } = useLibraryLinkMap();
    const [editingPrompt, setEditingPrompt] = useState<Partial<PromptEntry> | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [viewingPrompt, setViewingPrompt] = useState<PromptEntry | null>(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [reseeding, setReseeding] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    if (fatalError) {
        throw fatalError;
    }

    const handleSave = async (data: Partial<PromptEntry>) => {
        try {
            await save(data);
            setEditingPrompt(null);
            setIsAdding(false);
            toast.success(data.id ? "Prompt updated" : "Prompt added");
        } catch (saveError) {
            const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save prompt";
            toast.error(errorMessage);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await remove(id);
            toast.success("Prompt deleted");
        } catch (deleteError) {
            const errorMessage = deleteError instanceof Error ? deleteError.message : "Failed to delete prompt";
            toast.error(errorMessage);
        }
    };

    const handleToggleFavorite = async (id: string) => {
        try {
            await toggleFavorite(id);
        } catch (toggleError) {
            const errorMessage = toggleError instanceof Error ? toggleError.message : "Failed to toggle favorite";
            toast.error(errorMessage);
        }
    };

    const handleMoveUp = async (id: string) => {
        const index = prompts.findIndex((prompt) => prompt.id === id);
        if (index <= 0) return;

        const orderedIds = prompts.map((prompt) => prompt.id);
        [orderedIds[index - 1], orderedIds[index]] = [orderedIds[index], orderedIds[index - 1]];

        try {
            await reorder(orderedIds);
        } catch (reorderError) {
            const errorMessage = reorderError instanceof Error ? reorderError.message : "Failed to reorder prompts";
            toast.error(errorMessage);
        }
    };

    const handleMoveDown = async (id: string) => {
        const index = prompts.findIndex((prompt) => prompt.id === id);
        if (index < 0 || index >= prompts.length - 1) return;

        const orderedIds = prompts.map((prompt) => prompt.id);
        [orderedIds[index], orderedIds[index + 1]] = [orderedIds[index + 1], orderedIds[index]];

        try {
            await reorder(orderedIds);
        } catch (reorderError) {
            const errorMessage = reorderError instanceof Error ? reorderError.message : "Failed to reorder prompts";
            toast.error(errorMessage);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportPromptsAsSqliteZip();
            toast.success("Prompts exported as SQLite bundle");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        setImporting(true);
        try {
            const result = await mergePromptsFromSqliteZip(file);
            await refresh();
            toast.success(`Imported ${result.promptCount} prompt(s)`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Import failed");
        } finally {
            setImporting(false);
        }
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity -- file drop handler with multi-format parsing
    const handleFileDrop = async (files: File[]) => {
        const textFiles = files.filter(f =>
            f.name.endsWith(".txt") || f.name.endsWith(".md") || f.name.endsWith(".prompt") || f.type.startsWith("text/")
        );
        const jsonFiles = files.filter(f => f.name.endsWith(".json"));

        if (textFiles.length === 0 && jsonFiles.length === 0) {
            toast.error("Drop .txt, .md, .prompt, or .json files to create prompts");
            return;
        }

        let created = 0;

        // Handle JSON files: expect array of {name, text}
        for (const file of jsonFiles) {
            try {
                const raw = await file.text();
                const parsed = JSON.parse(raw);
                const entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.prompts) ? parsed.prompts : []);
                for (const entry of entries) {
                    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
                    const text = typeof entry?.text === "string" ? entry.text : "";
                    if (!name || !text) continue;
                    await save({ name, text, category: typeof entry.category === "string" ? entry.category : undefined });
                    created++;
                }
            } catch {
                toast.error(`Failed to parse ${file.name} as JSON`);
            }
        }

        // Handle text files
        for (const file of textFiles) {
            try {
                const text = await file.text();
                const name = file.name.replace(/\.(txt|md|prompt)$/i, "").replace(/[-_]+/g, " ").trim() || "Untitled";
                await save({ name, text });
                created++;
            } catch {
                toast.error(`Failed to read ${file.name}`);
            }
        }

        if (created > 0) {
            toast.success(`Created ${created} prompt(s) from files`);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs text-muted-foreground">
                    {prompts.length} total
                </span>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} disabled={exporting} title="Export prompts">
                        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => importFileRef.current?.click()} disabled={importing} title="Import prompts">
                        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
                    </Button>
                    <input ref={importFileRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={async () => {
                            setReseeding(true);
                            try {
                                await reseedDefaults();
                                toast.success("Default prompts reseeded");
                            } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Reseed failed");
                            } finally {
                                setReseeding(false);
                            }
                        }}
                        disabled={reseeding}
                        title="Reseed default prompts"
                    >
                        {reseeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                            setViewingPrompt(null);
                            setEditingPrompt(null);
                            setIsAdding(true);
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Category filter */}
                {categories.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex gap-0.5 rounded-md border border-border p-0.5 flex-wrap">
                            <Button
                                variant={categoryFilter === "all" ? "default" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setCategoryFilter("all")}
                            >
                                All
                            </Button>
                            {categories.map(cat => (
                                <Button
                                    key={cat}
                                    variant={categoryFilter === cat ? "default" : "ghost"}
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setCategoryFilter(cat)}
                                >
                                    {cat}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Add form */}
                {isAdding && (
                    <PromptEditForm
                        categories={categories}
                        onSave={handleSave}
                        onCancel={() => setIsAdding(false)}
                    />
                )}

                {/* Edit form */}
                {editingPrompt && !isAdding && (
                    <PromptEditForm
                        initial={editingPrompt}
                        categories={categories}
                        onSave={handleSave}
                        onCancel={() => setEditingPrompt(null)}
                    />
                )}

                {/* Prompt list */}
                <div className="rounded-md border border-border">
                    {prompts.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                            {loading ? "Loading..." : "No prompts configured."}
                        </div>
                    ) : (
                        prompts.map((p, i) => (
                            <PromptRow
                                key={p.id}
                                prompt={p}
                                index={i}
                                total={prompts.length}
                                onEdit={(prompt) => {
                                    setViewingPrompt(null);
                                    setIsAdding(false);
                                    setEditingPrompt(prompt);
                                }}
                                onDelete={handleDelete}
                                onMoveUp={handleMoveUp}
                                onMoveDown={handleMoveDown}
                                onToggleFavorite={handleToggleFavorite}
                                onView={(prompt) => {
                                    setEditingPrompt(null);
                                    setIsAdding(false);
                                    setViewingPrompt(prompt);
                                }}
                                libraryAssets={libraryAssets}
                            />
                        ))
                    )}
                </div>

                {/* Drop zone for creating prompts from files */}
                <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                        dragOver
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/40"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const files = Array.from(e.dataTransfer.files);
                        if (files.length > 0) void handleFileDrop(files);
                    }}
                >
                    <FileUp className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                        Drop <code className="text-[10px]">.txt</code>, <code className="text-[10px]">.md</code>, <code className="text-[10px]">.prompt</code>, or <code className="text-[10px]">.json</code> files to create prompts
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        JSON: array of <code className="text-[10px]">{"{ name, text }"}</code> or <code className="text-[10px]">{"{ prompts: [...] }"}</code>
                    </p>
                </div>

                <p className="text-[10px] text-muted-foreground">
                    ⭐ Favorites are pinned to the top. Click a prompt row to view full text. Custom prompts sync via chrome.storage.sync.
                </p>
            </CardContent>

            {/* Full view dialog */}
            {viewingPrompt && (
                <PromptFullView
                    prompt={viewingPrompt}
                    open={true}
                    onClose={() => setViewingPrompt(null)}
                />
            )}
        </Card>
    );
}
