import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, FileCode, FileJson, X, Upload, Eye,
  GripVertical, HelpCircle, ChevronUp, ChevronDown,
} from "lucide-react";
import type { StoredScript, StoredConfig } from "@/hooks/use-projects-scripts";
import { MonacoCodeEditor } from "./LazyMonacoCodeEditor";
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
  scripts: StoredScript[];
  configs: StoredConfig[];
  loading: boolean;
  onSave: (script: Partial<StoredScript>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveConfig: (config: Partial<StoredConfig>) => Promise<void>;
}

interface FormState {
  isOpen: boolean;
  editingId: string | null;
  name: string;
  description: string;
  order: number;
  jsEntries: BundleJsEntry[];
  configEntries: BundleConfigEntry[];
  editorTab: string;
}

const emptyForm: FormState = {
  isOpen: false,
  editingId: null,
  name: "",
  description: "",
  order: 0,
  jsEntries: [],
  configEntries: [],
  editorTab: "overview",
};

/* ------------------------------------------------------------------ */
/*  RunAt helpers                                                       */
/* ------------------------------------------------------------------ */

const RUN_AT_OPTIONS = [
  {
    value: "document_start",
    label: "Start",
    description: "Runs before the DOM is parsed. Use for blocking scripts, early overrides, or intercepting network requests.",
  },
  {
    value: "document_idle",
    label: "Idle",
    description: "Runs after the DOM is fully parsed and initial scripts have executed. Best default for most scripts.",
  },
  {
    value: "document_end",
    label: "End",
    description: "Runs after the page and all resources are fully loaded. Use for post-load cleanup or analytics.",
  },
];

function RunAtLabel({ value }: { value: string }) {
  const opt = RUN_AT_OPTIONS.find((o) => o.value === value);
  return <span>{opt?.label ?? "Idle"}</span>;
}

function RunAtSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue>
            <RunAtLabel value={value} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {RUN_AT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{opt.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs text-xs">
            {RUN_AT_OPTIONS.map((opt) => (
              <div key={opt.value} className="mb-1 last:mb-0">
                <strong>{opt.label}:</strong> {opt.description}
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File Drop Zone                                                     */
/* ------------------------------------------------------------------ */

function FileDropZone({
  accept,
  label,
  icon: Icon,
  onFile,
  multiple = false,
}: {
  accept: string;
  label: string;
  icon: typeof FileCode;
  onFile: (name: string, content: string) => void;
  multiple?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text === "string") {
          onFile(file.name.replace(/\.[^.]+$/, ""), text);
        }
      };
      reader.readAsText(file);
    },
    [onFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      files.forEach(readFile);
    },
    [readFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      files.forEach(readFile);
      e.target.value = "";
    },
    [readFile]
  );

  return (
    <label
      className={`flex flex-col items-center justify-center gap-1.5 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground text-center">{label}</span>
      <input type="file" accept={accept} className="hidden" onChange={handleFileInput} multiple={multiple} />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Orderable Entry Row                                                */
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
/*  View Dialog                                                        */
/* ------------------------------------------------------------------ */

function BundleViewDialog({
  script,
  configs,
  open,
  onClose,
  onEdit,
}: {
  script: StoredScript;
  configs: StoredConfig[];
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const bindingIds = script.configBinding
    ? script.configBinding.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const boundConfigs = bindingIds
    .map((id) => configs.find((c) => c.id === id))
    .filter((c): c is StoredConfig => c !== undefined);

  const [viewTab, setViewTab] = useState("js");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileCode className="h-4 w-4 text-primary" />
              {script.name}
              <Badge variant="secondary" className="text-[10px]">#{script.order}</Badge>
              <Badge variant="outline" className="text-[10px]">
                <RunAtLabel value={script.runAt ?? "document_idle"} />
              </Badge>
            </DialogTitle>
            <Button size="sm" variant="outline" className="gap-1" onClick={onEdit}>
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          </div>
        </DialogHeader>
        <Tabs value={viewTab} onValueChange={setViewTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="h-8">
            <TabsTrigger value="js" className="text-xs gap-1.5 h-7">
              <FileCode className="h-3 w-3" /> JavaScript
            </TabsTrigger>
            {boundConfigs.map((cfg) => (
              <TabsTrigger key={cfg.id} value={cfg.id} className="text-xs gap-1.5 h-7">
                <FileJson className="h-3 w-3" /> {cfg.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="js" className="mt-2 flex-1 min-h-0">
            <MonacoCodeEditor language="javascript" value={script.code} onChange={() => {}} height="400px" readOnly />
          </TabsContent>
          {boundConfigs.map((cfg) => (
            <TabsContent key={cfg.id} value={cfg.id} className="mt-2 flex-1 min-h-0">
              <MonacoCodeEditor language="json" value={formatJson(cfg.json)} onChange={() => {}} height="400px" readOnly />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ScriptsList({ scripts, configs, loading, onSave, onDelete, onSaveConfig }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [viewingScript, setViewingScript] = useState<StoredScript | null>(null);

  /* -- Helpers for bundle entries -- */

  const makeJsId = () => `js_${crypto.randomUUID().slice(0, 8)}`;
  const makeConfigId = () => `cfg_${crypto.randomUUID().slice(0, 8)}`;

  /* -- Open form -- */

  const handleOpen = (script?: StoredScript) => {
    if (!script) {
      // New bundle with one blank JS entry
      setForm({
        ...emptyForm,
        isOpen: true,
        order: scripts.length,
        jsEntries: [{ id: makeJsId(), name: "", code: "", order: 0, runAt: "document_idle" }],
        editorTab: "overview",
      });
      return;
    }

    // Edit existing — parse config bindings
    const bindingIds = script.configBinding
      ? script.configBinding.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const configEntries: BundleConfigEntry[] = bindingIds
      .map((id, i) => {
        const cfg = configs.find((c) => c.id === id);
        return cfg
          ? { id: cfg.id, name: cfg.name, json: formatJson(cfg.json), order: i }
          : null;
      })
      .filter((x): x is BundleConfigEntry => x !== null);

    setForm({
      isOpen: true,
      editingId: script.id,
      name: script.name,
      description: script.description ?? "",
      order: script.order,
      jsEntries: [
        { id: script.id, name: script.name, code: script.code, order: 0, runAt: script.runAt ?? "document_idle" },
      ],
      configEntries,
      editorTab: "overview",
    });
    setViewingScript(null);
  };

  /* -- Save -- */

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Bundle name is required");
      return;
    }
    if (form.jsEntries.length === 0) {
      toast.error("At least one JavaScript file is required");
      return;
    }

    // Validate all JSON configs
    for (const cfg of form.configEntries) {
      if (!validateJson(cfg.json)) {
        toast.error(`Config "${cfg.name}" has invalid JSON`);
        return;
      }
      await onSaveConfig({ id: cfg.id.startsWith("cfg_") ? undefined : cfg.id, name: cfg.name, json: cfg.json });
    }

    // For now, save the first JS entry as the primary script (backwards compatible)
    const sortedJs = [...form.jsEntries].sort((a, b) => a.order - b.order);
    const primaryJs = sortedJs[0];

    // Combine all JS code if multiple entries
    const combinedCode = sortedJs.length === 1
      ? primaryJs.code
      : sortedJs.map((js) => `// === ${js.name || "script"}.js (order: ${js.order}) ===\n${js.code}`).join("\n\n");

    const bindingStr = form.configEntries.length > 0
      ? [...form.configEntries].sort((a, b) => a.order - b.order).map((c) => c.id).join(",")
      : undefined;

    await onSave({
      id: form.editingId ?? undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      code: combinedCode,
      order: form.order,
      runAt: primaryJs.runAt as "document_start" | "document_idle" | "document_end",
      configBinding: bindingStr,
    });

    toast.success(form.editingId ? "Bundle updated" : "Bundle created");
    setForm(emptyForm);
  };

  /* -- Delete -- */

  const handleDelete = async (id: string) => {
    await onDelete(id);
    toast.success("Bundle deleted");
  };

  /* -- JS entry management -- */

  const addJsEntry = (name = "", code = "") => {
    const newEntry: BundleJsEntry = {
      id: makeJsId(),
      name,
      code,
      order: form.jsEntries.length,
      runAt: "document_idle",
    };
    setForm((f) => ({
      ...f,
      jsEntries: [...f.jsEntries, newEntry],
      editorTab: newEntry.id,
    }));
  };

  const updateJsEntry = (id: string, patch: Partial<BundleJsEntry>) => {
    setForm((f) => ({
      ...f,
      jsEntries: f.jsEntries.map((e) => e.id === id ? { ...e, ...patch } : e),
    }));
  };

  const removeJsEntry = (id: string) => {
    setForm((f) => ({
      ...f,
      jsEntries: f.jsEntries.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })),
      editorTab: f.editorTab === id ? "overview" : f.editorTab,
    }));
  };

  const moveJsEntry = (id: string, direction: -1 | 1) => {
    setForm((f) => {
      const entries = [...f.jsEntries];
      const idx = entries.findIndex((e) => e.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= entries.length) return f;
      [entries[idx], entries[newIdx]] = [entries[newIdx], entries[idx]];
      return { ...f, jsEntries: entries.map((e, i) => ({ ...e, order: i })) };
    });
  };

  /* -- Config entry management -- */

  const addConfigEntry = (name = "", json = "{}") => {
    const newEntry: BundleConfigEntry = {
      id: makeConfigId(),
      name,
      json: formatJson(json),
      order: form.configEntries.length,
    };
    setForm((f) => ({
      ...f,
      configEntries: [...f.configEntries, newEntry],
      editorTab: newEntry.id,
    }));
  };

  const addExistingConfig = (configId: string) => {
    if (configId === "__none__") return;
    if (form.configEntries.some((c) => c.id === configId)) {
      toast.info("Config already added");
      return;
    }
    const cfg = configs.find((c) => c.id === configId);
    if (!cfg) return;
    setForm((f) => ({
      ...f,
      configEntries: [
        ...f.configEntries,
        { id: cfg.id, name: cfg.name, json: formatJson(cfg.json), order: f.configEntries.length },
      ],
    }));
  };

  const updateConfigEntry = (id: string, patch: Partial<BundleConfigEntry>) => {
    setForm((f) => ({
      ...f,
      configEntries: f.configEntries.map((e) => e.id === id ? { ...e, ...patch } : e),
    }));
  };

  const removeConfigEntry = (id: string) => {
    setForm((f) => ({
      ...f,
      configEntries: f.configEntries.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })),
      editorTab: f.editorTab === id ? "overview" : f.editorTab,
    }));
  };

  const moveConfigEntry = (id: string, direction: -1 | 1) => {
    setForm((f) => {
      const entries = [...f.configEntries];
      const idx = entries.findIndex((e) => e.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= entries.length) return f;
      [entries[idx], entries[newIdx]] = [entries[newIdx], entries[idx]];
      return { ...f, configEntries: entries.map((e, i) => ({ ...e, order: i })) };
    });
  };

  /* -- File drops -- */

  const handleJsFileDrop = (name: string, content: string) => {
    if (!form.isOpen) {
      setForm({
        ...emptyForm,
        isOpen: true,
        name: name,
        order: scripts.length,
        jsEntries: [{ id: makeJsId(), name, code: content, order: 0, runAt: "document_idle" }],
        configEntries: [],
        editorTab: "overview",
      });
    } else {
      addJsEntry(name, content);
    }
  };

  const handleJsonFileDrop = (name: string, content: string) => {
    if (!validateJson(content)) {
      toast.error("Invalid JSON file");
      return;
    }
    if (!form.isOpen) {
      setForm({
        ...emptyForm,
        isOpen: true,
        name: name,
        order: scripts.length,
        jsEntries: [],
        configEntries: [{ id: makeConfigId(), name, json: formatJson(content), order: 0 }],
        editorTab: "overview",
      });
    } else {
      addConfigEntry(name, content);
    }
  };

  /* -- Unbound configs for picker -- */

  const unboundConfigs = configs.filter(
    (c) => !form.configEntries.some((b) => b.id === c.id)
  );

  /* -- Active editor entry -- */

  const activeJsEntry = form.jsEntries.find((e) => e.id === form.editorTab);
  const activeConfigEntry = form.configEntries.find((e) => e.id === form.editorTab);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading scripts…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Script Bundles</h3>
        <Button size="sm" variant="outline" onClick={() => handleOpen()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Bundle
        </Button>
      </div>

      {/* Drop zones when form is closed */}
      {!form.isOpen && (
        <div className="grid grid-cols-2 gap-3">
          <FileDropZone
            accept=".js,.mjs"
            label="Drop JS files or click to browse"
            icon={FileCode}
            onFile={handleJsFileDrop}
            multiple
          />
          <FileDropZone
            accept=".json"
            label="Drop JSON config files or click to browse"
            icon={FileJson}
            onFile={handleJsonFileDrop}
            multiple
          />
        </div>
      )}

      {/* === BUNDLE EDITOR FORM === */}
      {form.isOpen && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            {/* Meta row */}
            <div className="flex gap-2">
              <Input
                placeholder="Bundle name"
                value={form.name}
                className="flex-1"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                placeholder="Order"
                type="number"
                value={form.order}
                className="w-20"
                onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <Input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />

            {/* Two-column: entries sidebar + editor */}
            <div className="flex gap-3 min-h-[350px]">
              {/* Sidebar: entries list */}
              <div className="w-56 flex-shrink-0 space-y-2 border-r border-border pr-3">
                {/* JSON configs section */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      JSON Configs ({form.configEntries.length})
                    </span>
                  </div>
                  {[...form.configEntries].sort((a, b) => a.order - b.order).map((cfg, i) => (
                    <EntryRow
                      key={cfg.id}
                      icon={FileJson}
                      name={cfg.name}
                      badge={`#${i + 1}`}
                      isActive={form.editorTab === cfg.id}
                      onClick={() => setForm((f) => ({ ...f, editorTab: cfg.id }))}
                      onMoveUp={() => moveConfigEntry(cfg.id, -1)}
                      onMoveDown={() => moveConfigEntry(cfg.id, 1)}
                      onRemove={() => removeConfigEntry(cfg.id)}
                      canMoveUp={i > 0}
                      canMoveDown={i < form.configEntries.length - 1}
                    />
                  ))}
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-1.5"
                      onClick={() => addConfigEntry()}
                    >
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
                    onFile={(name, content) => {
                      if (!validateJson(content)) { toast.error("Invalid JSON"); return; }
                      addConfigEntry(name, content);
                    }}
                    multiple
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-border my-2" />

                {/* JS files section */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      JavaScript ({form.jsEntries.length})
                    </span>
                  </div>
                  {[...form.jsEntries].sort((a, b) => a.order - b.order).map((js, i) => (
                    <EntryRow
                      key={js.id}
                      icon={FileCode}
                      name={js.name}
                      badge={RUN_AT_OPTIONS.find((o) => o.value === js.runAt)?.label ?? "Idle"}
                      isActive={form.editorTab === js.id}
                      onClick={() => setForm((f) => ({ ...f, editorTab: js.id }))}
                      onMoveUp={() => moveJsEntry(js.id, -1)}
                      onMoveDown={() => moveJsEntry(js.id, 1)}
                      onRemove={() => removeJsEntry(js.id)}
                      canMoveUp={i > 0}
                      canMoveDown={i < form.jsEntries.length - 1}
                    />
                  ))}
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-1.5"
                      onClick={() => addJsEntry()}
                    >
                      <Plus className="h-2.5 w-2.5" /> New
                    </Button>
                  </div>
                  <FileDropZone
                    accept=".js,.mjs"
                    label="Drop JS"
                    icon={Upload}
                    onFile={(name, content) => addJsEntry(name, content)}
                    multiple
                  />
                </div>
              </div>

              {/* Editor pane */}
              <div className="flex-1 min-w-0">
                {form.editorTab === "overview" && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <FileCode className="h-8 w-8 opacity-30" />
                    <p className="text-xs">Select a file from the sidebar to edit</p>
                    <p className="text-[10px]">
                      {form.configEntries.length} config{form.configEntries.length !== 1 ? "s" : ""} →{" "}
                      {form.jsEntries.length} script{form.jsEntries.length !== 1 ? "s" : ""}
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
                        height="280px"
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
                        height="280px"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm)}>Cancel</Button>
              <Button size="sm" onClick={handleSave}>
                {form.editingId ? "Update" : "Create"} Bundle
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {scripts.length === 0 && !form.isOpen && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No script bundles yet. Click "New Bundle" or drop files above to create one.
        </p>
      )}

      {/* === BUNDLE CARDS LIST === */}
      {scripts.map((rawScript) => {
        const rawBindingValue = (rawScript as { configBinding?: unknown }).configBinding;
        const normalizedBinding = typeof rawBindingValue === "string"
          ? rawBindingValue
          : Array.isArray(rawBindingValue)
            ? rawBindingValue
                .map((entry) => {
                  if (typeof entry === "string") return entry.trim();
                  if (typeof entry === "number") return String(entry);
                  if (typeof entry === "object" && entry !== null && "id" in entry) {
                    const idValue = (entry as { id?: unknown }).id;
                    return typeof idValue === "string" ? idValue.trim() : "";
                  }
                  return "";
                })
                .filter(Boolean)
                .join(",")
            : "";

        const script: StoredScript = {
          ...rawScript,
          configBinding: normalizedBinding || undefined,
        };

        const bindingIds = normalizedBinding
          ? normalizedBinding.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        const boundConfigs = bindingIds
          .map((id) => configs.find((c) => c.id === id))
          .filter((c): c is StoredConfig => c !== undefined);

        return (
          <Card key={script.id} className="group">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{script.name}</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">#{script.order}</Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <RunAtLabel value={script.runAt ?? "document_idle"} />
                  </Badge>
                  {boundConfigs.map((cfg) => (
                    <Badge key={cfg.id} variant="outline" className="text-[10px] gap-1 text-primary/70">
                      <FileJson className="h-2.5 w-2.5" /> {cfg.name}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewingScript(script)} title="View">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleOpen(script)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{script.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(script.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {script.description && (
                <p className="text-xs text-muted-foreground mt-1">{script.description}</p>
              )}
            </CardHeader>
          </Card>
        );
      })}

      {/* View dialog */}
      {viewingScript && (
        <BundleViewDialog
          script={viewingScript}
          configs={configs}
          open={true}
          onClose={() => setViewingScript(null)}
          onEdit={() => handleOpen(viewingScript)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
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

export { RunAtSelect, RunAtLabel, RUN_AT_OPTIONS, FileDropZone };
