import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wifi } from "lucide-react";
import { useNetworkData } from "@/hooks/use-network-data";
import { categorizeStatus } from "./network-helpers";
import { StatCard } from "./StatCard";
import { StatusDistribution } from "./StatusDistribution";
import { NetworkToolbar } from "./NetworkToolbar";
import { RequestTable } from "./RequestTable";

/** Root network monitoring panel with stats, filters, and request table. */
export function NetworkPanel() {
  const {
    requests,
    stats,
    loading,
    refresh,
    clear,
    autoRefresh,
    toggleAutoRefresh,
  } = useNetworkData();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const isStatusMatch =
        statusFilter === "all" || categorizeStatus(r.status) === statusFilter;
      const isTypeMatch =
        typeFilter === "all" || r.requestType === typeFilter;
      const isIncluded = isStatusMatch && isTypeMatch;
      return isIncluded;
    });
  }, [requests, statusFilter, typeFilter]);

  const handleToggleExpand = (index: number) => {
    const isAlreadyExpanded = expandedIndex === index;
    setExpandedIndex(isAlreadyExpanded ? null : index);
  };

  return (
    <div className="space-y-4">
      <StatsOverview stats={stats} />
      {stats && <StatusDistribution byStatus={stats.byStatus} />}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Wifi className="inline h-4 w-4 mr-1.5" />
            Captured Requests
          </CardTitle>
          <NetworkToolbar
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            autoRefresh={autoRefresh}
            isLoading={loading}
            onStatusFilterChange={setStatusFilter}
            onTypeFilterChange={setTypeFilter}
            onToggleAutoRefresh={toggleAutoRefresh}
            onRefresh={refresh}
            onClear={clear}
          />
        </CardHeader>
        <CardContent>
          <RequestTable
            filtered={filtered}
            isLoading={loading}
            expandedIndex={expandedIndex}
            onToggleExpand={handleToggleExpand}
          />
          <div className="pt-3 text-xs text-muted-foreground">
            Showing {filtered.length} of {requests.length} requests
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Sub-component ---- */

interface StatsOverviewProps {
  stats: ReturnType<typeof useNetworkData>["stats"];
}

/** Grid of high-level network stats. */
function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Total Captured" value={stats?.totalCaptured ?? 0} />
      <StatCard label="Avg Duration" value={`${stats?.averageDurationMs ?? 0}ms`} />
      <StatCard label="XHR" value={stats?.byType.xhr ?? 0} />
      <StatCard label="Fetch" value={stats?.byType.fetch ?? 0} />
    </div>
  );
}
