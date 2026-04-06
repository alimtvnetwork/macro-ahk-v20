/**
 * ScriptBundlesListView — Card-based list of script bundles
 * Mirrors the ProjectsListView pattern.
 */
import { useState, useRef } from "react";
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
import { Plus, Pencil, Trash2, FileCode, FileJson, Upload } from "lucide-react";
import type { StoredScript, StoredConfig } from "@/hooks/use-projects-scripts";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  scripts: StoredScript[];
  configs: StoredConfig[];
  loading: boolean;
  onNew: () => void;
  onEdit: (scriptId: string) => void;
  onDelete: (id: string) => Promise<void>;
  onFileDrop: (files: FileList) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScriptBundlesListView({
  scripts,
  configs,
  loading,
  onNew,
  onEdit,
  onDelete,
  onFileDrop,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading scripts…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between anim-fade-in-down">
        <h2 className="text-xl font-bold tracking-tight uppercase">Scripts</h2>
        <div className="hover-scale-sm">
          <Button
            onClick={onNew}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Script
          </Button>
        </div>
      </div>

      <hr className="border-border" />

      {/* Drop zone */}
      <label
        className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) onFileDrop(e.dataTransfer.files);
        }}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Drop <code className="bg-muted px-1 rounded text-[10px]">.js</code> or{" "}
          <code className="bg-muted px-1 rounded text-[10px]">.json</code> files here, or click to browse
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".js,.mjs,.json"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onFileDrop(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </label>

      {/* Script cards */}
      <div className="space-y-4">
        {scripts.map((script, index) => {
          const bindingIds = script.configBinding
            ? script.configBinding.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
          const boundConfigs = bindingIds
            .map((id) => configs.find((c) => c.id === id))
            .filter((c): c is StoredConfig => c !== undefined);

          return (
            <ScriptCard
              key={script.id}
              script={script}
              boundConfigs={boundConfigs}
              index={index}
              onEdit={() => onEdit(script.id)}
              onDelete={async () => {
                await onDelete(script.id);
                toast.success("Script deleted");
              }}
            />
          );
        })}

        {scripts.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center anim-fade-in-up anim-delay-2">
            No scripts yet. Click "New Script" or drop files to create one.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Script Card                                                        */
/* ------------------------------------------------------------------ */

interface ScriptCardProps {
  script: StoredScript;
  boundConfigs: StoredConfig[];
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

function ScriptCard({ script, boundConfigs, index, onEdit, onDelete }: ScriptCardProps) {
  const codeSize = script.code?.length ?? 0;
  const sizeLabel = codeSize > 1024
    ? `${(codeSize / 1024).toFixed(1)}KB`
    : `${codeSize} chars`;

  return (
    <div
      className="anim-fade-in-up hover-lift"
      style={{ animationDelay: `${0.06 * index}s` }}
    >
      <Card className="border border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
        <CardContent className="p-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <FileCode className="h-4 w-4 text-primary/60 shrink-0" />
              <h3
                className="text-base font-semibold text-primary cursor-pointer hover:underline hover:translate-x-0.5 transition-transform"
                onClick={onEdit}
              >
                {script.name || "(Unnamed Script)"}
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {script.runAt === "document_start" ? "Start" : script.runAt === "document_end" ? "End" : "Idle"}
              </Badge>
              {script.isIife && (
                <Badge variant="secondary" className="text-[10px]">IIFE</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {sizeLabel}
              {boundConfigs.length > 0 && ` · ${boundConfigs.length} config${boundConfigs.length !== 1 ? "s" : ""}`}
            </p>
            {boundConfigs.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-0.5">
                {boundConfigs.map((cfg) => (
                  <Badge key={cfg.id} variant="outline" className="text-[9px] gap-1 text-primary/70">
                    <FileJson className="h-2.5 w-2.5" /> {cfg.name}
                  </Badge>
                ))}
              </div>
            )}
            {script.description && (
              <p className="text-xs text-muted-foreground/80">{script.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hover-scale-sm">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200"
                onClick={onEdit}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </div>
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
                  <AlertDialogTitle>Delete "{script.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
