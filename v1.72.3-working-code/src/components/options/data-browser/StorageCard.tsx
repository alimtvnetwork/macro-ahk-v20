import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Database, FileJson, FileArchive, Trash2, RefreshCw } from "lucide-react";
import { useStorageStats } from "@/hooks/use-extension-data";
import { sendMessage } from "@/lib/message-client";
import { downloadFile } from "./data-browser-helpers";
import { StatBox } from "./DataBadges";

const MAX_STORAGE_ESTIMATE = 5_000_000;

interface StorageCardProps {
  stats: ReturnType<typeof useStorageStats>["stats"];
  isStatsLoading: boolean;
  onRefreshStats: () => void;
  onPurgeComplete: () => void;
}

/** Card displaying storage stats, export actions, and purge. */
export function StorageCard({
  stats,
  isStatsLoading,
  onRefreshStats,
  onPurgeComplete,
}: StorageCardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const totalRows = (stats?.logCount ?? 0) + (stats?.errorCount ?? 0);
  const usagePercent = Math.min(100, (totalRows / MAX_STORAGE_ESTIMATE) * 100);

  const handleExportJson = async () => {
    setIsExporting(true);
    const result = await sendMessage<{ json: string; filename: string }>({
      type: "EXPORT_LOGS_JSON",
    });
    downloadFile(result.json, result.filename, "application/json");
    setIsExporting(false);
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    const result = await sendMessage<{ dataUrl: string | null; filename: string }>({
      type: "EXPORT_LOGS_ZIP",
    });
    const hasDataUrl = result.dataUrl !== null;
    if (hasDataUrl) {
      triggerDownloadLink(result.dataUrl!, result.filename);
    }
    setIsExporting(false);
  };

  const handlePurge = async () => {
    setIsPurging(true);
    await sendMessage({ type: "PURGE_LOGS", olderThanDays: 30 });
    onPurgeComplete();
    setIsPurging(false);
  };

  const spinClass = isStatsLoading ? "animate-spin" : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Database className="inline h-4 w-4 mr-1.5" />
          Storage
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onRefreshStats} disabled={isStatsLoading}>
          <RefreshCw className={`h-4 w-4 ${spinClass}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <UsageBar totalRows={totalRows} usagePercent={usagePercent} persistenceMode={stats?.persistenceMode} />
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Logs" value={stats?.logCount ?? 0} />
          <StatBox label="Errors" value={stats?.errorCount ?? 0} />
          <StatBox label="Sessions" value={stats?.sessionCount ?? 0} />
        </div>
        <ExportActions
          isExporting={isExporting}
          isPurging={isPurging}
          onExportJson={handleExportJson}
          onExportZip={handleExportZip}
          onPurge={handlePurge}
        />
      </CardContent>
    </Card>
  );
}

/* ---- Sub-components ---- */

interface UsageBarProps {
  totalRows: number;
  usagePercent: number;
  persistenceMode?: string;
}

/** Row count and progress bar. */
function UsageBar({ totalRows, usagePercent, persistenceMode }: UsageBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{totalRows.toLocaleString()} rows</span>
        <span>{persistenceMode ?? "—"}</span>
      </div>
      <Progress value={usagePercent} className="h-2" />
    </div>
  );
}

interface ExportActionsProps {
  isExporting: boolean;
  isPurging: boolean;
  onExportJson: () => void;
  onExportZip: () => void;
  onPurge: () => void;
}

/** Export and purge buttons. */
function ExportActions({
  isExporting,
  isPurging,
  onExportJson,
  onExportZip,
  onPurge,
}: ExportActionsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onExportJson} disabled={isExporting}>
        <FileJson className="h-3.5 w-3.5 mr-1.5" />
        JSON
      </Button>
      <Button variant="outline" size="sm" onClick={onExportZip} disabled={isExporting}>
        <FileArchive className="h-3.5 w-3.5 mr-1.5" />
        ZIP Bundle
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onPurge}
        disabled={isPurging}
        className="ml-auto text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Purge 30d+
      </Button>
    </div>
  );
}

/* ---- Helper ---- */

/** Create a temporary anchor to trigger a file download from a data URL. */
function triggerDownloadLink(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
