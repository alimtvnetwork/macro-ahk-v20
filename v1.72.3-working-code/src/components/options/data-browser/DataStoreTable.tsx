import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, HardDrive } from "lucide-react";
import { formatDataTimestamp } from "./data-browser-helpers";
import type { DataStoreEntry } from "@/hooks/use-extension-data";

interface DataStoreTableProps {
  entries: DataStoreEntry[];
  loading: boolean;
  onRefresh: () => void;
}

/** Displays all marco_user_data entries with key, value preview, size, and project. */
export function DataStoreTable({ entries, loading, onRefresh }: DataStoreTableProps) {
  const hasEntries = entries.length > 0;
  const totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  const spinClass = loading ? "animate-spin" : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <HardDrive className="inline h-4 w-4 mr-1.5" />
          Data Store
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {entries.length} keys · {formatSize(totalSize)}
          </Badge>
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${spinClass}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Key</TableHead>
                <TableHead className="min-w-[200px]">Value Preview</TableHead>
                <TableHead className="w-20 text-right">Size</TableHead>
                <TableHead className="w-28">Project</TableHead>
                <TableHead className="w-40">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasEntries
                ? entries.map((entry) => (
                    <StoreRow key={entry.key} entry={entry} />
                  ))
                : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : "No data store entries"}
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StoreRow({ entry }: { entry: DataStoreEntry }) {
  const isGlobal = entry.projectId === "__global__";

  return (
    <TableRow>
      <TableCell className="text-xs font-mono break-all">{entry.key}</TableCell>
      <TableCell className="text-xs font-mono text-muted-foreground max-w-[240px] truncate">
        {entry.valuePreview}
      </TableCell>
      <TableCell className="text-xs text-right tabular-nums">
        {formatSize(entry.sizeBytes)}
      </TableCell>
      <TableCell className="text-xs">
        {isGlobal ? (
          <Badge variant="outline" className="text-[10px]">global</Badge>
        ) : (
          <span className="truncate block max-w-[100px]" title={entry.projectId}>
            {entry.projectId.slice(0, 8)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs font-mono">{formatDataTimestamp(entry.updatedAt)}</TableCell>
    </TableRow>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
