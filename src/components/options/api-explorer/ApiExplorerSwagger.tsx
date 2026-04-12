/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic API explorer message types */
/**
 * Swagger-Style API Explorer
 * See: spec/05-chrome-extension/64-api-explorer-swagger.md
 */
import { useEffect, useMemo, useState } from "react";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Server } from "lucide-react";
import { toast } from "sonner";
import {
  type EndpointDoc,
  type ApiStatus,
  type ApiEndpointsResponse,
  normalizeEndpoint,
} from "./types";
import { EndpointAccordionItem } from "./EndpointAccordionItem";

// eslint-disable-next-line max-lines-per-function
export function ApiExplorerSwagger() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointDoc[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const loadStatus = async () => {
    try {
      const result = await sendMessage<ApiStatus & { isOk?: boolean }>({ type: "GET_API_STATUS" as any });
      setStatus({
        service: result.service,
        version: result.version,
        connection: result.connection,
        health: result.health,
        endpointCount: result.endpointCount,
        persistenceMode: result.persistenceMode,
      });
    } catch {
      toast.error("Failed to load API status");
    }
  };

  const loadEndpoints = async () => {
    try {
      const result = await sendMessage<ApiEndpointsResponse>({ type: "GET_API_ENDPOINTS" as any });
      const raw = result.endpoints ?? [];
      setEndpoints(raw.map((e) => normalizeEndpoint(e as unknown as Record<string, unknown>)));
    } catch {
      toast.error("Failed to load API endpoint docs");
    }
  };

  useEffect(() => {
    void Promise.all([loadStatus(), loadEndpoints()]);
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(endpoints.map((e) => e.Category));
    return ["all", ...Array.from(cats).sort()];
  }, [endpoints]);

  const filtered = useMemo(() => {
    let list = endpoints;
    if (categoryFilter !== "all") {
      list = list.filter((e) => e.Category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.Type.toLowerCase().includes(q) ||
          (e.DisplayName ?? "").toLowerCase().includes(q) ||
          e.Description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [endpoints, categoryFilter, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, EndpointDoc[]>();
    for (const ep of filtered) {
      const cat = ep.Category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ep);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Server className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            {status?.service ?? "Marco Extension API"}
          </h3>
          {status && (
            <>
              <Badge variant="outline" className="text-xs">v{status.version}</Badge>
              <Badge
                variant={status.health === "HEALTHY" ? "default" : "destructive"}
                className="text-xs"
              >
                {status.health}
              </Badge>
              <Badge variant="outline" className="text-xs">{status.connection}</Badge>
              <Badge variant="secondary" className="text-xs">
                {status.endpointCount} Endpoints
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Persistence: {status.persistenceMode}
              </span>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => void Promise.all([loadStatus(), loadEndpoints()])}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/40 hover:text-foreground"
              }`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint groups */}
      {grouped.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {endpoints.length === 0 ? "Loading endpoints..." : "No endpoints match your search."}
        </div>
      )}

      {grouped.map(([category, eps]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            {category}
            <span className="ml-2 text-foreground/50 font-normal normal-case">
              ({eps.length} endpoint{eps.length !== 1 ? "s" : ""})
            </span>
          </h4>
          <div className="space-y-2">
            {eps.map((ep) => (
              <EndpointAccordionItem key={ep.Type} endpoint={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
