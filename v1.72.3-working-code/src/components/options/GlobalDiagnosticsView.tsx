import { BootDiagnosticsPanel } from "./BootDiagnosticsPanel";
import { RunStatsPanel } from "./RunStatsPanel";
import { LogViewerPanel } from "./LogViewerPanel";
import { XPathValidationPanel } from "./XPathValidationPanel";

export function GlobalDiagnosticsView() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">Diagnostics</h2>
      <p className="text-xs text-muted-foreground">
        Boot diagnostics, run statistics, log viewer, and XPath validation.
      </p>
      <RunStatsPanel />
      <LogViewerPanel />
      <XPathValidationPanel />
      <BootDiagnosticsPanel />
    </div>
  );
}
