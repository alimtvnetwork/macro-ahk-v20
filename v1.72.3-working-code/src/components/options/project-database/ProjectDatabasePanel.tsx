/**
 * Marco Extension — Project Database Panel
 *
 * UI for managing per-project SQLite tables: create, browse, and delete tables.
 * See spec/12-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Database, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { sendMessage } from "@/lib/message-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColumnDef {
  Name: string;
  Type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
  Nullable?: boolean;
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

export function ProjectDatabasePanel({ projectId, projectSlug }: ProjectDatabasePanelProps) {
  void projectId; // reserved for future use
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newTableName, setNewTableName] = useState("");
  const [newColumns, setNewColumns] = useState<ColumnDef[]>([
    { Name: "", Type: "TEXT" },
  ]);

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
    } catch {
      // DB may not be initialized yet — show empty
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [sendMessage, projectSlug]);

  useEffect(() => {
    void refreshTables();
  }, [refreshTables]);

  const handleCreateTable = async () => {
    const trimmedName = newTableName.trim();
    if (!trimmedName) {
      toast.error("Table name is required");
      return;
    }
    const validColumns = newColumns.filter((c) => c.Name.trim());
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
        setNewColumns([{ Name: "", Type: "TEXT" }]);
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

  const addColumn = () => {
    setNewColumns([...newColumns, { Name: "", Type: "TEXT" }]);
  };

  const updateColumn = (index: number, field: keyof ColumnDef, value: string | boolean) => {
    const updated = [...newColumns];
    updated[index] = { ...updated[index], [field]: value };
    setNewColumns(updated);
  };

  const removeColumn = (index: number) => {
    if (newColumns.length <= 1) return;
    setNewColumns(newColumns.filter((_, i) => i !== index));
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
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void refreshTables()} className="h-7 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Create Table
          </Button>
        </div>
      </div>

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
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Columns (Id, CreatedAt, UpdatedAt added automatically)</p>
              {newColumns.map((col, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="ColumnName"
                    value={col.Name}
                    onChange={(e) => updateColumn(i, "Name", e.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                  <Select value={col.Type} onValueChange={(v) => updateColumn(i, "Type", v)}>
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">TEXT</SelectItem>
                      <SelectItem value="INTEGER">INTEGER</SelectItem>
                      <SelectItem value="REAL">REAL</SelectItem>
                      <SelectItem value="BLOB">BLOB</SelectItem>
                      <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeColumn(i)}
                    disabled={newColumns.length <= 1}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addColumn} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Column
              </Button>
            </div>
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
    </div>
  );
}
