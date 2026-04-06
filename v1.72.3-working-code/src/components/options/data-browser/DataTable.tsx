import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatDataTimestamp } from "./data-browser-helpers";
import { LevelBadge, CategoryBadge } from "./DataBadges";
import type { DataBrowserFilters } from "@/hooks/use-extension-data";

interface BrowserRow {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  category?: string;
  action?: string;
  error_code?: string;
  detail?: string;
  message?: string;
}

interface DataTableProps {
  activeDb: "logs" | "errors";
  onDbChange: (db: "logs" | "errors" | "datastore") => void;
  rows: BrowserRow[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  total: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  filters: DataBrowserFilters;
  onFiltersChange: (filters: DataBrowserFilters) => void;
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "user-script", label: "user-script" },
  { value: "background", label: "background" },
  { value: "content", label: "content" },
  { value: "injection", label: "injection" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "USER", label: "USER" },
  { value: "DATA_BRIDGE", label: "DATA_BRIDGE" },
  { value: "LIFECYCLE", label: "LIFECYCLE" },
  { value: "INJECTION", label: "INJECTION" },
  { value: "CONFIG", label: "CONFIG" },
  { value: "AUTH", label: "AUTH" },
];

/** Card with a paginated table of log/error entries. */
export function DataTable({
  activeDb,
  onDbChange,
  rows,
  isLoading,
  page,
  totalPages,
  total,
  isFirstPage,
  isLastPage,
  onPrevPage,
  onNextPage,
  filters,
  onFiltersChange,
}: DataTableProps) {
  const hasRows = rows.length > 0;
  const actionColumnLabel = activeDb === "logs" ? "Action" : "Error Code";
  const hasActiveFilters = !!filters.source || !!filters.category;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Data Browser
          </CardTitle>
          <Select value={activeDb} onValueChange={(v) => onDbChange(v as "logs" | "errors" | "datastore")}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="logs">Logs</SelectItem>
              <SelectItem value="errors">Errors</SelectItem>
              <SelectItem value="datastore">Data Store</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filters.source ?? "all"}
            onValueChange={(v) => onFiltersChange({ ...filters, source: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.category ?? "all"}
            onValueChange={(v) => onFiltersChange({ ...filters, category: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-40 h-7 text-xs">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onFiltersChange({})}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-40">Timestamp</TableHead>
                <TableHead className="w-16">Level</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead className="w-24">Category</TableHead>
                <TableHead>{actionColumnLabel}</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasRows
                ? rows.map((row) => (
                    <DataRow key={row.id} row={row} activeDb={activeDb} />
                  ))
                : <EmptyDataRow isLoading={isLoading} />}
            </TableBody>
          </Table>
        </div>
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
          isLoading={isLoading}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
      </CardContent>
    </Card>
  );
}

/* ---- Sub-components ---- */

interface DataRowProps {
  row: BrowserRow;
  activeDb: "logs" | "errors";
}

/** Single data row displaying a log or error entry. */
function DataRow({ row, activeDb }: DataRowProps) {
  const isLogs = activeDb === "logs";
  const actionValue = isLogs ? row.action : row.error_code;
  const detailValue = isLogs ? row.detail : row.message;

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">{row.id}</TableCell>
      <TableCell className="text-xs font-mono">{formatDataTimestamp(row.timestamp)}</TableCell>
      <TableCell><LevelBadge level={row.level} /></TableCell>
      <TableCell className="text-xs">{row.source}</TableCell>
      <TableCell>{row.category ? <CategoryBadge category={row.category} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-xs">{actionValue}</TableCell>
      <TableCell className="text-xs max-w-[200px] truncate">{detailValue}</TableCell>
    </TableRow>
  );
}

interface EmptyDataRowProps {
  isLoading: boolean;
}

/** Placeholder row when no data entries exist. */
function EmptyDataRow({ isLoading }: EmptyDataRowProps) {
  const message = isLoading ? "Loading…" : "No entries";

  return (
    <TableRow>
      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
        {message}
      </TableCell>
    </TableRow>
  );
}

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  isLoading: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

/** Pagination controls with page info. */
function PaginationBar({
  page,
  totalPages,
  total,
  isFirstPage,
  isLastPage,
  isLoading,
  onPrevPage,
  onNextPage,
}: PaginationBarProps) {
  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        {total} total · Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onPrevPage}
          disabled={isFirstPage || isLoading}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onNextPage}
          disabled={isLastPage || isLoading}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
