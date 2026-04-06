import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileCode, Code, Settings2 } from "lucide-react";
import type { PopupScript } from "@/hooks/use-popup-data";

interface Props {
  scripts: PopupScript[];
  onToggle: (scriptId: string) => void;
}

export function ScriptToggleList({ scripts, onToggle }: Props) {
  const hasScripts = scripts.length > 0;

  const handleJsEdit = (scriptId: string) => {
    const win = globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } };
    const getURL = win.chrome?.runtime?.getURL;
    const optionsUrl = getURL
      ? getURL(`src/options/options.html#scripts?edit=${encodeURIComponent(scriptId)}`)
      : `/#scripts?edit=${encodeURIComponent(scriptId)}`;
    window.open(optionsUrl, "_blank");
  };

  const handleConfigEdit = (scriptId: string) => {
    const win = globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } };
    const getURL = win.chrome?.runtime?.getURL;
    const optionsUrl = getURL
      ? getURL(`src/options/options.html#configs?edit=${encodeURIComponent(scriptId)}`)
      : `/#configs?edit=${encodeURIComponent(scriptId)}`;
    window.open(optionsUrl, "_blank");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Scripts</span>
        <span className="text-[10px] text-muted-foreground">{scripts.length} total</span>
      </div>

      {hasScripts ? (
        <div className="rounded-md border border-border bg-card divide-y divide-border">
          {scripts.map((script) => (
            <div
              key={script.id}
              className="flex items-center justify-between px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {script.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 cursor-help">
                          #{script.order}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Execution order — lower numbers run first</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 cursor-help">
                          {script.runAt ?? "idle"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {script.runAt === "document_start"
                            ? "Runs as soon as the page begins loading (before DOM is ready)"
                            : script.runAt === "document_end"
                              ? "Runs after the DOM is fully parsed but before all resources load"
                              : "Runs after the page is fully loaded and idle"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <button
                      onClick={() => handleJsEdit(script.id)}
                      className="text-[9px] font-mono text-primary hover:text-primary/80 hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      JS Edit
                    </button>
                    <button
                      onClick={() => handleConfigEdit(script.id)}
                      className="text-[9px] font-mono text-primary hover:text-primary/80 hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      Config
                    </button>
                  </div>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={script.isEnabled}
                      onCheckedChange={() => onToggle(script.id)}
                      className="shrink-0"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {script.isEnabled
                      ? "Disable — script will not run on next injection"
                      : "Enable — script will run on next injection"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">
          No scripts configured. Add scripts in Options.
        </p>
      )}
    </div>
  );
}