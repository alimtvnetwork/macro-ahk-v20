/**
 * Marco Extension — Default Databases Status Section
 *
 * Shows the system-created default databases (ProjectKv, ProjectMeta) with
 * status badges, entry counts, and quick actions. Allows expanding to browse
 * the KeyValueStore entries.
 *
 * @see spec/11-chrome-extension/90-namespace-database-creation.md
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyRound, Settings2, ChevronDown, ChevronRight, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import { DEFAULT_PROJECT_DATABASES } from "@/types/default-databases";
import { KeyValueBrowser } from "./KeyValueBrowser";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DefaultDatabasesStatusProps {
  projectSlug: string;
}

interface DbStatus {
  name: string;
  exists: boolean;
  rowCount: number;
  loading: boolean;
}

const ICONS: Record<string, typeof KeyRound> = {
  ProjectKv: KeyRound,
  ProjectMeta: Settings2,
};

// eslint-disable-next-line max-lines-per-function -- status grid with expandable cards and inline browsers
export function DefaultDatabasesStatus({ projectSlug }: DefaultDatabasesStatusProps) {
  const [statuses, setStatuses] = useState<DbStatus[]>(
    DEFAULT_PROJECT_DATABASES.map((d) => ({
      name: d.databaseName,
      exists: false,
      rowCount: 0,
      loading: true,
    })),
  );
  const [expandedDb, setExpandedDb] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const updated: DbStatus[] = [];

    for (const def of DEFAULT_PROJECT_DATABASES) {
      const tableName = def.schema.tables[0]?.TableName;
      if (!tableName) {
        updated.push({ name: def.databaseName, exists: false, rowCount: 0, loading: false });
        continue;
      }

      try {
        const result = await sendMessage<{ isOk: boolean; rows?: unknown[]; total?: number }>({
          type: "PROJECT_API" as any,
          project: projectSlug,
          method: "GET",
          endpoint: tableName,
          params: { limit: 1, offset: 0 },
        } as any);

        updated.push({
          name: def.databaseName,
          exists: result.isOk,
          rowCount: result.total ?? 0,
          loading: false,
        });
      } catch {
        updated.push({ name: def.databaseName, exists: false, rowCount: 0, loading: false });
      }
    }

    setStatuses(updated);
  }, [projectSlug]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const toggleExpand = (name: string) => {
    setExpandedDb(expandedDb === name ? null : name);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Default Databases
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refreshStatus()}
          className="h-5 w-5 p-0"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* eslint-disable-next-line max-lines-per-function -- card renderer with expandable sections */}
        {statuses.map((status) => {
          const def = DEFAULT_PROJECT_DATABASES.find((d) => d.databaseName === status.name);
          const Icon = ICONS[status.name] ?? KeyRound;
          const isExpanded = expandedDb === status.name;

          return (
            <Card
              key={status.name}
              className={`cursor-pointer transition-colors hover:bg-muted/30 ${isExpanded ? "col-span-2 border-primary/30" : ""}`}
              onClick={() => toggleExpand(status.name)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{status.name}</span>
                      {status.loading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : status.exists ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {def?.description ?? ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!status.loading && status.exists && (
                      <Badge variant="secondary" className="text-[9px] h-4">
                        {status.rowCount} row{status.rowCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded browser */}
                {isExpanded && status.name === "ProjectKv" && (
                  <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    <KeyValueBrowser projectSlug={projectSlug} />
                  </div>
                )}

                {isExpanded && status.name === "ProjectMeta" && (
                  <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    <p className="text-[10px] text-muted-foreground">
                      Registry of all project databases. Managed automatically by the system.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
