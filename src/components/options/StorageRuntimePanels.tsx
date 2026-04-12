import type { JsonValue } from "@/background/handlers/handler-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPlatform } from "@/platform";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw,
  Pencil,
  Trash2,
  Download,
  Save,
  Plus,
  Eraser,
} from "lucide-react";

type RuntimeStorageSurface = "session" | "cookies" | "indexeddb";

interface SessionEntry {
  key: string;
  value: JsonValue;
  valueType: string;
  sizeBytes: number;
}

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  expirationDate?: number;
  storeId: string;
}

interface IndexedRecord {
  key: IDBValidKey;
  value: JsonValue;
}

interface IndexedStoreView {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  count: number;
  records: IndexedRecord[];
}

interface IndexedDbView {
  name: string;
  version: number;
  stores: IndexedStoreView[];
}

interface StorageRuntimePanelsProps {
  surface: RuntimeStorageSurface;
}

function toPrettyJson(value: JsonValue): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseEditorValue(raw: string): string | number | boolean | null | object {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function downloadJson(filename: string, payload: string | number | boolean | null | object): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function keyToLabel(key: IDBValidKey): string {
  if (typeof key === "string") return key;
  if (typeof key === "number" || typeof key === "bigint") return String(key);
  if (key instanceof Date) return key.toISOString();
  return toPrettyJson(key as unknown as JsonValue);
}

function createTxDonePromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openIndexedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`Failed to open IndexedDB: ${name}`));
  });
}

function readStoreRecords(store: IDBObjectStore, limit = 100): Promise<IndexedRecord[]> {
  return new Promise((resolve, reject) => {
    const rows: IndexedRecord[] = [];
    const request = store.openCursor();

    request.onerror = () => reject(request.error ?? new Error("Failed reading store cursor"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || rows.length >= limit) {
        resolve(rows);
        return;
      }
      rows.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
  });
}

async function inspectIndexedDb(name: string): Promise<IndexedDbView> {
  const db = await openIndexedDb(name);
  try {
    const storeNames = Array.from(db.objectStoreNames);
    const stores: IndexedStoreView[] = [];

    for (const storeName of storeNames) {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const countReq = store.count();

      const count = await new Promise<number>((resolve, reject) => {
        countReq.onsuccess = () => resolve(Number(countReq.result ?? 0));
        countReq.onerror = () => reject(countReq.error ?? new Error("Failed counting records"));
      });

      const records = await readStoreRecords(store, 100);
      await createTxDonePromise(tx);

      stores.push({
        name: storeName,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        count,
        records,
      });
    }

    return { name: db.name, version: db.version, stores };
  } finally {
    db.close();
  }
}

async function saveIndexedRecord(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
  value: JsonValue,
): Promise<void> {
  const db = await openIndexedDb(dbName);
  try {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    if (store.keyPath === null) {
      store.put(value as IDBValidKey, key);
    } else {
      store.put(value as IDBValidKey);
    }
    await createTxDonePromise(tx);
  } finally {
    db.close();
  }
}

async function deleteIndexedRecord(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  const db = await openIndexedDb(dbName);
  try {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await createTxDonePromise(tx);
  } finally {
    db.close();
  }
}

async function clearIndexedStore(dbName: string, storeName: string): Promise<void> {
  const db = await openIndexedDb(dbName);
  try {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    await createTxDonePromise(tx);
  } finally {
    db.close();
  }
}

async function deleteIndexedDatabase(dbName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete IndexedDB database"));
    req.onblocked = () => reject(new Error("IndexedDB delete blocked by open connection"));
  });
}

async function listIndexedDbNames(): Promise<Array<{ name: string; version: number }>> {
  const idbFactory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string; version?: number }>>;
  };

  if (typeof idbFactory.databases !== "function") {
    return [];
  }

  const raw = await idbFactory.databases();
  return raw
    .filter((entry): entry is { name: string; version?: number } => typeof entry.name === "string")
    .map((entry) => ({ name: entry.name, version: Number(entry.version ?? 1) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// eslint-disable-next-line max-lines-per-function
function SessionPanel() {
  const platform = getPlatform();
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState("");
  const [editorValue, setEditorValue] = useState("{}");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await platform.sendMessage<{ entries?: SessionEntry[] }>({
        type: "STORAGE_SESSION_LIST",
        prefix: prefix.trim() || undefined,
      });
      setEntries(response.entries ?? []);
    } catch {
      toast.error("Failed to load session storage");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [platform, prefix]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openEditor = (entry?: SessionEntry) => {
    setEditorKey(entry?.key ?? "");
    setEditorValue(toPrettyJson(entry?.value ?? ""));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!editorKey.trim()) {
      toast.error("Key is required");
      return;
    }
    try {
      await platform.sendMessage({
        type: "STORAGE_SESSION_SET",
        key: editorKey.trim(),
        value: parseEditorValue(editorValue),
      });
      toast.success("Session entry saved");
      setEditorOpen(false);
      void loadEntries();
    } catch {
      toast.error("Failed to save session entry");
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete session key "${key}"?`)) return;
    try {
      await platform.sendMessage({ type: "STORAGE_SESSION_DELETE", key });
      toast.success("Session entry deleted");
      void loadEntries();
    } catch {
      toast.error("Failed to delete session entry");
    }
  };

  const handleClear = async () => {
    const scoped = prefix.trim();
    const warning = scoped
      ? `Clear all session keys with prefix "${scoped}"?`
      : "Clear all session storage keys?";
    if (!confirm(warning)) return;

    try {
      const response = await platform.sendMessage<{ cleared?: number }>({
        type: "STORAGE_SESSION_CLEAR",
        prefix: scoped || undefined,
      });
      toast.success(`Cleared ${response.cleared ?? 0} session keys`);
      void loadEntries();
    } catch {
      toast.error("Failed to clear session storage");
    }
  };

  const totalBytes = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0),
    [entries],
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Session Storage</h3>
          <p className="text-xs text-muted-foreground">
            {entries.length} key(s) · {formatBytes(totalBytes)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openEditor()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add key
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadJson("session-storage.json", entries)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear}>
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Clear scoped
          </Button>
          <Button size="sm" variant="outline" onClick={() => void loadEntries()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Filter by prefix (optional)"
          className="h-8 max-w-xs text-xs font-mono"
        />
        <Badge variant="outline" className="text-[10px]">Read + Edit + Delete + Export</Badge>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="p-2 font-medium">Actions</th>
              <th className="p-2 font-medium">Key</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 font-medium">Size</th>
              <th className="p-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={5}>
                  {loading ? "Loading session storage…" : "No session entries found."}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.key} className="border-t border-border">
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditor(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(entry.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-2 font-mono">{entry.key}</td>
                  <td className="p-2">{entry.valueType}</td>
                  <td className="p-2">{formatBytes(entry.sizeBytes)}</td>
                  <td className="p-2 font-mono max-w-[420px] truncate" title={toPrettyJson(entry.value)}>
                    {toPrettyJson(entry.value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Session Entry Editor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editorKey}
              onChange={(e) => setEditorKey(e.target.value)}
              placeholder="session key"
              className="font-mono text-xs"
            />
            <Textarea
              value={editorValue}
              onChange={(e) => setEditorValue(e.target.value)}
              className="min-h-40 font-mono text-xs"
              placeholder='{"example":true}'
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSave()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function CookiesPanel() {
  const platform = getPlatform();
  const [cookies, setCookies] = useState<CookieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("lovable.dev");
  const [nameFilter, setNameFilter] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorName, setEditorName] = useState("");
  const [editorValue, setEditorValue] = useState("");
  const [editorDomain, setEditorDomain] = useState("lovable.dev");
  const [editorPath, setEditorPath] = useState("/");
  const [editorSecure, setEditorSecure] = useState(true);
  const [editorHttpOnly, setEditorHttpOnly] = useState(true);
  const [editorSameSite, setEditorSameSite] = useState("lax");

  const loadCookies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await platform.sendMessage<{ cookies?: CookieEntry[] }>({
        type: "STORAGE_COOKIES_LIST",
        domain: domain.trim() || undefined,
        nameContains: nameFilter.trim() || undefined,
      });
      setCookies(response.cookies ?? []);
    } catch {
      toast.error("Failed to load cookies");
      setCookies([]);
    } finally {
      setLoading(false);
    }
  }, [platform, domain, nameFilter]);

  useEffect(() => {
    void loadCookies();
  }, [loadCookies]);

  const openEditor = (entry?: CookieEntry) => {
    setEditorName(entry?.name ?? "");
    setEditorValue(entry?.value ?? "");
    setEditorDomain(entry?.domain.replace(/^\./, "") ?? "lovable.dev");
    setEditorPath(entry?.path ?? "/");
    setEditorSecure(entry?.secure ?? true);
    setEditorHttpOnly(entry?.httpOnly ?? true);
    setEditorSameSite(entry?.sameSite ?? "lax");
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!editorName.trim()) {
      toast.error("Cookie name is required");
      return;
    }

    try {
      await platform.sendMessage({
        type: "STORAGE_COOKIES_SET",
        name: editorName.trim(),
        value: editorValue,
        domain: editorDomain.trim(),
        path: editorPath || "/",
        secure: editorSecure,
        httpOnly: editorHttpOnly,
        sameSite: editorSameSite,
      });
      toast.success("Cookie saved");
      setEditorOpen(false);
      void loadCookies();
    } catch {
      toast.error("Failed to save cookie");
    }
  };

  const handleDelete = async (cookie: CookieEntry) => {
    if (!confirm(`Delete cookie "${cookie.name}"?`)) return;
    try {
      const protocol = cookie.secure ? "https" : "http";
      const normalizedDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
      const url = `${protocol}://${normalizedDomain}${cookie.path || "/"}`;
      await platform.sendMessage({
        type: "STORAGE_COOKIES_DELETE",
        name: cookie.name,
        url,
        storeId: cookie.storeId,
      });
      toast.success("Cookie deleted");
      void loadCookies();
    } catch {
      toast.error("Failed to delete cookie");
    }
  };

  const handleClear = async () => {
    const domainSuffix = domain.trim() ? ` for domain ${domain.trim()}` : "";
    const warning = `Clear cookies${domainSuffix}?`;
    if (!confirm(warning)) return;

    try {
      const response = await platform.sendMessage<{ cleared?: number }>({
        type: "STORAGE_COOKIES_CLEAR",
        domain: domain.trim() || undefined,
        nameContains: nameFilter.trim() || undefined,
      });
      toast.success(`Cleared ${response.cleared ?? 0} cookie(s)`);
      void loadCookies();
    } catch {
      toast.error("Failed to clear cookies");
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Cookies</h3>
          <p className="text-xs text-muted-foreground">{cookies.length} cookie(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openEditor()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add cookie
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadJson("cookies-export.json", cookies)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear}>
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Clear scoped
          </Button>
          <Button size="sm" variant="outline" onClick={() => void loadCookies()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Domain filter (optional)"
          className="h-8 max-w-xs text-xs"
        />
        <Input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Name filter (optional)"
          className="h-8 max-w-xs text-xs"
        />
        <Badge variant="outline" className="text-[10px]">Read + Edit + Delete + Export</Badge>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="p-2 font-medium">Actions</th>
              <th className="p-2 font-medium">Name</th>
              <th className="p-2 font-medium">Domain</th>
              <th className="p-2 font-medium">Path</th>
              <th className="p-2 font-medium">Flags</th>
              <th className="p-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {cookies.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={6}>
                  {loading ? "Loading cookies…" : "No cookies found."}
                </td>
              </tr>
            ) : (
              cookies.map((cookie) => (
                <tr key={`${cookie.domain}-${cookie.name}-${cookie.path}`} className="border-t border-border">
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditor(cookie)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(cookie)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-2 font-mono">{cookie.name}</td>
                  <td className="p-2">{cookie.domain}</td>
                  <td className="p-2">{cookie.path}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {cookie.secure && <Badge variant="outline" className="text-[9px]">secure</Badge>}
                      {cookie.httpOnly && <Badge variant="outline" className="text-[9px]">httpOnly</Badge>}
                      <Badge variant="secondary" className="text-[9px]">{cookie.sameSite}</Badge>
                    </div>
                  </td>
                  <td className="p-2 font-mono max-w-[360px] truncate" title={cookie.value}>{cookie.value}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Cookie Editor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="name"
              className="text-xs"
            />
            <Input
              value={editorDomain}
              onChange={(e) => setEditorDomain(e.target.value)}
              placeholder="domain"
              className="text-xs"
            />
            <Input
              value={editorPath}
              onChange={(e) => setEditorPath(e.target.value)}
              placeholder="path"
              className="text-xs"
            />
            <Input
              value={editorSameSite}
              onChange={(e) => setEditorSameSite(e.target.value)}
              placeholder="sameSite"
              className="text-xs"
            />
          </div>
          <Textarea
            value={editorValue}
            onChange={(e) => setEditorValue(e.target.value)}
            className="min-h-24 font-mono text-xs"
            placeholder="cookie value"
          />
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={editorSecure} onChange={(e) => setEditorSecure(e.target.checked)} /> Secure
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={editorHttpOnly} onChange={(e) => setEditorHttpOnly(e.target.checked)} /> HttpOnly
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSave()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function IndexedDbPanel() {
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<Array<{ name: string; version: number }>>([]);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [databaseView, setDatabaseView] = useState<IndexedDbView | null>(null);
  const [selectedStore, setSelectedStore] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRecord, setEditorRecord] = useState<IndexedRecord | null>(null);
  const [editorValue, setEditorValue] = useState("{}");

  const loadDatabases = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listIndexedDbNames();
      setDatabases(items);
      const nextDb = selectedDatabase && items.some((d) => d.name === selectedDatabase)
        ? selectedDatabase
        : (items[0]?.name ?? "");
      setSelectedDatabase(nextDb);
    } catch {
      toast.error("Failed to inspect IndexedDB databases");
      setDatabases([]);
      setSelectedDatabase("");
    } finally {
      setLoading(false);
    }
  }, [selectedDatabase]);

  const loadSelectedDatabase = useCallback(async () => {
    if (!selectedDatabase) {
      setDatabaseView(null);
      setSelectedStore("");
      return;
    }

    setLoading(true);
    try {
      const view = await inspectIndexedDb(selectedDatabase);
      setDatabaseView(view);
      const nextStore = selectedStore && view.stores.some((store) => store.name === selectedStore)
        ? selectedStore
        : (view.stores[0]?.name ?? "");
      setSelectedStore(nextStore);
    } catch {
      toast.error("Failed to inspect IndexedDB records");
      setDatabaseView(null);
      setSelectedStore("");
    } finally {
      setLoading(false);
    }
  }, [selectedDatabase, selectedStore]);

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    void loadSelectedDatabase();
  }, [loadSelectedDatabase]);

  const selectedStoreView = useMemo(
    () => databaseView?.stores.find((store) => store.name === selectedStore) ?? null,
    [databaseView, selectedStore],
  );

  const openEditor = (record: IndexedRecord) => {
    setEditorRecord(record);
    setEditorValue(toPrettyJson(record.value));
    setEditorOpen(true);
  };

  const handleSaveRecord = async () => {
    if (!selectedDatabase || !selectedStore || !editorRecord) return;
    try {
      await saveIndexedRecord(selectedDatabase, selectedStore, editorRecord.key, parseEditorValue(editorValue) as JsonValue);
      toast.success("IndexedDB record updated");
      setEditorOpen(false);
      void loadSelectedDatabase();
    } catch {
      toast.error("Failed to update IndexedDB record");
    }
  };

  const handleDeleteRecord = async (record: IndexedRecord) => {
    if (!selectedDatabase || !selectedStore) return;
    if (!confirm(`Delete record key "${keyToLabel(record.key)}"?`)) return;
    try {
      await deleteIndexedRecord(selectedDatabase, selectedStore, record.key);
      toast.success("IndexedDB record deleted");
      void loadSelectedDatabase();
    } catch {
      toast.error("Failed to delete IndexedDB record");
    }
  };

  const handleClearStore = async () => {
    if (!selectedDatabase || !selectedStore) return;
    if (!confirm(`Clear all records from store "${selectedStore}"?`)) return;

    try {
      await clearIndexedStore(selectedDatabase, selectedStore);
      toast.success("IndexedDB store cleared");
      void loadSelectedDatabase();
    } catch {
      toast.error("Failed to clear IndexedDB store");
    }
  };

  const handleDeleteDatabase = async () => {
    if (!selectedDatabase) return;
    if (!confirm(`Delete IndexedDB database "${selectedDatabase}"?`)) return;
    try {
      await deleteIndexedDatabase(selectedDatabase);
      toast.success("IndexedDB database deleted");
      setDatabaseView(null);
      setSelectedStore("");
      setSelectedDatabase("");
      void loadDatabases();
    } catch {
      toast.error("Failed to delete IndexedDB database");
    }
  };

  const handleExport = () => {
    downloadJson("indexeddb-export.json", {
      database: selectedDatabase,
      store: selectedStore,
      records: selectedStoreView?.records ?? [],
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">IndexedDB</h3>
          <p className="text-xs text-muted-foreground">
            {databases.length} database(s){databaseView ? ` · v${databaseView.version}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!selectedStoreView}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button size="sm" variant="outline" onClick={() => void loadDatabases()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleClearStore()} disabled={!selectedStoreView}>
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Clear store
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDeleteDatabase()}
            disabled={!selectedDatabase}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete DB
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={selectedDatabase}
          onChange={(e) => setSelectedDatabase(e.target.value)}
        >
          <option value="">Select database</option>
          {databases.map((db) => (
            <option key={db.name} value={db.name}>{db.name}</option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
          disabled={!databaseView || databaseView.stores.length === 0}
        >
          <option value="">Select object store</option>
          {(databaseView?.stores ?? []).map((store) => (
            <option key={store.name} value={store.name}>{store.name}</option>
          ))}
        </select>

        <Badge variant="outline" className="text-[10px]">Read + Edit + Delete + Export</Badge>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="p-2 font-medium">Actions</th>
              <th className="p-2 font-medium">Key</th>
              <th className="p-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {!selectedStoreView ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={3}>
                  {loading ? "Loading IndexedDB…" : "Select a database and object store to inspect records."}
                </td>
              </tr>
            ) : selectedStoreView.records.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={3}>
                  Store is empty.
                </td>
              </tr>
            ) : (
              selectedStoreView.records.map((record, index) => (
                <tr key={`${keyToLabel(record.key)}-${index}`} className="border-t border-border">
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditor(record)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDeleteRecord(record)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-2 font-mono max-w-[220px] truncate" title={keyToLabel(record.key)}>
                    {keyToLabel(record.key)}
                  </td>
                  <td className="p-2 font-mono max-w-[460px] truncate" title={toPrettyJson(record.value)}>
                    {toPrettyJson(record.value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedStoreView && (
        <p className="text-[11px] text-muted-foreground">
          Store <span className="font-mono">{selectedStoreView.name}</span> · {selectedStoreView.count} total record(s)
          {selectedStoreView.keyPath !== null && (
            <span> · keyPath: <span className="font-mono">{toPrettyJson(selectedStoreView.keyPath)}</span></span>
          )}
        </p>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">IndexedDB Record Editor</DialogTitle>
          </DialogHeader>
          <Input value={editorRecord ? keyToLabel(editorRecord.key) : ""} disabled className="font-mono text-xs" />
          <Textarea
            value={editorValue}
            onChange={(e) => setEditorValue(e.target.value)}
            className="min-h-44 font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSaveRecord()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StorageRuntimePanels({ surface }: StorageRuntimePanelsProps) {
  if (surface === "session") {
    return <SessionPanel />;
  }

  if (surface === "cookies") {
    return <CookiesPanel />;
  }

  return <IndexedDbPanel />;
}
