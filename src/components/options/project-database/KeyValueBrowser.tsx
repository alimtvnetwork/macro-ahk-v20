/**
 * Marco Extension — KeyValue Store Browser
 *
 * Inline browser for the project's KeyValueStore table.
 * Supports viewing, adding, editing, and deleting KV entries
 * with namespace filtering.
 *
 * @see spec/11-chrome-extension/90-namespace-database-creation.md
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Edit2, RefreshCw, Loader2, Search, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { sendMessage } from "@/lib/message-client";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface KeyValueBrowserProps {
  projectSlug: string;
}

interface KvEntry {
  Id: number;
  Namespace: string;
  Key: string;
  Value: string | null;
  ValueType: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export function KeyValueBrowser({ projectSlug }: KeyValueBrowserProps) {
  const [entries, setEntries] = useState<KvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterNamespace, setFilterNamespace] = useState("__all__");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // Add/Edit dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KvEntry | null>(null);
  const [formNs, setFormNs] = useState("default");
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formType, setFormType] = useState("text");
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ isOk: boolean; rows?: KvEntry[]; total?: number }>({
        type: "PROJECT_API" as any,
        project: projectSlug,
        method: "GET",
        endpoint: "KeyValueStore",
        params: { limit: 200, offset: 0 },
      } as any);

      if (result.isOk && result.rows) {
        setEntries(result.rows);
        const uniqueNs = [...new Set(result.rows.map((r) => r.Namespace))].sort();
        setNamespaces(uniqueNs);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const filteredEntries = entries.filter((e) => {
    const matchNs = filterNamespace === "__all__" || e.Namespace === filterNamespace;
    const matchSearch =
      !searchTerm ||
      e.Key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.Value ?? "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchNs && matchSearch;
  });

  const openAddDialog = () => {
    setEditingEntry(null);
    setFormNs("default");
    setFormKey("");
    setFormValue("");
    setFormType("text");
    setShowDialog(true);
  };

  const openEditDialog = (entry: KvEntry) => {
    setEditingEntry(entry);
    setFormNs(entry.Namespace);
    setFormKey(entry.Key);
    setFormValue(entry.Value ?? "");
    setFormType(entry.ValueType);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formKey.trim()) {
      toast.error("Key is required");
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        // Update existing
        await sendMessage({
          type: "PROJECT_API" as any,
          project: projectSlug,
          method: "PUT",
          endpoint: "KeyValueStore",
          id: editingEntry.Id,
          body: {
            Namespace: formNs.trim() || "default",
            Key: formKey.trim(),
            Value: formValue,
            ValueType: formType,
          },
        } as any);
        toast.success(`Updated "${formKey.trim()}"`);
      } else {
        // Create new
        await sendMessage({
          type: "PROJECT_API" as any,
          project: projectSlug,
          method: "POST",
          endpoint: "KeyValueStore",
          body: {
            Namespace: formNs.trim() || "default",
            Key: formKey.trim(),
            Value: formValue,
            ValueType: formType,
          },
        } as any);
        toast.success(`Added "${formKey.trim()}"`);
      }

      setShowDialog(false);
      void fetchEntries();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: KvEntry) => {
    if (!confirm(`Delete key "${entry.Key}" from namespace "${entry.Namespace}"?`)) return;

    try {
      await sendMessage({
        type: "PROJECT_API" as any,
        project: projectSlug,
        method: "DELETE",
        endpoint: "KeyValueStore",
        id: entry.Id,
      } as any);
      toast.success(`Deleted "${entry.Key}"`);
      void fetchEntries();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const truncateValue = (val: string | null, max = 60): string => {
    if (!val) return "—";
    return val.length > max ? val.slice(0, max) + "…" : val;
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[120px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search keys or values…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 text-[11px] pl-7"
          />
        </div>

        {namespaces.length > 1 && (
          <Select value={filterNamespace} onValueChange={setFilterNamespace}>
            <SelectTrigger className="h-7 text-[11px] w-[130px]">
              <SelectValue placeholder="All namespaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-[11px]">All namespaces</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns} className="text-[11px]">{ns}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="ghost" size="sm" onClick={() => void fetchEntries()} className="h-7 w-7 p-0">
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button size="sm" onClick={openAddDialog} className="h-7 text-[11px] gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-4">
          {entries.length === 0 ? "No entries yet. Click \"Add\" to create one." : "No matching entries."}
        </p>
      ) : (
        <div className="max-h-[280px] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] w-[90px]">Namespace</TableHead>
                <TableHead className="text-[10px]">Key</TableHead>
                <TableHead className="text-[10px]">Value</TableHead>
                <TableHead className="text-[10px] w-[50px]">Type</TableHead>
                <TableHead className="text-[10px] w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.Id}>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {entry.Namespace}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono font-medium">{entry.Key}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={entry.Value ?? ""}>
                    {truncateValue(entry.Value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[9px]">{entry.ValueType}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(entry)}
                        className="h-5 w-5 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(entry)}
                        className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground text-right">
        {filteredEntries.length} of {entries.length} entries
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingEntry ? "Edit Entry" : "Add Entry"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingEntry ? "Update the key-value pair." : "Add a new key-value pair to the store."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Namespace</Label>
              <Input
                value={formNs}
                onChange={(e) => setFormNs(e.target.value)}
                placeholder="default"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Key</Label>
              <Input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                placeholder="my-key"
                className="h-8 text-sm font-mono"
                disabled={!!editingEntry}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <textarea
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="Enter value..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text" className="text-xs">text</SelectItem>
                  <SelectItem value="json" className="text-xs">json</SelectItem>
                  <SelectItem value="number" className="text-xs">number</SelectItem>
                  <SelectItem value="boolean" className="text-xs">boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowDialog(false)} className="h-7 text-xs gap-1">
              <X className="h-3 w-3" /> Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving || !formKey.trim()} className="h-7 text-xs gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {editingEntry ? "Update" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
