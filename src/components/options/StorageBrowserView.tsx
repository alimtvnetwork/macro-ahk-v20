/**
 * StorageBrowserView — SQLite table & view browser for the Options page.
 *
 * Lists all tables and views in separate sections, shows paginated data grids,
 * supports inline cell editing for simple values and a row editor modal for
 * complex fields. Views are read-only.
 */

import type { SqlValue } from "@/background/handlers/handler-types";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { getPlatform } from "@/platform";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Database,
  Server,
  Cookie as CookieIcon,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Pencil,
  Trash2,
  ArrowLeft,
  Save,
  RotateCcw,
  Eraser,
  Eye,
  Paintbrush,
  FileCode,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { StorageRuntimePanels } from "./StorageRuntimePanels";

const JsonSchemaTab = lazy(() =>
  import("./project-database/JsonSchemaTab").then(m => ({ default: m.JsonSchemaTab }))
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TableInfo {
  name: string;
  rowCount: number;
  primaryKeys: string[];
  isView: boolean;
}

interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

type StorageSurface = "database" | "session" | "cookies" | "indexeddb" | "landing";

/** Columns that should be read-only in the editor. */
const READ_ONLY_COLUMNS = new Set([
  "started_at", "ended_at", "created_at", "updated_at", "timestamp",
]);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
export function StorageBrowserView() {
  const platform = getPlatform();
  const [activeSurface, setActiveSurface] = useState<StorageSurface>("landing");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedIsView, setSelectedIsView] = useState(false);

  const [dbSizeBytes, setDbSizeBytes] = useState<number>(0);

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await platform.sendMessage<{ tables: TableInfo[]; dbSizeBytes?: number }>({
        type: "STORAGE_LIST_TABLES",
      });
      setTables(resp.tables ?? []);
      setDbSizeBytes(resp.dbSizeBytes ?? 0);
    } catch {
      setTables([]);
      setDbSizeBytes(0);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  const handleClearAll = async () => {
    if (!confirm("⚠️ This will DELETE all rows from ALL tables. Are you sure?")) return;
    try {
      const resp = await platform.sendMessage<{ cleared: string[] }>({ type: "STORAGE_CLEAR_ALL" });
      toast.success(`Cleared ${resp.cleared?.length ?? 0} tables`);
      void loadTables();
    } catch {
      toast.error("Failed to clear all tables");
    }
  };

  const handleReseed = async () => {
    if (!confirm("⚠️ This will DELETE all data and re-populate from defaults. Continue?")) return;
    try {
      const resp = await platform.sendMessage<{ seeded: string[] }>({ type: "STORAGE_RESEED" });
      toast.success(`Reseeded: ${resp.seeded?.join(", ") ?? "done"}`);
      void loadTables();
    } catch {
      toast.error("Failed to reseed");
    }
  };

  /* ---- Category stats (hooks must be before early returns) ---- */
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [sessionSize, setSessionSize] = useState(0);
  const [cookieCount, setCookieCount] = useState<number | null>(null);
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [localSize, setLocalSize] = useState(0);

  // Fetch lightweight stats for all categories on mount
  // eslint-disable-next-line max-lines-per-function
  useEffect(() => {
    // Session storage
    try {
      const chromeAny = globalThis as Record<string, unknown>;
      const chromeObj = chromeAny.chrome as Record<string, unknown> | undefined;
      const storageObj = chromeObj?.storage as Record<string, unknown> | undefined;
      const sessionApi = storageObj?.session as { get?: (keys: null, cb: (items: Record<string, unknown>) => void) => void } | undefined;
      if (sessionApi?.get) {
        sessionApi.get(null, (items: Record<string, unknown>) => {
          const keys = Object.keys(items ?? {});
          setSessionCount(keys.length);
          setSessionSize(new TextEncoder().encode(JSON.stringify(items ?? {})).length);
        });
      } else {
        const keys = Object.keys(sessionStorage);
        setSessionCount(keys.length);
        let size = 0;
        for (const k of keys) size += (sessionStorage.getItem(k) ?? "").length * 2;
        setSessionSize(size);
      }
    } catch { setSessionCount(0); }

    // Cookies
    try {
      const chromeAny = globalThis as Record<string, unknown>;
      const chromeObj = chromeAny.chrome as Record<string, unknown> | undefined;
      const cookiesApi = chromeObj?.cookies as { getAll?: (filter: object, cb: (cookies: Array<Record<string, string | number | boolean>>) => void) => void } | undefined;
      if (cookiesApi?.getAll) {
        cookiesApi.getAll({}, (cookies: Array<Record<string, string | number | boolean>>) => {
          setCookieCount(cookies?.length ?? 0);
        });
      } else {
        setCookieCount(document.cookie ? document.cookie.split(";").length : 0);
      }
    } catch { setCookieCount(0); }

    // LocalStorage / chrome.storage.local
    try {
      const chromeAny = globalThis as Record<string, unknown>;
      const chromeObj = chromeAny.chrome as Record<string, unknown> | undefined;
      const storageObj = chromeObj?.storage as Record<string, unknown> | undefined;
      const localApi = storageObj?.local as { get?: (keys: null, cb: (items: Record<string, unknown>) => void) => void } | undefined;
      if (localApi?.get) {
        localApi.get(null, (items: Record<string, unknown>) => {
          const keys = Object.keys(items ?? {});
          setLocalCount(keys.length);
          setLocalSize(new TextEncoder().encode(JSON.stringify(items ?? {})).length);
        });
      } else {
        const keys = Object.keys(localStorage);
        setLocalCount(keys.length);
        let size = 0;
        for (const k of keys) size += (localStorage.getItem(k) ?? "").length * 2;
        setLocalSize(size);
      }
    } catch { setLocalCount(0); }
  }, []);

  const tableItems = tables.filter(t => !t.isView);
  const viewItems = tables.filter(t => t.isView);

  if (selectedTable && activeSurface === "database") {
    const tableInfo = tables.find(t => t.name === selectedTable);
    return (
      <TableDataView
        tableName={selectedTable}
        primaryKeys={tableInfo?.primaryKeys ?? ["id"]}
        isView={selectedIsView}
        onBack={() => { setSelectedTable(null); setSelectedIsView(false); void loadTables(); }}
      />
    );
  }

  const categories: Array<{
    id: StorageSurface;
    label: string;
    subtitle: string;
    icon: typeof Database;
    iconColor: string;
    borderAccent: string;
    stats: string[];
  }> = [
    {
      id: "database",
      label: "Database",
      subtitle: "SQLite",
      icon: Database,
      iconColor: "text-primary",
      borderAccent: "hover:border-primary/40",
      stats: [
        `${tableItems.length} tables`,
        ...(viewItems.length > 0 ? [`${viewItems.length} views`] : []),
        ...(dbSizeBytes > 0 ? [formatBytes(dbSizeBytes)] : []),
      ],
    },
    {
      id: "session",
      label: "Session Storage",
      subtitle: "Transient",
      icon: Server,
      iconColor: "text-amber-500",
      borderAccent: "hover:border-amber-400/40",
      stats: [
        sessionCount !== null ? `${sessionCount} keys` : "Loading…",
        ...(sessionSize > 0 ? [`~${formatBytes(sessionSize)}`] : []),
      ],
    },
    {
      id: "cookies",
      label: "Cookies",
      subtitle: "Browser",
      icon: CookieIcon,
      iconColor: "text-orange-500",
      borderAccent: "hover:border-orange-400/40",
      stats: [
        cookieCount !== null ? `${cookieCount} cookies` : "Loading…",
      ],
    },
    {
      id: "indexeddb",
      label: "IndexedDB / Local",
      subtitle: "Persistent",
      icon: HardDrive,
      iconColor: "text-emerald-500",
      borderAccent: "hover:border-emerald-400/40",
      stats: [
        localCount !== null ? `${localCount} keys` : "Loading…",
        ...(localSize > 0 ? [`~${formatBytes(localSize)}`] : []),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Storage Browser
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Browse, edit, and manage extension data across all storage layers
          </p>
        </div>
      </div>

      {/* Category Cards */}
      {!activeSurface ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => setActiveSurface(cat.id)}
              className={`
                anim-fade-in-up group text-left p-5 rounded-xl border border-border bg-card
                ${cat.borderAccent} hover:shadow-md transition-all duration-200
              `}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg bg-muted/60 ${cat.iconColor}`}>
                  <cat.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">{cat.label}</h3>
              <p className="text-[10px] text-muted-foreground mb-3">{cat.subtitle}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.stats.map((stat) => (
                  <Badge key={stat} variant="secondary" className="text-[10px] font-mono">
                    {stat}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : activeSurface === "database" ? (
        <>
          {/* Back + actions bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setActiveSurface("landing")} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> All Categories
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadTables()} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleClearAll()} className="text-destructive hover:text-destructive">
                <Eraser className="h-3.5 w-3.5 mr-1.5" />
                Clear All
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleReseed()}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reseed
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Tables Section */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Tables
                  <Badge variant="secondary" className="text-[10px]">{tableItems.length}</Badge>
                  {dbSizeBytes > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground ml-auto">{formatBytes(dbSizeBytes)}</span>
                  )}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {tableItems.map((table, i) => (
                    <div key={table.name} className="anim-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                      <button
                        onClick={() => { setSelectedTable(table.name); setSelectedIsView(false); }}
                        className="w-full text-left p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {table.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {table.rowCount} rows
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          PK: {table.primaryKeys.join(", ")}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Views Section */}
              {viewItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    Views
                    <Badge variant="secondary" className="text-[10px]">{viewItems.length}</Badge>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {viewItems.map((view, i) => (
                      <div key={view.name} className="anim-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                        <button
                          onClick={() => { setSelectedTable(view.name); setSelectedIsView(true); }}
                          className="w-full text-left p-4 rounded-lg border border-dashed border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {view.name}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {view.rowCount} rows
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Read-only view
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CSS Assets Section */}
              <CssAssetsSection />

              {/* Schema Editor Section */}
              <SchemaEditorSection onMigrationComplete={() => void loadTables()} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setActiveSurface("landing")} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> All Categories
            </Button>
          </div>
          <StorageRuntimePanels surface={activeSurface as "session" | "cookies" | "indexeddb"} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CSS Assets Section                                                 */
/*  Shows per-script CSS assets declared in script manifests.          */
/*  See: spec/07-devtools-and-injection/standalone-script-assets.md §6.3             */
/* ------------------------------------------------------------------ */

interface CssAssetInfo {
  scriptName: string;
  cssFile: string;
  templatesFile?: string;
  version: string;
}

// eslint-disable-next-line max-lines-per-function
function CssAssetsSection() {
  const platform = getPlatform();
  const [assets, setAssets] = useState<CssAssetInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await platform.sendMessage<{ assets?: CssAssetInfo[] }>({
        type: "GET_SCRIPT_ASSETS",
      });
      setAssets(resp.assets ?? []);
    } catch {
      // Fallback: show known assets from manifest data
      setAssets([
        { scriptName: "macroController", cssFile: "macro-looping.css", templatesFile: "templates.json", version: "1.56.0" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Paintbrush className="h-4 w-4 text-muted-foreground" />
        CSS Assets
        <Badge variant="secondary" className="text-[10px]">{assets.length}</Badge>
      </h3>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No CSS assets found in script manifests.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {assets.map((asset, i) => (
            <div
              key={asset.scriptName}
              className="anim-fade-in-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="w-full text-left p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Paintbrush className="h-3 w-3 text-primary" />
                    {asset.scriptName}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    v{asset.version}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileCode className="h-2.5 w-2.5" />
                    CSS: <span className="font-mono text-primary">{asset.cssFile}</span>
                  </div>
                  {asset.templatesFile && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <FileCode className="h-2.5 w-2.5" />
                      Templates: <span className="font-mono text-primary">{asset.templatesFile}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Schema Editor Section                                              */
/*  Collapsible panel that embeds the JsonSchemaTab for system DB.     */
/* ------------------------------------------------------------------ */

function SchemaEditorSection({ onMigrationComplete }: { onMigrationComplete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          Schema Editor
          <Badge variant="secondary" className="text-[10px]">JSON → SQL</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">
            {expanded ? "▾ Collapse" : "▸ Expand"}
          </span>
        </h3>
      </button>
      {expanded && (
        <Suspense fallback={<div className="h-48 rounded-lg bg-muted/50 animate-pulse" />}>
          <JsonSchemaTab
            projectSlug="__system__"
            onMigrationComplete={onMigrationComplete}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function TableDataView({
  tableName,
  primaryKeys,
  isView,
  onBack,
}: {
  tableName: string;
  primaryKeys: string[];
  isView: boolean;
  onBack: () => void;
}) {
  const platform = getPlatform();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const limit = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dataResp, schemaResp] = await Promise.all([
        platform.sendMessage<{ rows: Record<string, unknown>[]; total: number; columns: string[] }>({
          type: "STORAGE_QUERY_TABLE",
          table: tableName,
          offset,
          limit,
        }),
        platform.sendMessage<{ columns: ColumnInfo[] }>({
          type: "STORAGE_GET_SCHEMA",
          table: tableName,
        }),
      ]);
      setRows(dataResp.rows ?? []);
      setColumns(dataResp.columns ?? []);
      setTotal(dataResp.total ?? 0);
      setSchema(schemaResp.columns ?? []);
    } catch (err) {
      toast.error("Failed to load table data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [platform, tableName, offset, limit]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleDelete = async (row: Record<string, unknown>) => {
    const pk: Record<string, unknown> = {};
    for (const k of primaryKeys) pk[k] = row[k];

    try {
      await platform.sendMessage({
        type: "STORAGE_DELETE_ROW",
        table: tableName,
        primaryKey: pk,
      });
      toast.success("Row deleted");
      void loadData();
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleClearTable = async () => {
    if (!confirm(`⚠️ Delete ALL rows from "${tableName}"?`)) return;
    try {
      const resp = await platform.sendMessage<{ deleted: number }>({
        type: "STORAGE_CLEAR_TABLE",
        table: tableName,
      });
      toast.success(`Cleared ${resp.deleted ?? 0} rows from ${tableName}`);
      void loadData();
    } catch {
      toast.error("Clear failed");
    }
  };

  const openEditModal = (row: Record<string, unknown>) => {
    setEditRow(row);
    const vals: Record<string, string> = {};
    for (const col of columns) {
      const v = row[col];
      vals[col] = v === null || v === undefined ? "" : String(v);
    }
    setEditValues(vals);
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity -- row save with type coercion and validation
  const handleSaveEdit = async () => {
    if (!editRow) return;
    const pk: Record<string, unknown> = {};
    for (const k of primaryKeys) pk[k] = editRow[k];

    const updates: Record<string, unknown> = {};
    for (const col of columns) {
      if (primaryKeys.includes(col)) continue;
      if (READ_ONLY_COLUMNS.has(col)) continue;
      const colInfo = schema.find(s => s.name === col);
      const newVal = editValues[col] ?? "";
      const oldVal = editRow[col] === null || editRow[col] === undefined ? "" : String(editRow[col]);
      if (newVal !== oldVal) {
        updates[col] = colInfo?.type === "INTEGER" ? parseInt(newVal) || 0
          : colInfo?.type === "REAL" ? parseFloat(newVal) || 0
          : newVal;
      }
    }

    if (Object.keys(updates).length === 0) {
      setEditRow(null);
      return;
    }

    try {
      await platform.sendMessage({
        type: "STORAGE_UPDATE_ROW",
        table: tableName,
        primaryKey: pk,
        updates,
      });
      toast.success("Row updated");
      setEditRow(null);
      void loadData();
    } catch {
      toast.error("Update failed");
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-lg font-bold tracking-tight font-mono flex items-center gap-2">
              {isView && <Eye className="h-4 w-4 text-muted-foreground" />}
              {tableName}
              {isView && <Badge variant="outline" className="text-[10px]">View</Badge>}
            </h2>
            <p className="text-xs text-muted-foreground">
              {total} rows · {columns.length} columns
              {isView && " · Read-only"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!isView && (
            <Button variant="outline" size="sm" onClick={() => void handleClearTable()} className="text-destructive hover:text-destructive">
              <Eraser className="h-3.5 w-3.5 mr-1.5" />
              Clear All Data
            </Button>
          )}
        </div>
      </div>

      {/* Schema badges */}
      <div className="flex flex-wrap gap-1.5">
        {schema.map((col) => (
          <Badge key={col.name} variant={col.pk ? "default" : "outline"} className="text-[9px] font-mono">
            {col.name}
            <span className="ml-1 opacity-60">{col.type}</span>
            {col.pk && <span className="ml-1">🔑</span>}
            {READ_ONLY_COLUMNS.has(col.name) && <span className="ml-1">🔒</span>}
          </Badge>
        ))}
      </div>

      {/* Data table */}
      <div className="rounded-lg border border-border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              {!isView && <TableHead className="w-16 text-[10px]">Actions</TableHead>}
              {columns.map((col) => (
                <TableHead key={col} className="text-[10px] font-mono whitespace-nowrap">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (isView ? 0 : 1)} className="text-center text-muted-foreground text-xs py-8">
                  No data — {isView ? "view" : "table"} is empty
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => {
                const pkVal = primaryKeys.length > 0
                  ? primaryKeys.map(k => String(row[k] ?? i)).join("-")
                  : String(i);
                return (
                  <tr
                    key={pkVal}
                    className="border-b border-border hover:bg-muted/30 transition-colors anim-fade-in-up"
                    style={{ animationDelay: `${i * 0.02}s` }}
                  >
                    {!isView && (
                      <TableCell className="p-1.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditModal(row)}
                            className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                            title="Edit row"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => void handleDelete(row)}
                            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete row"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col} className="text-[10px] font-mono p-1.5 max-w-[200px] truncate">
                        <CellValue value={row[col] as SqlValue} />
                      </TableCell>
                    ))}
                  </tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal — not shown for views */}
      {!isView && (
        <Dialog open={editRow !== null} onOpenChange={(open) => { if (!open) setEditRow(null); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">Edit Row — {tableName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {columns.map((col) => {
                const colInfo = schema.find(s => s.name === col);
                const isPk = primaryKeys.includes(col);
                const isReadOnly = READ_ONLY_COLUMNS.has(col);
                const isDisabled = isPk || isReadOnly;
                return (
                  <div key={col}>
                    <label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5 mb-1">
                      {col}
                      <span className="opacity-50">{colInfo?.type}</span>
                      {isPk && <Badge variant="default" className="text-[8px] py-0">PK</Badge>}
                      {isReadOnly && <Badge variant="secondary" className="text-[8px] py-0">Read-only</Badge>}
                    </label>
                    {isDisabled ? (
                      <div className="text-xs font-mono p-2 rounded bg-muted/50 text-muted-foreground">
                        {editValues[col]}
                      </div>
                    ) : (editValues[col]?.length ?? 0) > 100 ? (
                      <textarea
                        className="w-full text-xs font-mono p-2 rounded border border-border bg-background resize-y min-h-[60px]"
                        value={editValues[col] ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, [col]: e.target.value })}
                      />
                    ) : (
                      <Input
                        className="text-xs font-mono h-8"
                        value={editValues[col] ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, [col]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="sm" onClick={() => void handleSaveEdit()}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cell Value Renderer                                                */
/* ------------------------------------------------------------------ */

function CellValue({ value }: { value: SqlValue }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">null</span>;
  }
  if (typeof value === "number") {
    return <span className="text-primary">{value}</span>;
  }
  const str = String(value);
  if (str.length > 80) {
    return <span title={str}>{str.slice(0, 80)}…</span>;
  }
  return <span>{str}</span>;
}

/* ------------------------------------------------------------------ */
/*  Byte Formatter                                                     */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default StorageBrowserView;
