/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic API explorer message types */
import type { JsonValue } from "@/background/handlers/handler-types";
import { useEffect, useMemo, useState } from "react";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type EndpointDoc = {
  type: string;
  displayName?: string;
  category: string;
  description: string;
  isMutating: boolean;
  exampleRequest?: Record<string, unknown>;
};

type ApiEndpointsResponse = {
  endpoints?: EndpointDoc[];
  total?: number;
};

type ApiStatus = {
  service: string;
  version: string;
  connection: string;
  health: string;
  endpointCount: number;
  persistenceMode: string;
};

function toPrettyJson(value: JsonValue): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// eslint-disable-next-line max-lines-per-function
export function ApiExplorerCard() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointDoc[]>([]);
  const [selectedType, setSelectedType] = useState<string>("GET_STATUS");
  const [requestJson, setRequestJson] = useState<string>(toPrettyJson({ type: "GET_STATUS" }));
  const [responseJson, setResponseJson] = useState<string>("{}");
  const [loading, setLoading] = useState(false);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.type === selectedType) ?? null,
    [endpoints, selectedType],
  );

  const applyEndpointRequestTemplate = (type: string, docs: EndpointDoc[] = endpoints) => {
    const doc = docs.find((entry) => entry.type === type);
    const basePayload = doc?.exampleRequest ? { ...doc.exampleRequest } : {};
    const payloadWithType = { ...basePayload, type };
    setRequestJson(toPrettyJson(payloadWithType));
  };

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
      const docs = result.endpoints ?? [];
      setEndpoints(docs);
      if (docs.length > 0) {
        const initialType = docs.some((doc) => doc.type === selectedType)
          ? selectedType
          : docs[0].type;
        setSelectedType(initialType);
        applyEndpointRequestTemplate(initialType, docs);
      }
    } catch {
      toast.error("Failed to load API endpoint docs");
    }
  };

  useEffect(() => {
    void Promise.all([loadStatus(), loadEndpoints()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runRequest = async () => {
    let parsedBody: JsonValue = {};
    try {
      parsedBody = requestJson.trim() ? JSON.parse(requestJson) : {};
    } catch {
      toast.error("Request JSON is invalid");
      return;
    }

    if (parsedBody === null || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      toast.error("Request JSON must be an object");
      return;
    }

    const body = parsedBody as Record<string, unknown>;
    const { type: _ignoredType, ...rest } = body;
    const message: Record<string, unknown> = { type: selectedType, ...rest };

    setLoading(true);
    try {
      const response = await sendMessage<unknown>(message as any);
      setResponseJson(toPrettyJson(response as JsonValue));
    } catch (error) {
      setResponseJson(toPrettyJson({
        isOk: false,
        errorMessage: error instanceof Error ? error.message : "Request failed",
      }));
      toast.error("API test request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void loadStatus()}>
          Refresh status
        </Button>
        <Button size="sm" variant="outline" onClick={() => void loadEndpoints()}>
          Refresh endpoints
        </Button>
        {status && (
          <>
            <Badge variant="outline">{status.connection}</Badge>
            <Badge variant="outline">{status.health}</Badge>
            <Badge variant="secondary">{status.endpointCount} endpoints</Badge>
          </>
        )}
      </div>

      {status && (
        <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
          {status.service} · v{status.version} · persistence: {status.persistenceMode}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-2">
          <p className="text-xs font-medium">Endpoint catalog</p>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/20 p-2 space-y-1.5">
            {endpoints.map((endpoint) => {
              const active = endpoint.type === selectedType;
              return (
                <button
                  key={endpoint.type}
                  type="button"
                  className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                  onClick={() => {
                    setSelectedType(endpoint.type);
                    applyEndpointRequestTemplate(endpoint.type);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">{endpoint.displayName || endpoint.type}</span>
                    <Badge variant={endpoint.isMutating ? "secondary" : "outline"} className="text-[9px]">
                      {endpoint.isMutating ? "write" : "read"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="opacity-50 mr-1">[{endpoint.type}]</span>
                    {endpoint.description}
                  </p>
                </button>
              );
            })}
            {endpoints.length === 0 && (
              <p className="text-xs text-muted-foreground">No endpoints loaded yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">API testing</p>
          <Select
            value={selectedType}
            onValueChange={(value) => {
              setSelectedType(value);
              applyEndpointRequestTemplate(value);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select endpoint" />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((endpoint) => (
                <SelectItem key={endpoint.type} value={endpoint.type}>
                  {endpoint.displayName || endpoint.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedEndpoint && (
            <p className="text-[10px] text-muted-foreground">{selectedEndpoint.category}</p>
          )}
          <Textarea
            value={requestJson}
            onChange={(event) => setRequestJson(event.target.value)}
            className="min-h-36 text-xs font-mono"
            placeholder='{"type":"GET_STATUS"}'
          />
          <Button size="sm" onClick={() => void runRequest()} disabled={loading}>
            {loading ? "Sending…" : "Send test request"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Response</p>
        <Textarea
          value={responseJson}
          readOnly
          className="min-h-40 text-xs font-mono"
        />
      </div>
    </div>
  );
}
