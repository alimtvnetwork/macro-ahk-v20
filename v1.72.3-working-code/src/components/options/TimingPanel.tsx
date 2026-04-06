import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, FileCode } from "lucide-react";

export function TimingPanel() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Clock className="inline h-4 w-4 mr-1.5" />
          Injection Timing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground mb-3">
          Scripts are injected via <code className="bg-muted px-1 rounded">chrome.webNavigation.onCompleted</code> for the top-level frame only.
        </div>

        <TimingEntry
          icon={<Zap className="h-4 w-4" />}
          label="document_start"
          description="Injected before the DOM is parsed. Use for early bootstrapping."
          badge="Earliest"
        />
        <TimingEntry
          icon={<FileCode className="h-4 w-4" />}
          label="document_end"
          description="Injected after DOM parsing but before subresources load."
          badge="After DOM"
        />
        <TimingEntry
          icon={<Clock className="h-4 w-4" />}
          label="document_idle"
          description="Injected after the page fully loads. Default and safest option."
          badge="Default"
        />

        <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1.5">
          <div className="font-medium text-foreground">Execution Flow</div>
          <div className="text-muted-foreground">
            1. Tab navigates → <code>onCompleted</code> fires (frameId=0 only)
          </div>
          <div className="text-muted-foreground">
            2. URL matched against project rules (glob, exact, prefix, regex)
          </div>
          <div className="text-muted-foreground">
            3. Conditions evaluated (cookies, DOM elements, delay)
          </div>
          <div className="text-muted-foreground">
            4. Scripts resolved from storage, sorted by <code>order</code>
          </div>
          <div className="text-muted-foreground">
            5. Each script wrapped in IIFE + try/catch, injected sequentially
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimingEntry({
  icon,
  label,
  description,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-xs font-bold">{label}</code>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {badge}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
