import { lazy, Suspense } from "react";
import { usePopupData } from "@/hooks/use-popup-data";
import { useVersionCheck } from "@/hooks/use-version-check";
import { AuthDiagnosticsBar } from "@/components/popup/AuthDiagnosticsBar";
import { usePopupActions } from "@/hooks/use-popup-actions";
import { VersionMismatchBanner } from "@/components/popup/VersionMismatchBanner";
import { BootFailureBanner } from "@/components/popup/BootFailureBanner";
import { ProjectSelector } from "@/components/popup/ProjectSelector";
import { PopupStatusBar } from "@/components/popup/PopupStatusBar";
import { PopupHeader } from "@/components/popup/PopupHeader";
import { PopupFooter } from "@/components/popup/PopupFooter";

// Lazy-loaded panels — not needed for initial popup render
const InjectionStatusPanel = lazy(() => import("@/components/popup/InjectionStatusPanel").then(m => ({ default: m.InjectionStatusPanel })));
const InjectionErrorPanel = lazy(() => import("@/components/popup/InjectionErrorPanel").then(m => ({ default: m.InjectionErrorPanel })));
const InjectionModeToggle = lazy(() => import("@/components/popup/InjectionModeToggle").then(m => ({ default: m.InjectionModeToggle })));
const InjectionDiagnosticsPanel = lazy(() => import("@/components/popup/InjectionDiagnosticsPanel").then(m => ({ default: m.InjectionDiagnosticsPanel })));
const DependencyChainPanel = lazy(() => import("@/components/popup/DependencyChainPanel").then(m => ({ default: m.DependencyChainPanel })));
const ScriptToggleList = lazy(() => import("@/components/popup/ScriptToggleList").then(m => ({ default: m.ScriptToggleList })));
const ImportPreviewDialog = lazy(() => import("@/components/popup/ImportPreviewDialog").then(m => ({ default: m.ImportPreviewDialog })));
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Play, RotateCw, Loader2, Keyboard, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// eslint-disable-next-line max-lines-per-function
const PopupPage = () => {
  const {
    projectData,
    status,
    health,
    opfsStatus,
    injections,
    scripts,
    loading,
    debugMode,
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
    handleForceRun,
    lastRunResults,
    handleConfirmImport,
    handleCancelImport,
  } = usePopupActions();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-[520px] min-h-[480px] bg-background flex flex-col">
        <PopupHeader
          version={status?.version ?? "—"}
          onRefresh={refresh}
        />
        <VersionMismatchBanner versionCheck={versionCheck} />
        <BootFailureBanner bootStep={status?.bootStep} />
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {status && health ? (
            <PopupStatusBar status={status} health={health} opfsStatus={opfsStatus} />
          ) : (
            <div className="h-12 rounded-md bg-muted animate-pulse" />
          )}
          <Separator />
          {projectData ? (
            <ProjectSelector data={projectData} onSelect={setActiveProject} />
          ) : (
            <div className="h-9 rounded-md bg-muted animate-pulse" />
          )}

          {/* ── Run / Re-inject Controls ── */}
          <div className="flex items-center gap-2 overflow-visible">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="flex-1 h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 min-w-0"
                  onClick={() => handleRun()}
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
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1 hover:bg-destructive/10 hover:text-destructive shrink-0"
                  onClick={handleForceRun}
                  disabled={runLoading || reinjectLoading}
                >
                  {runLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Zap className="h-4 w-4" />}
                  <span className="hidden sm:inline text-xs">Force</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Bypass cache — rebuild and inject from scratch</p>
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
            <InjectionDiagnosticsPanel />
            <DependencyChainPanel />
          </Suspense>
          <Separator />
          <Suspense fallback={null}>
            <ScriptToggleList scripts={scripts} onToggle={toggleScript} lastRunResults={lastRunResults} />
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
