import { useState, useRef, useCallback, forwardRef } from "react";

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Copy, Trash2, Upload, Download, Database, Loader2, FileText, Settings2, FolderOpen, Merge } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StoredProject } from "@/hooks/use-projects-scripts";
import { exportAllAsSqliteZip, exportProjectAsSqliteZip, importFromSqliteZip, mergeFromSqliteZip, previewSqliteZip, type BundlePreview, type DiffItem } from "@/lib/sqlite-bundle";
import { exportProject } from "@/lib/project-exporter";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  projects: StoredProject[];
  onEdit: (projectId: string) => void;
  onNewProject: () => void;
  onDuplicate: (project: StoredProject) => void;
  onDelete: (id: string) => Promise<void>;
  onImport: (file: File) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export const ProjectsListView = forwardRef<HTMLDivElement, Props>(function ProjectsListView({
  projects,
  onEdit,
  onNewProject,
  onDuplicate,
  onDelete,
  onImport,
}, ref) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sqliteFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("replace");

  const handleImportClick = () => fileRef.current?.click();
  const handleSqliteImportClick = () => {
    if (importMode === "replace") {
      const confirmed = window.confirm(
        "⚠️ Replace All will DELETE all existing projects, scripts, and configs before importing.\n\nThis is destructive and cannot be undone. Continue?"
      );
      if (!confirmed) return;
    }
    sqliteFileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = "";
    }
  };

  const handleExportBundle = useCallback(async () => {
    setExporting(true);
    try {
      await exportAllAsSqliteZip();
      toast.success("Exported all projects as SQLite bundle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleSqliteFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      if (importMode === "replace") {
        const result = await importFromSqliteZip(file);
        toast.success(`Replaced with ${result.projectCount} projects, ${result.scriptCount} scripts, ${result.configCount} configs`);
      } else {
        const result = await mergeFromSqliteZip(file);
        toast.success(`Merged ${result.projectCount} projects, ${result.scriptCount} scripts, ${result.configCount} configs`);
      }
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }, [importMode]);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingFile) return;
    setPreviewOpen(false);
    setImporting(true);
    try {
      const result = await importFromSqliteZip(pendingFile);
      toast.success(
        `Replaced with ${result.projectCount} projects, ${result.scriptCount} scripts, ${result.configCount} configs`,
      );
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
      setPendingFile(null);
      setPreview(null);
    }
  }, [pendingFile]);

  const handleMergeImport = useCallback(async () => {
    if (!pendingFile) return;
    setPreviewOpen(false);
    setImporting(true);
    try {
      const result = await mergeFromSqliteZip(pendingFile);
      toast.success(
        `Merged ${result.projectCount} projects, ${result.scriptCount} scripts, ${result.configCount} configs`,
      );
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Merge failed";
      toast.error(msg);
    } finally {
      setImporting(false);
      setPendingFile(null);
      setPreview(null);
    }
  }, [pendingFile]);

  const handleCancelPreview = useCallback(() => {
    setPreviewOpen(false);
    setPendingFile(null);
    setPreview(null);
  }, []);

  return (
    <div ref={ref} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between anim-fade-in-down">
        <h2 className="text-xl font-bold tracking-tight uppercase">Projects</h2>
        <div className="hover-scale-sm">
          <Button
            onClick={onNewProject}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      <hr className="border-border" />

      {/* Project Cards */}
      <div className="space-y-4">
        {(projects ?? []).map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            index={index}
            onEdit={() => onEdit(project.id)}
            onDuplicate={() => onDuplicate(project)}
            onDelete={() => onDelete(project.id)}
          />
        ))}

        {(projects ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center anim-fade-in-up anim-delay-2">
            No projects yet. Create one to get started.
          </p>
        )}
      </div>

      {/* Import / Export Actions — matches extension layout */}
      <div
        className="flex flex-wrap items-center gap-2 pt-4 border-t border-border anim-fade-in-up anim-delay-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={sqliteFileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleSqliteFileChange}
        />

        <Button
          variant="outline"
          className="gap-2 hover:bg-primary/10 hover:text-primary transition-all duration-200"
          onClick={handleImportClick}
        >
          <Upload className="h-4 w-4" />
          Import JSON
        </Button>

        <Button
          variant="outline"
          className="gap-2 hover:bg-primary/10 hover:text-primary transition-all duration-200"
          onClick={handleSqliteImportClick}
          disabled={importing}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Import SQLite Bundle
        </Button>

        <ToggleGroup
          type="single"
          value={importMode}
          onValueChange={(val) => { if (val) setImportMode(val as "merge" | "replace"); }}
          className="bg-muted/50 border border-border rounded-md p-0.5"
        >
          <ToggleGroupItem value="merge" className="text-xs h-7 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm">
            Merge
          </ToggleGroupItem>
          <ToggleGroupItem value="replace" className="text-xs h-7 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm">
            Replace All
          </ToggleGroupItem>
        </ToggleGroup>

        <Button
          variant="outline"
          className="gap-2 hover:bg-primary/10 hover:text-primary transition-all duration-200"
          onClick={handleExportBundle}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export SQLite Bundle
        </Button>
      </div>

      {/* Bundle Preview Dialog */}
      <BundlePreviewDialog
        open={previewOpen}
        preview={preview}
        importing={importing}
        onConfirm={handleConfirmImport}
        onMerge={handleMergeImport}
        onCancel={handleCancelPreview}
      />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Bundle Preview Dialog                                              */
/* ------------------------------------------------------------------ */

interface BundlePreviewDialogProps {
  open: boolean;
  preview: BundlePreview | null;
  importing: boolean;
  onConfirm: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

// eslint-disable-next-line max-lines-per-function
function BundlePreviewDialog({ open, preview, importing, onConfirm, onMerge, onCancel }: BundlePreviewDialogProps) {
  const [backingUp, setBackingUp] = useState(false);

  if (!preview) return null;

  const handleBackupFirst = async () => {
    setBackingUp(true);
    try {
      await exportAllAsSqliteZip();
      toast.success("Backup saved — you can now safely import");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backup failed";
      toast.error(msg);
    } finally {
      setBackingUp(false);
    }
  };

  const exportDate = preview.exportedAt
    ? new Date(preview.exportedAt).toLocaleString()
    : "Unknown";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Bundle Preview
          </DialogTitle>
          <DialogDescription>
            Review the contents before importing. This will <strong className="text-destructive">replace all existing data</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Exported: {exportDate}
          </p>

          {/* Summary badges */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <FolderOpen className="h-3 w-3" />
              {preview.projectCount} projects
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3 w-3" />
              {preview.scriptCount} scripts
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Settings2 className="h-3 w-3" />
              {preview.configCount} configs
            </Badge>
          </div>

          {/* Detail lists with diff */}
          <ScrollArea className="max-h-48 rounded-md border border-border p-3">
            <div className="space-y-3">
              <DiffSection label="Projects" icon={<FolderOpen className="h-3 w-3 text-primary/60 shrink-0" />} items={preview.projectItems} />
              <DiffSection label="Scripts" icon={<FileText className="h-3 w-3 text-primary/60 shrink-0" />} items={preview.scriptItems} />
              <DiffSection label="Configs" icon={<Settings2 className="h-3 w-3 text-primary/60 shrink-0" />} items={preview.configItems} />
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleBackupFirst}
            disabled={backingUp || importing}
            className="gap-1.5"
          >
            {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Back up first
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              variant="secondary"
              onClick={onMerge}
              disabled={importing || backingUp}
              className="gap-1.5"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              <Merge className="h-4 w-4" />
              Merge
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={importing || backingUp}
              className="gap-1.5"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Replace All
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Diff Section                                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function DiffSection({ label, icon, items }: { label: string; icon: React.ReactNode; items: DiffItem[] }) {
  if (items.length === 0) return null;

  const newCount = items.filter((i) => i.status === "new").length;
  const overwriteCount = items.filter((i) => i.status === "overwrite").length;

  return (
    <TooltipProvider delayDuration={200}>
    <div>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {newCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 cursor-help">
                +{newCount} new
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              Items not found locally — they will be added as new entries.
            </TooltipContent>
          </Tooltip>
        )}
        {overwriteCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 cursor-help">
                {overwriteCount} overwrite
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              Items with matching IDs already exist — they will be replaced with the imported version.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
            {icon}
            <span className="flex-1 truncate">{item.name}</span>
            <span className={`text-[9px] font-medium uppercase tracking-wider ${
              item.status === "new"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}>
              {item.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
    </TooltipProvider>
  );
}


/* ------------------------------------------------------------------ */

interface ProjectCardProps {
  project: StoredProject;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

// eslint-disable-next-line max-lines-per-function
function ProjectCard({ project, index, onEdit, onDuplicate, onDelete }: ProjectCardProps) {
  const [exporting, setExporting] = useState(false);
  const urlCount = project.targetUrls?.length ?? 0;
  const scriptCount = project.scripts?.length ?? 0;
  const configCount = project.configs?.length ?? 0;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportProjectAsSqliteZip(project);
      toast.success(`Exported "${project.name}" as SQLite bundle`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ animationDelay: `${0.05 * index}s`, animationFillMode: 'both' }}>
      <Card className="border border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300">
        <CardContent className="p-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className="text-base font-semibold text-primary cursor-pointer hover:underline hover:translate-x-0.5 transition-transform"
                onClick={onEdit}
              >
                {project.name}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                v{project.version}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {urlCount} URL rules · {scriptCount} scripts · {configCount} configs
            </p>
            {project.description && (
              <p className="text-xs text-muted-foreground/80">{project.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ActionButton label="Edit" icon={<Pencil className="h-3 w-3" />} onClick={onEdit} />
            <ActionButton label="Duplicate" icon={<Copy className="h-3 w-3" />} onClick={onDuplicate} />
            <ActionButton
              label="Export JSON"
              icon={<FileText className="h-3 w-3" />}
              onClick={() => {
                exportProject(project as StoredProject);
                toast.success(`Exported "${project.name}" as JSON manifest`);
              }}
            />
            <ActionButton
              label="Export DB"
              icon={exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
              onClick={handleExport}
            />
            <DeleteButton projectName={project.name} onDelete={onDelete} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/** Animated action button with hover scale. */
function ActionButton({ label, icon, onClick }: ActionButtonProps) {
  return (
    <div className="hover-scale-sm">
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200"
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
    </div>
  );
}

interface DeleteButtonProps {
  projectName: string;
  onDelete: () => void;
}

/** Animated delete button with confirmation dialog. */
function DeleteButton({ projectName, onDelete }: DeleteButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <div className="hover-scale-sm">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{projectName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
