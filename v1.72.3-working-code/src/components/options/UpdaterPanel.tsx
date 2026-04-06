/**
 * UpdaterPanel — Manage updater entries for a project.
 *
 * Connects to the UpdaterInfo system (spec/12-chrome-extension/58-updater-system.md).
 * Shows linked updaters with full metadata, endpoints, steps, and advanced settings.
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Settings,
  Link,
  ListOrdered,
  Tag,
  Power,
  Globe,
  GitBranch,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UpdaterEndpoint {
  id: number;
  url: string;
  sortOrder: number;
  expectedStatusCode: number;
  isRedirectable: boolean;
  maxRedirectDepth: number;
}

interface UpdaterStep {
  id: number;
  stepId: string;
  sortOrder: number;
  type: "Download" | "Execute" | "Update" | "Validate";
  condition?: string;
  resourceType?: "Script" | "Binary" | "ChromeExtension";
  sourceUrl?: string;
  expectedStatus?: number;
  isRedirectable?: boolean;
  maxRedirectDepth?: number;
  destination?: string;
  postProcess?: string;
  executionCommand?: string;
  validationRule?: string;
}

interface UpdaterEntry {
  id: number;
  name: string;
  description?: string;
  scriptUrl: string;
  versionInfoUrl?: string;
  instructionUrl?: string;
  changelogUrl?: string;
  isGit: boolean;
  isRedirectable: boolean;
  maxRedirectDepth: number;
  isInstructionRedirect: boolean;
  instructionRedirectDepth: number;
  hasInstructions: boolean;
  hasChangelogFromVersionInfo: boolean;
  hasUserConfirmBeforeUpdate: boolean;
  isEnabled: boolean;
  autoCheckIntervalMinutes: number;
  cacheExpiryMinutes: number;
  cachedRedirectUrl?: string;
  cachedRedirectAt?: string;
  currentVersion?: string;
  latestVersion?: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
  categories: string[];
  endpoints: UpdaterEndpoint[];
  steps: UpdaterStep[];
  status?: "up-to-date" | "update-available" | "error" | "unchecked";
}

/* ------------------------------------------------------------------ */
/*  Interval Options                                                   */
/* ------------------------------------------------------------------ */

const INTERVAL_OPTIONS = [
  { label: "Hourly", value: 60 },
  { label: "Every 5 hours", value: 300 },
  { label: "Every 12 hours", value: 720 },
  { label: "Daily", value: 1440 },
  { label: "Every 2 days", value: 2880 },
  { label: "Every 3 days", value: 4320 },
  { label: "Every 5 days", value: 7200 },
  { label: "Weekly", value: 10080 },
  { label: "Every 15 days", value: 21600 },
  { label: "Monthly", value: 43200 },
  { label: "Every 2 months", value: 86400 },
  { label: "Every 3 months", value: 129600 },
  { label: "Yearly", value: 525600 },
] as const;

const STEP_TYPES = ["Download", "Execute", "Update", "Validate"] as const;
const RESOURCE_TYPES = ["Script", "Binary", "ChromeExtension"] as const;

const AVAILABLE_CATEGORIES = ["Script", "Binary", "ChromeExtension", "Security", "Feature", "Bugfix", "Core"] as const;

function intervalLabel(minutes: number): string {
  return INTERVAL_OPTIONS.find((o) => o.value === minutes)?.label ?? `${minutes}m`;
}

/* ------------------------------------------------------------------ */
/*  Backend → UI Mapper                                                */
/* ------------------------------------------------------------------ */

/** Maps a backend UpdaterDetails row to the UI UpdaterEntry shape. */
function mapBackendEntry(u: Record<string, unknown>): UpdaterEntry {
  const cats = typeof u.Categories === "string" && u.Categories
    ? (u.Categories as string).split(", ").filter(Boolean)
    : [];

  const computeStatus = (): UpdaterEntry["status"] => {
    if (!u.LastCheckedAt) return "unchecked";
    if (u.CurrentVersion && u.LatestVersion && u.CurrentVersion !== u.LatestVersion) return "update-available";
    if (u.LatestVersion) return "up-to-date";
    return "unchecked";
  };

  return {
    id: (u.UpdaterId ?? u.Id ?? 0) as number,
    name: (u.Name ?? "") as string,
    description: (u.Description as string) ?? undefined,
    scriptUrl: (u.ScriptUrl ?? "") as string,
    versionInfoUrl: (u.VersionInfoUrl as string) ?? undefined,
    instructionUrl: (u.InstructionUrl as string) ?? undefined,
    changelogUrl: (u.ChangelogUrl as string) ?? undefined,
    isGit: u.IsGit === 1 || u.IsGit === true,
    isRedirectable: u.IsRedirectable !== 0 && u.IsRedirectable !== false,
    maxRedirectDepth: (u.MaxRedirectDepth ?? 2) as number,
    isInstructionRedirect: u.IsInstructionRedirect === 1 || u.IsInstructionRedirect === true,
    instructionRedirectDepth: (u.InstructionRedirectDepth ?? 2) as number,
    hasInstructions: u.HasInstructions === 1 || u.HasInstructions === true,
    hasChangelogFromVersionInfo: u.HasChangelogFromVersionInfo !== 0 && u.HasChangelogFromVersionInfo !== false,
    hasUserConfirmBeforeUpdate: u.HasUserConfirmBeforeUpdate === 1 || u.HasUserConfirmBeforeUpdate === true,
    isEnabled: u.IsEnabled !== 0 && u.IsEnabled !== false,
    autoCheckIntervalMinutes: (u.AutoCheckIntervalMinutes ?? 1440) as number,
    cacheExpiryMinutes: (u.CacheExpiryMinutes ?? 10080) as number,
    cachedRedirectUrl: (u.CachedRedirectUrl as string) ?? undefined,
    cachedRedirectAt: (u.CachedRedirectAt as string) ?? undefined,
    currentVersion: (u.CurrentVersion as string) ?? undefined,
    latestVersion: (u.LatestVersion as string) ?? undefined,
    lastCheckedAt: (u.LastCheckedAt as string) ?? undefined,
    lastUpdatedAt: (u.LastUpdatedAt as string) ?? undefined,
    categories: cats,
    endpoints: [],
    steps: [],
    status: computeStatus(),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  projectId: string;
}

export function UpdaterPanel({ projectId: _projectId }: Props) {
  const [updaters, setUpdaters] = useState<UpdaterEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  /** Load updaters from background via LIST_UPDATERS message. */
  const loadUpdaters = useCallback(async () => {
    try {
      const result = await sendMessage<{ updaters: Array<Record<string, unknown>> }>({
        type: "LIST_UPDATERS",
      });
      const mapped: UpdaterEntry[] = (result.updaters ?? []).map((u) => mapBackendEntry(u));
      setUpdaters(mapped);
    } catch (err) {
      console.warn("[UpdaterPanel] Failed to load updaters:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUpdaters(); }, [loadUpdaters]);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newScriptUrl, setNewScriptUrl] = useState("");
  const [newVersionUrl, setNewVersionUrl] = useState("");
  const [newInstructionUrl, setNewInstructionUrl] = useState("");
  const [newChangelogUrl, setNewChangelogUrl] = useState("");
  const [newIsGit, setNewIsGit] = useState(false);
  const [newIsRedirectable, setNewIsRedirectable] = useState(true);
  const [newMaxRedirectDepth, setNewMaxRedirectDepth] = useState(2);
  const [newAutoCheck, setNewAutoCheck] = useState(1440);
  const [newCacheExpiry, setNewCacheExpiry] = useState(10080);
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [newHasConfirm, setNewHasConfirm] = useState(false);
  const [newHasChangelogFromVersionInfo, setNewHasChangelogFromVersionInfo] = useState(true);

  const resetAddForm = () => {
    setNewName("");
    setNewDescription("");
    setNewScriptUrl("");
    setNewVersionUrl("");
    setNewInstructionUrl("");
    setNewChangelogUrl("");
    setNewIsGit(false);
    setNewIsRedirectable(true);
    setNewMaxRedirectDepth(2);
    setNewAutoCheck(1440);
    setNewCacheExpiry(10080);
    setNewCategories([]);
    setNewHasConfirm(false);
    setNewHasChangelogFromVersionInfo(true);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newScriptUrl.trim()) {
      toast.error("Name and Script URL are required");
      return;
    }
    try {
      await sendMessage({
        type: "CREATE_UPDATER",
        data: {
          name: newName.trim(),
          scriptUrl: newScriptUrl.trim(),
          versionInfoUrl: newVersionUrl.trim() || undefined,
          instructionUrl: newInstructionUrl.trim() || undefined,
          changelogUrl: newChangelogUrl.trim() || undefined,
          isGit: newIsGit,
          isRedirectable: newIsRedirectable,
          maxRedirectDepth: newMaxRedirectDepth,
          hasChangelogFromVersionInfo: newHasChangelogFromVersionInfo,
          hasUserConfirmBeforeUpdate: newHasConfirm,
          autoCheckIntervalMinutes: newAutoCheck,
          cacheExpiryMinutes: newCacheExpiry,
        },
      });
      resetAddForm();
      setIsAdding(false);
      toast.success(`Added updater "${newName.trim()}"`);
      await loadUpdaters();
    } catch (err) {
      toast.error("Failed to create updater");
      console.warn("[UpdaterPanel] Create failed:", err);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await sendMessage({ type: "DELETE_UPDATER", updaterId: id });
      if (expandedId === id) setExpandedId(null);
      toast.success("Updater removed");
      await loadUpdaters();
    } catch (err) {
      toast.error("Failed to delete updater");
      console.warn("[UpdaterPanel] Delete failed:", err);
    }
  };

  const handleToggleEnabled = (id: number) => {
    setUpdaters((prev) =>
      prev.map((u) => (u.id === id ? { ...u, isEnabled: !u.isEnabled } : u)),
    );
  };

  const handleCheck = async (id: number) => {
    setCheckingId(id);
    try {
      const result = await sendMessage<{
        hasUpdate: boolean;
        latestVersion: string | null;
        currentVersion: string | null;
        errorMessage?: string;
      }>({ type: "CHECK_FOR_UPDATE", updaterId: id });

      if (result.errorMessage) {
        toast.error(result.errorMessage);
        setUpdaters((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "error" as const, lastCheckedAt: new Date().toISOString() } : u,
          ),
        );
      } else {
        const status = result.hasUpdate ? "update-available" as const : "up-to-date" as const;
        setUpdaters((prev) =>
          prev.map((u) =>
            u.id === id
              ? {
                  ...u,
                  status,
                  latestVersion: result.latestVersion ?? u.latestVersion,
                  currentVersion: result.currentVersion ?? u.currentVersion,
                  lastCheckedAt: new Date().toISOString(),
                }
              : u,
          ),
        );
        toast.success(result.hasUpdate ? `Update available: v${result.latestVersion}` : "Up to date");
      }
    } catch (err) {
      toast.error("Update check failed");
      console.warn("[UpdaterPanel] Check failed:", err);
      setUpdaters((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, status: "error" as const } : u,
        ),
      );
    } finally {
      setCheckingId(null);
    }
  };

  const handleUpdateField = (id: number, field: keyof UpdaterEntry, value: unknown) => {
    setUpdaters((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)),
    );
  };

  // Endpoint management
  const handleAddEndpoint = (updaterId: number) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        const ep: UpdaterEndpoint = {
          id: Date.now(),
          url: "",
          sortOrder: u.endpoints.length,
          expectedStatusCode: 200,
          isRedirectable: false,
          maxRedirectDepth: 2,
        };
        return { ...u, endpoints: [...u.endpoints, ep] };
      }),
    );
  };

  const handleRemoveEndpoint = (updaterId: number, endpointId: number) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        return { ...u, endpoints: u.endpoints.filter((e) => e.id !== endpointId) };
      }),
    );
  };

  const handleUpdateEndpoint = (updaterId: number, endpointId: number, field: keyof UpdaterEndpoint, value: unknown) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        return {
          ...u,
          endpoints: u.endpoints.map((e) =>
            e.id === endpointId ? { ...e, [field]: value } : e,
          ),
        };
      }),
    );
  };

  // Step management
  const handleAddStep = (updaterId: number) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        const step: UpdaterStep = {
          id: Date.now(),
          stepId: `step-${u.steps.length + 1}`,
          sortOrder: u.steps.length,
          type: "Download",
        };
        return { ...u, steps: [...u.steps, step] };
      }),
    );
  };

  const handleRemoveStep = (updaterId: number, stepId: number) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        return { ...u, steps: u.steps.filter((s) => s.id !== stepId) };
      }),
    );
  };

  const handleUpdateStep = (updaterId: number, stepId: number, field: keyof UpdaterStep, value: unknown) => {
    setUpdaters((prev) =>
      prev.map((u) => {
        if (u.id !== updaterId) return u;
        return {
          ...u,
          steps: u.steps.map((s) =>
            s.id === stepId ? { ...s, [field]: value } : s,
          ),
        };
      }),
    );
  };

  const toggleCategory = (cats: string[], cat: string) =>
    cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];

  const statusIcon = (status?: string) => {
    switch (status) {
      case "up-to-date":
        return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
      case "update-available":
        return <AlertCircle className="h-3.5 w-3.5 text-accent" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (status?: string) => {
    switch (status) {
      case "up-to-date": return "Up to date";
      case "update-available": return "Update available";
      case "error": return "Error";
      default: return "Unchecked";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Update Sources
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure remote URLs to check for script and project updates.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Source
        </Button>
      </div>

      {/* Add form */}
      {isAdding && (
        <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/10 anim-fade-in-up">
          <h4 className="text-xs font-semibold text-foreground">New Update Source</h4>

          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Riseup Macro SDK" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Purpose of this source" className="h-8 text-xs" />
            </div>
          </div>

          {/* URLs */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">URLs</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Script URL *</Label>
                <Input value={newScriptUrl} onChange={(e) => setNewScriptUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Version Info URL</Label>
                <Input value={newVersionUrl} onChange={(e) => setNewVersionUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instruction URL</Label>
                <Input value={newInstructionUrl} onChange={(e) => setNewInstructionUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Changelog URL</Label>
                <Input value={newChangelogUrl} onChange={(e) => setNewChangelogUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs font-mono" />
              </div>
            </div>
          </div>

          {/* Settings row */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Settings</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Auto-Check Interval</Label>
                <Select value={String(newAutoCheck)} onValueChange={(v) => setNewAutoCheck(Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cache Expiry</Label>
                <Select value={String(newCacheExpiry)} onValueChange={(v) => setNewCacheExpiry(Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Redirect Depth</Label>
                <Input type="number" min={0} max={10} value={newMaxRedirectDepth} onChange={(e) => setNewMaxRedirectDepth(Number(e.target.value))} className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={newIsGit} onCheckedChange={setNewIsGit} className="scale-75" />
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              Git source
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={newIsRedirectable} onCheckedChange={setNewIsRedirectable} className="scale-75" />
              <Globe className="h-3 w-3 text-muted-foreground" />
              Allow redirects
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={newHasConfirm} onCheckedChange={setNewHasConfirm} className="scale-75" />
              <Shield className="h-3 w-3 text-muted-foreground" />
              Confirm before update
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={newHasChangelogFromVersionInfo} onCheckedChange={setNewHasChangelogFromVersionInfo} className="scale-75" />
              Changelog from VersionInfo
            </label>
          </div>

          {/* Categories */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNewCategories((c) => toggleCategory(c, cat))}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all duration-200 ${
                    newCategories.includes(cat)
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-muted/20 text-muted-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { resetAddForm(); setIsAdding(false); }} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} className="text-xs gap-1.5">
              <Plus className="h-3 w-3" />
              Add Source
            </Button>
          </div>
        </div>
      )}

      {/* Updater list */}
      {updaters.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p>No update sources configured</p>
          <p className="mt-1">Add a source to enable remote updates for this project.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {updaters.map((u) => (
            <UpdaterEntryCard
              key={u.id}
              entry={u}
              isExpanded={expandedId === u.id}
              isChecking={checkingId === u.id}
              statusIcon={statusIcon(u.status)}
              statusLabel={statusLabel(u.status)}
              onToggleExpand={() => setExpandedId(expandedId === u.id ? null : u.id)}
              onCheck={() => void handleCheck(u.id)}
              onRemove={() => handleRemove(u.id)}
              onToggleEnabled={() => handleToggleEnabled(u.id)}
              onUpdateField={(field, value) => handleUpdateField(u.id, field, value)}
              onAddEndpoint={() => handleAddEndpoint(u.id)}
              onRemoveEndpoint={(epId) => handleRemoveEndpoint(u.id, epId)}
              onUpdateEndpoint={(epId, field, value) => handleUpdateEndpoint(u.id, epId, field, value)}
              onAddStep={() => handleAddStep(u.id)}
              onRemoveStep={(stepId) => handleRemoveStep(u.id, stepId)}
              onUpdateStep={(stepId, field, value) => handleUpdateStep(u.id, stepId, field, value)}
              toggleCategory={toggleCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Updater Entry Card                                                 */
/* ------------------------------------------------------------------ */

interface UpdaterEntryCardProps {
  entry: UpdaterEntry;
  isExpanded: boolean;
  isChecking: boolean;
  statusIcon: React.ReactNode;
  statusLabel: string;
  onToggleExpand: () => void;
  onCheck: () => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
  onUpdateField: (field: keyof UpdaterEntry, value: unknown) => void;
  onAddEndpoint: () => void;
  onRemoveEndpoint: (id: number) => void;
  onUpdateEndpoint: (id: number, field: keyof UpdaterEndpoint, value: unknown) => void;
  onAddStep: () => void;
  onRemoveStep: (id: number) => void;
  onUpdateStep: (id: number, field: keyof UpdaterStep, value: unknown) => void;
  toggleCategory: (cats: string[], cat: string) => string[];
}

function UpdaterEntryCard({
  entry: u,
  isExpanded,
  isChecking,
  statusIcon,
  statusLabel,
  onToggleExpand,
  onCheck,
  onRemove,
  onToggleEnabled,
  onUpdateField,
  onAddEndpoint,
  onRemoveEndpoint,
  onUpdateEndpoint,
  onAddStep,
  onRemoveStep,
  onUpdateStep,
  toggleCategory,
}: UpdaterEntryCardProps) {
  return (
    <div className={`rounded-lg border bg-card transition-all duration-200 ${u.isEnabled ? "border-border hover:border-primary/30" : "border-border/50 opacity-60"}`}>
      {/* Summary row */}
      <div className="flex items-center gap-3 p-3">
        <button onClick={onToggleExpand} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{u.name}</span>
            {u.isGit && (
              <span className="text-[9px] font-mono bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">GIT</span>
            )}
            <span className={`text-[10px] font-medium ${
              u.status === "up-to-date" ? "text-primary" :
              u.status === "update-available" ? "text-accent" :
              u.status === "error" ? "text-destructive" :
              "text-muted-foreground"
            }`}>
              {statusLabel}
            </span>
            {!u.isEnabled && (
              <span className="text-[9px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">DISABLED</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <div className="flex items-center gap-1">
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground truncate max-w-[250px]">{u.scriptUrl}</span>
            </div>
            {u.currentVersion && (
              <span className="text-[10px] font-mono text-muted-foreground">v{u.currentVersion}</span>
            )}
            {u.latestVersion && u.latestVersion !== u.currentVersion && (
              <span className="text-[10px] font-mono text-primary">→ v{u.latestVersion}</span>
            )}
            <span className="text-[10px] text-muted-foreground">{intervalLabel(u.autoCheckIntervalMinutes)}</span>
          </div>
          {u.categories.length > 0 && (
            <div className="flex gap-1 mt-1">
              {u.categories.map((cat) => (
                <span key={cat} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cat}</span>
              ))}
            </div>
          )}
          {u.lastCheckedAt && (
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              Last checked: {new Date(u.lastCheckedAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-all duration-200"
            onClick={onCheck}
            disabled={isChecking || !u.isEnabled}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 hover:bg-muted transition-all duration-200"
            onClick={onToggleEnabled}
            title={u.isEnabled ? "Disable" : "Enable"}
          >
            <Power className={`h-3.5 w-3.5 ${u.isEnabled ? "text-primary" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 transition-all duration-200"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/5">
          {/* URLs */}
          <Section icon={<Link className="h-3.5 w-3.5" />} title="URLs">
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="Script URL" value={u.scriptUrl} onChange={(v) => onUpdateField("scriptUrl", v)} mono />
              <FieldInput label="Version Info URL" value={u.versionInfoUrl ?? ""} onChange={(v) => onUpdateField("versionInfoUrl", v || undefined)} mono />
              <FieldInput label="Instruction URL" value={u.instructionUrl ?? ""} onChange={(v) => onUpdateField("instructionUrl", v || undefined)} mono />
              <FieldInput label="Changelog URL" value={u.changelogUrl ?? ""} onChange={(v) => onUpdateField("changelogUrl", v || undefined)} mono />
            </div>
            {u.cachedRedirectUrl && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                <span className="font-medium">Cached redirect:</span>{" "}
                <code className="bg-muted/30 px-1.5 py-0.5 rounded font-mono">{u.cachedRedirectUrl}</code>
                {u.cachedRedirectAt && <span className="ml-2">({new Date(u.cachedRedirectAt).toLocaleString()})</span>}
              </div>
            )}
          </Section>

          {/* Advanced Settings */}
          <Section icon={<Settings className="h-3.5 w-3.5" />} title="Advanced Settings" collapsible>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Auto-Check Interval</Label>
                <Select value={String(u.autoCheckIntervalMinutes)} onValueChange={(v) => onUpdateField("autoCheckIntervalMinutes", Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cache Expiry</Label>
                <Select value={String(u.cacheExpiryMinutes)} onValueChange={(v) => onUpdateField("cacheExpiryMinutes", Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Redirect Depth</Label>
                <Input type="number" min={0} max={10} value={u.maxRedirectDepth} onChange={(e) => onUpdateField("maxRedirectDepth", Number(e.target.value))} className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={u.isGit} onCheckedChange={(v) => onUpdateField("isGit", v)} className="scale-75" />
                Git source
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={u.isRedirectable} onCheckedChange={(v) => onUpdateField("isRedirectable", v)} className="scale-75" />
                Allow redirects
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={u.hasUserConfirmBeforeUpdate} onCheckedChange={(v) => onUpdateField("hasUserConfirmBeforeUpdate", v)} className="scale-75" />
                Confirm before update
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={u.hasChangelogFromVersionInfo} onCheckedChange={(v) => onUpdateField("hasChangelogFromVersionInfo", v)} className="scale-75" />
                Changelog from VersionInfo
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={u.isInstructionRedirect} onCheckedChange={(v) => onUpdateField("isInstructionRedirect", v)} className="scale-75" />
                Instruction redirects
              </label>
            </div>
            {u.isInstructionRedirect && (
              <div className="mt-2 w-48">
                <Label className="text-xs">Instruction redirect depth</Label>
                <Input type="number" min={0} max={10} value={u.instructionRedirectDepth} onChange={(e) => onUpdateField("instructionRedirectDepth", Number(e.target.value))} className="h-8 text-xs" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <FieldInput label="Current Version" value={u.currentVersion ?? ""} onChange={(v) => onUpdateField("currentVersion", v || undefined)} mono />
              <FieldInput label="Latest Version" value={u.latestVersion ?? ""} onChange={(v) => onUpdateField("latestVersion", v || undefined)} mono />
            </div>
          </Section>

          {/* Categories */}
          <Section icon={<Tag className="h-3.5 w-3.5" />} title="Categories">
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onUpdateField("categories", toggleCategory(u.categories, cat))}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all duration-200 ${
                    u.categories.includes(cat)
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-muted/20 text-muted-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </Section>

          {/* Endpoints */}
          <Section icon={<Globe className="h-3.5 w-3.5" />} title={`Endpoints (${u.endpoints.length})`} collapsible>
            <div className="space-y-2">
              {u.endpoints.map((ep, i) => (
                <div key={ep.id} className="flex items-start gap-2 rounded-md border border-border/50 p-2 bg-background">
                  <span className="text-[10px] text-muted-foreground font-mono mt-2 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <Input value={ep.url} onChange={(e) => onUpdateEndpoint(ep.id, "url", e.target.value)} placeholder="https://..." className="h-7 text-xs font-mono" />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Label className="text-[10px]">Status</Label>
                        <Input type="number" value={ep.expectedStatusCode} onChange={(e) => onUpdateEndpoint(ep.id, "expectedStatusCode", Number(e.target.value))} className="h-6 w-16 text-[10px]" />
                      </div>
                      <label className="flex items-center gap-1 text-[10px]">
                        <Switch checked={ep.isRedirectable} onCheckedChange={(v) => onUpdateEndpoint(ep.id, "isRedirectable", v)} className="scale-[0.6]" />
                        Redirects
                      </label>
                      {ep.isRedirectable && (
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px]">Depth</Label>
                          <Input type="number" min={0} max={10} value={ep.maxRedirectDepth} onChange={(e) => onUpdateEndpoint(ep.id, "maxRedirectDepth", Number(e.target.value))} className="h-6 w-12 text-[10px]" />
                        </div>
                      )}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => onRemoveEndpoint(ep.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="text-xs gap-1.5 w-full" onClick={onAddEndpoint}>
                <Plus className="h-3 w-3" />
                Add Endpoint
              </Button>
            </div>
          </Section>

          {/* Steps */}
          <Section icon={<ListOrdered className="h-3.5 w-3.5" />} title={`Steps (${u.steps.length})`} collapsible>
            <div className="space-y-2">
              {u.steps.map((step, i) => (
                <div key={step.id} className="rounded-md border border-border/50 p-3 bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                    <Select value={step.type} onValueChange={(v) => onUpdateStep(step.id, "type", v)}>
                      <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STEP_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={step.stepId} onChange={(e) => onUpdateStep(step.id, "stepId", e.target.value)} placeholder="step-id" className="h-7 text-xs font-mono flex-1" />
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => onRemoveStep(step.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Resource Type</Label>
                      <Select value={step.resourceType ?? ""} onValueChange={(v) => onUpdateStep(step.id, "resourceType", v || undefined)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="" className="text-xs">None</SelectItem>
                          {RESOURCE_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <FieldInput label="Source URL" value={step.sourceUrl ?? ""} onChange={(v) => onUpdateStep(step.id, "sourceUrl", v || undefined)} mono small />
                    <FieldInput label="Destination" value={step.destination ?? ""} onChange={(v) => onUpdateStep(step.id, "destination", v || undefined)} mono small />
                    <FieldInput label="Condition" value={step.condition ?? ""} onChange={(v) => onUpdateStep(step.id, "condition", v || undefined)} small />
                    {step.type === "Execute" && (
                      <FieldInput label="Command" value={step.executionCommand ?? ""} onChange={(v) => onUpdateStep(step.id, "executionCommand", v || undefined)} mono small />
                    )}
                    {step.type === "Validate" && (
                      <FieldInput label="Validation Rule" value={step.validationRule ?? ""} onChange={(v) => onUpdateStep(step.id, "validationRule", v || undefined)} mono small />
                    )}
                    {(step.type === "Download" || step.type === "Update") && (
                      <FieldInput label="Post-Process" value={step.postProcess ?? ""} onChange={(v) => onUpdateStep(step.id, "postProcess", v || undefined)} small />
                    )}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="text-xs gap-1.5 w-full" onClick={onAddStep}>
                <Plus className="h-3 w-3" />
                Add Step
              </Button>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({ icon, title, children, collapsible }: { icon: React.ReactNode; title: string; children: React.ReactNode; collapsible?: boolean }) {
  if (collapsible) {
    return (
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary transition-colors w-full group">
          {icon}
          {title}
          <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto group-data-[state=open]:rotate-90 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-foreground">{icon}{title}</h4>
      {children}
    </div>
  );
}

function FieldInput({ label, value, onChange, mono, small }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; small?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className={small ? "text-[10px]" : "text-xs"}>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className={`${small ? "h-7" : "h-8"} text-xs ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
