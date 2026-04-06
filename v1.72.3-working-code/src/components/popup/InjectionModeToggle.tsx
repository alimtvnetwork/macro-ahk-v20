/**
 * Marco Extension — Injection Mode Toggle
 *
 * Debug toggle that forces legacy Blob URL injection
 * instead of chrome.userScripts API.
 */

import { useEffect, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bug } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InjectionModeToggle() {
  const [forceLegacy, setForceLegacy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await sendMessage<{ settings: { forceLegacyInjection?: boolean } }>({
          type: "GET_SETTINGS",
        });
        setForceLegacy(res.settings.forceLegacyInjection === true);
      } catch {
        // Settings unavailable
      }
      setLoading(false);
    })();
  }, []);

  const handleToggle = useCallback(async (checked: boolean) => {
    setForceLegacy(checked);
    try {
      await sendMessage({
        type: "SAVE_SETTINGS",
        settings: { forceLegacyInjection: checked },
      });
    } catch {
      setForceLegacy(!checked);
    }
  }, []);

  if (loading) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2">
            <Bug className="h-3.5 w-3.5 text-muted-foreground" />
            <Label
              htmlFor="force-legacy"
              className="text-[11px] font-medium text-foreground cursor-pointer"
            >
              Force legacy DOM injection
            </Label>
          </div>
          <Switch
            id="force-legacy"
            checked={forceLegacy}
            onCheckedChange={handleToggle}
            className="scale-75 origin-right"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px]">
        <p className="text-xs">
          Skip chrome.userScripts API and force Blob URL injection
          for debugging. The injected {"<script>"} tag will be visible
          at the bottom of {"<body>"} with{" "}
          <code className="text-[10px]">data-marco-injection="isolated-blob"</code>.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
