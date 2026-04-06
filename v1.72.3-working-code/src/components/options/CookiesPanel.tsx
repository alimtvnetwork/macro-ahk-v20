import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cookie, Plus, Trash2, GripVertical, Code } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Canonical CookieBinding — matches StoredProject.cookies[].
 * Used by the SDK namespace builder for role-based cookie access.
 */
export interface CookieBinding {
  cookieName: string;
  url: string;
  role: "session" | "refresh" | "custom";
  description?: string;
}

/** Legacy CookieRule — kept for backward compat with older stored data. */
export interface CookieRule {
  id: string;
  name: string;
  domain: string;
  matchStrategy: "exact" | "prefix" | "contains" | "regex";
  bindTo: string;
}

interface Props {
  /** Canonical cookie bindings (StoredProject.cookies) */
  bindings: CookieBinding[];
  onChange: (bindings: CookieBinding[]) => void;
  /** SDK namespace for code examples */
  sdkNamespace?: string;
  /** Legacy cookie rules — shown as read-only migration notice if present */
  legacyRules?: CookieRule[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CookiesPanel({ bindings, onChange, sdkNamespace, legacyRules }: Props) {
  const handleAdd = () => {
    const newBinding: CookieBinding = {
      cookieName: "",
      url: "",
      role: "custom",
    };
    onChange([...bindings, newBinding]);
  };

  const handleUpdate = (index: number, updates: Partial<CookieBinding>) => {
    onChange(bindings.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  const handleDelete = (index: number) => {
    onChange(bindings.filter((_, i) => i !== index));
  };

  const hasBindings = bindings.length > 0;
  const ns = sdkNamespace ?? "RiseupAsiaMacroExt.Projects.YourProject";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Cookie className="inline h-4 w-4 mr-1.5" />
            Cookie Bindings
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
            Add Binding
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasBindings ? (
          <div className="space-y-3">
            {bindings.map((binding, index) => (
              <CookieBindingRow
                key={`${binding.cookieName}-${index}`}
                binding={binding}
                onUpdate={(updates) => handleUpdate(index, updates)}
                onDelete={() => handleDelete(index)}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}

        {/* Legacy rules migration notice */}
        {legacyRules && legacyRules.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[10px] font-medium text-amber-600">
              ⚠️ {legacyRules.length} legacy cookie rule(s) detected — migrate to bindings above for SDK access.
            </p>
          </div>
        )}

        <SdkAccessGuide ns={ns} />
        <HelpText />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface CookieBindingRowProps {
  binding: CookieBinding;
  onUpdate: (updates: Partial<CookieBinding>) => void;
  onDelete: () => void;
}

function CookieBindingRow({ binding, onUpdate, onDelete }: CookieBindingRowProps) {
  return (
    <div className="group flex items-start gap-2 rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <GripVertical className="h-4 w-4 mt-2 text-muted-foreground/40 shrink-0" />

      <div className="flex-1 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">Cookie Name</label>
          <Input
            value={binding.cookieName}
            onChange={(e) => onUpdate({ cookieName: e.target.value })}
            placeholder="e.g. lovable-session-id"
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">URL (domain)</label>
          <Input
            value={binding.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="e.g. https://lovable.dev"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">Role</label>
          <Select
            value={binding.role}
            onValueChange={(v) => onUpdate({ role: v as CookieBinding["role"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="session">session</SelectItem>
              <SelectItem value="refresh">refresh</SelectItem>
              <SelectItem value="custom">custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">Description (optional)</label>
          <Input
            value={binding.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
            placeholder="What this cookie is for"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 mt-0.5"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Cookie className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-xs">No cookie bindings configured.</p>
      <p className="text-[10px] mt-0.5">
        Add bindings to access cookies via the SDK with role-based lookup.
      </p>
    </div>
  );
}

function SdkAccessGuide({ ns }: { ns: string }) {
  return (
    <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-[10px] font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
        <Code className="h-3 w-3" />
        SDK Access — Developer Guide
      </p>
      <div className="space-y-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Get by role (recommended):</p>
          <code className="text-[10px] font-mono text-foreground bg-muted/50 px-2 py-1 rounded block select-all">
            {ns}.cookies.getByRole("session")
          </code>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Get session token shortcut:</p>
          <code className="text-[10px] font-mono text-foreground bg-muted/50 px-2 py-1 rounded block select-all">
            {ns}.cookies.getSessionToken()
          </code>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Get by cookie name:</p>
          <code className="text-[10px] font-mono text-foreground bg-muted/50 px-2 py-1 rounded block select-all">
            {ns}.cookies.get("lovable-session-id")
          </code>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">List all bindings:</p>
          <code className="text-[10px] font-mono text-foreground bg-muted/50 px-2 py-1 rounded block select-all">
            {ns}.cookies.bindings
          </code>
        </div>
      </div>
    </div>
  );
}

function HelpText() {
  return (
    <div className="mt-4 rounded-md bg-muted/50 p-3 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        How cookie bindings work
      </p>
      <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc list-inside">
        <li>
          <strong>Cookie name</strong> — the exact cookie name to read (e.g.{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">lovable-session-id</code>)
        </li>
        <li>
          <strong>URL</strong> — the domain URL for cookie access (e.g.{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">https://lovable.dev</code>)
        </li>
        <li>
          <strong>Role</strong> — semantic role used for SDK lookup:{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">session</code>,{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">refresh</code>, or{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">custom</code>
        </li>
        <li>
          Scripts access cookies via{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">cookies.getByRole("session")</code> or{" "}
          <code className="text-[9px] bg-muted px-0.5 rounded">cookies.get("cookieName")</code>
        </li>
      </ul>
    </div>
  );
}
