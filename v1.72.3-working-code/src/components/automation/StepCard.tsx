/**
 * StepCard — Spec 21
 *
 * Renders a single automation step with inline editing.
 */

import type { ChainStep, FlattenedStep } from "@/lib/automation-types";
import { STEP_TYPE_META } from "@/lib/automation-types";
import type { StepStatus } from "@/lib/automation-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, Check, Loader2, Clock, AlertCircle, SkipForward } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StepStatusIndicator({ status }: { status?: StepStatus }) {
  if (!status || status === "pending") return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
  if (status === "done") return <Check className="h-3 w-3 text-green-500" />;
  if (status === "error") return <AlertCircle className="h-3 w-3 text-destructive" />;
  if (status === "skipped") return <SkipForward className="h-3 w-3 text-muted-foreground" />;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Step description                                                   */
/* ------------------------------------------------------------------ */

function getStepDescription(step: ChainStep): string {
  switch (step.type) {
    case "inject_prompt": return step.slug || "(no prompt)";
    case "click_button": return step.selector || "(no selector)";
    case "wait": return `${step.durationMs}ms`;
    case "wait_for_element": return `${step.appear !== false ? "appear" : "disappear"}: ${step.selector || "…"}`;
    case "wait_for_text": return `"${step.text || "…"}"`;
    case "run_script": return step.slug || "(no script)";
    case "set_kv": return `${step.key || "?"} = ${step.value || "?"}`;
    case "notify": return step.message || "(no message)";
    case "condition": return `if ${step.check.type}: ${step.check.selector || step.check.key || "?"}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface StepCardProps {
  flatStep: FlattenedStep;
  index: number;
  total: number;
  status?: StepStatus;
  editing: boolean;
  onChange: (step: ChainStep) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

/* ------------------------------------------------------------------ */
/*  Inline editor for each step type                                   */
/* ------------------------------------------------------------------ */

function StepEditor({ step, onChange }: { step: ChainStep; onChange: (s: ChainStep) => void }) {
  switch (step.type) {
    case "inject_prompt":
      return <Input value={step.slug} onChange={(e) => onChange({ ...step, slug: e.target.value })} placeholder="Prompt slug" className="h-7 text-xs" />;
    case "click_button":
      return <Input value={step.selector} onChange={(e) => onChange({ ...step, selector: e.target.value })} placeholder="CSS selector" className="h-7 text-xs" />;
    case "wait":
      return <Input type="number" value={step.durationMs} onChange={(e) => onChange({ ...step, durationMs: Number(e.target.value) })} placeholder="ms" className="h-7 text-xs w-28" />;
    case "wait_for_element":
      return (
        <div className="flex gap-2">
          <Input value={step.selector} onChange={(e) => onChange({ ...step, selector: e.target.value })} placeholder="CSS selector" className="h-7 text-xs flex-1" />
          <Select value={step.appear !== false ? "appear" : "disappear"} onValueChange={(v) => onChange({ ...step, appear: v === "appear" })}>
            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="appear">Appear</SelectItem>
              <SelectItem value="disappear">Disappear</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case "wait_for_text":
      return <Input value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} placeholder="Text to wait for" className="h-7 text-xs" />;
    case "run_script":
      return <Input value={step.slug} onChange={(e) => onChange({ ...step, slug: e.target.value })} placeholder="Script slug" className="h-7 text-xs" />;
    case "set_kv":
      return (
        <div className="flex gap-2">
          <Input value={step.key} onChange={(e) => onChange({ ...step, key: e.target.value })} placeholder="Key" className="h-7 text-xs flex-1" />
          <Input value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })} placeholder="Value" className="h-7 text-xs flex-1" />
        </div>
      );
    case "notify":
      return (
        <div className="flex gap-2">
          <Input value={step.message} onChange={(e) => onChange({ ...step, message: e.target.value })} placeholder="Message" className="h-7 text-xs flex-1" />
          <Select value={step.level ?? "info"} onValueChange={(v) => onChange({ ...step, level: v as "info" | "success" | "warning" | "error" })}>
            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case "condition":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={step.check.type} onValueChange={(v) => onChange({ ...step, check: { ...step.check, type: v as typeof step.check.type } })}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="element_exists">Element Exists</SelectItem>
                <SelectItem value="element_absent">Element Absent</SelectItem>
                <SelectItem value="kv_equals">KV Equals</SelectItem>
                <SelectItem value="kv_exists">KV Exists</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={step.check.selector ?? step.check.key ?? ""}
              onChange={(e) => {
                const isKv = step.check.type.startsWith("kv_");
                onChange({ ...step, check: { ...step.check, ...(isKv ? { key: e.target.value } : { selector: e.target.value }) } });
              }}
              placeholder={step.check.type.startsWith("kv_") ? "Key" : "CSS selector"}
              className="h-7 text-xs flex-1"
            />
          </div>
          {step.check.type === "kv_equals" && (
            <Input value={step.check.value ?? ""} onChange={(e) => onChange({ ...step, check: { ...step.check, value: e.target.value } })} placeholder="Expected value" className="h-7 text-xs" />
          )}
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StepCard({ flatStep, index, total, status, editing, onChange, onMoveUp, onMoveDown, onRemove }: StepCardProps) {
  const { step, depth, branchLabel } = flatStep;
  const meta = STEP_TYPE_META[step.type];

  return (
    <div
      className={`
        flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card text-xs
        ${status === "running" ? "ring-1 ring-primary/50 bg-primary/5" : ""}
        ${status === "error" ? "ring-1 ring-destructive/50 bg-destructive/5" : ""}
        ${status === "skipped" ? "opacity-50" : ""}
      `}
      style={{ marginLeft: depth * 24 }}
    >
      {/* Step number + status */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5 min-w-[24px]">
        <StepStatusIndicator status={status} />
        <span className="text-[10px] text-muted-foreground font-mono">{index + 1}</span>
      </div>

      {/* Branch label */}
      {branchLabel && (
        <Badge variant="outline" className={`text-[9px] mt-0.5 ${branchLabel === "then" ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}>
          {branchLabel === "then" ? "✅ then" : "❌ else"}
        </Badge>
      )}

      {/* Icon + info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <span>{meta.icon}</span>
          <span className={`font-medium ${meta.color}`}>{meta.label}</span>
          {!editing && <span className="text-muted-foreground truncate ml-1">— {getStepDescription(step)}</span>}
        </div>
        {editing && <StepEditor step={step} onChange={onChange} />}
      </div>

      {/* Reorder / delete */}
      {editing && depth === 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRemove}><Trash2 className="h-3 w-3" /></Button>
        </div>
      )}
    </div>
  );
}
