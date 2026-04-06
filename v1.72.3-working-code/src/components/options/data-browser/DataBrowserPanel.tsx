import { useState } from "react";
import { useStorageStats, useDataBrowser, useDataStore } from "@/hooks/use-extension-data";
import type { DataBrowserFilters } from "@/hooks/use-extension-data";
import { StorageCard } from "./StorageCard";
import { DataTable } from "./DataTable";
import { DataStoreTable } from "./DataStoreTable";

type ActiveView = "logs" | "errors" | "datastore";

/** Root data browser panel with storage stats, paginated data table, and data store viewer. */
export function DataBrowserPanel() {
  const { stats, loading: isStatsLoading, refresh: refreshStats } = useStorageStats();
  const [activeDb, setActiveDb] = useState<ActiveView>("logs");
  const [filters, setFilters] = useState<DataBrowserFilters>({});

  const browser = useDataBrowser(
    activeDb === "datastore" ? "logs" : activeDb,
    15,
    activeDb === "datastore" ? {} : filters,
  );
  const dataStore = useDataStore();

  const handlePurgeComplete = async () => {
    await refreshStats();
    await browser.fetchPage(0);
  };

  const handleDbChange = (db: ActiveView) => {
    setActiveDb(db);
    setFilters({});
  };

  const isFirstPage = browser.page === 0;
  const isLastPage = browser.page >= browser.totalPages - 1;
  const isDataStore = activeDb === "datastore";

  return (
    <div className="space-y-4">
      <StorageCard
        stats={stats}
        isStatsLoading={isStatsLoading}
        onRefreshStats={refreshStats}
        onPurgeComplete={handlePurgeComplete}
      />
      {isDataStore ? (
        <DataStoreTable
          entries={dataStore.entries}
          loading={dataStore.loading}
          onRefresh={dataStore.refresh}
        />
      ) : (
        <DataTable
          activeDb={activeDb as "logs" | "errors"}
          onDbChange={handleDbChange}
          rows={browser.rows}
          isLoading={browser.loading}
          page={browser.page}
          totalPages={browser.totalPages}
          total={browser.total}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
          onPrevPage={() => browser.fetchPage(browser.page - 1)}
          onNextPage={() => browser.fetchPage(browser.page + 1)}
          filters={filters}
          onFiltersChange={setFilters}
        />
      )}
    </div>
  );
}
