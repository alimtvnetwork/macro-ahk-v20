/**
 * TriggerConfig — Spec 21
 *
 * UI for configuring automation chain triggers.
 */

import type { TriggerType, TriggerConfig as TriggerConfigType } from "@/lib/automation-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  triggerType: TriggerType;
  triggerConfig: TriggerConfigType;
  onChange: (type: TriggerType, config: TriggerConfigType) => void;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual: "Manual",
  on_page_load: "On Page Load",
  on_element: "On Element Appear",
  interval: "Interval",
  cron: "Cron Schedule",
};

export function TriggerConfigPanel({ triggerType, triggerConfig, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Trigger</Label>
        <Select
          value={triggerType}
          onValueChange={(v) => onChange(v as TriggerType, triggerConfig)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.entries(TRIGGER_LABELS) as [TriggerType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {triggerType === "on_page_load" && (
        <div className="space-y-1.5">
          <Label className="text-xs">URL Pattern</Label>
          <Input
            value={triggerConfig.urlPattern ?? ""}
            onChange={(e) => onChange(triggerType, { ...triggerConfig, urlPattern: e.target.value })}
            placeholder="https://example.com/*"
            className="h-7 text-xs"
          />
        </div>
      )}

      {triggerType === "on_element" && (
        <div className="space-y-1.5">
          <Label className="text-xs">CSS Selector</Label>
          <Input
            value={triggerConfig.elementSelector ?? ""}
            onChange={(e) => onChange(triggerType, { ...triggerConfig, elementSelector: e.target.value })}
            placeholder=".my-element"
            className="h-7 text-xs"
          />
        </div>
      )}

      {triggerType === "interval" && (
        <div className="flex gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Every (minutes)</Label>
            <Input
              type="number" min={1}
              value={triggerConfig.intervalMinutes ?? 5}
              onChange={(e) => onChange(triggerType, { ...triggerConfig, intervalMinutes: Number(e.target.value) })}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Max Runs</Label>
            <Input
              type="number" min={1}
              value={triggerConfig.maxRuns ?? 10}
              onChange={(e) => onChange(triggerType, { ...triggerConfig, maxRuns: Number(e.target.value) })}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}

      {triggerType === "cron" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Cron Expression</Label>
          <Input
            value={triggerConfig.cronExpression ?? ""}
            onChange={(e) => onChange(triggerType, { ...triggerConfig, cronExpression: e.target.value })}
            placeholder="0 9 * * *"
            className="h-7 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">Standard cron format (minute hour day month weekday)</p>
        </div>
      )}
    </div>
  );
}
