/**
 * ScriptBundleDetailView — Detail/editor view for a single script bundle.
 * Mirrors ProjectDetailView pattern with the bundle editor from ScriptsList.
 */
import { useState, useCallback } from "react";
import { RefreshCw, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, FileCode, FileJson, Upload, ArrowLeft,
  GripVertical, ChevronUp, ChevronDown, X,
} from "lucide-react";
import type { StoredScript, StoredConfig } from "@/hooks/use-projects-scripts";
import { MonacoCodeEditor } from "./LazyMonacoCodeEditor";
import { RunAtSelect, FileDropZone, RUN_AT_OPTIONS } from "./ScriptsList";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BundleJsEntry {
  id: string;
  name: string;
  code: string;
  order: number;
  runAt: string;
}

interface BundleConfigEntry {
  id: string;
  name: string;
  json: string;
  order: number;
}

interface Props {
  script: StoredScript;
  configs: StoredConfig[];
  onSave: (script: Partial<StoredScript>) => Promise<void>;
  onSaveConfig: (config: Partial<StoredConfig>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function validateJson(str: string): boolean {
  try { JSON.parse(str); return true; } catch { return false; }
}

function formatJson(input: unknown): string {
  if (typeof input === "string") {
    try { return JSON.stringify(JSON.parse(input), null, 2); } catch { return input; }
  }
  try { return JSON.stringify(input ?? {}, null, 2); } catch { return "{}"; }
}

/* ------------------------------------------------------------------ */
/*  Entry Row                                                          */
/* ------------------------------------------------------------------ */

function EntryRow({
  icon: Icon,
  name,
  badge,
  isActive,
  onClick,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
}: {
  icon: typeof FileCode;
  name: string;
  badge?: string;
  isActive: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        isActive ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/50"
      }`}
      onClick={onClick}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs flex-1 truncate">{name || "Untitled"}</span>
      {badge && (
        <Badge variant="outline" className="text-[9px] h-4 px-1">{badge}</Badge>
      )}
      <div className="flex gap-0.5 flex-shrink-0">
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={!canMoveUp}
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={!canMoveDown}
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScriptBundleDetailView({ script, configs, onSave, onSaveConfig, onDelete, onBack }: Props) {
  // Parse existing config bindings
  const bindingIds = script.configBinding
    ? script.configBinding.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const initialConfigs: BundleConfigEntry[] = bindingIds
    .map((id, i) => {
      const cfg = configs.find((c) => c.id === id);
      return cfg ? { id: cfg.id, name: cfg.name, json: formatJson(cfg.json), order: i } : null;
    })
    .filter((x): x is BundleConfigEntry => x !== null);

  const [name, setName] = useState(script.name);
  const [description, setDescription] = useState(script.description ?? "");
  const [updateUrl, setUpdateUrl] = useState(script.updateUrl ?? "");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [jsEntries, setJsEntries] = useState<BundleJsEntry[]>([
    { id: script.id, name: script.name, code: script.code, order: 0, runAt: script.runAt ?? "document_idle" },
  ]);
  const [configEntries, setConfigEntries] = useState<BundleConfigEntry[]>(initialConfigs);
  const [editorTab, setEditorTab] = useState<string>("overview");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setDirty] = useState(false);

  const makeJsId = () => `js_${crypto.randomUUID().slice(0, 8)}`;
  const makeConfigId = () => `cfg_${crypto.randomUUID().slice(0, 8)}`;

  const markDirty = () => setDirty(true);

  /* -- JS entry management -- */
  const addJsEntry = (entryName = "", code = "") => {
    const entry: BundleJsEntry = { id: makeJsId(), name: entryName, code, order: jsEntries.length, runAt: "document_idle" };
    setJsEntries((prev) => [...prev, entry]);
    setEditorTab(entry.id);
    markDirty();
  };

  const updateJsEntry = (id: string, patch: Partial<BundleJsEntry>) => {
    setJsEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
    markDirty();
  };

  const removeJsEntry = (id: string) => {
    setJsEntries((prev) => prev.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })));
    if (editorTab === id) setEditorTab("overview");
    markDirty();
  };

  const moveJsEntry = (id: string, direction: -1 | 1) => {
    setJsEntries((prev) => {
      const entries = [...prev];
      const idx = entries.findIndex((e) => e.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= entries.length) return prev;
      [entries[idx], entries[newIdx]] = [entries[newIdx], entries[idx]];
      return entries.map((e, i) => ({ ...e, order: i }));
    });
    markDirty();
  };

  /* -- Config entry management -- */
  const addConfigEntry = (entryName = "", json = "{}") => {
    const entry: BundleConfigEntry = { id: makeConfigId(), name: entryName, json: formatJson(json), order: configEntries.length };
    setConfigEntries((prev) => [...prev, entry]);
    setEditorTab(entry.id);
    markDirty();
  };

  const addExistingConfig = (configId: string) => {
    if (configId === "__none__") return;
    if (configEntries.some((c) => c.id === configId)) { toast.info("Config already added"); return; }
    const cfg = configs.find((c) => c.id === configId);
    if (!cfg) return;
    setConfigEntries((prev) => [...prev, { id: cfg.id, name: cfg.name, json: formatJson(cfg.json), order: prev.length }]);
    markDirty();
  };

  const updateConfigEntry = (id: string, patch: Partial<BundleConfigEntry>) => {
    setConfigEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
    markDirty();
  };

  const removeConfigEntry = (id: string) => {
    setConfigEntries((prev) => prev.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })));
    if (editorTab === id) setEditorTab("overview");
    markDirty();
  };

  const moveConfigEntry = (id: string, direction: -1 | 1) => {
    setConfigEntries((prev) => {
      const entries = [...prev];
      const idx = entries.findIndex((e) => e.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= entries.length) return prev;
      [entries[idx], entries[newIdx]] = [entries[newIdx], entries[idx]];
      return entries.map((e, i) => ({ ...e, order: i }));
    });
    markDirty();
  };

  /* -- Save -- */
  const handleSave = useCallback(async () => {
    if (!name.trim()) { toast.error("Script name is required"); return; }
    if (jsEntries.length === 0) { toast.error("At least one JavaScript file is required"); return; }

    for (const cfg of configEntries) {
      if (!validateJson(cfg.json)) { toast.error(`Config "${cfg.name}" has invalid JSON`); return; }
      await onSaveConfig({ id: cfg.id.startsWith("cfg_") ? undefined : cfg.id, name: cfg.name, json: cfg.json });
    }

    setIsSaving(true);
    const sortedJs = [...jsEntries].sort((a, b) => a.order - b.order);
    const primaryJs = sortedJs[0];
    const combinedCode = sortedJs.length === 1
      ? primaryJs.code
      : sortedJs.map((js) => `// === ${js.name || "script"}.js (order: ${js.order}) ===\n${js.code}`).join("\n\n");

    const bindingStr = configEntries.length > 0
      ? [...configEntries].sort((a, b) => a.order - b.order).map((c) => c.id).join(",")
      : undefined;

    await onSave({
      id: script.id,
      name: name.trim(),
      description: description.trim() || undefined,
      code: combinedCode,
      order: script.order,
      runAt: primaryJs.runAt as StoredScript["runAt"],
      configBinding: bindingStr,
      updateUrl: updateUrl.trim() || undefined,
    });

    setIsSaving(false);
    setDirty(false);
    toast.success("Script saved");
  }, [name, description, jsEntries, configEntries, script, onSave, onSaveConfig]);

  /* -- Delete -- */
  const handleDelete = async () => {
    await onDelete(script.id);
    toast.success("Script deleted");
    onBack();
  };

  /* -- Active entries -- */
  const activeJsEntry = jsEntries.find((e) => e.id === editorTab);
  const activeConfigEntry = configEntries.find((e) => e.id === editorTab);
  const unboundConfigs = configs.filter((c) => !configEntries.some((b) => b.id === c.id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/15 hover:text-primary" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{name || "(Unnamed Script)"}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px]">
                {jsEntries.length} JS · {configEntries.length} configs
              </Badge>
              {isDirty && <span className="text-[10px] text-primary font-medium">● Unsaved changes</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{name}"?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Meta fields */}
      <Card className="border-primary/20">
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Script name"
              value={name}
              className="flex-1"
              onChange={(e) => { setName(e.target.value); markDirty(); }}
            />
          </div>
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          />

          {/* Update URL */}
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Update URL</span>
            </div>
            <Input
              placeholder="https://example.com/script.js"
              value={updateUrl}
              className="flex-1 h-8 text-xs font-mono"
              onChange={(e) => { setUpdateUrl(e.target.value); markDirty(); }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!updateUrl.trim() || isCheckingUpdate}
              className="h-8 text-xs gap-1.5 shrink-0 hover:bg-primary/10 hover:text-primary transition-all duration-200"
              onClick={async () => {
                if (!updateUrl.trim()) return;
                setIsCheckingUpdate(true);
                try {
                  const res = await fetch(updateUrl.trim());
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const text = await res.text();
                  if (!text.trim()) throw new Error("Empty response");

                  // Update the primary JS entry with fetched code
                  const primaryId = jsEntries[0]?.id;
                  if (primaryId) {
                    updateJsEntry(primaryId, { code: text });
                    toast.success(`Script updated from remote (${(text.length / 1024).toFixed(1)}KB)`);
                  }
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "Unknown error";
                  toast.error(`Update failed: ${msg}`);
                } finally {
                  setIsCheckingUpdate(false);
                }
              }}
            >
              <RefreshCw className={`h-3 w-3 ${isCheckingUpdate ? "animate-spin" : ""}`} />
              {isCheckingUpdate ? "Checking…" : "Fetch"}
            </Button>
          </div>
          {script.lastUpdateCheck && (
            <p className="text-[10px] text-muted-foreground pl-[88px]">
              Last checked: {new Date(script.lastUpdateCheck).toLocaleString()}
            </p>
          )}

          {/* Two-column: entries sidebar + editor */}
          <div className="flex gap-3 min-h-[380px]">
            {/* Sidebar: entries list */}
            <div className="w-56 flex-shrink-0 space-y-2 border-r border-border pr-3">
              {/* JSON configs section */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    JSON Configs ({configEntries.length})
                  </span>
                </div>
                {[...configEntries].sort((a, b) => a.order - b.order).map((cfg, i) => (
                  <EntryRow
                    key={cfg.id}
                    icon={FileJson}
                    name={cfg.name}
                    badge={`#${i + 1}`}
                    isActive={editorTab === cfg.id}
                    onClick={() => setEditorTab(cfg.id)}
                    onMoveUp={() => moveConfigEntry(cfg.id, -1)}
                    onMoveDown={() => moveConfigEntry(cfg.id, 1)}
                    onRemove={() => removeConfigEntry(cfg.id)}
                    canMoveUp={i > 0}
                    canMoveDown={i < configEntries.length - 1}
                  />
                ))}
                <div className="flex gap-1 mt-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5" onClick={() => addConfigEntry()}>
                    <Plus className="h-2.5 w-2.5" /> New
                  </Button>
                  {unboundConfigs.length > 0 && (
                    <Select value="__none__" onValueChange={addExistingConfig}>
                      <SelectTrigger className="h-6 text-[10px] flex-1">
                        <SelectValue placeholder="Library…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">From library…</SelectItem>
                        {unboundConfigs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <FileDropZone
                  accept=".json"
                  label="Drop JSON"
                  icon={Upload}
                  onFile={(entryName, content) => {
                    if (!validateJson(content)) { toast.error("Invalid JSON"); return; }
                    addConfigEntry(entryName, content);
                  }}
                  multiple
                />
              </div>

              <div className="border-t border-border my-2" />

              {/* JS files section */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    JavaScript ({jsEntries.length})
                  </span>
                </div>
                {[...jsEntries].sort((a, b) => a.order - b.order).map((js, i) => (
                  <EntryRow
                    key={js.id}
                    icon={FileCode}
                    name={js.name}
                    badge={RUN_AT_OPTIONS.find((o) => o.value === js.runAt)?.label ?? "Idle"}
                    isActive={editorTab === js.id}
                    onClick={() => setEditorTab(js.id)}
                    onMoveUp={() => moveJsEntry(js.id, -1)}
                    onMoveDown={() => moveJsEntry(js.id, 1)}
                    onRemove={() => removeJsEntry(js.id)}
                    canMoveUp={i > 0}
                    canMoveDown={i < jsEntries.length - 1}
                  />
                ))}
                <div className="flex gap-1 mt-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5" onClick={() => addJsEntry()}>
                    <Plus className="h-2.5 w-2.5" /> New
                  </Button>
                </div>
                <FileDropZone
                  accept=".js,.mjs"
                  label="Drop JS"
                  icon={Upload}
                  onFile={(entryName, content) => addJsEntry(entryName, content)}
                  multiple
                />
              </div>
            </div>

            {/* Editor pane */}
            <div className="flex-1 min-w-0">
              {editorTab === "overview" && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <FileCode className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Select a file from the sidebar to edit</p>
                  <p className="text-[10px]">
                    {configEntries.length} config{configEntries.length !== 1 ? "s" : ""} →{" "}
                    {jsEntries.length} script{jsEntries.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {activeJsEntry && (
                <div className="space-y-2 h-full flex flex-col">
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="script-name.js"
                      value={activeJsEntry.name}
                      className="flex-1 h-7 text-xs"
                      onChange={(e) => updateJsEntry(activeJsEntry.id, { name: e.target.value })}
                    />
                    <RunAtSelect
                      value={activeJsEntry.runAt}
                      onChange={(v) => updateJsEntry(activeJsEntry.id, { runAt: v })}
                    />
                  </div>
                  <div className="flex-1 min-h-0">
                    <MonacoCodeEditor
                      language="javascript"
                      value={activeJsEntry.code}
                      onChange={(code) => updateJsEntry(activeJsEntry.id, { code })}
                      height="320px"
                    />
                  </div>
                </div>
              )}

              {activeConfigEntry && (
                <div className="space-y-2 h-full flex flex-col">
                  <Input
                    placeholder="config-name.json"
                    value={activeConfigEntry.name}
                    className="h-7 text-xs"
                    onChange={(e) => updateConfigEntry(activeConfigEntry.id, { name: e.target.value })}
                  />
                  <div className="flex-1 min-h-0">
                    <MonacoCodeEditor
                      language="json"
                      value={activeConfigEntry.json}
                      onChange={(json) => updateConfigEntry(activeConfigEntry.id, { json })}
                      height="320px"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
