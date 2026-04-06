import { useState, useCallback, useRef } from "react";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";
import {
  exportAllAsSqliteZip,
  importFromSqliteZip,
  mergeFromSqliteZip,
  previewSqliteZip,
  type BundlePreview,
} from "@/lib/sqlite-bundle";

interface InjectionResultEntry {
  scriptId: string;
  scriptName?: string;
  isSuccess: boolean;
  errorMessage?: string;
  skipReason?: string;
  durationMs?: number;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function usePopupActions() {
  const [logsLoading, setLogsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [dbExportLoading, setDbExportLoading] = useState(false);
  const [dbImportLoading, setDbImportLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [reinjectLoading, setReinjectLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<BundlePreview | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<"merge" | "replace">("replace");

  /** Run all enabled scripts into the active tab. */
  const handleRun = useCallback(async () => {
    setRunLoading(true);
    console.log("[popup:handleRun] Starting injection flow...");
    try {
      const win = globalThis as Record<string, unknown>;
      const chromeObj = win.chrome as Record<string, unknown> | undefined;
      const tabsApi = chromeObj?.tabs as {
        query: (q: Record<string, unknown>) => Promise<Array<{ id?: number }>>;
      } | undefined;

      let tabId: number | null = null;
      if (tabsApi) {
        const [tab] = await tabsApi.query({ active: true, currentWindow: true });
        tabId = tab?.id ?? null;
      }
      console.log("[popup:handleRun] Active tab ID:", tabId);

      if (tabId === null) {
        console.error("[popup:handleRun] No active tab found");
        toast.error("No active tab found");
        return;
      }

      console.log("[popup:handleRun] Fetching active project...");
      const projRes = await sendMessage<{
        activeProject?: { scripts?: unknown[] } | null;
      }>({ type: "GET_ACTIVE_PROJECT" });
      console.log("[popup:handleRun] Active project response:", JSON.stringify(projRes?.activeProject?.scripts?.length ?? 0), "scripts");

      const scripts = projRes?.activeProject?.scripts ?? [];
      if (!Array.isArray(scripts) || scripts.length === 0) {
        console.error("[popup:handleRun] No scripts found in active project");
        toast.error("No scripts to run — check your active project");
        return;
      }

      console.log("[popup:handleRun] Sending INJECT_SCRIPTS for tab %d with %d scripts...", tabId, scripts.length);
      const result = await sendMessage<{ results: InjectionResultEntry[] }>({
        type: "INJECT_SCRIPTS",
        tabId,
        scripts,
      });
      console.log("[popup:handleRun] Injection result:", JSON.stringify(result));

      const successes = result.results.filter((r) => r.isSuccess).length;
      const failures = result.results.filter((r) => !r.isSuccess && !r.skipReason).length;
      const skipped = result.results.filter((r) => r.skipReason).length;

      if (failures > 0) {
        const failedNames = result.results
          .filter((r) => !r.isSuccess && !r.skipReason)
          .map((r) => `${r.scriptName ?? r.scriptId}: ${r.errorMessage ?? "unknown"}`)
          .join("\n");
        toast.error(`${failures} script(s) failed:\n${failedNames}`);
      } else {
        toast.success(`✅ ${successes} injected${skipped > 0 ? `, ${skipped} skipped` : ""}`);
      }
    } catch (err) {
      console.error("[popup:handleRun] Error:", err);
      const msg = err instanceof Error ? err.message : "Run failed";
      toast.error(msg);
    } finally {
      setRunLoading(false);
    }
  }, []);

  /** Re-inject: same as run — injection pipeline handles version-check teardown. */
  const handleReinject = useCallback(async () => {
    setReinjectLoading(true);
    try {
      await handleRun();
    } finally {
      setReinjectLoading(false);
    }
  }, [handleRun]);

  const handleViewLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await sendMessage<{
        sessionId: string;
        logs: unknown[];
        errors: unknown[];
      }>({ type: "GET_SESSION_LOGS" });

      const logCount = data.logs?.length ?? 0;
      const errorCount = data.errors?.length ?? 0;
      toast.info(`Session ${data.sessionId}: ${logCount} logs, ${errorCount} errors`);

      const win = globalThis as any;
      const hasChromeRuntime = win.chrome?.runtime?.getURL;
      const optionsUrl = hasChromeRuntime
        ? win.chrome.runtime.getURL("src/options/options.html#diagnostics")
        : "/#diagnostics";
      window.open(optionsUrl, "_blank");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load logs";
      toast.error(msg);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const zipRes = await sendMessage<{
        dataUrl: string | null;
        filename: string;
      }>({ type: "EXPORT_LOGS_ZIP" });

      if (zipRes.dataUrl) {
        triggerDownload(zipRes.dataUrl, zipRes.filename);
        toast.success(`Exported ${zipRes.filename}`);
        return;
      }

      const jsonRes = await sendMessage<{
        json: string;
        filename: string;
      }>({ type: "EXPORT_LOGS_JSON" });

      const blob = new Blob([jsonRes.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, jsonRes.filename);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${jsonRes.filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExportLoading(false);
    }
  }, []);

  const handleDbExport = useCallback(async () => {
    setDbExportLoading(true);
    try {
      await exportAllAsSqliteZip();
      toast.success("SQLite bundle exported");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "DB export failed";
      toast.error(msg);
    } finally {
      setDbExportLoading(false);
    }
  }, []);

  const handleDbImport = useCallback((mode: "merge" | "replace") => {
    importModeRef.current = mode;

    if (!fileInputRef.current) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip";
      input.style.display = "none";
      input.addEventListener("change", handleFileSelected);
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }, []);

  const handleFileSelected = useCallback(async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    fileRef.current = file;
    setPreviewLoading(true);
    setImportPreviewOpen(true);
    setImportPreview(null);

    try {
      const preview = await previewSqliteZip(file);
      setImportPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read bundle";
      toast.error(msg);
      setImportPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;

    const mode = importModeRef.current;
    setDbImportLoading(true);

    try {
      const importFn = mode === "merge" ? mergeFromSqliteZip : importFromSqliteZip;
      const result = await importFn(file);
      toast.success(
        `Imported ${result.projectCount} projects, ${result.scriptCount} scripts, ${result.configCount} configs (${mode})`
      );
      setImportPreviewOpen(false);
      setImportPreview(null);
      fileRef.current = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "DB import failed";
      toast.error(msg);
    } finally {
      setDbImportLoading(false);
    }
  }, []);

  const handleCancelImport = useCallback(() => {
    setImportPreviewOpen(false);
    setImportPreview(null);
    fileRef.current = null;
  }, []);

  return {
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
    importMode: importModeRef,
    handleViewLogs,
    handleExport,
    handleDbExport,
    handleDbImport,
    handleRun,
    handleReinject,
    handleConfirmImport,
    handleCancelImport,
  };
}
