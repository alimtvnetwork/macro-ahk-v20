import { StatusPanel } from "./StatusPanel";

export function GlobalGeneralView() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">General</h2>
      <p className="text-xs text-muted-foreground">
        System status and connection overview.
      </p>
      <StatusPanel />
    </div>
  );
}
