import { useState, useEffect, lazy, Suspense } from "react";
import { usePopupData } from "@/hooks/use-popup-data";
import { useVersionCheck } from "@/hooks/use-version-check";
import { AuthDiagnosticsBar } from "@/components/popup/AuthDiagnosticsBar";
import { usePopupActions } from "@/hooks/use-popup-actions";
import { VersionMismatchBanner } from "@/components/popup/VersionMismatchBanner";
import { sendMessage } from "@/lib/message-client";
import { ProjectSelector } from "@/components/popup/ProjectSelector";
import { PopupStatusBar } from "@/components/popup/PopupStatusBar";
import { PopupHeader } from "@/components/popup/PopupHeader";
import { PopupFooter } from "@/components/popup/PopupFooter";

// Lazy-loaded panels — not needed for initial popup render
const InjectionStatusPanel = lazy(() => import("@/components/popup/InjectionStatusPanel").then(m => ({ default: m.InjectionStatusPanel })));
const InjectionErrorPanel = lazy(() => import("@/components/popup/InjectionErrorPanel").then(m => ({ default: m.InjectionErrorPanel })));
const InjectionModeToggle = lazy(() => import("@/components/popup/InjectionModeToggle").then(m => ({ default: m.InjectionModeToggle })));
const ScriptToggleList = lazy(() => import("@/components/popup/ScriptToggleList").then(m => ({ default: m.ScriptToggleList })));
const ImportPreviewDialog = lazy(() => import("@/components/popup/ImportPreviewDialog").then(m => ({ default: m.ImportPreviewDialog })));
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Play, RotateCw, Loader2, Keyboard } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PopupPage = () => {
  const {
    projectData,
    status,
    health,
    injections,
    scripts,
    loading,
    refresh,
    setActiveProject,
    toggleScript,
  } = usePopupData();

  const versionCheck = useVersionCheck();

  const {
    logsLoading,
    exportLoading,
    dbExportLoading,
    dbImportLoading,
    previewLoading,
    runLoading,
    reinjectLoading,
    importPreview,
    importPreviewOpen,
    setImportPreviewOpen,
    importMode,
    handleViewLogs,
    handleExport,
    handleDbExport,
    handleDbImport,
    handleRun,
    handleReinject,
    handleConfirmImport,
    handleCancelImport,
  } = usePopupActions();

  // Only show AuthDiagnosticsBar when debugMode is enabled in settings
  const [debugMode, setDebugMode] = useState(false);
  useEffect(() => {
    sendMessage<{ settings?: { debugMode?: boolean } }>({ type: "GET_SETTINGS" })
      .then((res) => setDebugMode(res.settings?.debugMode === true))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="w-[520px] h-[480px] bg-background flex items-center justify-center">
        <div className="h-6 w-6 rounded-md bg-primary animate-pulse" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-[520px] min-h-[480px] bg-background flex flex-col">
        <PopupHeader
          version={status?.version ?? "—"}
          onRefresh={refresh}
        />
        <VersionMismatchBanner versionCheck={versionCheck} />

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {status && health && (
            <PopupStatusBar status={status} health={health} />
          )}
          <Separator />
          {projectData && (
            <ProjectSelector data={projectData} onSelect={setActiveProject} />
          )}

          {/* ── Run / Re-inject Controls ── */}
          <div className="flex items-center gap-2 overflow-visible">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="flex-1 h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 min-w-0"
                  onClick={handleRun}
                  disabled={runLoading || reinjectLoading}
                >
                  {runLoading
                    ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    : <Play className="h-4 w-4 shrink-0" />}
                  <span className="truncate">Run Scripts</span>
                  <kbd className="ml-1 inline-flex items-center h-[16px] px-1 rounded bg-primary-foreground/20 border border-primary-foreground/30 font-mono text-[9px] font-medium shrink-0">
                    Ctrl+Shift+↓
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Inject all enabled scripts into the active tab</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 hover:bg-primary/10 hover:text-primary shrink-0"
                  onClick={handleReinject}
                  disabled={runLoading || reinjectLoading}
                >
                  {reinjectLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RotateCw className="h-4 w-4" />}
                  <span className="hidden sm:inline">Re-inject</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Clear existing markers & re-run all scripts fresh</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    const win = globalThis as Record<string, unknown>;
                    const chromeObj = win.chrome as Record<string, unknown> | undefined;
                    const tabsApi = chromeObj?.tabs as { create: (opts: Record<string, unknown>) => void } | undefined;
                    if (tabsApi) {
                      tabsApi.create({ url: "chrome://extensions/shortcuts" });
                    }
                  }}
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Customize keyboard shortcuts</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator />
          <Suspense fallback={null}>
            <InjectionStatusPanel injections={injections} scripts={scripts} />
            <InjectionModeToggle />
            <InjectionErrorPanel />
          </Suspense>
          <Separator />
          <Suspense fallback={null}>
            <ScriptToggleList scripts={scripts} onToggle={toggleScript} />
          </Suspense>
          {debugMode && (
            <>
              <Separator />
              <AuthDiagnosticsBar />
            </>
          )}
        </div>

        <PopupFooter
          loggingMode={status?.loggingMode ?? "—"}
          logsLoading={logsLoading}
          exportLoading={exportLoading}
          dbExportLoading={dbExportLoading}
          dbImportLoading={dbImportLoading}
          onViewLogs={handleViewLogs}
          onExport={handleExport}
          onDbExport={handleDbExport}
          onDbImport={handleDbImport}
          onRefresh={refresh}
        />

        <Suspense fallback={null}>
          <ImportPreviewDialog
            open={importPreviewOpen}
            onOpenChange={setImportPreviewOpen}
            preview={importPreview}
            loading={previewLoading}
            importing={dbImportLoading}
            mode={importMode.current}
            onConfirm={handleConfirmImport}
            onCancel={handleCancelImport}
          />
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </div>
    </TooltipProvider>
  );
};

export default PopupPage;
