/* eslint-disable @typescript-eslint/no-explicit-any -- untyped extension message types */
/**
 * Marco Extension — Project Database Panel
 *
 * UI for managing per-project SQLite tables: create, browse, and delete tables.
 * See spec/05-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Database, RefreshCw, Table2, Code, FileDown, Loader2, Layers, KeyRound, AlertTriangle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { sendMessage } from "@/lib/message-client";
import { JsonSchemaTab } from "./JsonSchemaTab";
import { ColumnEditor, type ColumnDefinition } from "./ColumnEditor";
import { SchemaTab } from "./SchemaTab";
import { ErrorModal } from "./ErrorModal";
import { createErrorModel, type ErrorModel } from "@/types/error-model";
import { DEFAULT_PROJECT_DATABASES, DATABASE_KINDS, MAX_USER_DATABASES, validateNamespace, type NamespaceDatabaseRequest } from "@/types/default-databases";
import { CreateDatabaseForm } from "./CreateDatabaseForm";
import { DefaultDatabasesStatus } from "./DefaultDatabasesStatus";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColumnDef {
  Name: string;
  Type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
  Nullable?: boolean;
  Unique?: boolean;
  Default?: string;
}

interface TableInfo {
  TableName: string;
  ColumnDefs: string;
  EndpointName: string | null;
}

interface ProjectDatabasePanelProps {
  projectId: string;
  projectSlug: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function ProjectDatabasePanel({ projectId, projectSlug }: ProjectDatabasePanelProps) {
  void projectId; // reserved for future use
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [userDbCount, setUserDbCount] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateDbForm, setShowCreateDbForm] = useState(false);

  // Create form state
  const [newTableName, setNewTableName] = useState("");
  const [newColumns, setNewColumns] = useState<ColumnDefinition[]>([
    { name: "", type: "TEXT" },
  ]);
  const [modalError, setModalError] = useState<ErrorModel | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const showError = useCallback((err: unknown, operation: string, context?: Record<string, unknown>) => {
    const errModel = createErrorModel(err, {
      source: "Database",
      operation,
      projectName: projectSlug,
      contextJson: context ? JSON.stringify(context) : undefined,
      suggestedAction: "Ensure the project slug is set. Try selecting a project from the project list first.",
    });
    setModalError(errModel);
    setErrorModalOpen(true);
  }, [projectSlug]);

  const fetchUserDbCount = useCallback(async () => {
    try {
      const result = await sendMessage<{ isOk: boolean; rows?: Array<{ IsDefault?: number }> }>({
        type: "PROJECT_API",
        project: projectSlug,
        method: "GET",
        endpoint: "ProjectDatabases",
        params: { limit: 100, offset: 0 },
      } as any);
      if (result.isOk && result.rows) {
        const userCreated = result.rows.filter((r) => r.IsDefault !== 1).length;
        setUserDbCount(userCreated);
      }
    } catch {
      // ProjectDatabases table may not exist yet — default to 0
      setUserDbCount(0);
    }
  }, [projectSlug]);

  const refreshTables = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ isOk: boolean; tables?: TableInfo[] }>({
        type: "PROJECT_API",
        project: projectSlug,
        method: "SCHEMA",
        endpoint: "listTables",
        params: {},
      });
      if (result.isOk && result.tables) {
        setTables(result.tables);
      }
    } catch (err) {
      showError(err, "RefreshTables", { type: "PROJECT_API", project: projectSlug });
      setTables([]);
    } finally {
      setLoading(false);
    }
    // Also refresh the user DB count
    void fetchUserDbCount();
  }, [sendMessage, projectSlug, fetchUserDbCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refreshTables();
  }, [refreshTables]);

  const handleCreateTable = async () => {
    const trimmedName = newTableName.trim();
    if (!trimmedName) {
      toast.error("Table name is required");
      return;
    }
    const validColumns = newColumns.filter((c) => c.name.trim()).map((c) => ({
      Name: c.name, Type: c.type, Nullable: c.nullable, Unique: c.unique, Default: c.defaultValue,
    }));
    if (validColumns.length === 0) {
      toast.error("At least one column is required");
      return;
    }

    try {
      const result = await sendMessage<{ isOk: boolean; errorMessage?: string }>({
        type: "PROJECT_DB_CREATE_TABLE",
        project: projectSlug,
        params: {
          tableName: trimmedName,
          columns: validColumns,
        },
      });
      if (result.isOk) {
        toast.success(`Table "${trimmedName}" created`);
        setShowCreateForm(false);
        setNewTableName("");
        setNewColumns([{ name: "", type: "TEXT" }]);
        void refreshTables();
      } else {
        toast.error(result.errorMessage || "Failed to create table");
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDropTable = async (tableName: string) => {
    if (!confirm(`Drop table "${tableName}"? This cannot be undone.`)) return;
    try {
      await sendMessage({
        type: "PROJECT_DB_DROP_TABLE",
        project: projectSlug,
        params: { tableName },
      });
      toast.success(`Table "${tableName}" dropped`);
      void refreshTables();
    } catch (err) {
      toast.error(String(err));
    }
  };

  // Column helpers now handled by ColumnEditor component

  const [downloadingDocs, setDownloadingDocs] = useState(false);

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocs = async (format: "markdown" | "prisma" | "both") => {
    setDownloadingDocs(true);
    try {
      const result = await sendMessage<{ isOk: boolean; markdown?: string; prisma?: string; errorMessage?: string }>({
        type: "GENERATE_SCHEMA_DOCS" as any,
        project: projectSlug,
        format,
      } as any);

      if (!result.isOk) {
        toast.error(result.errorMessage || "Failed to generate docs");
        return;
      }

      if ((format === "markdown" || format === "both") && result.markdown) {
        downloadFile(result.markdown, `${projectSlug}-schema.md`);
      }
      if ((format === "prisma" || format === "both") && result.prisma) {
        downloadFile(result.prisma, `${projectSlug}-schema.prisma`);
      }
      toast.success(format === "both" ? "Schema docs downloaded" : `${format === "markdown" ? "Markdown" : "Prisma"} schema downloaded`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDownloadingDocs(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Project Database</h3>
          <span className="text-xs text-muted-foreground">
            ({tables.length} table{tables.length !== 1 ? "s" : ""})
          </span>
          <Badge variant={userDbCount >= MAX_USER_DATABASES ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
            {userDbCount}/{MAX_USER_DATABASES} databases
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={downloadingDocs || tables.length === 0}>
              {downloadingDocs ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              Schema Docs
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem className="text-xs gap-2" onClick={() => void handleDownloadDocs("both")}>
              📦 Both (Markdown + Prisma)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2" onClick={() => void handleDownloadDocs("markdown")}>
              📝 Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2" onClick={() => void handleDownloadDocs("prisma")}>
              ⚙️ Prisma-style (.prisma)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Database usage progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              userDbCount >= MAX_USER_DATABASES
                ? "bg-destructive"
                : userDbCount >= MAX_USER_DATABASES * 0.8
                  ? "bg-yellow-500"
                  : "bg-primary"
            }`}
            style={{ width: `${Math.min((userDbCount / MAX_USER_DATABASES) * 100, 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {Math.round((userDbCount / MAX_USER_DATABASES) * 100)}%
        </span>
      </div>

      <Tabs defaultValue="tables" className="w-full">
        <TabsList className="h-7">
          <TabsTrigger value="tables" className="text-[10px] h-5 px-2 gap-1">
            <Table2 className="h-3 w-3" /> Tables
          </TabsTrigger>
          <TabsTrigger value="json-schema" className="text-[10px] h-5 px-2 gap-1">
            <Code className="h-3 w-3" /> Raw JSON
          </TabsTrigger>
          <TabsTrigger value="schema" className="text-[10px] h-5 px-2 gap-1">
            <Layers className="h-3 w-3" /> Schema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="mt-3 space-y-4">
          {/* Default databases status */}
          <DefaultDatabasesStatus projectSlug={projectSlug} />

          {/* Actions bar */}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => void refreshTables()} className="h-7 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowCreateDbForm(!showCreateDbForm); setShowCreateForm(false); }} className="h-7 text-xs">
              <Database className="h-3 w-3 mr-1" /> Create Database
            </Button>
            <Button size="sm" onClick={() => { setShowCreateForm(!showCreateForm); setShowCreateDbForm(false); }} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Create Table
            </Button>
          </div>

          {/* Create database form (namespace-based) */}
          {showCreateDbForm && (
            <CreateDatabaseForm
              projectSlug={projectSlug}
              userDbCount={userDbCount}
              onCreated={() => { setShowCreateDbForm(false); void refreshTables(); }}
              onCancel={() => setShowCreateDbForm(false)}
            />
          )}

          {/* Create table form */}
          {showCreateForm && (
            <Card className="border-primary/30">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">New Table</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <Input
                  placeholder="TableName (PascalCase)"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="h-8 text-sm"
                />
                <ColumnEditor
                  columns={newColumns}
                  onChange={setNewColumns}
                  advanced
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)} className="h-7 text-xs">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void handleCreateTable()} className="h-7 text-xs">
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table list */}
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
          ) : tables.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Table2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No tables yet. Create one to get started.</p>
              <p className="text-xs mt-1">Tables are stored in a per-project SQLite database.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Table</TableHead>
                  <TableHead className="text-xs">Columns</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => {
                  const cols: ColumnDef[] = (() => {
                    try { return JSON.parse(t.ColumnDefs); } catch { return []; }
                  })();
                  return (
                    <TableRow key={t.TableName}>
                      <TableCell className="text-xs font-mono font-medium">{t.TableName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cols.map((c) => `${c.Name} (${c.Type})`).join(", ")}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {t.EndpointName || t.TableName.toLowerCase()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDropTable(t.TableName)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="json-schema" className="mt-3">
          <JsonSchemaTab
            projectSlug={projectSlug}
            onMigrationComplete={() => void refreshTables()}
          />
        </TabsContent>

        <TabsContent value="schema" className="mt-3">
          <SchemaTab
            projectSlug={projectSlug}
            onMigrationComplete={() => void refreshTables()}
          />
        </TabsContent>
      </Tabs>
      <ErrorModal error={modalError} open={errorModalOpen} onOpenChange={setErrorModalOpen} />
    </div>
  );
}
