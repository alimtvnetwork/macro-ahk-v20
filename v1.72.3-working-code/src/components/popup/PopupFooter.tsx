import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FileText, Download, Package, Upload, RotateCcw, Loader2, Keyboard, ExternalLink, Check, type LucideIcon, ClipboardCopy, FolderArchive, FolderInput, FolderOutput, RefreshCw, Database } from "lucide-react";
import { SessionCopyButton } from "@/components/popup/SessionCopyButton";
import { InjectionCopyButton } from "@/components/popup/InjectionCopyButton";
import React, { useState } from "react";

interface Props {
  loggingMode: string;
  logsLoading: boolean;
  exportLoading: boolean;
  dbExportLoading: boolean;
  dbImportLoading: boolean;
  onViewLogs: () => void;
  onExport: () => void;
  onDbExport: () => void;
  onDbImport: (mode: "merge" | "replace") => void;
  onRefresh: () => void;
}

function ShortcutTooltipButton() {
  const [isOpen, setIsOpen] = useState(false);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const modifierKey = isMac ? '⌘' : 'Ctrl';
  const shortcutText = `${modifierKey}+Shift+↓`;
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shortcutText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  const handleCustomize = () => {
    window.open('chrome://extensions/shortcuts', '_blank');
  };

  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger asChild>
        <button
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-muted/60 border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
        >
          {isCopied ? <Check className="h-3 w-3 text-accent" /> : <Keyboard className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={10}
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-popover p-0 shadow-[0_12px_40px_-8px_hsl(var(--primary)/0.3)] backdrop-blur-md w-[220px]"
      >
        <div className="tooltip-enter">
          <div className="px-3.5 pt-3 pb-2 space-y-2.5">
            <p className="text-[11px] font-semibold text-foreground tracking-wide">
              Quick Run Shortcut
            </p>

            <div className="flex items-center gap-1.5">
              <KbdKey label={modifierKey} />
              <span className="text-muted-foreground text-[10px] font-medium">+</span>
              <KbdKey label="Shift" />
              <span className="text-muted-foreground text-[10px] font-medium">+</span>
              <KbdKey label="↓" isArrow />
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Inject & run scripts on the active tab
            </p>
          </div>

          <button
            onClick={handleCustomize}
            className="flex items-center gap-1.5 w-full px-3.5 py-2 border-t border-border/60 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors duration-150 cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Customize shortcut</span>
          </button>

          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function KbdKey({ label, isArrow = false }: { label: string; isArrow?: boolean }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[1.6rem] h-6 px-1.5 rounded-md bg-muted border border-border font-mono font-semibold text-foreground shadow-[0_2px_4px_hsl(var(--border)),inset_0_1px_0_hsl(var(--card))] ${
        isArrow ? 'text-[15px] leading-none' : 'text-[11px]'
      }`}
    >
      {label}
    </kbd>
  );
}

interface AnimatedTooltipProps {
  title: string;
  description: string;
  shortcut?: string;
  icon: LucideIcon;
  accentColor: string;
  children: React.ReactNode;
}

function AnimatedTooltip({ title, description, shortcut, icon: Icon, accentColor, children }: AnimatedTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="relative overflow-hidden rounded-xl border border-primary/15 bg-popover p-0 shadow-[0_10px_30px_-6px_hsl(var(--primary)/0.25)] backdrop-blur-md max-w-[200px]"
      >
        <div className="tooltip-enter">
          <div className="px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-6 w-6 rounded-md ${accentColor}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <p className="text-[11px] font-semibold text-foreground tracking-wide">{title}</p>
                  {shortcut && (
                    <kbd className="inline-flex items-center h-[16px] px-1 rounded bg-muted border border-border font-mono text-[8px] font-medium text-muted-foreground shrink-0">
                      {shortcut}
                    </kbd>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed pl-8">
              {description}
            </p>
          </div>
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function PopupFooter({
  loggingMode,
  logsLoading,
  exportLoading,
  dbExportLoading,
  dbImportLoading,
  onViewLogs,
  onExport,
  onDbExport,
  onDbImport,
  onRefresh,
}: Props) {
  const [importMode, setImportMode] = useState<"merge" | "replace">("replace");

  return (
    <footer className="px-3 py-2 border-t border-border bg-card space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] text-muted-foreground">
            {loggingMode} logging
          </p>
          <ShortcutTooltipButton />
        </div>
        <div className="flex items-center gap-1.5">
          <InjectionCopyButton />
          <SessionCopyButton />
        </div>
      </div>

      {/* Quick Actions — 3 core buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        <AnimatedTooltip
          title="View Logs"
          description="Copy session logs to clipboard for debugging"
          icon={ClipboardCopy}
          accentColor="bg-[hsl(200_70%_50%/0.15)] text-[hsl(200_70%_55%)]"
        >
          <Button
            size="sm"
            className="h-8 text-[9px] gap-1 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onViewLogs}
            disabled={logsLoading}
          >
            {logsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            Logs
          </Button>
        </AnimatedTooltip>

        <AnimatedTooltip
          title="Export Logs"
          description="Download logs, errors & DB as a ZIP bundle"
          icon={FolderArchive}
          accentColor="bg-[hsl(38_90%_50%/0.15)] text-[hsl(38_90%_55%)]"
        >
          <Button
            size="sm"
            className="h-8 text-[9px] gap-1 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onExport}
            disabled={exportLoading}
          >
            {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
            Exp Logs
          </Button>
        </AnimatedTooltip>

        <AnimatedTooltip
          title="Refresh"
          description="Reload all popup data from background"
          icon={RefreshCw}
          accentColor="bg-[hsl(170_60%_42%/0.15)] text-[hsl(170_60%_47%)]"
        >
          <Button
            size="sm"
            className="h-8 text-[9px] gap-1 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onRefresh}
          >
            <RotateCcw className="h-3 w-3" />
            Refresh
          </Button>
        </AnimatedTooltip>
      </div>

      {/* SQLite Bundle Actions — unified bar */}
      <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 gap-0">
        <AnimatedTooltip
          title="Export DB"
          description="Export all projects, scripts & configs as a SQLite bundle"
          icon={Database}
          accentColor="bg-[hsl(260_60%_55%/0.15)] text-[hsl(260_60%_60%)]"
        >
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-[9px] gap-1 text-primary hover:bg-primary/10 rounded-md"
            onClick={onDbExport}
            disabled={dbExportLoading}
          >
            {dbExportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
            Export DB
          </Button>
        </AnimatedTooltip>

        <div className="w-px h-5 bg-border/60 shrink-0" />

        <ToggleGroup
          type="single"
          value={importMode}
          onValueChange={(val) => { if (val) setImportMode(val as "merge" | "replace"); }}
          className="bg-muted/50 rounded-md p-0.5 shrink-0 mx-0.5"
        >
          <ToggleGroupItem value="merge" className="text-[9px] h-5 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm">
            Merge
          </ToggleGroupItem>
          <ToggleGroupItem value="replace" className="text-[9px] h-5 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm">
            Replace All
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="w-px h-5 bg-border/60 shrink-0" />

        <AnimatedTooltip
          title="Import DB"
          description={`Import a SQLite bundle using ${importMode === "merge" ? "merge (upsert)" : "replace all (destructive)"} mode`}
          icon={Upload}
          accentColor="bg-[hsl(260_60%_55%/0.15)] text-[hsl(260_60%_60%)]"
        >
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-[9px] gap-1 text-primary hover:bg-primary/10 rounded-md"
            onClick={() => onDbImport(importMode)}
            disabled={dbImportLoading}
          >
            {dbImportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Import
          </Button>
        </AnimatedTooltip>
      </div>
    </footer>
  );
}
