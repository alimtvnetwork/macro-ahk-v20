/**
 * ChainBuilder — Spec 21
 *
 * Visual editor for creating/editing automation chains.
 */

import { useState } from "react";
import type { AutomationChain, ChainStep, TriggerType, TriggerConfig as TriggerConfigType } from "@/lib/automation-types";
import { createDefaultStep, flattenSteps, STEP_TYPE_META } from "@/lib/automation-types";
import { StepCard } from "./StepCard";
import { TriggerConfigPanel } from "./TriggerConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  chain?: AutomationChain;
  onSave: (chain: Partial<AutomationChain>) => void;
  onCancel: () => void;
}

export function ChainBuilder({ chain, onSave, onCancel }: Props) {
  const [name, setName] = useState(chain?.name ?? "");
  const [slug, setSlug] = useState(chain?.slug ?? "");
  const [steps, setSteps] = useState<ChainStep[]>(chain?.steps ?? []);
  const [triggerType, setTriggerType] = useState<TriggerType>(chain?.triggerType ?? "manual");
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType>(chain?.triggerConfig ?? {});
  const [saving, setSaving] = useState(false);

  const flatSteps = flattenSteps(steps);

  const addStep = (type: ChainStep["type"]) => {
    setSteps([...steps, createDefaultStep(type)]);
  };

  const updateStep = (index: number, updated: ChainStep) => {
    const newSteps = [...steps];
    newSteps[index] = updated;
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Chain name is required"); return; }
    if (!slug.trim()) { toast.error("Chain slug is required"); return; }
    if (steps.length === 0) { toast.error("Add at least one step"); return; }

    setSaving(true);
    try {
      onSave({
        id: chain?.id,
        name: name.trim(),
        slug: slug.trim(),
        steps,
        triggerType,
        triggerConfig,
        enabled: chain?.enabled ?? true,
      });
      toast.success(chain ? "Chain updated" : "Chain created");
    } finally {
      setSaving(false);
    }
  };

  // Map flat step indices back to top-level step indices
  const getTopLevelIndex = (flatIdx: number): number => {
    let topIdx = -1;
    for (let i = 0; i <= flatIdx; i++) {
      if (flatSteps[i].depth === 0) topIdx++;
    }
    return topIdx;
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{chain ? "Edit Chain" : "New Automation Chain"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name + Slug */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Review Cycle" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="full-review-cycle"
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {/* Trigger */}
        <TriggerConfigPanel triggerType={triggerType} triggerConfig={triggerConfig} onChange={(t, c) => { setTriggerType(t); setTriggerConfig(c); }} />

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Steps ({steps.length})</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add Step
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {(Object.keys(STEP_TYPE_META) as ChainStep["type"][]).map((type) => {
                  const meta = STEP_TYPE_META[type];
                  return (
                    <DropdownMenuItem key={type} onClick={() => addStep(type)} className="text-xs gap-2">
                      <span>{meta.icon}</span> {meta.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {flatSteps.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No steps yet. Click "Add Step" to begin building your chain.
            </p>
          )}

          <div className="space-y-1.5">
            {flatSteps.map((fs, flatIdx) => (
              <StepCard
                key={flatIdx}
                flatStep={fs}
                index={flatIdx}
                total={flatSteps.length}
                editing={true}
                onChange={(updated) => {
                  if (fs.depth === 0) {
                    updateStep(getTopLevelIndex(flatIdx), updated);
                  }
                }}
                onMoveUp={() => moveStep(getTopLevelIndex(flatIdx), -1)}
                onMoveDown={() => moveStep(getTopLevelIndex(flatIdx), 1)}
                onRemove={() => removeStep(getTopLevelIndex(flatIdx))}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save Chain"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1">
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
