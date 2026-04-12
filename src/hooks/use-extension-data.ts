import type { JsonValue } from "@/background/handlers/handler-types";
import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

interface StorageStats {
  persistenceMode: string;
  logCount: number;
  errorCount: number;
  sessionCount: number;
  databases: Array<{ name: string; tables: Record<string, number> }>;
}

interface BootTiming {
  step: string;
  durationMs: number;
}

interface StatusResponse {
  connection: string;
  token: { status: string; expiresIn: string | null };
  config: { status: string; source: string };
  loggingMode: string;
  version: string;
  bootStep?: string;
  persistenceMode?: string;
  bootTimings?: BootTiming[];
  totalBootMs?: number;
}

interface HealthResponse {
  state: string;
  details: string[];
}

interface LogRow {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  category: string;
  action?: string;
  detail?: string;
  message?: string;
  error_code?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, h] = await Promise.all([
      sendMessage<StatusResponse>({ type: "GET_STATUS" }),
      sendMessage<HealthResponse>({ type: "GET_HEALTH_STATUS" }),
    ]);
    setStatus(s);
    setHealth(h);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { status, health, loading, refresh };
}

export function useStorageStats() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await sendMessage<StorageStats>({ type: "GET_STORAGE_STATS" });
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { stats, loading, refresh };
}

export interface DataBrowserFilters {
  source?: string;
  category?: string;
  search?: string;
  caseSensitive?: boolean;
}

export function useDataBrowser(database: "logs" | "errors", pageSize = 20, filters: DataBrowserFilters = {}) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const filterKey = `${filters.source ?? ""}|${filters.category ?? ""}|${filters.search ?? ""}|${filters.caseSensitive ?? ""}`;

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    const result = await sendMessage<{ rows: LogRow[]; total: number }>({
      type: "QUERY_LOGS",
      database,
      offset: p * pageSize,
      limit: pageSize,
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search ? { search: filters.search, caseSensitive: filters.caseSensitive ?? false } : {}),
    });
    setRows(result.rows);
    setTotal(result.total);
    setPage(p);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, pageSize, filterKey]);

  useEffect(() => { void fetchPage(0); }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { rows, total, page, totalPages, loading, fetchPage };
}

export interface DataStoreEntry {
  key: string;
  value: JsonValue;
  valuePreview: string;
  sizeBytes: number;
  projectId: string;
  scriptId: string;
  updatedAt: string;
}

export function useDataStore() {
  const [entries, setEntries] = useState<DataStoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ entries: DataStoreEntry[] }>({
      type: "GET_DATA_STORE_ALL",
    });
    setEntries(result.entries);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { entries, loading, refresh };
}

export function useConfig() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{
      config: Record<string, unknown>;
      source: string;
    }>({ type: "GET_CONFIG" });
    setConfig(result.config);
    setSource(result.source);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { config, source, loading, refresh };
}

export function useXPathRecorder() {
  const [recorded, setRecorded] = useState<Array<{
    xpath: string;
    tagName: string;
    text: string;
    timestamp: string;
    strategy: string;
  }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{
      recorded: typeof recorded;
      isRecording: boolean;
    }>({ type: "GET_RECORDED_XPATHS" });
    setRecorded(result.recorded);
    setIsRecording(result.isRecording);
    setLoading(false);
  }, []);

  const toggle = useCallback(async () => {
    const result = await sendMessage<{ isRecording: boolean }>({
      type: "TOGGLE_XPATH_RECORDER",
    });
    setIsRecording(result.isRecording);
    await refresh();
  }, [refresh]);

  const clear = useCallback(async () => {
    await sendMessage({ type: "CLEAR_RECORDED_XPATHS" });
    setRecorded([]);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { recorded, isRecording, loading, toggle, clear, refresh };
}
