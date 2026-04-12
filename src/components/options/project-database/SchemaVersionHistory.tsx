/**
 * SchemaVersionHistory — Schema version tracking and rollback
 *
 * Stores schema snapshots in the project's KV store and allows
 * restoring previous versions to the visual builder.
 */

import type { JsonValue } from "@/background/handlers/handler-types";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";
import {
  History, RotateCcw, Loader2, Save, Trash2,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SchemaSnapshot {
  id: string;
  label: string;
  savedAt: string;
  tableCount: number;
  tables: Record<string, JsonValue>[];
}

interface SchemaVersionHistoryProps {
  projectSlug: string;
  currentTables: Record<string, unknown>[];
  onRestore: (tables: Record<string, unknown>[]) => void;
}

const KV_KEY = "schema_version_history";

// eslint-disable-next-line max-lines-per-function
export function SchemaVersionHistory({
  projectSlug,
  currentTables,
  onRestore,
}: SchemaVersionHistoryProps) {
  const [versions, setVersions] = useState<SchemaSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await sendMessage<{ isOk: boolean; value?: string }>({
        type: "KV_GET",
        project: projectSlug,
        key: KV_KEY,
      });
      if (resp.isOk && resp.value) {
        try {
          const parsed = JSON.parse(resp.value);
          setVersions(Array.isArray(parsed) ? parsed : []);
        } catch {
          setVersions([]);
        }
      } else {
        setVersions([]);
      }
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const saveVersion = async () => {
    if (!Array.isArray(currentTables) || currentTables.length === 0) {
      toast.error("No tables to save");
      return;
    }

    const snapshot: SchemaSnapshot = {
      id: Date.now().toString(36),
      label: `v${versions.length + 1}`,
      savedAt: new Date().toISOString(),
      tableCount: currentTables.length,
      tables: currentTables,
    };

    const updated = [snapshot, ...versions].slice(0, 20); // keep max 20

    try {
      await sendMessage({
        type: "KV_SET",
        project: projectSlug,
        key: KV_KEY,
        value: JSON.stringify(updated),
      });
      setVersions(updated);
      toast.success(`Saved as ${snapshot.label}`);
    } catch (err) {
      toast.error("Failed to save version");
    }
  };

  const deleteVersion = async (id: string) => {
    const updated = versions.filter((v) => v.id !== id);
    try {
      await sendMessage({
        type: "KV_SET",
        project: projectSlug,
        key: KV_KEY,
        value: JSON.stringify(updated),
      });
      setVersions(updated);
      toast.success("Version deleted");
    } catch {
      toast.error("Failed to delete version");
    }
  };

  const handleRestore = (snapshot: SchemaSnapshot) => {
    onRestore(snapshot.tables);
    toast.success(`Restored ${snapshot.label} (${snapshot.tableCount} tables)`);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <History className="h-3 w-3" />
            Version History
            {versions.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-1">
                {versions.length}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void saveVersion()}
          disabled={!Array.isArray(currentTables) || currentTables.length === 0}
          className="h-6 text-[10px] gap-1 ml-auto"
        >
          <Save className="h-2.5 w-2.5" /> Save Snapshot
        </Button>
      </div>

      <CollapsibleContent>
        {loading && (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}

        {!loading && versions.length === 0 && (
          <p className="text-[10px] text-muted-foreground py-2">
            No saved versions yet. Click "Save Snapshot" to create one.
          </p>
        )}

        {versions.length > 0 && (
          <div className="space-y-1 mt-1.5">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 px-2 py-1 rounded-md border text-xs hover:bg-accent/30 transition-colors"
              >
                <Badge variant="secondary" className="text-[9px] shrink-0">
                  {v.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground truncate flex-1">
                  {new Date(v.savedAt).toLocaleString()} · {v.tableCount} table
                  {v.tableCount !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRestore(v)}
                  className="h-5 px-1.5 text-[10px] gap-0.5"
                >
                  <RotateCcw className="h-2.5 w-2.5" /> Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteVersion(v.id)}
                  className="h-5 w-5 p-0 text-destructive"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
