import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, Plus, RefreshCw, FolderOpen, FileCode, Settings } from "lucide-react";
import type { BundlePreview, DiffItem } from "@/lib/sqlite-bundle";

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: BundlePreview | null;
  loading: boolean;
  importing: boolean;
  mode: "merge" | "replace";
  onConfirm: () => void;
  onCancel: () => void;
}

function DiffList({ label, icon: Icon, items }: { label: string; icon: React.ElementType; items: DiffItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{items.length}</Badge>
      </div>
      <div className="space-y-0.5 pl-5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            {item.status === "new" ? (
              <Plus className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <RefreshCw className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            <span className="text-foreground truncate">{item.name}</span>
            <Badge
              variant="outline"
              className={`text-[8px] h-3.5 px-1 shrink-0 ${
                item.status === "new"
                  ? "border-emerald-500/30 text-emerald-600"
                  : "border-amber-500/30 text-amber-600"
              }`}
            >
              {item.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  preview,
  loading,
  importing,
  mode,
  onConfirm,
  onCancel,
}: ImportPreviewDialogProps) {
  const isReplace = mode === "replace";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm">Import Preview</DialogTitle>
          <DialogDescription className="text-[11px]">
            Review what will be imported before confirming.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-xs text-muted-foreground">Analyzing bundle…</span>
          </div>
        ) : preview ? (
          <ScrollArea className="max-h-[280px] px-4 pb-3">
            <div className="space-y-3">
              {/* Metadata */}
              {preview.exportedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Exported: {new Date(preview.exportedAt).toLocaleString()}
                </p>
              )}

              {/* Summary badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[9px] gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {preview.projectCount} projects
                </Badge>
                <Badge variant="secondary" className="text-[9px] gap-1">
                  <FileCode className="h-3 w-3" />
                  {preview.scriptCount} scripts
                </Badge>
                <Badge variant="secondary" className="text-[9px] gap-1">
                  <Settings className="h-3 w-3" />
                  {preview.configCount} configs
                </Badge>
              </div>

              {/* Diff lists */}
              <DiffList label="Projects" icon={FolderOpen} items={preview.projectItems} />
              <DiffList label="Scripts" icon={FileCode} items={preview.scriptItems} />
              <DiffList label="Configs" icon={Settings} items={preview.configItems} />

              {/* Replace warning */}
              {isReplace && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[10px] text-destructive leading-relaxed">
                    <strong>Replace All</strong> will delete all existing data before importing.
                    This cannot be undone.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : null}

        <DialogFooter className="px-4 py-3 border-t border-border gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={onCancel}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={`h-7 text-[10px] ${
              isReplace
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
            onClick={onConfirm}
            disabled={loading || importing || !preview}
          >
            {importing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Importing…
              </>
            ) : (
              <>
                {isReplace ? "Replace All & Import" : "Merge & Import"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
