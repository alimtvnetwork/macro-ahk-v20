/**
 * AutomationView — Spec 21
 *
 * Main view for the Automation tab in Options.
 * Lists chains, allows creation/editing, and shows execution progress.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { AutomationChain, ChainExecutionState } from "@/lib/automation-types";
import { flattenSteps, STEP_TYPE_META } from "@/lib/automation-types";
import { ChainRunner } from "@/lib/chain-runner";
import { ChainBuilder } from "@/components/automation/ChainBuilder";
import { StepCard } from "@/components/automation/StepCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Play, Pause, Square, Trash2, Edit2, Plus, Download, Upload,
  Loader2, Zap, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Local chain storage (localStorage until SQLite wiring)             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "automation_chains";

function loadChains(): AutomationChain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChains(chains: AutomationChain[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chains));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AutomationView() {
  const [chains, setChains] = useState<AutomationChain[]>(() => loadChains());
  const [editing, setEditing] = useState<AutomationChain | "new" | null>(null);
  const [execution, setExecution] = useState<ChainExecutionState | null>(null);
  const runnerRef = useRef<ChainRunner | null>(null);

  // Listen for automation-notify events from the step executor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; level: string };
      const fn = detail.level === "error" ? toast.error
        : detail.level === "warning" ? toast.warning
        : detail.level === "success" ? toast.success
        : toast.info;
      fn(detail.message);
    };
    window.addEventListener("automation-notify", handler);
    return () => window.removeEventListener("automation-notify", handler);
  }, []);

  const persistChains = useCallback((updated: AutomationChain[]) => {
    setChains(updated);
    saveChains(updated);
  }, []);

  const handleSave = useCallback((partial: Partial<AutomationChain>) => {
    const now = new Date().toISOString();
    if (partial.id) {
      // Update
      persistChains(chains.map((c) => c.id === partial.id ? { ...c, ...partial, updatedAt: now } : c));
    } else {
      // Create
      const newChain: AutomationChain = {
        id: `chain_${Date.now()}`,
        projectId: "default",
        name: partial.name ?? "Untitled",
        slug: partial.slug ?? `chain-${Date.now()}`,
        steps: partial.steps ?? [],
        triggerType: partial.triggerType ?? "manual",
        triggerConfig: partial.triggerConfig,
        enabled: partial.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      };
      persistChains([...chains, newChain]);
    }
    setEditing(null);
  }, [chains, persistChains]);

  const handleDelete = useCallback((id: string) => {
    persistChains(chains.filter((c) => c.id !== id));
    toast.success("Chain deleted");
  }, [chains, persistChains]);

  const handleToggle = useCallback((id: string) => {
    persistChains(chains.map((c) => c.id === id ? { ...c, enabled: !c.enabled, updatedAt: new Date().toISOString() } : c));
  }, [chains, persistChains]);

  const handleRun = useCallback((chain: AutomationChain) => {
    const runner = new ChainRunner(chain, setExecution);
    runnerRef.current = runner;
    void runner.run();
  }, []);

  const handlePause = useCallback(() => runnerRef.current?.pause(), []);
  const handleResume = useCallback(() => runnerRef.current?.resume(), []);
  const handleCancel = useCallback(() => { runnerRef.current?.cancel(); }, []);
  const handleDismiss = useCallback(() => { setExecution(null); runnerRef.current = null; }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(chains, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automation-chains.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chains exported");
  }, [chains]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as AutomationChain[];
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        persistChains([...chains, ...imported.map((c) => ({ ...c, id: `chain_${Date.now()}_${Math.random().toString(36).slice(2)}` }))]);
        toast.success(`Imported ${imported.length} chain(s)`);
      } catch {
        toast.error("Failed to import chains");
      }
    };
    input.click();
  }, [chains, persistChains]);

  const isRunning = execution?.status === "running";
  const isPaused = execution?.status === "paused";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" /> Automation Chains
        </h2>
        <p className="text-xs text-muted-foreground">
          Build multi-step automation sequences with conditional branching, DOM interactions, and scheduling.
        </p>
      </div>

      {/* Execution progress */}
      {execution && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                {execution.chainName} — {execution.status}
              </span>
              <div className="flex gap-1">
                {isRunning && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePause}>
                    <Pause className="h-3 w-3" /> Pause
                  </Button>
                )}
                {isPaused && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handleResume}>
                    <Play className="h-3 w-3" /> Resume
                  </Button>
                )}
                {(isRunning || isPaused) && (
                  <Button size="sm" variant="destructive" className="h-6 text-xs gap-1" onClick={handleCancel}>
                    <Square className="h-3 w-3" /> Stop
                  </Button>
                )}
                {!isRunning && !isPaused && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleDismiss}>Dismiss</Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              {execution.flatSteps.map((fs, i) => (
                <StepCard
                  key={i}
                  flatStep={fs}
                  index={i}
                  total={execution.flatSteps.length}
                  status={execution.stepStatuses[i]}
                  editing={false}
                  onChange={() => {}}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                  onRemove={() => {}}
                />
              ))}
            </div>

            {execution.error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {execution.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Editor */}
      {editing && (
        <ChainBuilder
          chain={editing === "new" ? undefined : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Chain list */}
      {!editing && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{chains.length} chain{chains.length !== 1 ? "s" : ""}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleImport}>
                <Upload className="h-3 w-3" /> Import
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleExport} disabled={chains.length === 0}>
                <Download className="h-3 w-3" /> Export
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing("new")}>
                <Plus className="h-3 w-3" /> New Chain
              </Button>
            </div>
          </div>

          {chains.length === 0 && (
            <div className="text-center py-12 text-xs text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No automation chains yet</p>
              <p>Create a chain to automate multi-step workflows.</p>
            </div>
          )}

          {chains.map((chain) => {
            const flat = flattenSteps(chain.steps);
            return (
              <Card key={chain.id} className={!chain.enabled ? "opacity-60" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={chain.enabled} onCheckedChange={() => handleToggle(chain.id)} />
                      <span className="text-sm font-bold">{chain.name}</span>
                      <Badge variant="outline" className="text-[9px] font-mono">{chain.slug}</Badge>
                      <Badge variant="secondary" className="text-[9px]">{chain.triggerType}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" title="Run"
                        disabled={isRunning || !chain.enabled}
                        onClick={() => handleRun(chain)}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(chain)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete chain?</AlertDialogTitle>
                            <AlertDialogDescription>Delete "{chain.name}"? This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(chain.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Step summary */}
                  <div className="flex flex-wrap gap-1.5">
                    {flat.map((fs, i) => {
                      const meta = STEP_TYPE_META[fs.step.type];
                      return (
                        <Badge key={i} variant="outline" className="text-[9px] gap-1" style={{ marginLeft: fs.depth * 8 }}>
                          {meta.icon} {meta.label}
                        </Badge>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    {chain.steps.length} step{chain.steps.length !== 1 ? "s" : ""} · Created {new Date(chain.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
