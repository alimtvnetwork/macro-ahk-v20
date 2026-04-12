/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic API explorer types */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Copy, Play, Terminal } from "lucide-react";
import { toast } from "sonner";
import { sendMessage } from "@/lib/message-client";
import {
  type EndpointDoc,
  toEndpointPath,
  toPascalCaseKeys,
  toPrettyJson,
} from "./types";

function generateCurl(type: string, payload: Record<string, unknown>): string {
  const body = JSON.stringify({ Type: type, ...toPascalCaseKeys(payload) });
  return `curl -X POST "chrome-extension://<EXTENSION_ID>/_generated_background_page.html" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
}

function generatePowerShell(type: string, payload: Record<string, unknown>): string {
  const body = JSON.stringify({ Type: type, ...toPascalCaseKeys(payload) });
  return `Invoke-RestMethod -Uri "chrome-extension://<EXTENSION_ID>/_generated_background_page.html" \`\n  -Method POST \`\n  -ContentType "application/json" \`\n  -Body '${body}'`;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied to clipboard`);
  }).catch(() => {
    toast.error("Failed to copy");
  });
}

interface Props {
  endpoint: EndpointDoc;
}

// eslint-disable-next-line max-lines-per-function
export function EndpointAccordionItem({ endpoint }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [requestJson, setRequestJson] = useState(() => {
    const base = endpoint.ExampleRequest
      ? toPascalCaseKeys(endpoint.ExampleRequest)
      : {};
    return toPrettyJson({ Type: endpoint.Type, ...base });
  });
  const [responseJson, setResponseJson] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const path = toEndpointPath(endpoint.Type);
  const method = endpoint.IsMutating ? "POST" : "GET";

  const runRequest = async () => {
    let parsed: unknown;
    try {
      parsed = requestJson.trim() ? JSON.parse(requestJson) : {};
    } catch {
      toast.error("Invalid JSON in request body");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error("Request must be a JSON object");
      return;
    }

    const body = parsed as Record<string, unknown>;
    const { Type: _, type: _t, ...rest } = body;
    const message = { type: endpoint.Type, ...rest };

    setLoading(true);
    try {
      const response = await sendMessage<unknown>(message as any);
      setResponseJson(toPrettyJson(response));
    } catch (error) {
      setResponseJson(toPrettyJson({
        IsOk: false,
        ErrorMessage: error instanceof Error ? error.message : "Request failed",
      }));
    } finally {
      setLoading(false);
    }
  };

  const examplePayload = endpoint.ExampleRequest
    ? toPascalCaseKeys(endpoint.ExampleRequest)
    : {};

  const schemaText = [
    `Endpoint: ${path}`,
    `Type: ${endpoint.Type}`,
    `Method: ${method}`,
    `Category: ${endpoint.Category}`,
    `Description: ${endpoint.Description}`,
    `Mutating: ${endpoint.IsMutating ? "Yes" : "No"}`,
    "",
    "Example Request:",
    toPrettyJson({ Type: endpoint.Type, ...examplePayload }),
  ].join("\n");

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 group"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        }

        <Badge
          variant={endpoint.IsMutating ? "destructive" : "default"}
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 shrink-0"
        >
          {method}
        </Badge>

        <code className="text-xs font-mono text-foreground/90 truncate">
          {path}
        </code>

        <span className="text-xs text-muted-foreground ml-auto shrink-0 hidden sm:inline">
          {endpoint.DisplayName || endpoint.Type}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-4">
          {/* Info row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{endpoint.Category}</Badge>
            <span className="text-sm text-foreground">{endpoint.Description}</span>
          </div>

          {/* Full endpoint path - copyable */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <code className="text-xs font-mono text-foreground flex-1 select-all">{path}</code>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => copyToClipboard(path, "Endpoint path")}
              title="Copy endpoint path"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Schema copy section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Schema &amp; Info</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => copyToClipboard(schemaText, "Schema info")}
              >
                <Copy className="h-3 w-3" /> Copy for AI / Postman
              </Button>
            </div>
            <pre className="rounded-md border border-border bg-background p-3 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
              {schemaText}
            </pre>
          </div>

          {/* cURL / PowerShell snippets */}
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
              onClick={() => setShowSnippets(!showSnippets)}
            >
              <Terminal className="h-3.5 w-3.5" />
              {showSnippets ? "Hide" : "Show"} cURL / PowerShell
            </button>

            {showSnippets && (
              <div className="space-y-3">
                {/* cURL */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">cURL (Shell / Bash)</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(generateCurl(endpoint.Type, examplePayload), "cURL command")}
                      title="Copy cURL"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <pre className="rounded-md border border-border bg-background p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                    {generateCurl(endpoint.Type, examplePayload)}
                  </pre>
                </div>

                {/* PowerShell */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PowerShell</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(generatePowerShell(endpoint.Type, examplePayload), "PowerShell command")}
                      title="Copy PowerShell"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <pre className="rounded-md border border-border bg-background p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                    {generatePowerShell(endpoint.Type, examplePayload)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Request editor */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Request Body</p>
            <Textarea
              value={requestJson}
              onChange={(e) => setRequestJson(e.target.value)}
              className="min-h-32 text-xs font-mono bg-background text-foreground"
              placeholder='{"Type":"GET_STATUS"}'
            />
            <Button
              size="sm"
              onClick={() => void runRequest()}
              disabled={loading}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              {loading ? "Sending…" : "Send Request"}
            </Button>
          </div>

          {/* Response */}
          {responseJson && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Response</p>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => copyToClipboard(responseJson, "Response")}
                  title="Copy response"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="rounded-md border border-border bg-background p-3 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                {responseJson}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
