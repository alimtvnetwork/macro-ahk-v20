/* eslint-disable @typescript-eslint/no-explicit-any, max-lines-per-function -- untyped extension message types */
/**
 * SchemaTab — Visual Table Builder
 *
 * Provides a GUI for creating tables with columns, validation rules,
 * and foreign keys. Integrates ColumnEditor, ValidationRuleEditor,
 * and ForeignKeyEditor into a unified workflow.
 *
 * Generates the JSON schema definition and applies it via APPLY_JSON_SCHEMA.
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ColumnEditor, type ColumnDefinition } from "./ColumnEditor";
import { ValidationRuleEditor, type ValidationRule } from "./ValidationRuleEditor";
import { ForeignKeyEditor, type ForeignKeyDefinition } from "./ForeignKeyEditor";
import { SchemaDiffPreview } from "./SchemaDiffPreview";
import { SchemaVersionHistory } from "./SchemaVersionHistory";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";
import { ErrorModal } from "./ErrorModal";
import { createErrorModel, type ErrorModel } from "@/types/error-model";
import {
  Plus, Trash2, ChevronDown, ChevronRight,
  Layers, Save, Loader2, CheckCircle2, AlertCircle,
  Download, Upload, DatabaseBackup,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColumnWithValidation extends ColumnDefinition {
  validation?: ValidationRule | null;
}

interface TableDefinition {
  name: string;
  description: string;
  columns: ColumnWithValidation[];
  relations: ForeignKeyDefinition[];
  isOpen: boolean;
}

interface SchemaTabProps {
  projectSlug: string;
  onMigrationComplete: () => void;
}

interface ApplyResult {
  isOk: boolean;
  created?: number;
  migrated?: number;
  errors?: string[];
  errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function SchemaTab({ projectSlug, onMigrationComplete }: SchemaTabProps) {
  const [tables, setTables] = useState<TableDefinition[]>([]);
  const [applying, setApplying] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyResult | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [modalError, setModalError] = useState<ErrorModel | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const allTableNames = tables.map((t) => t.name).filter(Boolean);

  const addTable = () => {
    setTables([
      ...tables,
      {
        name: "",
        description: "",
        columns: [{ name: "", type: "TEXT" }],
        relations: [],
        isOpen: true,
      },
    ]);
  };

  const updateTable = (index: number, patch: Partial<TableDefinition>) => {
    setTables(tables.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const removeTable = (index: number) => {
    setTables(tables.filter((_, i) => i !== index));
  };

  const toggleTable = (index: number) => {
    updateTable(index, { isOpen: !tables[index].isOpen });
  };

  /** Load existing schema from DB meta tables */
  const handleLoadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const resp = await sendMessage<{
        isOk: boolean;
        tables?: Array<{ Name: string; Description?: string }>;
        columns?: Array<{ TableName: string; Name: string; Type: string; Nullable?: boolean; Unique?: boolean; DefaultValue?: string; Description?: string }>;
        relations?: Array<{ TableName: string; SourceColumn: string; TargetTable: string; TargetColumn: string; OnDelete?: string }>;
        errorMessage?: string;
      }>({
        type: "GENERATE_SCHEMA_DOCS" as any,
        project: projectSlug,
        format: "meta",
      } as any);

      if (!resp.isOk) {
        toast.error(resp.errorMessage || "Failed to load schema");
        return;
      }

      const metaTables = resp.tables ?? [];
      const metaCols = resp.columns ?? [];
      const metaRels = resp.relations ?? [];

      if (metaTables.length === 0) {
        toast.info("No existing tables found in meta");
        return;
      }

      const loaded: TableDefinition[] = metaTables.map((t) => ({
        name: t.Name,
        description: t.Description ?? "",
        columns: metaCols
          .filter((c) => c.TableName === t.Name)
          .map((c) => ({
            name: c.Name,
            type: (c.Type || "TEXT") as ColumnDefinition["type"],
            nullable: c.Nullable ?? false,
            unique: c.Unique ?? false,
            defaultValue: c.DefaultValue ?? "",
            description: c.Description ?? "",
          })),
        relations: metaRels
          .filter((r) => r.TableName === t.Name)
          .map((r) => ({
            sourceColumn: r.SourceColumn,
            targetTable: r.TargetTable,
            targetColumn: r.TargetColumn || "Id",
            onDelete: (r.OnDelete as any) || "CASCADE",
          })),
        isOpen: false,
      }));

      setTables(loaded);
      toast.success(`Loaded ${loaded.length} table(s) from DB`);
    } catch (err) {
      const errModel = createErrorModel(err, {
        source: "Database",
        operation: "LoadFromDB",
        projectName: projectSlug,
        contextJson: JSON.stringify({ type: "GENERATE_SCHEMA_DOCS", project: projectSlug, format: "meta" }),
        suggestedAction: "Ensure the project slug is set. Try selecting a project from the project list first.",
      });
      setModalError(errModel);
      setErrorModalOpen(true);
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoadingExisting(false);
    }
  }, [projectSlug]);

  /** Export current schema definition as JSON */
  const handleExport = useCallback(() => {
    if (tables.length === 0) {
      toast.error("No tables to export");
      return;
    }
    const exportData = {
      _type: "marco-schema-export",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      tables: tables.map(({ isOpen, ...rest }) => rest),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectSlug}-schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Schema exported");
  }, [tables, projectSlug]);

  /** Import schema definition from JSON */
  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data._type !== "marco-schema-export" || !Array.isArray(data.tables)) {
          toast.error("Invalid schema file");
          return;
        }
        const imported: TableDefinition[] = data.tables.map((t: any) => ({
          name: t.name ?? "",
          description: t.description ?? "",
          columns: Array.isArray(t.columns) ? t.columns : [{ name: "", type: "TEXT" }],
          relations: Array.isArray(t.relations) ? t.relations : [],
          isOpen: false,
        }));
        setTables(imported);
        toast.success(`Imported ${imported.length} table(s)`);
      } catch {
        toast.error("Failed to parse schema file");
      }
    };
    reader.readAsText(file);
  }, []);

  /** Build JSON schema and apply via APPLY_JSON_SCHEMA */
  const handleApply = useCallback(async () => {
    const validTables = tables.filter((t) => t.name.trim() && t.columns.some((c) => c.name.trim()));
    if (validTables.length === 0) {
      toast.error("Add at least one table with columns");
      return;
    }

    setApplying(true);
    setLastResult(null);

    try {
      const schema = {
        version: "1.0.0",
        tables: validTables.map((t) => {
          const tableDef: Record<string, unknown> = {
            TableName: t.name.trim(),
          };
          if (t.description.trim()) tableDef.Description = t.description.trim();

          tableDef.Columns = t.columns
            .filter((c) => c.name.trim())
            .map((c) => {
              const col: Record<string, unknown> = {
                Name: c.name.trim(),
                Type: c.type,
              };
              if (c.nullable) col.Nullable = true;
              if (c.unique) col.Unique = true;
              if (c.defaultValue) col.Default = c.defaultValue;
              if (c.description) col.Description = c.description;
              if (c.validation) {
                col.Validation = c.validation;
              }
              return col;
            });

          if (t.relations.length > 0) {
            tableDef.Relations = t.relations
              .filter((r) => r.sourceColumn.trim() && r.targetTable.trim())
              .map((r) => ({
                SourceColumn: r.sourceColumn,
                TargetTable: r.targetTable,
                TargetColumn: r.targetColumn || "Id",
                OnDelete: r.onDelete,
              }));
          }

          return tableDef;
        }),
      };

      const result = await sendMessage<ApplyResult>({
        type: "APPLY_JSON_SCHEMA" as any,
        project: projectSlug,
        schema: JSON.stringify(schema),
      } as any);

      setLastResult(result);

      if (result.isOk) {
        toast.success(
          `Schema applied: ${result.created ?? 0} created, ${result.migrated ?? 0} migrated`,
        );
        onMigrationComplete();
      } else {
        toast.error(result.errorMessage || "Schema apply failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResult({ isOk: false, errorMessage: msg });
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }, [tables, projectSlug, onMigrationComplete]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">
            Visual Table Builder
          </span>
          <Badge variant="outline" className="text-[10px]">
            {tables.length} table{tables.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleLoadExisting()}
            disabled={loadingExisting}
            className="h-7 text-xs gap-1"
          >
            {loadingExisting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <DatabaseBackup className="h-3 w-3" />
            )}
            Load from DB
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importRef.current?.click()}
            className="h-7 text-xs gap-1"
          >
            <Upload className="h-3 w-3" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={tables.length === 0}
            className="h-7 text-xs gap-1"
          >
            <Download className="h-3 w-3" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={addTable}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" /> Add Table
          </Button>
          <Button
            size="sm"
            onClick={() => void handleApply()}
            disabled={applying || tables.length === 0}
            className="h-7 text-xs gap-1"
          >
            {applying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Apply Schema
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Result banner */}
      {lastResult && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
            lastResult.isOk
              ? "bg-green-500/10 text-green-700 border border-green-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {lastResult.isOk ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            {lastResult.isOk
              ? `${lastResult.created ?? 0} created, ${lastResult.migrated ?? 0} migrated`
              : lastResult.errorMessage}
          </span>
          {lastResult.errors && lastResult.errors.length > 0 && (
            <span className="text-[10px] opacity-70">
              ({lastResult.errors.length} warning{lastResult.errors.length !== 1 ? "s" : ""})
            </span>
          )}
        </div>
      )}

      {/* Diff preview + Version history */}
      {tables.length > 0 && (
        <div className="space-y-2 border rounded-md p-3">
          <SchemaDiffPreview
            projectSlug={projectSlug}
            pendingTables={tables.map((t) => ({
              name: t.name,
              columns: t.columns.filter((c) => c.name.trim()),
            }))}
          />
          <SchemaVersionHistory
            projectSlug={projectSlug}
            currentTables={tables.map(({ isOpen, ...rest }) => rest)}
            onRestore={(restored) => {
              setTables(
                (restored as any[]).map((t) => ({
                  name: t.name ?? "",
                  description: t.description ?? "",
                  columns: Array.isArray(t.columns) ? t.columns : [],
                  relations: Array.isArray(t.relations) ? t.relations : [],
                  isOpen: false,
                })),
              );
            }}
          />
        </div>
      )}

      {/* Empty state */}
      {tables.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto h-8 w-8 mb-2 opacity-40" />
          <p>No tables defined yet.</p>
          <p className="text-xs mt-1">
            Click "Add Table" to start designing your schema visually.
          </p>
        </div>
      )}

      {/* Table cards */}
      {tables.map((table, tableIdx) => (
        <Card key={tableIdx} className="border-border">
          <Collapsible open={table.isOpen} onOpenChange={() => toggleTable(tableIdx)}>
            <CardHeader className="py-2 px-3">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    {table.isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <Input
                  value={table.name}
                  onChange={(e) => updateTable(tableIdx, { name: e.target.value })}
                  placeholder="TableName (PascalCase)"
                  className="h-7 text-xs font-mono font-semibold flex-1"
                />
                <Input
                  value={table.description}
                  onChange={(e) => updateTable(tableIdx, { description: e.target.value })}
                  placeholder="Description (optional)"
                  className="h-7 text-xs flex-1"
                />
                <Badge variant="outline" className="text-[9px] shrink-0">
                  {table.columns.filter((c) => c.name.trim()).length} col
                  {table.relations.length > 0 && ` · ${table.relations.length} FK`}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTable(tableIdx)}
                  className="h-6 w-6 p-0 text-destructive shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-3 pb-3 space-y-3">
                {/* Columns */}
                <ColumnEditor
                  columns={table.columns}
                  onChange={(cols) =>
                    updateTable(tableIdx, { columns: cols as ColumnWithValidation[] })
                  }
                  advanced
                />

                {/* Per-column validation */}
                {table.columns.some((c) => c.name.trim()) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Column Validation
                    </Label>
                    {table.columns
                      .filter((c) => c.name.trim())
                      .map((col, colIdx) => {
                        const realIdx = table.columns.indexOf(col);
                        return (
                          <div key={colIdx} className="space-y-1">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {col.name}
                            </span>
                            <ValidationRuleEditor
                              rule={col.validation ?? null}
                              onChange={(v) => {
                                const newCols = [...table.columns];
                                newCols[realIdx] = {
                                  ...newCols[realIdx],
                                  validation: v,
                                };
                                updateTable(tableIdx, {
                                  columns: newCols as ColumnWithValidation[],
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Foreign keys */}
                <ForeignKeyEditor
                  relations={table.relations}
                  onChange={(rels) => updateTable(tableIdx, { relations: rels })}
                  availableTables={allTableNames.filter((n) => n !== table.name)}
                  availableColumns={table.columns
                    .map((c) => c.name)
                    .filter(Boolean)}
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}
      <ErrorModal error={modalError} open={errorModalOpen} onOpenChange={setErrorModalOpen} />
    </div>
  );
}
