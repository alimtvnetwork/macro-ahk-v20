/**
 * Marco Extension — Error Modal
 *
 * Displays structured diagnostic information from an ErrorModel.
 * Supports copy-to-clipboard, collapsible stack trace, and formatted output.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, Copy, Check, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import type { ErrorModel } from "@/types/error-model";
import { formatErrorForClipboard } from "@/types/error-model";
import { toast } from "sonner";

interface ErrorModalProps {
  error: ErrorModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// eslint-disable-next-line max-lines-per-function -- diagnostic modal with collapsible sections and copy actions
export function ErrorModal({ error, open, onOpenChange }: ErrorModalProps) {
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(false);
  const [showContext, setShowContext] = useState(false);

  if (!error) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorForClipboard(error));
      setCopied(true);
      toast.success("Error details copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px] max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <DialogTitle className="text-sm">{error.title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Diagnostic details for debugging. Use "Copy Details" to share.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-3">
            {/* Error message — always visible, never collapsed */}
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-xs font-medium text-destructive">{error.message}</p>
            </div>

            {/* Key fields grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Field label="Error Code" value={error.errorCode} />
              <Field label="Operation" value={error.operation} />
              <Field label="Source" value={error.source} />
              <Field label="Project" value={error.projectName} />
              <Field label="Namespace" value={error.namespace} />
              <Field label="Timestamp" value={formatTimestamp(error.createdAt)} />
            </div>

            {/* Inner error */}
            {error.innerError && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Inner Error
                </span>
                <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap break-all font-mono">
                  {error.innerError}
                </pre>
              </div>
            )}

            {/* Suggested action */}
            {error.suggestedAction && (
              <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5">
                <ExternalLink className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-primary">{error.suggestedAction}</p>
              </div>
            )}

            {/* Context JSON — collapsible */}
            {error.contextJson && (
              <Collapsible open={showContext} onOpenChange={setShowContext}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5">
                    {showContext ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Context Payload
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap break-all font-mono mt-1 max-h-32 overflow-auto">
                    {tryFormatJson(error.contextJson)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Stack trace — collapsible */}
            {(error.resolvedStackTrace || error.stackTrace) && (
              <Collapsible open={showStack} onOpenChange={setShowStack}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5">
                    {showStack ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Stack Trace
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap break-all font-mono mt-1 max-h-40 overflow-auto">
                    {error.resolvedStackTrace ?? error.stackTrace}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopy()}
            className="h-7 text-xs gap-1.5"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied!" : "Copy Details"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-7 text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Helpers ---- */

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      {value ? (
        <Badge variant="secondary" className="text-[10px] font-mono block w-fit">
          {value}
        </Badge>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic">N/A</span>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
  } catch {
    return iso;
  }
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
