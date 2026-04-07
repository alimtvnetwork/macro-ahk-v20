/* eslint-disable @typescript-eslint/no-explicit-any -- chrome runtime detection via globalThis */
import marcoLogo from "@/assets/marco-logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw, Settings, HelpCircle } from "lucide-react";

interface Props {
  version: string;
  onRefresh: () => void;
}

/** Reads the 4-part manifest version at runtime (e.g. "1.37.0.0"). */
function getManifestVersion(): string | null {
  try {
    const runtime = (globalThis as any).chrome?.runtime;
    if (typeof runtime?.getManifest === "function") {
      return runtime.getManifest().version ?? null;
    }
  } catch { /* not in extension context */ }
  return null;
}

// eslint-disable-next-line max-lines-per-function
export function PopupHeader({ version, onRefresh }: Props) {
  const manifestVersion = getManifestVersion();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <img src={marcoLogo} alt="Marco logo" className="h-9 w-9 rounded-md" />
        <span className="text-sm font-bold tracking-tight text-foreground">Marco</span>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/15 hover:text-primary"
              onClick={onRefresh}
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Reload status, projects, and script states</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/15 hover:text-primary"
              onClick={() => {
                const runtime = (globalThis as any).chrome?.runtime;
                const canOpenOptionsPage = typeof runtime?.openOptionsPage === "function";

                if (canOpenOptionsPage) {
                  runtime.openOptionsPage();
                  return;
                }

                const optionsUrl = runtime?.getURL
                  ? runtime.getURL("src/options/options.html")
                  : "/options.html";
                window.open(optionsUrl, "_blank", "noopener,noreferrer");
              }}
              aria-label="Open Options"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Open full Options & Diagnostics dashboard</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
              onClick={() =>
                window.open("https://github.com", "_blank")
              }
              aria-label="Help"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Open help & documentation</p>
          </TooltipContent>
        </Tooltip>
        {manifestVersion && (
          <Badge
            variant="outline"
            className="text-[10px] font-bold font-mono border-muted-foreground/40 text-muted-foreground bg-muted/30 px-1.5 py-0.5"
          >
            v{manifestVersion}
          </Badge>
        )}
      </div>
    </header>
  );
}
