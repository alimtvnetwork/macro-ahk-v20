import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  Globe,
  Shield,
  ShieldOff,
  EyeOff,
  Link2,
  Variable,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UrlRule {
  pattern: string;
  matchType: string;
  action?: "open" | "ignore";
  excludePattern?: string;
  label?: string;
}

interface ProjectUrl {
  url: string;
  label: string;
  variableName?: string;
}

interface UrlVariable {
  name: string;
  value: string;
  description?: string;
}

type UrlSubTab = "rules" | "project-urls" | "variables";

interface Props {
  targetUrls: UrlRule[];
  onChange: (urls: UrlRule[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ProjectUrlRulesEditor({ targetUrls, onChange }: Props) {
  const [subTab, setSubTab] = useState<UrlSubTab>("rules");

  // Derive project URLs and variables from rules
  const projectUrls: ProjectUrl[] = targetUrls
    .filter((r) => r.label || r.matchType === "exact")
    .map((r) => ({
      url: r.pattern,
      label: r.label || extractLabelFromUrl(r.pattern),
      variableName: r.label ? toVariableName(r.label) : undefined,
    }));

  const urlVariables: UrlVariable[] = targetUrls
    .filter((r) => r.label)
    .map((r) => ({
      name: toVariableName(r.label!),
      value: r.pattern,
      description: r.label,
    }));

  // Stats
  const openCount = targetUrls.filter((r) => !r.action || r.action === "open").length;
  const ignoreCount = targetUrls.filter((r) => r.action === "ignore").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Globe className="inline h-4 w-4 mr-1.5" />
            URLs
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Shield className="h-2.5 w-2.5" />
              {openCount} open
            </Badge>
            {ignoreCount > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <EyeOff className="h-2.5 w-2.5" />
                {ignoreCount} ignored
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as UrlSubTab)}>
          <TabsList className="h-8 w-full justify-start bg-muted/30 mb-3">
            <TabsTrigger value="rules" className="text-xs h-6 px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-3 w-3" />
              Rules
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{targetUrls.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="project-urls" className="text-xs h-6 px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Link2 className="h-3 w-3" />
              Project URLs
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{projectUrls.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="variables" className="text-xs h-6 px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Variable className="h-3 w-3" />
              Variables
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{urlVariables.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-0">
            <UrlRulesSubTab targetUrls={targetUrls} onChange={onChange} />
          </TabsContent>

          <TabsContent value="project-urls" className="mt-0">
            <ProjectUrlsSubTab
              targetUrls={targetUrls}
              onChange={onChange}
            />
          </TabsContent>

          <TabsContent value="variables" className="mt-0">
            <UrlVariablesSubTab
              targetUrls={targetUrls}
              onChange={onChange}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-Tab 1: URL Rules (open / ignore)                               */
/* ------------------------------------------------------------------ */

function UrlRulesSubTab({ targetUrls, onChange }: { targetUrls: UrlRule[]; onChange: (urls: UrlRule[]) => void }) {
  const handleAdd = (action: "open" | "ignore") => {
    onChange([...targetUrls, { pattern: "", matchType: "contains", action }]);
  };

  const handleRemove = (index: number) => {
    onChange(targetUrls.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: string, value: string) => {
    const updated = [...targetUrls];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const openRules = targetUrls
    .map((r, i) => ({ rule: r, index: i }))
    .filter(({ rule }) => !rule.action || rule.action === "open");

  const ignoreRules = targetUrls
    .map((r, i) => ({ rule: r, index: i }))
    .filter(({ rule }) => rule.action === "ignore");

  return (
    <div className="space-y-4">
      {/* Open rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-semibold text-foreground">Open Rules</span>
            <span className="text-[10px] text-muted-foreground">— extension activates on these URLs</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/30 transition-all duration-200"
            onClick={() => handleAdd("open")}
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </Button>
        </div>

        {openRules.length === 0 ? (
          <p className="text-[10px] text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
            No open rules — extension won't activate on any URL
          </p>
        ) : (
          <div className="space-y-1.5">
            {openRules.map(({ rule, index }) => (
              <UrlRuleRow
                key={index}
                rule={rule}
                accent="green"
                onUpdate={(field, value) => handleUpdate(index, field, value)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ignore rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <EyeOff className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">Ignore Rules</span>
            <span className="text-[10px] text-muted-foreground">— extension skips these URLs</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30 transition-all duration-200"
            onClick={() => handleAdd("ignore")}
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </Button>
        </div>

        {ignoreRules.length === 0 ? (
          <p className="text-[10px] text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
            No ignore rules
          </p>
        ) : (
          <div className="space-y-1.5">
            {ignoreRules.map(({ rule, index }) => (
              <UrlRuleRow
                key={index}
                rule={rule}
                accent="amber"
                onUpdate={(field, value) => handleUpdate(index, field, value)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  URL Rule Row                                                       */
/* ------------------------------------------------------------------ */

interface UrlRuleRowProps {
  rule: UrlRule;
  accent: "green" | "amber";
  onUpdate: (field: string, value: string) => void;
  onRemove: () => void;
}

function UrlRuleRow({ rule, accent, onUpdate, onRemove }: UrlRuleRowProps) {
  const borderColor = accent === "green" ? "border-green-500/20" : "border-amber-500/20";
  const bgColor = accent === "green" ? "bg-green-500/5" : "bg-amber-500/5";

  return (
    <div className={`flex items-center gap-1.5 p-1.5 rounded-md border ${borderColor} ${bgColor}`}>
      <Select value={rule.matchType} onValueChange={(v) => onUpdate("matchType", v)}>
        <SelectTrigger className="h-7 text-[10px] w-[80px] shrink-0 border-border/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contains">contains</SelectItem>
          <SelectItem value="exact">exact</SelectItem>
          <SelectItem value="prefix">prefix</SelectItem>
          <SelectItem value="regex">regex</SelectItem>
          <SelectItem value="glob">glob</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={rule.pattern}
        onChange={(e) => onUpdate("pattern", e.target.value)}
        placeholder="https://example.com/*"
        className="h-7 text-[10px] flex-1 font-mono border-border/50"
      />
      <Input
        value={rule.label || ""}
        onChange={(e) => onUpdate("label", e.target.value)}
        placeholder="Label"
        className="h-7 text-[10px] w-[80px] shrink-0 border-border/50"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 hover:bg-destructive/10 transition-all duration-200"
        onClick={onRemove}
      >
        <X className="h-3 w-3 text-destructive/70" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-Tab 2: Project URLs                                            */
/* ------------------------------------------------------------------ */

function ProjectUrlsSubTab({ targetUrls, onChange }: { targetUrls: UrlRule[]; onChange: (urls: UrlRule[]) => void }) {
  const handleAddProjectUrl = () => {
    onChange([...targetUrls, { pattern: "", matchType: "exact", action: "open", label: "" }]);
  };

  const projectEntries = targetUrls
    .map((r, i) => ({ rule: r, index: i }))
    .filter(({ rule }) => rule.matchType === "exact" || rule.label);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
  };

  const handleOpenUrl = (url: string) => {
    if (url) window.open(url, "_blank");
  };

  const handleUpdate = (index: number, field: string, value: string) => {
    const updated = [...targetUrls];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(targetUrls.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Named URLs for quick access and variable binding
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] gap-1 hover:bg-primary/15 hover:text-primary transition-all duration-200"
          onClick={handleAddProjectUrl}
        >
          <Plus className="h-2.5 w-2.5" /> Add URL
        </Button>
      </div>

      {projectEntries.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-md">
          <Link2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No project URLs</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Add exact URLs with labels for quick access and variable binding
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {projectEntries.map(({ rule, index }) => (
            <div
              key={index}
              className="flex items-center gap-1.5 p-2 rounded-md border border-border bg-card hover:bg-muted/30 transition-all duration-200"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={rule.label || ""}
                    onChange={(e) => handleUpdate(index, "label", e.target.value)}
                    placeholder="Label (e.g. Production)"
                    className="h-6 text-[10px] font-semibold border-none shadow-none px-1 bg-transparent"
                  />
                  {rule.label && (
                    <Badge variant="outline" className="text-[9px] shrink-0 font-mono text-muted-foreground">
                      ${"{" + toVariableName(rule.label) + "}"}
                    </Badge>
                  )}
                </div>
                <Input
                  value={rule.pattern}
                  onChange={(e) => handleUpdate(index, "pattern", e.target.value)}
                  placeholder="https://example.com"
                  className="h-6 text-[10px] font-mono border-none shadow-none px-1 bg-transparent text-muted-foreground"
                />
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:bg-primary/10 transition-all duration-200"
                  onClick={() => handleCopyUrl(rule.pattern)}
                  title="Copy URL"
                >
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:bg-primary/10 transition-all duration-200"
                  onClick={() => handleOpenUrl(rule.pattern)}
                  title="Open URL"
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:bg-destructive/10 transition-all duration-200"
                  onClick={() => handleRemove(index)}
                >
                  <X className="h-3 w-3 text-destructive/70" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-Tab 3: URL Variables                                           */
/* ------------------------------------------------------------------ */

function UrlVariablesSubTab({ targetUrls, onChange }: { targetUrls: UrlRule[]; onChange: (urls: UrlRule[]) => void }) {
  const variables = targetUrls
    .filter((r) => r.label)
    .map((r, i) => ({
      originalIndex: targetUrls.indexOf(r),
      name: toVariableName(r.label!),
      value: r.pattern,
      label: r.label!,
    }));

  const handleCopyVariable = (name: string) => {
    navigator.clipboard.writeText("${" + name + "}");
    toast.success(`Copied \${${name}}`);
  };

  const handleCopyAllAsJson = () => {
    const obj: Record<string, string> = {};
    variables.forEach((v) => { obj[v.name] = v.value; });
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success("Copied all variables as JSON");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Auto-generated from labeled URL rules — use in scripts as variables
        </span>
        {variables.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 hover:bg-primary/15 hover:text-primary transition-all duration-200"
            onClick={handleCopyAllAsJson}
          >
            <Copy className="h-2.5 w-2.5" /> Copy JSON
          </Button>
        )}
      </div>

      {variables.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-md">
          <Variable className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No URL variables</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Add labels to URL rules to auto-generate variables
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Variable</th>
                <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Label</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {variables.map((v, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors duration-150">
                  <td className="px-2.5 py-1.5 font-mono text-primary font-semibold">
                    ${"{" + v.name + "}"}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-muted-foreground truncate max-w-[200px]" title={v.value}>
                    {v.value || <span className="text-destructive/50 italic">empty</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-foreground">{v.label}</td>
                  <td className="px-1 py-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 hover:bg-primary/10 transition-all duration-200"
                      onClick={() => handleCopyVariable(v.name)}
                      title="Copy variable reference"
                    >
                      <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").split(".")[0] || url;
  } catch {
    return url.substring(0, 30);
  }
}

function toVariableName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    || "url";
}
