import React, { Component } from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label shown in the error panel (e.g. "Scripts", "Settings") */
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Catches render-time errors in any child tree and shows a developer-friendly
 * error panel with a copyable stack trace instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ""}]`, error, errorInfo);
  }

  private handleCopy = (): void => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message ?? "Unknown error"}`,
      "",
      "Stack trace:",
      error?.stack ?? "(no stack)",
      "",
      "Component stack:",
      errorInfo?.componentStack ?? "(no component stack)",
    ].join("\n");

    navigator.clipboard.writeText(text).then(
      () => {
        // Brief visual feedback handled by the button's own state if needed
      },
      () => {
        // Clipboard write failed — user can still manually select
      },
    );
  };

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo } = this.state;
    const sectionLabel = this.props.section ? ` in "${this.props.section}"` : "";

    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3 my-4">
        {/* Header */}
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-destructive">
              Something went wrong{sectionLabel}
            </h3>
            <p className="text-xs text-destructive/80 mt-0.5">
              {error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
        </div>

        {/* Stack trace — collapsible */}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors font-medium">
            Show stack trace
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted/50 border border-border text-[11px] leading-relaxed overflow-auto max-h-[300px] whitespace-pre-wrap break-words font-mono text-muted-foreground select-all">
            {error?.stack ?? "(no stack trace)"}
            {errorInfo?.componentStack && (
              <>
                {"\n\nComponent stack:"}
                {errorInfo.componentStack}
              </>
            )}
          </pre>
        </details>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={this.handleCopy}
          >
            <Copy className="h-3 w-3" />
            Copy Error
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={this.handleRetry}
          >
            <RefreshCw className="h-3 w-3" />
            Try Again
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Copy the error above and paste it to get help fixing this issue.
        </p>
      </div>
    );
  }
}
