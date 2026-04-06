/**
 * Prompt Chain Panel — Spec 15 T-12
 *
 * UI for creating, editing, and executing prompt chains.
 * Chains = ordered lists of prompts executed sequentially with idle detection.
 */

import { useState, type ReactNode } from "react";
import { usePromptChains, type PromptChain, type ChainStepStatus } from "@/hooks/use-prompt-chains";
import { usePrompts, type PromptEntry } from "@/hooks/use-prompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    Plus,
    Trash2,
    Play,
    Square,
    ChevronUp,
    ChevronDown,
    Link2,
    Save,
    X,
    Check,
    Loader2,
    AlertCircle,
    SkipForward,
    Clock,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Step status badge                                                   */
/* ------------------------------------------------------------------ */

function StepStatusBadge({ status }: { status: ChainStepStatus }) {
    const map: Record<ChainStepStatus, { icon: ReactNode; label: string; cls: string }> = {
        pending: { icon: <Clock className="h-3 w-3" />, label: "Pending", cls: "text-muted-foreground border-border" },
        running: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Running", cls: "text-primary border-primary/40 bg-primary/10" },
        done: { icon: <Check className="h-3 w-3" />, label: "Done", cls: "text-success border-success/40 bg-success/10" },
        error: { icon: <AlertCircle className="h-3 w-3" />, label: "Error", cls: "text-destructive border-destructive/40 bg-destructive/10" },
        skipped: { icon: <SkipForward className="h-3 w-3" />, label: "Skipped", cls: "text-muted-foreground border-border bg-muted/30" },
    };

    const { icon, label, cls } = map[status];

    return (
        <Badge variant="outline" className={`text-[10px] gap-1 ${cls}`}>
            {icon} {label}
        </Badge>
    );
}

/* ------------------------------------------------------------------ */
/*  Chain Editor                                                        */
/* ------------------------------------------------------------------ */

interface ChainEditorProps {
    chain?: PromptChain;
    prompts: PromptEntry[];
    maxLength: number;
    onSave: (chain: Partial<PromptChain>) => Promise<void>;
    onCancel: () => void;
}

function ChainEditor({ chain, prompts, maxLength, onSave, onCancel }: ChainEditorProps) {
    const [name, setName] = useState(chain?.name ?? "");
    const [selectedIds, setSelectedIds] = useState<string[]>(chain?.promptIds ?? []);
    const [timeoutSec, setTimeoutSec] = useState(chain?.timeoutSec ?? 300);
    const [autoSubmit, setAutoSubmit] = useState(chain?.autoSubmit ?? true);
    const [submitDelayMs, setSubmitDelayMs] = useState(chain?.submitDelayMs ?? 200);
    const [saving, setSaving] = useState(false);

    const togglePrompt = (id: string) => {
        setSelectedIds((previous) =>
            previous.includes(id)
                ? previous.filter((value) => value !== id)
                : previous.length < maxLength
                    ? [...previous, id]
                    : previous,
        );
    };

    const moveUp = (index: number) => {
        if (index === 0) return;
        const updated = [...selectedIds];
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        setSelectedIds(updated);
    };

    const moveDown = (index: number) => {
        if (index >= selectedIds.length - 1) return;
        const updated = [...selectedIds];
        [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
        setSelectedIds(updated);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Chain name required");
            return;
        }

        if (selectedIds.length === 0) {
            toast.error("Select at least one prompt");
            return;
        }

        setSaving(true);
        try {
            await onSave({
                id: chain?.id,
                name: name.trim(),
                promptIds: selectedIds,
                timeoutSec,
                autoSubmit,
                submitDelayMs,
                createdAt: chain?.createdAt,
            });
            toast.success(chain ? "Chain updated" : "Chain created");
        } catch (saveError) {
            const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save chain";
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border-primary/30">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm">{chain ? "Edit Chain" : "New Chain"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium">Chain Name</label>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Full Context Workflow" className="h-8 text-xs" />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium">Timeout between steps (seconds)</label>
                    <Input type="number" min={30} max={600} value={timeoutSec} onChange={(event) => setTimeoutSec(Number(event.target.value))} className="h-8 text-xs w-32" />
                </div>

                <div className="flex items-center gap-3">
                    <Switch id="auto-submit" checked={autoSubmit} onCheckedChange={setAutoSubmit} />
                    <Label htmlFor="auto-submit" className="text-xs font-medium cursor-pointer">
                        Auto-submit after injection
                    </Label>
                </div>

                {autoSubmit && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium">Submit delay (ms)</label>
                        <Input type="number" min={0} max={5000} step={50} value={submitDelayMs} onChange={(event) => setSubmitDelayMs(Number(event.target.value))} className="h-8 text-xs w-32" />
                        <p className="text-[10px] text-muted-foreground">Wait time after injection before submitting. Increase for slow editors.</p>
                    </div>
                )}

                {selectedIds.length > 0 && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium">Chain Order ({selectedIds.length}/{maxLength})</label>
                        {selectedIds.map((id, index) => {
                            const prompt = prompts.find((entry) => entry.id === id);
                            return (
                                <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border text-xs">
                                    <span className="text-muted-foreground w-5 text-center font-mono">{index + 1}</span>
                                    <span className="flex-1 truncate">{prompt?.name ?? id}</span>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveUp(index)} disabled={index === 0}>
                                        <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveDown(index)} disabled={index === selectedIds.length - 1}>
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => togglePrompt(id)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Available Prompts</label>
                    <div className="max-h-40 overflow-auto space-y-1">
                        {prompts.filter((prompt) => !selectedIds.includes(prompt.id)).map((prompt) => (
                            <button
                                key={prompt.id}
                                onClick={() => togglePrompt(prompt.id)}
                                disabled={selectedIds.length >= maxLength}
                                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 border border-transparent hover:border-border text-xs transition-colors disabled:opacity-40"
                            >
                                <Plus className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate">{prompt.name}</span>
                                {prompt.category && <Badge variant="outline" className="text-[9px] ml-auto">{prompt.category}</Badge>}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                        <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
                </div>
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

export function PromptChainPanel() {
    const {
        chains,
        loading,
        fatalError,
        save,
        remove,
        execution,
        execute,
        stopExecution,
        clearExecution,
        MAX_CHAIN_LENGTH,
    } = usePromptChains();
    const { prompts, loading: promptsLoading, fatalError: promptsFatalError } = usePrompts();
    const [editing, setEditing] = useState<PromptChain | "new" | null>(null);

    if (fatalError) throw fatalError;
    if (promptsFatalError) throw promptsFatalError;

    if (loading || promptsLoading) {
        return <div className="text-xs text-muted-foreground p-4">Loading chains…</div>;
    }

    const handleRunChain = async (chain: PromptChain) => {
        try {
            await execute(chain, prompts);
        } catch (executionError) {
            const errorMessage = executionError instanceof Error ? executionError.message : "Failed to run chain";
            toast.error(errorMessage);
        }
    };

    const handleDeleteChain = async (chainId: string) => {
        try {
            await remove(chainId);
            toast.success("Chain deleted");
        } catch (deleteError) {
            const errorMessage = deleteError instanceof Error ? deleteError.message : "Failed to delete chain";
            toast.error(errorMessage);
        }
    };

    return (
        <div className="space-y-4">
            {execution && (
                <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold flex items-center gap-2">
                                {execution.isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                                Chain Execution — Step {execution.currentStep + 1}/{execution.totalSteps}
                            </span>
                            {execution.isRunning ? (
                                <Button size="sm" variant="destructive" className="h-6 text-xs gap-1" onClick={stopExecution}>
                                    <Square className="h-3 w-3" /> Stop
                                </Button>
                            ) : (
                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={clearExecution}>
                                    Dismiss
                                </Button>
                            )}
                        </div>
                        <div className="space-y-1">
                            {execution.stepStatuses.map((status, index) => {
                                const promptId = chains.find((chain) => chain.id === execution.chainId)?.promptIds[index];
                                const prompt = prompts.find((entry) => entry.id === promptId);
                                return (
                                    <div key={index} className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground w-5 text-center font-mono">{index + 1}</span>
                                        <span className="flex-1 truncate">{prompt?.name ?? "Unknown"}</span>
                                        <StepStatusBadge status={status} />
                                    </div>
                                );
                            })}
                        </div>
                        {execution.error && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {execution.error}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {editing && (
                <ChainEditor
                    chain={editing === "new" ? undefined : editing}
                    prompts={prompts}
                    maxLength={MAX_CHAIN_LENGTH}
                    onSave={async (chain) => {
                        await save(chain);
                        setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                />
            )}

            {!editing && (
                <>
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{chains.length} chain{chains.length !== 1 ? "s" : ""}</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing("new")}>
                            <Plus className="h-3 w-3" /> New Chain
                        </Button>
                    </div>

                    {chains.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p>No prompt chains yet.</p>
                            <p>Create a chain to run multiple prompts in sequence.</p>
                        </div>
                    )}

                    {chains.map((chain) => (
                        <Card key={chain.id}>
                            <CardContent className="p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold">{chain.name}</span>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6"
                                            title="Run chain"
                                            disabled={execution?.isRunning}
                                            onClick={() => void handleRunChain(chain)}
                                        >
                                            <Play className="h-3 w-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(chain)}>
                                            <Save className="h-3 w-3" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive">
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete chain?</AlertDialogTitle>
                                                    <AlertDialogDescription>Delete "{chain.name}"? This cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => void handleDeleteChain(chain.id)}>Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {chain.promptIds.map((id, index) => {
                                        const prompt = prompts.find((entry) => entry.id === id);
                                        return (
                                            <Badge key={index} variant="secondary" className="text-[10px]">
                                                {index + 1}. {prompt?.name ?? "?"}
                                            </Badge>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    {chain.promptIds.length} step{chain.promptIds.length !== 1 ? "s" : ""} · {chain.timeoutSec}s timeout
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </>
            )}
        </div>
    );
}
