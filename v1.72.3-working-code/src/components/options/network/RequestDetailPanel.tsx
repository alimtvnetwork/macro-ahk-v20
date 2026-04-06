import type { NetworkEntry } from "@/hooks/use-network-data";

interface RequestDetailPanelProps {
  request: NetworkEntry;
}

/** Expanded detail view for a single network request. */
export function RequestDetailPanel({ request }: RequestDetailPanelProps) {
  const formattedResponse = formatResponsePreview(request.responsePreview);
  const hasRequestHeaders = hasNonEmptyHeaders(request.requestHeaders);
  const hasResponseHeaders = hasNonEmptyHeaders(request.responseHeaders);
  const hasResponse = formattedResponse.length > 0;

  return (
    <div className="bg-muted/30 border-t border-border px-6 py-4 space-y-4">
      <FullUrlBlock url={request.url} />
      <GeneralInfoGrid request={request} />
      <HeadersSection
        requestHeaders={request.requestHeaders}
        responseHeaders={request.responseHeaders}
        hasRequestHeaders={hasRequestHeaders}
        hasResponseHeaders={hasResponseHeaders}
      />
      <ResponsePreviewBlock
        hasResponse={hasResponse}
        formattedResponse={formattedResponse}
      />
    </div>
  );
}

/* ---- Sub-components ---- */

/** Full URL display block. */
function FullUrlBlock({ url }: { url: string }) {
  return (
    <div>
      <SectionLabel text="Full URL" />
      <code className="text-xs font-mono text-foreground break-all block bg-muted/50 rounded-md px-3 py-2">
        {url}
      </code>
    </div>
  );
}

/** Grid of general request info fields. */
function GeneralInfoGrid({ request }: { request: NetworkEntry }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <DetailField label="Method" value={request.method} />
      <DetailField label="Status" value={`${request.status} ${request.statusText}`} />
      <DetailField label="Duration" value={`${request.durationMs}ms`} />
      <DetailField label="Type" value={request.requestType.toUpperCase()} />
      <DetailField label="Initiator" value={request.initiator} />
      <DetailField label="Timestamp" value={new Date(request.timestamp).toLocaleString()} />
    </div>
  );
}

interface HeadersSectionProps {
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  hasRequestHeaders: boolean;
  hasResponseHeaders: boolean;
}

/** Side-by-side request and response headers. */
function HeadersSection({
  requestHeaders,
  responseHeaders,
  hasRequestHeaders,
  hasResponseHeaders,
}: HeadersSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <HeaderBlock
        title="Request Headers"
        headers={requestHeaders}
        hasHeaders={hasRequestHeaders}
      />
      <HeaderBlock
        title="Response Headers"
        headers={responseHeaders}
        hasHeaders={hasResponseHeaders}
      />
    </div>
  );
}

interface HeaderBlockProps {
  title: string;
  headers?: Record<string, string>;
  hasHeaders: boolean;
}

/** A single header table with title. */
function HeaderBlock({ title, headers, hasHeaders }: HeaderBlockProps) {
  return (
    <div>
      <SectionLabel text={title} />
      {hasHeaders ? (
        <HeadersTable headers={headers!} />
      ) : (
        <p className="text-xs text-muted-foreground italic">No headers captured</p>
      )}
    </div>
  );
}

/** Key-value table of HTTP headers. */
function HeadersTable({ headers }: { headers: Record<string, string> }) {
  return (
    <div className="rounded-md border bg-muted/50 overflow-hidden">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="flex border-b border-border last:border-b-0 text-xs">
          <span className="px-2 py-1 font-mono font-semibold text-muted-foreground w-[140px] shrink-0 truncate border-r border-border">
            {key}
          </span>
          <span className="px-2 py-1 font-mono text-foreground truncate" title={value}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ResponsePreviewBlockProps {
  hasResponse: boolean;
  formattedResponse: string;
}

/** Response body preview block. */
function ResponsePreviewBlock({ hasResponse, formattedResponse }: ResponsePreviewBlockProps) {
  return (
    <div>
      <SectionLabel text="Response Preview" />
      {hasResponse ? (
        <pre className="text-xs font-mono bg-muted/50 rounded-md px-3 py-2 overflow-auto max-h-[200px] whitespace-pre-wrap text-foreground">
          {formattedResponse}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground italic">No response body captured</p>
      )}
    </div>
  );
}

/** Tiny uppercase section label. */
function SectionLabel({ text }: { text: string }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
      {text}
    </h4>
  );
}

/** Detail label + value pair. */
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <p className="font-mono text-foreground">{value}</p>
    </div>
  );
}

/* ---- Helpers ---- */

/** Check if a headers record has at least one entry. */
function hasNonEmptyHeaders(headers?: Record<string, string>): boolean {
  const isMissing = headers === undefined || headers === null;
  if (isMissing) return false;

  const keyCount = Object.keys(headers).length;
  const hasKeys = keyCount > 0;

  return hasKeys;
}

/** Format a response preview, attempting JSON pretty-print. */
function formatResponsePreview(preview?: string): string {
  const raw = preview ?? "";
  const isEmpty = raw.length === 0;
  if (isEmpty) return "";

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch (jsonFormatError: unknown) {
    return raw;
  }
}
