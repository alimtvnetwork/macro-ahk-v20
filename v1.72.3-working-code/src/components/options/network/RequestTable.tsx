import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight, ArrowUpDown } from "lucide-react";
import type { NetworkEntry } from "@/hooks/use-network-data";
import { truncateUrl, formatNetworkTimestamp } from "./network-helpers";
import { StatusBadge, MethodBadge, DurationDisplay } from "./NetworkBadges";
import { RequestDetailPanel } from "./RequestDetailPanel";

interface RequestTableProps {
  filtered: NetworkEntry[];
  isLoading: boolean;
  expandedIndex: number | null;
  onToggleExpand: (index: number) => void;
}

/** Table of captured network requests with expandable rows. */
export function RequestTable({
  filtered,
  isLoading,
  expandedIndex,
  onToggleExpand,
}: RequestTableProps) {
  const hasRows = filtered.length > 0;

  return (
    <div className="rounded-md border overflow-auto max-h-[480px]">
      <Table>
        <RequestTableHeader />
        <TableBody>
          {hasRows
            ? filtered.map((req, i) => (
                <RequestRow
                  key={`${req.timestamp}-${i}`}
                  request={req}
                  index={i}
                  isExpanded={expandedIndex === i}
                  onToggle={onToggleExpand}
                />
              ))
            : <EmptyRow isLoading={isLoading} />}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---- Sub-components ---- */

/** Table header row with column labels. */
function RequestTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-16">
          <ArrowUpDown className="inline h-3 w-3 mr-1" />
          Status
        </TableHead>
        <TableHead className="w-16">Method</TableHead>
        <TableHead>URL</TableHead>
        <TableHead className="w-16">Type</TableHead>
        <TableHead className="w-20">Duration</TableHead>
        <TableHead className="w-36">Time</TableHead>
      </TableRow>
    </TableHeader>
  );
}

interface RequestRowProps {
  request: NetworkEntry;
  index: number;
  isExpanded: boolean;
  onToggle: (index: number) => void;
}

/** A single request row with optional expanded detail. */
function RequestRow({ request, index, isExpanded, onToggle }: RequestRowProps) {
  const chevronClass = isExpanded ? "rotate-90" : "";

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onToggle(index)}
      >
        <TableCell>
          <ChevronRight className={`inline h-3 w-3 mr-1 transition-transform ${chevronClass}`} />
          <StatusBadge status={request.status} />
        </TableCell>
        <TableCell>
          <MethodBadge method={request.method} />
        </TableCell>
        <TableCell className="text-xs font-mono max-w-[280px] truncate" title={request.url}>
          {truncateUrl(request.url)}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {request.requestType.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell className="text-xs font-mono">
          <DurationDisplay ms={request.durationMs} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatNetworkTimestamp(request.timestamp)}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={6} className="p-0 border-b-0">
            <RequestDetailPanel request={request} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

interface EmptyRowProps {
  isLoading: boolean;
}

/** Placeholder row when no requests match. */
function EmptyRow({ isLoading }: EmptyRowProps) {
  const message = isLoading ? "Loading…" : "No requests captured";

  return (
    <TableRow>
      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
        {message}
      </TableCell>
    </TableRow>
  );
}
